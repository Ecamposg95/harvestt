from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.errors import AppError, forbidden, not_found, unprocessable
from app.modules.identity.models import User
from app.modules.ontology.models import ExternalConcept, OntologyTerm, TermEquivalence
from app.modules.ontology.schemas import EquivalenceOut, TermDetail, TermEdit, TermProposal, TermSummary
from app.modules.ontology.text import normalize_label

TEAM_NAME = "Equipo HarvestT"


def visible_terms(db: Session, user: User) -> Select:
    stmt = select(OntologyTerm).where(OntologyTerm.deleted_at.is_(None))
    if user.is_superadmin:
        return stmt
    return stmt.where(
        or_(OntologyTerm.status.in_(("published", "obsolete")), OntologyTerm.proposed_by == user.id)
    )


def list_terms(
    db: Session, user: User, domain: str | None, q: str | None, status: str | None, mine: bool = False
) -> list[OntologyTerm]:
    stmt = visible_terms(db, user)
    if domain:
        stmt = stmt.where(OntologyTerm.domain == domain)
    if status:
        stmt = stmt.where(OntologyTerm.status == status)
    if mine:
        stmt = stmt.where(OntologyTerm.proposed_by == user.id)
    terms = list(db.scalars(stmt.order_by(OntologyTerm.domain, OntologyTerm.label_key)))
    key = normalize_label(q) if q else ""
    if key:
        terms = [
            t for t in terms
            if key in t.label_key or any(key in normalize_label(a) for a in (t.aliases or []))
        ]
    return terms


def get_term(db: Session, user: User, term_id: str) -> OntologyTerm:
    term = db.scalars(visible_terms(db, user).where(OntologyTerm.id == term_id)).first()
    if term is None:
        raise not_found("término")
    return term


def _summary(term: OntologyTerm | None) -> TermSummary | None:
    return TermSummary.model_validate(term) if term else None


def proposer_name(db: Session, term: OntologyTerm) -> str:
    """Nombre de crédito: nunca el correo. Semilla = equipo; sin nombre = «Colaborador»."""
    proposer = db.get(User, term.proposed_by) if term.proposed_by else None
    return (proposer.full_name or "Colaborador") if proposer else TEAM_NAME


def term_detail(db: Session, term: OntologyTerm) -> TermDetail:
    equivalences = db.scalars(
        select(TermEquivalence).where(TermEquivalence.term_id == term.id, TermEquivalence.deleted_at.is_(None))
        .order_by(TermEquivalence.scheme, TermEquivalence.external_id)
    ).all()
    children = db.scalars(
        select(OntologyTerm).where(
            OntologyTerm.parent_id == term.id,
            OntologyTerm.deleted_at.is_(None),
            OntologyTerm.status.in_(("published", "obsolete")),
        ).order_by(OntologyTerm.label_key)
    ).all()
    base = TermSummary.model_validate(term).model_dump()
    return TermDetail(
        **base,
        definition=term.definition,
        aliases=list(term.aliases or []),
        equivalences=[EquivalenceOut.model_validate(e) for e in equivalences],
        parent=_summary(db.get(OntologyTerm, term.parent_id) if term.parent_id else None),
        children=[_summary(c) for c in children],
        replaced_by=_summary(db.get(OntologyTerm, term.replaced_by_id) if term.replaced_by_id else None),
        proposed_by_name=proposer_name(db, term),
        review_note=term.review_note,
        reviewed_at=term.reviewed_at,
        published_in_version=term.published_in_version,
        obsoleted_in_version=term.obsoleted_in_version,
    )


def _check_parent(db: Session, domain: str, parent_id: str | None) -> None:
    if parent_id is None:
        return
    parent = db.get(OntologyTerm, parent_id)
    if parent is None or parent.deleted_at is not None or parent.domain != domain or parent.status != "published":
        raise unprocessable("El término padre debe estar publicado y ser del mismo dominio", {"field": "parent_id"})


