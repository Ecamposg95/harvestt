from datetime import timedelta

import pytest
from sqlalchemy import select

from app.modules.audit.models import AuditEvent
from app.modules.simulation import service as simulation
from app.modules.simulation.models import SimulationRun
from app.modules.telemetry import rules as rules_mod
from app.modules.telemetry.models import Device, Incident
from tests.test_devices import add_device, make_project
from tests.test_simulation import TICK, start

API = "/api/v1"


@pytest.fixture
def setup(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    d = add_device(client, h, p["id"], name="Sensor norte").json()
    return {"h": h, "pid": p["id"], "device": d}


def rule_body(**extra):
    return {
        "variable": "air_temperature",
        "comparator": "gt",
        "threshold": 30.0,
        "hysteresis": 1.0,
        "cooldown_minutes": 30,
        "stale_after_minutes": 15,
        "label": "Regla demostrativa: temperatura alta",
        **extra,
    }


def add_rule(client, headers, pid, **extra):
    res = client.post(f"{API}/projects/{pid}/alert-rules", json=rule_body(**extra), headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def alerts(client, headers, pid, **params):
    res = client.get(f"{API}/projects/{pid}/alerts", params=params, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def run_to_end(client, clock, headers, pid, rid, steps):
    clock.advance(steps * TICK + 1)
    client.get(f"{API}/projects/{pid}/simulation/runs/{rid}", headers=headers)


# ---- CRUD de reglas ----


def test_rule_crud_is_didactic_and_audited(client, tenants, setup, db):
    s = setup
    rule = add_rule(client, s["h"], s["pid"], label="  Regla demostrativa  ")
    assert rule["is_didactic"] is True and rule["label"] == "Regla demostrativa"
    assert client.get(f"{API}/projects/{s['pid']}/alert-rules", headers=tenants["alfa_viewer"]).json()[0]["id"] == rule["id"]
    patched = client.patch(f"{API}/projects/{s['pid']}/alert-rules/{rule['id']}", json={"threshold": 31}, headers=s["h"])
    assert patched.status_code == 200 and patched.json()["threshold"] == 31
    assert client.delete(f"{API}/projects/{s['pid']}/alert-rules/{rule['id']}", headers=s["h"]).status_code == 204
    assert client.get(f"{API}/projects/{s['pid']}/alert-rules", headers=s["h"]).json() == []
    ops = sorted(e.operation for e in db.query(AuditEvent).filter_by(resource_type="alert_rule"))
    assert ops == ["create", "delete", "update"]


@pytest.mark.parametrize(
    "patch",
    [
        {"variable": "co2"},
        {"comparator": "eq"},
        {"threshold": "nan"},
        {"hysteresis": -1},
        {"cooldown_minutes": -1},
        {"stale_after_minutes": 0},
        {"label": "  "},
        {"is_didactic": False, "label": "x" * 161},
    ],
)
def test_rule_validation(client, setup, patch):
    res = client.post(f"{API}/projects/{setup['pid']}/alert-rules", json=rule_body(**patch), headers=setup["h"])
    assert res.status_code == 422, res.text


def test_rules_permissions_and_isolation(client, tenants, setup):
    s = setup
    rid = add_rule(client, s["h"], s["pid"])["id"]
    v, b = tenants["alfa_viewer"], tenants["beta_editor"]
    assert client.post(f"{API}/projects/{s['pid']}/alert-rules", json=rule_body(), headers=v).status_code == 403
    assert client.patch(f"{API}/projects/{s['pid']}/alert-rules/{rid}", json={"threshold": 1}, headers=v).status_code == 403
    assert client.get(f"{API}/projects/{s['pid']}/alert-rules", headers=b).status_code == 404
    assert client.delete(f"{API}/projects/{s['pid']}/alert-rules/{rid}", headers=b).status_code == 404


# ---- Umbral, histéresis y cooldown ----


def test_heat_rise_opens_one_threshold_incident_with_evidence(client, setup, clock):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    items = [i for i in alerts(client, s["h"], s["pid"]) if i["kind"] == "threshold"]
    assert len(items) == 1
    inc = items[0]
    assert inc["status"] == "closed" and inc["closed_at"] > inc["opened_at"]
    assert inc["device_name"] == "Sensor norte" and inc["rule_label"] == "Regla demostrativa: temperatura alta"
    assert inc["evidence"]["simulated"] is True and inc["evidence"]["threshold"] == 30.0
    assert inc["evidence"]["readings"][0]["value"] > 30
    assert inc["evidence"]["closing_reading"]["value"] < 29  # threshold − hysteresis


def test_base_scenario_with_demo_threshold_stays_quiet(client, setup, clock):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="base", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    assert alerts(client, s["h"], s["pid"]) == []


def _noisy_flat(client, s, clock, **rule):
    """Temperatura plana en 22 °C con ruido ±0.3: cruza un umbral de 22 casi en cada paso."""
    add_rule(client, s["h"], s["pid"], threshold=22.0, **rule)
    rid = start(client, s["h"], s["pid"], seed=9, temp_amplitude_c=0, temp_noise_c=0.3).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    return [i for i in alerts(client, s["h"], s["pid"]) if i["kind"] == "threshold"]


def test_without_hysteresis_or_cooldown_noise_causes_a_storm(client, setup, clock):
    assert len(_noisy_flat(client, setup, clock, hysteresis=0, cooldown_minutes=0)) > 40


def test_hysteresis_prevents_storm(client, setup, clock):
    # Para cerrar habría que bajar de 21.5; el ruido nunca llega: un solo incidente.
    assert len(_noisy_flat(client, setup, clock, hysteresis=0.5, cooldown_minutes=0)) == 1


def test_cooldown_in_simulated_time_prevents_storm(client, setup, clock):
    items = _noisy_flat(client, setup, clock, hysteresis=0, cooldown_minutes=120)
    assert 1 < len(items) <= 288 * 5 // 120 + 1
    opened = sorted(i["opened_at"] for i in items)
    closed = sorted(i["closed_at"] for i in items if i["closed_at"])
    for prev_close, next_open in zip(closed, opened[1:]):
        gap = _ts(next_open) - _ts(prev_close)
        assert gap >= timedelta(minutes=120)


def _ts(iso: str):
    from datetime import datetime

    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


# ---- Sin señal ----


def test_signal_loss_opens_stale_and_closes_on_recovery(client, setup, clock, db):
    s = setup
    add_rule(client, s["h"], s["pid"])  # stale_after_minutes = 15 (3 pasos)
    rid = start(client, s["h"], s["pid"], scenario="sensor_loss", seed=42).json()["id"]  # pierde pasos 60..83
    run = db.get(SimulationRun, rid)
    clock.advance(70 * TICK + 1)
    open_now = alerts(client, s["h"], s["pid"], status="open")
    stale = [i for i in open_now if i["kind"] == "stale"]
    assert len(stale) == 1
    assert _ts(stale[0]["opened_at"]) == simulation.step_time(run, 62)  # última señal en el paso 59 + 15 min
    assert stale[0]["evidence"]["last_seen_at"] == simulation.step_time(run, 59).isoformat()
    clock.advance(30 * TICK)
    closed = [i for i in alerts(client, s["h"], s["pid"]) if i["kind"] == "stale"]
    assert len(closed) == 1 and closed[0]["status"] == "closed"
    assert _ts(closed[0]["closed_at"]) == simulation.step_time(run, 84)


def test_no_rules_no_incidents(client, setup, clock):
    s = setup
    rid = start(client, s["h"], s["pid"], scenario="sensor_loss").json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    assert alerts(client, s["h"], s["pid"]) == []


# ---- Idempotencia ----


def test_re_evaluating_the_same_steps_creates_no_duplicates(client, setup, clock, db):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 100)
    before = {(i.dedupe_key, i.status) for i in db.scalars(select(Incident))}
    assert before
    # Re-materializar (concurrencia o reintento) re-evalúa los mismos pasos
    run = db.get(SimulationRun, rid)
    run.emitted_steps = 0
    db.commit()
    simulation.materialize(db, rid, clock.now)
    db.expire_all()
    assert {(i.dedupe_key, i.status) for i in db.scalars(select(Incident))} == before


def test_evaluate_called_twice_with_same_batch_is_idempotent(client, setup, clock, db):
    s = setup
    add_rule(client, s["h"], s["pid"], threshold=20.0, hysteresis=0, cooldown_minutes=0)
    rid = start(client, s["h"], s["pid"]).json()["id"]
    run = db.get(SimulationRun, rid)
    device = db.get(Device, s["device"]["id"])
    batch = [
        simulation.StepValues(step=i, observed_at=simulation.step_time(run, i), values={device.id: {"air_temperature": v}})
        for i, v in enumerate([19.0, 21.0, 21.5, 19.0, 21.0])
    ]
    rules_mod.evaluate(db, run, batch, [device])
    db.commit()
    rules_mod.evaluate(db, run, batch, [device])
    db.commit()
    incidents = db.scalars(select(Incident).order_by(Incident.opened_at)).all()
    assert [(i.status, i.dedupe_key.rsplit(":", 1)[1]) for i in incidents] == [("closed", "1"), ("open", "4")]


# ---- Reconocer ----


def test_acknowledge_is_audited_once_and_role_checked(client, tenants, setup, clock, db):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 100)
    inc = alerts(client, s["h"], s["pid"], status="open")[0]
    url = f"{API}/projects/{s['pid']}/alerts/{inc['id']}"
    assert client.patch(url, json={"action": "acknowledge"}, headers=tenants["alfa_viewer"]).status_code == 403
    assert client.patch(url, json={"action": "acknowledge"}, headers=tenants["beta_editor"]).status_code == 404
    assert client.patch(url, json={"action": "cerrar"}, headers=s["h"]).status_code == 422
    res = client.patch(url, json={"action": "acknowledge"}, headers=s["h"])
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "acknowledged" and body["acknowledged_at"] and body["acknowledged_by"]
    assert client.patch(url, json={"action": "acknowledge"}, headers=s["h"]).status_code == 200
    events = db.query(AuditEvent).filter_by(resource_type="incident", operation="acknowledge").all()
    assert len(events) == 1 and events[0].resource_id == inc["id"]
    # Al volver la temperatura bajo el umbral se cierra, conservando el reconocimiento
    run_to_end(client, clock, s["h"], s["pid"], rid, 288)
    final = next(i for i in alerts(client, s["h"], s["pid"]) if i["id"] == inc["id"])
    assert final["status"] == "closed" and final["acknowledged_at"] == body["acknowledged_at"]


def test_alerts_isolated_between_tenants(client, tenants, setup, clock):
    s = setup
    add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 100)
    assert client.get(f"{API}/projects/{s['pid']}/alerts", headers=tenants["beta_viewer"]).status_code == 404
    other = make_project(client, tenants["beta_editor"], name="Beta")
    assert alerts(client, tenants["beta_editor"], other["id"]) == []


def test_deleting_rule_closes_its_open_incidents(client, setup, clock):
    s = setup
    rule = add_rule(client, s["h"], s["pid"])
    rid = start(client, s["h"], s["pid"], scenario="heat_rise", seed=42).json()["id"]
    run_to_end(client, clock, s["h"], s["pid"], rid, 100)
    assert alerts(client, s["h"], s["pid"], status="open")
    client.delete(f"{API}/projects/{s['pid']}/alert-rules/{rule['id']}", headers=s["h"])
    items = alerts(client, s["h"], s["pid"])
    assert items and all(i["status"] == "closed" for i in items)
    assert items[0]["evidence"]["closed_reason"] == "rule_deleted"
    assert items[0]["rule_label"] == "Regla demostrativa: temperatura alta"
