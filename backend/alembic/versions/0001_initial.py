"""Initial local-demo schema; frozen independently of application model imports."""

import sqlalchemy as sa

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def record():
    return [
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    ]


def case_record():
    return record() + [
        sa.Column(
            "case_id", sa.String(64), sa.ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
        )
    ]


def text(name, length=None, nullable=False):
    return sa.Column(name, sa.String(length) if length else sa.Text(), nullable=nullable)


def boolean(name):
    return sa.Column(name, sa.Boolean(), nullable=False)


def reference(name, target, nullable=False):
    return sa.Column(name, sa.String(64), sa.ForeignKey(target), nullable=nullable)


def upgrade():
    op.create_table("households", *record(), text("name", 120))
    op.create_table(
        "participants",
        *record(),
        reference("household_id", "households.id"),
        text("name", 120),
        text("role", 32),
    )
    op.create_table(
        "assets",
        *record(),
        reference("household_id", "households.id"),
        text("name", 120),
        text("brand", 120),
        text("model", 120),
        text("location", 120),
        sa.Column("installed_on", sa.Date(), nullable=False),
        text("notes"),
        text("status", 32),
    )
    op.create_table(
        "providers", *record(), text("name", 120), text("trade", 64), text("status", 32)
    )
    op.create_table(
        "cases",
        *record(),
        reference("household_id", "households.id"),
        reference("asset_id", "assets.id"),
        text("title", 160),
        text("complaint"),
        text("status", 40),
        sa.Column("quote_amount", sa.Integer(), nullable=True),
        reference("provider_id", "providers.id", True),
        boolean("provider_confirmed"),
        boolean("household_confirmed"),
        boolean("provider_unresolved"),
        boolean("household_unresolved"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        boolean("assigned"),
        sa.Column("service_revision", sa.Integer(), nullable=False),
        boolean("demo"),
        sa.CheckConstraint("quote_amount IS NULL OR quote_amount >= 0", name="ck_case_quote"),
    )
    op.create_table(
        "case_events",
        *case_record(),
        text("type", 64),
        text("title", 160),
        text("detail"),
        text("truth_label", 32),
    )
    op.create_table(
        "approvals",
        *case_record(),
        text("kind", 32),
        text("status", 32),
        sa.Column("amount", sa.Integer(), nullable=True),
        text("reason"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("scope", sa.JSON(), nullable=False),
        boolean("consumed"),
        sa.CheckConstraint(
            "kind IN ('spend','change_provider','share_sensitive')", name="ck_approval_kind"
        ),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected')", name="ck_approval_status"
        ),
        sa.CheckConstraint("amount IS NULL OR amount >= 0", name="ck_approval_amount"),
    )
    op.create_table(
        "evidence",
        *case_record(),
        text("title", 160),
        text("description"),
        text("truth_label", 32),
        text("source", 80),
        text("kind", 32),
        sa.Column("service_revision", sa.Integer(), nullable=True),
        reference("provider_id", "providers.id", True),
    )
    op.create_table(
        "decisions",
        *case_record(),
        text("action", 80),
        text("reason"),
        text("rule", 100),
        text("truth_label", 32),
    )
    op.create_table(
        "connector_calls",
        *case_record(),
        text("connector", 64),
        text("operation", 64),
        sa.Column("request", sa.JSON(), nullable=False),
        sa.Column("response", sa.JSON(), nullable=False),
        text("truth_label", 32),
        text("status", 32),
    )
    op.create_table(
        "notifications",
        *case_record(),
        text("channel", 32),
        text("message"),
        text("truth_label", 32),
        text("status", 32),
    )
    op.create_table(
        "action_receipts",
        *case_record(),
        sa.Column(
            "approval_id",
            sa.String(64),
            sa.ForeignKey("approvals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        text("action", 32),
        reference("connector_call_id", "connector_calls.id", True),
        sa.UniqueConstraint("approval_id", name="uq_receipt_approval"),
    )
    op.create_table(
        "signups",
        *record(),
        text("name", 120),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        boolean("consent"),
    )
    op.create_table(
        "simulation_states",
        sa.Column(
            "case_id",
            sa.String(64),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("step", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("step >= 0 AND step <= 6", name="ck_simulation_step"),
    )
    for table, columns in {
        "participants": ["household_id"],
        "assets": ["household_id"],
        "cases": ["household_id", "asset_id"],
        "case_events": ["case_id"],
        "approvals": ["case_id"],
        "evidence": ["case_id"],
        "decisions": ["case_id"],
        "connector_calls": ["case_id"],
        "notifications": ["case_id"],
        "action_receipts": ["case_id"],
    }.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for table in [
        "simulation_states",
        "signups",
        "action_receipts",
        "notifications",
        "connector_calls",
        "decisions",
        "evidence",
        "approvals",
        "case_events",
        "cases",
        "providers",
        "assets",
        "participants",
        "households",
    ]:
        op.drop_table(table)
