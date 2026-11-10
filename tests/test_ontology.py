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
    assert edited.json()["review_note"] is None and edited.json()["reviewed_at"] is None
    assert _review(client, root, term["id"]).json()["status"] == "published"


def test_edit_cannot_overwrite_concurrent_approval(client, db, tenants):
    from app.modules.identity.models import User
    from app.core.errors import AppError
    import pytest
    from app.modules.ontology import service as ontology_service
    from app.modules.ontology.schemas import TermEdit

    _v1(db)
    owner = tenants["alfa_viewer"]
    term = _propose(client, owner).json()
    stale = db.get(OntologyTerm, term["id"])
    label = stale.label
    root = _root(db, client)
    assert _review(client, root, term["id"]).json()["status"] == "published"
    user = db.get(User, stale.proposed_by)
    assert stale.status == "proposed"  # instancia obsoleta: la sesión de prueba no la recargó
    with pytest.raises(AppError) as exc:
        ontology_service.edit(db, user, stale, TermEdit(label="Cambiada"))
    assert exc.value.status_code == 409 and exc.value.code == "not_editable"
    db.rollback()
    fresh = db.get(OntologyTerm, term["id"])
    assert fresh.status == "published" and fresh.label == label and fresh.hvt_id


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


# ---- Tarea 4: vocabularios externos verificados y semilla ----

import json  # noqa: E402
import re  # noqa: E402

from sqlalchemy import func, select  # noqa: E402

from app.modules.ontology import seed as ontology_seed  # noqa: E402
from app.modules.ontology.models import DOMAINS, MATCH_TYPES, SCHEMES  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "app" / "modules" / "ontology" / "data"
ID_FORMATS = {
    "ncbi_taxon": r"\d+", "po": r"PO:\d{7}", "peco": r"PECO:\d{7}", "envo": r"ENVO:\d{8}", "agrovoc": r"c_\w+",
    "bbch": r"\d{1,3}", "ucum": r"\S+", "sosa": r"http://www\.w3\.org/ns/sosa/\w+",
    "ssn": r"http://www\.w3\.org/ns/ssn/\w+", "geosparql": r"http://www\.opengis\.net/ont/geosparql#\w+",
}


def _load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def test_seed_files_are_consistent():
    concepts = _load("external_concepts.json")
    terms = _load("seed_terms.json")
    keys = [(c["scheme"], c["external_id"]) for c in concepts]
    assert len(keys) == len(set(keys))
    for c in concepts:
        assert c["scheme"] in SCHEMES
        assert re.fullmatch(ID_FORMATS[c["scheme"]], c["external_id"]), c
        assert c["label"].strip() and c["url"].startswith("http") and c["verified_via"].strip()
        date.fromisoformat(c["verified_at"])
    seen: dict[str, str] = {}
    labels, alias_keys = set(), {}
    for t in terms:
        assert t["seed_key"] not in seen, t["seed_key"]
        assert t["domain"] in DOMAINS
        if t["parent_seed_key"] is not None:
            assert seen.get(t["parent_seed_key"]) == t["domain"], f"padre de {t['seed_key']}"
        seen[t["seed_key"]] = t["domain"]
        label_key = (t["domain"], normalize_label(t["label"]))
        assert label_key not in labels, label_key
        labels.add(label_key)
        assert (t["unit"] is not None) == (t["domain"] == "trait"), t["seed_key"]
        assert 10 <= len(t["definition"]) <= 400
        # Un texto libre solo puede resolver a un término por dominio (Tarea 5).
        for key in {normalize_label(x) for x in [t["label"], *t["aliases"]]}:
            assert alias_keys.setdefault((t["domain"], key), t["seed_key"]) == t["seed_key"], (key, t["seed_key"])
        for eq in t["equivalences"]:
            assert eq["scheme"] in SCHEMES and eq["match"] in MATCH_TYPES
            assert (eq["scheme"], eq["external_id"]) in keys, eq


def test_seed_aliases_cover_values_in_use():
    terms = _load("seed_terms.json")

    def resolves(domain, raw):
        return [t["seed_key"] for t in terms if t["domain"] == domain
                and normalize_label(raw) in {normalize_label(x) for x in [t["label"], *t["aliases"]]}]

    variables = [("air_temperature", "Cel"), ("relative_humidity", "%"), ("photoperiod", "h"), ("ph", "[pH]")]
    for variable, unit in variables:
        [key] = resolves("trait", variable)
        assert next(t for t in terms if t["seed_key"] == key)["unit"] == unit
    for system in ("hydroponic", "substrate", "soil", "aeroponic"):
        assert len(resolves("environment", system)) == 1
    assert resolves("environment", "other") == []
    assert resolves("plant", "Germinación") == ["bbch_0"]
    assert resolves("plant", "floración") == ["bbch_6"]
    for name in ("Lactuca sativa", "Solanum lycopersicum", "Ocimum basilicum"):
        assert len(resolves("organism", name)) == 1


