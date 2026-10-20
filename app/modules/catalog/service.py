import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.modules.catalog.models import SUBJECT_CULTIVAR, SUBJECT_SPECIES, Source, Species, SpeciesMedia, TraitAssertion
from app.modules.catalog.schemas import SourceOut, SpeciesDetail, SpeciesMediaOut, TraitAssertionOut


def fold(text: str) -> str:
    """Minúsculas y sin acentos para búsqueda tolerante ("Albahaca" ≈ "albahaca")."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _matches(species: Species, needle: str) -> bool:
    names = [species.scientific_name]
    names += [n.get("name", "") for n in (species.common_names or []) if isinstance(n, dict)]
    return any(needle in fold(n) for n in names if n)


def search_species(
    db: Session, q: str | None, family: str | None, page: int, page_size: int
) -> tuple[list[Species], int]:
    stmt = select(Species).where(Species.deleted_at.is_(None))
    if family and family.strip():
        stmt = stmt.where(func.lower(Species.family) == family.strip().lower())
    stmt = stmt.order_by(Species.scientific_name)

    needle = fold(q.strip()) if q and q.strip() else ""
    if needle:
        # Los nombres comunes viven en JSON: se filtra en Python para ser portable (SQLite/Postgres)
        # y tolerante a mayúsculas y acentos. El catálogo global es pequeño en P0.
        matches = [s for s in db.scalars(stmt) if _matches(s, needle)]
        start = (page - 1) * page_size
        return matches[start : start + page_size], len(matches)

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = list(db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)))
    return items, total


def list_families(db: Session) -> list[str]:
    stmt = (
        select(Species.family)
        .where(Species.deleted_at.is_(None), Species.family.is_not(None))
        .distinct()
        .order_by(Species.family)
    )
    return [f for f in db.scalars(stmt) if f]


def get_species_or_404(db: Session, species_id: str) -> Species:
    species = db.get(Species, species_id)
    if species is None or species.deleted_at is not None:
        raise not_found("especie")
    return species


def get_source_or_404(db: Session, source_id: str) -> Source:
    source = db.get(Source, source_id)
    if source is None or source.deleted_at is not None:
        raise not_found("fuente")
    return source


def _external_source_ids(external_ids: dict | None) -> list[str]:
    return [
        v["source_id"] for v in (external_ids or {}).values() if isinstance(v, dict) and v.get("source_id")
    ]


def active_media(db: Session, species_id: str) -> list[SpeciesMedia]:
    stmt = (
        select(SpeciesMedia)
        .where(SpeciesMedia.species_id == species_id, SpeciesMedia.deleted_at.is_(None))
        .order_by(SpeciesMedia.is_hero.desc(), SpeciesMedia.created_at)
    )
    return list(db.scalars(stmt))


def media_out(media: SpeciesMedia) -> SpeciesMediaOut:
    """Sin storage_key ni checksum; la URL es relativa al cliente de la API."""
    return SpeciesMediaOut(
        id=media.id,
        species_id=media.species_id,
        kind=media.kind,
        content_type=media.content_type,
        license=media.license,
        attribution=media.attribution,
        source_url=media.source_url,
        is_hero=media.is_hero,
        width=media.width,
        height=media.height,
        callouts=media.callouts or [],
        url=f"/plants/{media.species_id}/media/{media.id}/file",
        created_at=media.created_at,
    )


def species_detail(db: Session, species: Species) -> SpeciesDetail:
    cultivars = [c for c in species.cultivars if c.deleted_at is None]
    subject_filter = (TraitAssertion.subject_type == SUBJECT_SPECIES) & (TraitAssertion.subject_id == species.id)
    if cultivars:
        subject_filter = subject_filter | (
            (TraitAssertion.subject_type == SUBJECT_CULTIVAR)
            & (TraitAssertion.subject_id.in_([c.id for c in cultivars]))
        )
    assertions = list(
        db.scalars(
            select(TraitAssertion)
            .where(subject_filter, TraitAssertion.deleted_at.is_(None))
            .order_by(TraitAssertion.subject_type.desc(), TraitAssertion.variable)
        )
    )

    source_ids = _external_source_ids(species.external_ids)
    for a in assertions:
        source_ids += [
            r["source_id"] for r in (a.evidence_refs or []) if isinstance(r, dict) and r.get("source_id")
        ]
    unique_ids = list(dict.fromkeys(source_ids))
    sources: dict[str, SourceOut] = {}
    if unique_ids:
        rows = db.scalars(select(Source).where(Source.id.in_(unique_ids), Source.deleted_at.is_(None)))
        sources = {s.id: SourceOut.model_validate(s) for s in rows}

    assertion_out = []
    for a in assertions:
        out = TraitAssertionOut.model_validate(a)
        out.sources = [sources[r.source_id] for r in out.evidence_refs if r.source_id in sources]
        assertion_out.append(out)

    return SpeciesDetail(
        id=species.id,
        scientific_name=species.scientific_name,
        authorship=species.authorship,
        common_names=species.common_names or [],
        family=species.family,
        external_ids=species.external_ids,
        summary=species.summary,
        cultivars=cultivars,
        trait_assertions=assertion_out,
        sources=[sources[i] for i in unique_ids if i in sources],
        media=[media_out(m) for m in active_media(db, species.id)],
    )