def _check_unit(domain: str, unit: str | None) -> None:
    if unit is not None and domain != "trait":
        raise unprocessable("La unidad solo aplica a rasgos", {"field": "unit"})


def _check_duplicate(db: Session, domain: str, label_key: str, exclude_id: str | None = None) -> None:
    stmt = select(OntologyTerm.id).where(
        OntologyTerm.domain == domain,
        OntologyTerm.label_key == label_key,
        OntologyTerm.status != "rejected",
        OntologyTerm.deleted_at.is_(None),
    )
    if exclude_id:
        stmt = stmt.where(OntologyTerm.id != exclude_id)
    if db.scalars(stmt).first() is not None:
        raise AppError(409, "term_exists", "Ya existe un término con esa etiqueta en este dominio", {"field": "label"})


def _set_equivalences(db: Session, term: OntologyTerm, items) -> None:
    seen = set()
    for item in items:
        key = (item.scheme, item.external_id)
        if key in seen:
            raise unprocessable("Equivalencia repetida", {"field": "equivalences"})
        seen.add(key)
    for old in db.scalars(select(TermEquivalence).where(TermEquivalence.term_id == term.id)):
        db.delete(old)
    db.flush()
    for item in items:
        db.add(TermEquivalence(
            term_id=term.id, scheme=item.scheme, external_id=item.external_id, url=str(item.url),
            external_label=item.external_label, match=item.match,
        ))


def _audit(db: Session, user: User, term: OntologyTerm, operation: str, data: dict) -> None:
    event = record(db, None, "ontology_term", term.id, operation, data)
    event.organization_id = None
    event.actor_id = user.id


def propose(db: Session, user: User, data: TermProposal) -> OntologyTerm:
    _check_parent(db, data.domain, data.parent_id)
    _check_unit(data.domain, data.unit)
    label_key = normalize_label(data.label)
    _check_duplicate(db, data.domain, label_key)
    term = OntologyTerm(
        domain=data.domain, parent_id=data.parent_id, label=data.label.strip(), label_key=label_key,
        definition=data.definition, aliases=list(data.aliases), unit=data.unit, status="proposed",
        proposed_by=user.id,
    )
    db.add(term)
    db.flush()
    _set_equivalences(db, term, data.equivalences)
    _audit(db, user, term, "propose", {"label": term.label, "domain": term.domain})
    db.commit()
    db.refresh(term)
    return term


def edit(db: Session, user: User, term: OntologyTerm, data: TermEdit) -> OntologyTerm:
    if term.proposed_by != user.id:
        raise forbidden("Solo quien propuso el término puede editarlo")
    if term.status not in ("proposed", "in_review"):
        raise AppError(409, "not_editable", "El término ya no se puede editar")
    fields = data.model_dump(exclude_unset=True)
    if "parent_id" in fields:
        _check_parent(db, term.domain, fields["parent_id"])
        term.parent_id = fields["parent_id"]
    if "unit" in fields:
        _check_unit(term.domain, fields["unit"])
        term.unit = fields["unit"]
    if fields.get("label") is not None:
        key = normalize_label(fields["label"])
        _check_duplicate(db, term.domain, key, exclude_id=term.id)
        term.label, term.label_key = fields["label"].strip(), key
    if fields.get("definition") is not None:
        term.definition = fields["definition"]
    if fields.get("aliases") is not None:
        term.aliases = list(fields["aliases"])
    if data.equivalences is not None:
        _set_equivalences(db, term, data.equivalences)
    term.status = "proposed"
    _audit(db, user, term, "edit", {"fields": sorted(fields)})
    db.commit()
    db.refresh(term)
    return term


def suggest(db: Session, q: str, limit: int = 10) -> list[ExternalConcept]:
    key = normalize_label(q)
    if len(key) < 2:
        return []
    stmt = select(ExternalConcept).where(ExternalConcept.deleted_at.is_(None))
    for word in key.split():
        stmt = stmt.where(ExternalConcept.label_key.contains(word, autoescape=True))
    return list(db.scalars(stmt.order_by(ExternalConcept.label_key).limit(limit)))
