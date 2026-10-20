from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

NodeType = Literal["species", "cultivar", "trait", "source", "project", "crop_cycle", "prototype"]
Relation = Literal["designed_for", "related_to", "cites"]


class EdgeProvenanceIn(BaseModel):
    """Procedencia declarada por quien escribe; el autor lo añade el servicio."""

    model_config = ConfigDict(extra="forbid")

    source_id: str | None = Field(default=None, max_length=36)
    locator: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=300)


class EdgeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    src_type: NodeType
    src_id: str = Field(min_length=1, max_length=64)
    dst_type: NodeType
    dst_id: str = Field(min_length=1, max_length=64)
    relation: Relation
    provenance: EdgeProvenanceIn = Field(default_factory=EdgeProvenanceIn)


class GraphNodeOut(BaseModel):
    id: str
    type: NodeType
    label: str
    origin: str | None = None
    meta: dict[str, str | None] = Field(default_factory=dict)


class GraphEdgeOut(BaseModel):
    src: str
    dst: str
    relation: str
    # Una entrada por cada razón por la que existe la arista (kind: fk|assertion|evidence|external_id|edge)
    provenance: list[dict]


class GraphOut(BaseModel):
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]
    truncated: bool
