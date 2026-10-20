"""puntos (hotspots) sobre modelos STL de prototipos

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prototype_hotspots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("prototype_id", sa.String(36), sa.ForeignKey("prototypes.id"), nullable=False, index=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("prototype_assets.id"), nullable=False, index=True),
        sa.Column("label", sa.String(60), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("z", sa.Float(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("prototype_hotspots")
