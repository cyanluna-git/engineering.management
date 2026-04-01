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

        if not connection.refresh_token_encrypted:
            raise CalendarConnectionError("Microsoft Calendar refresh token is unavailable")

        return connection, scopes

    def refresh_graph_access_token(self, user: User) -> str:
        connection, stored_scopes = self._connection_for_user(user)
        refresh_token = OAuthConnectionService.decrypt(connection.refresh_token_encrypted)
        if not refresh_token:
            raise CalendarConnectionError("Microsoft Calendar refresh token is unavailable")

        token_result = OIDCService.refresh_access_token(
            refresh_token=refresh_token,
            scopes=stored_scopes or [self.CALENDAR_SCOPE],
        )

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
                response = client.get(
                    next_url,
                    headers=headers,
                    params=params if next_url.endswith("/calendarView") else None,
                )
                response.raise_for_status()
                payload = response.json()
                events.extend(payload.get("value", []))
                next_url = payload.get("@odata.nextLink")

        return events
