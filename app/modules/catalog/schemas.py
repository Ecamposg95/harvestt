from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class MediaCallout(BaseModel):
    trait_variable: str = Field(min_length=1, max_length=60)
    x: float = Field(ge=0, le=1, allow_inf_nan=False)
    y: float = Field(ge=0, le=1, allow_inf_nan=False)

    @field_validator("trait_variable")
    @classmethod
    def _variable(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La variable del callout es obligatoria")
        return v


class SpeciesMediaMeta(BaseModel):
    kind: Literal["photo", "render"] = "photo"
    license: str = Field(default="", max_length=120)
    attribution: str = Field(default="", max_length=300)
    source_url: str | None = Field(default=None, max_length=500)
    is_hero: bool = False
    callouts: list[MediaCallout] = Field(default_factory=list, max_length=12)

    @field_validator("license")
    @classmethod
    def _license(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La licencia es obligatoria (identificador SPDX o nombre)")
        return v

    @field_validator("attribution")
    @classmethod
    def _attribution(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("La atribución es obligatoria")
        return v

    @field_validator("source_url")
    @classmethod
    def _source_url(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if not v:
            return None
        if not v.startswith(("https://", "http://")):
            raise ValueError("La URL de la fuente debe empezar con http:// o https://")
        return v


class SpeciesMediaOut(BaseModel):
    id: str
    species_id: str
    kind: str
    content_type: str
    license: str
    attribution: str
    source_url: str | None
    is_hero: bool
    width: int | None
    height: int | None
    callouts: list[MediaCallout]
    url: str
    created_at: datetime


class SpeciesDetail(SpeciesSummary):
    external_ids: dict[str, Any] | None
    summary: str | None
    cultivars: list[CultivarOut]
    trait_assertions: list[TraitAssertionOut]
    sources: list[SourceOut]
    media: list[SpeciesMediaOut] = []
