"""Persist customer service conversations and messages, preserving existing cases."""

import sqlalchemy as sa

from alembic import op

revision = "0003_service_chat"
down_revision = "0002_working_model"
branch_labels = None
depends_on = None


def upgrade():
    for field in ("purchased_on", "warranty_until", "next_service_on"):
        op.add_column("assets", sa.Column(field, sa.Date(), nullable=True))
    op.add_column("assets", sa.Column("serial_number", sa.String(120), nullable=True))
    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("household_id", sa.String(64), sa.ForeignKey("households.id"), nullable=False),
        sa.Column(
            "case_id", sa.String(64), sa.ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("asset_id", sa.String(64), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("draft_complaint", sa.Text(), nullable=True),
        sa.Column("stage", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
    )
    op.create_index("ix_chat_conversations_household_id", "chat_conversations", ["household_id"])
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column(
            "conversation_id",
            sa.String(64),
            sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("truth_label", sa.String(32), nullable=False),
    )
    op.create_index("ix_chat_messages_conversation_id", "chat_messages", ["conversation_id"])


def downgrade():
    op.drop_index("ix_chat_messages_conversation_id", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("ix_chat_conversations_household_id", table_name="chat_conversations")
    op.drop_table("chat_conversations")
    op.drop_column("assets", "serial_number")
    for field in ("next_service_on", "warranty_until", "purchased_on"):
        op.drop_column("assets", field)
