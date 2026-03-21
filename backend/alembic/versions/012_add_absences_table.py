"""Add absences table

Revision ID: 012_add_absences
Revises: 33e0c651a95e
Create Date: 2026-03-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '012_add_absences'
down_revision: Union[str, None] = '33e0c651a95e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'absences',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('absence_type', sa.String(length=30), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('fte_impact', sa.Float(), nullable=False, server_default='-1.0'),
        sa.Column('department_id', sa.String(length=50), nullable=False),
        sa.Column('sub_team_id', sa.String(length=50), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
        sa.ForeignKeyConstraint(['sub_team_id'], ['sub_teams.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_absences_user_id', 'absences', ['user_id'])
    op.create_index('ix_absences_department_id', 'absences', ['department_id'])
    op.create_index('ix_absences_date_range', 'absences', ['start_date', 'end_date'])


def downgrade() -> None:
    op.drop_index('ix_absences_date_range', table_name='absences')
    op.drop_index('ix_absences_department_id', table_name='absences')
    op.drop_index('ix_absences_user_id', table_name='absences')
    op.drop_table('absences')
