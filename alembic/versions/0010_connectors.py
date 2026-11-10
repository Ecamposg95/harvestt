"""conectores: copias locales, corridas de sincronización y crop_cycles.accession_ref

Revision ID: 0010
Revises: 0009
"""
import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "connector_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("species_id", sa.String(36), sa.ForeignKey("species.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("license", sa.String(200), nullable=True),
        sa.Column("attribution", sa.String(500), nullable=True),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("source", "species_id", name="uq_connector_snapshot"),
    )
    op.create_index("ix_connector_snapshots_species_id", "connector_snapshots", ["species_id"])
    op.create_table(
        "connector_syncs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("species_total", sa.Integer(), nullable=False),
        sa.Column("species_ok", sa.Integer(), nullable=False),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_connector_syncs_source_started_at", "connector_syncs", ["source", "started_at"])
    op.add_column("crop_cycles", sa.Column("accession_ref", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("crop_cycles", "accession_ref")
    op.drop_index("ix_connector_syncs_source_started_at", table_name="connector_syncs")
    op.drop_table("connector_syncs")
    op.drop_index("ix_connector_snapshots_species_id", table_name="connector_snapshots")
    op.drop_table("connector_snapshots")
