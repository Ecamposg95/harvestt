from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.simulation.engine import ScenarioLiteral, SimulationInputs


class RunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario: ScenarioLiteral
    # Sin semilla, el servidor elige una y la devuelve: la corrida sigue siendo reproducible.
    seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    inputs: SimulationInputs = Field(default_factory=SimulationInputs)


class RunOut(BaseModel):
    id: str
    project_id: str
    scenario: str
    model_version: str
    seed: int
    inputs: dict
    device_ids: list[str]
    status: str
    started_at: datetime
    paused_at: datetime | None
    paused_seconds: float
    ended_at: datetime | None
    total_steps: int
    emitted_steps: int
    sim_time: datetime | None
    limits: list[str]
    author_id: str
    created_at: datetime