def _seed_terms(db):
    return list(db.scalars(select(OntologyTerm).order_by(OntologyTerm.hvt_id)))


def test_seed_is_idempotent(db):
    ontology_seed.seed(db)
    db.commit()
    ontology_seed.seed(db)
    db.commit()
    terms = _seed_terms(db)
    n = len(_load("seed_terms.json"))
    assert len(terms) == n
    assert [t.hvt_id for t in terms] == [f"HVT:{i:06d}" for i in range(1, n + 1)]
    assert [r.version for r in db.scalars(select(OntologyRelease))] == [1]
    assert db.scalar(select(OntologyRelease.note)) == f"Semilla: {n} términos"
    assert all(t.status == "published" and t.published_in_version == 1 for t in terms)
    assert all(t.proposed_by is None for t in terms)
    assert all(t.review_note == "Vocabulario semilla del equipo" for t in terms)
    assert db.scalar(select(func.count()).select_from(ExternalConcept)) == len(_load("external_concepts.json"))
    # Orden del archivo y padres resueltos.
    by_key = {t.seed_key: t for t in terms}
    assert by_key["asteraceae"].hvt_id == "HVT:000001"
    assert by_key["lactuca_sativa"].parent_id == by_key["lactuca"].id
    assert by_key["air_temperature"].unit == "Cel"
    eq = db.scalar(select(TermEquivalence).where(TermEquivalence.term_id == by_key["lactuca_sativa"].id))
    assert (eq.scheme, eq.external_id, eq.match, eq.external_label) == ("ncbi_taxon", "4236", "exact", "Lactuca sativa")
    assert eq.url == "https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=4236"


def test_seed_adds_new_terms_in_new_version(db, tmp_path, monkeypatch):
    ontology_seed.seed(db)
    db.commit()
    before = {t.seed_key: t.hvt_id for t in _seed_terms(db)}
    # Un término existente editado en la base no se toca al volver a sembrar.
    lettuce = db.scalar(select(OntologyTerm).where(OntologyTerm.seed_key == "lactuca_sativa"))
    lettuce.status = "obsolete"
    db.commit()

    terms = _load("seed_terms.json")
    terms.append({
        "seed_key": "co2", "domain": "trait", "parent_seed_key": None, "label": "Concentración de CO₂",
        "definition": "Cantidad de dióxido de carbono en el aire.", "aliases": ["co2"], "unit": "ppm",
        "equivalences": [],
    })
    patched = tmp_path / "seed_terms.json"
    patched.write_text(json.dumps(terms), encoding="utf-8")
    monkeypatch.setattr(ontology_seed, "TERMS_FILE", patched)
    ontology_seed.seed(db)
    db.commit()

    after = {t.seed_key: t for t in _seed_terms(db)}
    assert {k: after[k].hvt_id for k in before} == before
    assert after["co2"].hvt_id == f"HVT:{len(before) + 1:06d}"
    assert after["co2"].published_in_version == 2
    assert after["lactuca_sativa"].status == "obsolete"
    assert [r.version for r in db.scalars(select(OntologyRelease).order_by(OntologyRelease.version))] == [1, 2]
    assert db.scalar(select(OntologyRelease.note).where(OntologyRelease.version == 2)) == "Semilla: 1 términos"


def test_seed_updates_external_concepts_in_place(db, tmp_path, monkeypatch):
    ontology_seed.seed(db)
    db.commit()
    concepts = _load("external_concepts.json")
    concepts[0]["verified_at"] = "2027-01-01"
    patched = tmp_path / "external_concepts.json"
    patched.write_text(json.dumps(concepts), encoding="utf-8")
    monkeypatch.setattr(ontology_seed, "CONCEPTS_FILE", patched)
    ontology_seed.seed(db)
    db.commit()
    assert db.scalar(select(func.count()).select_from(ExternalConcept)) == len(concepts)
    first = db.scalar(select(ExternalConcept).where(
        ExternalConcept.scheme == concepts[0]["scheme"], ExternalConcept.external_id == concepts[0]["external_id"]))
    assert first.verified_at == date(2027, 1, 1)
    assert first.label_key == normalize_label(concepts[0]["label"])


def test_seed_skips_label_already_taken(db, tmp_path, monkeypatch):
    """Si alguien ya publicó (o propuso) la misma etiqueta, la semilla no crea un duplicado."""
    db.add(OntologyTerm(domain="trait", label="Fotoperíodo", label_key=normalize_label("Fotoperíodo"),
                        definition="Propuesto por un usuario.", status="proposed"))
    db.commit()
    ontology_seed.seed(db)
    db.commit()
    assert db.scalar(select(OntologyTerm).where(OntologyTerm.seed_key == "photoperiod")) is None
    assert db.scalar(select(func.count()).select_from(OntologyTerm).where(
        OntologyTerm.label_key == "fotoperiodo")) == 1
    hvt = [t.hvt_id for t in _seed_terms(db) if t.hvt_id]
    assert hvt == [f"HVT:{i:06d}" for i in range(1, len(hvt) + 1)]


