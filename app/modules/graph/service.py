"""Grafo de conocimiento.

Nodos derivados al vuelo de entidades reales: catálogo global y proyectos, ciclos y prototipos del tenant activo.
Aristas: FKs, afirmaciones con su evidencia, identificadores externos verificados y `GraphEdge` guardadas.
Nunca se inventan relaciones.
"""
from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.deps import RequestContext
from app.core.errors import AppError, forbidden, not_found, unprocessable
from app.core.tenant import scoped
from app.modules.catalog.models import ORIGINS, SUBJECT_TYPES, Cultivar, Source, Species, TraitAssertion
from app.modules.graph.models import (
    EDGE_RESOURCE,
    MAX_NODES,
    NODE_CROP_CYCLE,
    NODE_CULTIVAR,
    NODE_PROJECT,
    NODE_PROTOTYPE,
    NODE_SOURCE,
    NODE_SPECIES,
    NODE_TRAIT,
    NODE_TYPES,
    REL_CITES,
    REL_CULTIVAR_OF,
    REL_GROWS,
    REL_HAS_CYCLE,
    REL_HAS_TRAIT,
    TENANT_NODE_TYPES,
    GraphEdge,
)
from app.modules.graph.schemas import EdgeCreate, GraphEdgeOut, GraphNodeOut, GraphOut
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


# ---------- Lectura ----------

TRAIT_LABELS = {
    "air_temperature": "Temperatura del aire",
    "relative_humidity": "Humedad relativa",
    "photoperiod": "Fotoperiodo",
    "ph": "pH",
}
_ORIGIN_RANK = {origin: i for i, origin in enumerate(ORIGINS)}  # measured primero, missing al final
_TYPE_ORDER = {node_type: i for i, node_type in enumerate(NODE_TYPES)}


@dataclass
class Node:
    id: str
    type: str
    label: str
    origin: str | None = None
    meta: dict = field(default_factory=dict)


@dataclass
class Edge:
    src: str
    dst: str
    relation: str
    provenance: list[dict] = field(default_factory=list)


@dataclass
class Graph:
    nodes: dict[str, Node] = field(default_factory=dict)
    edges: dict[tuple[str, str, str], Edge] = field(default_factory=dict)

    def add_node(self, node: Node) -> None:
        self.nodes.setdefault(node.id, node)

    def add_edge(self, src: str, dst: str, relation: str, provenance: dict) -> None:
        """Solo une nodos visibles; la misma (src, dst, relación) acumula procedencias sin repetir."""
        if src == dst or src not in self.nodes or dst not in self.nodes:
            return
        edge = self.edges.setdefault((src, dst, relation), Edge(src, dst, relation))
        if provenance not in edge.provenance:
            edge.provenance.append(provenance)


def _species_label(species: Species) -> str:
    for name in species.common_names or []:
        if isinstance(name, dict) and name.get("lang") == "es" and name.get("name"):
            text = name["name"]
            return text[:1].upper() + text[1:]
    return species.scientific_name


