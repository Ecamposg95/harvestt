"""KPIs de impacto calculados al vuelo, sin tablas propias. Ningún número inventado:
conteos reales, derivados con fórmula visible o valores de la simulación didáctica etiquetados."""
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import RequestContext
from app.core.tenant import scoped
from app.modules.catalog.models import (
    ORIGIN_DERIVED,
    ORIGIN_MEASURED,
    ORIGIN_MISSING,
    ORIGIN_SIMULATED,
    SUBJECT_SPECIES,
    Source,
    Species,
    TraitAssertion,
)
from app.modules.impact.schemas import KpiOut, ProjectImpactOut, PublicImpactOut
from app.modules.projects.models import CYCLE_ACTIVE, CropCycle, Observation, Project
from app.modules.prototypes.models import Prototype
from app.modules.simulation.clock import as_utc
from app.modules.simulation.models import SimulationRun
from app.modules.telemetry.models import INCIDENT_OPEN, Incident

OBSERVATION_WINDOW_DAYS = 30


def _kpi(
    key: str,
    label: str,
    value: float | None,
    unit: str | None,
    origin: str,
    formula: str,
    inputs_count: int,
    now: datetime,
) -> KpiOut:
    return KpiOut(
        key=key,
        label=label,
        value=value,
        unit=unit,
        origin=origin,
        formula=formula,
        inputs_count=inputs_count,
        as_of=now,
    )


def _count(db: Session, stmt) -> int:
    return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0


def _species_assertions(species_ids: list[str] | None):
    stmt = select(TraitAssertion.origin, TraitAssertion.evidence_refs)
    if species_ids is not None:
        stmt = stmt.where(TraitAssertion.subject_type == SUBJECT_SPECIES, TraitAssertion.subject_id.in_(species_ids))
    return stmt


def evidence_coverage(db: Session, species_ids: list[str] | None) -> tuple[float | None, int]:
    """Porcentaje de afirmaciones con origen distinto de "missing". None = todo el catálogo."""
    if species_ids == []:
        return None, 0
    origins = [row.origin for row in db.execute(_species_assertions(species_ids))]
    if not origins:
        return None, 0
    known = sum(1 for o in origins if o != ORIGIN_MISSING)
    return round(known / len(origins) * 100, 1), len(origins)


def _cited_sources(db: Session, species_ids: list[str]) -> tuple[int, int]:
    """(fuentes distintas citadas, afirmaciones consideradas) de las especies dadas."""
    if not species_ids:
        return 0, 0
    refs = [row.evidence_refs for row in db.execute(_species_assertions(species_ids))]
    sources = {r.get("source_id") for group in refs for r in (group or []) if r.get("source_id")}
    return len(sources), len(refs)


