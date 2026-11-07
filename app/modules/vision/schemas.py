from datetime import date

from pydantic import BaseModel, ConfigDict, Field


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
