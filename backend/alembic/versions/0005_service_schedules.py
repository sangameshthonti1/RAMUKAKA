"""Persist provider-linked service schedules and local in-app reminders."""

import sqlalchemy as sa

from alembic import op

revision = "0005_service_schedules"
down_revision = "0004_local_coordination"
branch_labels = None
depends_on = None


def record_columns():
    return [
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    ]


def upgrade():
    op.create_table(
        "service_schedules",
        *record_columns(),
        sa.Column(
            "asset_id", sa.String(64), sa.ForeignKey("assets.id"), nullable=False, unique=True
        ),
        sa.Column("household_id", sa.String(64), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("provider_id", sa.String(64), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("case_id", sa.String(64), sa.ForeignKey("cases.id", ondelete="SET NULL")),
        sa.Column("next_service_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(32), nullable=False),
        sa.Column("updated_by", sa.String(32), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_schedule_revision"),
        sa.CheckConstraint("status IN ('active','cancelled')", name="ck_schedule_status"),
        sa.CheckConstraint("created_by IN ('household','provider')", name="ck_schedule_creator"),
        sa.CheckConstraint("updated_by IN ('household','provider')", name="ck_schedule_updater"),
    )
    for field in ("household_id", "provider_id", "next_service_on"):
        op.create_index(f"ix_service_schedules_{field}", "service_schedules", [field])
    op.create_table(
        "service_reminders",
        *record_columns(),
        sa.Column(
            "schedule_id",
            sa.String(64),
            sa.ForeignKey("service_schedules.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(32), nullable=False),
        sa.Column("audience", sa.String(32), nullable=False),
        sa.Column("household_id", sa.String(64), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("provider_id", sa.String(64), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("next_service_on", sa.Date(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("schedule_id", "revision", "stage", "audience", name="uq_reminder"),
        sa.CheckConstraint("stage IN ('upcoming','due')", name="ck_reminder_stage"),
        sa.CheckConstraint("audience IN ('household','provider')", name="ck_reminder_audience"),
        sa.CheckConstraint(
            "status IN ('available','acknowledged','superseded','cancelled')",
            name="ck_reminder_status",
        ),
    )
    for field in ("schedule_id", "household_id", "provider_id"):
        op.create_index(f"ix_service_reminders_{field}", "service_reminders", [field])
    op.create_table(
        "service_contacts",
        *record_columns(),
        sa.Column(
            "schedule_id",
            sa.String(64),
            sa.ForeignKey("service_schedules.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.String(64), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.CheckConstraint("kind IN ('local_message','contact_note')", name="ck_contact_kind"),
    )
    op.create_index("ix_service_contacts_schedule_id", "service_contacts", ["schedule_id"])


def downgrade():
    op.drop_table("service_contacts")
    op.drop_table("service_reminders")
    op.drop_table("service_schedules")
