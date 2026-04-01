"""Add user_oauth_connections table

Revision ID: 015_add_user_oauth_connections
Revises: 012_portal_access_logs
Create Date: 2026-04-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "015_add_user_oauth_connections"
down_revision: Union[str, None] = "012_portal_access_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())

    if "user_oauth_connections" not in tables:
        op.create_table(
            "user_oauth_connections",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("provider", sa.String(length=50), nullable=False),
            sa.Column("provider_subject", sa.String(length=255), nullable=True),
            sa.Column("provider_email", sa.String(length=255), nullable=True),
            sa.Column("tenant_id", sa.String(length=100), nullable=True),
            sa.Column("granted_scopes", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("refresh_token_encrypted", sa.Text(), nullable=True),
            sa.Column("access_token_encrypted", sa.Text(), nullable=True),
            sa.Column("token_expires_at", sa.DateTime(), nullable=True),
            sa.Column("connected_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "provider", name="uq_user_oauth_connections_user_provider"),
        )
        op.create_index(
            "ix_user_oauth_connections_user_id",
            "user_oauth_connections",
            ["user_id"],
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())

    if "user_oauth_connections" in tables:
        op.drop_index("ix_user_oauth_connections_user_id", table_name="user_oauth_connections")
        op.drop_table("user_oauth_connections")
