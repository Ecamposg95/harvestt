from typing import get_args

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.core.errors import AppError
from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Source, Species
from app.modules.graph import service
from app.modules.graph.models import EDGE_RELATIONS, NODE_TYPES, GraphEdge
from app.modules.graph.schemas import EdgeCreate, NodeType, Relation
from app.modules.identity.models import User
from scripts.seed import SEEDS
from tests.conftest import make_member

API = "/api/v1"


@pytest.fixture
def catalog(db):
    catalog_seed.seed(db)
    db.commit()
    species = {s.scientific_name: s for s in db.scalars(select(Species))}
    return {
        "lettuce": species["Lactuca sativa L."].id,
        "tomato": species["Solanum lycopersicum L."].id,
        "gbif": db.scalar(select(Source)).id,
    }


def user(db, email: str) -> User:
    return db.scalar(select(User).where(User.email == email))


def superadmin(db) -> User:
    _, root = make_member(db, "alfa", "root@alfa.test", "admin", superadmin=True)
    return root


def proto(client, headers, name="Germinador G1") -> str:
    res = client.post(f"{API}/prototypes", json={"name": name, "purpose": "Germinar semillas"}, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def edge(src_type, src_id, dst_type, dst_id, relation="designed_for", **provenance) -> EdgeCreate:
    return EdgeCreate(
        src_type=src_type, src_id=src_id, dst_type=dst_type, dst_id=dst_id, relation=relation, provenance=provenance
    )


def test_schema_literals_match_constants():
    assert set(get_args(NodeType)) == set(NODE_TYPES)
    assert set(get_args(Relation)) == set(EDGE_RELATIONS) == {"designed_for", "related_to", "cites"}


def test_superadmin_writes_global_edge_and_it_is_audited(db, tenants, catalog):
    root = superadmin(db)
    created = service.create_edge(
        db, root, None, edge("species", catalog["lettuce"], "species", catalog["tomato"], "related_to", note="Misma bandeja")
    )
    assert created.organization_id is None and created.relation == "related_to"
    assert created.provenance == {"note": "Misma bandeja", "author_id": root.id}
    event = db.scalar(select(AuditEvent).where(AuditEvent.resource_type == "graph_edge"))
    assert event.resource_id == created.id and event.operation == "create"
    assert event.actor_id == root.id and event.organization_id is None


def test_only_superadmin_writes_global(db, tenants, catalog):
    for email in ("admin@alfa.test", "editor@alfa.test", "viewer@beta.test"):
        with pytest.raises(AppError) as exc:
            service.create_edge(db, user(db, email), None, edge("species", catalog["lettuce"], "source", catalog["gbif"], "cites"))
        assert exc.value.status_code == 403, email
    assert db.scalar(select(func.count()).select_from(GraphEdge)) == 0


def test_global_edge_cannot_touch_tenant_nodes(db, client, tenants, catalog):
    root = superadmin(db)
    pid = proto(client, tenants["alfa_editor"])
    with pytest.raises(AppError) as exc:
        service.create_edge(db, root, None, edge("prototype", pid, "species", catalog["lettuce"]))
    assert exc.value.status_code == 422 and exc.value.details["field"] == "src_type"
    with pytest.raises(AppError) as exc:
        service.create_edge(db, root, None, edge("species", catalog["lettuce"], "prototype", pid, "related_to"))
    assert exc.value.status_code == 422 and exc.value.details["field"] == "dst_type"
    assert db.scalar(select(func.count()).select_from(GraphEdge)) == 0


def test_tenant_edge_needs_editor_of_that_org(db, client, tenants, catalog):
    alfa = tenants["alfa_org"].id
    pid = proto(client, tenants["alfa_editor"])
    editor = user(db, "editor@alfa.test")
    created = service.create_edge(
        db, editor, alfa, edge("prototype", pid, "species", catalog["lettuce"], note="Bandeja para lechuga")
    )
    assert created.organization_id == alfa
    assert created.provenance == {"note": "Bandeja para lechuga", "author_id": editor.id}
    for email in ("viewer@alfa.test", "editor@beta.test", "admin@beta.test"):
        with pytest.raises(AppError) as exc:
            service.create_edge(db, user(db, email), alfa, edge("prototype", pid, "species", catalog["tomato"]))
        assert exc.value.status_code == 403, email
    # Un superadmin puede escribir en cualquier organización
    assert service.create_edge(db, superadmin(db), alfa, edge("prototype", pid, "species", catalog["tomato"])).id


def test_tenant_edge_cannot_point_to_other_tenant(db, client, tenants, catalog):
    beta_proto = proto(client, tenants["beta_editor"], "Proto beta")
    alfa_proto = proto(client, tenants["alfa_editor"])
    with pytest.raises(AppError) as exc:
        service.create_edge(
            db, user(db, "editor@alfa.test"), tenants["alfa_org"].id,
            edge("prototype", alfa_proto, "prototype", beta_proto, "related_to"),
        )
    assert exc.value.status_code == 422 and exc.value.details["field"] == "dst_id"


def test_rejects_unknown_nodes_self_loops_bad_source_and_duplicates(db, client, tenants, catalog):
    editor = user(db, "editor@alfa.test")
    alfa = tenants["alfa_org"].id
    pid = proto(client, tenants["alfa_editor"])
    cases = [
        (edge("prototype", pid, "species", "no-existe"), "dst_id"),
        (edge("trait", "inventado", "source", catalog["gbif"], "cites"), "src_id"),
        (edge("prototype", pid, "prototype", pid, "related_to"), "dst_id"),
        (edge("prototype", pid, "species", catalog["lettuce"], source_id="no-existe"), "provenance.source_id"),
    ]
    for body, field in cases:
        with pytest.raises(AppError) as exc:
            service.create_edge(db, editor, alfa, body)
        assert exc.value.status_code == 422 and exc.value.details["field"] == field, field
    # Un rasgo existe si hay alguna afirmación con esa variable
    assert service.create_edge(db, editor, alfa, edge("trait", "photoperiod", "source", catalog["gbif"], "cites")).id
    service.create_edge(db, editor, alfa, edge("prototype", pid, "species", catalog["lettuce"], source_id=catalog["gbif"]))
    with pytest.raises(AppError) as exc:
        service.create_edge(db, editor, alfa, edge("prototype", pid, "species", catalog["lettuce"]))
    assert exc.value.status_code == 409 and exc.value.code == "edge_exists"


def test_closed_vocabulary_and_provenance_shape():
    base = {"src_type": "species", "src_id": "a", "dst_type": "source", "dst_id": "b", "relation": "cites"}
    with pytest.raises(ValidationError):
        EdgeCreate(**{**base, "relation": "eats"})
    with pytest.raises(ValidationError):
        EdgeCreate(**{**base, "src_type": "planet"})
    with pytest.raises(ValidationError):
        EdgeCreate(**{**base, "provenance": {"author_id": "x"}})  # el autor lo pone el servicio
    with pytest.raises(ValidationError):
        EdgeCreate(**{**base, "provenance": {"note": "n" * 301}})


def test_seeds_create_no_edges(db):
    for module in SEEDS:
        module.seed(db)
        db.commit()
    assert db.scalar(select(func.count()).select_from(GraphEdge)) == 0
