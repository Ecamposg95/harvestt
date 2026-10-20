from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

StatusLiteral = Literal["concept", "design", "in_construction", "testing", "operational", "retired"]
KindLiteral = Literal["image", "model_stl"]


class Spec(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=200)
    unit: str | None = Field(default=None, max_length=30)

    @field_validator("label", "value")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("no puede estar vacío")
        return v

    @field_validator("unit")
    @classmethod
    def _strip_unit(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class PrototypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=120, pattern=SLUG_PATTERN)
    codename: str | None = Field(default=None, max_length=80)
    purpose: str = Field(default="", max_length=300)
    summary: str = Field(default="", max_length=5000)
    description: str = Field(default="", max_length=50000)
    status: StatusLiteral = "concept"
    specs: list[Spec] = Field(default_factory=list, max_length=60)
    is_public: bool = False
    sort_order: int = Field(default=0, ge=-100000, le=100000)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("el nombre es obligatorio")
        return v


class PrototypeUpdate(BaseModel):
    version: int
    name: str | None = Field(default=None, min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=120, pattern=SLUG_PATTERN)
    codename: str | None = Field(default=None, max_length=80)
    purpose: str | None = Field(default=None, max_length=300)
    summary: str | None = Field(default=None, max_length=5000)
    description: str | None = Field(default=None, max_length=50000)
    status: StatusLiteral | None = None
    specs: list[Spec] | None = Field(default=None, max_length=60)
    is_public: bool | None = None
    sort_order: int | None = Field(default=None, ge=-100000, le=100000)
    hero_asset_id: str | None = None


class AssetUpdate(BaseModel):
    caption: str | None = Field(default=None, max_length=300)
    is_public: bool | None = None
    sort_order: int | None = Field(default=None, ge=-100000, le=100000)


Coord = Annotated[float, Field(ge=-1e9, le=1e9, allow_inf_nan=False)]


def _clean_label(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        raise ValueError("la etiqueta es obligatoria")
    return v


class HotspotCreate(BaseModel):
    asset_id: str = Field(min_length=1, max_length=36)
    label: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=500)
    x: Coord
    y: Coord
    z: Coord
    sort_order: int | None = Field(default=None, ge=-100000, le=100000)

    @field_validator("label")
    @classmethod
    def _label(cls, v: str | None) -> str | None:
        return _clean_label(v)

    @field_validator("description")
    @classmethod
    def _strip_description(cls, v: str) -> str:
        return v.strip()


class HotspotUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=500)
    x: Coord | None = None
    y: Coord | None = None
    z: Coord | None = None
    sort_order: int | None = Field(default=None, ge=-100000, le=100000)

    @field_validator("label")
    @classmethod
    def _label(cls, v: str | None) -> str | None:
        return _clean_label(v)

    @field_validator("description")
    @classmethod
    def _strip_description(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


# ---- Salidas internas ----


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    prototype_id: str
    kind: str
    filename: str
    content_type: str
    size_bytes: int
    checksum_sha256: str
    caption: str
    is_public: bool
    sort_order: int
    created_at: datetime


class HotspotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    prototype_id: str
    asset_id: str
    label: str
    description: str
    x: float
    y: float
    z: float
    sort_order: int
    created_at: datetime


class PrototypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    codename: str | None
    purpose: str
    summary: str
    description: str
    status: str
    specs: list[Spec]
    is_public: bool
    published_at: datetime | None
    sort_order: int
    hero_asset_id: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class PrototypeDetailOut(PrototypeOut):
    assets: list[AssetOut]


# ---- Salidas públicas (nunca incluyen storage_key, organization_id, checksum ni assets privados) ----


class PublicAssetOut(BaseModel):
    id: str
    kind: str
    filename: str
    content_type: str
    size_bytes: int
    caption: str
    url: str


class PublicPrototypeSummary(BaseModel):
    slug: str
    name: str
    codename: str | None
    purpose: str
    summary: str
    status: str
    published_at: datetime | None
    hero: PublicAssetOut | None


class PublicPrototypeDetail(PublicPrototypeSummary):
    description: str
    specs: list[Spec]
    assets: list[PublicAssetOut]
