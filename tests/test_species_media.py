import json
import struct

import pytest
from sqlalchemy import func, select

from app.modules.audit.models import AuditEvent
from app.modules.catalog import seed as catalog_seed
from app.modules.catalog.media import image_dimensions
from app.modules.catalog.models import Species, SpeciesMedia
from app.modules.prototypes import validation
from tests.conftest import login_headers, make_member
from tests.test_prototypes import binary_stl

API = "/api/v1"
PNG_640 = (
    b"\x89PNG\r\n\x1a\n"
    + struct.pack(">I", 13)
    + b"IHDR"
    + struct.pack(">II", 640, 480)
    + b"\x08\x02\x00\x00\x00"
    + b"\x00" * 64
)


@pytest.fixture
def lettuce(db):
    catalog_seed.seed(db)
    db.commit()
    return db.scalar(select(Species).where(Species.scientific_name == "Lactuca sativa L.")).id


@pytest.fixture
def root(db, client, tenants):
    make_member(db, "alfa", "root@alfa.test", "viewer", superadmin=True)
    return login_headers(client, "root@alfa.test", tenants["alfa_org"].id)


def meta(**extra):
    return {"license": "CC BY 4.0", "attribution": "Ana Pérez", "source_url": "https://example.org/foto", "kind": "photo", **extra}


def upload(client, headers, species_id, content=PNG_640, filename="lechuga.png", **form):
    data = {k: (str(v).lower() if isinstance(v, bool) else v) for k, v in {**meta(), **form}.items()}
    return client.post(
        f"{API}/plants/{species_id}/media",
        files={"file": (filename, content, "application/octet-stream")},
        data=data,
        headers=headers,
    )


def test_superadmin_uploads_and_detail_lists_media(client, tenants, root, lettuce, db):
    callouts = [{"trait_variable": "ph", "x": 0.25, "y": 0.75}]
    res = upload(client, root, lettuce, callouts=json.dumps(callouts))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["license"] == "CC BY 4.0" and body["attribution"] == "Ana Pérez"
    assert body["source_url"] == "https://example.org/foto" and body["kind"] == "photo"
    assert (body["width"], body["height"]) == (640, 480)
    assert body["is_hero"] is True  # primera imagen de la especie
    assert body["callouts"] == callouts
    assert body["url"] == f"/plants/{lettuce}/media/{body['id']}/file"

    detail = client.get(f"{API}/plants/{lettuce}", headers=tenants["beta_viewer"])
    assert detail.status_code == 200
    assert [m["id"] for m in detail.json()["media"]] == [body["id"]]
    assert "storage_key" not in detail.text and "checksum" not in detail.text

    event = db.scalar(select(AuditEvent).where(AuditEvent.resource_type == "species_media"))
    assert event.operation == "create" and event.organization_id is None and event.actor_id is not None


@pytest.mark.parametrize("field,value", [("license", ""), ("license", "   "), ("attribution", ""), ("attribution", "  ")])
def test_license_and_attribution_are_required(client, root, lettuce, db, tmp_path, field, value):
    res = upload(client, root, lettuce, **{field: value})
    assert res.status_code == 422
    assert res.json()["error"]["details"]["field"] == field
    assert db.scalar(select(func.count()).select_from(SpeciesMedia)) == 0
    assert not any(p.is_file() for p in (tmp_path / "storage").rglob("*"))


def test_only_superadmin_writes(client, tenants, root, lettuce):
    assert upload(client, tenants["alfa_admin"], lettuce).status_code == 403
    media_id = upload(client, root, lettuce).json()["id"]
    assert client.delete(f"{API}/plants/{lettuce}/media/{media_id}", headers=tenants["alfa_admin"]).status_code == 403
    anonymous = client.post(f"{API}/plants/{lettuce}/media", files={"file": ("a.png", PNG_640)}, data=meta())
    assert anonymous.status_code == 401


@pytest.mark.parametrize(
    "content,filename",
    [(binary_stl(), "modelo.stl"), (b"no soy una imagen", "falsa.png"), (b"", "vacia.png"), (PNG_640, "foto.gif")],
)
def test_rejects_non_images(client, root, lettuce, content, filename):
    assert upload(client, root, lettuce, content=content, filename=filename).status_code == 422


def test_rejects_oversize(client, root, lettuce, monkeypatch):
    monkeypatch.setattr(validation, "MAX_IMAGE_BYTES", 32)
    res = upload(client, root, lettuce)
    assert res.status_code == 422
    assert res.json()["error"]["details"]["max_bytes"] == 32


