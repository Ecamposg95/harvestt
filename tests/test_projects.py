import pytest
from sqlalchemy import select

from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Cultivar, Species

BASE = "/api/v1/projects"


@pytest.fixture
def species(db):
    catalog_seed.seed(db)
    db.commit()
    return {s.scientific_name: s for s in db.scalars(select(Species))}


def _create(client, headers, **overrides):
    payload = {"name": "Invernadero norte", "objectives": "Lechuga continua", "area_m2": 120.5, "system": "hydroponic"}
    payload.update(overrides)
    res = client.post(BASE, json=payload, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def test_create_list_get(client, tenants):
    p = _create(client, tenants["alfa_editor"])
    assert p["version"] == 1 and p["crop_cycles"] == []
    res = client.get(BASE, headers=tenants["alfa_viewer"])
    assert res.status_code == 200
    assert res.json()["total"] == 1 and res.json()["items"][0]["id"] == p["id"]
    got = client.get(f"{BASE}/{p['id']}", headers=tenants["alfa_viewer"]).json()
    assert got["name"] == "Invernadero norte" and got["area_m2"] == 120.5


def test_area_must_be_positive(client, tenants):
    h = tenants["alfa_editor"]
    for bad in (0, -5):
        res = client.post(BASE, json={"name": "X", "area_m2": bad}, headers=h)
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "invalid_input"
    p = _create(client, h, area_m2=None)
    res = client.patch(f"{BASE}/{p['id']}", json={"version": 1, "area_m2": 0}, headers=h)
    assert res.status_code == 422


def test_name_required_and_system_validated(client, tenants):
    h = tenants["alfa_editor"]
    assert client.post(BASE, json={"name": "   "}, headers=h).status_code == 422
    assert client.post(BASE, json={"name": "X", "system": "marte"}, headers=h).status_code == 422


def test_viewer_cannot_write(client, tenants, species):
    p = _create(client, tenants["alfa_editor"])
    v = tenants["alfa_viewer"]
    assert client.post(BASE, json={"name": "X"}, headers=v).status_code == 403
    assert client.patch(f"{BASE}/{p['id']}", json={"version": 1, "name": "Y"}, headers=v).status_code == 403
    sid = species["Lactuca sativa L."].id
    assert client.post(f"{BASE}/{p['id']}/crop-cycles", json={"species_id": sid}, headers=v).status_code == 403
    assert client.post(f"{BASE}/{p['id']}/observations", json={"content": "x"}, headers=v).status_code == 403


def test_tenant_isolation(client, tenants, species):
    p = _create(client, tenants["alfa_editor"])
    client.post(f"{BASE}/{p['id']}/observations", json={"content": "secreto"}, headers=tenants["alfa_editor"])
    b = tenants["beta_admin"]
    assert client.get(f"{BASE}/{p['id']}", headers=b).status_code == 404
    assert client.patch(f"{BASE}/{p['id']}", json={"version": 1, "name": "hack"}, headers=b).status_code == 404
    assert client.get(f"{BASE}/{p['id']}/observations", headers=b).status_code == 404
    assert client.post(f"{BASE}/{p['id']}/observations", json={"content": "x"}, headers=b).status_code == 404
    sid = species["Lactuca sativa L."].id
    assert client.post(f"{BASE}/{p['id']}/crop-cycles", json={"species_id": sid}, headers=b).status_code == 404
    assert client.get(BASE, headers=b).json()["total"] == 0
    # Sin cambios en el proyecto original
    assert client.get(f"{BASE}/{p['id']}", headers=tenants["alfa_viewer"]).json()["name"] == "Invernadero norte"


def test_patch_version_conflict(client, tenants, db):
    h = tenants["alfa_editor"]
    p = _create(client, h)
    res = client.patch(f"{BASE}/{p['id']}", json={"version": 1, "objectives": "Nuevos objetivos"}, headers=h)
    assert res.status_code == 200
    assert res.json()["version"] == 2 and res.json()["objectives"] == "Nuevos objetivos"
    assert res.json()["name"] == "Invernadero norte"  # campos omitidos no cambian

    stale = client.patch(f"{BASE}/{p['id']}", json={"version": 1, "name": "Otro"}, headers=h)
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "version_conflict"

    ops = [
        (e.resource_type, e.operation)
        for e in db.scalars(select(AuditEvent).where(AuditEvent.resource_id == p["id"]).order_by(AuditEvent.created_at))
    ]
    assert ops == [("project", "create"), ("project", "update")]


def test_crop_cycle(client, tenants, species, db):
    h = tenants["alfa_editor"]
    p = _create(client, h)
    lettuce = species["Lactuca sativa L."]
    tomato = species["Solanum lycopersicum L."]
    cultivar = Cultivar(species_id=tomato.id, name="Cultivar T")
    db.add(cultivar)
    db.commit()

    res = client.post(f"{BASE}/{p['id']}/crop-cycles", json={"species_id": lettuce.id, "started_on": "2026-10-01"}, headers=h)
    assert res.status_code == 201, res.text
    assert res.json()["species_name"] == "Lactuca sativa L."

    bad = client.post(f"{BASE}/{p['id']}/crop-cycles", json={"species_id": lettuce.id, "cultivar_id": cultivar.id}, headers=h)
    assert bad.status_code == 422
    missing = client.post(f"{BASE}/{p['id']}/crop-cycles", json={"species_id": "nope"}, headers=h)
    assert missing.status_code == 422

    ok = client.post(f"{BASE}/{p['id']}/crop-cycles", json={"species_id": tomato.id, "cultivar_id": cultivar.id}, headers=h)
    assert ok.status_code == 201 and ok.json()["cultivar_name"] == "Cultivar T"

    detail = client.get(f"{BASE}/{p['id']}", headers=tenants["alfa_viewer"]).json()
    assert [c["species_name"] for c in detail["crop_cycles"]] == ["Lactuca sativa L.", "Solanum lycopersicum L."]
    assert db.scalar(select(AuditEvent).where(AuditEvent.resource_type == "crop_cycle")) is not None


def test_observations_persist_newest_first(client, tenants, db):
    h = tenants["alfa_editor"]
    p = _create(client, h)
    first = client.post(
        f"{BASE}/{p['id']}/observations",
        json={"content": "Primera", "observed_at": "2026-10-01T10:00:00Z"},
        headers=h,
    )
    assert first.status_code == 201
    assert first.json()["author_name"] == "editor"
    second = client.post(f"{BASE}/{p['id']}/observations", json={"content": "Segunda", "kind": "incident"}, headers=h)
    assert second.status_code == 201 and second.json()["observed_at"]

    res = client.get(f"{BASE}/{p['id']}/observations", headers=tenants["alfa_viewer"])
    body = res.json()
    assert body["total"] == 2
    assert [o["content"] for o in body["items"]] == ["Segunda", "Primera"]
    assert body["items"][0]["kind"] == "incident"

    assert client.post(f"{BASE}/{p['id']}/observations", json={"content": "  "}, headers=h).status_code == 422
    foreign_cycle = client.post(
        f"{BASE}/{p['id']}/observations", json={"content": "x", "crop_cycle_id": "nope"}, headers=h
    )
    assert foreign_cycle.status_code == 422
    assert db.scalar(select(AuditEvent).where(AuditEvent.resource_type == "observation")) is not None
