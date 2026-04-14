from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jose import jwt

from app.core.security import verify_portal_handoff_token


def _create_user(db_session, user_id: str, email: str, position_id: str, role: str = "USER"):
    from app.models.user import User

    user = User(
        id=user_id,
        email=email,
        hashed_password="hashed",
        name=email.split("@", 1)[0],
        position_id=position_id,
        role=role,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _sign_handoff_token(secret: str, **overrides) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "type": "portal_handoff",
        "iss": "pcas-portal",
        "aud": ["eob"],
        "sub": "gateway@example.com",
        "jti": str(uuid4()),
        "exp": now + timedelta(minutes=2),
    }
    payload.update(overrides)
    return jwt.encode(payload, secret, algorithm="HS256")


def test_verify_portal_handoff_token_accepts_current_key(monkeypatch):
    monkeypatch.setattr("app.core.security.settings.PORTAL_HANDOFF_VERIFY_KEY", "current-secret-1234567890-current-secret")
    monkeypatch.setattr("app.core.security.settings.PORTAL_HANDOFF_VERIFY_KEY_PREV", "")

    token = _sign_handoff_token("current-secret-1234567890-current-secret")

    payload = verify_portal_handoff_token(token, audience="eob")

    assert payload is not None
    assert payload["sub"] == "gateway@example.com"


def test_verify_portal_handoff_token_accepts_previous_key(monkeypatch):
    monkeypatch.setattr("app.core.security.settings.PORTAL_HANDOFF_VERIFY_KEY", "current-secret-1234567890-current-secret")
    monkeypatch.setattr("app.core.security.settings.PORTAL_HANDOFF_VERIFY_KEY_PREV", "previous-secret-123456789-previous-secret")

    token = _sign_handoff_token("previous-secret-123456789-previous-secret")

    payload = verify_portal_handoff_token(token, audience="eob")

    assert payload is not None
    assert isinstance(payload["jti"], str)
    assert payload["jti"]


def test_verify_portal_handoff_token_rejects_wrong_audience(monkeypatch):
    monkeypatch.setattr("app.core.security.settings.PORTAL_HANDOFF_VERIFY_KEY", "current-secret-1234567890-current-secret")
    monkeypatch.setattr("app.core.security.settings.PORTAL_HANDOFF_VERIFY_KEY_PREV", "")

    token = _sign_handoff_token(
        "current-secret-1234567890-current-secret",
        aud=["jarvis"],
    )

    payload = verify_portal_handoff_token(token, audience="eob")

    assert payload is None


def test_gateway_login_returns_503_when_mode_is_direct(client, monkeypatch):
    monkeypatch.setattr("app.api.endpoints.auth.settings.GATEWAY_MODE_EOB", "direct")

    response = client.post("/api/auth/gateway/login", json={"handoff_token": "token"})

    assert response.status_code == 503


def test_gateway_login_returns_503_when_keys_are_missing(client, monkeypatch):
    monkeypatch.setattr("app.api.endpoints.auth.settings.GATEWAY_MODE_EOB", "gateway")
    monkeypatch.setattr("app.api.endpoints.auth.settings.PORTAL_HANDOFF_VERIFY_KEY", "")
    monkeypatch.setattr("app.api.endpoints.auth.settings.PORTAL_HANDOFF_VERIFY_KEY_PREV", "")

    response = client.post("/api/auth/gateway/login", json={"handoff_token": "token"})

    assert response.status_code == 503


def test_gateway_login_exchanges_valid_handoff_token(
    client,
    db_session,
    sample_position,
    monkeypatch,
):
    secret = "current-secret-1234567890-current-secret"
    monkeypatch.setattr("app.api.endpoints.auth.settings.GATEWAY_MODE_EOB", "gateway")
    monkeypatch.setattr("app.api.endpoints.auth.settings.PORTAL_HANDOFF_VERIFY_KEY", secret)
    monkeypatch.setattr("app.api.endpoints.auth.settings.PORTAL_HANDOFF_VERIFY_KEY_PREV", "")

    user = _create_user(
        db_session,
        "gateway-u1",
        "gateway@example.com",
        sample_position.id,
    )
    token = _sign_handoff_token(secret, sub=user.email)

    response = client.post("/api/auth/gateway/login", json={"handoff_token": token})

    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["refresh_token"]


def test_gateway_login_rejects_replayed_handoff_token(
    client,
    db_session,
    sample_position,
    monkeypatch,
):
    secret = "current-secret-1234567890-current-secret"
    monkeypatch.setattr("app.api.endpoints.auth.settings.GATEWAY_MODE_EOB", "gateway")
    monkeypatch.setattr("app.api.endpoints.auth.settings.PORTAL_HANDOFF_VERIFY_KEY", secret)
    monkeypatch.setattr("app.api.endpoints.auth.settings.PORTAL_HANDOFF_VERIFY_KEY_PREV", "")

    user = _create_user(
        db_session,
        "gateway-u2",
        "gateway-replay@example.com",
        sample_position.id,
    )
    token = _sign_handoff_token(secret, sub=user.email)

    first = client.post("/api/auth/gateway/login", json={"handoff_token": token})
    second = client.post("/api/auth/gateway/login", json={"handoff_token": token})

    assert first.status_code == 200
    assert second.status_code == 401


def test_gateway_login_rejects_unknown_user(client, monkeypatch):
    secret = "current-secret-1234567890-current-secret"
    monkeypatch.setattr("app.api.endpoints.auth.settings.GATEWAY_MODE_EOB", "gateway")
    monkeypatch.setattr("app.api.endpoints.auth.settings.PORTAL_HANDOFF_VERIFY_KEY", secret)
    monkeypatch.setattr("app.api.endpoints.auth.settings.PORTAL_HANDOFF_VERIFY_KEY_PREV", "")

    token = _sign_handoff_token(secret, sub="missing@example.com")

    response = client.post("/api/auth/gateway/login", json={"handoff_token": token})

    assert response.status_code == 401
