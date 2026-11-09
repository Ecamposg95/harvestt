import ast
from datetime import date
from pathlib import Path

from tests.conftest import login_headers, make_member

from app.modules.ontology.models import ExternalConcept, OntologyTerm
from app.modules.ontology.text import normalize_label


def test_normalize_label():
    assert normalize_label("  Fotoperíodo ") == normalize_label("fotoperiodo") == "fotoperiodo"
    assert normalize_label("A   B\tC") == "a b c"


def test_term_persists_with_defaults(db):
    term = OntologyTerm(domain="trait", label="Fotoperíodo", label_key=normalize_label("Fotoperíodo"), definition="x")
    db.add(term)
    db.commit()
    db.refresh(term)
    assert term.status == "proposed"
    assert term.hvt_id is None
    assert term.aliases == []


def test_ontology_module_has_no_product_imports():
    root = Path(__file__).resolve().parents[1] / "app" / "modules" / "ontology"
    allowed = ("app.core", "app.modules.identity", "app.modules.ontology")
    files = list(root.rglob("*.py"))
    assert files
    for path in files:
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                assert node.level < 2, f"{path.name} usa import relativo que sale del paquete"
                if node.module and node.level == 0:
                    names = [node.module]
            for name in names:
                if name == "app" or name.startswith("app."):
                    assert any(name == p or name.startswith(p + ".") for p in allowed), f"{path.name} importa {name}"


PROPOSAL = {"domain": "trait", "label": "Fotoperíodo", "definition": "Horas de luz por día que recibe la planta."}


def _propose(client, headers, **over):
    return client.post("/api/v1/ontology/terms", json={**PROPOSAL, **over}, headers=headers)


def _published(db, domain="trait", label="Padre"):
    from app.modules.ontology.text import normalize_label

    t = OntologyTerm(domain=domain, label=label, label_key=normalize_label(label), definition="d" * 12,
                     status="published", hvt_id="HVT:000001" if domain == "trait" else "HVT:000002")
    db.add(t)
    db.commit()
    return t


def test_ontology_requires_login(client):
    assert client.get("/api/v1/ontology/terms").status_code == 401
    assert client.get("/api/v1/ontology/suggest?q=air").status_code == 401


def test_any_member_can_propose(client, tenants):
    res = _propose(client, tenants["alfa_viewer"])
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "proposed"
    assert body["hvt_id"] is None
    assert body["proposed_by_name"] == "viewer"
    assert client.get("/api/v1/ontology/terms?mine=true", headers=tenants["alfa_viewer"]).json()[0]["id"] == body["id"]
    assert client.get("/api/v1/ontology/terms?mine=true", headers=tenants["alfa_editor"]).json() == []


def test_duplicate_label_normalized(client, tenants):
    h = tenants["alfa_viewer"]
    assert _propose(client, h).status_code == 201
    dup = _propose(client, h, label="fotoperiodo ")
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "term_exists"
    assert _propose(client, h, domain="environment", label="fotoperiodo ").status_code == 201


def test_parent_must_be_published_same_domain(client, db, tenants):
    h = tenants["alfa_viewer"]
    proposed = _propose(client, h, label="Otro").json()
    res = _propose(client, h, parent_id=proposed["id"])
    assert res.status_code == 422
    assert res.json()["error"]["details"]["field"] == "parent_id"
    env = _published(db, "environment", "Ambiente base")
    assert _propose(client, h, parent_id=env.id).status_code == 422
    ok = _published(db, "trait", "Rasgo base")
    assert _propose(client, h, parent_id=ok.id).status_code == 201


def test_unit_only_for_traits(client, tenants):
    h = tenants["alfa_viewer"]
    res = _propose(client, h, domain="place", label="Invernadero", unit="h")
    assert res.status_code == 422
    assert res.json()["error"]["details"]["field"] == "unit"
    assert _propose(client, h, unit="h").status_code == 201


def test_visibility_of_proposals(client, db, tenants):
    term = _propose(client, tenants["alfa_viewer"]).json()
    other = tenants["beta_editor"]
    assert client.get("/api/v1/ontology/terms", headers=other).json() == []
    assert client.get(f"/api/v1/ontology/terms/{term['id']}", headers=other).status_code == 404
    make_member(db, "beta", "root@beta.test", "admin", superadmin=True)
    root = login_headers(client, "root@beta.test")
    assert len(client.get("/api/v1/ontology/terms", headers=root).json()) == 1
    assert client.get(f"/api/v1/ontology/terms/{term['id']}", headers=root).status_code == 200
    assert len(client.get("/api/v1/ontology/terms", headers=tenants["alfa_viewer"]).json()) == 1


def test_edit_only_by_proposer_and_returns_to_proposed(client, db, tenants):
    owner = tenants["alfa_viewer"]
    term = _propose(client, owner).json()
    url = f"/api/v1/ontology/terms/{term['id']}"
    assert client.patch(url, json={"label": "Otro"}, headers=tenants["alfa_editor"]).status_code in (403, 404)
    db_term = db.get(OntologyTerm, term["id"])
    db_term.status = "in_review"
    db.commit()
    res = client.patch(url, json={"definition": "Definición nueva y más larga."}, headers=owner)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "proposed"
    assert res.json()["definition"].startswith("Definición nueva")


def test_suggest_searches_loaded_vocabularies(client, db, tenants):
    db.add(ExternalConcept(scheme="agrovoc", external_id="c_1", label="air temperature", label_key="air temperature",
                           url="http://aims.fao.org/aos/agrovoc/c_1", verified_at=date(2026, 11, 9), verified_via="test"))
    db.commit()
    h = tenants["alfa_viewer"]
    res = client.get("/api/v1/ontology/suggest?q=Air temp", headers=h)
    assert [c["external_id"] for c in res.json()] == ["c_1"]
    assert client.get("/api/v1/ontology/suggest?q=a", headers=h).json() == []
