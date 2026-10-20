import pytest

from app.modules.audit.models import AuditEvent

API = "/api/v1"


def make_project(client, headers, name="Invernadero norte", **extra):
    res = client.post(f"{API}/projects", json={"name": name, "system": "hydroponic", **extra}, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def device_body(name="Sensor norte", **extra):
    return {"name": name, "variables": ["air_temperature", "relative_humidity"], "x": 4.0, "y": 12.0, "z": 1.5, **extra}


def add_device(client, headers, project_id, **extra):
    return client.post(f"{API}/projects/{project_id}/devices", json=device_body(**extra), headers=headers)


def test_device_crud_and_audit(client, tenants, db):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    res = add_device(client, h, p["id"], name="  Sensor norte  ")
    assert res.status_code == 201, res.text
    d = res.json()
    assert d["name"] == "Sensor norte" and d["kind"] == "simulated" and d["status"] == "active"
    assert d["variables"] == ["air_temperature", "relative_humidity"] and (d["x"], d["y"], d["z"]) == (4.0, 12.0, 1.5)

    listed = client.get(f"{API}/projects/{p['id']}/devices", headers=tenants["alfa_viewer"])
    assert listed.status_code == 200 and [x["id"] for x in listed.json()] == [d["id"]]

    patched = client.patch(
        f"{API}/projects/{p['id']}/devices/{d['id']}", json={"name": "Sensor centro", "status": "inactive"}, headers=h
    )
    assert patched.status_code == 200 and patched.json()["name"] == "Sensor centro"
    assert patched.json()["status"] == "inactive"
    # PATCH sin cambios no audita
    assert client.patch(f"{API}/projects/{p['id']}/devices/{d['id']}", json={}, headers=h).status_code == 200

    assert client.delete(f"{API}/projects/{p['id']}/devices/{d['id']}", headers=h).status_code == 204
    assert client.get(f"{API}/projects/{p['id']}/devices", headers=h).json() == []
    assert client.patch(f"{API}/projects/{p['id']}/devices/{d['id']}", json={"name": "X"}, headers=h).status_code == 404
    ops = sorted(e.operation for e in db.query(AuditEvent).filter_by(resource_type="device"))
    assert ops == ["create", "delete", "update"]


def test_viewer_cannot_write_devices(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    did = add_device(client, h, p["id"]).json()["id"]
    v = tenants["alfa_viewer"]
    assert add_device(client, v, p["id"]).status_code == 403
    assert client.patch(f"{API}/projects/{p['id']}/devices/{did}", json={"name": "X"}, headers=v).status_code == 403
    assert client.delete(f"{API}/projects/{p['id']}/devices/{did}", headers=v).status_code == 403


def test_device_limit(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    for i in range(10):
        assert add_device(client, h, p["id"], name=f"S{i}").status_code == 201
    res = add_device(client, h, p["id"], name="S10")
    assert res.status_code == 422 and res.json()["error"]["code"] == "device_limit"


@pytest.mark.parametrize(
    "patch",
    [
        {"name": "   "},
        {"name": "x" * 121},
        {"variables": []},
        {"variables": ["air_temperature", "air_temperature"]},
        {"variables": ["co2"]},
        {"x": -1},
        {"z": 51},
        {"y": "inf"},
        {"kind": "physical"},
    ],
)
def test_device_validation(client, tenants, patch):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    res = client.post(f"{API}/projects/{p['id']}/devices", json={**device_body(), **patch}, headers=h)
    assert res.status_code == 422, res.text


def test_device_isolation_between_tenants_and_projects(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    other = make_project(client, h, name="Otro")
    did = add_device(client, h, p["id"]).json()["id"]
    b = tenants["beta_editor"]
    assert client.get(f"{API}/projects/{p['id']}/devices", headers=b).status_code == 404
    assert add_device(client, b, p["id"]).status_code == 404
    assert client.delete(f"{API}/projects/{p['id']}/devices/{did}", headers=b).status_code == 404
    # Un dispositivo no se alcanza a través de otro proyecto de la misma organización
    assert client.patch(f"{API}/projects/{other['id']}/devices/{did}", json={"name": "X"}, headers=h).status_code == 404
