from datetime import datetime, timedelta, timezone

import httpx
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models.oauth_connection import UserOAuthConnection
from app.models.user import User
from app.services.oauth_connection_service import OAuthConnectionService
from app.services.graph_profile_service import GraphProfileError, GraphProfilePhotoNotFound


def _make_client(db_session: Session) -> TestClient:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _seed_user(db_session: Session, sample_position) -> User:
    user = User(
        email="photo-user@edwards.com",
        hashed_password="placeholder",
        name="Photo User",
        position_id=sample_position.id,
        role="USER",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _clear_overrides(client: TestClient):
    client.close()
    app.dependency_overrides.clear()


def test_auth_me_photo_returns_image_payload(db_session: Session, sample_position, monkeypatch):
    user = _seed_user(db_session, sample_position)
    client = _make_client(db_session)
    access_token = create_access_token({"sub": user.id, "role": user.role})

    monkeypatch.setattr(
        "app.services.graph_profile_service.GraphProfileService.get_profile_photo",
        lambda self, current_user: (b"fake-image-bytes", "image/jpeg"),
    )

    try:
        response = client.get(
            "/api/auth/me/photo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    finally:
        _clear_overrides(client)

    assert response.status_code == status.HTTP_200_OK
    assert response.content == b"fake-image-bytes"
    assert response.headers["content-type"] == "image/jpeg"
    assert "private, max-age=300" in response.headers["cache-control"]


def test_auth_me_photo_returns_404_when_photo_missing(db_session: Session, sample_position, monkeypatch):
    user = _seed_user(db_session, sample_position)
    client = _make_client(db_session)
    access_token = create_access_token({"sub": user.id, "role": user.role})

    monkeypatch.setattr(
        "app.services.graph_profile_service.GraphProfileService.get_profile_photo",
        lambda self, current_user: (_ for _ in ()).throw(
            GraphProfilePhotoNotFound("Microsoft profile photo not found")
        ),
    )

    try:
        response = client.get(
            "/api/auth/me/photo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    finally:
        _clear_overrides(client)

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_auth_me_photo_returns_502_for_upstream_failure(db_session: Session, sample_position, monkeypatch):
    user = _seed_user(db_session, sample_position)
    client = _make_client(db_session)
    access_token = create_access_token({"sub": user.id, "role": user.role})

    monkeypatch.setattr(
        "app.services.graph_profile_service.GraphProfileService.get_profile_photo",
        lambda self, current_user: (_ for _ in ()).throw(
            GraphProfileError("Microsoft profile photo fetch failed: upstream error")
        ),
    )

    try:
        response = client.get(
            "/api/auth/me/photo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    finally:
        _clear_overrides(client)

    assert response.status_code == status.HTTP_502_BAD_GATEWAY


def test_auth_me_photo_refresh_ignores_reserved_scopes(
    db_session: Session,
    sample_position,
    monkeypatch,
):
    user = _seed_user(db_session, sample_position)
    client = _make_client(db_session)
    access_token = create_access_token({"sub": user.id, "role": user.role})

    connection = UserOAuthConnection(
        user_id=user.id,
        provider="microsoft",
        provider_email=user.email,
        granted_scopes='["openid", "profile", "offline_access", "User.Read"]',
        refresh_token_encrypted=OAuthConnectionService.encrypt("refresh-token"),
        access_token_encrypted=None,
        token_expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db_session.add(connection)
    db_session.commit()

    def fake_refresh_access_token(*, refresh_token, scopes):
        return {
            "access_token": "photo-access-token",
            "refresh_token": "refresh-token-2",
            "scope": "User.Read",
            "expires_in": 3600,
        }

    def fake_get(url, *, headers=None, timeout=None):
        return httpx.Response(
            200,
            content=b"fake-image-bytes",
            headers={"content-type": "image/jpeg"},
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(
        "app.services.oidc_service.OIDCService.refresh_access_token",
        fake_refresh_access_token,
    )
    monkeypatch.setattr("httpx.get", fake_get)

    try:
        response = client.get(
            "/api/auth/me/photo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    finally:
        _clear_overrides(client)

    assert response.status_code == status.HTTP_200_OK
    assert response.content == b"fake-image-bytes"
