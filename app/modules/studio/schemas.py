from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

Meters = Annotated[float, Field(ge=0, le=1000, allow_inf_nan=False)]
Size = Annotated[float, Field(gt=0, le=1000, allow_inf_nan=False)]
StageLiteral = Literal["seedling", "vegetative", "mature"]


class PlacementIn(BaseModel):
    species_id: str = Field(min_length=1, max_length=36)
    crop_cycle_id: str | None = Field(default=None, max_length=36)
    stage: StageLiteral = "vegetative"
    x: Meters
    y: Meters
    rotation: float = Field(default=0.0, ge=-360, le=360, allow_inf_nan=False)

    @field_validator("crop_cycle_id", mode="before")
    @classmethod
    def _blank(cls, v):
        return None if isinstance(v, str) and not v.strip() else v


class ZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    x: Meters
    y: Meters
    width: Size
    depth: Size
    placements: list[PlacementIn] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El nombre de la zona es obligatorio")
        return v


class LayoutIn(BaseModel):
    version: int = Field(ge=0)
    zones: list[ZoneIn] = Field(default_factory=list)


class PlacementOut(BaseModel):
    id: str
    zone_id: str
    species_id: str
    species_name: str
    crop_cycle_id: str | None
    stage: str
    x: float
    y: float
    rotation: float


class ZoneOut(BaseModel):
    id: str
    name: str
    x: float
    y: float
    width: float
    depth: float
    placements: list[PlacementOut]


class FloorOut(BaseModel):
    width: float
    depth: float
    # true: el proyecto no tiene área; el piso es solo un lienzo de dibujo
    illustrative: bool


class LayoutOut(BaseModel):
    project_id: str
    version: int
    area_m2: float | None
    floor: FloorOut
    zones: list[ZoneOut]
