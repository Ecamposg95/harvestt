from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import RequestContext, get_context
from app.modules.graph import service
from app.modules.graph.schemas import GraphOut, NodeType

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("", response_model=GraphOut)
def get_graph(
    focus_type: NodeType | None = Query(default=None),
    focus_id: str | None = Query(default=None, min_length=1, max_length=64),
    depth: int = Query(default=2, ge=1, le=3),
    types: str | None = Query(default=None, max_length=200),
    ctx: RequestContext = Depends(get_context),
    db: Session = Depends(get_db),
):
    """Grafo de solo lectura: nodos globales + del tenant activo; máximo 300 nodos (`truncated` al cortar)."""
    return service.graph_view(db, ctx, focus_type, focus_id, depth, types)
