import pytest
from sqlalchemy import select

from app.modules.audit.models import AuditEvent
from app.modules.ontology import seed as ontology_seed
from app.modules.ontology.models import OntologyTerm

BASE = "/api/v1/projects"


@pytest.fixture
def terms(db):
    ontology_seed.seed(db)
    db.commit()
    by_key = {t.seed_key: t for t in db.scalars(select(OntologyTerm)) if t.seed_key}
    return by_key


def _post(client, headers, **extra):
    return client.post(BASE, json={"name": "Parcela", **extra}, headers=headers)


def test_project_coordinates_validation(client, tenants):
    h = tenants["alfa_editor"]
    res = _post(client, h, lat=20.52)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "coordinates_incomplete"
    assert _post(client, h, lon=-101.25).json()["error"]["code"] == "coordinates_incomplete"
    assert _post(client, h, lat=91, lon=-101.25).status_code == 422
    assert _post(client, h, lat=20.5, lon=-181).status_code == 422
    assert client.get(BASE, headers=h).json()["total"] == 0
    res = _post(client, h, lat=20.52, lon=-101.25)
    assert res.status_code == 201
    p = res.json()
    assert p["lat"] == 20.52 and p["lon"] == -101.25
    res = client.patch(f"{BASE}/{p['id']}", json={"version": 1, "lat": None, "lon": None}, headers=h)
    assert res.status_code == 200
    assert res.json()["lat"] is None and res.json()["lon"] is None
    # PATCH con una sola coordenada, sin la otra guardada: incompleto
    res = client.patch(f"{BASE}/{p['id']}", json={"version": 2, "lat": 20.0}, headers=h)
    assert res.status_code == 422 and res.json()["error"]["code"] == "coordinates_incomplete"


def test_place_term_must_be_published_place(client, tenants, db, terms):
    h = tenants["alfa_editor"]
    trait = terms["ph"]
    res = _post(client, h, place_term_id=trait.id)
    assert res.status_code == 422 and res.json()["error"]["code"] == "invalid_place_term"
    proposed = OntologyTerm(domain="place", label="Sitio X", label_key="sitio x", definition="d", status="proposed")
    db.add(proposed)
    db.commit()
    assert _post(client, h, place_term_id=proposed.id).status_code == 422
    assert _post(client, h, place_term_id="no-existe").status_code == 422
    assert client.get(BASE, headers=h).json()["total"] == 0
    res = _post(client, h, place_term_id=terms["region"].id)
    assert res.status_code == 201
    assert res.json()["place_label"] == "Región"


def test_publish_requires_admin(client, tenants, clock):
    editor, admin = tenants["alfa_editor"], tenants["alfa_admin"]
    p = _post(client, editor).json()
    assert p["visibility"] == "private" and p["published_at"] is None
    res = client.patch(f"{BASE}/{p['id']}", json={"version": 1, "visibility": "public"}, headers=editor)
    assert res.status_code == 403 and res.json()["error"]["code"] == "publish_forbidden"
    res = _post(client, editor, visibility="public")
    assert res.status_code == 403 and res.json()["error"]["code"] == "publish_forbidden"
    res = client.patch(f"{BASE}/{p['id']}", json={"version": 1, "visibility": "public"}, headers=admin)
    assert res.status_code == 200
    assert res.json()["visibility"] == "public"
    assert res.json()["published_at"].startswith("2026-10-20T12:00:00")
    res = client.patch(f"{BASE}/{p['id']}", json={"version": 2, "visibility": "private"}, headers=admin)
    assert res.status_code == 200
    assert res.json()["visibility"] == "private" and res.json()["published_at"] is None


def test_publish_is_audited(client, tenants, db, clock):
    admin = tenants["alfa_admin"]
    p = _post(client, admin).json()
    client.patch(f"{BASE}/{p['id']}", json={"version": 1, "visibility": "public"}, headers=admin)
    ev = db.scalars(select(AuditEvent).where(AuditEvent.resource_id == p["id"], AuditEvent.operation == "update")).all()
    assert any("visibility" in e.data.get("changes", {}) for e in ev)


def test_location_text_kept(client, tenants):
    h = tenants["alfa_editor"]
    p = _post(client, h, location="Celaya, Gto.").json()
    res = client.patch(f"{BASE}/{p['id']}", json={"version": 1, "lat": 20.52, "lon": -101.25}, headers=h)
    assert res.status_code == 200
    assert res.json()["location"] == "Celaya, Gto." and res.json()["lat"] == 20.52
