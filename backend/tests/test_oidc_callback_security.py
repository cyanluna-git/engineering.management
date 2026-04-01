from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.endpoints.auth import _create_oidc_flow_token
from app.core.security import create_access_token
from app.core.database import get_db
from app.main import app
from app.models.oauth_connection import UserOAuthConnection
from app.models.user import User
from app.services.oidc_service import OIDCService


def _make_test_client(db_session: Session) -> TestClient:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def test_oidc_login_sets_flow_cookie_and_redirects(monkeypatch):
    monkeypatch.setattr("app.api.endpoints.auth.settings.OIDC_ENABLED", True)
    monkeypatch.setattr(
        OIDCService,
        "initiate_auth_code_flow",
        classmethod(
            lambda cls, extra_scopes=None, redirect_uri=None: {
                "auth_uri": "https://login.microsoftonline.com/fake/oauth2/v2.0/authorize",
                "state": "test-state",
                "nonce": "test-nonce",
            }
        ),
    )

    client = TestClient(app)
    try:
        response = client.get("/api/auth/oidc/login", follow_redirects=False)
    finally:
        client.close()

    assert response.status_code == 307
    assert response.headers["location"].startswith("https://login.microsoftonline.com/")
    assert "eob_oidc_flow=" in response.headers.get("set-cookie", "")


def test_sso_login_alias_still_starts_oidc_flow(monkeypatch):
    monkeypatch.setattr("app.api.endpoints.auth.settings.OIDC_ENABLED", True)
    monkeypatch.setattr(
        OIDCService,
        "initiate_auth_code_flow",
        classmethod(
            lambda cls, extra_scopes=None, redirect_uri=None: {
                "auth_uri": "https://login.microsoftonline.com/fake/oauth2/v2.0/authorize",
                "state": "alias-state",
                "nonce": "alias-nonce",
            }
        ),
    )

    client = TestClient(app)
    try:
        response = client.get("/api/auth/sso/login", follow_redirects=False)
    finally:
        client.close()

    assert response.status_code == 307
    assert response.headers["location"].startswith("https://login.microsoftonline.com/")
    assert "eob_oidc_flow=" in response.headers.get("set-cookie", "")


