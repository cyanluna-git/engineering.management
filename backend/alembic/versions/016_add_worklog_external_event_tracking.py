"""Add worklog external event tracking

Revision ID: 016_add_worklog_external_event_tracking
Revises: 015_add_user_oauth_connections
Create Date: 2026-04-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "016_add_worklog_external_event_tracking"
down_revision: Union[str, None] = "015_add_user_oauth_connections"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("worklogs")}
    unique_constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("worklogs")
        if constraint.get("name")
    }

    if "external_source" not in columns:
        op.add_column("worklogs", sa.Column("external_source", sa.String(length=50), nullable=True))
    if "external_event_id" not in columns:
        op.add_column("worklogs", sa.Column("external_event_id", sa.String(length=255), nullable=True))
    if "uq_worklogs_user_external_event" not in unique_constraints:
        op.create_unique_constraint(
            "uq_worklogs_user_external_event",
            "worklogs",
            ["user_id", "external_source", "external_event_id"],
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {column["name"] for column in inspector.get_columns("worklogs")}
    unique_constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("worklogs")
        if constraint.get("name")
    }

    if "uq_worklogs_user_external_event" in unique_constraints:
        op.drop_constraint("uq_worklogs_user_external_event", "worklogs", type_="unique")
    if "external_event_id" in columns:
        op.drop_column("worklogs", "external_event_id")
    if "external_source" in columns:
        op.drop_column("worklogs", "external_source")
