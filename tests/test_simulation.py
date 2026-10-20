from datetime import timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.modules.audit.models import AuditEvent
from app.modules.simulation import service as simulation
from app.modules.simulation.models import SimulationRun
from app.modules.telemetry.models import TelemetryReading
from tests.test_devices import add_device, make_project

API = "/api/v1"
TICK = 2  # segundos reales por paso (valor por defecto)


@pytest.fixture
def setup(client, tenants):
    """Proyecto de alfa con dos sensores."""
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    d1 = add_device(client, h, p["id"], name="Sensor norte").json()
    d2 = add_device(client, h, p["id"], name="Sensor sur", y=4.0).json()
    return {"h": h, "project": p, "devices": [d1, d2]}


def runs_url(pid):
    return f"{API}/projects/{pid}/simulation/runs"


def start(client, headers, pid, scenario="base", seed=7, **inputs):
    return client.post(runs_url(pid), json={"scenario": scenario, "seed": seed, "inputs": inputs}, headers=headers)


def reading_count(db, run_id=None):
    stmt = select(func.count()).select_from(TelemetryReading)
    if run_id:
        stmt = stmt.where(TelemetryReading.scenario_run_id == run_id)
    return db.scalar(stmt)


def latest(client, headers, pid):
    res = client.get(f"{API}/projects/{pid}/telemetry/latest", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


# ---- Corridas ----


def test_create_run_returns_reproducible_metadata_and_audits(client, setup, clock, db):
    s = setup
    res = start(client, s["h"], s["project"]["id"], seed=42)
    assert res.status_code == 201, res.text
    run = res.json()
    assert run["status"] == "running" and run["seed"] == 42 and run["model_version"] == "didactic-v1"
    assert run["total_steps"] == 288 and run["emitted_steps"] == 0 and run["sim_time"] is None
    assert run["device_ids"] == [d["id"] for d in s["devices"]]
    assert run["inputs"]["step_minutes"] == 5 and run["inputs"]["tick_seconds"] == 2.0
    assert "Simulación didáctica, sin calibración agronómica." in run["limits"]
    assert db.query(AuditEvent).filter_by(resource_type="simulation_run", operation="create").count() == 1


def test_seed_is_chosen_by_server_when_missing(client, setup, clock):
    s = setup
    res = client.post(runs_url(s["project"]["id"]), json={"scenario": "base"}, headers=s["h"])
    assert res.status_code == 201 and isinstance(res.json()["seed"], int)


def test_run_requires_active_devices_and_valid_inputs(client, tenants, setup, clock):
    h = tenants["alfa_editor"]
    empty = make_project(client, h, name="Vacío")
    res = start(client, h, empty["id"])
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "devices"
    pid = setup["project"]["id"]
    assert start(client, h, pid, temp_mean_c=80).status_code == 422
    assert start(client, h, pid, step_minutes=1, horizon_hours=100).status_code == 422
    assert start(client, h, pid, scenario="sensor_loss", loss_device=2).status_code == 422
    assert client.post(runs_url(pid), json={"scenario": "tormenta"}, headers=h).status_code == 422


def test_one_active_run_per_project_and_reset_is_a_new_run(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    first = start(client, s["h"], pid).json()
    res = start(client, s["h"], pid)
    assert res.status_code == 409 and res.json()["error"]["code"] == "run_active"
    client.post(f"{runs_url(pid)}/{first['id']}/pause", headers=s["h"])
    assert start(client, s["h"], pid).status_code == 409  # en pausa también cuenta como activo
    client.post(f"{runs_url(pid)}/{first['id']}/cancel", headers=s["h"])
    second = start(client, s["h"], pid)
    assert second.status_code == 201  # "reset" = corrida nueva; la anterior queda intacta
    runs = client.get(runs_url(pid), headers=s["h"]).json()
    assert [r["id"] for r in runs] == [second.json()["id"], first["id"]]
    assert runs[1]["status"] == "cancelled"


def test_partial_unique_index_blocks_second_active_run(client, setup, clock, db):
    s = setup
    run = start(client, s["h"], s["project"]["id"]).json()
    original = db.get(SimulationRun, run["id"])
    clone = SimulationRun(
        organization_id=original.organization_id,
        project_id=original.project_id,
        scenario="base",
        model_version="didactic-v1",
        seed=1,
        inputs=original.inputs,
        device_ids=original.device_ids,
        status="paused",
        started_at=clock.now,
        paused_seconds=0,
        total_steps=10,
        emitted_steps=0,
        limits=[],
        author_id=original.author_id,
    )
    db.add(clone)
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_state_transitions_and_conflicts(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    assert client.post(f"{runs_url(pid)}/{rid}/resume", headers=s["h"]).status_code == 409
    assert client.post(f"{runs_url(pid)}/{rid}/pause", headers=s["h"]).json()["status"] == "paused"
    assert client.post(f"{runs_url(pid)}/{rid}/pause", headers=s["h"]).status_code == 409
    assert client.post(f"{runs_url(pid)}/{rid}/resume", headers=s["h"]).json()["status"] == "running"
    assert client.post(f"{runs_url(pid)}/{rid}/cancel", headers=s["h"]).json()["status"] == "cancelled"
    res = client.post(f"{runs_url(pid)}/{rid}/cancel", headers=s["h"])
    assert res.status_code == 409 and res.json()["error"]["code"] == "run_state"


def test_viewer_reads_but_cannot_control(client, tenants, setup, clock):
    s = setup
    pid = s["project"]["id"]
    v = tenants["alfa_viewer"]
    assert start(client, v, pid).status_code == 403
    rid = start(client, s["h"], pid).json()["id"]
    assert client.get(f"{runs_url(pid)}/{rid}", headers=v).status_code == 200
    for action in ("pause", "resume", "cancel"):
        assert client.post(f"{runs_url(pid)}/{rid}/{action}", headers=v).status_code == 403


# ---- Materialización ----


def test_materializes_on_read_from_clock(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    run = start(client, s["h"], pid).json()
    assert latest(client, s["h"], pid)["sim_time"] is None  # aún no pasa el primer tick
    clock.advance(10 * TICK + 1)
    body = latest(client, s["h"], pid)
    assert reading_count(db, run["id"]) == 10 * 2 * 2  # 10 pasos × 2 sensores × 2 variables
    got = client.get(f"{runs_url(pid)}/{run['id']}", headers=s["h"]).json()
    assert got["emitted_steps"] == 10
    started = clock.now - timedelta(seconds=10 * TICK + 1)
    assert body["sim_time"].replace("Z", "+00:00") == (started + timedelta(minutes=9 * 5)).isoformat()
    assert all(r["value"] is not None and not r["stale"] for d in body["devices"] for r in d["readings"])


def test_materializing_twice_does_not_duplicate(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    run = start(client, s["h"], pid).json()
    clock.advance(20 * TICK)
    latest(client, s["h"], pid)
    latest(client, s["h"], pid)
    count = reading_count(db, run["id"])
    assert count == 20 * 4
    # Una petición concurrente que leyó emitted_steps viejo vuelve a generar los mismos pasos: mismos event_id.
    row = db.get(SimulationRun, run["id"])
    row.emitted_steps = 0
    db.commit()
    assert simulation.materialize(db, run["id"], clock.now) == 20
    assert reading_count(db, run["id"]) == count


def test_late_event_keeps_observed_at(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    run = start(client, s["h"], pid).json()
    started = clock.now
    clock.advance(100 * TICK)  # nadie leyó durante 200 s: los 100 pasos se materializan tarde
    latest(client, s["h"], pid)
    rows = db.scalars(
        select(TelemetryReading).where(TelemetryReading.scenario_run_id == run["id"]).order_by(TelemetryReading.observed_at)
    ).all()
    first, last = rows[0], rows[-1]
    assert first.observed_at.replace(tzinfo=timezone.utc) == started
    assert last.observed_at.replace(tzinfo=timezone.utc) == started + timedelta(minutes=99 * 5)
    assert {r.received_at.replace(tzinfo=timezone.utc) for r in rows} == {clock.now}
    assert {(r.source, r.quality, r.schema_version) for r in rows} == {("simulated", "synthetic", 1)}
    assert {r.unit for r in rows} == {"Cel", "%"}


def test_catch_up_is_capped_at_500_steps_per_call(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid, horizon_hours=168).json()["id"]  # 2016 pasos
    clock.advance(3000 * TICK)  # el usuario vuelve horas después
    emitted = []
    for _ in range(5):
        run = client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()
        emitted.append((run["emitted_steps"], run["status"]))
    assert emitted == [(500, "running"), (1000, "running"), (1500, "running"), (2000, "running"), (2016, "completed")]


def test_pause_freezes_and_resume_continues(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    clock.advance(5 * TICK)
    client.post(f"{runs_url(pid)}/{rid}/pause", headers=s["h"])
    clock.advance(100)
    assert client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()["emitted_steps"] == 5
    resumed = client.post(f"{runs_url(pid)}/{rid}/resume", headers=s["h"]).json()
    assert resumed["paused_seconds"] == 100
    clock.advance(2 * TICK)
    assert client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()["emitted_steps"] == 7


def test_cancel_stops_materialization(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    clock.advance(5 * TICK)
    client.post(f"{runs_url(pid)}/{rid}/cancel", headers=s["h"])
    clock.advance(500)
    run = client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()
    assert run["status"] == "cancelled" and run["emitted_steps"] == 5
    latest(client, s["h"], pid)
    assert reading_count(db, rid) == 5 * 4


def test_run_completes_at_total_steps(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid, horizon_hours=1).json()["id"]  # 12 pasos
    clock.advance(1000)
    run = client.get(f"{runs_url(pid)}/{rid}", headers=s["h"]).json()
    assert run["status"] == "completed" and run["emitted_steps"] == 12 and run["ended_at"] is not None
    assert start(client, s["h"], pid).status_code == 201


def test_deleted_device_stops_producing_readings(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    clock.advance(5 * TICK)
    latest(client, s["h"], pid)
    client.delete(f"{API}/projects/{pid}/devices/{s['devices'][1]['id']}", headers=s["h"])
    clock.advance(5 * TICK)
    latest(client, s["h"], pid)
    assert reading_count(db, rid) == 5 * 4 + 5 * 2


# ---- Pérdida de señal ----


def test_signal_loss_produces_no_readings_and_latest_is_stale(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    lost, ok = s["devices"]
    rid = start(client, s["h"], pid, scenario="sensor_loss", loss_start_step=2, loss_steps=3).json()["id"]
    clock.advance(4 * TICK)  # pasos 0..3: el sensor 0 ya no reporta en 2 y 3
    body = latest(client, s["h"], pid)
    by_device = {d["device_id"]: d for d in body["devices"]}
    assert all(r["stale"] for r in by_device[lost["id"]]["readings"])
    assert all(not r["stale"] for r in by_device[ok["id"]]["readings"])
    clock.advance(6 * TICK)
    latest(client, s["h"], pid)
    observed = db.scalars(
        select(TelemetryReading.observed_at).where(
            TelemetryReading.scenario_run_id == rid,
            TelemetryReading.device_id == lost["id"],
            TelemetryReading.variable == "air_temperature",
        )
    ).all()
    started = clock.now - timedelta(seconds=10 * TICK)
    steps = sorted(round((o.replace(tzinfo=timezone.utc) - started).total_seconds() / 300) for o in observed)
    assert steps == [0, 1, 5, 6, 7, 8, 9]  # pasos 2, 3 y 4 sin fila (ni None ni 0)
    assert db.scalar(select(func.count()).select_from(TelemetryReading).where(TelemetryReading.value == 0)) == 0
    body = latest(client, s["h"], pid)
    assert not any(r["stale"] for d in body["devices"] for r in d["readings"])  # se recuperó


# ---- Lecturas ----


def readings(client, headers, pid, **params):
    return client.get(f"{API}/projects/{pid}/telemetry/readings", params=params, headers=headers)


def test_readings_filters_and_timezone_offsets(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    d1 = s["devices"][0]["id"]
    start(client, s["h"], pid)
    started = clock.now
    clock.advance(12 * TICK)
    body = readings(client, s["h"], pid, variable="air_temperature", device_id=d1).json()
    assert body["interval_minutes"] == 5 and body["downsampled"] is False
    assert len(body["points"]) == 12
    assert {(p["variable"], p["unit"], p["device_id"]) for p in body["points"]} == {("air_temperature", "Cel", d1)}
    # since/until con desfase horario (-06:00) equivalen a la misma hora UTC
    local = timezone(timedelta(hours=-6))
    since = (started + timedelta(minutes=10)).astimezone(local).isoformat()
    until = (started + timedelta(minutes=25)).astimezone(local).isoformat()
    window = readings(client, s["h"], pid, variable="air_temperature", device_id=d1, since=since, until=until).json()
    assert len(window["points"]) == 4  # pasos 2, 3, 4 y 5


def test_readings_downsample_to_2000_points(client, setup, clock, db):
    s = setup
    pid = s["project"]["id"]
    d1 = s["devices"][0]["id"]
    rid = start(client, s["h"], pid, step_minutes=1, horizon_hours=60).json()["id"]  # 3600 pasos
    clock.advance(3600 * TICK)
    simulation.materialize(db, rid, clock.now, limit=5000)
    body = readings(client, s["h"], pid, variable="air_temperature", device_id=d1).json()
    assert body["downsampled"] is True and body["interval_minutes"] == 2
    assert len(body["points"]) == 1800
    both = readings(client, s["h"], pid, device_id=d1).json()  # 2 variables × 3600
    assert len(both["points"]) <= 2000 and both["interval_minutes"] == 4
    res = readings(client, s["h"], pid, variable="air_temperature", device_id=d1, downsample="false")
    assert res.status_code == 422 and res.json()["error"]["code"] == "too_many_points"


def test_readings_without_runs_is_empty(client, setup):
    body = readings(client, setup["h"], setup["project"]["id"]).json()
    assert body == {"run_id": None, "interval_minutes": None, "downsampled": False, "points": []}
    body = latest(client, setup["h"], setup["project"]["id"])
    assert body["run_id"] is None
    assert all(r["value"] is None and not r["stale"] for d in body["devices"] for r in d["readings"])


def test_readings_of_previous_run(client, setup, clock):
    s = setup
    pid = s["project"]["id"]
    first = start(client, s["h"], pid).json()["id"]
    clock.advance(3 * TICK)
    client.post(f"{runs_url(pid)}/{first}/cancel", headers=s["h"])
    start(client, s["h"], pid)
    clock.advance(1 * TICK)
    assert len(readings(client, s["h"], pid).json()["points"]) == 4
    old = readings(client, s["h"], pid, run_id=first).json()
    assert old["run_id"] == first and len(old["points"]) == 12


def test_isolation_between_tenants_and_projects(client, tenants, setup, clock):
    s = setup
    pid = s["project"]["id"]
    rid = start(client, s["h"], pid).json()["id"]
    clock.advance(4 * TICK)
    b = tenants["beta_editor"]
    assert client.get(runs_url(pid), headers=b).status_code == 404
    assert client.get(f"{runs_url(pid)}/{rid}", headers=b).status_code == 404
    assert client.post(f"{runs_url(pid)}/{rid}/pause", headers=b).status_code == 404
    assert readings(client, b, pid).status_code == 404
    assert client.get(f"{API}/projects/{pid}/telemetry/latest", headers=b).status_code == 404
    other = make_project(client, s["h"], name="Otro")
    assert client.get(f"{runs_url(other['id'])}/{rid}", headers=s["h"]).status_code == 404
    assert readings(client, s["h"], other["id"], run_id=rid).status_code == 404
