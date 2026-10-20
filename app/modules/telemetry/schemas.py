from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.simulation.engine import VariableLiteral

Meters = Annotated[float, Field(ge=0, le=10000, allow_inf_nan=False)]
Height = Annotated[float, Field(ge=0, le=50, allow_inf_nan=False)]
DeviceStatusLiteral = Literal["active", "inactive"]
ComparatorLiteral = Literal["gt", "lt"]


def _clean_text(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        raise ValueError("el texto es obligatorio")
    return v


def _unique_variables(v: list[str] | None) -> list[str] | None:
    if v is None:
        return None
    if len(set(v)) != len(v):
        raise ValueError("variables repetidas")
    return v


# ---- Dispositivos ----


class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["simulated"] = "simulated"
    variables: list[VariableLiteral] = Field(min_length=1, max_length=2)
    x: Meters
    y: Meters
    z: Height
    status: DeviceStatusLiteral = "active"

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return _clean_text(v)

    @field_validator("variables")
    @classmethod
    def _variables(cls, v: list[str] | None) -> list[str] | None:
        return _unique_variables(v)


class DeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    variables: list[VariableLiteral] | None = Field(default=None, min_length=1, max_length=2)
    x: Meters | None = None
    y: Meters | None = None
    z: Height | None = None
    status: DeviceStatusLiteral | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return _clean_text(v)

    @field_validator("variables")
    @classmethod
    def _variables(cls, v: list[str] | None) -> list[str] | None:
        return _unique_variables(v)


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    kind: str
    variables: list[str]
    x: float
    y: float
    z: float
    status: str
    created_at: datetime


# ---- Reglas ----


class AlertRuleCreate(BaseModel):
    variable: VariableLiteral
    comparator: ComparatorLiteral
    threshold: float = Field(ge=-1000, le=1000, allow_inf_nan=False)
    hysteresis: float = Field(default=0.0, ge=0, le=100, allow_inf_nan=False)
    cooldown_minutes: int = Field(default=0, ge=0, le=10080)
    stale_after_minutes: int = Field(default=15, ge=1, le=10080)
    label: str = Field(min_length=1, max_length=160)

    @field_validator("label")
    @classmethod
    def _label(cls, v: str | None) -> str | None:
        return _clean_text(v)


class AlertRuleUpdate(BaseModel):
    comparator: ComparatorLiteral | None = None
    threshold: float | None = Field(default=None, ge=-1000, le=1000, allow_inf_nan=False)
    hysteresis: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    cooldown_minutes: int | None = Field(default=None, ge=0, le=10080)
    stale_after_minutes: int | None = Field(default=None, ge=1, le=10080)
    label: str | None = Field(default=None, min_length=1, max_length=160)

    @field_validator("label")
    @classmethod
    def _label(cls, v: str | None) -> str | None:
        return _clean_text(v)


class AlertRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    variable: str
    comparator: str
    threshold: float
    hysteresis: float
    cooldown_minutes: int
    stale_after_minutes: int
    label: str
    is_didactic: bool
    created_at: datetime


# ---- Lecturas ----


class ReadingPoint(BaseModel):
    device_id: str
    variable: str
    value: float
    unit: str
    observed_at: datetime


class ReadingsOut(BaseModel):
    run_id: str | None
    interval_minutes: int | None
    downsampled: bool
    points: list[ReadingPoint]


class LatestValue(BaseModel):
    variable: str
    value: float | None
    unit: str
    observed_at: datetime | None
    stale: bool


class LatestDevice(BaseModel):
    device_id: str
    name: str
    x: float
    y: float
    z: float
    readings: list[LatestValue]


class LatestOut(BaseModel):
    run_id: str | None
    run_status: str | None
    sim_time: datetime | None
    devices: list[LatestDevice]


# ---- Incidentes ----


class IncidentAction(BaseModel):
    action: Literal["acknowledge"]


class IncidentOut(BaseModel):
    id: str
    project_id: str
    rule_id: str | None
    rule_label: str | None
    scenario_run_id: str | None
    kind: str
    device_id: str
    device_name: str
    opened_at: datetime
    closed_at: datetime | None
    severity: str
    evidence: dict
    status: str
    acknowledged_by: str | None
    acknowledged_at: datetime | None


# ---- Demostración ----


class DemoSetupOut(BaseModel):
    created_devices: int
    created_rules: int
    devices: list[DeviceOut]
    rules: list[AlertRuleOut]
