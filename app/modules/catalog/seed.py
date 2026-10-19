"""Seed idempotente del catálogo global.

Reglas:
- Identidad taxonómica: los `usageKey` de GBIF se verificaron el 2026-10-19 contra la API oficial
  (`GET https://api.gbif.org/v1/species/match?name=<nombre>&strict=true` → matchType EXACT, status ACCEPTED).
  La licencia CC BY 4.0 del GBIF Backbone Taxonomy se confirmó en
  `GET https://api.gbif.org/v1/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c`.
- Ninguna cifra agronómica: las afirmaciones iniciales se crean con `origin="missing"` y valores nulos
  para que la interfaz muestre "Desconocido" hasta tener evidencia trazable.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.catalog.models import (
    ORIGIN_MISSING,
    REVIEW_UNREVIEWED,
    SUBJECT_SPECIES,
    UNKNOWN,
    Source,
    Species,
    TraitAssertion,
)

GBIF_SOURCE = {
    "title": "GBIF Backbone Taxonomy",
    "publisher": "GBIF",
    "url": "https://www.gbif.org/",
    "license": "CC BY 4.0",
    "rights": {"metadata": True, "attribution_required": True},
}
GBIF_VERIFIED_AT = "2026-10-19"

SPECIES = [
    {
        "scientific_name": "Lactuca sativa L.",
        "authorship": "L.",
        "family": "Asteraceae",
        "common_names": [{"lang": "es", "name": "lechuga"}, {"lang": "en", "name": "lettuce"}],
        "gbif": {"id": "7403263", "match_type": "EXACT", "status": "ACCEPTED"},
    },
    {
        "scientific_name": "Solanum lycopersicum L.",
        "authorship": "L.",
        "family": "Solanaceae",
        "common_names": [{"lang": "es", "name": "tomate"}, {"lang": "en", "name": "tomato"}],
        "gbif": {"id": "2930137", "match_type": "EXACT", "status": "ACCEPTED"},
    },
    {
        "scientific_name": "Ocimum basilicum L.",
        "authorship": "L.",
        "family": "Lamiaceae",
        "common_names": [{"lang": "es", "name": "albahaca"}, {"lang": "en", "name": "basil"}],
        "gbif": {"id": "2927096", "match_type": "EXACT", "status": "ACCEPTED"},
    },
]

# Variables sin evidencia todavía: se registran como faltantes, nunca con valores supuestos.
MISSING_VARIABLES = [
    ("air_temperature", "Cel"),
    ("relative_humidity", "%"),
    ("photoperiod", "h"),
    ("ph", "[pH]"),
]


def _ensure_gbif_source(db: Session) -> Source:
    source = db.scalar(
        select(Source).where(Source.title == GBIF_SOURCE["title"], Source.url == GBIF_SOURCE["url"])
    )
    if source is None:
        source = Source(**GBIF_SOURCE, accessed_at=datetime.now(timezone.utc))
        db.add(source)
        db.flush()
    return source


def _ensure_missing_assertions(db: Session, species: Species) -> None:
    existing = set(
        db.scalars(
            select(TraitAssertion.variable).where(
                TraitAssertion.subject_type == SUBJECT_SPECIES, TraitAssertion.subject_id == species.id
            )
        )
    )
    for variable, unit in MISSING_VARIABLES:
        if variable in existing:
            continue
        db.add(
            TraitAssertion(
                subject_type=SUBJECT_SPECIES,
                subject_id=species.id,
                variable=variable,
                value_min=None,
                value_max=None,
                unit=unit,
                growth_stage=UNKNOWN,
                cultivation_system=UNKNOWN,
                origin=ORIGIN_MISSING,
                review_status=REVIEW_UNREVIEWED,
                evidence_refs=[],
                notes="Sin evidencia registrada.",
            )
        )


def seed(db: Session) -> None:
    gbif = _ensure_gbif_source(db)
    for data in SPECIES:
        species = db.scalar(select(Species).where(Species.scientific_name == data["scientific_name"]))
        if species is None:
            gbif_id = data["gbif"]["id"]
            species = Species(
                scientific_name=data["scientific_name"],
                authorship=data["authorship"],
                family=data["family"],
                common_names=data["common_names"],
                external_ids={
                    "gbif": {
                        **data["gbif"],
                        "source_id": gbif.id,
                        "url": f"https://www.gbif.org/species/{gbif_id}",
                        "verified_at": GBIF_VERIFIED_AT,
                    }
                },
                summary=None,
            )
            db.add(species)
            db.flush()
        _ensure_missing_assertions(db, species)
    db.flush()
