"""Corridas de simulación (inmutables salvo su estado de ejecución)."""
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, TenantMixin, UUIDMixin

RUN_RUNNING = "running"
RUN_PAUSED = "paused"
RUN_COMPLETED = "completed"
RUN_CANCELLED = "cancelled"
ACTIVE_STATUSES = (RUN_RUNNING, RUN_PAUSED)

_ONE_ACTIVE_WHERE = text("status IN ('running', 'paused')")


class SimulationRun(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "simulation_runs"
    __table_args__ = (
        # Un solo run activo (running o paused) por proyecto, también ante peticiones simultáneas.
        Index(
            "uq_simulation_runs_one_active",
            "project_id",
            unique=True,
            postgresql_where=_ONE_ACTIVE_WHERE,
            sqlite_where=_ONE_ACTIVE_WHERE,
        ),
    )

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    scenario: Mapped[str] = mapped_column(String(20), nullable=False)
    model_version: Mapped[str] = mapped_column(String(30), nullable=False)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    inputs: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Dispositivos activos al iniciar, en orden: su posición es el índice que recibe el motor.
    device_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=RUN_RUNNING)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_steps: Mapped[int] = mapped_column(Integer, nullable=False)
    emitted_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    limits: Mapped[list] = mapped_column(JSON, nullable=False)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
