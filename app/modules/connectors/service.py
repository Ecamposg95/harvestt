"""Lectura de la copia local de bancos de datos para la ficha y el panel."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.catalog.models import Species
from app.modules.connectors.models import ConnectorSnapshot, ConnectorSync
from app.modules.connectors.registry import SOURCES, source_status
from app.modules.connectors.schemas import (
    BankSourceOut,
    BanksOut,
    ConnectorOut,
    CopiesCount,
    CopyOut,
    IdentityOut,
    LastSyncOut,
)
from app.modules.connectors.sync import CONNECTORS

IDENTITY_URLS = {
    "gbif": "https://www.gbif.org/species/{}",
    "wfo": "https://www.worldfloraonline.org/taxon/{}",
    "ncbi": "https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id={}",
    "wikidata": "https://www.wikidata.org/wiki/{}",
}


def is_stale(snap: ConnectorSnapshot) -> bool:
    return snap.last_error is not None and snap.fetched_at is not None


def copy_out(snap: ConnectorSnapshot) -> CopyOut:
    return CopyOut(
        status=snap.status,
        external_id=snap.external_id,
        payload=snap.payload or {},
        license=snap.license,
        attribution=snap.attribution,
        source_url=snap.source_url,
        fetched_at=snap.fetched_at,
        last_attempt_at=snap.last_attempt_at,
        last_error=snap.last_error,
        stale=is_stale(snap),
        reason=snap.reason,
    )


def _check(a: str | None, b: str | None) -> str:
    if not a or not b:
        return "unknown"
    return "match" if str(a) == str(b) else "mismatch"


def _identity(key: str, value, check: str = "unknown", detail: str | None = None) -> IdentityOut:
    value = str(value) if value not in (None, "") else None
    return IdentityOut(
        key=key, value=value, url=IDENTITY_URLS[key].format(value) if value else None,
        check=check, detail=detail,
    )


def identity_checks(species: Species, copies: dict[str, ConnectorSnapshot]) -> list[IdentityOut]:
    entry = (species.external_ids or {}).get("gbif")
    gbif = entry.get("id") if isinstance(entry, dict) else None
    wd = copies.get("wikidata")
    wd_ok = wd is not None and wd.status == "ok"
    wd_ids = ((wd.payload or {}).get("ids") or {}) if wd_ok else {}
    wfo_snap = copies.get("wfo")
    wfo = wfo_snap.external_id if wfo_snap is not None and wfo_snap.status == "ok" else None

    out = []
    gbif_check = _check(gbif, wd_ids.get("gbif")) if wd_ok else "unknown"
    out.append(_identity("gbif", gbif, gbif_check,
                         f"Wikidata indica {wd_ids.get('gbif')}" if gbif_check == "mismatch" else None))
    wfo_wd = wd_ids.get("wfo")
    wfo_check = _check(wfo, wfo_wd) if wd_ok else "unknown"
    out.append(_identity("wfo", wfo or wfo_wd, wfo_check,
                         f"Wikidata indica {wfo_wd}" if wfo_check == "mismatch" else None))
    ncbi = wd_ids.get("ncbi")
    out.append(_identity("ncbi", ncbi, "unknown", "Según Wikidata" if ncbi else None))
    out.append(_identity("wikidata", wd.external_id if wd_ok else None))
    return out


def species_banks(db: Session, species: Species) -> BanksOut:
    snaps = {
        s.source: s
        for s in db.scalars(select(ConnectorSnapshot).where(ConnectorSnapshot.species_id == species.id))
    }
    sources = [
        BankSourceOut(
            key=info.key, label=info.label, contribution=info.contribution,
            status=source_status(info.key), license_summary=info.license,
            copy_=copy_out(snaps[info.key]) if info.key in snaps else None,
        )
        for info in SOURCES
    ]
    return BanksOut(species_id=species.id, sources=sources, identity=identity_checks(species, snaps))


def connectors_panel(db: Session) -> list[ConnectorOut]:
    out = []
    for info in SOURCES:
        status = source_status(info.key)
        last = db.scalars(
            select(ConnectorSync).where(ConnectorSync.source == info.key)
            .order_by(ConnectorSync.started_at.desc()).limit(1)
        ).first()
        snaps = db.scalars(select(ConnectorSnapshot).where(ConnectorSnapshot.source == info.key)).all()
        out.append(ConnectorOut(
            key=info.key, label=info.label, contribution=info.contribution, license=info.license,
            url=info.url, status=status, can_sync=info.key in CONNECTORS and status == "active",
            last_sync=LastSyncOut.model_validate(last, from_attributes=True) if last else None,
            copies=CopiesCount(
                ok=sum(1 for s in snaps if s.status == "ok"),
                not_found=sum(1 for s in snaps if s.status == "not_found"),
                stale=sum(1 for s in snaps if is_stale(s)),
            ),
        ))
    return out
