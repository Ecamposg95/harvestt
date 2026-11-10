"""Ontología HarvestT: términos globales con ciclo de revisión, equivalencias externas y versiones."""
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, UUIDMixin

DOMAINS = ("organism", "plant", "trait", "environment", "place", "node")
TERM_STATUSES = ("proposed", "in_review", "published", "rejected", "obsolete")
MATCH_TYPES = ("exact", "close", "broad")
SCHEMES = (
    "ncbi_taxon", "wfo", "po", "bbch", "co", "ucum", "peco", "envo",
    "agrovoc", "geosparql", "koppen", "sosa", "ssn", "prov",
)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class OntologyTerm(UUIDMixin, AuditMixin, Base):
    """Término global (sin organización). proposed_by NULL = semilla del equipo."""

    __tablename__ = "ontology_terms"
    __table_args__ = (
        CheckConstraint(_in("domain", DOMAINS), name="ck_ontology_terms_domain"),
        CheckConstraint(_in("status", TERM_STATUSES), name="ck_ontology_terms_status"),
        Index("ix_ontology_terms_domain_label_key", "domain", "label_key"),
    )

    hvt_id: Mapped[str | None] = mapped_column(String(10), nullable=True, unique=True)
    seed_key: Mapped[str | None] = mapped_column(String(60), nullable=True, unique=True)
    domain: Mapped[str] = mapped_column(String(20), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("ontology_terms.id"), nullable=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    label_key: Mapped[str] = mapped_column(String(120), nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    aliases: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="proposed")
    proposed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    replaced_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("ontology_terms.id"), nullable=True)
    published_in_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    obsoleted_in_version: Mapped[int | None] = mapped_column(Integer, nullable=True)


class TermEquivalence(UUIDMixin, AuditMixin, Base):
    __tablename__ = "ontology_equivalences"
    __table_args__ = (
        CheckConstraint(_in("scheme", SCHEMES), name="ck_ontology_equivalences_scheme"),
        CheckConstraint(_in("match", MATCH_TYPES), name="ck_ontology_equivalences_match"),
        UniqueConstraint("term_id", "scheme", "external_id", name="uq_ontology_equivalences_term_scheme_ext"),
    )

    term_id: Mapped[str] = mapped_column(String(36), ForeignKey("ontology_terms.id"), nullable=False, index=True)
    scheme: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    external_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    match: Mapped[str] = mapped_column(String(5), nullable=False)


class ExternalConcept(UUIDMixin, AuditMixin, Base):
    """Concepto externo verificado contra la fuente oficial; base de la sugerencia de equivalencias."""

    __tablename__ = "ontology_external_concepts"
    __table_args__ = (
        UniqueConstraint("scheme", "external_id", name="uq_ontology_external_concepts_scheme_ext"),
    )

    scheme: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    label_key: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    verified_at: Mapped[date] = mapped_column(Date, nullable=False)
    verified_via: Mapped[str] = mapped_column(String(300), nullable=False)


class OntologyRelease(UUIDMixin, AuditMixin, Base):
    __tablename__ = "ontology_releases"

    version: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    note: Mapped[str] = mapped_column(String(300), nullable=False)
    published_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
