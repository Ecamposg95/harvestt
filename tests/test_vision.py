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
