import pytest
from sqlalchemy import select

from app.core.mixins import utcnow
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Cultivar, Source, Species, TraitAssertion
from app.modules.graph import service
from app.modules.graph.models import MAX_NODES, GraphEdge
from app.modules.graph.schemas import EdgeCreate
from tests.conftest import make_member

API = "/api/v1"
GRAPH = f"{API}/graph"


@pytest.fixture
def species(db):
    catalog_seed.seed(db)
    db.commit()
    return {s.scientific_name: s for s in db.scalars(select(Species))}


def graph(client, headers, **params):
    res = client.get(GRAPH, params=params, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def edge_map(body):
    return {(e["src"], e["dst"], e["relation"]): e for e in body["edges"]}


def tenant_data(client, headers, species_id, name, cultivar_id=None):
    project = client.post(f"{API}/projects", json={"name": name}, headers=headers)
    assert project.status_code == 201, project.text
    pid = project.json()["id"]
    cycle = client.post(
        f"{API}/projects/{pid}/crop-cycles",
        json={"species_id": species_id, "cultivar_id": cultivar_id},
        headers=headers,
    )
    assert cycle.status_code == 201, cycle.text
    proto = client.post(f"{API}/prototypes", json={"name": f"Proto {name}", "purpose": "Germinar"}, headers=headers)
    assert proto.status_code == 201, proto.text
    return {"project": pid, "cycle": cycle.json()["id"], "prototype": proto.json()["id"]}


# ---- Contrato y datos del seed ----


def test_requires_auth_and_has_no_write_endpoints(client, tenants):
    assert client.get(GRAPH).status_code == 401
    h = tenants["alfa_admin"]
    assert client.post(GRAPH, json={}, headers=h).status_code == 405
    assert client.patch(GRAPH, json={}, headers=h).status_code == 405
    assert client.delete(GRAPH, headers=h).status_code == 405


def test_seed_catalog_graph(client, tenants, species):
    body = graph(client, tenants["alfa_viewer"])
    types = sorted(n["type"] for n in body["nodes"])
    assert types == ["source"] + ["species"] * 3 + ["trait"] * 4
    assert body["truncated"] is False
    relations = sorted(e["relation"] for e in body["edges"])
    assert relations == ["cites"] * 3 + ["has_trait"] * 12
    nodes = {n["id"]: n for n in body["nodes"]}
    lettuce = species["Lactuca sativa L."]
    assert nodes[f"species:{lettuce.id}"]["label"] == "Lechuga"
    assert nodes[f"species:{lettuce.id}"]["meta"]["scientific_name"] == "Lactuca sativa L."
    assert nodes["trait:ph"]["label"] == "pH" and nodes["trait:ph"]["origin"] == "missing"
    gbif_edge = next(e for e in body["edges"] if e["relation"] == "cites" and e["src"] == f"species:{lettuce.id}")
    assert gbif_edge["provenance"][0]["kind"] == "external_id"
    assert gbif_edge["provenance"][0]["external_id"] == "7403263"
    # Ninguna arista guardada: todo sale de datos reales
    assert not any(p["kind"] == "edge" for e in body["edges"] for p in e["provenance"])


def test_implicit_edges_from_real_data(client, db, tenants, species):
    lettuce = species["Lactuca sativa L."]
    cultivar = Cultivar(species_id=lettuce.id, name="Grand Rapids")
    paper = Source(title="Manual de hidroponía", url="https://example.org/manual", license="CC BY 4.0")
    db.add_all([cultivar, paper])
    db.flush()
    assertion = TraitAssertion(
        subject_type="species",
        subject_id=lettuce.id,
        variable="photoperiod",
        origin="sourced",
        review_status="approved",
        evidence_refs=[{"source_id": paper.id, "locator": "p. 12"}],
    )
    db.add(assertion)
    db.commit()
    data = tenant_data(client, tenants["alfa_editor"], lettuce.id, "Invernadero norte", cultivar_id=cultivar.id)

    body = graph(client, tenants["alfa_viewer"])
    edges = edge_map(body)
    nodes = {n["id"]: n for n in body["nodes"]}
    L = f"species:{lettuce.id}"
    C = f"cultivar:{cultivar.id}"
    cycle = f"crop_cycle:{data['cycle']}"

    assert edges[(C, L, "cultivar_of")]["provenance"] == [{"kind": "fk", "field": "cultivars.species_id"}]
    has_trait = edges[(L, "trait:photoperiod", "has_trait")]["provenance"]
    assert sorted(p["origin"] for p in has_trait) == ["missing", "sourced"]
    assert edges[(L, f"source:{paper.id}", "cites")]["provenance"] == [
        {"kind": "evidence", "assertion_id": assertion.id, "variable": "photoperiod", "locator": "p. 12"}
    ]
    assert edges[(cycle, L, "grows")]["provenance"] == [{"kind": "fk", "field": "crop_cycles.species_id"}]
    assert edges[(cycle, C, "grows")]["provenance"] == [{"kind": "fk", "field": "crop_cycles.cultivar_id"}]
    assert edges[(f"project:{data['project']}", cycle, "has_cycle")]["provenance"] == [
        {"kind": "fk", "field": "crop_cycles.project_id"}
    ]
    # El rasgo toma el mejor origen de sus afirmaciones
    assert nodes["trait:photoperiod"]["origin"] == "sourced"
    assert nodes[C]["meta"]["species_id"] == lettuce.id
    assert nodes[cycle]["label"] == "Ciclo · Lechuga"
    assert nodes[cycle]["meta"]["project_id"] == data["project"]
    assert nodes[f"source:{paper.id}"]["meta"]["url"] == "https://example.org/manual"
    assert nodes[f"prototype:{data['prototype']}"]["label"] == "Proto Invernadero norte"
    # El prototipo no tiene aristas: nada lo relaciona todavía y no se inventa
    assert not any(f"prototype:{data['prototype']}" in (e["src"], e["dst"]) for e in body["edges"])


def test_deleted_entities_are_excluded(client, db, tenants, species):
    lettuce = species["Lactuca sativa L."]
    cultivar = Cultivar(species_id=lettuce.id, name="Retirado")
    db.add(cultivar)
    db.commit()
    data = tenant_data(client, tenants["alfa_editor"], lettuce.id, "Norte")
    assert client.delete(f"{API}/prototypes/{data['prototype']}", headers=tenants["alfa_editor"]).status_code == 204
    db.get(Cultivar, cultivar.id).deleted_at = utcnow()
    db.commit()
    ids = {n["id"] for n in graph(client, tenants["alfa_viewer"])["nodes"]}
    assert f"prototype:{data['prototype']}" not in ids
    assert f"cultivar:{cultivar.id}" not in ids
    assert f"project:{data['project']}" in ids


# ---- Aislamiento por tenant (spec §9 V6) ----


def test_never_includes_other_tenant_nodes(client, db, tenants, species):
    lettuce = species["Lactuca sativa L."].id
    alfa = tenant_data(client, tenants["alfa_editor"], lettuce, "Norte alfa")
    beta = tenant_data(client, tenants["beta_editor"], lettuce, "Sur beta")
    # Arista maliciosa guardada en alfa que apunta a un prototipo de beta (insertada sin pasar por el servicio)
    db.add(
        GraphEdge(
            organization_id=tenants["alfa_org"].id,
            src_type="prototype", src_id=alfa["prototype"],
            dst_type="prototype", dst_id=beta["prototype"],
            relation="related_to", provenance={"note": "fuga"},
        )
    )
    # Arista privada de beta
    db.add(
        GraphEdge(
            organization_id=tenants["beta_org"].id,
            src_type="prototype", src_id=beta["prototype"],
            dst_type="species", dst_id=lettuce,
            relation="designed_for", provenance={},
        )
    )
    db.commit()

    res = client.get(GRAPH, headers=tenants["alfa_viewer"])
    assert res.status_code == 200
    for raw in beta.values():
        assert raw not in res.text
    assert "Sur beta" not in res.text and "fuga" not in res.text
    alfa_ids = {n["id"] for n in res.json()["nodes"]}
    assert {f"project:{alfa['project']}", f"crop_cycle:{alfa['cycle']}", f"prototype:{alfa['prototype']}"} <= alfa_ids
    assert not any(e["relation"] in ("related_to", "designed_for") for e in res.json()["edges"])

    for node_type, key in (("project", "project"), ("crop_cycle", "cycle"), ("prototype", "prototype")):
        res = client.get(GRAPH, params={"focus_type": node_type, "focus_id": beta[key]}, headers=tenants["alfa_viewer"])
        assert res.status_code == 404, node_type

    beta_body = client.get(GRAPH, headers=tenants["beta_viewer"])
    for raw in alfa.values():
        assert raw not in beta_body.text
    assert (f"prototype:{beta['prototype']}", f"species:{lettuce}", "designed_for") in edge_map(beta_body.json())


def test_stored_edges_respect_scope(client, db, tenants, species):
    _, root = make_member(db, "alfa", "root@alfa.test", "admin", superadmin=True)
    lettuce = species["Lactuca sativa L."].id
    tomato = species["Solanum lycopersicum L."].id
    alfa = tenant_data(client, tenants["alfa_editor"], lettuce, "Norte")
    global_edge = service.create_edge(
        db, root, None,
        EdgeCreate(src_type="species", src_id=lettuce, dst_type="species", dst_id=tomato, relation="related_to",
                   provenance={"note": "Comparten sistema hidropónico en la guía"}),
    )
    org_edge = service.create_edge(
        db, root, tenants["alfa_org"].id,
        EdgeCreate(src_type="prototype", src_id=alfa["prototype"], dst_type="species", dst_id=lettuce,
                   relation="designed_for"),
    )

    alfa_edges = edge_map(graph(client, tenants["alfa_viewer"]))
    assert alfa_edges[(f"species:{lettuce}", f"species:{tomato}", "related_to")]["provenance"] == [
        {"note": "Comparten sistema hidropónico en la guía", "author_id": root.id, "kind": "edge",
         "edge_id": global_edge.id, "scope": "global"}
    ]
    designed = alfa_edges[(f"prototype:{alfa['prototype']}", f"species:{lettuce}", "designed_for")]
    assert designed["provenance"][0]["scope"] == "organization"
    assert designed["provenance"][0]["edge_id"] == org_edge.id

    beta_edges = edge_map(graph(client, tenants["beta_viewer"]))
    assert (f"species:{lettuce}", f"species:{tomato}", "related_to") in beta_edges
    assert not any(rel == "designed_for" for _, _, rel in beta_edges)


def test_global_edge_touching_tenant_node_is_ignored_on_read(client, db, tenants, species):
    lettuce = species["Lactuca sativa L."].id
    alfa = tenant_data(client, tenants["alfa_editor"], lettuce, "Norte")
    # Fila global inválida (insertada a mano): nunca debe mostrarse, ni siquiera al dueño del prototipo
    db.add(GraphEdge(organization_id=None, src_type="prototype", src_id=alfa["prototype"],
                     dst_type="species", dst_id=lettuce, relation="designed_for", provenance={}))
    db.commit()
    assert not any(e["relation"] == "designed_for" for e in graph(client, tenants["alfa_viewer"])["edges"])


# ---- Foco, profundidad y tipos ----


def test_focus_and_depth(client, tenants, species):
    h = tenants["alfa_viewer"]
    lettuce = species["Lactuca sativa L."].id
    one = graph(client, h, focus_type="species", focus_id=lettuce, depth=1)
    assert one["nodes"][0]["id"] == f"species:{lettuce}"
    assert sorted(n["type"] for n in one["nodes"]) == ["source", "species"] + ["trait"] * 4
    two = graph(client, h, focus_type="species", focus_id=lettuce, depth=2)
    assert sum(n["type"] == "species" for n in two["nodes"]) == 3
    ids = {n["id"] for n in two["nodes"]}
    assert all(e["src"] in ids and e["dst"] in ids for e in two["edges"])
    trait = graph(client, h, focus_type="trait", focus_id="photoperiod", depth=1)
    assert trait["nodes"][0]["id"] == "trait:photoperiod" and len(trait["nodes"]) == 4
    for bad in (0, 4):
        assert client.get(GRAPH, params={"focus_type": "species", "focus_id": lettuce, "depth": bad}, headers=h).status_code == 422


def test_types_filter(client, tenants, species):
    h = tenants["alfa_viewer"]
    lettuce = species["Lactuca sativa L."].id
    body = graph(client, h, types="species,trait")
    assert {n["type"] for n in body["nodes"]} == {"species", "trait"}
    assert {e["relation"] for e in body["edges"]} == {"has_trait"}
    # El foco siempre se incluye aunque su tipo esté filtrado; los tipos filtrados no se atraviesan
    focused = graph(client, h, focus_type="species", focus_id=lettuce, depth=3, types="source")
    assert [n["type"] for n in focused["nodes"]] == ["species", "source"]
    res = client.get(GRAPH, params={"types": "species,planeta"}, headers=h)
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "types"


def test_focus_validation(client, tenants, species):
    h = tenants["alfa_viewer"]
    lettuce = species["Lactuca sativa L."].id
    res = client.get(GRAPH, params={"focus_type": "species"}, headers=h)
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "focus_id"
    res = client.get(GRAPH, params={"focus_id": lettuce}, headers=h)
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "focus_type"
    assert client.get(GRAPH, params={"focus_type": "planeta", "focus_id": lettuce}, headers=h).status_code == 422
    assert client.get(GRAPH, params={"focus_type": "species", "focus_id": "no-existe"}, headers=h).status_code == 404


# ---- Corte a 300 nodos (spec §9 V6) ----


def test_truncates_at_300_nodes(client, db, tenants, species):
    db.add_all([Source(title=f"Fuente aislada {i:03d}") for i in range(300)])
    db.commit()
    h = tenants["alfa_viewer"]
    body = graph(client, h)
    assert len(body["nodes"]) == MAX_NODES == 300
    assert body["truncated"] is True
    ids = {n["id"] for n in body["nodes"]}
    assert len(ids) == 300
    # Los nodos conectados sobreviven al corte; se descartan fuentes aisladas
    assert sum(n["type"] == "species" for n in body["nodes"]) == 3
    assert sum(n["type"] == "trait" for n in body["nodes"]) == 4
    assert all(e["src"] in ids and e["dst"] in ids for e in body["edges"])
    assert len(body["edges"]) == 15
    # Bajo el límite no se marca
    lettuce = species["Lactuca sativa L."].id
    assert graph(client, h, focus_type="species", focus_id=lettuce, depth=1)["truncated"] is False
    assert graph(client, h, types="species,trait")["truncated"] is False


def test_select_subgraph_cuts_in_bfs_order():
    g = service.Graph()
    for name in ("a", "b", "c", "d"):
        g.add_node(service.Node(f"source:{name}", "source", name.upper()))
    g.add_edge("source:a", "source:b", "related_to", {"kind": "fk"})
    g.add_edge("source:b", "source:c", "related_to", {"kind": "fk"})
    g.add_edge("source:c", "source:d", "related_to", {"kind": "fk"})
    nodes, edges, truncated = service.select_subgraph(g, "source:a", 3, None, limit=3)
    assert [n.id for n in nodes] == ["source:a", "source:b", "source:c"]
    assert truncated is True
    assert [(e.src, e.dst) for e in edges] == [("source:a", "source:b"), ("source:b", "source:c")]
    nodes, _, truncated = service.select_subgraph(g, "source:a", 1, None, limit=3)
    assert [n.id for n in nodes] == ["source:a", "source:b"] and truncated is False
    # Sin foco: más conectados primero
    nodes, _, _ = service.select_subgraph(g, None, 2, None, limit=2)
    assert [n.id for n in nodes] == ["source:b", "source:c"]


def test_add_edge_merges_provenance_without_duplicates():
    g = service.Graph()
    g.add_node(service.Node("species:x", "species", "X"))
    g.add_node(service.Node("trait:ph", "trait", "pH"))
    g.add_edge("species:x", "trait:ph", "has_trait", {"kind": "assertion", "assertion_id": "1"})
    g.add_edge("species:x", "trait:ph", "has_trait", {"kind": "assertion", "assertion_id": "2"})
    g.add_edge("species:x", "trait:ph", "has_trait", {"kind": "assertion", "assertion_id": "1"})
    g.add_edge("species:x", "species:otro", "related_to", {"kind": "fk"})  # extremo no visible
    g.add_edge("species:x", "species:x", "related_to", {"kind": "fk"})  # lazo
    assert len(g.edges) == 1
    assert [p["assertion_id"] for p in g.edges[("species:x", "trait:ph", "has_trait")].provenance] == ["1", "2"]
