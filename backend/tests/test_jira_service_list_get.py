"""Unit tests for JiraService.list_requests() and JiraService.get_request()."""
import pytest
from unittest.mock import MagicMock, patch

import httpx

from app.services.jira_service import (
    JiraAuthError,
    JiraCredentialsMissingError,
    JiraService,
    JiraTicket,
    JiraTicketDetail,
    JiraTimeoutError,
    JiraUpstreamError,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def service():
    """JiraService with test credentials injected via settings patch."""
    with patch("app.services.jira_service.settings") as mock_settings:
        mock_settings.JIRA_BASE_URL = "https://test.atlassian.net"
        mock_settings.JIRA_EMAIL = "bot@test.com"
        mock_settings.JIRA_TOKEN = "test-token"
        mock_settings.JIRA_SERVICE_DESK_ID = "1"
        mock_settings.JIRA_REQUEST_TYPE_ID = "4"
        mock_settings.JIRA_DEFAULT_COMPONENT = "eob"
        mock_settings.JIRA_HTTP_TIMEOUT = 20.0
        yield JiraService()


@pytest.fixture
def service_no_credentials():
    """JiraService with empty credentials."""
    with patch("app.services.jira_service.settings") as mock_settings:
        mock_settings.JIRA_BASE_URL = "https://test.atlassian.net"
        mock_settings.JIRA_EMAIL = ""
        mock_settings.JIRA_TOKEN = ""
        mock_settings.JIRA_SERVICE_DESK_ID = "1"
        mock_settings.JIRA_REQUEST_TYPE_ID = "4"
        mock_settings.JIRA_DEFAULT_COMPONENT = "eob"
        mock_settings.JIRA_HTTP_TIMEOUT = 20.0
        yield JiraService()


def _make_response(status_code: int, json_data: dict) -> MagicMock:
    """Create a mock httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    return resp


def _make_issue(
    key: str = "EOB-1",
    summary: str = "Test issue",
    status_name: str = "Open",
    status_category: str = "new",
    reporter: str = "John Doe",
    assignee: str | None = None,
    priority: str | None = "Medium",
    created: str = "2026-01-15T09:00:00.000+0000",
) -> dict:
    """Build a minimal Jira issue dict as returned by search API."""
    fields: dict = {
        "summary": summary,
        "status": {
            "name": status_name,
            "statusCategory": {"key": status_category},
        },
        "created": created,
        "reporter": {"displayName": reporter},
        "assignee": {"displayName": assignee} if assignee else None,
        "priority": {"name": priority} if priority else None,
    }
    return {"key": key, "fields": fields}


# ---------------------------------------------------------------------------
# list_requests — happy path
# ---------------------------------------------------------------------------

class TestListRequestsHappyPath:
    def test_returns_list_of_jira_tickets(self, service):
        """list_requests returns a list of JiraTicket dataclasses on success."""
        issues = [
            _make_issue("EOB-1", "First issue", "Open", "new", "Alice", None, "High"),
            _make_issue("EOB-2", "Second issue", "In Progress", "indeterminate", "Bob", "Carol", "Medium"),
        ]

        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, {"issues": issues})
            tickets = service.list_requests()

        assert len(tickets) == 2
        assert isinstance(tickets[0], JiraTicket)
        assert tickets[0].key == "EOB-1"
        assert tickets[0].summary == "First issue"
        assert tickets[0].status == "Open"
        assert tickets[0].status_category == "new"
        assert tickets[0].reporter_name == "Alice"
        assert tickets[0].assignee_name is None
        assert tickets[0].priority == "High"

    def test_maps_assignee_name_when_present(self, service):
        """list_requests correctly maps assignee display name."""
        issues = [_make_issue("EOB-5", assignee="David")]

        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, {"issues": issues})
            tickets = service.list_requests()

        assert tickets[0].assignee_name == "David"

    def test_returns_empty_list_when_no_issues(self, service):
        """list_requests returns an empty list when Jira returns no issues."""
        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, {"issues": []})
            tickets = service.list_requests()

        assert tickets == []

    def test_passes_correct_jql_with_component(self, service):
        """list_requests sends JQL with the configured component name."""
        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, {"issues": []})
            service.list_requests()

            call_kwargs = mock_get.call_args.kwargs
            jql = call_kwargs["params"]["jql"]
            assert 'component = "eob"' in jql

    def test_priority_none_when_missing(self, service):
        """list_requests sets priority to None when field is absent."""
        issues = [_make_issue("EOB-9", priority=None)]

        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, {"issues": issues})
            tickets = service.list_requests()

        assert tickets[0].priority is None


# ---------------------------------------------------------------------------
# list_requests — error paths
# ---------------------------------------------------------------------------

class TestListRequestsErrors:
    def test_raises_credentials_missing(self, service_no_credentials):
        """list_requests raises JiraCredentialsMissingError when credentials absent."""
        with pytest.raises(JiraCredentialsMissingError):
            service_no_credentials.list_requests()

    def test_raises_auth_error_on_401(self, service):
        """list_requests raises JiraAuthError on HTTP 401."""
        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(401, {})
            with pytest.raises(JiraAuthError):
                service.list_requests()

    def test_raises_auth_error_on_403(self, service):
        """list_requests raises JiraAuthError on HTTP 403."""
        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(403, {})
            with pytest.raises(JiraAuthError):
                service.list_requests()

    def test_raises_timeout_error(self, service):
        """list_requests raises JiraTimeoutError when httpx times out."""
        with patch("httpx.get") as mock_get:
            mock_get.side_effect = httpx.TimeoutException("timed out")
            with pytest.raises(JiraTimeoutError):
                service.list_requests()

    def test_raises_upstream_error_on_500(self, service):
        """list_requests raises JiraUpstreamError on HTTP 500."""
        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(500, {})
            with pytest.raises(JiraUpstreamError) as exc_info:
                service.list_requests()
        assert exc_info.value.status_code == 500

    def test_raises_upstream_error_on_404(self, service):
        """list_requests raises JiraUpstreamError on HTTP 404."""
        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(404, {})
            with pytest.raises(JiraUpstreamError) as exc_info:
                service.list_requests()
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# get_request — happy path
# ---------------------------------------------------------------------------

def _make_issue_detail(
    key: str = "EOB-1",
    summary: str = "Test issue",
    status_name: str = "Open",
    status_category: str = "new",
    description: object = None,
    reporter_name: str = "Alice",
    reporter_avatar: str | None = None,
    assignee_name: str | None = None,
    assignee_avatar: str | None = None,
    priority: str | None = "Medium",
    created: str = "2026-01-15T09:00:00.000+0000",
    updated: str = "2026-01-16T10:00:00.000+0000",
) -> dict:
    """Build a minimal Jira single-issue dict as returned by /rest/api/3/issue/{key}."""
    reporter: dict = {"displayName": reporter_name}
    if reporter_avatar:
        reporter["avatarUrls"] = {"48x48": reporter_avatar}

    assignee: dict | None = None
    if assignee_name:
        assignee = {"displayName": assignee_name}
        if assignee_avatar:
            assignee["avatarUrls"] = {"48x48": assignee_avatar}

    fields: dict = {
        "summary": summary,
        "description": description,
        "status": {
            "name": status_name,
            "statusCategory": {"key": status_category},
        },
        "created": created,
        "updated": updated,
        "reporter": reporter,
        "assignee": assignee,
        "priority": {"name": priority} if priority else None,
    }
    return {"key": key, "fields": fields}


class TestGetRequestHappyPath:
    def test_returns_jira_ticket_detail(self, service):
        """get_request returns a JiraTicketDetail dataclass on success."""
        data = _make_issue_detail("EOB-10", "Bug report", "Open", "new", reporter_name="Eve")

        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, data)
            detail = service.get_request("EOB-10")

        assert isinstance(detail, JiraTicketDetail)
        assert detail.key == "EOB-10"
        assert detail.summary == "Bug report"
        assert detail.status == "Open"
        assert detail.status_category == "new"
        assert detail.reporter_name == "Eve"
        assert detail.assignee_name is None

    def test_maps_avatar_urls(self, service):
        """get_request extracts 48x48 avatar URL for reporter and assignee."""
        data = _make_issue_detail(
            "EOB-20",
            reporter_name="Alice",
            reporter_avatar="https://cdn.example.com/alice.png",
            assignee_name="Bob",
            assignee_avatar="https://cdn.example.com/bob.png",
        )

        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, data)
            detail = service.get_request("EOB-20")

        assert detail.reporter_avatar == "https://cdn.example.com/alice.png"
        assert detail.assignee_avatar == "https://cdn.example.com/bob.png"

    def test_null_assignee_yields_none_fields(self, service):
        """get_request sets assignee_name and assignee_avatar to None when no assignee."""
        data = _make_issue_detail("EOB-30", assignee_name=None)

        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, data)
            detail = service.get_request("EOB-30")

        assert detail.assignee_name is None
        assert detail.assignee_avatar is None

    def test_description_adf_passed_through(self, service):
        """get_request passes raw ADF description object unchanged."""
        adf = {"type": "doc", "version": 1, "content": []}
        data = _make_issue_detail("EOB-40", description=adf)

        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, data)
            detail = service.get_request("EOB-40")

        assert detail.description == adf


# ---------------------------------------------------------------------------
# get_request — error paths
# ---------------------------------------------------------------------------

class TestGetRequestErrors:
    def test_raises_auth_error_on_401(self, service):
        """get_request raises JiraAuthError on HTTP 401."""
        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(401, {})
            with pytest.raises(JiraAuthError):
                service.get_request("EOB-1")

    def test_raises_timeout_error(self, service):
        """get_request raises JiraTimeoutError when httpx times out."""
        with patch("httpx.get") as mock_get:
            mock_get.side_effect = httpx.TimeoutException("timed out")
            with pytest.raises(JiraTimeoutError):
                service.get_request("EOB-1")

    def test_raises_upstream_error_on_404(self, service):
        """get_request raises JiraUpstreamError on HTTP 404."""
        with patch("httpx.get") as mock_get:
            mock_get.return_value = _make_response(404, {})
            with pytest.raises(JiraUpstreamError) as exc_info:
                service.get_request("EOB-MISSING")
        assert exc_info.value.status_code == 404
