"""página Visión: reconocimientos y solicitudes entrantes

Revision ID: 0008
Revises: 0007
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recognitions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("award", sa.String(120), nullable=False),
        sa.Column("event", sa.String(200), nullable=False),
        sa.Column("venue", sa.String(200), nullable=False),
        sa.Column("awarded_on", sa.Date(), nullable=False),
        sa.Column("prototype_id", sa.String(36), sa.ForeignKey("prototypes.id"), nullable=True),
        sa.Column("evidence", sa.String(500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_recognitions_organization_id", "recognitions", ["organization_id"])
    op.create_table(
        "inbound_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("organization", sa.String(200), nullable=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("city", sa.String(120), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lon", sa.Float(), nullable=True),
        sa.Column("message", sa.String(2000), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("review_note", sa.String(500), nullable=True),
        sa.Column("reviewed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("kind IN ('node', 'contact')", name="ck_inbound_requests_kind"),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="ck_inbound_requests_status"),
    )
    op.create_index("ix_inbound_requests_status", "inbound_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_inbound_requests_status", table_name="inbound_requests")
    op.drop_table("inbound_requests")
    op.drop_index("ix_recognitions_organization_id", table_name="recognitions")
    op.drop_table("recognitions")
