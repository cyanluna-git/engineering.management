"""Endpoint tests for POST /api/jira/requests."""
import io
import pytest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import get_current_user
from app.main import app
from app.services.jira_service import (
    JiraAuthError,
    JiraCredentialsMissingError,
    JiraPartialFailureError,
    JiraTimeoutError,
    JiraUpstreamError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(role: str = "USER", email: str = "user@test.com") -> MagicMock:
    user = MagicMock()
    user.email = email
    user.role = role
    user.is_active = True
    return user


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    """TestClient with a regular USER authenticated."""
    app.dependency_overrides[get_current_user] = lambda: _make_user(role="USER")
    yield client


@pytest.fixture
def guest_client(client: TestClient) -> TestClient:
    """TestClient with a GUEST user (read-only)."""
    app.dependency_overrides[get_current_user] = lambda: _make_user(role="GUEST")
    yield client


@pytest.fixture
def viewer_client(client: TestClient) -> TestClient:
    """TestClient with a VIEWER user (read-only)."""
    app.dependency_overrides[get_current_user] = lambda: _make_user(role="VIEWER")
    yield client


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestCreateJiraRequestHappyPath:
    def test_returns_201_with_issue_data(self, auth_client: TestClient):
        """POST /api/jira/requests -> 201 with issue_key, issue_id, web_url."""
        expected = {
            "issue_key": "EX-99",
            "issue_id": "10099",
            "web_url": "https://ac-avi.atlassian.net/browse/EX-99",
        }
        with patch(
            "app.api.endpoints.jira_requests.JiraService.create_request",
            return_value=expected,
        ):
            resp = auth_client.post(
                "/api/jira/requests",
                data={"summary": "Something broke"},
            )

        assert resp.status_code == 201
        body = resp.json()
        assert body["issue_key"] == "EX-99"
        assert body["issue_id"] == "10099"
        assert "EX-99" in body["web_url"]

    def test_summary_and_description_forwarded_to_service(self, auth_client: TestClient):
        """Endpoint passes summary and description to JiraService.create_request."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.create_request",
            return_value={"issue_key": "EX-1", "issue_id": "1", "web_url": ""},
        ) as mock_create:
            auth_client.post(
                "/api/jira/requests",
                data={"summary": "My title", "description": "My desc"},
            )

        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args.kwargs
        assert call_kwargs["summary"] == "My title"
        assert call_kwargs["description"] == "My desc"

    def test_file_attachment_forwarded(self, auth_client: TestClient):
        """Endpoint reads file and forwards content to JiraService.create_request."""
        file_content = b"hello world"
        with patch(
            "app.api.endpoints.jira_requests.JiraService.create_request",
            return_value={"issue_key": "EX-2", "issue_id": "2", "web_url": ""},
        ) as mock_create:
            auth_client.post(
                "/api/jira/requests",
                data={"summary": "With file"},
                files={"file": ("test.txt", io.BytesIO(file_content), "text/plain")},
            )

        mock_create.assert_called_once()
        call_kwargs = mock_create.call_args.kwargs
        assert call_kwargs["attachment_filename"] == "test.txt"
        assert call_kwargs["attachment_content"] == file_content


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------

class TestCreateJiraRequestValidation:
    def test_400_when_file_exceeds_10mb(self, auth_client: TestClient):
        """POST returns 400 when file is larger than 10 MB."""
        oversized_content = b"x" * (10 * 1024 * 1024 + 1)
        resp = auth_client.post(
            "/api/jira/requests",
            data={"summary": "Big file"},
            files={"file": ("big.bin", io.BytesIO(oversized_content), "application/octet-stream")},
        )
        assert resp.status_code == 400
        body = resp.json()
        assert body["detail"]["code"] == "FILE_TOO_LARGE"

    def test_422_when_summary_missing(self, auth_client: TestClient):
        """POST returns 422 when required summary field is absent."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.create_request",
            return_value={"issue_key": "EX-1", "issue_id": "1", "web_url": ""},
        ):
            resp = auth_client.post(
                "/api/jira/requests",
                data={"description": "No summary"},
            )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Authentication / authorization
# ---------------------------------------------------------------------------

class TestCreateJiraRequestAuth:
    def test_401_when_no_auth_token(self, client: TestClient):
        """POST returns 401 when no auth token is provided (no dependency override)."""
        # Remove any overrides so real auth runs
        app.dependency_overrides.clear()
        resp = client.post(
            "/api/jira/requests",
            data={"summary": "Unauthorized request"},
        )
        assert resp.status_code == 401

    def test_403_when_guest_role(self, guest_client: TestClient):
        """POST returns 403 for GUEST role (read-only)."""
        resp = guest_client.post(
            "/api/jira/requests",
            data={"summary": "Guest request"},
        )
        assert resp.status_code == 403

    def test_403_when_viewer_role(self, viewer_client: TestClient):
        """POST returns 403 for VIEWER role (read-only)."""
        resp = viewer_client.post(
            "/api/jira/requests",
            data={"summary": "Viewer request"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Jira service exception → HTTP status mapping
# ---------------------------------------------------------------------------

class TestCreateJiraRequestServiceErrors:
    def test_503_when_credentials_missing(self, auth_client: TestClient):
        """POST returns 503 when JIRA credentials not configured."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.create_request",
            side_effect=JiraCredentialsMissingError("no creds"),
        ):
            resp = auth_client.post(
                "/api/jira/requests",
                data={"summary": "Test"},
            )
        assert resp.status_code == 503
        assert resp.json()["detail"]["code"] == "JIRA_CREDENTIALS_MISSING"

    def test_502_when_auth_error(self, auth_client: TestClient):
        """POST returns 502 when Jira authentication fails."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.create_request",
            side_effect=JiraAuthError("bad creds"),
        ):
            resp = auth_client.post(
                "/api/jira/requests",
                data={"summary": "Test"},
            )
        assert resp.status_code == 502
        assert resp.json()["detail"]["code"] == "JIRA_AUTH_ERROR"

    def test_504_when_timeout(self, auth_client: TestClient):
        """POST returns 504 when Jira times out."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.create_request",
            side_effect=JiraTimeoutError("timeout"),
        ):
            resp = auth_client.post(
                "/api/jira/requests",
                data={"summary": "Test"},
            )
        assert resp.status_code == 504
        assert resp.json()["detail"]["code"] == "JIRA_TIMEOUT"

    def test_502_when_partial_failure(self, auth_client: TestClient):
        """POST returns 502 when attachment uploaded but request creation failed."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.create_request",
            side_effect=JiraPartialFailureError("partial", ["tmp-1"]),
        ):
            resp = auth_client.post(
                "/api/jira/requests",
                data={"summary": "Test"},
            )
        assert resp.status_code == 502
        assert resp.json()["detail"]["code"] == "JIRA_PARTIAL_FAILURE"

    def test_502_when_upstream_error(self, auth_client: TestClient):
        """POST returns 502 on unexpected Jira upstream error."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.create_request",
            side_effect=JiraUpstreamError("bad gateway", 500),
        ):
            resp = auth_client.post(
                "/api/jira/requests",
                data={"summary": "Test"},
            )
        assert resp.status_code == 502
        assert resp.json()["detail"]["code"] == "JIRA_UPSTREAM_ERROR"
