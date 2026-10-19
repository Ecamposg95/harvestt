from tests.conftest import PASSWORD, login_headers, make_member


def test_health(client):
    assert client.get("/api/v1/health/live").json() == {"status": "ok"}
    assert client.get("/api/v1/health/ready").json()["database"] == "up"


def test_login_and_me(client, db):
    org, _ = make_member(db, "alfa", "Ana@Alfa.test", "editor")
    res = client.post("/api/v1/auth/login", json={"email": "ana@alfa.test", "password": PASSWORD})
    assert res.status_code == 200
    body = res.json()
    assert body["memberships"][0]["role"] == "editor"
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["user"]["email"] == "ana@alfa.test"


def test_login_form_encoded(client, db):
    make_member(db, "alfa", "ana@alfa.test", "viewer")
    res = client.post("/api/v1/auth/login", data={"username": "ana@alfa.test", "password": PASSWORD})
    assert res.status_code == 200


def test_bad_credentials(client, db):
    make_member(db, "alfa", "ana@alfa.test", "viewer")
    res = client.post("/api/v1/auth/login", json={"email": "ana@alfa.test", "password": "otra"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "invalid_credentials"
    assert res.json()["error"]["request_id"]


def test_me_requires_token(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


def test_context_rejects_foreign_org(client, db):
    from fastapi import Depends

    from app.core.deps import RequestContext, get_context
    from app.main import app

    @app.get("/api/v1/_test/ctx")
    def _ctx(ctx: RequestContext = Depends(get_context)):
        return {"org": ctx.organization_id, "role": ctx.role}

    alfa, _ = make_member(db, "alfa", "ana@alfa.test", "editor")
    beta, _ = make_member(db, "beta", "bo@beta.test", "admin")
    ok = client.get("/api/v1/_test/ctx", headers=login_headers(client, "ana@alfa.test", alfa.id))
    assert ok.json() == {"org": alfa.id, "role": "editor"}
    denied = client.get("/api/v1/_test/ctx", headers=login_headers(client, "ana@alfa.test", beta.id))
    assert denied.status_code == 403


def test_seed_is_idempotent(db, monkeypatch):
    from app.core import config
    from app.modules.identity import seed as identity_seed
    from app.modules.identity.models import Membership, Organization, User

    monkeypatch.setattr(identity_seed, "settings", config.Settings(seed_admin_email="root@h.test", seed_admin_password="x" * 12))
    for _ in range(2):
        identity_seed.seed(db)
        db.commit()
    assert db.query(Organization).count() == 1
    assert db.query(User).count() == 1
    assert db.query(Membership).count() == 1
