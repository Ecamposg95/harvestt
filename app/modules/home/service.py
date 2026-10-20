"""Resumen del inicio de la plataforma: datos reales del tenant y lecturas simuladas etiquetadas."""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import RequestContext
from app.core.tenant import scoped
from app.modules.audit.models import AuditEvent
from app.modules.catalog.models import SUBJECT_SPECIES, TraitAssertion
from app.modules.home.schemas import HomeActivity, HomeCounts, HomeOut, HomeProject, HomeReading
from app.modules.projects.models import CropCycle, Observation, Project
from app.modules.simulation import service as simulation
from app.modules.simulation.engine import VARIABLES
from app.modules.telemetry.service import latest_readings

ACTIVITY_LIMIT = 10

_TEXTS = {
    ("project", "create"): "Proyecto creado: {name}",
    ("project", "update"): "Proyecto actualizado",
    ("crop_cycle", "create"): "Ciclo de cultivo iniciado",
    ("prototype", "create"): "Prototipo creado: {name}",
    ("prototype", "update"): "Prototipo actualizado",
    ("prototype", "delete"): "Prototipo eliminado",
    ("observation", "create"): "Observación registrada",
    ("prototype_asset", "create"): "Archivo de prototipo agregado",
    ("prototype_asset", "update"): "Archivo de prototipo actualizado",
    ("prototype_asset", "delete"): "Archivo de prototipo eliminado",
    ("prototype_hotspot", "create"): "Punto agregado al modelo 3D: {name}",
    ("prototype_hotspot", "update"): "Punto del modelo 3D actualizado",
    ("prototype_hotspot", "delete"): "Punto del modelo 3D eliminado",
    ("device", "create"): "Dispositivo agregado: {name}",
    ("device", "update"): "Dispositivo actualizado",
    ("device", "delete"): "Dispositivo eliminado",
    ("alert_rule", "create"): "Regla de alerta creada",
    ("alert_rule", "update"): "Regla de alerta actualizada",
    ("alert_rule", "delete"): "Regla de alerta eliminada",
    ("simulation_run", "create"): "Simulación iniciada",
    ("simulation_run", "pause"): "Simulación en pausa",
    ("simulation_run", "resume"): "Simulación reanudada",
    ("simulation_run", "cancel"): "Simulación cancelada",
    ("incident", "acknowledge"): "Incidente reconocido",
}


def activity_text(event: AuditEvent) -> str:
    template = _TEXTS.get((event.resource_type, event.operation))
    if template is None:
        return "Cambio registrado"
    data = event.data or {}
    name = data.get("name") or data.get("label")
    if "{name}" in template:
        return template.format(name=name) if name else template.split(":")[0]
    return template


def _count(db: Session, model, ctx: RequestContext) -> int:
    return db.scalar(select(func.count()).select_from(scoped(model, ctx).subquery())) or 0


def _sources_cited(db: Session, ctx: RequestContext) -> int:
    species_ids = db.scalars(scoped(CropCycle, ctx).with_only_columns(CropCycle.species_id).distinct()).all()
    if not species_ids:
        return 0
    refs = db.scalars(
        select(TraitAssertion.evidence_refs).where(
            TraitAssertion.subject_type == SUBJECT_SPECIES, TraitAssertion.subject_id.in_(species_ids)
        )
    ).all()
    return len({r.get("source_id") for group in refs for r in (group or []) if r.get("source_id")})


def _readings(db: Session, ctx: RequestContext, project: Project, now: datetime) -> list[HomeReading]:
    """Por variable: la lectura más reciente con señal entre los dispositivos; si todos perdieron la señal, "Sin señal"."""
    run = simulation.refresh_current_run(db, ctx, project, now)
    if run is None:
        return []
    latest = latest_readings(db, ctx, project, run, simulation.sim_time(run))
    out: list[HomeReading] = []
    for variable in VARIABLES:
        candidates = sorted(
            ((d.name, r) for d in latest.devices for r in d.readings if r.variable == variable and r.observed_at),
            key=lambda c: c[0],
        )
        if not candidates:
            continue
        live = [c for c in candidates if not c[1].stale]
        name, reading = max(live or candidates, key=lambda c: c[1].observed_at)
        out.append(
            HomeReading(
                variable=variable,
                value=reading.value if live else None,
                unit=reading.unit,
                observed_at=reading.observed_at,
                stale=not live,
                device_name=name,
                origin="simulated",
            )
        )
    return out


def build_home(db: Session, ctx: RequestContext, now: datetime) -> HomeOut:
    recent = db.scalar(scoped(Project, ctx).order_by(Project.updated_at.desc(), Project.created_at.desc()).limit(1))
    recent_out = None
    readings: list[HomeReading] = []
    if recent is not None:
        readings = _readings(db, ctx, recent, now)
        cycles = db.scalars(scoped(CropCycle, ctx).where(CropCycle.project_id == recent.id)).unique().all()
        species = sorted({c.species.scientific_name for c in cycles if c.species is not None})
        recent_out = HomeProject(
            id=recent.id, name=recent.name, system=recent.system, area_m2=recent.area_m2, species=species
        )

    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.organization_id == ctx.organization_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(ACTIVITY_LIMIT)
    ).all()

    return HomeOut(
        recent_project=recent_out,
        counts=HomeCounts(
            projects=_count(db, Project, ctx),
            crop_cycles=_count(db, CropCycle, ctx),
            observations=_count(db, Observation, ctx),
            sources_cited=_sources_cited(db, ctx),
        ),
        readings=readings,
        activity=[
            HomeActivity(
                id=e.id,
                text=activity_text(e),
                resource_type=e.resource_type,
                resource_id=e.resource_id,
                created_at=e.created_at,
            )
            for e in events
        ],
    )
