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
    assert "@" not in res.text  # el correo nunca se expone como autor
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
    # Quien no puede ver el término recibe 404 (la visibilidad se resuelve antes que el permiso).
    assert client.patch(url, json={"label": "Otro"}, headers=tenants["beta_editor"]).status_code == 404
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


# ---- Tarea 3: revisión, versiones, obsolescencia ----

from app.modules.ontology.models import OntologyRelease, TermEquivalence  # noqa: E402

T = "/api/v1/ontology/terms"


def _root(db, client):
    make_member(db, "beta", "root@beta.test", "admin", superadmin=True)
    return login_headers(client, "root@beta.test")


def _v1(db):
    db.add(OntologyRelease(version=1, note="semilla"))
    db.commit()


def _review(client, root, term_id, action="approve", note="Revisado por el equipo"):
    return client.post(f"{T}/{term_id}/review", json={"action": action, "note": note}, headers=root)


def test_review_superadmin_only(client, db, tenants):
    term = _propose(client, tenants["alfa_viewer"]).json()
    res = _review(client, tenants["alfa_editor"], term["id"])
    assert res.status_code == 403


def test_approve_assigns_id_and_bumps_version(client, db, tenants):
    _v1(db)
    root = _root(db, client)
    a = _propose(client, tenants["alfa_viewer"]).json()
    b = _propose(client, tenants["alfa_viewer"], label="Humedad").json()
    ra = _review(client, root, a["id"])
    assert ra.status_code == 200, ra.text
    import re
    assert re.fullmatch(r"HVT:\d{6}", ra.json()["hvt_id"])
    assert ra.json()["published_in_version"] == 2 and ra.json()["status"] == "published"
    rb = _review(client, root, b["id"]).json()
    assert rb["hvt_id"] != ra.json()["hvt_id"]
    assert rb["published_in_version"] == 3
    assert rb["hvt_id"] == f"HVT:{int(ra.json()['hvt_id'][4:]) + 1:06d}"


def test_first_publication_without_release_starts_at_version_1(client, db, tenants):
    root = _root(db, client)
    term = _propose(client, tenants["alfa_viewer"]).json()
    res = _review(client, root, term["id"]).json()
    assert res["published_in_version"] == 1 and res["hvt_id"] == "HVT:000001"


def test_review_twice_conflicts(client, db, tenants):
    _v1(db)
    root = _root(db, client)
    term = _propose(client, tenants["alfa_viewer"]).json()
    assert _review(client, root, term["id"]).status_code == 200
    again = _review(client, root, term["id"])
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "already_reviewed"


def test_note_required(client, db, tenants):
    root = _root(db, client)
    term = _propose(client, tenants["alfa_viewer"]).json()
    assert _review(client, root, term["id"], note="").status_code == 422
    assert _review(client, root, term["id"], note="ab").status_code == 422
    assert _review(client, root, term["id"], note="     ").status_code == 422


def test_request_changes_then_edit_then_approve(client, db, tenants):
    _v1(db)
    root = _root(db, client)
    owner = tenants["alfa_viewer"]
    term = _propose(client, owner).json()
    res = _review(client, root, term["id"], "request_changes", "Falta precisar la unidad")
    assert res.json()["status"] == "in_review"
    assert res.json()["review_note"] == "Falta precisar la unidad"
    assert res.json()["published_in_version"] is None
    assert client.get("/api/v1/ontology/releases", headers=owner).json()[0]["version"] == 1
    edited = client.patch(f"{T}/{term['id']}", json={"definition": "Definición corregida y completa."}, headers=owner)
    assert edited.json()["status"] == "proposed"
    assert _review(client, root, term["id"]).json()["status"] == "published"


def test_reject_keeps_reason_visible_to_proposer(client, db, tenants):
    root = _root(db, client)
    owner = tenants["alfa_viewer"]
    term = _propose(client, owner).json()
    assert _review(client, root, term["id"], "reject", "Ya existe en AGROVOC").json()["status"] == "rejected"
    detail = client.get(f"{T}/{term['id']}", headers=owner).json()
    assert detail["status"] == "rejected" and detail["review_note"] == "Ya existe en AGROVOC"
    assert client.get(f"{T}/{term['id']}", headers=tenants["alfa_editor"]).status_code == 404


def test_parent_obsoleted_before_approval(client, db, tenants):
    _v1(db)
    root = _root(db, client)
    parent = _published(db, "trait", "Rasgo base")
    term = _propose(client, tenants["alfa_viewer"], parent_id=parent.id).json()
    parent.status = "obsolete"
    db.commit()
    res = _review(client, root, term["id"])
    assert res.status_code == 422
    assert res.json()["error"]["details"]["field"] == "parent_id"
    assert db.get(OntologyTerm, term["id"]).status == "proposed"


def test_duplicate_label_at_approval(client, db, tenants):
    root = _root(db, client)
    term = _propose(client, tenants["alfa_viewer"]).json()
    other = OntologyTerm(domain="trait", label="fotoperiodo", label_key="fotoperiodo", definition="d" * 12,
                         status="published", hvt_id="HVT:000009")
    db.add(other)
    db.commit()
    res = _review(client, root, term["id"])
    assert res.status_code == 409 and res.json()["error"]["code"] == "term_exists"


