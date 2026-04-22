"""Endpoint tests for GET /api/jira/requests and GET /api/jira/requests/{key}."""
import pytest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.security import get_current_user
from app.main import app
from app.services.jira_service import (
    JiraAuthError,
    JiraCredentialsMissingError,
    JiraTicket,
    JiraTicketDetail,
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


def _sample_ticket(
    key: str = "EOB-1",
    summary: str = "Test issue",
    status: str = "Open",
    status_category: str = "new",
    reporter_name: str = "Alice",
    assignee_name: str | None = None,
    priority: str | None = "Medium",
    created: str = "2026-01-15T09:00:00.000+0000",
) -> JiraTicket:
    return JiraTicket(
        key=key,
        summary=summary,
        status=status,
        status_category=status_category,
        created=created,
        reporter_name=reporter_name,
        assignee_name=assignee_name,
        priority=priority,
    )


def _sample_detail(
    key: str = "EOB-1",
    summary: str = "Test issue",
    description: object = None,
) -> JiraTicketDetail:
    return JiraTicketDetail(
        key=key,
        summary=summary,
        status="Open",
        status_category="new",
        description=description,
        created="2026-01-15T09:00:00.000+0000",
        updated="2026-01-16T10:00:00.000+0000",
        reporter_name="Alice",
        reporter_avatar=None,
        assignee_name=None,
        assignee_avatar=None,
        priority="Medium",
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    """TestClient with a regular USER authenticated."""
    app.dependency_overrides[get_current_user] = lambda: _make_user(role="USER")
    yield client


# ---------------------------------------------------------------------------
# GET /api/jira/requests — happy path
# ---------------------------------------------------------------------------

class TestListJiraRequestsHappyPath:
    def test_returns_200_with_ticket_list(self, auth_client: TestClient):
        """GET /api/jira/requests -> 200 with list of ticket objects."""
        tickets = [
            _sample_ticket("EOB-1", "First bug"),
            _sample_ticket("EOB-2", "Second request", priority="High"),
        ]

        with patch(
            "app.api.endpoints.jira_requests.JiraService.list_requests",
            return_value=tickets,
        ):
            resp = auth_client.get("/api/jira/requests")

        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 2
        assert body[0]["key"] == "EOB-1"
        assert body[0]["summary"] == "First bug"
        assert body[0]["status_category"] == "new"

    def test_returns_empty_list_when_no_tickets(self, auth_client: TestClient):
        """GET /api/jira/requests -> 200 with empty list when no tickets."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.list_requests",
            return_value=[],
        ):
            resp = auth_client.get("/api/jira/requests")

        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# GET /api/jira/requests — auth
# ---------------------------------------------------------------------------

class TestListJiraRequestsAuth:
    def test_401_when_no_auth_token(self, client: TestClient):
        """GET /api/jira/requests -> 401 when no authentication provided."""
        app.dependency_overrides.clear()
        resp = client.get("/api/jira/requests")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/jira/requests — service errors
# ---------------------------------------------------------------------------

class TestListJiraRequestsServiceErrors:
    def test_503_when_credentials_missing(self, auth_client: TestClient):
        """GET /api/jira/requests -> 503 when Jira credentials not configured."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.list_requests",
            side_effect=JiraCredentialsMissingError("no creds"),
        ):
            resp = auth_client.get("/api/jira/requests")
        assert resp.status_code == 503
        assert resp.json()["detail"]["code"] == "JIRA_CREDENTIALS_MISSING"

    def test_502_when_auth_error(self, auth_client: TestClient):
        """GET /api/jira/requests -> 502 when Jira authentication fails."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.list_requests",
            side_effect=JiraAuthError("bad creds"),
        ):
            resp = auth_client.get("/api/jira/requests")
        assert resp.status_code == 502
        assert resp.json()["detail"]["code"] == "JIRA_AUTH_ERROR"

    def test_504_when_timeout(self, auth_client: TestClient):
        """GET /api/jira/requests -> 504 when Jira times out."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.list_requests",
            side_effect=JiraTimeoutError("timeout"),
        ):
            resp = auth_client.get("/api/jira/requests")
        assert resp.status_code == 504
        assert resp.json()["detail"]["code"] == "JIRA_TIMEOUT"


# ---------------------------------------------------------------------------
# GET /api/jira/requests/{key} — happy path
# ---------------------------------------------------------------------------

class TestGetJiraRequestDetailHappyPath:
    def test_returns_200_with_ticket_detail(self, auth_client: TestClient):
        """GET /api/jira/requests/{key} -> 200 with full ticket detail."""
        adf = {"type": "doc", "version": 1, "content": []}
        detail = _sample_detail("EOB-42", "Critical bug", description=adf)

        with patch(
            "app.api.endpoints.jira_requests.JiraService.get_request",
            return_value=detail,
        ):
            resp = auth_client.get("/api/jira/requests/EOB-42")

        assert resp.status_code == 200
        body = resp.json()
        assert body["key"] == "EOB-42"
        assert body["summary"] == "Critical bug"
        assert body["description"] == adf
        assert body["reporter_name"] == "Alice"
        assert body["assignee_name"] is None

    def test_null_description_returned_as_none(self, auth_client: TestClient):
        """GET /api/jira/requests/{key} -> description is null when not set."""
        detail = _sample_detail("EOB-5", description=None)

        with patch(
            "app.api.endpoints.jira_requests.JiraService.get_request",
            return_value=detail,
        ):
            resp = auth_client.get("/api/jira/requests/EOB-5")

        assert resp.status_code == 200
        assert resp.json()["description"] is None


# ---------------------------------------------------------------------------
# GET /api/jira/requests/{key} — auth
# ---------------------------------------------------------------------------

class TestGetJiraRequestDetailAuth:
    def test_401_when_no_auth_token(self, client: TestClient):
        """GET /api/jira/requests/{key} -> 401 when no authentication provided."""
        app.dependency_overrides.clear()
        resp = client.get("/api/jira/requests/EOB-1")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/jira/requests/{key} — service errors
# ---------------------------------------------------------------------------

class TestGetJiraRequestDetailServiceErrors:
    def test_502_when_upstream_error(self, auth_client: TestClient):
        """GET /api/jira/requests/{key} -> 502 when Jira returns unexpected error."""
        with patch(
            "app.api.endpoints.jira_requests.JiraService.get_request",
            side_effect=JiraUpstreamError("not found", 404),
        ):
            resp = auth_client.get("/api/jira/requests/EOB-MISSING")
        assert resp.status_code == 502
        assert resp.json()["detail"]["code"] == "JIRA_UPSTREAM_ERROR"
