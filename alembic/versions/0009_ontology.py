"""ontología: términos, equivalencias, conceptos externos, versiones y columnas *_term_id

Revision ID: 0009
Revises: 0008
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

DOMAINS = "'organism', 'plant', 'trait', 'environment', 'place', 'node'"
STATUSES = "'proposed', 'in_review', 'published', 'rejected', 'obsolete'"
SCHEMES = (
    "'ncbi_taxon', 'wfo', 'po', 'bbch', 'co', 'ucum', 'peco', 'envo', "
    "'agrovoc', 'geosparql', 'koppen', 'sosa', 'ssn', 'prov'"
)

# (tabla, columna)
TERM_COLUMNS = [
    ("species", "term_id"),
    ("trait_assertions", "variable_term_id"),
    ("trait_assertions", "growth_stage_term_id"),
    ("trait_assertions", "cultivation_system_term_id"),
    ("projects", "system_term_id"),
    ("crop_cycles", "stage_term_id"),
]


def _audit() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "ontology_terms",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("hvt_id", sa.String(10), nullable=True),
        sa.Column("seed_key", sa.String(60), nullable=True),
        sa.Column("domain", sa.String(20), nullable=False),
        sa.Column("parent_id", sa.String(36), sa.ForeignKey("ontology_terms.id"), nullable=True),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("label_key", sa.String(120), nullable=False),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.Column("aliases", sa.JSON(), nullable=False),
        sa.Column("unit", sa.String(30), nullable=True),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("proposed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.String(500), nullable=True),
        sa.Column("replaced_by_id", sa.String(36), sa.ForeignKey("ontology_terms.id"), nullable=True),
        sa.Column("published_in_version", sa.Integer(), nullable=True),
        sa.Column("obsoleted_in_version", sa.Integer(), nullable=True),
        *_audit(),
        sa.CheckConstraint(f"domain IN ({DOMAINS})", name="ck_ontology_terms_domain"),
        sa.CheckConstraint(f"status IN ({STATUSES})", name="ck_ontology_terms_status"),
        sa.UniqueConstraint("hvt_id"),
        sa.UniqueConstraint("seed_key"),
    )
    op.create_index("ix_ontology_terms_domain_label_key", "ontology_terms", ["domain", "label_key"])

    op.create_table(
        "ontology_equivalences",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("term_id", sa.String(36), sa.ForeignKey("ontology_terms.id"), nullable=False),
        sa.Column("scheme", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(120), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("external_label", sa.String(200), nullable=True),
        sa.Column("match", sa.String(5), nullable=False),
        *_audit(),
        sa.CheckConstraint(f"scheme IN ({SCHEMES})", name="ck_ontology_equivalences_scheme"),
        sa.CheckConstraint("match IN ('exact', 'close', 'broad')", name="ck_ontology_equivalences_match"),
        sa.UniqueConstraint("term_id", "scheme", "external_id", name="uq_ontology_equivalences_term_scheme_ext"),
    )
    op.create_index("ix_ontology_equivalences_term_id", "ontology_equivalences", ["term_id"])

    op.create_table(
        "ontology_external_concepts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("scheme", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(120), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("label_key", sa.String(200), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("verified_at", sa.Date(), nullable=False),
        sa.Column("verified_via", sa.String(300), nullable=False),
        *_audit(),
        sa.UniqueConstraint("scheme", "external_id", name="uq_ontology_external_concepts_scheme_ext"),
    )
    op.create_index("ix_ontology_external_concepts_label_key", "ontology_external_concepts", ["label_key"])

    op.create_table(
        "ontology_releases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(300), nullable=False),
        sa.Column("published_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        *_audit(),
        sa.UniqueConstraint("version"),
    )

    for table, column in TERM_COLUMNS:
        op.add_column(table, sa.Column(column, sa.String(36), nullable=True))
        op.create_foreign_key(f"fk_{table}_{column}_ontology_terms", table, "ontology_terms", [column], ["id"])
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table, column in reversed(TERM_COLUMNS):
        op.drop_index(f"ix_{table}_{column}", table_name=table)
        op.drop_constraint(f"fk_{table}_{column}_ontology_terms", table, type_="foreignkey")
        op.drop_column(table, column)
    op.drop_table("ontology_releases")
    op.drop_index("ix_ontology_external_concepts_label_key", table_name="ontology_external_concepts")
    op.drop_table("ontology_external_concepts")
    op.drop_index("ix_ontology_equivalences_term_id", table_name="ontology_equivalences")
    op.drop_table("ontology_equivalences")
    op.drop_index("ix_ontology_terms_domain_label_key", table_name="ontology_terms")
    op.drop_table("ontology_terms")
