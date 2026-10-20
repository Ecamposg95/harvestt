from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.models import Species

URL = "/api/v1/home"


def test_home_empty_tenant(client, tenants):
    res = client.get(URL, headers=tenants["alfa_viewer"])
    assert res.status_code == 200
    body = res.json()
    assert body["recent_project"] is None
    assert body["counts"] == {"projects": 0, "crop_cycles": 0, "observations": 0, "sources_cited": 0}
    assert body["activity"] == []


def test_home_requires_auth(client):
    assert client.get(URL).status_code == 401


def test_home_counts_recent_and_activity(client, tenants, db):
    catalog_seed.seed(db)
    db.commit()
    lettuce = db.query(Species).filter(Species.scientific_name.like("Lactuca%")).one()
    h = tenants["alfa_editor"]
    p1 = client.post("/api/v1/projects", json={"name": "Primero", "system": "soil"}, headers=h).json()
    p2 = client.post("/api/v1/projects", json={"name": "Demo lechuga", "system": "hydroponic", "area_m2": 12}, headers=h).json()
    client.post(f"/api/v1/projects/{p2['id']}/crop-cycles", json={"species_id": lettuce.id}, headers=h)
    client.post(f"/api/v1/projects/{p1['id']}/observations", json={"kind": "note", "content": "Hola"}, headers=h)

    body = client.get(URL, headers=tenants["alfa_viewer"]).json()
    assert body["recent_project"]["name"] == "Demo lechuga"
    assert body["recent_project"]["species"] == [lettuce.scientific_name]
    assert body["counts"]["projects"] == 2
    assert body["counts"]["crop_cycles"] == 1
    assert body["counts"]["observations"] == 1
    # Las afirmaciones sembradas no tienen evidencia: no hay fuentes citadas.
    assert body["counts"]["sources_cited"] == 0
    texts = [a["text"] for a in body["activity"]]
    assert "Proyecto creado: Demo lechuga" in texts
    assert "Ciclo de cultivo iniciado" in texts
    assert "Observación registrada" in texts


def test_home_isolated_between_tenants(client, tenants, db):
    client.post("/api/v1/projects", json={"name": "Secreto beta", "system": "soil"}, headers=tenants["beta_editor"])
    db.add(AuditEvent(organization_id=tenants["beta_org"].id, resource_type="project", resource_id="x", operation="create", data={"name": "Secreto beta"}))
    db.commit()
    body = client.get(URL, headers=tenants["alfa_viewer"]).json()
    assert body["recent_project"] is None
    assert body["counts"]["projects"] == 0
    assert all("Secreto" not in a["text"] for a in body["activity"])


def test_home_activity_limited_to_10(client, tenants):
    h = tenants["alfa_editor"]
    for i in range(12):
        client.post("/api/v1/projects", json={"name": f"P{i}", "system": "soil"}, headers=h)
    body = client.get(URL, headers=h).json()
    assert len(body["activity"]) == 10
    assert body["activity"][0]["text"] == "Proyecto creado: P11"
