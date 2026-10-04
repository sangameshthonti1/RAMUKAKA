"""Persist inventory provenance and explicit case service plans without replacing records."""

import sqlalchemy as sa

from alembic import op

revision = "0002_working_model"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("households", "participants", "assets", "providers"):
        op.add_column(
            table,
            sa.Column(
                "truth_label",
                sa.String(32),
                nullable=False,
                server_default="DOCUMENTATION_SIMULATION",
            ),
        )
        op.add_column(
            table,
            sa.Column(
                "updated_at", sa.DateTime(), nullable=False, server_default="1970-01-01 00:00:00"
            ),
        )
        op.execute(sa.text(f"UPDATE {table} SET updated_at = created_at"))
    op.add_column(
        "assets",
        sa.Column("category", sa.String(64), nullable=False, server_default="water_purifier"),
    )
    op.add_column(
        "cases",
        sa.Column(
            "service_category", sa.String(64), nullable=False, server_default="water_purifier"
        ),
    )
    op.add_column("cases", sa.Column("service_description", sa.String(500), nullable=True))
    # Existing quotes were created by the earlier documented fixture workflow.
    op.execute(
        sa.text(
            "UPDATE cases SET service_description = 'Filter replacement' WHERE quote_amount IS NOT NULL"
        )
    )


def downgrade():
    op.drop_column("cases", "service_description")
    op.drop_column("cases", "service_category")
    op.drop_column("assets", "category")
    for table in ("providers", "assets", "participants", "households"):
        op.drop_column(table, "updated_at")
        op.drop_column(table, "truth_label")
