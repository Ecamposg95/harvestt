"""Puente entre los datos libres existentes y los términos de la ontología.

Nunca se inventan correspondencias: solo se enlaza por igualdad exacta (tras normalizar) con la
etiqueta o un alias de un término publicado. El texto original no se toca.
"""
import logging
from typing import NamedTuple

from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.deps import RequestContext
from app.core.tenant import scoped
from app.modules.catalog.models import Species, TraitAssertion
from app.modules.ontology.models import OntologyTerm
from app.modules.ontology.text import normalize_label
from app.modules.projects.models import CropCycle, Project

log = logging.getLogger(__name__)

NOT_MAPPED = {"", "unknown", "other"}


class Field(NamedTuple):
    model: type
    text_column: str
    term_column: str
    domain: str


FIELD_MAP = (
    Field(TraitAssertion, "variable", "variable_term_id", "trait"),
    Field(TraitAssertion, "growth_stage", "growth_stage_term_id", "plant"),
    Field(TraitAssertion, "cultivation_system", "cultivation_system_term_id", "environment"),
    Field(CropCycle, "stage", "stage_term_id", "plant"),
    Field(Project, "system", "system_term_id", "environment"),
    Field(Species, "scientific_name", "term_id", "organism"),
)


class TermUsage(BaseModel):
    species: int
    assertions: int
    projects: int
    cycles: int


def _index(db: Session, domain: str) -> dict[str, set[str]]:
    """clave normalizada -> ids de términos publicados que la reclaman (etiqueta o alias)."""
    index: dict[str, set[str]] = {}
    terms = db.scalars(select(OntologyTerm).where(
        OntologyTerm.domain == domain, OntologyTerm.status == "published", OntologyTerm.deleted_at.is_(None),
    ))
    for term in terms:
        for key in (term.label_key, *(normalize_label(a) for a in term.aliases or [])):
            index.setdefault(key, set()).add(term.id)
    return index


def _lookup(index: dict[str, set[str]], raw: str | None) -> str | None:
    if raw is None:
        return None
    key = normalize_label(raw)
    if key in NOT_MAPPED:
        return None
    ids = index.get(key, set())
    return next(iter(ids)) if len(ids) == 1 else None  # ambigua = no se adivina


def resolve(db: Session, domain: str, raw: str | None) -> str | None:
    if raw is None or normalize_label(raw) in NOT_MAPPED:
        return None
    return _lookup(_index(db, domain), raw)


def _species_text(row: Species) -> str:
    name, author = row.scientific_name, (row.authorship or "").strip()
    if author and name.rstrip().endswith(author):
        return name.rstrip()[: -len(author)].strip()
    return name


def relink(db: Session) -> dict[str, int]:
    """Llena solo los `*_term_id` en NULL. Devuelve cuántos enlazó por campo."""
    indexes: dict[str, dict[str, set[str]]] = {}
    counts: dict[str, int] = {}
    for field in FIELD_MAP:
        index = indexes.setdefault(field.domain, _index(db, field.domain))
        term_col = getattr(field.model, field.term_column)
        stmt = select(field.model).where(term_col.is_(None))
        if hasattr(field.model, "deleted_at"):
            stmt = stmt.where(field.model.deleted_at.is_(None))
        n = 0
        for row in db.scalars(stmt):
            raw = _species_text(row) if field.model is Species else getattr(row, field.text_column)
            term_id = _lookup(index, raw)
            if term_id is not None:
                setattr(row, field.term_column, term_id)
                n += 1
        counts[f"{field.model.__name__}.{field.text_column}"] = n
    db.flush()
    return counts


def term_usage(db: Session, ctx: RequestContext, term_id: str) -> TermUsage:
    def count(stmt) -> int:
        return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    return TermUsage(
        species=count(select(Species.id).where(Species.term_id == term_id, Species.deleted_at.is_(None))),
        assertions=count(select(TraitAssertion.id).where(
            TraitAssertion.deleted_at.is_(None),
            (TraitAssertion.variable_term_id == term_id)
            | (TraitAssertion.growth_stage_term_id == term_id)
            | (TraitAssertion.cultivation_system_term_id == term_id),
        )),
        projects=count(scoped(Project, ctx).where(Project.system_term_id == term_id).with_only_columns(Project.id)),
        cycles=count(scoped(CropCycle, ctx).where(CropCycle.stage_term_id == term_id).with_only_columns(CropCycle.id)),
    )
