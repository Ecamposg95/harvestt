"""Studio (zonas y plantas colocadas) y medios de especie

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"  # 0005_simulation_telemetry (V3): V4 se integra después de V3
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.add_column("projects", sa.Column("layout_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "studio_zones",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("width", sa.Float(), nullable=False),
        sa.Column("depth", sa.Float(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *_timestamps(),
    )
    op.create_table(
        "studio_placements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("zone_id", sa.String(36), sa.ForeignKey("studio_zones.id"), nullable=False, index=True),
        sa.Column("crop_cycle_id", sa.String(36), sa.ForeignKey("crop_cycles.id"), nullable=True),
        sa.Column("species_id", sa.String(36), sa.ForeignKey("species.id"), nullable=False, index=True),
        sa.Column("stage", sa.String(20), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("rotation", sa.Float(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *_timestamps(),
    )

    op.create_table(
        "species_media",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("species_id", sa.String(36), sa.ForeignKey("species.id"), nullable=False, index=True),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("license", sa.String(120), nullable=False),
        sa.Column("attribution", sa.String(300), nullable=False),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("is_hero", sa.Boolean(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("callouts", sa.JSON(), nullable=False),
        *_timestamps(),
    )


def downgrade() -> None:
    op.drop_table("species_media")
    op.drop_table("studio_placements")
    op.drop_table("studio_zones")
    op.drop_column("projects", "layout_version")
