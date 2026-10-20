"""Layout del Studio: lectura y reemplazo completo con versión (409 si no coincide)."""
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.core.errors import AppError, conflict, unprocessable
from app.core.mixins import utcnow
from app.core.tenant import scoped
from app.modules.catalog.models import Species
from app.modules.projects.models import CropCycle, Project
from app.modules.studio.models import MAX_PLACEMENTS, MAX_ZONES, Placement, Zone
from app.modules.studio.schemas import FloorOut, LayoutIn, LayoutOut, PlacementOut, ZoneOut

RESOURCE = "studio_layout"
EPS = 1e-6
ILLUSTRATIVE_FLOOR_M = 10.0


def floor_bounds(project: Project) -> tuple[float, float] | None:
    """Piso del proyecto: cuadrado de lado √área anclado en (0, 0). Sin área no hay límite."""
    if project.area_m2 is None:
        return None
    side = math.sqrt(project.area_m2)
    return side, side


def _out_of_bounds(message: str, path: str, width: float, depth: float) -> AppError:
    return AppError(422, "layout_out_of_bounds", message, {"path": path, "bounds": {"width": width, "depth": depth}})


def _zones(db: Session, ctx: RequestContext, project: Project) -> list[Zone]:
    stmt = scoped(Zone, ctx).where(Zone.project_id == project.id).order_by(Zone.sort_order, Zone.created_at)
    return list(db.scalars(stmt))


def _placements(db: Session, ctx: RequestContext, project: Project) -> list[Placement]:
    stmt = (
        scoped(Placement, ctx)
        .where(Placement.project_id == project.id)
        .order_by(Placement.sort_order, Placement.created_at)
    )
    return list(db.scalars(stmt))


def get_layout(db: Session, ctx: RequestContext, project: Project) -> LayoutOut:
    zones = _zones(db, ctx, project)
    placements = _placements(db, ctx, project)
    species_ids = {p.species_id for p in placements}
    names = (
        {s.id: s.scientific_name for s in db.scalars(select(Species).where(Species.id.in_(species_ids)))}
        if species_ids
        else {}
    )
    by_zone: dict[str, list[PlacementOut]] = {}
    for p in placements:
        by_zone.setdefault(p.zone_id, []).append(
            PlacementOut(
                id=p.id,
                zone_id=p.zone_id,
                species_id=p.species_id,
                species_name=names.get(p.species_id, ""),
                crop_cycle_id=p.crop_cycle_id,
                stage=p.stage,
                x=p.x,
                y=p.y,
                rotation=p.rotation,
            )
        )
    bounds = floor_bounds(project)
    if bounds:
        floor = FloorOut(width=bounds[0], depth=bounds[1], illustrative=False)
    else:
        floor = FloorOut(
            width=max([ILLUSTRATIVE_FLOOR_M] + [z.x + z.width for z in zones]),
            depth=max([ILLUSTRATIVE_FLOOR_M] + [z.y + z.depth for z in zones]),
            illustrative=True,
        )
    return LayoutOut(
        project_id=project.id,
        version=project.layout_version,
        area_m2=project.area_m2,
        floor=floor,
        zones=[
            ZoneOut(id=z.id, name=z.name, x=z.x, y=z.y, width=z.width, depth=z.depth, placements=by_zone.get(z.id, []))
            for z in zones
        ],
    )


def _validate(db: Session, ctx: RequestContext, project: Project, data: LayoutIn) -> None:
    total = sum(len(z.placements) for z in data.zones)
    if len(data.zones) > MAX_ZONES or total > MAX_PLACEMENTS:
        raise AppError(
            422,
            "layout_limit",
            f"Máximo {MAX_ZONES} zonas y {MAX_PLACEMENTS} plantas por layout",
            {"max_zones": MAX_ZONES, "max_placements": MAX_PLACEMENTS},
        )
    bounds = floor_bounds(project)
    cycles = {c.id: c for c in db.scalars(scoped(CropCycle, ctx).where(CropCycle.project_id == project.id)).unique()}
    wanted = {p.species_id for z in data.zones for p in z.placements}
    known = (
        set(db.scalars(select(Species.id).where(Species.id.in_(wanted), Species.deleted_at.is_(None))))
        if wanted
        else set()
    )
    for i, zone in enumerate(data.zones):
        if bounds and (zone.x + zone.width > bounds[0] + EPS or zone.y + zone.depth > bounds[1] + EPS):
            raise _out_of_bounds(
                f"La zona «{zone.name}» queda fuera del área del proyecto ({bounds[0]:.2f} × {bounds[1]:.2f} m)",
                f"zones.{i}",
                bounds[0],
                bounds[1],
            )
        for j, p in enumerate(zone.placements):
            path = f"zones.{i}.placements.{j}"
            if p.x > zone.width + EPS or p.y > zone.depth + EPS:
                raise _out_of_bounds(f"Una planta queda fuera de la zona «{zone.name}»", path, zone.width, zone.depth)
            if p.species_id not in known:
                raise unprocessable("La especie no existe", {"path": path, "field": "species_id"})
            if p.crop_cycle_id is not None:
                cycle = cycles.get(p.crop_cycle_id)
                if cycle is None:
                    raise unprocessable("El ciclo no pertenece a este proyecto", {"path": path, "field": "crop_cycle_id"})
                if cycle.species_id != p.species_id:
                    raise unprocessable("La especie no coincide con la del ciclo", {"path": path, "field": "species_id"})


def replace_layout(db: Session, ctx: RequestContext, project: Project, data: LayoutIn) -> LayoutOut:
    # Bloquea la fila del proyecto (Postgres) para que dos PUT con la misma versión no pasen ambos.
    project = db.scalar(
        select(Project).where(Project.id == project.id).with_for_update().execution_options(populate_existing=True)
    )
    if data.version != project.layout_version:
        raise conflict("El layout cambió en otra sesión; recarga para ver la versión actual")
    _validate(db, ctx, project, data)

    now = utcnow()
    for old in _placements(db, ctx, project):
        old.deleted_at = now
    for old in _zones(db, ctx, project):
        old.deleted_at = now
    for i, zone in enumerate(data.zones):
        row = Zone(
            organization_id=ctx.organization_id,
            project_id=project.id,
            name=zone.name,
            x=zone.x,
            y=zone.y,
            width=zone.width,
            depth=zone.depth,
            sort_order=i,
        )
        db.add(row)
        db.flush()
        for j, p in enumerate(zone.placements):
            db.add(
                Placement(
                    organization_id=ctx.organization_id,
                    project_id=project.id,
                    zone_id=row.id,
                    crop_cycle_id=p.crop_cycle_id,
                    species_id=p.species_id,
                    stage=p.stage,
                    x=p.x,
                    y=p.y,
                    rotation=p.rotation,
                    sort_order=j,
                )
            )
    project.layout_version += 1
    record(
        db,
        ctx,
        RESOURCE,
        project.id,
        "replace",
        {"version": project.layout_version, "zones": len(data.zones), "placements": sum(len(z.placements) for z in data.zones)},
    )
    db.commit()
    return get_layout(db, ctx, project)