@pytest.mark.parametrize(
    "callouts",
    [
        '[{"trait_variable": "ph", "x": 1.5, "y": 0.2}]',
        '[{"trait_variable": "ph", "x": -0.1, "y": 0.2}]',
        '[{"trait_variable": "", "x": 0.1, "y": 0.2}]',
        '{"no": "lista"}',
        "no es json",
        json.dumps([{"trait_variable": "ph", "x": 0.1, "y": 0.1}] * 13),
    ],
)
def test_callouts_validated(client, root, lettuce, callouts):
    res = upload(client, root, lettuce, callouts=callouts)
    assert res.status_code == 422
    assert res.json()["error"]["details"]["field"] == "callouts"


def test_source_url_must_be_http(client, root, lettuce):
    res = upload(client, root, lettuce, source_url="javascript:alert(1)")
    assert res.status_code == 422 and res.json()["error"]["details"]["field"] == "source_url"
    assert upload(client, root, lettuce, source_url="").json()["source_url"] is None


def test_new_hero_replaces_previous(client, tenants, root, lettuce):
    first = upload(client, root, lettuce).json()
    second = upload(client, root, lettuce, is_hero=False).json()
    assert second["is_hero"] is False
    third = upload(client, root, lettuce, is_hero=True, kind="render").json()
    media = client.get(f"{API}/plants/{lettuce}", headers=tenants["alfa_viewer"]).json()["media"]
    assert [m["id"] for m in media] == [third["id"], first["id"], second["id"]]
    assert [m["is_hero"] for m in media] == [True, False, False]


def test_file_streams_with_private_cache_and_etag(client, tenants, root, lettuce):
    body = upload(client, root, lettuce).json()
    url = f"{API}/plants/{lettuce}/media/{body['id']}/file"
    res = client.get(url, headers=tenants["beta_viewer"])
    assert res.status_code == 200 and res.content == PNG_640
    assert res.headers["content-type"] == "image/png"
    assert res.headers["cache-control"] == "private, max-age=86400"
    assert res.headers["x-content-type-options"] == "nosniff"
    again = client.get(url, headers={**tenants["beta_viewer"], "If-None-Match": res.headers["etag"]})
    assert again.status_code == 304 and again.content == b""
    assert client.get(url).status_code == 401
    missing = client.get(f"{API}/plants/{lettuce}/media/no-existe/file", headers=tenants["beta_viewer"])
    assert missing.status_code == 404


def test_delete_soft_deletes_and_hides(client, tenants, root, lettuce, db):
    body = upload(client, root, lettuce).json()
    assert client.delete(f"{API}/plants/{lettuce}/media/{body['id']}", headers=root).status_code == 204
    assert client.get(f"{API}/plants/{lettuce}", headers=tenants["alfa_viewer"]).json()["media"] == []
    assert client.get(f"{API}/plants/{lettuce}/media/{body['id']}/file", headers=tenants["alfa_viewer"]).status_code == 404
    assert db.get(SpeciesMedia, body["id"]).deleted_at is not None
    assert client.delete(f"{API}/plants/{lettuce}/media/{body['id']}", headers=root).status_code == 404


def test_media_of_other_species_is_404(client, tenants, root, lettuce, db):
    basil = db.scalar(select(Species).where(Species.scientific_name == "Ocimum basilicum L.")).id
    body = upload(client, root, lettuce).json()
    assert client.get(f"{API}/plants/{basil}/media/{body['id']}/file", headers=tenants["alfa_viewer"]).status_code == 404
    assert client.delete(f"{API}/plants/{basil}/media/{body['id']}", headers=root).status_code == 404


def test_image_dimensions():
    jpeg = (
        b"\xff\xd8"
        + b"\xff\xe0"
        + struct.pack(">H", 16)
        + b"\x00" * 14
        + b"\xff\xc0"
        + struct.pack(">HBHH", 17, 8, 300, 400)
        + b"\x00" * 16
    )
    webp = (
        b"RIFF\x00\x00\x00\x00WEBPVP8X"
        + struct.pack("<I", 10)
        + b"\x00" * 4
        + (799).to_bytes(3, "little")
        + (599).to_bytes(3, "little")
    )
    assert image_dimensions(PNG_640, "png") == (640, 480)
    assert image_dimensions(jpeg, "jpeg") == (400, 300)
    assert image_dimensions(webp, "webp") == (800, 600)
    assert image_dimensions(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "png") is None
    assert image_dimensions(b"\xff\xd8\xff", "jpeg") is None
