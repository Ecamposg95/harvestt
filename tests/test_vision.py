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


# --- GET /public/vision ---

from datetime import datetime, timedelta, timezone  # noqa: E402

from app.modules.catalog.models import Species  # noqa: E402
from app.modules.projects.models import Project  # noqa: E402
from app.modules.telemetry.models import Device, TelemetryReading  # noqa: E402

LAYER_KEYS = ["history", "cortex", "knowledge", "trust", "commons"]


def _figures(res):
    return {f["key"]: f for f in res.json()["figures"]}


def _layers(res):
    return {x["key"]: x for x in res.json()["layers"]}


def test_vision_without_public_org(client, monkeypatch):
    monkeypatch.setattr(vision_router, "settings", Settings(public_org_slug="no-existe"))
    res = client.get("/api/v1/public/vision")
    assert res.status_code == 200
    figs = _figures(res)
    assert [f["key"] for f in res.json()["figures"]] == ["prototypes", "operating_nodes", "signed_readings",
                                                         "recognitions"]
    assert figs["prototypes"]["value"] is None and figs["recognitions"]["value"] is None
    assert figs["operating_nodes"]["value"] is None
    assert figs["signed_readings"]["status"] == "soon" and figs["signed_readings"]["value"] is None
    assert [x["key"] for x in res.json()["layers"]] == LAYER_KEYS
    assert res.json()["sites"][0]["kind"] == "historic"


def _device(db, org_id, project_id, kind):
    dev = Device(organization_id=org_id, project_id=project_id, name="d", kind=kind, variables=["temperature"],
                 x=0, y=0, z=0)
    db.add(dev)
    db.flush()
    return dev


def _reading(db, dev, when, source):
    db.add(TelemetryReading(organization_id=dev.organization_id, event_id=f"e-{dev.id}-{when.timestamp()}",
                            device_id=dev.id, project_id=dev.project_id, variable="temperature", value=20.0,
                            unit="C", observed_at=when, received_at=when, source=source, quality="good"))


def test_operating_nodes_ignores_simulated_and_stale(client, db, tenants, clock, monkeypatch):
    monkeypatch.setattr(vision_router, "settings", Settings(public_org_slug="alfa"))
    alfa = db.scalar(select(Organization.id).where(Organization.slug == "alfa"))
    beta = db.scalar(select(Organization.id).where(Organization.slug == "beta"))
    projs = {}
    for name, org in [("a", alfa), ("b", alfa), ("c", alfa), ("d", beta), ("e", alfa), ("f", alfa), ("g", alfa)]:
        p = Project(organization_id=org, name=name)
        db.add(p)
        db.flush()
        projs[name] = p
    now = clock.now
    _reading(db, _device(db, alfa, projs["a"].id, "simulated"), now - timedelta(hours=1), "simulated")
    # dispositivo simulado con lectura real reciente: aísla el filtro por tipo de dispositivo
    _reading(db, _device(db, alfa, projs["a"].id, "simulated"), now - timedelta(hours=2), "device")
    # dispositivo físico borrado con lectura real reciente
    deleted = _device(db, alfa, projs["f"].id, "physical")
    deleted.deleted_at = now
    _reading(db, deleted, now - timedelta(hours=1), "device")
    # lectura real vieja (8 días) y lectura simulada reciente en el mismo proyecto
    stale = _device(db, alfa, projs["g"].id, "physical")
    _reading(db, stale, now - timedelta(days=8), "device")
    _reading(db, stale, now - timedelta(hours=1), "simulated")
    _reading(db, _device(db, alfa, projs["b"].id, "physical"), now - timedelta(hours=1), "simulated")
    _reading(db, _device(db, alfa, projs["c"].id, "physical"), now - timedelta(days=8), "device")
    _reading(db, _device(db, beta, projs["d"].id, "physical"), now - timedelta(hours=1), "device")
    db.commit()
    assert _figures(client.get("/api/v1/public/vision"))["operating_nodes"]["value"] == 0
    _reading(db, _device(db, alfa, projs["e"].id, "physical"), now - timedelta(hours=1), "device")
    db.commit()
    assert _figures(client.get("/api/v1/public/vision"))["operating_nodes"]["value"] == 1


def test_sites_only_approved_node_requests(client, db, monkeypatch):
    monkeypatch.setattr(vision_router, "settings", Settings(public_org_slug="alfa"))
    for kind, status, city in [("node", "approved", "Oaxaca"), ("node", "pending", "A"),
                               ("node", "rejected", "B"), ("contact", "approved", "C")]:
        db.add(InboundRequest(kind=kind, status=status, name="Ana", email="a@example.org", message="Mensaje largo",
                              city=city, lat=17.1, lon=-96.7))
    db.add(InboundRequest(kind="node", status="approved", name="Ana", email="a@example.org",
                          message="Mensaje largo", city=None, lat=None, lon=None))
    db.commit()
    sites = client.get("/api/v1/public/vision").json()["sites"]
    assert sites[0]["kind"] == "historic"
    assert [s["kind"] for s in sites].count("future") == 1
    assert sites[1] == {"kind": "future", "label": "Oaxaca", "lat": 17.1, "lon": -96.7}


def _rec(db, org_slug="alfa"):
    org_id = db.scalar(select(Organization.id).where(Organization.slug == org_slug))
    rec = Recognition(organization_id=org_id, award="Oro", event="ICAN", venue="Toronto",
                      awarded_on=date(2018, 9, 1), evidence="Archivo del equipo")
    db.add(rec)
    db.commit()
    return rec


def test_deleted_recognition_not_counted(client, db, tenants, monkeypatch):
    monkeypatch.setattr(vision_router, "settings", Settings(public_org_slug="alfa"))
    rec = _rec(db)
    assert _figures(client.get("/api/v1/public/vision"))["recognitions"]["value"] == 1
    rec.deleted_at = datetime.now(timezone.utc)
    db.commit()
    assert _figures(client.get("/api/v1/public/vision"))["recognitions"]["value"] == 0


def test_layers_history_done_with_recognition(client, db, tenants, monkeypatch):
    monkeypatch.setattr(vision_router, "settings", Settings(public_org_slug="alfa"))
    layers = _layers(client.get("/api/v1/public/vision"))
    assert layers["history"]["status"] == "vision"
    assert layers["cortex"]["status"] == "in_construction"
    _rec(db)
    db.add(Species(scientific_name="Lactuca sativa"))
    db.commit()
    layers = _layers(client.get("/api/v1/public/vision"))
    assert layers["history"]["status"] == "done"
    assert layers["cortex"]["status"] == "operating"
    assert layers["knowledge"]["status"] == "in_construction"
    assert layers["trust"]["status"] == "vision" and layers["commons"]["status"] == "vision"
