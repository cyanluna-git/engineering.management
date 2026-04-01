"""
Persistence helpers for encrypted delegated OAuth connections.
"""

from __future__ import annotations

import base64
import hashlib
import json
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.oauth_connection import UserOAuthConnection
from app.models.user import User


class OAuthConnectionService:
    """Manage encrypted provider token storage for a user."""

    PROVIDER_MICROSOFT = "microsoft"

    @staticmethod
    def _crypto() -> Fernet:
        digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
        return Fernet(base64.urlsafe_b64encode(digest))

    @classmethod
    def encrypt(cls, value: str | None) -> str | None:
        if not value:
            return None
        return cls._crypto().encrypt(value.encode("utf-8")).decode("utf-8")

    @classmethod
    def decrypt(cls, value: str | None) -> str | None:
        if not value:
            return None
        return cls._crypto().decrypt(value.encode("utf-8")).decode("utf-8")

    @staticmethod
    def _normalize_scopes(scopes: list[str] | None) -> list[str]:
        normalized: list[str] = []
        for scope in scopes or []:
            cleaned = scope.strip()
            if cleaned and cleaned not in normalized:
                normalized.append(cleaned)
        return normalized

    @classmethod
    def get_connection(
        cls,
        db: Session,
        *,
        user_id: str,
        provider: str = PROVIDER_MICROSOFT,
    ) -> UserOAuthConnection | None:
        return (
            db.query(UserOAuthConnection)
            .filter(
                UserOAuthConnection.user_id == user_id,
                UserOAuthConnection.provider == provider,
            )
            .first()
        )

    @classmethod
    def upsert_microsoft_connection(
        cls,
        db: Session,
        *,
        user: User,
        provider_subject: str | None,
        provider_email: str | None,
        tenant_id: str | None,
        granted_scopes: list[str] | None,
        refresh_token: str | None,
        access_token: str | None,
        expires_in_seconds: int | None,
    ) -> UserOAuthConnection:
        connection = cls.get_connection(db, user_id=user.id, provider=cls.PROVIDER_MICROSOFT)
        existing_scopes: list[str] = []
        if connection and connection.granted_scopes:
            try:
                existing_scopes = json.loads(connection.granted_scopes)
            except json.JSONDecodeError:
                existing_scopes = []

        merged_scopes = cls._normalize_scopes([*existing_scopes, *(granted_scopes or [])])
        expires_at = None
        if expires_in_seconds:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)

        if connection is None:
            connection = UserOAuthConnection(
                user_id=user.id,
                provider=cls.PROVIDER_MICROSOFT,
                connected_at=datetime.utcnow(),
            )
            db.add(connection)

        connection.provider_subject = provider_subject or connection.provider_subject
        connection.provider_email = provider_email or connection.provider_email
        connection.tenant_id = tenant_id or connection.tenant_id
        connection.granted_scopes = json.dumps(merged_scopes)
        connection.refresh_token_encrypted = (
            cls.encrypt(refresh_token) if refresh_token else connection.refresh_token_encrypted
        )
        connection.access_token_encrypted = (
            cls.encrypt(access_token) if access_token else connection.access_token_encrypted
        )
        connection.token_expires_at = expires_at or connection.token_expires_at
        connection.updated_at = datetime.utcnow()

        db.flush()
        db.commit()
        db.refresh(connection)
        return connection

    @classmethod
    def disconnect_microsoft_connection(cls, db: Session, *, user_id: str) -> bool:
        connection = cls.get_connection(db, user_id=user_id, provider=cls.PROVIDER_MICROSOFT)
        if connection is None:
            return False

        db.delete(connection)
        db.commit()
        return True

    @classmethod
    def serialize_status(
        cls,
        connection: UserOAuthConnection | None,
    ) -> dict:
        if connection is None:
            return {
                "connected": False,
                "provider": cls.PROVIDER_MICROSOFT,
                "provider_email": None,
                "granted_scopes": [],
                "has_calendar_scope": False,
                "token_expires_at": None,
                "connected_at": None,
                "updated_at": None,
            }

        try:
            scopes = cls._normalize_scopes(json.loads(connection.granted_scopes))
        except json.JSONDecodeError:
            scopes = []

        return {
            "connected": True,
            "provider": connection.provider,
            "provider_email": connection.provider_email,
            "granted_scopes": scopes,
            "has_calendar_scope": "Calendars.Read" in scopes,
            "token_expires_at": connection.token_expires_at,
            "connected_at": connection.connected_at,
            "updated_at": connection.updated_at,
        }
