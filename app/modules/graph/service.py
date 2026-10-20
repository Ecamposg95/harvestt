"""Grafo de conocimiento.

Nodos derivados al vuelo de entidades reales: catálogo global y proyectos, ciclos y prototipos del tenant activo.
Aristas: FKs, afirmaciones con su evidencia, identificadores externos verificados y `GraphEdge` guardadas.
Nunca se inventan relaciones.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.errors import AppError, forbidden, unprocessable
from app.modules.catalog.models import Cultivar, Source, Species, TraitAssertion
from app.modules.graph.models import (
    EDGE_RESOURCE,
    NODE_CROP_CYCLE,
    NODE_CULTIVAR,
    NODE_PROJECT,
    NODE_PROTOTYPE,
    NODE_SOURCE,
    NODE_SPECIES,
    NODE_TRAIT,
    TENANT_NODE_TYPES,
    GraphEdge,
)
from app.modules.graph.schemas import EdgeCreate
from app.modules.identity.models import MEMBERSHIP_ACTIVE, ROLE_EDITOR, ROLE_RANK, Membership, User
from app.modules.projects.models import CropCycle, Project
from app.modules.prototypes.models import Prototype

_MODELS = {
    NODE_SPECIES: Species,
    NODE_CULTIVAR: Cultivar,
    NODE_SOURCE: Source,
    NODE_PROJECT: Project,
    NODE_CROP_CYCLE: CropCycle,
    NODE_PROTOTYPE: Prototype,
}


def node_id(node_type: str, raw_id: str) -> str:
    return f"{node_type}:{raw_id}"


# ---------- Escritura (sin endpoint HTTP en V6: la edición del grafo está fuera de alcance) ----------


def _can_write(db: Session, actor: User, organization_id: str | None) -> bool:
    if actor.is_superadmin:
        return True
    if organization_id is None:
        return False
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == actor.id,
            Membership.organization_id == organization_id,
            Membership.status == MEMBERSHIP_ACTIVE,
            Membership.deleted_at.is_(None),
        )
    )
    return membership is not None and ROLE_RANK[membership.role] >= ROLE_RANK[ROLE_EDITOR]


def _node_exists(db: Session, organization_id: str | None, node_type: str, raw_id: str) -> bool:
    if node_type == NODE_TRAIT:
        stmt = select(TraitAssertion.id).where(
            TraitAssertion.variable == raw_id, TraitAssertion.deleted_at.is_(None)
        )
        return db.scalar(stmt.limit(1)) is not None
    model = _MODELS[node_type]
    stmt = select(model.id).where(model.id == raw_id, model.deleted_at.is_(None))
    if node_type in TENANT_NODE_TYPES:
        stmt = stmt.where(model.organization_id == organization_id)
    return db.scalar(stmt) is not None


def create_edge(db: Session, actor: User, organization_id: str | None, data: EdgeCreate) -> GraphEdge:
    """Crea una arista guardada. Global (organization_id None) solo superadmin y solo entre nodos globales."""
    if organization_id is None and not actor.is_superadmin:
        raise forbidden("Solo un superadmin puede crear relaciones globales")
    if not _can_write(db, actor, organization_id):
        raise forbidden()
    if organization_id is None:
        for side, node_type in (("src_type", data.src_type), ("dst_type", data.dst_type)):
            if node_type in TENANT_NODE_TYPES:
                raise unprocessable("Una relación global solo puede unir nodos globales", {"field": side})
    if (data.src_type, data.src_id) == (data.dst_type, data.dst_id):
        raise unprocessable("Un nodo no puede relacionarse consigo mismo", {"field": "dst_id"})
    for side, node_type, raw_id in (("src_id", data.src_type, data.src_id), ("dst_id", data.dst_type, data.dst_id)):
        if not _node_exists(db, organization_id, node_type, raw_id):
            raise unprocessable("El nodo no existe o no es visible", {"field": side})
    provenance = data.provenance.model_dump(exclude_none=True)
    if "source_id" in provenance and not _node_exists(db, organization_id, NODE_SOURCE, provenance["source_id"]):
        raise unprocessable("La fuente citada no existe", {"field": "provenance.source_id"})

    scope = GraphEdge.organization_id.is_(None) if organization_id is None else GraphEdge.organization_id == organization_id
    duplicate = db.scalar(
        select(GraphEdge.id).where(
            scope,
            GraphEdge.deleted_at.is_(None),
            GraphEdge.src_type == data.src_type,
            GraphEdge.src_id == data.src_id,
            GraphEdge.dst_type == data.dst_type,
            GraphEdge.dst_id == data.dst_id,
            GraphEdge.relation == data.relation,
        )
    )
    if duplicate:
        raise AppError(409, "edge_exists", "La relación ya existe")

    edge = GraphEdge(
        organization_id=organization_id,
        src_type=data.src_type,
        src_id=data.src_id,
        dst_type=data.dst_type,
        dst_id=data.dst_id,
        relation=data.relation,
        provenance={**provenance, "author_id": actor.id},
    )
    db.add(edge)
    db.flush()
    event = record(
        db,
        None,
        EDGE_RESOURCE,
        edge.id,
        "create",
        {
            "relation": data.relation,
            "src": node_id(data.src_type, data.src_id),
            "dst": node_id(data.dst_type, data.dst_id),
        },
    )
    # record() toma org y actor del contexto HTTP; aquí no hay request.
    event.organization_id = organization_id
    event.actor_id = actor.id
    db.commit()
    db.refresh(edge)
    return edge
