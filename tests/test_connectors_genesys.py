import json
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Species
from app.modules.connectors import genesys as gen
from app.modules.connectors import registry
from app.modules.connectors import sync as csync
from app.modules.connectors.genesys import GenesysConnector, list_accessions_live
from app.modules.connectors.http import FetchError
from app.modules.connectors.models import ConnectorSnapshot
from app.modules.connectors.sampstat import SAMPSTAT_LABELS, sampstat_label

FIX = Path(__file__).parent / "fixtures" / "connectors" / "genesys"
TODAY = date(2026, 11, 10)
BASE = "/api/v1/projects"


def load(name):
    return json.loads((FIX / name).read_text())


class GenesysFetcher:
    def __init__(self, pages=("acn_filter_page_0.json", "acn_filter_page_1.json")):
        self.calls = []
        self.pages = pages

    def __call__(self, url, body=None):
        q = parse_qs(urlparse(url).query)
        self.calls.append((url, body))
        assert url.startswith("https://api.genesys-pgr.org/api/v2/acn/filter?")
        assert q["l"] == ["1000"]
        return load(self.pages[int(q["p"][0])])


def lettuce():
    return Species(scientific_name="Lactuca sativa L.", authorship="L.")


def test_genesys_aggregates_without_storing_accessions(db):
    f = GenesysFetcher()
    res = GenesysConnector().fetch(lettuce(), f, TODAY)
    assert res.status == "ok"
    assert res.payload["total"] == 5 and res.payload["sampled"] == 5
    assert res.payload["by_country"] == [
        {"country": "MEX", "count": 3}, {"country": "USA", "count": 1}, {"country": None, "count": 1},
    ]
    codes = {c["code"]: c["count"] for c in res.payload["by_sampstat"]}
    assert codes == {300: 2, 500: 1, None: 1, 999: 1}
    # nunca se guardan accesiones individuales
    assert "CGN04567" not in json.dumps(res.payload) and "10.18730" not in json.dumps(res.payload)
    assert res.license == "Términos de uso de Genesys"
    assert res.attribution == "Datos consultados en Genesys (https://www.genesys-pgr.org), 2026-11-10."
    assert res.source_url == "https://www.genesys-pgr.org/a/overview"
    # una sola función arma el cuerpo
    assert f.calls[0][1] == gen.filter_body("Lactuca", "sativa")
    assert gen.filter_body("Lactuca", "sativa") == {"taxonomy.genus": ["Lactuca"], "taxonomy.species": ["sativa"]}


def test_genesys_truncates_at_cap(monkeypatch):
    monkeypatch.setattr(gen, "MAX_RECORDS", 3)
    res = GenesysConnector().fetch(lettuce(), GenesysFetcher(), TODAY)
    assert res.payload["total"] == 5 and res.payload["sampled"] == 3 < res.payload["total"]


def test_genesys_wrong_filter_raises(db, monkeypatch):
    monkeypatch.setattr(registry, "settings", Settings(genesys_api_token="x"))
    monkeypatch.setitem(csync.CONNECTORS, "genesys", GenesysConnector())
    with pytest.raises(FetchError, match="filtro taxonómico"):
        GenesysConnector().fetch(lettuce(), GenesysFetcher(("acn_filter_wrong_genus.json",)), TODAY)
    sp = Species(scientific_name="Lactuca sativa")
    db.add(sp)
    db.commit()
    sync = csync.run_sync(db, "genesys", None, datetime(2026, 11, 10, tzinfo=timezone.utc),
                          lambda k: GenesysFetcher(("acn_filter_wrong_genus.json",)))
    assert sync.status == "error"
    snap = db.scalars(select(ConnectorSnapshot)).one()
    assert snap.payload == {} and snap.status == "error" and "filtro taxonómico" in snap.last_error


def test_genesys_requires_token(db, monkeypatch):
    monkeypatch.setattr(registry, "settings", Settings(genesys_api_token=""))
    monkeypatch.setitem(csync.CONNECTORS, "genesys", GenesysConnector())
    with pytest.raises(csync.SyncRefused) as exc:
        csync.run_sync(db, "genesys", None, datetime(2026, 11, 10, tzinfo=timezone.utc), lambda k: None)
    assert exc.value.status_code == 409
    assert "genesys" in csync.CONNECTORS


def test_list_accessions_live_builds_links_and_limit():
    f = GenesysFetcher()
    items = list_accessions_live(lettuce(), f, limit=4)
    assert len(items) == 4
    assert items[0].institute_code == "MEX001" and items[0].accession_number == "LS-1"
    assert items[0].url == "https://doi.org/10.18730/AAA1" and items[0].origin_country == "MEX"
    assert items[0].sampstat == 300
    assert items[1].doi is None and items[1].url == "https://www.genesys-pgr.org/a/overview"
    assert len(f.calls) == 2


