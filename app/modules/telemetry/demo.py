"""Configuración demostrativa del invernadero virtual.

Los umbrales NO son valores agronómicos: se eligieron para que, con los parámetros de ejemplo del
motor didactic-v1, el escenario `heat_rise` dispare y `base` no. Cada regla lo dice en su etiqueta.
"""
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.modules.projects.models import Project
from app.modules.simulation.engine import AIR_TEMPERATURE, RELATIVE_HUMIDITY
from app.modules.telemetry.models import AlertRule, Device

ILLUSTRATIVE_WIDTH_M = 8.0
ILLUSTRATIVE_LENGTH_M = 16.0
SENSOR_HEIGHT_M = 1.5

DEMO_RULES = (
    {
        "label": "Regla demostrativa: temperatura del aire sobre 30 °C (umbral de ejemplo, no agronómico)",
        "variable": AIR_TEMPERATURE,
        "comparator": "gt",
        "threshold": 30.0,
        "hysteresis": 1.0,
        "cooldown_minutes": 30,
        "stale_after_minutes": 15,
    },
    {
        "label": "Regla demostrativa: humedad relativa bajo 45 % (umbral de ejemplo, no agronómico)",
        "variable": RELATIVE_HUMIDITY,
        "comparator": "lt",
        "threshold": 45.0,
        "hysteresis": 2.0,
        "cooldown_minutes": 30,
        "stale_after_minutes": 15,
    },
)


def greenhouse_dims(area_m2: float | None) -> tuple[float, float]:
    """(ancho, largo) en metros: nave 1:2 con el área registrada o tamaño ilustrativo 8 × 16 m.
    Misma fórmula que `greenhouseDims` del frontend."""
    if area_m2 is None or area_m2 <= 0:
        return ILLUSTRATIVE_WIDTH_M, ILLUSTRATIVE_LENGTH_M
    width = math.sqrt(area_m2 / 2)
    return width, width * 2


def ensure_demo_setup(db: Session, ctx: RequestContext | None, organization_id: str, project: Project) -> dict:
    """Crea (si faltan, por nombre o etiqueta) dos sensores y dos reglas demostrativas. Idempotente."""
    width, length = greenhouse_dims(project.area_m2)
    wanted_devices = (
        ("Sensor norte", round(width / 2, 2), round(length * 0.75, 2)),
        ("Sensor sur", round(width / 2, 2), round(length * 0.25, 2)),
    )
    existing_devices = {
        d.name
        for d in db.scalars(
            select(Device).where(
                Device.organization_id == organization_id, Device.project_id == project.id, Device.deleted_at.is_(None)
            )
        )
    }
    created = {"devices": 0, "rules": 0}
    for name, x, y in wanted_devices:
        if name in existing_devices:
            continue
        device = Device(
            organization_id=organization_id,
            project_id=project.id,
            name=name,
            kind="simulated",
            variables=[AIR_TEMPERATURE, RELATIVE_HUMIDITY],
            x=x,
            y=y,
            z=SENSOR_HEIGHT_M,
            status="active",
        )
        db.add(device)
        db.flush()
        record(db, ctx, "device", device.id, "create", {"project_id": project.id, "name": name, "demo": True})
        created["devices"] += 1

    existing_rules = {
        r.label
        for r in db.scalars(
            select(AlertRule).where(
                AlertRule.organization_id == organization_id,
                AlertRule.project_id == project.id,
                AlertRule.deleted_at.is_(None),
            )
        )
    }
    for spec in DEMO_RULES:
        if spec["label"] in existing_rules:
            continue
        rule = AlertRule(organization_id=organization_id, project_id=project.id, is_didactic=True, **spec)
        db.add(rule)
        db.flush()
        record(db, ctx, "alert_rule", rule.id, "create", {"project_id": project.id, "label": rule.label, "demo": True})
        created["rules"] += 1
    return created
