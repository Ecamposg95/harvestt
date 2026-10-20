"""aristas explícitas del grafo de conocimiento

Revision ID: 0007
Revises: 0006

Se aplica después de 0005 (V3) y 0006 (V4): mergear esta rama después de ambas.
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "graph_edges",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("src_type", sa.String(20), nullable=False),
        sa.Column("src_id", sa.String(64), nullable=False),
        sa.Column("dst_type", sa.String(20), nullable=False),
        sa.Column("dst_id", sa.String(64), nullable=False),
        sa.Column("relation", sa.String(20), nullable=False),
        sa.Column("provenance", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("relation IN ('designed_for', 'related_to', 'cites')", name="ck_graph_edges_relation"),
    )
    op.create_index("ix_graph_edges_organization_id", "graph_edges", ["organization_id"])
    op.create_index("ix_graph_edges_src", "graph_edges", ["src_type", "src_id"])
    op.create_index("ix_graph_edges_dst", "graph_edges", ["dst_type", "dst_id"])


def downgrade() -> None:
    op.drop_index("ix_graph_edges_dst", table_name="graph_edges")
    op.drop_index("ix_graph_edges_src", table_name="graph_edges")
    op.drop_index("ix_graph_edges_organization_id", table_name="graph_edges")
    op.drop_table("graph_edges")
