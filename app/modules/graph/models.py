"""Grafo de conocimiento. Los nodos se derivan al vuelo; solo las aristas explícitas se guardan aquí."""
from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, UUIDMixin

NODE_SPECIES = "species"
NODE_CULTIVAR = "cultivar"
NODE_TRAIT = "trait"
NODE_SOURCE = "source"
NODE_PROJECT = "project"
NODE_CROP_CYCLE = "crop_cycle"
NODE_PROTOTYPE = "prototype"
NODE_TYPES = (
    NODE_SPECIES,
    NODE_CULTIVAR,
    NODE_TRAIT,
    NODE_SOURCE,
    NODE_PROJECT,
    NODE_CROP_CYCLE,
    NODE_PROTOTYPE,
)
GLOBAL_NODE_TYPES = (NODE_SPECIES, NODE_CULTIVAR, NODE_TRAIT, NODE_SOURCE)
TENANT_NODE_TYPES = (NODE_PROJECT, NODE_CROP_CYCLE, NODE_PROTOTYPE)

# Vocabulario cerrado de aristas guardadas.
REL_DESIGNED_FOR = "designed_for"
REL_RELATED_TO = "related_to"
REL_CITES = "cites"
EDGE_RELATIONS = (REL_DESIGNED_FOR, REL_RELATED_TO, REL_CITES)

# Relaciones implícitas: se derivan de FKs al leer y nunca se guardan.
REL_CULTIVAR_OF = "cultivar_of"
REL_HAS_TRAIT = "has_trait"
REL_GROWS = "grows"
REL_HAS_CYCLE = "has_cycle"

MAX_NODES = 300
EDGE_RESOURCE = "graph_edge"


class GraphEdge(UUIDMixin, AuditMixin, Base):
    """Arista explícita entre dos nodos. organization_id NULL = global (solo superadmin la escribe)."""

    __tablename__ = "graph_edges"
    __table_args__ = (
        CheckConstraint("relation IN ('designed_for', 'related_to', 'cites')", name="ck_graph_edges_relation"),
        Index("ix_graph_edges_src", "src_type", "src_id"),
        Index("ix_graph_edges_dst", "dst_type", "dst_id"),
    )

    organization_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True, index=True
    )
    src_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # 64: los rasgos usan la variable como id (hasta 60 caracteres)
    src_id: Mapped[str] = mapped_column(String(64), nullable=False)
    dst_type: Mapped[str] = mapped_column(String(20), nullable=False)
    dst_id: Mapped[str] = mapped_column(String(64), nullable=False)
    relation: Mapped[str] = mapped_column(String(20), nullable=False)
    # {"author_id": "...", "source_id": "...", "locator": "p. 3", "note": "..."}
    provenance: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
