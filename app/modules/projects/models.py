"""Proyectos de cultivo, ciclos y bitácora (privados por organización)."""
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import AuditMixin, TenantMixin, UUIDMixin, utcnow

SYSTEM_HYDROPONIC = "hydroponic"
SYSTEM_SUBSTRATE = "substrate"
SYSTEM_SOIL = "soil"
SYSTEM_AEROPONIC = "aeroponic"
SYSTEM_OTHER = "other"
SYSTEMS = (SYSTEM_HYDROPONIC, SYSTEM_SUBSTRATE, SYSTEM_SOIL, SYSTEM_AEROPONIC, SYSTEM_OTHER)

CYCLE_PLANNED = "planned"
CYCLE_ACTIVE = "active"
CYCLE_FINISHED = "finished"
CYCLE_CANCELLED = "cancelled"
CYCLE_STATUSES = (CYCLE_PLANNED, CYCLE_ACTIVE, CYCLE_FINISHED, CYCLE_CANCELLED)

STAGE_UNKNOWN = "unknown"

OBS_NOTE = "note"
OBS_MEASUREMENT = "measurement"
OBS_INCIDENT = "incident"
OBS_TASK = "task"
OBS_DECISION = "decision"
OBSERVATION_KINDS = (OBS_NOTE, OBS_MEASUREMENT, OBS_INCIDENT, OBS_TASK, OBS_DECISION)


class Project(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (CheckConstraint("area_m2 IS NULL OR area_m2 > 0", name="ck_projects_area_positive"),)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    objectives: Mapped[str | None] = mapped_column(Text, nullable=True)
    area_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    system: Mapped[str] = mapped_column(String(30), nullable=False, default=SYSTEM_OTHER)
    location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class CropCycle(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "crop_cycles"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    species_id: Mapped[str] = mapped_column(String(36), ForeignKey("species.id"), nullable=False, index=True)
    cultivar_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("cultivars.id"), nullable=True)
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    stage: Mapped[str] = mapped_column(String(60), nullable=False, default=STAGE_UNKNOWN)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=CYCLE_PLANNED)

    species = relationship("Species", lazy="joined")
    cultivar = relationship("Cultivar", lazy="joined")


class Observation(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "observations"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    crop_cycle_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("crop_cycles.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default=OBS_NOTE)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    author = relationship("User", lazy="joined")
