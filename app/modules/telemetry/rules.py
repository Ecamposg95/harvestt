"""Evaluación de reglas sobre los pasos recién materializados (tiempo simulado).

Idempotente: el estado (incidentes abiertos, último cierre, última señal) se lee de la base en cada
lote y cada apertura lleva una `dedupe_key` única por (run, tipo, regla, dispositivo, paso).
"""
from datetime import timedelta
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.simulation.clock import as_utc
from app.modules.simulation.engine import UNITS
from app.modules.telemetry.models import (
    COMPARATOR_GT,
    INCIDENT_CLOSED,
    INCIDENT_OPEN,
    INCIDENT_STALE,
    INCIDENT_THRESHOLD,
    SEVERITY_WARNING,
    AlertRule,
    Device,
    Incident,
    TelemetryReading,
)

if TYPE_CHECKING:  # evita el import circular simulation.service ↔ telemetry.rules
    from app.modules.simulation.models import SimulationRun
    from app.modules.simulation.service import StepValues


def breached(rule: AlertRule, value: float) -> bool:
    return value > rule.threshold if rule.comparator == COMPARATOR_GT else value < rule.threshold


def cleared(rule: AlertRule, value: float) -> bool:
    """Histéresis: solo se cierra al volver más allá de threshold ∓ hysteresis."""
    if rule.comparator == COMPARATOR_GT:
        return value < rule.threshold - rule.hysteresis
    return value > rule.threshold + rule.hysteresis


def dedupe_key(run_id: str, kind: str, rule_id: str | None, device_id: str, step: int) -> str:
    return f"{run_id}:{kind}:{rule_id or '-'}:{device_id}:{step}"


def project_rules(db: Session, organization_id: str, project_id: str) -> list[AlertRule]:
    stmt = (
        select(AlertRule)
        .where(
            AlertRule.organization_id == organization_id,
            AlertRule.project_id == project_id,
            AlertRule.deleted_at.is_(None),
        )
        .order_by(AlertRule.created_at, AlertRule.id)
    )
    return list(db.scalars(stmt))


def _reading(observed_at, variable: str, value: float) -> dict:
    return {"observed_at": observed_at.isoformat(), "variable": variable, "value": value, "unit": UNITS[variable]}


def evaluate(db: Session, run: "SimulationRun", batch: list["StepValues"], devices: list[Device]) -> None:
    if not batch or not devices:
        return
    rules = project_rules(db, run.organization_id, run.project_id)
    if not rules:
        return
    incidents = list(
        db.scalars(select(Incident).where(Incident.scenario_run_id == run.id, Incident.deleted_at.is_(None)))
    )
    keys = {i.dedupe_key for i in incidents}
    open_by: dict[tuple, Incident] = {(i.kind, i.rule_id, i.device_id): i for i in incidents if i.closed_at is None}
    last_closed: dict[tuple, object] = {}
    for i in incidents:
        if i.kind == INCIDENT_THRESHOLD and i.closed_at is not None:
            k = (i.rule_id, i.device_id)
            closed = as_utc(i.closed_at)
            last_closed[k] = max(closed, last_closed.get(k, closed))

    first = batch[0].observed_at
    origin = as_utc(run.started_at)
    last_seen = {
        d.id: as_utc(
            db.scalar(
                select(func.max(TelemetryReading.observed_at)).where(
                    TelemetryReading.scenario_run_id == run.id,
                    TelemetryReading.device_id == d.id,
                    TelemetryReading.observed_at < first,
                )
            )
        )
        for d in devices
    }

    def open_incident(kind: str, rule: AlertRule | None, device: Device, step: int, observed, evidence: dict) -> None:
        key = dedupe_key(run.id, kind, rule.id if rule else None, device.id, step)
        if key in keys:
            return
        incident = Incident(
            organization_id=run.organization_id,
            project_id=run.project_id,
            rule_id=rule.id if rule else None,
            scenario_run_id=run.id,
            kind=kind,
            device_id=device.id,
            dedupe_key=key,
            opened_at=observed,
            severity=SEVERITY_WARNING,
            evidence={**evidence, "simulated": True},
            status=INCIDENT_OPEN,
        )
        db.add(incident)
        keys.add(key)
        open_by[(kind, incident.rule_id, device.id)] = incident

    def close_incident(incident: Incident, observed, evidence: dict) -> None:
        incident.closed_at = observed
        incident.status = INCIDENT_CLOSED
        incident.evidence = {**(incident.evidence or {}), **evidence}
        open_by.pop((incident.kind, incident.rule_id, incident.device_id), None)

    for item in batch:
        observed = item.observed_at
        for device in devices:
            values = item.values.get(device.id, {})
            has_signal = any(v is not None for v in values.values())
            device_rules = [r for r in rules if r.variable in device.variables]

            # Sin señal: no hay lectura del dispositivo durante stale_after_minutes de tiempo simulado.
            stale_after = min((r.stale_after_minutes for r in device_rules), default=None)
            stale = open_by.get((INCIDENT_STALE, None, device.id))
            if has_signal:
                if stale is not None and observed > as_utc(stale.opened_at):
                    close_incident(stale, observed, {"signal_back_at": observed.isoformat()})
                last_seen[device.id] = observed
            elif stale_after is not None and stale is None:
                reference = last_seen.get(device.id) or origin
                if observed - reference >= timedelta(minutes=stale_after):
                    open_incident(
                        INCIDENT_STALE,
                        None,
                        device,
                        item.step,
                        observed,
                        {"last_seen_at": reference.isoformat(), "stale_after_minutes": stale_after},
                    )

            for rule in device_rules:
                value = values.get(rule.variable)
                if value is None:
                    continue
                current = open_by.get((INCIDENT_THRESHOLD, rule.id, device.id))
                if current is None:
                    if not breached(rule, value):
                        continue
                    closed = last_closed.get((rule.id, device.id))
                    # Cooldown en tiempo simulado; también descarta pasos anteriores a un cierre (re-evaluación).
                    if closed is not None and observed < closed + timedelta(minutes=rule.cooldown_minutes):
                        continue
                    open_incident(
                        INCIDENT_THRESHOLD,
                        rule,
                        device,
                        item.step,
                        observed,
                        {
                            "rule_label": rule.label,
                            "variable": rule.variable,
                            "comparator": rule.comparator,
                            "threshold": rule.threshold,
                            "hysteresis": rule.hysteresis,
                            "readings": [_reading(observed, rule.variable, value)],
                        },
                    )
                elif observed > as_utc(current.opened_at) and cleared(rule, value):
                    close_incident(current, observed, {"closing_reading": _reading(observed, rule.variable, value)})
                    last_closed[(rule.id, device.id)] = observed
