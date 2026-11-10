"""Motor de sincronización: copia local por fuente y especie, con bloqueo y enfriamiento."""
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.modules.catalog.models import Species
from app.modules.connectors.base import Connector
from app.modules.connectors.http import FetchError, Fetcher, make_fetcher
from app.modules.connectors.models import ConnectorSnapshot, ConnectorSync
from app.modules.connectors.registry import source_status
from app.modules.identity.models import User

CONNECTORS: dict[str, Connector] = {}

SYNC_LOCK = 7_250_003
COOLDOWN = timedelta(minutes=10)
STALE_AFTER = timedelta(minutes=30)
MAX_SPECIES = 50

MIN_INTERVALS = {"gbif": 0.25, "wfo": 0.5, "wikidata": 1.0, "genesys": 1.0}


class SyncRefused(AppError):
    pass


def default_fetcher_factory(key: str) -> Fetcher:
    headers = None
    if key == "genesys":
        from app.modules.connectors import registry

        token = registry.settings.genesys_api_token
        headers = {"Authorization": f"API-Token {token}"} if token else None
    return make_fetcher(MIN_INTERVALS.get(key, 1.0), headers)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _start_run(db: Session, key: str, actor: User | None, now: datetime) -> ConnectorSync:
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": SYNC_LOCK})
    running = db.scalars(
        select(ConnectorSync).where(ConnectorSync.source == key, ConnectorSync.status == "running")
    ).all()
    for run in running:
        if now - _aware(run.started_at) < STALE_AFTER:
            db.rollback()
            raise SyncRefused(409, "sync_running", "Ya hay una sincronización en curso de esta fuente")
    last = db.scalars(
        select(ConnectorSync).where(ConnectorSync.source == key).order_by(ConnectorSync.started_at.desc()).limit(1)
    ).first()
    if last is not None and now - _aware(last.started_at) < COOLDOWN:
        db.rollback()
        raise SyncRefused(429, "sync_cooldown", "Esta fuente se sincronizó hace menos de 10 minutos")
    for run in running:
        run.status = "error"
        run.error = "abandonada"
        run.finished_at = now
    sync = ConnectorSync(source=key, status="running", started_at=now, actor_id=actor.id if actor else None)
    db.add(sync)
    db.commit()
    return sync


def run_sync(
    db: Session,
    key: str,
    actor: User | None,
    now: datetime,
    fetcher_factory: Callable[[str], Fetcher] | None = None,
) -> ConnectorSync:
    connector = CONNECTORS.get(key)
    if connector is None or source_status(key) != "active":
        raise SyncRefused(409, "connector_unavailable", "Esta fuente no se puede sincronizar")
    sync = _start_run(db, key, actor, now)
    sync_id = sync.id
    try:
        fetcher = (fetcher_factory or default_fetcher_factory)(key)
        all_species = db.scalars(
            select(Species).where(Species.deleted_at.is_(None)).order_by(Species.scientific_name)
        ).all()
        capped = len(all_species) > MAX_SPECIES
        done = failed = 0
        for species in all_species[:MAX_SPECIES]:
            snap = db.scalars(
                select(ConnectorSnapshot).where(
                    ConnectorSnapshot.source == key, ConnectorSnapshot.species_id == species.id
                )
            ).first()
            try:
                result = connector.fetch(species, fetcher, now.date())
            except FetchError as exc:
                failed += 1
                if snap is None:
                    # Sin copia previa: se registra el intento sin datos (nunca se finge una copia).
                    snap = ConnectorSnapshot(source=key, species_id=species.id, status="not_found", payload={})
                    db.add(snap)
                snap.last_attempt_at = now
                snap.last_error = str(exc)[:500]
            else:
                done += 1
                if snap is None:
                    snap = ConnectorSnapshot(source=key, species_id=species.id)
                    db.add(snap)
                snap.status = result.status
                snap.external_id = result.external_id
                snap.payload = result.payload
                snap.license = result.license
                snap.attribution = result.attribution
                snap.source_url = result.source_url
                snap.last_attempt_at = now
                snap.last_error = None
                snap.fetched_at = now if result.status == "ok" else snap.fetched_at
            db.commit()
        sync = db.get(ConnectorSync, sync_id)
        sync.species_total = min(len(all_species), MAX_SPECIES)
        sync.species_ok = done
        if done == 0 and failed > 0:
            sync.status = "error"
            sync.error = "Todas las especies fallaron"
        elif failed > 0 or capped:
            sync.status = "partial"
            sync.error = f"Se alcanzó el tope de {MAX_SPECIES} especies" if capped and not failed else None
        else:
            sync.status = "ok"
        sync.finished_at = now
        db.commit()
        return sync
    except Exception:
        db.rollback()
        sync = db.get(ConnectorSync, sync_id)
        sync.status = "error"
        sync.error = "Error inesperado"
        sync.finished_at = now
        db.commit()
        raise
