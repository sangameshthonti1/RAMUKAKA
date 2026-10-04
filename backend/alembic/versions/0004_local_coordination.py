"""Recorded locations and persisted local mock repair coordination."""

import sqlalchemy as sa

from alembic import op

revision = "0004_local_coordination"
down_revision = "0003_service_chat"
branch_labels = None
depends_on = None


def upgrade():
    for table, address in (("households", "address"), ("providers", "shop_address")):
        op.add_column(table, sa.Column(address, sa.String(500), nullable=True))
        op.add_column(table, sa.Column("latitude", sa.Float(), nullable=True))
        op.add_column(table, sa.Column("longitude", sa.Float(), nullable=True))
    op.create_table(
        "repair_coordinations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column(
            "case_id",
            sa.String(64),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("state", sa.JSON(), nullable=False),
    )


def downgrade():
    op.drop_table("repair_coordinations")
    for table, address in (("providers", "shop_address"), ("households", "address")):
        for field in ("longitude", "latitude", address):
            op.drop_column(table, field)
