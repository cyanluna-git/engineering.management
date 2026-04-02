"""
Microsoft Graph calendar access helpers backed by stored delegated refresh tokens.
"""

from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.oauth_connection_service import OAuthConnectionService
from app.services.oidc_service import OIDCService


class CalendarConnectionError(ValueError):
    """Raised when a user has not connected Microsoft Calendar access."""


class GraphCalendarService:
    """Fetch Microsoft calendar events using persisted delegated refresh tokens."""

    PROVIDER = OAuthConnectionService.PROVIDER_MICROSOFT
    EXTERNAL_SOURCE = "microsoft_calendar"
    CALENDAR_SCOPE = "Calendars.Read"
    GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
    OUTLOOK_TIMEZONE = "Asia/Seoul"
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
            raise CalendarConnectionError("Microsoft Calendar is not connected")

        scopes = self._parse_scopes(connection)
        if self.CALENDAR_SCOPE not in scopes:
            raise CalendarConnectionError("Microsoft Calendar consent is missing Calendars.Read")

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

    @classmethod
    def _cached_access_token(cls, connection) -> str | None:
        if not cls._is_access_token_valid(connection):
            return None
        return OAuthConnectionService.decrypt(connection.access_token_encrypted)

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

    def refresh_graph_access_token(self, user: User) -> str:
        connection, stored_scopes = self._connection_for_user(user)
        cached_access_token = self._cached_access_token(connection)
        if cached_access_token:
            return cached_access_token

        if not connection.refresh_token_encrypted:
            raise CalendarConnectionError(
                "Microsoft Calendar token is missing refresh credentials. Please reconnect your calendar."
            )

        refresh_token = OAuthConnectionService.decrypt(connection.refresh_token_encrypted)
        if not refresh_token:
            raise CalendarConnectionError(
                "Microsoft Calendar refresh token is unavailable. Please reconnect your calendar."
            )

        try:
            token_result = OIDCService.refresh_access_token(
                refresh_token=refresh_token,
                scopes=stored_scopes or [self.CALENDAR_SCOPE],
            )
        except ValueError as exc:
            raise CalendarConnectionError(
                "Microsoft Calendar token scopes are invalid. Please reconnect your calendar."
            ) from exc
        except httpx.HTTPStatusError as exc:
            message = self._token_error_message(exc)
            raise CalendarConnectionError(
                f"Microsoft Calendar token refresh failed: {message}"
            ) from exc
        except httpx.HTTPError as exc:
            raise CalendarConnectionError(
                "Microsoft Calendar token refresh failed due to a network error. Please try again."
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
            raise CalendarConnectionError("Microsoft Calendar access token refresh failed")
        return access_token

    @staticmethod
    def _iso_start(start_date: date) -> str:
        return datetime.combine(start_date, time.min, tzinfo=timezone.utc).isoformat()

    @staticmethod
    def _iso_end(end_date: date) -> str:
        return datetime.combine(
            end_date + timedelta(days=1),
            time.min,
            tzinfo=timezone.utc,
        ).isoformat()

    def list_calendar_events(
        self,
        *,
        user: User,
        start_date: date,
        end_date: date,
    ) -> list[dict[str, Any]]:
        access_token = self.refresh_graph_access_token(user)
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Prefer": f'outlook.timezone="{self.OUTLOOK_TIMEZONE}"',
        }
        params = {
            "startDateTime": self._iso_start(start_date),
            "endDateTime": self._iso_end(end_date),
            "$top": "100",
            "$orderby": "start/dateTime",
            "$select": ",".join(
                [
                    "id",
                    "subject",
                    "start",
                    "end",
                    "attendees",
                    "onlineMeetingProvider",
                    "isCancelled",
                    "isAllDay",
                    "location",
                    "type",
                    "showAs",
                ]
            ),
        }

        events: list[dict[str, Any]] = []
        next_url = f"{self.GRAPH_BASE_URL}/me/calendarView"

        with httpx.Client(timeout=20.0) as client:
            while next_url:
                try:
                    response = client.get(
                        next_url,
                        headers=headers,
                        params=params if next_url.endswith("/calendarView") else None,
                    )
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    message = self._token_error_message(exc)
                    raise CalendarConnectionError(
                        f"Microsoft Calendar fetch failed: {message}"
                    ) from exc
                except httpx.HTTPError as exc:
                    raise CalendarConnectionError(
                        "Microsoft Calendar fetch failed due to a network error. Please try again."
                    ) from exc
                payload = response.json()
                events.extend(payload.get("value", []))
                next_url = payload.get("@odata.nextLink")

        return events
