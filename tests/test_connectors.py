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
        self.script = None  # callable(species) -> FetchResult | raises FetchError

    def fetch(self, species, fetch, today):
        self.calls.append((species.scientific_name, today))
        if self.script is not None:
            return self.script(species)
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
    assert sync.error == "Tope de 50 especies alcanzado"


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


NOT_FOUND = FetchResult("not_found", None, {}, None, None, None, "Sin coincidencia exacta en World Flora Online")


def test_first_run_failure_creates_error_snapshot(db, fake):
    sp = _species(db)
    fake.fail = True
    sync = csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    assert sync.status == "error" and sync.species_ok == 0 and sync.species_total == 1
    snap = db.scalars(select(ConnectorSnapshot).where(ConnectorSnapshot.species_id == sp.id)).one()
    assert snap.status == "error" and snap.payload == {} and snap.fetched_at is None
    assert snap.last_error == "fuente caída" and snap.reason is None


def test_not_found_persists_reason_and_fetched_at(db, fake):
    sp = _species(db)
    fake.script = lambda s: NOT_FOUND
    sync = csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    assert sync.status == "ok"
    snap = db.scalars(select(ConnectorSnapshot).where(ConnectorSnapshot.species_id == sp.id)).one()
    assert snap.status == "not_found" and snap.reason == "Sin coincidencia exacta en World Flora Online"
    assert snap.fetched_at is not None and snap.payload == {} and snap.last_error is None


def test_not_found_after_ok_replaces_payload(db, fake):
    sp = _species(db)
    csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    later = T0 + timedelta(minutes=11)
    fake.script = lambda s: NOT_FOUND
    csync.run_sync(db, "gbif", None, later, _fetcher_factory)
    db.expire_all()
    snap = db.scalars(select(ConnectorSnapshot).where(ConnectorSnapshot.species_id == sp.id)).one()
    assert snap.status == "not_found" and snap.payload == {} and snap.external_id is None
    assert snap.fetched_at.replace(tzinfo=timezone.utc) == later and snap.reason
    # y un ok posterior limpia el motivo
    fake.script = None
    csync.run_sync(db, "gbif", None, later + timedelta(minutes=11), _fetcher_factory)
    db.expire_all()
    snap = db.scalars(select(ConnectorSnapshot).where(ConnectorSnapshot.species_id == sp.id)).one()
    assert snap.status == "ok" and snap.reason is None and snap.payload["n"] == 1


def test_partial_run_from_mixed_failures_and_successes(db, fake):
    for name in ("Aaa one", "Bbb two", "Ccc three"):
        db.add(Species(scientific_name=name))
    db.commit()

    def script(species):
        if species.scientific_name == "Bbb two":
            raise FetchError("fuente caída")
        return FetchResult("ok", "1", {"n": 1}, None, None, None)

    fake.script = script
    sync = csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    assert sync.status == "partial" and sync.species_total == 3 and sync.species_ok == 2
    assert sync.error == "1 especies fallaron"
    statuses = {
        r.species_id: r.status for r in db.scalars(select(ConnectorSnapshot)).all()
    }
    assert sorted(statuses.values()) == ["error", "ok", "ok"]


def test_unexpected_exception_keeps_counts(db, fake):
    for name in ("Aaa one", "Bbb two"):
        db.add(Species(scientific_name=name))
    db.commit()

    def script(species):
        if species.scientific_name == "Bbb two":
            raise RuntimeError("boom")
        return FetchResult("ok", "1", {}, None, None, None)

    fake.script = script
    with pytest.raises(RuntimeError):
        csync.run_sync(db, "gbif", None, T0, _fetcher_factory)
    sync = db.scalars(select(ConnectorSync)).one()
    assert sync.status == "error" and sync.species_total == 2 and sync.species_ok == 1
