import pytest

from app.core.config import Settings
from app.modules.audit.models import AuditEvent
from app.modules.prototypes import router as proto_router
from tests.test_prototypes import PNG, binary_stl, create, upload

API = "/api/v1"


@pytest.fixture(autouse=True)
def public_alfa(monkeypatch):
    monkeypatch.setattr(proto_router, "settings", Settings(public_org_slug="alfa"))


def stl(client, headers, proto_id, name="modelo.stl", is_public=True):
    res = upload(client, headers, proto_id, binary_stl(), name, is_public=is_public)
    assert res.status_code == 201, res.text
    return res.json()


def point(asset_id, label="Sensor de humedad", **extra):
    return {"asset_id": asset_id, "label": label, "x": 1.5, "y": -2.0, "z": 30.25, **extra}


def add(client, headers, proto_id, body):
    return client.post(f"{API}/prototypes/{proto_id}/hotspots", json=body, headers=headers)


# ---- CRUD ----


def test_create_list_update_delete_and_audit(client, tenants, db):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])

    res = add(client, h, proto["id"], point(model["id"], label="  LED espectro completo  ", description=" Luz "))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["label"] == "LED espectro completo" and body["description"] == "Luz"
    assert (body["x"], body["y"], body["z"]) == (1.5, -2.0, 30.25)
    assert body["asset_id"] == model["id"] and body["prototype_id"] == proto["id"]
    assert body["sort_order"] == 0

    second = add(client, h, proto["id"], point(model["id"], label="Bomba")).json()
    assert second["sort_order"] == 1

    listed = client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=tenants["alfa_viewer"])
    assert listed.status_code == 200
    assert [p["label"] for p in listed.json()] == ["LED espectro completo", "Bomba"]

    patched = client.patch(
        f"{API}/prototypes/{proto['id']}/hotspots/{body['id']}",
        json={"label": "LED", "sort_order": 5, "z": 31.0},
        headers=h,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["label"] == "LED" and patched.json()["z"] == 31.0
    listed = client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=h).json()
    assert [p["label"] for p in listed] == ["Bomba", "LED"]

    assert client.delete(f"{API}/prototypes/{proto['id']}/hotspots/{body['id']}", headers=h).status_code == 204
    assert [p["label"] for p in client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=h).json()] == ["Bomba"]
    assert client.patch(
        f"{API}/prototypes/{proto['id']}/hotspots/{body['id']}", json={"label": "X"}, headers=h
    ).status_code == 404

    ops = [e.operation for e in db.query(AuditEvent).filter_by(resource_type="prototype_hotspot")]
    assert sorted(ops) == ["create", "create", "delete", "update"]


def test_viewer_cannot_write(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])
    hid = add(client, h, proto["id"], point(model["id"])).json()["id"]
    v = tenants["alfa_viewer"]
    assert add(client, v, proto["id"], point(model["id"])).status_code == 403
    assert client.patch(f"{API}/prototypes/{proto['id']}/hotspots/{hid}", json={"label": "X"}, headers=v).status_code == 403
    assert client.delete(f"{API}/prototypes/{proto['id']}/hotspots/{hid}", headers=v).status_code == 403


def test_limit_of_twelve_per_prototype(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    a = stl(client, h, proto["id"], "a.stl")
    b = stl(client, h, proto["id"], "b.stl")
    for i in range(12):
        assert add(client, h, proto["id"], point(a["id"] if i % 2 else b["id"], label=f"P{i}")).status_code == 201
    res = add(client, h, proto["id"], point(a["id"], label="P12"))
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "hotspot_limit"
    # Borrar uno libera el cupo
    first = client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=h).json()[0]
    client.delete(f"{API}/prototypes/{proto['id']}/hotspots/{first['id']}", headers=h)
    assert add(client, h, proto["id"], point(a["id"], label="P12")).status_code == 201


def test_asset_must_be_stl_of_same_prototype(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    other = create(client, h, name="Otro")
    img = upload(client, h, proto["id"], PNG, "foto.png").json()
    foreign = stl(client, h, other["id"])
    for asset_id in (img["id"], foreign["id"], "no-existe"):
        res = add(client, h, proto["id"], point(asset_id))
        assert res.status_code == 422, asset_id
        assert res.json()["error"]["details"]["field"] == "asset_id"


@pytest.mark.parametrize(
    "patch",
    [
        {"label": ""},
        {"label": "   "},
        {"label": "x" * 61},
        {"description": "d" * 501},
        {"x": "nan"},
        {"y": "inf"},
        {"z": 2e9},
    ],
)
def test_rejects_invalid_fields(client, tenants, patch):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])
    res = add(client, h, proto["id"], {**point(model["id"]), **patch})
    assert res.status_code == 422, res.text