def _add_catalog(db: Session, g: Graph) -> None:
    species = list(
        db.scalars(select(Species).where(Species.deleted_at.is_(None)).order_by(Species.scientific_name, Species.id))
    )
    for s in species:
        g.add_node(
            Node(node_id(NODE_SPECIES, s.id), NODE_SPECIES, _species_label(s), meta={"scientific_name": s.scientific_name})
        )

    cultivars = db.scalars(select(Cultivar).where(Cultivar.deleted_at.is_(None)).order_by(Cultivar.name, Cultivar.id))
    for c in cultivars:
        parent = node_id(NODE_SPECIES, c.species_id)
        if parent not in g.nodes:
            continue
        cid = node_id(NODE_CULTIVAR, c.id)
        g.add_node(Node(cid, NODE_CULTIVAR, c.name, meta={"species_id": c.species_id}))
        g.add_edge(cid, parent, REL_CULTIVAR_OF, {"kind": "fk", "field": "cultivars.species_id"})

    sources = db.scalars(select(Source).where(Source.deleted_at.is_(None)).order_by(Source.title, Source.id))
    for src in sources:
        g.add_node(Node(node_id(NODE_SOURCE, src.id), NODE_SOURCE, src.title, meta={"url": src.url, "license": src.license}))

    # Identidad taxonómica verificada (p. ej. GBIF): la especie cita la fuente de su identificador.
    for s in species:
        for system, ref in sorted((s.external_ids or {}).items()):
            if isinstance(ref, dict) and ref.get("source_id"):
                g.add_edge(
                    node_id(NODE_SPECIES, s.id),
                    node_id(NODE_SOURCE, ref["source_id"]),
                    REL_CITES,
                    {"kind": "external_id", "system": system, "external_id": ref.get("id"), "url": ref.get("url")},
                )

    origins: dict[str, list[str]] = defaultdict(list)
    assertions = db.scalars(
        select(TraitAssertion)
        .where(TraitAssertion.deleted_at.is_(None))
        .order_by(TraitAssertion.subject_id, TraitAssertion.variable, TraitAssertion.id)
    )
    for a in assertions:
        if a.subject_type not in SUBJECT_TYPES:
            continue
        subject = node_id(a.subject_type, a.subject_id)  # "species" y "cultivar" coinciden con los tipos de nodo
        if subject not in g.nodes:
            continue
        trait = node_id(NODE_TRAIT, a.variable)
        g.add_node(Node(trait, NODE_TRAIT, TRAIT_LABELS.get(a.variable, a.variable), meta={"variable": a.variable}))
        origins[trait].append(a.origin)
        g.add_edge(
            subject,
            trait,
            REL_HAS_TRAIT,
            {
                "kind": "assertion",
                "assertion_id": a.id,
                "origin": a.origin,
                "review_status": a.review_status,
                "growth_stage": a.growth_stage,
                "cultivation_system": a.cultivation_system,
            },
        )
        for ref in a.evidence_refs or []:
            if isinstance(ref, dict) and ref.get("source_id"):
                g.add_edge(
                    subject,
                    node_id(NODE_SOURCE, ref["source_id"]),
                    REL_CITES,
                    {"kind": "evidence", "assertion_id": a.id, "variable": a.variable, "locator": ref.get("locator")},
                )
    for trait, values in origins.items():
        g.nodes[trait].origin = min(values, key=lambda o: _ORIGIN_RANK.get(o, len(_ORIGIN_RANK)))


def _add_tenant(db: Session, ctx: RequestContext, g: Graph) -> None:
    for p in db.scalars(scoped(Project, ctx).order_by(Project.created_at, Project.id)):
        g.add_node(Node(node_id(NODE_PROJECT, p.id), NODE_PROJECT, p.name, meta={"system": p.system}))

    cycles = db.scalars(scoped(CropCycle, ctx).order_by(CropCycle.created_at, CropCycle.id)).unique()
    for c in cycles:
        project = node_id(NODE_PROJECT, c.project_id)
        if project not in g.nodes:
            continue
        species = g.nodes.get(node_id(NODE_SPECIES, c.species_id))
        label = f"Ciclo · {species.label if species else 'especie no disponible'}"
        if c.started_on:
            label += f" · {c.started_on.isoformat()}"
        cid = node_id(NODE_CROP_CYCLE, c.id)
        g.add_node(Node(cid, NODE_CROP_CYCLE, label, meta={"project_id": c.project_id, "status": c.status}))
        g.add_edge(project, cid, REL_HAS_CYCLE, {"kind": "fk", "field": "crop_cycles.project_id"})
        g.add_edge(cid, node_id(NODE_SPECIES, c.species_id), REL_GROWS, {"kind": "fk", "field": "crop_cycles.species_id"})
        if c.cultivar_id:
            g.add_edge(
                cid, node_id(NODE_CULTIVAR, c.cultivar_id), REL_GROWS, {"kind": "fk", "field": "crop_cycles.cultivar_id"}
            )

    for p in db.scalars(scoped(Prototype, ctx).order_by(Prototype.created_at, Prototype.id)):
        g.add_node(Node(node_id(NODE_PROTOTYPE, p.id), NODE_PROTOTYPE, p.name, meta={"status": p.status}))


