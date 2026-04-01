"""
OAuth connection models for provider-specific delegated tokens.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class UserOAuthConnection(Base):
    """Encrypted OAuth token material and granted scopes per user/provider."""

    __tablename__ = "user_oauth_connections"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_oauth_connections_user_provider"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String(50), nullable=False, default="microsoft")
    provider_subject = Column(String(255), nullable=True)
    provider_email = Column(String(255), nullable=True)
    tenant_id = Column(String(100), nullable=True)
    granted_scopes = Column(Text, nullable=False, default="[]")
    refresh_token_encrypted = Column(Text, nullable=True)
    access_token_encrypted = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    connected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="oauth_connections")
