from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class CommonName(BaseModel):
    lang: str
    name: str


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    publisher: str | None
    url: str | None
    license: str | None
    accessed_at: datetime | None
    rights: dict[str, Any] | None


class CultivarOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    species_id: str
    name: str
    provenance: str | None


class SpeciesSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scientific_name: str
    authorship: str | None
    common_names: list[CommonName]
    family: str | None


class EvidenceRef(BaseModel):
    source_id: str
    locator: str | None = None


class TraitAssertionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subject_type: str
    subject_id: str
    variable: str
    value_min: float | None
    value_max: float | None
    unit: str | None
    growth_stage: str
    cultivation_system: str
    origin: str
    review_status: str
    evidence_refs: list[EvidenceRef]
    notes: str | None
    sources: list[SourceOut] = []


class SpeciesDetail(SpeciesSummary):
    external_ids: dict[str, Any] | None
    summary: str | None
    cultivars: list[CultivarOut]
    trait_assertions: list[TraitAssertionOut]
    sources: list[SourceOut]
