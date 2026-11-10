"""Semilla idempotente de la ontología: vocabularios externos verificados y términos del equipo.

Reglas:
- Cada concepto de `data/external_concepts.json` se verificó contra su fuente oficial con
  `python -m scripts.ontology.verify_external` (fecha y vía en `verified_at` / `verified_via`).
  Lo que no salió `OK` se quitó; nunca se aproxima un identificador.
- Los términos de `data/seed_terms.json` se publican con `proposed_by=None` («Equipo HarvestT»).
- Un término ya existente (por `seed_key`) nunca se modifica, aunque haya cambiado en el archivo:
  un término publicado solo cambia por revisión. Los términos nuevos del archivo se publican en
  una versión nueva de la ontología, con IDs `HVT:` consecutivos en el orden del archivo.
- Si ya existe en la base otra etiqueta igual (normalizada) en el mismo dominio, el término de la
  semilla se omite (y con él sus descendientes) para no duplicar; queda en el log.
"""
import json
import logging
from datetime import UTC, date, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.ontology.models import ExternalConcept, OntologyTerm, TermEquivalence
from app.modules.ontology.review import next_hvt_id, publish_release, serialize_publications
from app.modules.ontology.text import normalize_label

log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
CONCEPTS_FILE = DATA_DIR / "external_concepts.json"
TERMS_FILE = DATA_DIR / "seed_terms.json"
SEED_NOTE = "Vocabulario semilla del equipo"


def _load(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def _upsert_concepts(db: Session) -> dict[tuple[str, str], ExternalConcept]:
    existing = {(c.scheme, c.external_id): c for c in db.scalars(select(ExternalConcept))}
    for item in _load(CONCEPTS_FILE):
        key = (item["scheme"], item["external_id"])
        concept = existing.get(key)
        if concept is None:
            concept = existing[key] = ExternalConcept(scheme=item["scheme"], external_id=item["external_id"])
            db.add(concept)
        concept.label = item["label"]
        concept.label_key = normalize_label(item["label"])
        concept.url = item["url"]
        concept.verified_at = date.fromisoformat(item["verified_at"])
        concept.verified_via = item["verified_via"]
    db.flush()
    return existing


def _taken_labels(db: Session) -> set[tuple[str, str]]:
    """Etiquetas ocupadas, con el mismo criterio que la propuesta (todo salvo rechazados y borrados)."""
    rows = db.execute(select(OntologyTerm.domain, OntologyTerm.label_key).where(
        OntologyTerm.status != "rejected", OntologyTerm.deleted_at.is_(None),
    ))
    return {(domain, key) for domain, key in rows}


def seed(db: Session) -> None:
    serialize_publications(db)  # otra instancia arrancando a la vez espera aquí
    concepts = _upsert_concepts(db)
    items = _load(TERMS_FILE)
    term_ids, parents_ok = {}, set()  # parents_ok: semillas publicadas, válidas como padre
    for key, term_id, status in db.execute(
        select(OntologyTerm.seed_key, OntologyTerm.id, OntologyTerm.status).where(OntologyTerm.seed_key.is_not(None))
    ):
        term_ids[key] = term_id
        if status == "published":
            parents_ok.add(key)
    taken = _taken_labels(db)
    new = []
    for item in items:
        key, parent = item["seed_key"], item["parent_seed_key"]
        if key in term_ids:
            continue
        if parent is not None and parent not in parents_ok:
            log.warning("ontología: semilla %s omitida, su padre %s no está publicado", key, parent)
            continue
        label_key = (item["domain"], normalize_label(item["label"]))
        if label_key in taken:
            log.warning("ontología: semilla %s omitida, la etiqueta «%s» ya existe", key, item["label"])
            continue
        taken.add(label_key)
        parents_ok.add(key)
        new.append(item)
    if not new:
        return

    version = publish_release(db, None, f"Semilla: {len(new)} términos")
    now = datetime.now(UTC)
    for item in new:
        parent = item["parent_seed_key"]
        term = OntologyTerm(
            seed_key=item["seed_key"], domain=item["domain"],
            parent_id=term_ids[parent] if parent else None,
            label=item["label"], label_key=normalize_label(item["label"]), definition=item["definition"],
            aliases=list(item["aliases"]), unit=item["unit"], status="published", proposed_by=None,
            reviewed_at=now, review_note=SEED_NOTE, published_in_version=version, hvt_id=next_hvt_id(db),
        )
        db.add(term)
        db.flush()
        term_ids[item["seed_key"]] = term.id
        for eq in item["equivalences"]:
            concept = concepts[(eq["scheme"], eq["external_id"])]
            db.add(TermEquivalence(
                term_id=term.id, scheme=eq["scheme"], external_id=eq["external_id"], url=concept.url,
                external_label=concept.label, match=eq["match"],
            ))
    db.flush()
    log.info("ontología: semilla publicó %d términos en la versión %d", len(new), version)
