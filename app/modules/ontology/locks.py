"""Candados de publicación de la ontología (compartidos por revisión y edición)."""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.modules.ontology.models import OntologyTerm

ONTOLOGY_PUBLISH_LOCK = 7_250_002


def serialize_publications(db: Session) -> None:
    """Serializa publicaciones concurrentes (Postgres: candado asesor de transacción; SQLite: nada)."""
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": ONTOLOGY_PUBLISH_LOCK})


def lock_term(db: Session, term: OntologyTerm) -> None:
    """Toma el candado de publicación y recarga el término con bloqueo de fila antes de validar su estado."""
    serialize_publications(db)
    db.refresh(term, with_for_update=True)
