"""Exportación pública de la ontología: OWL (Turtle) y JSON. Solo términos publicados u obsoletos."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.ontology import review as reviews
from app.modules.ontology import service
from app.modules.ontology.models import OntologyTerm, TermEquivalence

LICENSE = "https://creativecommons.org/licenses/by/4.0/"
PUBLIC_STATUSES = ("published", "obsolete")


def iri(hvt_id: str, base_iri: str | None = None) -> str:
    return (settings.ontology_base_iri if base_iri is None else base_iri) + hvt_id.replace(":", "_")


def public_term(db: Session, hvt_id: str) -> OntologyTerm | None:
    """Resuelve `HVT:000001` o `HVT_000001`; solo términos públicos."""
    return db.scalars(
        select(OntologyTerm).where(
            OntologyTerm.hvt_id == hvt_id.replace("_", ":", 1),
            OntologyTerm.status.in_(PUBLIC_STATUSES),
            OntologyTerm.deleted_at.is_(None),
        )
    ).first()


def export_terms(db: Session) -> tuple[int, list[OntologyTerm]]:
    terms = list(db.scalars(
        select(OntologyTerm)
        .where(
            OntologyTerm.status.in_(PUBLIC_STATUSES),
            OntologyTerm.deleted_at.is_(None),
            OntologyTerm.hvt_id.is_not(None),
        )
        .order_by(OntologyTerm.hvt_id)
    ))
    return reviews.current_version(db), terms


def _equivalences(db: Session, terms: list[OntologyTerm]) -> dict[str, list[TermEquivalence]]:
    out: dict[str, list[TermEquivalence]] = {t.id: [] for t in terms}
    rows = db.scalars(
        select(TermEquivalence).where(TermEquivalence.deleted_at.is_(None))
        .order_by(TermEquivalence.scheme, TermEquivalence.external_id)
    )
    for row in rows:
        if row.term_id in out:
            out[row.term_id].append(row)
    return out


def _lit(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r")
    return f'"{escaped}"'


def _iri_ref(value: str) -> str:
    # Un IRI no admite estos caracteres sin codificar; se codifican en vez de romper el documento.
    for ch, rep in (("<", "%3C"), (">", "%3E"), ('"', "%22"), (" ", "%20"), ("{", "%7B"), ("}", "%7D"),
                    ("|", "%7C"), ("\\", "%5C"), ("^", "%5E"), ("`", "%60")):
        value = value.replace(ch, rep)
    return f"<{value}>"


def to_turtle(
    version: int,
    terms: list[OntologyTerm],
    base_iri: str,
    equivalences: dict[str, list[TermEquivalence]] | None = None,
    creators: dict[str, str] | None = None,
) -> str:
    equivalences = equivalences or {}
    creators = creators or {}
    by_id = {t.id: t for t in terms}
    lines = [
        "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
        "@prefix dcterms: <http://purl.org/dc/terms/> .",
        "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
        "",
        f"{_iri_ref(base_iri)} a owl:Ontology ;",
        f"    owl:versionInfo {_lit(str(version))} ;",
        f"    dcterms:license {_iri_ref(LICENSE)} ;",
        '    dcterms:title "Ontología HarvestT"@es .',
    ]
    for t in terms:
        props = [
            "a owl:Class",
            f"rdfs:label {_lit(t.label)}@es",
            f"skos:definition {_lit(t.definition)}@es",
            f"skos:notation {_lit(t.hvt_id)}",
        ]
        parent = by_id.get(t.parent_id) if t.parent_id else None
        if parent is not None:
            props.append(f"rdfs:subClassOf {_iri_ref(iri(parent.hvt_id, base_iri))}")
        for eq in equivalences.get(t.id, []):
            props.append(f"skos:{eq.match}Match {_iri_ref(eq.url)}")
        props.append(f"dcterms:creator {_lit(creators.get(t.id, service.TEAM_NAME))}")
        if t.status == "obsolete":
            props.append("owl:deprecated true")
            replaced = by_id.get(t.replaced_by_id) if t.replaced_by_id else None
            if replaced is not None:
                props.append(f"dcterms:isReplacedBy {_iri_ref(iri(replaced.hvt_id, base_iri))}")
        lines += ["", f"{_iri_ref(iri(t.hvt_id, base_iri))}", "    " + " ;\n    ".join(props) + " ."]
    return "\n".join(lines) + "\n"


def to_json(
    version: int,
    terms: list[OntologyTerm],
    equivalences: dict[str, list[TermEquivalence]] | None = None,
    creators: dict[str, str] | None = None,
    base_iri: str | None = None,
) -> dict:
    base_iri = settings.ontology_base_iri if base_iri is None else base_iri
    equivalences = equivalences or {}
    creators = creators or {}
    by_id = {t.id: t for t in terms}

    def ref(term_id: str | None) -> str | None:
        target = by_id.get(term_id) if term_id else None
        return iri(target.hvt_id, base_iri) if target is not None else None

    return {
        "version": version,
        "license": LICENSE,
        "base_iri": base_iri,
        "terms": [
            {
                "hvt_id": t.hvt_id,
                "iri": iri(t.hvt_id, base_iri),
                "domain": t.domain,
                "parent": ref(t.parent_id),
                "label": t.label,
                "definition": t.definition,
                "aliases": list(t.aliases or []),
                "unit": t.unit,
                "status": t.status,
                "replaced_by": ref(t.replaced_by_id),
                "creator": creators.get(t.id, service.TEAM_NAME),
                "equivalences": [
                    {"scheme": e.scheme, "external_id": e.external_id, "url": e.url,
                     "external_label": e.external_label, "match": e.match}
                    for e in equivalences.get(t.id, [])
                ],
            }
            for t in terms
        ],
    }


def build(db: Session) -> tuple[int, list[OntologyTerm], dict, dict]:
    version, terms = export_terms(db)
    return version, terms, _equivalences(db, terms), {t.id: service.proposer_name(db, t) for t in terms}
