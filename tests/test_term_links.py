import pytest
from sqlalchemy import select

from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Species, TraitAssertion
from app.modules.ontology import seed as ontology_seed
from app.modules.ontology.models import OntologyTerm
from app.modules.projects.models import CropCycle, Project
from app.modules.term_links import service

PROJECTS = "/api/v1/projects"


@pytest.fixture
def vocab(db):
    ontology_seed.seed(db)
    db.commit()


def _term(db, domain, label):
    return db.scalars(select(OntologyTerm).where(OntologyTerm.domain == domain, OntologyTerm.label == label)).one()


def test_resolve_exact_after_normalizing(db, vocab):
    hydro = _term(db, "environment", "Hidroponía").id
    assert service.resolve(db, "environment", "Hydroponic") == hydro
    assert service.resolve(db, "environment", "  HIDROPÓNICO ") == hydro
    assert service.resolve(db, "environment", "soil") == _term(db, "environment", "Suelo").id
    assert service.resolve(db, "trait", "Air_Temperature") == _term(db, "trait", "Temperatura del aire").id
    assert service.resolve(db, "plant", "Floración") == _term(db, "plant", "Floración").id
    assert service.resolve(db, "trait", "ph") == _term(db, "trait", "pH").id
    for raw in (None, "", "  ", "unknown", "other", "hidro", "mi etapa"):
        assert service.resolve(db, "environment", raw) is None


def test_resolve_ignores_unpublished(db, vocab):
    term = _term(db, "environment", "Suelo")
    term.status = "obsolete"
    db.flush()
    assert service.resolve(db, "environment", "soil") is None


def test_relink_fills_only_nulls_and_keeps_text(db, vocab):
    catalog_seed.seed(db)
    db.commit()
    other = _term(db, "trait", "pH").id
    fixed = db.scalars(select(TraitAssertion).where(TraitAssertion.variable == "air_temperature")).first()
    fixed.variable_term_id = other
    db.commit()
    counts = service.relink(db)
    db.commit()
    assert counts["TraitAssertion.variable"] > 0
    db.refresh(fixed)
    assert fixed.variable_term_id == other and fixed.variable == "air_temperature"
    temp = _term(db, "trait", "Temperatura del aire").id
    linked = db.scalars(
        select(TraitAssertion).where(TraitAssertion.variable == "air_temperature", TraitAssertion.id != fixed.id)
    ).all()
    assert linked and all(a.variable_term_id == temp for a in linked)
    again = service.relink(db)
    assert again and all(v == 0 for v in again.values())


def test_species_linked_without_authorship(db, vocab):
    catalog_seed.seed(db)
    db.commit()
    service.relink(db)
    db.commit()
    sp = db.scalars(select(Species).where(Species.scientific_name == "Lactuca sativa L.")).one()
    assert sp.term_id == _term(db, "organism", "Lactuca sativa L.").id
    assert sp.scientific_name == "Lactuca sativa L."


def test_new_project_and_cycle_get_term(client, db, vocab, tenants):
    catalog_seed.seed(db)
    db.commit()
    h = tenants["alfa_editor"]
    res = client.post(PROJECTS, json={"name": "P", "system": "soil"}, headers=h)
    assert res.status_code == 201, res.text
    pid = res.json()["id"]
    assert db.get(Project, pid).system_term_id == _term(db, "environment", "Suelo").id
    res = client.patch(f"{PROJECTS}/{pid}", json={"version": 1, "system": "hydroponic"}, headers=h)
    assert res.status_code == 200, res.text
    db.expire_all()
    assert db.get(Project, pid).system_term_id == _term(db, "environment", "Hidroponía").id
    species = db.scalars(select(Species)).first()
    ids = {}
    for stage in ("floración", "mi etapa"):
        res = client.post(
            f"{PROJECTS}/{pid}/crop-cycles",
            json={"species_id": species.id, "started_on": "2026-10-01", "stage": stage}, headers=h,
        )
        assert res.status_code == 201, res.text
        ids[stage] = res.json()["id"]
    assert db.get(CropCycle, ids["floración"]).stage_term_id == _term(db, "plant", "Floración").id
    assert db.get(CropCycle, ids["mi etapa"]).stage_term_id is None


def test_usage_counts_only_own_org(client, db, vocab, tenants):
    catalog_seed.seed(db)
    db.commit()
    service.relink(db)
    db.commit()
    soil = _term(db, "environment", "Suelo")
    client.post(PROJECTS, json={"name": "A", "system": "soil"}, headers=tenants["alfa_editor"])
    client.post(PROJECTS, json={"name": "B", "system": "soil"}, headers=tenants["beta_editor"])
    client.post(PROJECTS, json={"name": "B2", "system": "soil"}, headers=tenants["beta_editor"])
    url = f"/api/v1/ontology/terms/{soil.id}/usage"
    assert client.get(url, headers=tenants["alfa_viewer"]).json() == {
        "species": 0, "assertions": 0, "projects": 1, "cycles": 0,
    }
    assert client.get(url, headers=tenants["beta_viewer"]).json()["projects"] == 2
    assert client.get("/api/v1/ontology/terms/nope/usage", headers=tenants["alfa_viewer"]).status_code == 404
    lact = _term(db, "organism", "Lactuca sativa L.")
    assert client.get(f"/api/v1/ontology/terms/{lact.id}/usage", headers=tenants["alfa_viewer"]).json()["species"] == 1
