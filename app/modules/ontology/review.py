"""Revisión de propuestas, ID permanente, versiones de la ontología y obsolescencia."""
from datetime import UTC, datetime

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, unprocessable
from app.modules.identity.models import User
from app.modules.ontology.models import OntologyRelease, OntologyTerm
from app.modules.ontology.schemas import EquivalencesIn, ObsoleteIn, ReleaseOut, ReviewIn
from app.modules.ontology.service import _audit, _check_duplicate, _check_parent, _set_equivalences

ACTION_STATUS = {"request_changes": "in_review", "reject": "rejected"}


ONTOLOGY_PUBLISH_LOCK = 7_250_002


def serialize_publications(db: Session) -> None:
    """Serializa publicaciones concurrentes (Postgres: candado asesor de transacción; SQLite: nada)."""
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": ONTOLOGY_PUBLISH_LOCK})


def current_version(db: Session, lock: bool = False) -> int:
    if lock:
        serialize_publications(db)
    return db.scalar(select(func.max(OntologyRelease.version))) or 0


def publish_release(db: Session, actor: User | None, note: str) -> int:
    """Toma el candado, calcula la siguiente versión y la crea. Sin confirmar: lo hace quien llama."""
    version = current_version(db, lock=True) + 1
    db.add(OntologyRelease(version=version, note=note[:300], published_by=actor.id if actor else None))
    db.flush()
    return version


def next_hvt_id(db: Session) -> str:
    """Mayor ID + 1 (el relleno con ceros hace que el orden léxico sea el numérico). Dentro del candado."""
    top = db.scalar(select(func.max(OntologyTerm.hvt_id)))
    return f"HVT:{(int(top[4:]) if top else 0) + 1:06d}"


def _lock_term(db: Session, term: OntologyTerm) -> None:
    """Toma el candado de publicación y recarga el término con bloqueo de fila antes de validar su estado."""
    serialize_publications(db)
    db.refresh(term, with_for_update=True)


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "conflict", "Otra publicación ocurrió al mismo tiempo; intenta de nuevo") from None


def review(db: Session, actor: User, term: OntologyTerm, data: ReviewIn) -> OntologyTerm:
    _lock_term(db, term)
    if term.status not in ("proposed", "in_review"):
        raise AppError(409, "already_reviewed", "El término ya fue revisado")
    if data.action == "approve":
        _check_parent(db, term.domain, term.parent_id)
        _check_duplicate(db, term.domain, term.label_key, exclude_id=term.id)
        version = publish_release(db, actor, f"Publicado: {term.label}")
        term.hvt_id = next_hvt_id(db)
        term.status = "published"
        term.published_in_version = version
    else:
        term.status = ACTION_STATUS[data.action]
    term.reviewed_by = actor.id
    term.reviewed_at = datetime.now(UTC)
    term.review_note = data.note
    _audit(db, actor, term, data.action, {"note": data.note, "hvt_id": term.hvt_id})
    _commit(db)
    db.refresh(term)
    return term


def _require_published(term: OntologyTerm) -> None:
    if term.status != "published":
        raise AppError(409, "not_published", "Solo un término publicado admite este cambio")


def obsolete(db: Session, actor: User, term: OntologyTerm, data: ObsoleteIn) -> OntologyTerm:
    _lock_term(db, term)
    _require_published(term)
    replacement = db.get(OntologyTerm, data.replaced_by_id)
    if (
        replacement is None or replacement.deleted_at is not None or replacement.id == term.id
        or replacement.status != "published"
    ):
        raise unprocessable("El reemplazo debe ser otro término publicado", {"field": "replaced_by_id"})
    version = publish_release(db, actor, f"Obsoleto: {term.label}")
    term.status = "obsolete"
    term.replaced_by_id = replacement.id
    term.obsoleted_in_version = version
    term.reviewed_by, term.reviewed_at, term.review_note = actor.id, datetime.now(UTC), data.note
    _audit(db, actor, term, "obsolete", {"note": data.note, "replaced_by_id": replacement.id})
    _commit(db)
    db.refresh(term)
    return term


def replace_equivalences(db: Session, actor: User, term: OntologyTerm, data: EquivalencesIn) -> OntologyTerm:
    _lock_term(db, term)
    _require_published(term)
    publish_release(db, actor, f"Equivalencias: {term.label}")
    _set_equivalences(db, term, data.equivalences)
    _audit(db, actor, term, "replace_equivalences", {"note": data.note, "count": len(data.equivalences)})
    _commit(db)
    db.refresh(term)
    return term


def releases(db: Session) -> list[ReleaseOut]:
    out = []
    for r in db.scalars(select(OntologyRelease).order_by(OntologyRelease.version.desc())):
        count = db.scalar(
            select(func.count()).select_from(OntologyTerm).where(
                OntologyTerm.deleted_at.is_(None),
                OntologyTerm.status.in_(("published", "obsolete")),
                OntologyTerm.published_in_version <= r.version,
            )
        )
        out.append(ReleaseOut(version=r.version, note=r.note, created_at=r.created_at, term_count=count or 0))
    return out


def review_queue(db: Session) -> list[OntologyTerm]:
    return list(db.scalars(
        select(OntologyTerm).where(OntologyTerm.deleted_at.is_(None), OntologyTerm.status.in_(("proposed", "in_review")))
        .order_by(OntologyTerm.created_at, OntologyTerm.id)
    ))
