"""add generated_reports table

Revision ID: 014_add_generated_reports
Revises: d1a2b3c4d5e6
Create Date: 2026-03-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "014_add_generated_reports"
down_revision = "d1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "generated_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("report_type", sa.String(20), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("sections", JSONB, nullable=True),
        sa.Column("charts_data", JSONB, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="generating"),
        sa.Column("ai_model", sa.String(50), nullable=True),
        sa.Column("generated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_generated_reports_lookup",
        "generated_reports",
        ["report_type", "period_start"],
    )


def downgrade() -> None:
    op.drop_index("ix_generated_reports_lookup", table_name="generated_reports")
    op.drop_table("generated_reports")
