import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.modules.audit.models import AuditEvent
from app.modules.home.service import activity_text
from app.modules.identity import service as identity
from app.modules.projects.models import Project
from app.modules.telemetry import seed as telemetry_seed
from app.modules.telemetry.demo import DEMO_RULES, greenhouse_dims
from app.modules.telemetry.models import AlertRule, Device
from tests.test_devices import make_project
from tests.test_simulation import TICK, start

API = "/api/v1"


def demo(client, headers, pid):
    res = client.post(f"{API}/projects/{pid}/simulation/demo", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


# ---- Configuración demostrativa ----


def test_greenhouse_dims_from_area_or_illustrative():
    assert greenhouse_dims(None) == (8.0, 16.0)
    assert greenhouse_dims(128) == pytest.approx((8.0, 16.0))
    assert greenhouse_dims(50) == pytest.approx((5.0, 10.0))


def test_demo_setup_is_idempotent_and_labeled(client, tenants, db):
    h = tenants["alfa_editor"]
    p = make_project(client, h, area_m2=50)
    first = demo(client, h, p["id"])
    assert (first["created_devices"], first["created_rules"]) == (2, 2)
    assert [d["name"] for d in first["devices"]] == ["Sensor norte", "Sensor sur"]
    assert [(d["x"], d["y"]) for d in first["devices"]] == [(2.5, 7.5), (2.5, 2.5)]  # dentro de la nave 5 × 10 m
    assert all(r["is_didactic"] and r["label"].startswith("Regla demostrativa") for r in first["rules"])
    again = demo(client, h, p["id"])
    assert (again["created_devices"], again["created_rules"]) == (0, 0)
    assert len(again["devices"]) == 2 and len(again["rules"]) == 2
    assert client.post(f"{API}/projects/{p['id']}/simulation/demo", headers=tenants["alfa_viewer"]).status_code == 403
    assert client.post(f"{API}/projects/{p['id']}/simulation/demo", headers=tenants["beta_editor"]).status_code == 404
    texts = {activity_text(e) for e in db.query(AuditEvent).filter_by(resource_type="device")}
    assert texts == {"Dispositivo agregado: Sensor norte", "Dispositivo agregado: Sensor sur"}


def test_demo_rules_trigger_heat_rise_but_not_base(client, tenants, clock):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    demo(client, h, p["id"])
    rid = start(client, h, p["id"], scenario="base", seed=42).json()["id"]
    clock.advance(288 * TICK + 1)
    client.get(f"{API}/projects/{p['id']}/simulation/runs/{rid}", headers=h)
    assert client.get(f"{API}/projects/{p['id']}/alerts", headers=h).json() == []
    rid = start(client, h, p["id"], scenario="heat_rise", seed=42).json()["id"]
    clock.advance(288 * TICK + 1)
    client.get(f"{API}/projects/{p['id']}/simulation/runs/{rid}", headers=h)
    kinds = {(i["kind"], i["evidence"]["variable"]) for i in client.get(f"{API}/projects/{p['id']}/alerts", headers=h).json()}
    assert kinds == {("threshold", "air_temperature"), ("threshold", "relative_humidity")}


# ---- Seed ----


def test_seed_is_off_by_default_and_idempotent_when_on(db, monkeypatch):
    org = identity.ensure_organization(db, "HarvestT", "harvestt")
    db.commit()
    monkeypatch.setattr(telemetry_seed, "settings", Settings(seed_org_slug="harvestt"))
    telemetry_seed.seed(db)
    db.commit()
    assert db.scalars(select(Project)).all() == []

    monkeypatch.setattr(telemetry_seed, "settings", Settings(seed_org_slug="harvestt", seed_demo_simulation=True))
    for _ in range(2):
        telemetry_seed.seed(db)
        db.commit()
    projects = db.scalars(select(Project).where(Project.organization_id == org.id)).all()
    assert [p.name for p in projects] == ["Invernadero demostrativo"]
    assert projects[0].area_m2 is None  # sin área inventada: la escena usa el tamaño ilustrativo
    assert db.query(Device).count() == 2
    assert sorted(r.label for r in db.scalars(select(AlertRule))) == sorted(r["label"] for r in DEMO_RULES)


# ---- Inicio ----


def test_home_shows_latest_simulated_readings_of_recent_project(client, tenants, clock):
    h = tenants["alfa_editor"]
    p = make_project(client, h, name="Demo")
    assert client.get(f"{API}/home", headers=h).json()["readings"] == []  # sin corridas: "Sin lecturas"
    demo(client, h, p["id"])
    start(client, h, p["id"], seed=42)
    clock.advance(10 * TICK)
    readings = client.get(f"{API}/home", headers=tenants["alfa_viewer"]).json()["readings"]
    assert [r["variable"] for r in readings] == ["air_temperature", "relative_humidity"]
    assert all(r["origin"] == "simulated" and not r["stale"] and r["value"] is not None for r in readings)
    assert {r["unit"] for r in readings} == {"Cel", "%"}
    assert readings[0]["device_name"] == "Sensor norte"


def test_home_reports_no_signal_when_all_devices_lost(client, tenants, clock, db):
    h = tenants["alfa_editor"]
    p = make_project(client, h, name="Demo")
    demo(client, h, p["id"])
    # Solo un sensor: desactivar el segundo antes de iniciar
    south = next(d for d in client.get(f"{API}/projects/{p['id']}/devices", headers=h).json() if d["name"] == "Sensor sur")
    client.patch(f"{API}/projects/{p['id']}/devices/{south['id']}", json={"status": "inactive"}, headers=h)
    start(client, h, p["id"], scenario="sensor_loss", loss_start_step=2, loss_steps=5)
    clock.advance(4 * TICK)
    readings = client.get(f"{API}/home", headers=h).json()["readings"]
    assert readings and all(r["stale"] and r["value"] is None for r in readings)


def test_home_readings_isolated_between_tenants(client, tenants, clock):
    h = tenants["alfa_editor"]
    p = make_project(client, h, name="Demo")
    demo(client, h, p["id"])
    start(client, h, p["id"])
    clock.advance(10 * TICK)
    assert client.get(f"{API}/home", headers=tenants["beta_viewer"]).json()["readings"] == []


@pytest.mark.parametrize(
    "resource,operation,text",
    [
        ("simulation_run", "create", "Simulación iniciada"),
        ("simulation_run", "pause", "Simulación en pausa"),
        ("simulation_run", "resume", "Simulación reanudada"),
        ("simulation_run", "cancel", "Simulación cancelada"),
        ("incident", "acknowledge", "Incidente reconocido"),
        ("alert_rule", "create", "Regla de alerta creada"),
        ("device", "delete", "Dispositivo eliminado"),
    ],
)
def test_activity_texts(resource, operation, text):
    event = AuditEvent(resource_type=resource, resource_id="x", operation=operation, data={})
    assert activity_text(event) == text
