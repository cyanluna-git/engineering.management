"""
Microsoft Graph profile photo access helpers backed by stored delegated tokens.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.oauth_connection_service import OAuthConnectionService
from app.services.oidc_service import OIDCService


class GraphProfileError(ValueError):
    """Raised when the current user's Microsoft profile photo cannot be fetched."""


class GraphProfilePhotoNotFound(GraphProfileError):
    """Raised when the current user does not have a Microsoft profile photo."""


class GraphProfileService:
    """Fetch Microsoft Graph profile photos using persisted delegated tokens."""

    PROVIDER = OAuthConnectionService.PROVIDER_MICROSOFT
    PROFILE_SCOPE = "User.Read"
    GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
    ACCESS_TOKEN_EXPIRY_SKEW = timedelta(minutes=2)

    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _parse_scopes(connection) -> list[str]:
        try:
            scopes = json.loads(connection.granted_scopes or "[]")
        except json.JSONDecodeError:
            scopes = []
        return [scope for scope in scopes if scope]

    def _connection_for_user(self, user: User):
        connection = OAuthConnectionService.get_connection(
            self.db,
            user_id=user.id,
            provider=self.PROVIDER,
        )
        if connection is None:
            raise GraphProfileError("Microsoft profile is not connected")

        scopes = self._parse_scopes(connection)
        if self.PROFILE_SCOPE not in scopes:
            raise GraphProfileError("Microsoft profile access is missing User.Read")

        return connection, scopes

    @classmethod
    def _normalize_expiry(cls, expires_at: datetime | None) -> datetime | None:
        if expires_at is None:
            return None
        if expires_at.tzinfo is None:
            return expires_at.replace(tzinfo=timezone.utc)
        return expires_at

    @classmethod
    def _is_access_token_valid(cls, connection) -> bool:
        if not connection.access_token_encrypted:
            return False

        expires_at = cls._normalize_expiry(connection.token_expires_at)
        if expires_at is None:
            return True

        return expires_at > (datetime.now(timezone.utc) + cls.ACCESS_TOKEN_EXPIRY_SKEW)

    @staticmethod
    def _token_error_message(exc: httpx.HTTPStatusError) -> str:
        try:
            payload = exc.response.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict):
            error_description = payload.get("error_description")
            if isinstance(error_description, str) and error_description.strip():
                return error_description.strip()

            nested_error = payload.get("error")
            if isinstance(nested_error, dict):
                message = nested_error.get("message")
                if isinstance(message, str) and message.strip():
                    return message.strip()

            if isinstance(nested_error, str) and nested_error.strip():
                return nested_error.strip()

        response_text = exc.response.text.strip()
        if response_text:
            return response_text

        return f"HTTP {exc.response.status_code}"

    def _refresh_access_token(self, user: User, connection, scopes: list[str]) -> str:
        if not connection.refresh_token_encrypted:
            raise GraphProfileError(
                "Microsoft profile token is missing refresh credentials. Please sign in again."
            )

        refresh_token = OAuthConnectionService.decrypt(connection.refresh_token_encrypted)
        if not refresh_token:
            raise GraphProfileError(
                "Microsoft profile refresh token is unavailable. Please sign in again."
            )

        try:
            token_result = OIDCService.refresh_access_token(
                refresh_token=refresh_token,
                scopes=scopes or [self.PROFILE_SCOPE],
            )
        except ValueError as exc:
            raise GraphProfileError(
                "Microsoft profile token scopes are invalid. Please sign in again."
            ) from exc
        except httpx.HTTPStatusError as exc:
            message = self._token_error_message(exc)
            raise GraphProfileError(
                f"Microsoft profile token refresh failed: {message}"
            ) from exc
        except httpx.HTTPError as exc:
            raise GraphProfileError(
                "Microsoft profile token refresh failed due to a network error. Please try again."
            ) from exc

        OAuthConnectionService.upsert_microsoft_connection(
            self.db,
            user=user,
            provider_subject=connection.provider_subject,
            provider_email=connection.provider_email,
            tenant_id=connection.tenant_id,
            granted_scopes=OIDCService.granted_scopes(token_result),
            refresh_token=token_result.get("refresh_token"),
            access_token=token_result.get("access_token"),
            expires_in_seconds=token_result.get("expires_in"),
        )

        access_token = token_result.get("access_token")
        if not access_token:
            raise GraphProfileError("Microsoft profile access token refresh failed")
        return access_token

    def _access_token_for_user(self, user: User) -> tuple[str, bool]:
        connection, scopes = self._connection_for_user(user)

        if self._is_access_token_valid(connection):
            access_token = OAuthConnectionService.decrypt(connection.access_token_encrypted)
            if access_token:
                return access_token, True

        return self._refresh_access_token(user, connection, scopes), False

    def get_profile_photo(self, user: User) -> tuple[bytes, str]:
        access_token, used_cached_token = self._access_token_for_user(user)
        connection, scopes = self._connection_for_user(user)

        def fetch_photo(token: str) -> tuple[bytes, str]:
            try:
                response = httpx.get(
                    f"{self.GRAPH_BASE_URL}/me/photo/$value",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=20.0,
                )
                if response.status_code == 404:
                    raise GraphProfilePhotoNotFound("Microsoft profile photo not found")
                if response.status_code == 401:
                    raise GraphProfileError("HTTP 401")
                response.raise_for_status()
            except GraphProfilePhotoNotFound:
                raise
            except httpx.HTTPStatusError as exc:
                message = self._token_error_message(exc)
                raise GraphProfileError(
                    f"Microsoft profile photo fetch failed: {message}"
                ) from exc
            except httpx.HTTPError as exc:
                raise GraphProfileError(
                    "Microsoft profile photo fetch failed due to a network error. Please try again."
                ) from exc

            return response.content, response.headers.get("content-type", "image/jpeg")

        try:
            return fetch_photo(access_token)
        except GraphProfileError as exc:
            if not used_cached_token or str(exc) != "HTTP 401":
                raise

        refreshed_token = self._refresh_access_token(user, connection, scopes)
        return fetch_photo(refreshed_token)
