from datetime import date, datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

T = TypeVar("T")

SystemLiteral = Literal["hydroponic", "substrate", "soil", "aeroponic", "other"]
CycleStatusLiteral = Literal["planned", "active", "finished", "cancelled"]
ObservationKindLiteral = Literal["note", "measurement", "incident", "task", "decision"]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


def _blank_to_none(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    objectives: str | None = Field(default=None, max_length=10000)
    area_m2: float | None = Field(default=None, gt=0)
    system: SystemLiteral = "other"
    location: str | None = Field(default=None, max_length=300)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre es obligatorio")
        return v

    @field_validator("objectives", "location", mode="before")
    @classmethod
    def _clean(cls, v):
        return _blank_to_none(v)


class ProjectUpdate(BaseModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    objectives: str | None = Field(default=None, max_length=10000)
    area_m2: float | None = Field(default=None, gt=0)
    system: SystemLiteral | None = None
    location: str | None = Field(default=None, max_length=300)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            raise ValueError("El nombre no puede quedar vacío")
        v = v.strip()
        if not v:
            raise ValueError("El nombre no puede quedar vacío")
        return v

    @field_validator("system")
    @classmethod
    def _system(cls, v):
        if v is None:
            raise ValueError("El sistema no puede quedar vacío")
        return v

    @field_validator("objectives", "location", mode="before")
    @classmethod
    def _clean(cls, v):
        return _blank_to_none(v)


class CropCycleCreate(BaseModel):
    species_id: str = Field(min_length=1, max_length=36)
    cultivar_id: str | None = Field(default=None, max_length=36)
    started_on: date | None = None
    stage: str = Field(default="unknown", min_length=1, max_length=60)
    status: CycleStatusLiteral = "planned"

    @field_validator("cultivar_id", mode="before")
    @classmethod
    def _clean(cls, v):
        return _blank_to_none(v)


class CropCycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    species_id: str
    species_name: str
    cultivar_id: str | None
    cultivar_name: str | None
    started_on: date | None
    stage: str
    status: str
    created_at: datetime


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    objectives: str | None
    area_m2: float | None
    system: str
    location: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class ProjectDetail(ProjectOut):
    crop_cycles: list[CropCycleOut]


class ObservationCreate(BaseModel):
    kind: ObservationKindLiteral = "note"
    content: str = Field(min_length=1, max_length=20000)
    crop_cycle_id: str | None = Field(default=None, max_length=36)
    observed_at: datetime | None = None

    @field_validator("content")
    @classmethod
    def _content(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El contenido es obligatorio")
        return v

    @field_validator("crop_cycle_id", mode="before")
    @classmethod
    def _clean(cls, v):
        return _blank_to_none(v)


class ObservationOut(BaseModel):
    id: str
    project_id: str
    crop_cycle_id: str | None
    kind: str
    content: str
    author_id: str
    author_name: str
    observed_at: datetime
    created_at: datetime
