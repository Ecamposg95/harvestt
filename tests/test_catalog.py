from sqlalchemy import func, select

from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Cultivar, Source, Species, TraitAssertion


def _seed(db):
    catalog_seed.seed(db)
    db.commit()


def test_plants_require_auth(client):
    assert client.get("/api/v1/plants").status_code == 401


def test_seed_idempotent(db):
    _seed(db)
    _seed(db)
    assert db.scalar(select(func.count()).select_from(Species)) == 3
    assert db.scalar(select(func.count()).select_from(Source)) == 1
    assert db.scalar(select(func.count()).select_from(TraitAssertion)) == 12
    # Ninguna cifra agronómica en el seed
    assert db.scalar(select(func.count()).where(TraitAssertion.value_min.is_not(None))) == 0
    assert db.scalar(select(func.count()).where(TraitAssertion.value_max.is_not(None))) == 0
    assert db.scalar(select(func.count()).where(TraitAssertion.origin != "missing")) == 0


def test_list_and_search_by_common_name(client, db, tenants):
    _seed(db)
    h = tenants["alfa_viewer"]
    res = client.get("/api/v1/plants", headers=h)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3 and body["page"] == 1 and len(body["items"]) == 3

    res = client.get("/api/v1/plants", params={"q": "LECHUGA"}, headers=h)
    items = res.json()["items"]
    assert [i["scientific_name"] for i in items] == ["Lactuca sativa L."]

    res = client.get("/api/v1/plants", params={"q": "basil"}, headers=h)
    assert [i["scientific_name"] for i in res.json()["items"]] == ["Ocimum basilicum L."]

    res = client.get("/api/v1/plants", params={"q": "lycoper"}, headers=h)
    assert res.json()["total"] == 1

    res = client.get("/api/v1/plants", params={"q": "zzz"}, headers=h)
    assert res.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}


def test_family_filter_and_pagination(client, db, tenants):
    _seed(db)
    h = tenants["alfa_viewer"]
    res = client.get("/api/v1/plants", params={"family": "solanaceae"}, headers=h)
    assert [i["scientific_name"] for i in res.json()["items"]] == ["Solanum lycopersicum L."]

    res = client.get("/api/v1/plants", params={"page": 2, "page_size": 2}, headers=h)
    body = res.json()
    assert body["total"] == 3 and len(body["items"]) == 1

    assert client.get("/api/v1/plants", params={"page_size": 101}, headers=h).status_code == 422
    fams = client.get("/api/v1/plants/families", headers=h).json()
    assert fams == ["Asteraceae", "Lamiaceae", "Solanaceae"]


def test_plant_detail_shows_missing_assertions_and_sources(client, db, tenants):
    _seed(db)
    species = db.scalar(select(Species).where(Species.scientific_name == "Lactuca sativa L."))
    db.add(Cultivar(species_id=species.id, name="Cultivar de prueba", provenance=None))
    db.commit()

    res = client.get(f"/api/v1/plants/{species.id}", headers=tenants["beta_viewer"])
    assert res.status_code == 200
    body = res.json()
    assert body["family"] == "Asteraceae"
    assert {n["name"] for n in body["common_names"]} == {"lechuga", "lettuce"}
    assert [c["name"] for c in body["cultivars"]] == ["Cultivar de prueba"]
    variables = {a["variable"]: a for a in body["trait_assertions"]}
    assert set(variables) == {"air_temperature", "relative_humidity", "photoperiod", "ph"}
    for a in variables.values():
        assert a["origin"] == "missing"
        assert a["review_status"] == "unreviewed"
        assert a["value_min"] is None and a["value_max"] is None

    gbif = body["external_ids"]["gbif"]
    assert gbif["id"] == "7403263"
    assert [s["id"] for s in body["sources"]] == [gbif["source_id"]]
    assert body["sources"][0]["title"] == "GBIF Backbone Taxonomy"

    src = client.get(f"/api/v1/sources/{gbif['source_id']}", headers=tenants["beta_viewer"])
    assert src.status_code == 200 and src.json()["publisher"] == "GBIF"


def test_plant_and_source_not_found(client, tenants):
    h = tenants["alfa_viewer"]
    assert client.get("/api/v1/plants/no-existe", headers=h).status_code == 404
    assert client.get("/api/v1/sources/no-existe", headers=h).status_code == 404


def test_catalog_has_no_write_endpoints(client, db, tenants):
    _seed(db)
    res = client.post("/api/v1/plants", json={"scientific_name": "X"}, headers=tenants["alfa_admin"])
    assert res.status_code == 405
