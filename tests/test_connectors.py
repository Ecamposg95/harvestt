import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.modules.catalog.models import Species
from app.modules.connectors import registry
from app.modules.connectors.models import ConnectorSnapshot
from app.modules.connectors.registry import SOURCES, get_source, source_status
from app.modules.identity.models import Organization
from app.modules.projects.models import CropCycle, Project


def test_registry_order_and_statuses(monkeypatch):
    assert [s.key for s in SOURCES] == ["gbif", "wfo", "wikidata", "genesys", "grin", "cimmyt", "inifap"]
    monkeypatch.setattr(registry, "settings", Settings(genesys_api_token=""))
    assert source_status("genesys") == "requires_credentials"
    monkeypatch.setattr(registry, "settings", Settings(genesys_api_token="x"))
    assert source_status("genesys") == "active"
    assert source_status("gbif") == "active"
    assert source_status("grin") == "in_construction"
    assert source_status("cimmyt") == "requires_alliance"
    assert get_source("wfo").label == "World Flora Online"
    with pytest.raises(KeyError):
        get_source("nope")


def _species(db):
    sp = Species(scientific_name="Lactuca sativa")
    db.add(sp)
    db.commit()
    return sp


def test_snapshot_unique_per_source_species(db):
    sp = _species(db)
    from app.core.mixins import utcnow

    for _ in range(2):
        db.add(ConnectorSnapshot(source="gbif", species_id=sp.id, status="ok", payload={}, last_attempt_at=utcnow()))
    with pytest.raises(IntegrityError):
        db.commit()


def test_cycle_accession_ref_defaults_null(db):
    sp = _species(db)
    org = Organization(name="Org", slug="org")
    db.add(org)
    db.commit()
    project = Project(organization_id=org.id, name="P", system="soil")
    db.add(project)
    db.commit()
    cycle = CropCycle(organization_id=org.id, project_id=project.id, species_id=sp.id)
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    assert cycle.accession_ref is None


# ---- Motor de sincronización (Tarea 2) ----
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.core.errors import AppError
from app.modules.catalog.models import Cultivar, SpeciesMedia, TraitAssertion
from app.modules.connectors import http as chttp
from app.modules.connectors import sync as csync
from app.modules.connectors.base import FetchResult
from app.modules.connectors.http import FetchError, make_fetcher
from app.modules.connectors.models import ConnectorSync

T0 = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)


class FakeConnector:
    key = "gbif"

    def __init__(self):
        self.fail = False
        self.calls = []

    def fetch(self, species, fetch, today):
        self.calls.append((species.scientific_name, today))
        if self.fail:
            raise FetchError("fuente caída")
        return FetchResult("ok", "123", {"n": 1, "today": today.isoformat()}, "CC0 1.0", "GBIF", "https://x")


@pytest.fixture
def fake(monkeypatch):
    conn = FakeConnector()
    monkeypatch.setitem(csync.CONNECTORS, "gbif", conn)
    return conn


def _fetcher_factory(key):
    return lambda url, body=None: {}


def test_sync_stores_copy_with_provenance(db, fake):
    sp = _species(db)
    sync = csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    assert sync.status == "ok" and sync.species_total == 1 and sync.species_ok == 1
    snap = db.scalars(select(ConnectorSnapshot).where(ConnectorSnapshot.species_id == sp.id)).one()
    assert snap.status == "ok" and snap.external_id == "123"
    assert snap.license == "CC0 1.0" and snap.attribution == "GBIF" and snap.source_url == "https://x"
    assert snap.payload["today"] == "2026-11-10"
    assert snap.fetched_at is not None and snap.last_error is None
    assert fake.calls == [("Lactuca sativa", date(2026, 11, 10))]


def test_failed_fetch_keeps_previous_copy(db, fake):
    sp = _species(db)
    csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    before = db.scalars(select(ConnectorSnapshot)).one()
    payload, fetched = dict(before.payload), before.fetched_at
    fake.fail = True
    sync = csync.run_sync(db, "gbif", None, T0 + timedelta(minutes=11), _fetcher_factory)
    assert sync.status == "error"
    db.expire_all()
    after = db.scalars(select(ConnectorSnapshot).where(ConnectorSnapshot.species_id == sp.id)).one()
    assert after.payload == payload and after.fetched_at == fetched
    assert after.last_error == "fuente caída" and after.status == "ok"


def test_sync_never_touches_catalog_rows(db, fake):
    sp = _species(db)
    db.add(Cultivar(species_id=sp.id, name="Romana"))
    db.commit()

    def snapshot():
        out = {}
        for model in (Species, Cultivar, TraitAssertion, SpeciesMedia):
            rows = db.scalars(select(model).order_by(model.id)).all()
            out[model.__tablename__] = [
                {c.name: getattr(r, c.name) for c in model.__table__.columns} for r in rows
            ]
        return out

    db.expire_all()
    before = snapshot()
    csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    db.expire_all()
    assert snapshot() == before


def test_sync_cooldown_and_running(db, fake):
    _species(db)
    csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    with pytest.raises(AppError) as exc:
        csync.run_sync(db, "gbif", None, T0 + timedelta(minutes=5), _fetcher_factory)
    assert exc.value.status_code == 429 and exc.value.code == "sync_cooldown"

    db.query(ConnectorSync).delete()
    db.add(ConnectorSync(source="gbif", status="running", started_at=T0 - timedelta(minutes=10)))
    db.commit()
    with pytest.raises(AppError) as exc:
        csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    assert exc.value.status_code == 409 and exc.value.code == "sync_running"

    db.query(ConnectorSync).delete()
    stale = ConnectorSync(source="gbif", status="running", started_at=T0 - timedelta(minutes=31))
    db.add(stale)
    db.commit()
    sync = csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    assert sync.status == "ok"
    db.refresh(stale)
    assert stale.status == "error" and "abandonada" in stale.error


def test_sync_refuses_informative_and_credentialless_sources(db, fake, monkeypatch):
    monkeypatch.setattr(registry, "settings", Settings(genesys_api_token=""))
    with pytest.raises(AppError) as exc:
        csync.run_sync(db, "grin", None, T0, _fetcher_factory)
    assert exc.value.status_code == 409 and exc.value.code == "connector_unavailable"
    monkeypatch.setitem(csync.CONNECTORS, "genesys", FakeConnector())
    with pytest.raises(AppError) as exc:
        csync.run_sync(db, "genesys", None, T0, _fetcher_factory)
    assert exc.value.status_code == 409 and exc.value.code == "connector_unavailable"


def test_sync_caps_species_and_is_partial(db, fake):
    for i in range(52):
        db.add(Species(scientific_name=f"Genus sp{i:02d}"))
    db.commit()
    sync = csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    assert sync.status == "partial" and sync.species_total == 50 and len(fake.calls) == 50


def test_make_fetcher_wraps_http_errors(monkeypatch):
    seen = {}

    def boom(request, timeout=None):
        seen["auth"] = request.get_header("Authorization")
        raise urllib.error.HTTPError(request.full_url, 500, "boom", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", boom)
    fetcher = make_fetcher(0, {"Authorization": "API-Token secreto"})
    with pytest.raises(FetchError) as exc:
        fetcher("https://example.test/x", None)
    assert seen["auth"] == "API-Token secreto"
    assert "Authorization" not in str(exc.value) and "secreto" not in str(exc.value)
    assert chttp.TIMEOUT == 30
