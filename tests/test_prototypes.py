import struct

import pytest

from app.core import storage as storage_mod
from app.core.config import Settings
from app.modules.audit.models import AuditEvent
from app.modules.prototypes import router as proto_router
from app.modules.prototypes import validation
from app.modules.prototypes.models import PrototypeAsset

API = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 32
INTERNAL_FIELDS = {"storage_key", "organization_id", "checksum_sha256", "is_public", "hero_asset_id", "version"}


def binary_stl(triangles: int = 2) -> bytes:
    return b"\x00" * 80 + struct.pack("<I", triangles) + b"\x01" * (50 * triangles)


ASCII_STL = b"  solid cubo\n facet normal 0 0 1\n outer loop\n vertex 0 0 0\n endloop\n endfacet\nendsolid cubo\n"


@pytest.fixture(autouse=True)
def public_alfa(monkeypatch):
    monkeypatch.setattr(proto_router, "settings", Settings(public_org_slug="alfa"))


def create(client, headers, **data):
    body = {"name": "Germinador G1", "purpose": "Germinar semillas", **data}
    res = client.post(f"{API}/prototypes", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def upload(client, headers, proto_id, content: bytes, filename: str, **form):
    data = {k: str(v).lower() if isinstance(v, bool) else v for k, v in form.items()}
    return client.post(
        f"{API}/prototypes/{proto_id}/assets",
        files={"file": (filename, content, "application/octet-stream")},
        data=data,
        headers=headers,
    )


def stored_path(db, asset_id: str):
    asset = db.get(PrototypeAsset, asset_id)
    return storage_mod.get_storage()._path(asset.storage_key)


# ---- CRUD, roles y aislamiento ----


def test_create_generates_unique_slug_and_audits(client, tenants, db):
    a = create(client, tenants["alfa_editor"], name="Germinador Ñandú 1")
    b = create(client, tenants["alfa_editor"], name="Germinador Ñandú 1")
    assert a["slug"] == "germinador-nandu-1"
    assert b["slug"] == "germinador-nandu-1-2"
    assert a["version"] == 1 and a["status"] == "concept" and a["assets"] == []
    # El mismo slug puede existir en otra organización
    c = create(client, tenants["beta_editor"], name="Germinador Ñandú 1")
    assert c["slug"] == "germinador-nandu-1"
    assert db.query(AuditEvent).filter_by(resource_type="prototype", operation="create").count() == 3


def test_explicit_duplicate_slug_conflicts(client, tenants):
    create(client, tenants["alfa_editor"], slug="g1")
    res = client.post(f"{API}/prototypes", json={"name": "Otro", "slug": "g1"}, headers=tenants["alfa_editor"])
    assert res.status_code == 409


def test_viewer_reads_but_cannot_write(client, tenants):
    proto = create(client, tenants["alfa_editor"])
    viewer = tenants["alfa_viewer"]
    assert client.get(f"{API}/prototypes", headers=viewer).status_code == 200
    assert client.get(f"{API}/prototypes/{proto['id']}", headers=viewer).status_code == 200
    assert client.post(f"{API}/prototypes", json={"name": "X"}, headers=viewer).status_code == 403
    res = client.patch(f"{API}/prototypes/{proto['id']}", json={"version": 1, "name": "Y"}, headers=viewer)
    assert res.status_code == 403
    assert client.delete(f"{API}/prototypes/{proto['id']}", headers=viewer).status_code == 403
    assert upload(client, viewer, proto["id"], PNG, "foto.png").status_code == 403


def test_tenant_isolation(client, tenants):
    proto = create(client, tenants["alfa_editor"])
    asset = upload(client, tenants["alfa_editor"], proto["id"], PNG, "foto.png").json()
    beta = tenants["beta_admin"]
    pid = proto["id"]
    assert client.get(f"{API}/prototypes", headers=beta).json() == []
    assert client.get(f"{API}/prototypes/{pid}", headers=beta).status_code == 404
    assert client.patch(f"{API}/prototypes/{pid}", json={"version": 1, "name": "x"}, headers=beta).status_code == 404
    assert client.delete(f"{API}/prototypes/{pid}", headers=beta).status_code == 404
    assert upload(client, beta, pid, PNG, "foto.png").status_code == 404
    assert client.get(f"{API}/prototypes/{pid}/assets/{asset['id']}/file", headers=beta).status_code == 404
    assert client.patch(f"{API}/prototypes/{pid}/assets/{asset['id']}", json={"caption": "x"}, headers=beta).status_code == 404
    assert client.delete(f"{API}/prototypes/{pid}/assets/{asset['id']}", headers=beta).status_code == 404


def test_patch_version_conflict(client, tenants):
    proto = create(client, tenants["alfa_editor"])
    h = tenants["alfa_editor"]
    ok = client.patch(
        f"{API}/prototypes/{proto['id']}",
        json={"version": 1, "status": "in_construction", "specs": [{"label": "Bandejas", "value": "4"}]},
        headers=h,
    )
    assert ok.status_code == 200
    assert ok.json()["version"] == 2
    assert ok.json()["specs"] == [{"label": "Bandejas", "value": "4", "unit": None}]
    stale = client.patch(f"{API}/prototypes/{proto['id']}", json={"version": 1, "name": "Viejo"}, headers=h)
    assert stale.status_code == 409
    missing = client.patch(f"{API}/prototypes/{proto['id']}", json={"name": "Sin versión"}, headers=h)
    assert missing.status_code == 422
    bad_status = client.patch(f"{API}/prototypes/{proto['id']}", json={"version": 2, "status": "volando"}, headers=h)
    assert bad_status.status_code == 422


def test_soft_delete(client, tenants, db):
    h = tenants["alfa_editor"]
    proto = create(client, h, slug="g1", is_public=True)
    assert client.delete(f"{API}/prototypes/{proto['id']}", headers=h).status_code == 204
    assert client.get(f"{API}/prototypes/{proto['id']}", headers=h).status_code == 404
    assert client.get(f"{API}/prototypes", headers=h).json() == []
    assert client.get(f"{API}/public/prototypes/g1").status_code == 404
    # El slug queda libre para un prototipo nuevo
    assert create(client, h, slug="g1")["slug"] == "g1"
    assert db.query(AuditEvent).filter_by(resource_type="prototype", operation="delete").count() == 1


def test_published_at_set_once(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    assert proto["published_at"] is None
    first = client.patch(f"{API}/prototypes/{proto['id']}", json={"version": 1, "is_public": True}, headers=h).json()
    assert first["published_at"]
    client.patch(f"{API}/prototypes/{proto['id']}", json={"version": 2, "is_public": False}, headers=h)
    again = client.patch(f"{API}/prototypes/{proto['id']}", json={"version": 3, "is_public": True}, headers=h).json()
    assert again["published_at"].rstrip("Z") == first["published_at"].rstrip("Z")


# ---- Uploads ----


def test_upload_png_and_binary_stl(client, tenants, db):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    img = upload(client, h, proto["id"], PNG, "../../Foto Frontal ñ.png", caption="Frente", is_public=True)
    assert img.status_code == 201, img.text
    body = img.json()
    assert body["kind"] == "image" and body["content_type"] == "image/png"
    assert body["filename"] == "Foto-Frontal-n.png"
    assert body["size_bytes"] == len(PNG) and len(body["checksum_sha256"]) == 64
    assert "storage_key" not in body
    asset = db.get(PrototypeAsset, body["id"])
    assert asset.storage_key == f"prototypes/{tenants['alfa_org'].id}/{proto['id']}/{body['id']}.png"

    stl = upload(client, h, proto["id"], binary_stl(3), "carcasa.STL")
    assert stl.status_code == 201, stl.text
    assert stl.json()["kind"] == "model_stl" and stl.json()["content_type"] == "model/stl"

    ascii_res = upload(client, h, proto["id"], ASCII_STL, "cubo.stl")
    assert ascii_res.status_code == 201, ascii_res.text

    for content, name in ((JPEG, "a.jpg"), (WEBP, "b.webp")):
        assert upload(client, h, proto["id"], content, name).status_code == 201

    detail = client.get(f"{API}/prototypes/{proto['id']}", headers=h).json()
    assert detail["hero_asset_id"] == body["id"]  # la primera imagen pasa a ser la principal
    assert len(detail["assets"]) == 5

    f = client.get(f"{API}/prototypes/{proto['id']}/assets/{stl.json()['id']}/file", headers=h)
    assert f.status_code == 200
    assert f.content == binary_stl(3)
    assert f.headers["content-type"] == "model/stl"
    assert f.headers["cache-control"] == "private, no-store"
    assert f.headers["content-length"] == str(len(binary_stl(3)))
    assert client.get(f"{API}/prototypes/{proto['id']}/assets/{stl.json()['id']}/file").status_code == 401


@pytest.mark.parametrize(
    "content,filename",
    [
        (PNG, "falso.stl"),  # PNG disfrazado de STL
        (b"esto no es una imagen", "foto.png"),
        (PNG, "foto.jpg"),  # firma no coincide con la extensión
        (b"\x00" * 80 + struct.pack("<I", 5) + b"\x00" * 10, "roto.stl"),  # binario truncado
        (b"solid vacio\nendsolid vacio\n", "vacio.stl"),  # ASCII sin facetas
        (b"", "nada.png"),
        (PNG, "script.exe"),
    ],
)
def test_upload_rejects_invalid(client, tenants, content, filename):
    proto = create(client, tenants["alfa_editor"])
    res = upload(client, tenants["alfa_editor"], proto["id"], content, filename)
    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "invalid_input"


def test_upload_kind_mismatch(client, tenants):
    proto = create(client, tenants["alfa_editor"])
    res = upload(client, tenants["alfa_editor"], proto["id"], PNG, "foto.png", kind="model_stl")
    assert res.status_code == 422


def test_upload_oversize(client, tenants, monkeypatch, tmp_path):
    monkeypatch.setattr(validation, "MAX_IMAGE_BYTES", 100)
    monkeypatch.setattr(validation, "MAX_STL_BYTES", 120)
    monkeypatch.setattr(validation, "CHUNK", 32)
    proto = create(client, tenants["alfa_editor"])
    h = tenants["alfa_editor"]
    assert upload(client, h, proto["id"], PNG + b"\x00" * 200, "grande.png").status_code == 422
    assert upload(client, h, proto["id"], binary_stl(3), "grande.stl").status_code == 422
    assert upload(client, h, proto["id"], binary_stl(0), "chico.stl").status_code == 201
    stored = list((tmp_path / "storage").rglob("*")) if (tmp_path / "storage").exists() else []
    assert len([p for p in stored if p.is_file()]) == 1


# ---- Hero y borrado de assets ----


def test_hero_must_be_image_of_same_prototype(client, tenants):
    h = tenants["alfa_editor"]
    a = create(client, h, name="A")
    b = create(client, h, name="B")
    stl = upload(client, h, a["id"], binary_stl(), "a.stl").json()
    img_b = upload(client, h, b["id"], PNG, "b.png").json()
    img_a = upload(client, h, a["id"], PNG, "a.png").json()
    current = client.get(f"{API}/prototypes/{a['id']}", headers=h).json()
    v = current["version"]
    url = f"{API}/prototypes/{a['id']}"
    assert client.patch(url, json={"version": v, "hero_asset_id": stl["id"]}, headers=h).status_code == 422
    assert client.patch(url, json={"version": v, "hero_asset_id": img_b["id"]}, headers=h).status_code == 422
    assert client.patch(url, json={"version": v, "hero_asset_id": "no-existe"}, headers=h).status_code == 422
    cleared = client.patch(url, json={"version": v, "hero_asset_id": None}, headers=h)
    assert cleared.status_code == 200 and cleared.json()["hero_asset_id"] is None
    ok = client.patch(url, json={"version": v + 1, "hero_asset_id": img_a["id"]}, headers=h)
    assert ok.status_code == 200 and ok.json()["hero_asset_id"] == img_a["id"]


def test_delete_asset_removes_file_and_clears_hero(client, tenants, db):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    img = upload(client, h, proto["id"], PNG, "foto.png").json()
    path = stored_path(db, img["id"])
    assert path.exists()
    assert client.get(f"{API}/prototypes/{proto['id']}", headers=h).json()["hero_asset_id"] == img["id"]
    res = client.delete(f"{API}/prototypes/{proto['id']}/assets/{img['id']}", headers=h)
    assert res.status_code == 204
    assert not path.exists()
    detail = client.get(f"{API}/prototypes/{proto['id']}", headers=h).json()
    assert detail["hero_asset_id"] is None and detail["assets"] == []
    assert client.get(f"{API}/prototypes/{proto['id']}/assets/{img['id']}/file", headers=h).status_code == 404
    assert db.query(AuditEvent).filter_by(resource_type="prototype_asset", operation="delete").count() == 1


def test_update_asset(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    img = upload(client, h, proto["id"], PNG, "foto.png").json()
    assert img["is_public"] is False
    res = client.patch(
        f"{API}/prototypes/{proto['id']}/assets/{img['id']}", json={"caption": " Vista ", "is_public": True}, headers=h
    )
    assert res.status_code == 200
    assert res.json()["caption"] == "Vista" and res.json()["is_public"] is True


# ---- Vitrina pública ----


def _public_setup(client, tenants):
    h = tenants["alfa_editor"]
    pub = create(client, h, name="Invernadero I1", slug="i1", is_public=True, codename="Aurora", sort_order=1)
    priv = create(client, h, name="Secreto", slug="secreto")
    pub_img = upload(client, h, pub["id"], PNG, "pub.png", is_public=True).json()
    priv_img = upload(client, h, pub["id"], JPEG, "priv.jpg", is_public=False).json()
    pub_stl = upload(client, h, pub["id"], binary_stl(), "modelo.stl", is_public=True).json()
    priv_proto_img = upload(client, h, priv["id"], PNG, "s.png", is_public=True).json()
    beta = create(client, tenants["beta_editor"], name="Beta pública", slug="beta-pub", is_public=True)
    return {"pub": pub, "priv": priv, "pub_img": pub_img, "priv_img": priv_img, "pub_stl": pub_stl,
            "priv_proto_img": priv_proto_img, "beta": beta}


def _walk_keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from _walk_keys(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from _walk_keys(item)


def test_public_list_and_detail(client, tenants):
    s = _public_setup(client, tenants)
    res = client.get(f"{API}/public/prototypes")
    assert res.status_code == 200
    items = res.json()
    assert [p["slug"] for p in items] == ["i1"]  # ni privados ni de otras organizaciones
    assert items[0]["hero"]["id"] == s["pub_img"]["id"]
    assert items[0]["hero"]["url"] == f"/api/v1/public/assets/{s['pub_img']['id']}"
    assert not INTERNAL_FIELDS.intersection(_walk_keys(items)) and "id" not in items[0]

    detail = client.get(f"{API}/public/prototypes/i1")
    assert detail.status_code == 200
    body = detail.json()
    asset_ids = {a["id"] for a in body["assets"]}
    assert asset_ids == {s["pub_img"]["id"], s["pub_stl"]["id"]}
    assert s["priv_img"]["id"] not in detail.text
    assert not INTERNAL_FIELDS.intersection(_walk_keys(body))
    assert tenants["alfa_org"].id not in detail.text

    assert client.get(f"{API}/public/prototypes/secreto").status_code == 404
    assert client.get(f"{API}/public/prototypes/beta-pub").status_code == 404
    assert client.get(f"{API}/public/prototypes/no-existe").status_code == 404


def test_public_hero_falls_back_when_hero_is_private(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h, slug="g1", is_public=True)
    private = upload(client, h, proto["id"], PNG, "a.png", is_public=False).json()
    assert client.get(f"{API}/prototypes/{proto['id']}", headers=h).json()["hero_asset_id"] == private["id"]
    assert client.get(f"{API}/public/prototypes").json()[0]["hero"] is None
    public = upload(client, h, proto["id"], PNG, "b.png", is_public=True).json()
    assert client.get(f"{API}/public/prototypes").json()[0]["hero"]["id"] == public["id"]


def test_public_asset_stream(client, tenants):
    s = _public_setup(client, tenants)
    ok = client.get(f"{API}/public/assets/{s['pub_stl']['id']}")
    assert ok.status_code == 200
    assert ok.content == binary_stl()
    assert ok.headers["content-type"] == "model/stl"
    assert ok.headers["cache-control"] == "public, max-age=3600"
    assert ok.headers["content-length"] == str(len(binary_stl()))
    img = client.get(f"{API}/public/assets/{s['pub_img']['id']}")
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"

    assert client.get(f"{API}/public/assets/{s['priv_img']['id']}").status_code == 404
    assert client.get(f"{API}/public/assets/{s['priv_proto_img']['id']}").status_code == 404
    assert client.get(f"{API}/public/assets/no-existe").status_code == 404


def test_public_asset_hidden_after_delete(client, tenants):
    s = _public_setup(client, tenants)
    h = tenants["alfa_editor"]
    client.delete(f"{API}/prototypes/{s['pub']['id']}/assets/{s['pub_img']['id']}", headers=h)
    assert client.get(f"{API}/public/assets/{s['pub_img']['id']}").status_code == 404
    client.delete(f"{API}/prototypes/{s['pub']['id']}", headers=h)
    assert client.get(f"{API}/public/assets/{s['pub_stl']['id']}").status_code == 404
    assert client.get(f"{API}/public/prototypes").json() == []


def test_public_without_public_org(client, tenants, monkeypatch):
    _public_setup(client, tenants)
    monkeypatch.setattr(proto_router, "settings", Settings(public_org_slug="no-existe"))
    assert client.get(f"{API}/public/prototypes").json() == []
    assert client.get(f"{API}/public/prototypes/i1").status_code == 404


# ---- Validación unitaria ----


def test_sanitize_filename():
    assert validation.sanitize_filename("../../etc/passwd") == "passwd"
    assert validation.sanitize_filename("C:\\x\\Mi Foto (1).PNG") == "Mi-Foto-1-.PNG"
    assert validation.sanitize_filename("") == "archivo"
    assert validation.sanitize_filename("ñandú.stl") == "nandu.stl"
