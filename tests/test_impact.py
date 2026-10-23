import json
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.config import Settings

from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Source, Species, TraitAssertion
from app.modules.impact import router as impact_router
from app.modules.projects.models import Observation
from app.modules.telemetry.models import Incident
from tests.test_alerts import add_rule, run_to_end
from tests.test_devices import add_device, make_project
from tests.test_simulation import start

API = "/api/v1"

PROJECT_KEYS = [
    "active_cycles",
    "days_since_oldest_active_cycle",
    "observations_30d",
    "evidence_coverage",
    "sources_cited",
    "simulation_runs",
    "incidents_open",
    "incidents_acknowledged",
    "mean_minutes_to_acknowledge",
]


def kpis(client, headers, pid) -> dict[str, dict]:
    res = client.get(f"{API}/projects/{pid}/impact", headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["project_id"] == pid
    return {k["key"]: k for k in body["kpis"]}


def two_species(db) -> tuple[Species, Species]:
    catalog_seed.seed(db)
    db.commit()
    species = db.scalars(select(Species).order_by(Species.scientific_name)).all()
    return species[0], species[1]


def add_cycle(client, headers, pid, species_id, **extra):
    res = client.post(f"{API}/projects/{pid}/crop-cycles", json={"species_id": species_id, **extra}, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def add_assertion(db, species_id, origin="missing", refs=None):
    db.add(
        TraitAssertion(
            subject_type="species", subject_id=species_id, variable="ph", origin=origin, evidence_refs=refs or []
        )
    )
    db.commit()


def test_project_impact_requires_auth_and_tenant(client, tenants):
    p = make_project(client, tenants["alfa_editor"])
    assert client.get(f"{API}/projects/{p['id']}/impact").status_code == 401
    assert client.get(f"{API}/projects/{p['id']}/impact", headers=tenants["beta_viewer"]).status_code == 404


def test_empty_project_counts_zero_and_derived_null(client, tenants, clock):
    k = kpis(client, tenants["alfa_viewer"], make_project(client, tenants["alfa_editor"])["id"])
    assert list(k) == PROJECT_KEYS
    for key in ("active_cycles", "observations_30d", "sources_cited", "simulation_runs", "incidents_open", "incidents_acknowledged"):
        assert k[key]["value"] == 0
    for key in ("days_since_oldest_active_cycle", "evidence_coverage", "mean_minutes_to_acknowledge"):
        assert k[key]["value"] is None
    assert {v["origin"] for v in k.values()} <= {"measured", "derived", "simulated"}
    assert all(v["formula"] and v["as_of"] and v["label"] for v in k.values())
    assert k["evidence_coverage"]["unit"] == "%"
    assert k["mean_minutes_to_acknowledge"]["unit"] == "min"


def test_cycles_days_and_coverage(client, tenants, db, clock):
    lettuce, other = two_species(db)
    h = tenants["alfa_editor"]
    pid = make_project(client, h)["id"]
    add_cycle(client, h, pid, lettuce.id, status="active", started_on="2026-10-10")
    add_cycle(client, h, pid, lettuce.id, status="active")
    add_cycle(client, h, pid, other.id, status="planned")
    add_assertion(db, lettuce.id, origin="sourced")
    add_assertion(db, other.id, origin="measured")

    total = db.query(TraitAssertion).filter(TraitAssertion.subject_id.in_([lettuce.id, other.id])).count()
    known = (
        db.query(TraitAssertion)
        .filter(TraitAssertion.subject_id.in_([lettuce.id, other.id]), TraitAssertion.origin != "missing")
        .count()
    )
    k = kpis(client, tenants["alfa_viewer"], pid)
    assert k["active_cycles"]["value"] == 2
    assert k["active_cycles"]["inputs_count"] == 3
    assert k["days_since_oldest_active_cycle"]["value"] == 10
    assert k["days_since_oldest_active_cycle"]["inputs_count"] == 1
    assert k["evidence_coverage"]["value"] == round(known / total * 100, 1)
    assert k["evidence_coverage"]["inputs_count"] == total
    assert k["evidence_coverage"]["origin"] == "derived"


def test_active_cycle_without_start_date_gives_null_days(client, tenants, db, clock):
    lettuce, _ = two_species(db)
    h = tenants["alfa_editor"]
    pid = make_project(client, h)["id"]
    add_cycle(client, h, pid, lettuce.id, status="active")
    k = kpis(client, h, pid)
    assert k["active_cycles"]["value"] == 1
    assert k["days_since_oldest_active_cycle"]["value"] is None
    assert k["days_since_oldest_active_cycle"]["inputs_count"] == 0


def test_observations_window_is_30_days(client, tenants, db, clock):
    h = tenants["alfa_editor"]
    pid = make_project(client, h)["id"]
    for days in (1, 29, 31):
        obs = client.post(f"{API}/projects/{pid}/observations", json={"kind": "note", "content": f"d{days}"}, headers=h).json()
        row = db.get(Observation, obs["id"])
        row.observed_at = clock.now - timedelta(days=days)
    db.commit()
    assert kpis(client, h, pid)["observations_30d"]["value"] == 2


def test_sources_cited_counts_distinct_sources_of_project_species(client, tenants, db, clock):
    lettuce, other = two_species(db)
    h = tenants["alfa_editor"]
    pid = make_project(client, h)["id"]
    add_cycle(client, h, pid, lettuce.id)
    add_assertion(db, lettuce.id, "sourced", [{"source_id": "s1"}])
    add_assertion(db, lettuce.id, "sourced", [{"source_id": "s1", "locator": "p. 2"}, {"source_id": "s2"}])
    add_assertion(db, other.id, "sourced", [{"source_id": "s3"}])
    assert kpis(client, h, pid)["sources_cited"]["value"] == 2


def test_simulation_and_incident_kpis(client, tenants, db, clock):
    h = tenants["alfa_editor"]
    pid = make_project(client, h)["id"]
    add_device(client, h, pid, name="Sensor norte")
    add_rule(client, h, pid)
    rid = start(client, h, pid, scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, h, pid, rid, 288)

    incident = db.scalars(select(Incident).where(Incident.project_id == pid)).one()
    created = clock.now - timedelta(hours=1)
    incident.created_at = created
    incident.acknowledged_at = created + timedelta(minutes=6)
    # opened_at está en tiempo simulado (horas después); el KPI no debe usarlo.
    incident.opened_at = created + timedelta(hours=20)
    db.commit()

    k = kpis(client, h, pid)
    assert k["simulation_runs"]["value"] == 1
    assert k["simulation_runs"]["origin"] == "simulated"
    assert k["incidents_open"]["value"] == 0  # el incidente ya se cerró
    assert k["incidents_acknowledged"]["value"] == 1
    assert k["mean_minutes_to_acknowledge"]["value"] == 6.0
    assert k["mean_minutes_to_acknowledge"]["inputs_count"] == 1


def test_other_project_data_not_counted(client, tenants, db, clock):
    lettuce, _ = two_species(db)
    h = tenants["alfa_editor"]
    pid = make_project(client, h)["id"]
    other = make_project(client, h, name="Otro")["id"]
    add_cycle(client, h, other, lettuce.id, status="active", started_on="2026-10-01")
    client.post(f"{API}/projects/{other}/observations", json={"kind": "note", "content": "x"}, headers=h)
    k = kpis(client, h, pid)
    assert k["active_cycles"]["value"] == 0
    assert k["observations_30d"]["value"] == 0
    assert k["days_since_oldest_active_cycle"]["value"] is None


# ---- Públicos ----

PUBLIC_KEYS = ["published_prototypes", "catalog_species", "licensed_sources", "catalog_evidence_coverage"]
KPI_FIELDS = {"key", "label", "value", "unit", "origin", "formula", "inputs_count", "as_of"}


@pytest.fixture
def public_alfa_impact(monkeypatch):
    monkeypatch.setattr(impact_router, "settings", Settings(public_org_slug="alfa"))


def public(client) -> dict:
    res = client.get(f"{API}/public/impact")
    assert res.status_code == 200, res.text
    return res.json()


def public_kpis_by_key(client) -> dict[str, dict]:
    return {k["key"]: k for k in public(client)["kpis"]}


def make_prototype(client, headers, slug, is_public):
    body = {"name": f"Proto {slug}", "purpose": "Demo", "slug": slug, "is_public": is_public}
    res = client.post(f"{API}/prototypes", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def test_public_impact_without_auth_and_shape(client, public_alfa_impact):
    body = public(client)
    assert set(body) == {"as_of", "kpis"}
    assert [k["key"] for k in body["kpis"]] == PUBLIC_KEYS
    assert all(set(k) == KPI_FIELDS for k in body["kpis"])
    assert {k["origin"] for k in body["kpis"]} == {"measured", "derived"}


def test_public_impact_counts_only_public_live_prototypes_of_public_org(client, tenants, public_alfa_impact):
    a, b = tenants["alfa_editor"], tenants["beta_editor"]
    make_prototype(client, a, "pub", True)
    make_prototype(client, a, "priv", False)
    gone = make_prototype(client, a, "gone", True)
    assert client.delete(f"{API}/prototypes/{gone['id']}", headers=a).status_code == 204
    make_prototype(client, b, "beta-pub", True)
    k = public_kpis_by_key(client)["published_prototypes"]
    assert k["value"] == 1
    assert k["inputs_count"] == 1


def test_public_impact_unknown_public_org_still_answers(client, monkeypatch):
    monkeypatch.setattr(impact_router, "settings", Settings(public_org_slug="no-existe"))
    assert public_kpis_by_key(client)["published_prototypes"]["value"] == 0


def test_public_impact_does_not_leak_tenant_data(client, tenants, db, public_alfa_impact):
    lettuce, _ = two_species(db)

    def snapshot():
        return [{k: v for k, v in kpi.items() if k != "as_of"} for kpi in public(client)["kpis"]]

    before = snapshot()
    h = tenants["alfa_editor"]
    pid = make_project(client, h, name="Secreto alfa")["id"]
    add_cycle(client, h, pid, lettuce.id, status="active", started_on="2026-10-01")
    client.post(f"{API}/projects/{pid}/observations", json={"kind": "note", "content": "Secreto"}, headers=h)
    assert snapshot() == before
    raw = json.dumps(public(client))
    assert "Secreto" not in raw and pid not in raw


def test_public_catalog_coverage_and_licensed_sources(client, db, public_alfa_impact):
    k = public_kpis_by_key(client)
    assert k["catalog_evidence_coverage"]["value"] is None
    assert k["licensed_sources"]["value"] == 0

    lettuce, other = two_species(db)
    add_assertion(db, lettuce.id, origin="sourced")
    seeded = db.scalars(select(Source.license)).all()
    seeded_licensed = sum(1 for lic in seeded if lic and lic.strip())
    db.add_all([Source(title="Con licencia", license="CC-BY-4.0"), Source(title="Sin licencia"), Source(title="Vacía", license="  ")])
    db.commit()
    total = db.query(TraitAssertion).count()
    known = db.query(TraitAssertion).filter(TraitAssertion.origin != "missing").count()
    k = public_kpis_by_key(client)
    assert k["catalog_species"]["value"] == db.query(Species).count()
    assert k["licensed_sources"]["value"] == seeded_licensed + 1
    assert k["licensed_sources"]["inputs_count"] == len(seeded) + 3
    assert k["catalog_evidence_coverage"]["value"] == round(known / total * 100, 1)
    assert k["catalog_evidence_coverage"]["inputs_count"] == total
