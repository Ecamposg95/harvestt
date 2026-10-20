"""Layout del Studio: zonas y plantas colocadas. Ilustrativo: no predice crecimiento."""
from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.mixins import AuditMixin, TenantMixin, UUIDMixin

STAGES = ("seedling", "vegetative", "mature")
MAX_ZONES = 20
MAX_PLACEMENTS = 400


class Zone(UUIDMixin, TenantMixin, AuditMixin, Base):
    """Rectángulo del piso del proyecto (m): x, y desde el origen del piso."""

    __tablename__ = "studio_zones"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    width: Mapped[float] = mapped_column(Float, nullable=False)
    depth: Mapped[float] = mapped_column(Float, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Placement(UUIDMixin, TenantMixin, AuditMixin, Base):
    """Planta colocada en una zona: x, y relativos a la zona (m); rotation en grados."""

    __tablename__ = "studio_placements"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    zone_id: Mapped[str] = mapped_column(String(36), ForeignKey("studio_zones.id"), nullable=False, index=True)
    crop_cycle_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("crop_cycles.id"), nullable=True)
    species_id: Mapped[str] = mapped_column(String(36), ForeignKey("species.id"), nullable=False, index=True)
    stage: Mapped[str] = mapped_column(String(20), nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    rotation: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