def project_kpis(db: Session, ctx: RequestContext, project: Project, now: datetime) -> ProjectImpactOut:
    cycles = db.scalars(scoped(CropCycle, ctx).where(CropCycle.project_id == project.id)).unique().all()
    active = [c for c in cycles if c.status == CYCLE_ACTIVE]
    # Una fecha de inicio futura no da días transcurridos: se ignora como insumo.
    dated = [c.started_on for c in active if c.started_on is not None and c.started_on <= now.date()]
    days = (now.date() - min(dated)).days if dated else None
    species_ids = sorted({c.species_id for c in cycles})

    observations = _count(
        db,
        scoped(Observation, ctx).where(
            Observation.project_id == project.id,
            Observation.observed_at >= now - timedelta(days=OBSERVATION_WINDOW_DAYS),
            Observation.observed_at <= now,
        ),
    )
    coverage, assertions = evidence_coverage(db, species_ids)
    sources, source_inputs = _cited_sources(db, species_ids)
    runs = _count(db, scoped(SimulationRun, ctx).where(SimulationRun.project_id == project.id))

    incidents = db.scalars(scoped(Incident, ctx).where(Incident.project_id == project.id)).all()
    opened = sum(1 for i in incidents if i.status == INCIDENT_OPEN)
    acked = [i for i in incidents if i.acknowledged_at is not None]
    # created_at y acknowledged_at están en tiempo real; opened_at está en tiempo simulado.
    mean_ack = (
        round(
            sum((as_utc(i.acknowledged_at) - as_utc(i.created_at)).total_seconds() for i in acked) / len(acked) / 60, 1
        )
        if acked
        else None
    )

    kpis = [
        _kpi("active_cycles", "Ciclos activos", len(active), None, ORIGIN_MEASURED,
             "Número de ciclos del proyecto con estado «activo».", len(cycles), now),
        _kpi("days_since_oldest_active_cycle", "Días desde el inicio del ciclo activo más antiguo", days, "días",
             ORIGIN_DERIVED,
             "Fecha de hoy − fecha de inicio del ciclo activo más antiguo con fecha registrada.", len(dated), now),
        _kpi("observations_30d", "Observaciones en los últimos 30 días", observations, None, ORIGIN_MEASURED,
             "Entradas de la bitácora con fecha de observación dentro de los últimos 30 días.", observations, now),
        _kpi("evidence_coverage", "Cobertura de evidencia de las especies", coverage, "%", ORIGIN_DERIVED,
             "Afirmaciones con origen distinto de «desconocido» ÷ total de afirmaciones de las especies "
             "del proyecto × 100.", assertions, now),
        _kpi("sources_cited", "Fuentes citadas", sources, None, ORIGIN_MEASURED,
             "Fuentes distintas citadas como evidencia en las afirmaciones de las especies del proyecto.",
             source_inputs, now),
        _kpi("simulation_runs", "Corridas de simulación", runs, None, ORIGIN_SIMULATED,
             "Corridas de la simulación didáctica creadas en el proyecto.", runs, now),
        _kpi("incidents_open", "Incidentes abiertos", opened, None, ORIGIN_SIMULATED,
             "Incidentes con estado «abierto» generados por la telemetría simulada.", len(incidents), now),
        _kpi("incidents_acknowledged", "Incidentes reconocidos", len(acked), None, ORIGIN_SIMULATED,
             "Incidentes de la telemetría simulada que una persona reconoció.", len(incidents), now),
        _kpi("mean_minutes_to_acknowledge", "Tiempo medio a reconocer", mean_ack, "min", ORIGIN_SIMULATED,
             "Promedio de (momento del reconocimiento − momento en que se registró el incidente), en tiempo real.",
             len(acked), now),
    ]
    return ProjectImpactOut(project_id=project.id, as_of=now, kpis=kpis)


def public_kpis(db: Session, public_org_id: str | None, now: datetime) -> PublicImpactOut:
    """Solo catálogo global y vitrina de la organización pública; nada de proyectos."""
    published = 0
    if public_org_id is not None:
        published = _count(
            db,
            select(Prototype.id).where(
                Prototype.organization_id == public_org_id,
                Prototype.is_public.is_(True),
                Prototype.deleted_at.is_(None),
            ),
        )
    species = _count(db, select(Species.id))
    licenses = db.scalars(select(Source.license)).all()
    licensed = sum(1 for lic in licenses if lic and lic.strip())
    coverage, assertions = evidence_coverage(db, None)

    kpis = [
        _kpi("published_prototypes", "Prototipos publicados", published, None, ORIGIN_MEASURED,
             "Prototipos publicados en la vitrina.", published, now),
        _kpi("catalog_species", "Especies en el catálogo", species, None, ORIGIN_MEASURED,
             "Especies registradas en el catálogo vegetal.", species, now),
        _kpi("licensed_sources", "Fuentes con licencia registrada", licensed, None, ORIGIN_MEASURED,
             "Fuentes del catálogo con licencia registrada.", len(licenses), now),
        _kpi("catalog_evidence_coverage", "Cobertura de evidencia del catálogo", coverage, "%", ORIGIN_DERIVED,
             "Afirmaciones con origen distinto de «desconocido» ÷ total de afirmaciones del catálogo × 100.",
             assertions, now),
    ]
    return PublicImpactOut(as_of=now, kpis=kpis)
