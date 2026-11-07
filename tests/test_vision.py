from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.modules.vision import router as vision_router
from tests.conftest import login_headers, make_member

from app.modules.identity.models import Organization
from app.modules.vision.models import InboundRequest, Recognition


def test_models_persist_with_defaults(db, tenants):
    org_id = db.scalar(select(Organization.id).where(Organization.slug == "alfa"))
    db.add(Recognition(organization_id=org_id, award="Medalla de Oro", event="ICAN", venue="Toronto, Canadá",
                       awarded_on=date(2018, 9, 1), evidence="Archivo del equipo"))
    db.add(InboundRequest(kind="node", name="Ana", email="ana@example.org", message="Quiero un nodo"))
    db.commit()
    req = db.scalar(select(InboundRequest))
    assert req.status == "pending" and req.lat is None
    assert db.scalar(select(func.count()).select_from(Recognition)) == 1


REC = {"award": "Medalla de Plata", "event": "ICAN", "venue": "Toronto, Canadá",
       "awarded_on": "2018-09-01", "evidence": "Archivo del equipo"}


@pytest.fixture
def root(db, client, monkeypatch):
    monkeypatch.setattr(vision_router, "settings", Settings(public_org_slug="alfa"))
    org, _ = make_member(db, "alfa", "root@alfa.test", "admin", superadmin=True)
    return login_headers(client, "root@alfa.test", org.id)


def test_recognitions_superadmin_only(client, tenants):
    assert client.get("/api/v1/admin/recognitions").status_code == 401
    res = client.get("/api/v1/admin/recognitions", headers=tenants["alfa_editor"])
    assert res.status_code == 403


def test_create_list_delete_recognition(client, root):
    res = client.post("/api/v1/admin/recognitions", json=REC, headers=root)
    assert res.status_code == 201
    assert res.json()["award"] == "Medalla de Plata"
    rec_id = res.json()["id"]
    assert len(client.get("/api/v1/admin/recognitions", headers=root).json()) == 1
    assert client.delete(f"/api/v1/admin/recognitions/{rec_id}", headers=root).status_code == 204
    assert client.get("/api/v1/admin/recognitions", headers=root).json() == []


def test_recognition_requires_evidence(client, root):
    res = client.post("/api/v1/admin/recognitions", json={**REC, "evidence": ""}, headers=root)
    assert res.status_code == 422


from app.modules.audit.models import AuditEvent  # noqa: E402

REQ = {"kind": "node", "name": "Ana Pérez", "email": "ana@example.org", "message": "Quiero un nodo en mi ciudad"}


def test_public_request_rounds_coordinates(client, db):
    res = client.post("/api/v1/public/requests", json={**REQ, "lat": 19.43251, "lon": -99.13321})
    assert res.status_code == 201
    row = db.scalar(select(InboundRequest))
    assert row.lat == 19.4 and row.lon == -99.1


def test_honeypot_accepts_but_discards(client, db):
    res = client.post("/api/v1/public/requests", json={**REQ, "website": "http://spam"})
    assert res.status_code == 201
    assert res.json() == {"received": True}
    assert db.scalar(select(func.count()).select_from(InboundRequest)) == 0


def test_request_validation(client):
    def post(**over):
        return client.post("/api/v1/public/requests", json={**REQ, **over}).status_code

    assert post(lat=91, lon=0) == 422
    assert post(lat=19.4) == 422
    assert post(lon=-99.1) == 422
    assert post(email="no-es-correo") == 422
    assert post(message="x" * 2001) == 422
    assert post(kind="otro") == 422


def test_review_request_superadmin(client, db, root, tenants):
    client.post("/api/v1/public/requests", json=REQ)
    req_id = db.scalar(select(InboundRequest.id))
    url = f"/api/v1/admin/requests/{req_id}"
    assert client.patch(url, json={"status": "approved"}, headers=tenants["alfa_editor"]).status_code == 403
    res = client.patch(url, json={"status": "approved", "note": "ok"}, headers=root)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "approved" and body["reviewed_at"] is not None
    assert db.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.operation == "review")) == 1
    pending = client.get("/api/v1/admin/requests?status=pending", headers=root).json()
    assert req_id not in [r["id"] for r in pending]