def test_calendar_connect_start_sets_flow_cookie_for_authenticated_user(
    db_session: Session, sample_position, monkeypatch
):
    user = User(
        email="calendar-user@edwards.com",
        hashed_password="placeholder",
        name="Calendar User",
        position_id=sample_position.id,
        role="USER",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    monkeypatch.setattr("app.api.endpoints.auth.settings.OIDC_ENABLED", True)
    monkeypatch.setattr(
        OIDCService,
        "initiate_auth_code_flow",
        classmethod(
            lambda cls, extra_scopes=None, redirect_uri=None: {
                "auth_uri": "https://login.microsoftonline.com/fake/oauth2/v2.0/authorize",
                "state": "calendar-state",
                "nonce": "calendar-nonce",
            }
        ),
    )

    client = _make_test_client(db_session)
    access_token = create_access_token({"sub": user.id, "role": user.role})
    try:
        response = client.post(
            "/api/auth/oidc/calendar/connect",
            json={"redirect_url": "https://eob.10.182.252.32.sslip.io/worklogs"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["authorization_url"].startswith("https://login.microsoftonline.com/")
    assert "eob_oidc_flow=" in response.headers.get("set-cookie", "")


def test_calendar_connect_callback_persists_oauth_connection(
    db_session: Session, sample_position, monkeypatch
):
    user = User(
        email="calendar-linked@edwards.com",
        hashed_password="placeholder",
        name="Calendar Linked",
        position_id=sample_position.id,
        role="USER",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    monkeypatch.setattr("app.api.endpoints.auth.settings.OIDC_ENABLED", True)
    monkeypatch.setattr(
        OIDCService,
        "exchange_code_for_token",
        classmethod(
            lambda cls, flow=None, auth_response=None, redirect_uri=None: {
                "id_token_claims": {},
                "refresh_token": "refresh-token",
                "access_token": "access-token",
                "scope": "User.Read Calendars.Read",
                "expires_in": 3600,
            }
        ),
    )
    monkeypatch.setattr(
        OIDCService,
        "extract_user_attributes",
        staticmethod(
            lambda _result: {
                "email": "calendar-linked@edwards.com",
                "name": "Calendar Linked",
                "provider_id": "entra-oid",
                "tenant_id": "entra-tenant",
            }
        ),
    )

    client = _make_test_client(db_session)
    flow_cookie = _create_oidc_flow_token(
        {
            "state": "calendar-state",
            "_app_flow_type": "calendar_connect",
            "_app_link_user_id": user.id,
        },
        "https://eob.10.182.252.32.sslip.io/worklogs",
    )
    try:
        response = client.get(
            "/api/auth/oidc/callback?code=dummy&state=calendar-state",
            cookies={"eob_oidc_flow": flow_cookie},
            follow_redirects=False,
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 302
    assert response.headers["location"] == "https://eob.10.182.252.32.sslip.io/worklogs?calendar=connected"

    connection = (
        db_session.query(UserOAuthConnection)
        .filter(UserOAuthConnection.user_id == user.id)
        .first()
    )
    assert connection is not None
    assert connection.provider == "microsoft"
    assert connection.provider_subject == "entra-oid"
    assert "Calendars.Read" in connection.granted_scopes


def test_oidc_callback_redirect_uses_fragment_in_debug_mode(
    db_session: Session, sample_position, monkeypatch
):
    user = User(
        email="oidc-user@edwards.com",
        hashed_password="placeholder",
        name="OIDC User",
        position_id=sample_position.id,
        role="USER",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    monkeypatch.setattr("app.api.endpoints.auth.settings.OIDC_ENABLED", True)
    monkeypatch.setattr("app.api.endpoints.auth.settings.DEBUG", True)
    monkeypatch.setattr(
        OIDCService,
        "exchange_code_for_token",
        classmethod(lambda cls, flow=None, auth_response=None, redirect_uri=None: {"id_token_claims": {}}),
    )
    monkeypatch.setattr(
        OIDCService,
        "extract_user_attributes",
        staticmethod(
            lambda _result: {
                "email": "oidc-user@edwards.com",
                "name": "OIDC User",
                "provider_id": "oidc-sub",
            }
        ),
    )

    client = _make_test_client(db_session)
    flow_cookie = _create_oidc_flow_token({"state": "test-state"}, None)
    try:
        response = client.get(
            "/api/auth/oidc/callback?code=dummy&state=test-state",
            cookies={"eob_oidc_flow": flow_cookie},
            follow_redirects=False,
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("http://localhost:3004/#token=")
    assert "&refresh=" in location
    assert "?token=" not in location


def test_oidc_callback_redirect_uses_fragment_in_production_mode(
    db_session: Session, sample_position, monkeypatch
):
    user = User(
        email="oidc-prod@edwards.com",
        hashed_password="placeholder",
        name="OIDC Prod",
        position_id=sample_position.id,
        role="USER",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    monkeypatch.setattr("app.api.endpoints.auth.settings.OIDC_ENABLED", True)
    monkeypatch.setattr("app.api.endpoints.auth.settings.DEBUG", False)
    monkeypatch.setattr(
        OIDCService,
        "exchange_code_for_token",
        classmethod(lambda cls, flow=None, auth_response=None, redirect_uri=None: {"id_token_claims": {}}),
    )
    monkeypatch.setattr(
        OIDCService,
        "extract_user_attributes",
        staticmethod(
            lambda _result: {
                "email": "oidc-prod@edwards.com",
                "name": "OIDC Prod",
                "provider_id": "oidc-sub",
            }
        ),
    )

    client = _make_test_client(db_session)
    flow_cookie = _create_oidc_flow_token({"state": "test-state"}, None)
    try:
        response = client.get(
            "/api/auth/oidc/callback?code=dummy&state=test-state",
            cookies={"eob_oidc_flow": flow_cookie},
            follow_redirects=False,
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 302
    location = response.headers["location"]
    assert "/#token=" in location
    assert "&refresh=" in location
    assert "?token=" not in location
