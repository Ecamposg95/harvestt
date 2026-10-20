import pytest
from sqlalchemy import func, select

from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Species
from app.modules.home.service import activity_text
from app.modules.studio.models import MAX_PLACEMENTS, MAX_ZONES, Placement, Zone

API = "/api/v1"


@pytest.fixture
def species(db):
    catalog_seed.seed(db)
    db.commit()
    # {"lactuca": id, "solanum": id, "ocimum": id}
    return {s.scientific_name.split()[0].lower(): s.id for s in db.scalars(select(Species))}


def make_project(client, headers, **extra):
    body = {"name": "Invernadero norte", "system": "hydroponic", "area_m2": 100.0, **extra}
    res = client.post(f"{API}/projects", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def put(client, headers, project_id, version, zones):
    return client.put(f"{API}/projects/{project_id}/layout", json={"version": version, "zones": zones}, headers=headers)


def get(client, headers, project_id):
    return client.get(f"{API}/projects/{project_id}/layout", headers=headers)


def zone(name="Mesa A", x=0.0, y=0.0, width=4.0, depth=2.0, plants=()):
    return {"name": name, "x": x, "y": y, "width": width, "depth": depth, "placements": list(plants)}


def plant(species_id, x=0.5, y=0.5, stage="vegetative", **extra):
    return {"species_id": species_id, "x": x, "y": y, "stage": stage, **extra}


def test_empty_layout_has_version_zero_and_square_floor(client, tenants):
    p = make_project(client, tenants["alfa_editor"])
    res = get(client, tenants["alfa_viewer"], p["id"])
    assert res.status_code == 200
    body = res.json()
    assert body["version"] == 0 and body["zones"] == [] and body["area_m2"] == 100.0
    assert body["floor"] == {"width": 10.0, "depth": 10.0, "illustrative": False}


def test_replace_reload_and_audit(client, tenants, species, db):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    res = put(
        client,
        h,
        p["id"],
        0,
        [
            zone(plants=[plant(species["lactuca"], 0.3, 0.4, rotation=45), plant(species["ocimum"], 1.0, 1.0, stage="mature")]),
            zone("Mesa B", x=5.0, plants=[plant(species["solanum"], 2.0, 1.5, stage="seedling")]),
        ],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["version"] == 1
    assert [z["name"] for z in body["zones"]] == ["Mesa A", "Mesa B"]
    first = body["zones"][0]["placements"]
    assert [x["species_name"] for x in first] == ["Lactuca sativa L.", "Ocimum basilicum L."]
    assert first[0]["rotation"] == 45 and first[1]["stage"] == "mature" and first[0]["crop_cycle_id"] is None
    # Recargar reconstruye exactamente lo guardado
    assert get(client, h, p["id"]).json() == body

    res = put(client, h, p["id"], 1, [zone("Única", plants=[plant(species["lactuca"])])])
    assert res.status_code == 200 and res.json()["version"] == 2
    assert [z["name"] for z in res.json()["zones"]] == ["Única"]
    assert db.scalar(select(func.count()).select_from(Zone).where(Zone.deleted_at.is_(None))) == 1
    assert db.scalar(select(func.count()).select_from(Placement).where(Placement.deleted_at.is_(None))) == 1
    assert db.scalar(select(func.count()).select_from(Zone)) == 3  # las anteriores quedan con borrado lógico
    ops = [e.operation for e in db.query(AuditEvent).filter_by(resource_type="studio_layout", resource_id=p["id"])]
    assert ops == ["replace", "replace"]


def test_stale_version_conflicts_and_keeps_layout(client, tenants, species):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    assert put(client, h, p["id"], 0, [zone(plants=[plant(species["lactuca"])])]).status_code == 200
    res = put(client, h, p["id"], 0, [zone("Otra")])
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "version_conflict"
    layout = get(client, h, p["id"]).json()
    assert layout["version"] == 1
    assert [z["name"] for z in layout["zones"]] == ["Mesa A"]
    assert len(layout["zones"][0]["placements"]) == 1


def test_zone_outside_project_area_is_422_with_path(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h, area_m2=100.0)  # piso de 10 × 10 m
    assert put(client, h, p["id"], 0, [zone(x=6.0, width=4.0, depth=10.0)]).status_code == 200  # justo en el borde
    res = put(client, h, p["id"], 1, [zone(), zone("Fuera", x=8.0, width=4.0)])
    assert res.status_code == 422
    err = res.json()["error"]
    assert err["code"] == "layout_out_of_bounds"
    assert err["details"]["path"] == "zones.1"
    assert err["details"]["bounds"] == {"width": 10.0, "depth": 10.0}
    assert "Fuera" in err["message"]


def test_plant_outside_its_zone_is_422(client, tenants, species):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    ok = put(client, h, p["id"], 0, [zone(width=4.0, depth=2.0, plants=[plant(species["lactuca"], 4.0, 2.0)])])
    assert ok.status_code == 200  # el borde de la zona cuenta como dentro
    res = put(
        client,
        h,
        p["id"],
        1,
        [zone(width=4.0, depth=2.0, plants=[plant(species["lactuca"]), plant(species["lactuca"], 4.5, 1.0)])],
    )
    assert res.status_code == 422
    err = res.json()["error"]
    assert err["code"] == "layout_out_of_bounds"
    assert err["details"]["path"] == "zones.0.placements.1"
    assert err["details"]["bounds"] == {"width": 4.0, "depth": 2.0}
    assert get(client, h, p["id"]).json()["version"] == 1


def test_project_without_area_has_illustrative_floor_that_grows(client, tenants):
    h = tenants["alfa_editor"]
    p = make_project(client, h, area_m2=None)
    res = put(client, h, p["id"], 0, [zone(x=50.0, y=2.0, width=4.0, depth=3.0)])
    assert res.status_code == 200, res.text
    assert res.json()["floor"] == {"width": 54.0, "depth": 10.0, "illustrative": True}


@pytest.mark.parametrize(
    "bad_zone,bad_plant",
    [
        ({"x": -1.0}, {}),
        ({"width": 0}, {}),
        ({"name": "   "}, {}),
        ({"name": "x" * 81}, {}),
        ({"depth": "nan"}, {}),
        ({}, {"stage": "flowering"}),
        ({}, {"x": -0.1}),
        ({}, {"rotation": 720}),
    ],
)
def test_rejects_invalid_fields(client, tenants, species, bad_zone, bad_plant):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    z = {**zone(plants=[{**plant(species["lactuca"]), **bad_plant}]), **bad_zone}
    assert put(client, h, p["id"], 0, [z]).status_code == 422


def test_species_and_crop_cycle_must_match_project(client, tenants, species):
    h = tenants["alfa_editor"]
    p = make_project(client, h)
    other = make_project(client, h, name="Otro")
    cycle = client.post(f"{API}/projects/{p['id']}/crop-cycles", json={"species_id": species["lactuca"]}, headers=h).json()
    foreign = client.post(f"{API}/projects/{other['id']}/crop-cycles", json={"species_id": species["lactuca"]}, headers=h).json()

    res = put(client, h, p["id"], 0, [zone(plants=[plant("no-existe")])])
    assert res.status_code == 422
    assert res.json()["error"]["details"] == {"path": "zones.0.placements.0", "field": "species_id"}
    res = put(client, h, p["id"], 0, [zone(plants=[plant(species["ocimum"], crop_cycle_id=cycle["id"])])])
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "species_id"
    res = put(client, h, p["id"], 0, [zone(plants=[plant(species["lactuca"], crop_cycle_id=foreign["id"])])])
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "crop_cycle_id"
    res = put(client, h, p["id"], 0, [zone(plants=[plant(species["lactuca"], crop_cycle_id=cycle["id"])])])
    assert res.status_code == 200
    assert res.json()["zones"][0]["placements"][0]["crop_cycle_id"] == cycle["id"]


def test_limits(client, tenants, species):
    h = tenants["alfa_editor"]
    p = make_project(client, h, area_m2=None)
    res = put(client, h, p["id"], 0, [zone(f"Z{i}", x=float(i * 5)) for i in range(MAX_ZONES + 1)])
    assert res.status_code == 422 and res.json()["error"]["code"] == "layout_limit"
    many = [plant(species["lactuca"], 0.1, 0.1)] * (MAX_PLACEMENTS + 1)
    res = put(client, h, p["id"], 0, [zone(plants=many)])
    assert res.status_code == 422 and res.json()["error"]["code"] == "layout_limit"


def test_viewer_reads_but_cannot_write_and_tenants_are_isolated(client, tenants):
    p = make_project(client, tenants["alfa_editor"])
    assert put(client, tenants["alfa_viewer"], p["id"], 0, []).status_code == 403
    assert get(client, tenants["beta_viewer"], p["id"]).status_code == 404
    assert put(client, tenants["beta_editor"], p["id"], 0, []).status_code == 404


def test_activity_text():
    event = AuditEvent(resource_type="studio_layout", resource_id="x", operation="replace", data={})
    assert activity_text(event) == "Layout del Studio actualizado"
