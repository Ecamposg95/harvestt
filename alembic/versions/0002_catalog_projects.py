"""catálogo global y proyectos

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _audit_cols():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def _tenant_col():
    return sa.Column(
        "organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True
    )


def upgrade() -> None:
    # --- catálogo (global) ---
    op.create_table(
        "species",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("scientific_name", sa.String(200), nullable=False, unique=True),
        sa.Column("authorship", sa.String(200), nullable=True),
        sa.Column("common_names", sa.JSON(), nullable=False),
        sa.Column("family", sa.String(120), nullable=True, index=True),
        sa.Column("external_ids", sa.JSON(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        *_audit_cols(),
    )
    op.create_table(
        "cultivars",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("species_id", sa.String(36), sa.ForeignKey("species.id"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("provenance", sa.Text(), nullable=True),
        *_audit_cols(),
        sa.UniqueConstraint("species_id", "name", name="uq_cultivar_species_name"),
    )
    op.create_table(
        "sources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("publisher", sa.String(200), nullable=True),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("license", sa.String(120), nullable=True),
        sa.Column("accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rights", sa.JSON(), nullable=True),
        *_audit_cols(),
    )
    op.create_table(
        "trait_assertions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("subject_type", sa.String(30), nullable=False),
        sa.Column("subject_id", sa.String(36), nullable=False, index=True),
        sa.Column("variable", sa.String(60), nullable=False),
        sa.Column("value_min", sa.Float(), nullable=True),
        sa.Column("value_max", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(30), nullable=True),
        sa.Column("growth_stage", sa.String(60), nullable=False),
        sa.Column("cultivation_system", sa.String(60), nullable=False),
        sa.Column("origin", sa.String(20), nullable=False),
        sa.Column("review_status", sa.String(20), nullable=False),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        *_audit_cols(),
    )

    # --- proyectos (tenant) ---
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        _tenant_col(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("objectives", sa.Text(), nullable=True),
        sa.Column("area_m2", sa.Float(), nullable=True),
        sa.Column("system", sa.String(30), nullable=False),
        sa.Column("location", sa.String(300), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        *_audit_cols(),
        sa.CheckConstraint("area_m2 IS NULL OR area_m2 > 0", name="ck_projects_area_positive"),
    )
    op.create_table(
        "crop_cycles",
        sa.Column("id", sa.String(36), primary_key=True),
        _tenant_col(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("species_id", sa.String(36), sa.ForeignKey("species.id"), nullable=False, index=True),
        sa.Column("cultivar_id", sa.String(36), sa.ForeignKey("cultivars.id"), nullable=True),
        sa.Column("started_on", sa.Date(), nullable=True),
        sa.Column("stage", sa.String(60), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        *_audit_cols(),
    )
    op.create_table(
        "observations",
        sa.Column("id", sa.String(36), primary_key=True),
        _tenant_col(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("crop_cycle_id", sa.String(36), sa.ForeignKey("crop_cycles.id"), nullable=True),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        *_audit_cols(),
    )


def downgrade() -> None:
    op.drop_table("observations")
    op.drop_table("crop_cycles")
    op.drop_table("projects")
    op.drop_table("trait_assertions")
    op.drop_table("sources")
    op.drop_table("cultivars")
    op.drop_table("species")
