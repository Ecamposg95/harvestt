from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RecognitionIn(BaseModel):
    award: str = Field(min_length=1, max_length=120)
    event: str = Field(min_length=1, max_length=200)
    venue: str = Field(min_length=1, max_length=200)
    awarded_on: date
    prototype_id: str | None = None
    evidence: str = Field(min_length=3, max_length=500)
    sort_order: int = 0


class RecognitionOut(RecognitionIn):
    model_config = ConfigDict(from_attributes=True)

    id: str


class RequestIn(BaseModel):
    kind: Literal["node", "contact"]
    name: str = Field(min_length=2, max_length=120)
    organization: str | None = Field(default=None, max_length=200)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    city: str | None = Field(default=None, max_length=120)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    message: str = Field(min_length=10, max_length=2000)
    website: str = ""  # campo trampa anti-bots

    @model_validator(mode="after")
    def _coords_together(self) -> "RequestIn":
        if (self.lat is None) != (self.lon is None):
            raise ValueError("lat y lon deben enviarse juntos")
        return self


class RequestAck(BaseModel):
    received: bool = True


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    name: str
    organization: str | None
    email: str
    city: str | None
    lat: float | None
    lon: float | None
    message: str
    status: str
    review_note: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    created_at: datetime


class RequestReview(BaseModel):
    status: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=500)


class VisionFigure(BaseModel):
    key: str
    label: str
    value: float | None
    status: Literal["available", "soon"]
    origin: str
    formula: str


class VisionLayer(BaseModel):
    key: str
    status: Literal["done", "operating", "in_construction", "vision"]
    reason: str


class VisionSite(BaseModel):
    kind: Literal["historic", "future"]
    label: str
    lat: float
    lon: float


class VisionOut(BaseModel):
    as_of: datetime
    figures: list[VisionFigure]
    layers: list[VisionLayer]
    sites: list[VisionSite]
