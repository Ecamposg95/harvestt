"""invernadero virtual: dispositivos, corridas, lecturas, reglas e incidentes

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

ONE_ACTIVE = sa.text("status IN ('running', 'paused')")


def _tenant() -> list[sa.Column]:
    return [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
    ]


def _audit() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "devices",
        *_tenant(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("z", sa.Float(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        *_audit(),
    )
    op.create_table(
        "simulation_runs",
        *_tenant(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("scenario", sa.String(20), nullable=False),
        sa.Column("model_version", sa.String(30), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("device_ids", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_seconds", sa.Float(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_steps", sa.Integer(), nullable=False),
        sa.Column("emitted_steps", sa.Integer(), nullable=False),
        sa.Column("limits", sa.JSON(), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        *_audit(),
    )
    op.create_index(
        "uq_simulation_runs_one_active",
        "simulation_runs",
        ["project_id"],
        unique=True,
        postgresql_where=ONE_ACTIVE,
        sqlite_where=ONE_ACTIVE,
    )
    op.create_table(
        "alert_rules",
        *_tenant(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("variable", sa.String(40), nullable=False),
        sa.Column("comparator", sa.String(4), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("hysteresis", sa.Float(), nullable=False),
        sa.Column("cooldown_minutes", sa.Integer(), nullable=False),
        sa.Column("stale_after_minutes", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(160), nullable=False),
        sa.Column("is_didactic", sa.Boolean(), nullable=False),
        *_audit(),
    )
    op.create_table(
        "telemetry_readings",
        *_tenant(),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(36), nullable=False),
        sa.Column("device_id", sa.String(36), sa.ForeignKey("devices.id"), nullable=False),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("variable", sa.String(40), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(10), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("quality", sa.String(20), nullable=False),
        sa.Column(
            "scenario_run_id", sa.String(36), sa.ForeignKey("simulation_runs.id"), nullable=True, index=True
        ),
        sa.UniqueConstraint("device_id", "event_id", name="uq_telemetry_readings_device_event"),
    )
    op.create_index(
        "ix_telemetry_readings_project_variable_observed",
        "telemetry_readings",
        ["project_id", "variable", "observed_at"],
    )
    op.create_table(
        "incidents",
        *_tenant(),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("rule_id", sa.String(36), sa.ForeignKey("alert_rules.id"), nullable=True, index=True),
        sa.Column(
            "scenario_run_id", sa.String(36), sa.ForeignKey("simulation_runs.id"), nullable=True, index=True
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("device_id", sa.String(36), sa.ForeignKey("devices.id"), nullable=False, index=True),
        sa.Column("dedupe_key", sa.String(200), nullable=False, unique=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("acknowledged_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        *_audit(),
    )


def downgrade() -> None:
    op.drop_table("incidents")
    op.drop_index("ix_telemetry_readings_project_variable_observed", table_name="telemetry_readings")
    op.drop_table("telemetry_readings")
    op.drop_table("alert_rules")
    op.drop_index("uq_simulation_runs_one_active", table_name="simulation_runs")
    op.drop_table("simulation_runs")
    op.drop_table("devices")