def test_tenant_isolation(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])
    hid = add(client, h, proto["id"], point(model["id"])).json()["id"]
    b = tenants["beta_editor"]
    assert client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=b).status_code == 404
    assert add(client, b, proto["id"], point(model["id"])).status_code == 404
    assert client.patch(f"{API}/prototypes/{proto['id']}/hotspots/{hid}", json={"label": "X"}, headers=b).status_code == 404
    assert client.delete(f"{API}/prototypes/{proto['id']}/hotspots/{hid}", headers=b).status_code == 404
    # Un hotspot no se alcanza a través de otro prototipo de la misma org
    other = create(client, h, name="Otro")
    assert client.patch(f"{API}/prototypes/{other['id']}/hotspots/{hid}", json={"label": "X"}, headers=h).status_code == 404

# ---- Público, cascadas y actividad ----

from app.modules.home.service import activity_text  # noqa: E402


def _walk_keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from _walk_keys(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from _walk_keys(item)


def test_public_detail_has_hotspots_of_principal_public_stl(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h, name="Germinador ECOS", slug="ecos", is_public=True)
    private_stl = stl(client, h, proto["id"], "interno.stl", is_public=False)
    principal = stl(client, h, proto["id"], "principal.stl")
    second = stl(client, h, proto["id"], "segundo.stl")
    add(client, h, proto["id"], point(private_stl["id"], label="Secreto"))
    add(client, h, proto["id"], point(principal["id"], label="LED", description="Espectro completo", sort_order=2))
    add(client, h, proto["id"], point(principal["id"], label="Sensor", sort_order=1))
    add(client, h, proto["id"], point(second["id"], label="Del segundo"))

    res = client.get(f"{API}/public/prototypes/ecos")
    assert res.status_code == 200
    hotspots = res.json()["hotspots"]
    assert [p["label"] for p in hotspots] == ["Sensor", "LED"]
    assert hotspots[1] == {"label": "LED", "description": "Espectro completo", "x": 1.5, "y": -2.0, "z": 30.25, "sort_order": 2}
    keys = set(_walk_keys(hotspots))
    assert keys == {"label", "description", "x", "y", "z", "sort_order"}
    assert "Secreto" not in res.text and "Del segundo" not in res.text


def test_public_detail_without_stl_has_empty_hotspots(client, tenants):
    create(client, tenants["alfa_editor"], name="Sin modelo", slug="sin-modelo", is_public=True)
    assert client.get(f"{API}/public/prototypes/sin-modelo").json()["hotspots"] == []


def test_deleting_stl_soft_deletes_its_hotspots(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h, slug="p", is_public=True)
    a = stl(client, h, proto["id"], "a.stl")
    b = stl(client, h, proto["id"], "b.stl")
    for i in range(6):
        add(client, h, proto["id"], point(a["id"], label=f"A{i}"))
        add(client, h, proto["id"], point(b["id"], label=f"B{i}"))
    assert client.delete(f"{API}/prototypes/{proto['id']}/assets/{a['id']}", headers=h).status_code == 204
    labels = [p["label"] for p in client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=h).json()]
    assert labels and all(lbl.startswith("B") for lbl in labels)
    # Los 6 de A ya no cuentan para el límite
    assert add(client, h, proto["id"], point(b["id"], label="nuevo")).status_code == 201
    # b pasó a ser el STL principal público
    assert {p["label"] for p in client.get(f"{API}/public/prototypes/p").json()["hotspots"]} == set(labels) | {"nuevo"}


def test_deleting_prototype_soft_deletes_hotspots(client, tenants, db):
    from app.modules.prototypes.models import PrototypeHotspot

    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])
    hid = add(client, h, proto["id"], point(model["id"])).json()["id"]
    assert client.delete(f"{API}/prototypes/{proto['id']}", headers=h).status_code == 204
    db.expire_all()
    assert db.get(PrototypeHotspot, hid).deleted_at is not None


@pytest.mark.parametrize(
    "operation,text",
    [("create", "Punto agregado al modelo 3D"), ("update", "Punto del modelo 3D actualizado"), ("delete", "Punto del modelo 3D eliminado")],
)
def test_activity_texts(operation, text):
    event = AuditEvent(resource_type="prototype_hotspot", resource_id="x", operation=operation, data={})
    assert activity_text(event) == text


def test_empty_patch_does_not_audit(client, tenants, db):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])
    hid = add(client, h, proto["id"], point(model["id"])).json()["id"]
    assert client.patch(f"{API}/prototypes/{proto['id']}/hotspots/{hid}", json={}, headers=h).status_code == 200
    assert db.query(AuditEvent).filter_by(resource_type="prototype_hotspot", operation="update").count() == 0
