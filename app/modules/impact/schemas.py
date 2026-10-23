from datetime import datetime

from pydantic import BaseModel


class KpiOut(BaseModel):
    """Un indicador con su procedencia; value=None cuando faltan insumos ("Sin datos suficientes")."""

    key: str
    label: str
    value: float | None
    unit: str | None
    origin: str
    formula: str
    inputs_count: int
    as_of: datetime


class ProjectImpactOut(BaseModel):
    project_id: str
    as_of: datetime
    kpis: list[KpiOut]
