"""geo: ubicación y publicación en proyectos, caché geo_samples

Revision ID: 0011
Revises: 0010
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.add_column(sa.Column("lat", sa.Float(), nullable=True))
        batch.add_column(sa.Column("lon", sa.Float(), nullable=True))
        batch.add_column(sa.Column("place_term_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("visibility", sa.String(10), nullable=False, server_default="private"))
        batch.add_column(sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_foreign_key("fk_projects_place_term_id", "ontology_terms", ["place_term_id"], ["id"])
        batch.create_check_constraint("ck_projects_visibility", "visibility IN ('private', 'public')")
        batch.create_index("ix_projects_place_term_id", ["place_term_id"])
    op.create_table(
        "geo_samples",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("lat_key", sa.Float(), nullable=False),
        sa.Column("lon_key", sa.Float(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("license", sa.String(200), nullable=False),
        sa.Column("attribution", sa.String(500), nullable=False),
        sa.Column("source_url", sa.String(500), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("source", "lat_key", "lon_key", name="uq_geo_sample"),
        sa.CheckConstraint("status IN ('ok', 'no_data')", name="ck_geo_samples_status"),
    )


def downgrade() -> None:
    op.drop_table("geo_samples")
    with op.batch_alter_table("projects") as batch:
        batch.drop_index("ix_projects_place_term_id")
        batch.drop_constraint("ck_projects_visibility", type_="check")
        batch.drop_constraint("fk_projects_place_term_id", type_="foreignkey")
        batch.drop_column("published_at")
        batch.drop_column("visibility")
        batch.drop_column("place_term_id")
        batch.drop_column("lon")
        batch.drop_column("lat")
