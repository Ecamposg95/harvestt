from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.core.mixins import AuditMixin, UUIDMixin

ROLE_VIEWER = "viewer"
ROLE_EDITOR = "editor"
ROLE_ADMIN = "admin"
ROLES = (ROLE_VIEWER, ROLE_EDITOR, ROLE_ADMIN)
ROLE_RANK = {ROLE_VIEWER: 0, ROLE_EDITOR: 1, ROLE_ADMIN: 2}

MEMBERSHIP_ACTIVE = "active"


class Organization(UUIDMixin, AuditMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)


class User(UUIDMixin, AuditMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_superadmin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user", lazy="selectin")


class Membership(UUIDMixin, AuditMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "organization_id", name="uq_membership_user_org"),)

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default=ROLE_VIEWER)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=MEMBERSHIP_ACTIVE)

    user: Mapped[User] = relationship(back_populates="memberships")
    organization: Mapped[Organization] = relationship(lazy="joined")
