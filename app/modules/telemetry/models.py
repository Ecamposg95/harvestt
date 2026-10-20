"""Dispositivos, lecturas, reglas de alerta e incidentes (privados por organización)."""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, TenantMixin, UUIDMixin

DEVICE_SIMULATED = "simulated"
DEVICE_PHYSICAL = "physical"  # reservado para HVT-022
DEVICE_ACTIVE = "active"
DEVICE_INACTIVE = "inactive"
MAX_DEVICES = 10

READING_SCHEMA_VERSION = 1
SOURCE_SIMULATED = "simulated"
QUALITY_SYNTHETIC = "synthetic"

COMPARATOR_GT = "gt"
COMPARATOR_LT = "lt"

INCIDENT_THRESHOLD = "threshold"
INCIDENT_STALE = "stale"
INCIDENT_OPEN = "open"
INCIDENT_ACKNOWLEDGED = "acknowledged"
INCIDENT_CLOSED = "closed"
SEVERITY_WARNING = "warning"


class Device(UUIDMixin, TenantMixin, AuditMixin, Base):
    """Sensor dentro del invernadero. x, y en metros sobre la planta (ancho, largo); z, altura."""

    __tablename__ = "devices"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default=DEVICE_SIMULATED)
    variables: Mapped[list] = mapped_column(JSON, nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    z: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=DEVICE_ACTIVE)


class TelemetryReading(UUIDMixin, TenantMixin, Base):
    """Lectura inmutable. La falta de señal es ausencia de fila, nunca un valor nulo ni cero."""

    __tablename__ = "telemetry_readings"
    __table_args__ = (
        UniqueConstraint("device_id", "event_id", name="uq_telemetry_readings_device_event"),
        Index("ix_telemetry_readings_project_variable_observed", "project_id", "variable", "observed_at"),
    )

    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=READING_SCHEMA_VERSION)
    event_id: Mapped[str] = mapped_column(String(36), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    variable: Mapped[str] = mapped_column(String(40), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(10), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default=SOURCE_SIMULATED)
    quality: Mapped[str] = mapped_column(String(20), nullable=False, default=QUALITY_SYNTHETIC)
    scenario_run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("simulation_runs.id"), nullable=True, index=True
    )


class AlertRule(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "alert_rules"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    variable: Mapped[str] = mapped_column(String(40), nullable=False)
    comparator: Mapped[str] = mapped_column(String(4), nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    hysteresis: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stale_after_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    is_didactic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Incident(UUIDMixin, TenantMixin, AuditMixin, Base):
    """opened_at y closed_at en tiempo simulado; acknowledged_at en tiempo real."""

    __tablename__ = "incidents"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    rule_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("alert_rules.id"), nullable=True, index=True)
    scenario_run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("simulation_runs.id"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), nullable=False, index=True)
    # (run, tipo, regla, dispositivo, paso de apertura): re-evaluar un rango no duplica incidentes.
    dedupe_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default=SEVERITY_WARNING)
    evidence: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=INCIDENT_OPEN)
    acknowledged_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
