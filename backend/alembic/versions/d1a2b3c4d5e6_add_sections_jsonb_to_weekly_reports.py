"""Add sections JSONB column to weekly_reports

Revision ID: d1a2b3c4d5e6
Revises: cff98cffb026
Create Date: 2026-03-24 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d1a2b3c4d5e6"
down_revision: Union[str, None] = "cff98cffb026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("weekly_reports", sa.Column("sections", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("weekly_reports", "sections")
