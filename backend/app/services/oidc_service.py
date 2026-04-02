"""
OIDC service helpers for Entra ID / MSAL-based authentication.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

import httpx

from app.core.config import settings


class OIDCService:
    """Thin wrapper around MSAL confidential-client auth code flow."""

    RESERVED_SCOPES = {"openid", "profile", "offline_access"}

    @staticmethod
    def _authority() -> str:
        if settings.OIDC_AUTHORITY.strip():
            return settings.OIDC_AUTHORITY.strip()
        tenant_id = settings.OIDC_TENANT_ID.strip()
        if not tenant_id:
            raise ValueError("OIDC_TENANT_ID or OIDC_AUTHORITY must be configured")
        return f"https://login.microsoftonline.com/{tenant_id}"

    @classmethod
    def _client(cls):
        if not settings.OIDC_CLIENT_ID.strip():
            raise ValueError("OIDC_CLIENT_ID is required when OIDC is enabled")
        if not settings.OIDC_CLIENT_SECRET.strip():
            raise ValueError("OIDC_CLIENT_SECRET is required when OIDC is enabled")

        import msal

        return msal.ConfidentialClientApplication(
            client_id=settings.OIDC_CLIENT_ID.strip(),
            authority=cls._authority(),
            client_credential=settings.OIDC_CLIENT_SECRET.strip(),
        )

    @staticmethod
    def _normalized_scopes(scopes: Iterable[str] | None) -> list[str]:
        if isinstance(scopes, str):
            scopes = scopes.replace(",", " ").split()
        return [scope.strip() for scope in (scopes or []) if scope and scope.strip()]

    @classmethod
    def _msal_scopes(cls, scopes: Iterable[str] | None) -> list[str]:
        return [
            scope
            for scope in cls._normalized_scopes(scopes)
            if scope not in cls.RESERVED_SCOPES
        ]

    @classmethod
    def base_scopes(cls) -> list[str]:
        return cls._msal_scopes(settings.oidc_scopes_list)

    @classmethod
    def merge_scopes(cls, extra_scopes: Iterable[str] | None = None) -> list[str]:
        scopes = cls.base_scopes()
        allowed_extras = set(settings.oidc_allowed_extra_scopes_list)

        for scope in cls._normalized_scopes(extra_scopes):
            if scope in cls.RESERVED_SCOPES:
                continue
            if scope not in allowed_extras:
                raise ValueError(f"Unsupported OIDC extra scope: {scope}")
            if scope not in scopes:
                scopes.append(scope)

        return scopes

    @classmethod
    def initiate_auth_code_flow(
        cls,
        *,
        extra_scopes: Iterable[str] | None = None,
        redirect_uri: str | None = None,
    ) -> dict[str, Any]:
        return cls._client().initiate_auth_code_flow(
            scopes=cls.merge_scopes(extra_scopes),
            redirect_uri=redirect_uri or settings.OIDC_REDIRECT_URI.strip(),
        )

    @classmethod
    def exchange_code_for_token(
        cls,
        *,
        flow: dict[str, Any],
        auth_response: dict[str, Any],
        redirect_uri: str | None = None,
    ) -> dict[str, Any]:
        scopes = cls._msal_scopes(flow.get("scope")) or cls.base_scopes()
        return cls._client().acquire_token_by_auth_code_flow(
            auth_code_flow=flow,
            auth_response=auth_response,
            scopes=scopes,
        )

    @classmethod
    def refresh_access_token(
        cls,
        *,
        refresh_token: str,
        scopes: Iterable[str] | None = None,
    ) -> dict[str, Any]:
        requested_scopes = cls.merge_scopes(scopes)
        response = httpx.post(
            f"{cls._authority().rstrip('/')}/oauth2/v2.0/token",
            data={
                "client_id": settings.OIDC_CLIENT_ID.strip(),
                "client_secret": settings.OIDC_CLIENT_SECRET.strip(),
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "scope": " ".join(requested_scopes),
            },
            timeout=20.0,
        )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def extract_user_attributes(token_result: dict[str, Any]) -> dict[str, str | None]:
        claims = token_result.get("id_token_claims") or {}
        email = (
            claims.get("preferred_username")
            or claims.get("email")
            or claims.get("upn")
        )
        name = claims.get("name") or claims.get("preferred_username") or email
        provider_id = claims.get("oid") or claims.get("sub")

        return {
            "email": email,
            "name": name,
            "provider_id": provider_id,
            "tenant_id": claims.get("tid"),
        }

    @classmethod
    def granted_scopes(cls, token_result: dict[str, Any]) -> list[str]:
        raw_scopes = cls._normalized_scopes(token_result.get("scope"))
        all_scopes = cls._normalized_scopes([*settings.oidc_scopes_list, *raw_scopes])
        granted: list[str] = []
        for scope in all_scopes:
            if scope not in granted:
                granted.append(scope)
        return granted

    @staticmethod
    def token_expiry(token_result: dict[str, Any]) -> datetime | None:
        expires_at = token_result.get("expires_on")
        if expires_at:
            return datetime.fromtimestamp(int(expires_at), tz=timezone.utc)

        expires_in = token_result.get("expires_in")
        if expires_in:
            return datetime.now(timezone.utc)

        return None
