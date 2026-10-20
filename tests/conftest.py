import os

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models_registry  # noqa: E402,F401
from app.core import storage as storage_mod  # noqa: E402
from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.modules.identity import service as identity  # noqa: E402

PASSWORD = "secreto-123"


@pytest.fixture(autouse=True)
def _db(tmp_path, monkeypatch):
    Base.metadata.create_all(engine)
    monkeypatch.setattr(storage_mod, "_storage", storage_mod.LocalStorage(str(tmp_path / "storage")))
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    return TestClient(app)


def make_member(db, org_slug: str, email: str, role: str, superadmin: bool = False):
    org = identity.ensure_organization(db, org_slug.title(), org_slug)
    user = identity.ensure_user(db, email, PASSWORD, email.split("@")[0], is_superadmin=superadmin)
    identity.ensure_membership(db, user, org, role)
    db.commit()
    return org, user


def login_headers(client, email: str, org_id: str | None = None) -> dict:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    if org_id:
        headers["X-Organization-ID"] = org_id
    return headers


@pytest.fixture
def tenants(db, client):
    """Dos organizaciones con admin/editor/viewer cada una. Devuelve dict de headers y orgs."""
    out = {}
    for slug in ("alfa", "beta"):
        org = None
        for role in ("admin", "editor", "viewer"):
            org, _ = make_member(db, slug, f"{role}@{slug}.test", role)
            out[f"{slug}_{role}"] = login_headers(client, f"{role}@{slug}.test", org.id)
        out[f"{slug}_org"] = org
    return out


class FrozenClock:
    """Reloj que solo avanza cuando la prueba lo pide."""

    def __init__(self):
        from datetime import datetime, timezone

        self.now = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)

    def advance(self, seconds: float) -> None:
        from datetime import timedelta

        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock():
    from app.modules.simulation.clock import get_now

    frozen = FrozenClock()
    app.dependency_overrides[get_now] = lambda: frozen.now
    yield frozen
    app.dependency_overrides.pop(get_now, None)