def test_published_term_is_never_deleted_or_edited(client, db, tenants):
    root = _root(db, client)
    owner = tenants["alfa_viewer"]
    term = _propose(client, owner).json()
    _review(client, root, term["id"])
    url = f"{T}/{term['id']}"
    # Orden en service.edit: permiso de proponente (403) antes que estado (409).
    assert client.patch(url, json={"label": "Otro"}, headers=owner).status_code == 409
    assert client.patch(url, json={"label": "Otro"}, headers=tenants["alfa_editor"]).status_code == 403
    assert client.delete(url, headers=root).status_code == 405
    assert db.get(OntologyTerm, term["id"]).label == "Fotoperíodo"


def test_obsolete_requires_published_replacement(client, db, tenants):
    _v1(db)
    root = _root(db, client)
    old = _propose(client, tenants["alfa_viewer"]).json()
    _review(client, root, old["id"])
    proposed = _propose(client, tenants["alfa_viewer"], label="Luz diaria").json()
    url = f"{T}/{old['id']}/obsolete"
    for rid in (proposed["id"], old["id"], "no-existe"):
        res = client.post(url, json={"replaced_by_id": rid, "note": "Reemplazado"}, headers=root)
        assert res.status_code == 422, rid
        assert res.json()["error"]["details"]["field"] == "replaced_by_id"
    new = _propose(client, tenants["alfa_viewer"], label="Luz diaria total").json()
    _review(client, root, new["id"])
    before = client.get("/api/v1/ontology/releases", headers=root).json()[0]["version"]
    res = client.post(url, json={"replaced_by_id": new["id"], "note": "Reemplazado"}, headers=root)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "obsolete" and body["replaced_by"]["id"] == new["id"]
    assert body["obsoleted_in_version"] == before + 1
    # un obsoleto no vuelve a obsoletarse
    assert client.post(url, json={"replaced_by_id": new["id"], "note": "Otra vez"}, headers=root).status_code == 409
    assert client.post(f"{T}/{new['id']}/obsolete", json={"replaced_by_id": old["id"], "note": "Mal"}, headers=root).status_code == 422
    assert client.post(url, json={"replaced_by_id": new["id"], "note": "x"}, headers=tenants["alfa_editor"]).status_code == 403


def test_replace_equivalences_bumps_version(client, db, tenants):
    _v1(db)
    root = _root(db, client)
    term = _propose(client, tenants["alfa_viewer"]).json()
    pub = _review(client, root, term["id"]).json()
    eq = {"scheme": "agrovoc", "external_id": "c_1", "url": "http://aims.fao.org/aos/agrovoc/c_1", "match": "close"}
    url = f"{T}/{term['id']}/equivalences"
    res = client.put(url, json={"equivalences": [eq], "note": "Se agrega AGROVOC"}, headers=root)
    assert res.status_code == 200, res.text
    assert [e["external_id"] for e in res.json()["equivalences"]] == ["c_1"]
    versions = client.get("/api/v1/ontology/releases", headers=tenants["alfa_viewer"]).json()
    assert versions[0]["version"] == pub["published_in_version"] + 1
    assert versions[0]["term_count"] == 1
    assert client.put(url, json={"equivalences": [], "note": "x"}, headers=tenants["alfa_editor"]).status_code == 403
    res = client.put(url, json={"equivalences": [], "note": "Se quita AGROVOC"}, headers=root)
    assert res.json()["equivalences"] == []
    assert db.query(TermEquivalence).count() == 0
    draft = _propose(client, tenants["alfa_viewer"], label="Borrador").json()
    assert client.put(f"{T}/{draft['id']}/equivalences", json={"equivalences": [], "note": "abc"}, headers=root).status_code == 409


def test_review_queue_oldest_first(client, db, tenants):
    root = _root(db, client)
    first = _propose(client, tenants["alfa_viewer"], label="Primero").json()
    second = _propose(client, tenants["alfa_viewer"], label="Segundo").json()
    done = _propose(client, tenants["alfa_viewer"], label="Tercero").json()
    _review(client, root, done["id"], "reject", "No aplica")
    _review(client, root, second["id"], "request_changes", "Ajustar")
    q = client.get("/api/v1/ontology/review-queue", headers=root).json()
    assert [t["id"] for t in q] == [first["id"], second["id"]]
    assert client.get("/api/v1/ontology/review-queue", headers=tenants["alfa_editor"]).status_code == 403


def test_advisory_lock_issued_only_on_postgres():
    from unittest.mock import MagicMock

    from app.modules.ontology import review as rv

    pg = MagicMock()
    pg.get_bind.return_value.dialect.name = "postgresql"
    rv.serialize_publications(pg)
    stmt, params = pg.execute.call_args.args
    assert "pg_advisory_xact_lock" in str(stmt) and params == {"key": rv.ONTOLOGY_PUBLISH_LOCK}
    lite = MagicMock()
    lite.get_bind.return_value.dialect.name = "sqlite"
    rv.serialize_publications(lite)
    lite.execute.assert_not_called()


def test_integrity_error_on_commit_maps_to_409(client, db, tenants, monkeypatch):
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session

    _v1(db)
    root = _root(db, client)
    term = _propose(client, tenants["alfa_viewer"]).json()
    real = Session.commit

    def boom(self):
        raise IntegrityError("insert", {}, Exception("dup version"))

    monkeypatch.setattr(Session, "commit", boom)
    res = _review(client, root, term["id"])
    monkeypatch.setattr(Session, "commit", real)
    assert res.status_code == 409 and res.json()["error"]["code"] == "conflict"
    assert db.get(OntologyTerm, term["id"]).status == "proposed"
