from datetime import timedelta

import pytest

from app.core.config import Settings
from app.core.mixins import utcnow
from app.main import app
from app.modules.catalog.models import Species
from app.modules.connectors import registry
from app.modules.connectors.http import FetchError
from app.modules.connectors.models import ConnectorSnapshot
from app.modules.connectors.router import get_fetcher_factory
from tests.conftest import login_headers, make_member

KEYS = ["gbif", "wfo", "wikidata", "genesys", "grin", "cimmyt", "inifap"]


def _species(db, gbif="2701"):
    sp = Species(scientific_name="Lactuca sativa", external_ids={"gbif": {"id": gbif}} if gbif else None)
    db.add(sp)
    db.commit()
    return sp


def _snap(db, sp, source, **kw):
    kw.setdefault("status", "ok")
    kw.setdefault("payload", {})
    kw.setdefault("last_attempt_at", utcnow())
    db.add(ConnectorSnapshot(source=source, species_id=sp.id, **kw))
    db.commit()


def test_banks_without_copies(db, tenants, client):
    sp = _species(db)
    res = client.get(f"/api/v1/plants/{sp.id}/banks", headers=tenants["alfa_viewer"])
    assert res.status_code == 200
    body = res.json()
    assert [s["key"] for s in body["sources"]] == KEYS
    assert all(s["copy"] is None for s in body["sources"])
    assert {s["key"]: s["status"] for s in body["sources"]}["grin"] == "in_construction"
    assert [i["key"] for i in body["identity"]] == ["gbif", "wfo", "ncbi", "wikidata"]
    assert body["identity"][0]["url"] == "https://www.gbif.org/species/2701"
    assert client.get("/api/v1/plants/nope/banks", headers=tenants["alfa_viewer"]).status_code == 404


def test_banks_stale_copy(db, tenants, client):
    sp = _species(db)
    now = utcnow()
    _snap(db, sp, "gbif", fetched_at=now - timedelta(days=1), last_attempt_at=now, last_error="boom",
          payload={"total": 3})
    _snap(db, sp, "wfo", status="not_found", fetched_at=now, reason="Sin coincidencia exacta en World Flora Online")
    _snap(db, sp, "wikidata", status="error", last_error="down")
    copies = {s["key"]: s["copy"] for s in client.get(
        f"/api/v1/plants/{sp.id}/banks", headers=tenants["alfa_viewer"]).json()["sources"]}
    assert copies["gbif"]["stale"] is True and copies["gbif"]["payload"] == {"total": 3}
    assert copies["wfo"]["stale"] is False
    assert copies["wfo"]["reason"] == "Sin coincidencia exacta en World Flora Online"
    assert copies["wikidata"]["status"] == "error" and copies["wikidata"]["stale"] is False


def test_identity_checks_flag_mismatch(db, tenants, client):
    sp = _species(db)
    now = utcnow()
    _snap(db, sp, "wfo", external_id="wfo-1", fetched_at=now)
    _snap(db, sp, "wikidata", external_id="Q83193", fetched_at=now,
          payload={"ids": {"gbif": "9999", "wfo": "wfo-1", "ncbi": "4236"}})
    ident = {i["key"]: i for i in client.get(
        f"/api/v1/plants/{sp.id}/banks", headers=tenants["alfa_viewer"]).json()["identity"]}
    assert ident["gbif"]["check"] == "mismatch"
    assert ident["wfo"]["check"] == "match"
    assert ident["ncbi"]["check"] == "unknown" and ident["ncbi"]["detail"] == "Según Wikidata"
    assert ident["ncbi"]["url"].endswith("id=4236")
    assert ident["wikidata"]["url"] == "https://www.wikidata.org/wiki/Q83193"


def test_connectors_panel_superadmin_only(db, tenants, client):
    assert client.get("/api/v1/connectors", headers=tenants["alfa_admin"]).status_code == 403
    make_member(db, "root", "root@root.test", "admin", superadmin=True)
    res = client.get("/api/v1/connectors", headers=login_headers(client, "root@root.test"))
    assert res.status_code == 200
    rows = {r["key"]: r for r in res.json()}
    assert list(rows) == KEYS
    assert rows["gbif"]["can_sync"] is True and rows["gbif"]["last_sync"] is None
    assert rows["grin"]["can_sync"] is False
    assert rows["gbif"]["copies"] == {"ok": 0, "not_found": 0, "stale": 0}


@pytest.fixture
def fake_factory():
    app.dependency_overrides[get_fetcher_factory] = lambda: (lambda key: (lambda url, body=None: {}))
    yield
    app.dependency_overrides.pop(get_fetcher_factory, None)


def test_sync_endpoint_runs_and_respects_cooldown(db, client, clock, fake_factory):
    _species(db, gbif=None)
    make_member(db, "root", "root@root.test", "admin", superadmin=True)
    h = login_headers(client, "root@root.test")
    res = client.post("/api/v1/connectors/gbif/sync", headers=h)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ok" and res.json()["species_ok"] == 1
    again = client.post("/api/v1/connectors/gbif/sync", headers=h)
    assert again.status_code == 429 and again.json()["error"]["code"] == "sync_cooldown"
    assert client.post("/api/v1/connectors/nope/sync", headers=h).status_code == 404
    assert client.post("/api/v1/connectors/grin/sync", headers=h).status_code == 409
    panel = client.get("/api/v1/connectors", headers=h).json()
    gbif = next(r for r in panel if r["key"] == "gbif")
    assert gbif["last_sync"]["status"] == "ok" and gbif["copies"]["not_found"] == 1


def test_sync_requires_superadmin(tenants, client):
    assert client.post("/api/v1/connectors/gbif/sync", headers=tenants["alfa_admin"]).status_code == 403


def test_genesys_accessions_endpoint(db, tenants, client, monkeypatch):
    from app.modules.connectors import router as router_mod

    sp = _species(db)
    url = f"/api/v1/connectors/genesys/accessions?species_id={sp.id}"
    monkeypatch.setattr(registry, "settings", Settings(genesys_api_token=""))
    assert client.get(url, headers=tenants["alfa_viewer"]).json()["error"]["code"] == "source_unavailable"
    monkeypatch.setattr(registry, "settings", Settings(genesys_api_token="x"))
    assert client.get(
        "/api/v1/connectors/genesys/accessions?species_id=nope", headers=tenants["alfa_viewer"]
    ).status_code == 404

    def boom(*a, **k):
        raise FetchError("down")

    monkeypatch.setattr(router_mod, "list_accessions_live", boom)
    assert client.get(url, headers=tenants["alfa_viewer"]).status_code == 503
    monkeypatch.setattr(router_mod, "list_accessions_live", lambda species, fetch, limit=50: [])
    assert client.get(url, headers=tenants["alfa_viewer"]).json() == []


def test_sync_cli_exit_code(monkeypatch, capsys):
    from scripts.connectors import sync as cli

    class Fake:
        def __init__(self, status):
            self.status, self.species_ok, self.species_total, self.error = status, 1, 1, None

    calls = []

    def fake_run(db, key, actor, now, fetcher_factory=None):
        calls.append((key, actor))
        return Fake("error" if key == "wfo" else "ok")

    monkeypatch.setattr(cli, "run_sync", fake_run)
    assert cli.main(["--source", "gbif"]) == 0
    assert cli.main(["--source", "all"]) == 1
    assert [c[0] for c in calls] == ["gbif", "gbif", "wfo", "wikidata", "genesys"]
    assert all(c[1] is None for c in calls)
    out = capsys.readouterr().out
    assert "wfo: error" in out and "gbif: ok" in out