def test_list_accessions_live_wrong_filter_raises():
    with pytest.raises(FetchError):
        list_accessions_live(lettuce(), GenesysFetcher(("acn_filter_wrong_genus.json",)))


def test_sampstat_unknown_code_label():
    assert SAMPSTAT_LABELS[300] == "Variedad tradicional o criolla"
    assert sampstat_label(100) == "Silvestre"
    assert sampstat_label(777) == "Código MCPD 777"
    assert sampstat_label(None) is None


# --- Vínculo de accesión a ciclo ---

@pytest.fixture
def species(db):
    catalog_seed.seed(db)
    db.commit()
    return {s.scientific_name: s for s in db.scalars(select(Species))}


def _cycle(client, headers, sid):
    p = client.post(BASE, json={"name": "Invernadero"}, headers=headers).json()
    c = client.post(f"{BASE}/{p['id']}/crop-cycles", json={"species_id": sid}, headers=headers)
    assert c.status_code == 201
    return p["id"], c.json()["id"]


LINK = {"source": "genesys", "institute_code": "NLD037", "accession_number": "CGN04567", "doi": "10.18730/BBB2"}


def test_link_accession_rules(client, tenants, species, db):
    sid = species["Lactuca sativa L."].id
    other = species["Solanum lycopersicum L."].id
    e = tenants["alfa_editor"]
    pid, cid = _cycle(client, e, sid)
    url = f"{BASE}/{pid}/crop-cycles/{cid}/accession"

    assert client.put(f"{url}?species_id={sid}", json=LINK, headers=tenants["alfa_viewer"]).status_code == 403
    assert client.delete(url, headers=tenants["alfa_viewer"]).status_code == 403
    assert client.put(f"{url}?species_id={sid}", json=LINK, headers=tenants["beta_admin"]).status_code == 404
    assert client.delete(url, headers=tenants["beta_admin"]).status_code == 404

    res = client.put(f"{url}?species_id={other}", json=LINK, headers=e)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "species_mismatch"

    for bad in ({"institute_code": "nld037"}, {"institute_code": "NL1"}, {"accession_number": ""},
                {"accession_number": "x" * 65}, {"doi": "not-a-doi"}, {"source": "grin"}):
        assert client.put(f"{url}?species_id={sid}", json={**LINK, **bad}, headers=e).status_code == 422

    res = client.put(f"{url}?species_id={sid}", json=LINK, headers=e)
    assert res.status_code == 200, res.text
    ref = res.json()["accession_ref"]
    assert ref["source"] == "genesys" and ref["institute_code"] == "NLD037"
    assert ref["accession_number"] == "CGN04567" and ref["doi"] == "10.18730/BBB2"
    assert ref["url"] == "https://doi.org/10.18730/BBB2" and ref["linked_at"]
    got = client.get(f"{BASE}/{pid}", headers=e).json()
    assert got["crop_cycles"][0]["accession_ref"]["accession_number"] == "CGN04567"

    # sin DOI: enlace general a Genesys
    nodoi = {k: v for k, v in LINK.items() if k != "doi"}
    res = client.put(f"{url}?species_id={sid}", json=nodoi, headers=e)
    assert res.json()["accession_ref"]["doi"] is None
    assert res.json()["accession_ref"]["url"] == "https://www.genesys-pgr.org/a/overview"

    assert client.delete(url, headers=e).status_code == 204
    assert client.get(f"{BASE}/{pid}", headers=e).json()["crop_cycles"][0]["accession_ref"] is None
    ops = [a.operation for a in db.scalars(select(AuditEvent).where(AuditEvent.resource_id == cid))]
    assert "crop_cycle.accession_linked" in ops and "crop_cycle.accession_unlinked" in ops


def test_list_cycles_by_species_is_tenant_scoped(client, tenants, species):
    sid = species["Lactuca sativa L."].id
    other = species["Solanum lycopersicum L."].id
    e = tenants["alfa_editor"]
    pid, cid = _cycle(client, e, sid)
    _, cancelled = _cycle(client, e, sid)
    client.post(f"{BASE}/{pid}/crop-cycles", json={"species_id": other}, headers=e)
    from app.core.db import SessionLocal
    from app.modules.projects.models import CropCycle

    with SessionLocal() as s:
        s.get(CropCycle, cancelled).status = "cancelled"
        s.commit()
    res = client.get(f"{BASE}/crop-cycles?species_id={sid}", headers=tenants["alfa_viewer"])
    assert res.status_code == 200, res.text
    items = res.json()
    assert [i["id"] for i in items] == [cid]
    assert items[0]["project_name"] == "Invernadero" and items[0]["project_id"] == pid
    assert client.get(f"{BASE}/crop-cycles?species_id={sid}", headers=tenants["beta_admin"]).json() == []
    assert client.get(f"{BASE}/crop-cycles", headers=e).status_code == 422
