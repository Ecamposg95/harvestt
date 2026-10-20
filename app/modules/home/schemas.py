from datetime import datetime

from pydantic import BaseModel


class HomeProject(BaseModel):
    id: str
    name: str
    system: str
    area_m2: float | None
    species: list[str]


class HomeCounts(BaseModel):
    projects: int
    crop_cycles: int
    observations: int
    sources_cited: int


class HomeActivity(BaseModel):
    id: str
    text: str
    resource_type: str
    resource_id: str
    created_at: datetime


class HomeOut(BaseModel):
    recent_project: HomeProject | None
    counts: HomeCounts
    activity: list[HomeActivity]
