from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.core.errors import conflict, unprocessable
from app.core.tenant import get_scoped_or_404, scoped
from app.modules.catalog.models import Cultivar, Species
from app.modules.projects.models import CropCycle, Observation, Project
from app.modules.projects.schemas import (
    CropCycleCreate,
    CropCycleOut,
    ObservationCreate,
    ObservationOut,
    ProjectCreate,
    ProjectDetail,
    ProjectOut,
    ProjectUpdate,
)

UPDATABLE_FIELDS = ("name", "objectives", "area_m2", "system", "location")


def _paginate(db: Session, stmt, page: int, page_size: int):
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = list(db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).unique())
    return items, total


def get_project(db: Session, ctx: RequestContext, project_id: str) -> Project:
    return get_scoped_or_404(db, Project, project_id, ctx, "proyecto")


def list_projects(db: Session, ctx: RequestContext, page: int, page_size: int):
    stmt = scoped(Project, ctx).order_by(Project.updated_at.desc(), Project.id)
    return _paginate(db, stmt, page, page_size)


def create_project(db: Session, ctx: RequestContext, data: ProjectCreate) -> Project:
    project = Project(organization_id=ctx.organization_id, version=1, **data.model_dump())
    db.add(project)
    db.flush()
    record(db, ctx, "project", project.id, "create", data.model_dump(mode="json"))
    db.commit()
    return project


def update_project(db: Session, ctx: RequestContext, project: Project, data: ProjectUpdate) -> Project:
    if data.version != project.version:
        raise conflict("El proyecto fue modificado por otra persona; recarga para ver la versión actual")
    changes = {}
    for field in UPDATABLE_FIELDS:
        if field in data.model_fields_set:
            new = getattr(data, field)
            old = getattr(project, field)
            if new != old:
                changes[field] = {"from": old, "to": new}
                setattr(project, field, new)
    project.version += 1
    project.updated_at = datetime.now(timezone.utc)
    record(db, ctx, "project", project.id, "update", {"changes": changes, "version": project.version})
    db.commit()
    return project


def crop_cycle_out(cycle: CropCycle) -> CropCycleOut:
    return CropCycleOut(
        id=cycle.id,
        project_id=cycle.project_id,
        species_id=cycle.species_id,
        species_name=cycle.species.scientific_name,
        cultivar_id=cycle.cultivar_id,
        cultivar_name=cycle.cultivar.name if cycle.cultivar else None,
        started_on=cycle.started_on,
        stage=cycle.stage,
        status=cycle.status,
        created_at=cycle.created_at,
    )


def project_detail(db: Session, ctx: RequestContext, project: Project) -> ProjectDetail:
    cycles = db.scalars(
        scoped(CropCycle, ctx).where(CropCycle.project_id == project.id).order_by(CropCycle.created_at)
    ).unique()
    return ProjectDetail(
        **ProjectOut.model_validate(project).model_dump(),
        crop_cycles=[crop_cycle_out(c) for c in cycles],
    )


def create_crop_cycle(db: Session, ctx: RequestContext, project: Project, data: CropCycleCreate) -> CropCycle:
    species = db.get(Species, data.species_id)
    if species is None or species.deleted_at is not None:
        raise unprocessable("La especie no existe", {"field": "species_id"})
    if data.cultivar_id:
        cultivar = db.get(Cultivar, data.cultivar_id)
        if cultivar is None or cultivar.deleted_at is not None or cultivar.species_id != species.id:
            raise unprocessable("La variedad no pertenece a la especie indicada", {"field": "cultivar_id"})
    cycle = CropCycle(organization_id=ctx.organization_id, project_id=project.id, **data.model_dump())
    db.add(cycle)
    db.flush()
    record(db, ctx, "crop_cycle", cycle.id, "create", {"project_id": project.id, **data.model_dump(mode="json")})
    db.commit()
    db.refresh(cycle)
    return cycle


def observation_out(obs: Observation) -> ObservationOut:
    author = obs.author
    return ObservationOut(
        id=obs.id,
        project_id=obs.project_id,
        crop_cycle_id=obs.crop_cycle_id,
        kind=obs.kind,
        content=obs.content,
        author_id=obs.author_id,
        author_name=(author.full_name or author.email) if author else "",
        observed_at=obs.observed_at,
        created_at=obs.created_at,
    )


def list_observations(db: Session, ctx: RequestContext, project: Project, page: int, page_size: int):
    stmt = (
        scoped(Observation, ctx)
        .where(Observation.project_id == project.id)
        .order_by(Observation.observed_at.desc(), Observation.created_at.desc())
    )
    return _paginate(db, stmt, page, page_size)


def create_observation(
    db: Session, ctx: RequestContext, project: Project, data: ObservationCreate
) -> Observation:
    if data.crop_cycle_id:
        cycle = db.scalar(
            scoped(CropCycle, ctx).where(CropCycle.id == data.crop_cycle_id, CropCycle.project_id == project.id)
        )
        if cycle is None:
            raise unprocessable("El ciclo de cultivo no pertenece a este proyecto", {"field": "crop_cycle_id"})
    obs = Observation(
        organization_id=ctx.organization_id,
        project_id=project.id,
        crop_cycle_id=data.crop_cycle_id,
        kind=data.kind,
        content=data.content,
        author_id=ctx.user.id,
        observed_at=data.observed_at or datetime.now(timezone.utc),
    )
    db.add(obs)
    db.flush()
    record(
        db,
        ctx,
        "observation",
        obs.id,
        "create",
        {"project_id": project.id, "kind": obs.kind, "crop_cycle_id": obs.crop_cycle_id},
    )
    db.commit()
    db.refresh(obs)
    return obs