def _add_stored_edges(db: Session, ctx: RequestContext, g: Graph) -> None:
    stored = db.scalars(
        select(GraphEdge)
        .where(
            GraphEdge.deleted_at.is_(None),
            or_(GraphEdge.organization_id.is_(None), GraphEdge.organization_id == ctx.organization_id),
        )
        .order_by(GraphEdge.created_at, GraphEdge.id)
    )
    for e in stored:
        is_global = e.organization_id is None
        # Defensa: una arista global nunca toca datos privados, aunque la fila exista.
        if is_global and (e.src_type in TENANT_NODE_TYPES or e.dst_type in TENANT_NODE_TYPES):
            continue
        g.add_edge(
            node_id(e.src_type, e.src_id),
            node_id(e.dst_type, e.dst_id),
            e.relation,
            {**(e.provenance or {}), "kind": "edge", "edge_id": e.id, "scope": "global" if is_global else "organization"},
        )


def build_graph(db: Session, ctx: RequestContext) -> Graph:
    """Grafo visible para el tenant activo: catálogo global + datos propios + aristas guardadas visibles."""
    g = Graph()
    _add_catalog(db, g)
    _add_tenant(db, ctx, g)
    _add_stored_edges(db, ctx, g)
    return g


def select_subgraph(
    g: Graph, focus: str | None, depth: int, types: set[str] | None, limit: int = MAX_NODES
) -> tuple[list[Node], list[Edge], bool]:
    allowed = types or set(NODE_TYPES)
    adjacency: dict[str, set[str]] = defaultdict(set)
    for src, dst, _ in g.edges:
        adjacency[src].add(dst)
        adjacency[dst].add(src)

    def order(nid: str) -> tuple:
        n = g.nodes[nid]
        return (_TYPE_ORDER[n.type], n.label.casefold(), n.id)

    if focus is None:
        candidates = sorted(
            (n.id for n in g.nodes.values() if n.type in allowed),
            key=lambda nid: (-len(adjacency[nid]), *order(nid)),
        )
    else:
        candidates, seen, frontier = [focus], {focus}, [focus]
        for _ in range(depth):
            following = []
            for current in frontier:
                for other in sorted(adjacency[current], key=order):
                    if other in seen or g.nodes[other].type not in allowed:
                        continue
                    seen.add(other)
                    following.append(other)
                    candidates.append(other)
            frontier = following

    truncated = len(candidates) > limit
    kept = candidates[:limit]
    kept_set = set(kept)
    edges = sorted(
        (e for e in g.edges.values() if e.src in kept_set and e.dst in kept_set),
        key=lambda e: (kept.index(e.src), kept.index(e.dst), e.relation),
    )
    return [g.nodes[nid] for nid in kept], edges, truncated


def parse_types(raw: str | None) -> set[str] | None:
    if raw is None or not raw.strip():
        return None
    parts = {p.strip() for p in raw.split(",") if p.strip()}
    unknown = sorted(parts - set(NODE_TYPES))
    if unknown:
        raise unprocessable("Tipo de nodo desconocido", {"field": "types", "unknown": unknown})
    return parts


def graph_view(
    db: Session,
    ctx: RequestContext,
    focus_type: str | None,
    focus_id: str | None,
    depth: int,
    types_raw: str | None,
) -> GraphOut:
    if focus_type is not None and focus_id is None:
        raise unprocessable("Indica focus_id junto con focus_type", {"field": "focus_id"})
    if focus_id is not None and focus_type is None:
        raise unprocessable("Indica focus_type junto con focus_id", {"field": "focus_type"})
    types = parse_types(types_raw)
    g = build_graph(db, ctx)
    focus = None
    if focus_type is not None and focus_id is not None:
        focus = node_id(focus_type, focus_id)
        if focus not in g.nodes:
            raise not_found("nodo")
    nodes, edges, truncated = select_subgraph(g, focus, depth, types)
    return GraphOut(
        nodes=[GraphNodeOut(id=n.id, type=n.type, label=n.label, origin=n.origin, meta=n.meta) for n in nodes],
        edges=[GraphEdgeOut(src=e.src, dst=e.dst, relation=e.relation, provenance=e.provenance) for e in edges],
        truncated=truncated,
    )