def test_startup_seeds_ontology_after_catalog():
    from app.modules.catalog import seed as catalog_seed
    from scripts.seed import SEEDS

    assert SEEDS.index(ontology_seed) == SEEDS.index(catalog_seed) + 1


# ---- Tarea 6: exportación pública y resolución por ID ----
from app.modules.ontology import export as ontology_export  # noqa: E402

PUB = "/api/v1/public/ontology"


def _vocab(db):
    ontology_seed.seed(db)
    db.commit()


def _extra(db, status, label, **over):
    over.setdefault("definition", "Definición de prueba")
    t = OntologyTerm(domain="trait", label=label, label_key=normalize_label(label), status=status, **over)
    db.add(t)
    db.commit()
    return t


def test_export_turtle_shape(client, db):
    _vocab(db)
    _extra(db, "proposed", "Término propuesto secreto")
    res = client.get(f"{PUB}/export.ttl")
    assert res.status_code == 200
    assert res.headers["content-type"] == "text/turtle; charset=utf-8"
    assert res.headers["content-disposition"] == 'attachment; filename="harvestt-ontologia-v1.ttl"'
    ttl = res.text
    assert 'owl:versionInfo "1"' in ttl
    assert "<https://creativecommons.org/licenses/by/4.0/>" in ttl
    assert 'skos:notation "HVT:000001"' in ttl
    assert "skos:exactMatch" in ttl
    assert 'dcterms:creator "Equipo HarvestT"' in ttl
    assert "secreto" not in ttl
    assert 'skos:altLabel "' in ttl
    air = ttl[ttl.index('rdfs:label "Temperatura del aire"@es'):]
    air = air[:air.index(" .\n")]
    assert 'qudt:ucumCode "Cel"' in air and "skos:altLabel" in air


def test_turtle_escapes_literals(db):
    t = _extra(db, "published", "Con comillas", hvt_id="HVT:000999",
               definition='Dice "hola"\ny \\ adiós\r')
    ttl = ontology_export.to_turtle(1, [t], "https://x.test/terms/")
    assert 'skos:definition "Dice \\"hola\\"\\ny \\\\ adiós\\r"@es' in ttl
    assert "<https://x.test/terms/HVT_000999>" in ttl


def test_export_json_includes_obsolete_with_replacement(client, db):
    _vocab(db)
    new = _extra(db, "published", "Nuevo", hvt_id="HVT:000998")
    old = _extra(db, "obsolete", "Viejo", hvt_id="HVT:000997", replaced_by_id=new.id)
    _extra(db, "published", "Borrado", hvt_id="HVT:000996", deleted_at=old.created_at)
    body = client.get(f"{PUB}/export.json").json()
    assert body["version"] == 1 and body["license"] == "https://creativecommons.org/licenses/by/4.0/"
    by_id = {t["hvt_id"]: t for t in body["terms"]}
    assert "HVT:000996" not in by_id
    assert by_id["HVT:000997"]["status"] == "obsolete"
    assert by_id["HVT:000997"]["replaced_by"] == by_id["HVT:000998"]["iri"]
    assert by_id["HVT:000001"]["equivalences"][0]["scheme"] == "ncbi_taxon"
    assert by_id["HVT:000001"]["creator"] == "Equipo HarvestT"
    ttl = client.get(f"{PUB}/export.ttl").text
    assert "dcterms:isReplacedBy" in ttl and "owl:deprecated true" in ttl


def test_public_term_resolution(client, db):
    _vocab(db)
    rejected = _extra(db, "rejected", "Rechazado", hvt_id="HVT:000995")
    for ident in ("HVT_000001", "HVT:000001"):
        res = client.get(f"{PUB}/terms/{ident}")
        assert res.status_code == 200, ident
        assert res.json()["hvt_id"] == "HVT:000001"
    assert client.get(f"{PUB}/terms/HVT_000995").status_code == 404
    assert client.get(f"{PUB}/terms/HVT_999999").status_code == 404
    assert client.get(f"{PUB}/terms/{rejected.id}").status_code == 404


def test_iri_ref_never_emits_raw_unsafe_characters():
    out = ontology_export._iri_ref('http://x.test/a b<c>d"e{f}g|h\\i^j`k')
    inner = out[1:-1]
    assert out.startswith("<") and out.endswith(">")
    assert not any(ch in inner for ch in '<>" {}|\\^`')
