"""Add composite index to user_history for historical worklog queries

Revision ID: 013_user_history_idx
Revises: 012_add_absences
Create Date: 2026-03-21

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '013_user_history_idx'
down_revision: Union[str, None] = '012_add_absences'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_user_history_user_dates',
        'user_history',
        ['user_id', 'start_date', 'end_date'],
    )


def downgrade() -> None:
    op.drop_index('ix_user_history_user_dates', table_name='user_history')
