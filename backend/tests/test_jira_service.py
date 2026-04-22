"""Unit tests for JiraService."""
import pytest
from unittest.mock import MagicMock, patch

import httpx

from app.services.jira_service import (
    JiraAuthError,
    JiraCredentialsMissingError,
    JiraPartialFailureError,
    JiraService,
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


# ---------------------------------------------------------------------------
# Credential checks
# ---------------------------------------------------------------------------

class TestCredentialValidation:
    def test_raises_credentials_missing_when_email_empty(self, service_no_credentials):
        """create_request raises JiraCredentialsMissingError when email/token not set."""
        with pytest.raises(JiraCredentialsMissingError):
            service_no_credentials.create_request(
                summary="Test", reporter_email="user@test.com"
            )

    def test_raises_credentials_missing_when_token_only(self):
        """create_request raises when only one credential is present."""
        with patch("app.services.jira_service.settings") as mock_settings:
            mock_settings.JIRA_BASE_URL = "https://test.atlassian.net"
            mock_settings.JIRA_EMAIL = "bot@test.com"
            mock_settings.JIRA_TOKEN = ""
            mock_settings.JIRA_SERVICE_DESK_ID = "1"
            mock_settings.JIRA_REQUEST_TYPE_ID = "4"
            mock_settings.JIRA_DEFAULT_COMPONENT = "eob"
            mock_settings.JIRA_HTTP_TIMEOUT = 20.0
            svc = JiraService()

        with pytest.raises(JiraCredentialsMissingError):
            svc.create_request(summary="Test", reporter_email="user@test.com")


# ---------------------------------------------------------------------------
# Happy path: no attachment
# ---------------------------------------------------------------------------

class TestCreateRequestNoAttachment:
    def test_returns_issue_data_on_success(self, service):
        """create_request returns {issue_key, issue_id, web_url} on 201."""
        jira_response = {"issueKey": "EX-42", "issueId": "10042"}

        with patch("httpx.post") as mock_post:
            mock_post.return_value = _make_response(201, jira_response)

            result = service.create_request(
                summary="Something is broken",
                reporter_email="user@test.com",
            )

        assert result["issue_key"] == "EX-42"
        assert result["issue_id"] == "10042"
        assert result["web_url"] == "https://test.atlassian.net/browse/EX-42"

    def test_payload_contains_component_and_summary(self, service):
        """create_request sends correct payload including component name."""
        with patch("httpx.post") as mock_post:
            mock_post.return_value = _make_response(201, {"issueKey": "EX-1", "issueId": "1"})

            service.create_request(
                summary="My summary",
                reporter_email="user@test.com",
                description="My description",
            )

            call_kwargs = mock_post.call_args.kwargs
            payload = call_kwargs["json"]
            assert payload["requestFieldValues"]["summary"] == "My summary"
            assert payload["requestFieldValues"]["description"] == "My description"
            assert payload["requestFieldValues"]["components"] == [{"name": "eob"}]
            assert payload["raiseOnBehalfOf"] == "user@test.com"

    def test_accepts_200_status_code(self, service):
        """create_request treats both 200 and 201 as success."""
        with patch("httpx.post") as mock_post:
            mock_post.return_value = _make_response(200, {"issueKey": "EX-5", "issueId": "5"})

            result = service.create_request(
                summary="Test", reporter_email="user@test.com"
            )

        assert result["issue_key"] == "EX-5"

    def test_web_url_empty_when_no_issue_key(self, service):
        """web_url is empty string when issueKey is missing from response."""
        with patch("httpx.post") as mock_post:
            mock_post.return_value = _make_response(201, {"issueId": "99"})

            result = service.create_request(
                summary="Test", reporter_email="user@test.com"
            )

        assert result["web_url"] == ""
        assert result["issue_key"] == ""


# ---------------------------------------------------------------------------
# Happy path: with attachment
# ---------------------------------------------------------------------------

class TestCreateRequestWithAttachment:
    def test_uploads_attachment_then_creates_request(self, service):
        """Two httpx.post calls: attachment upload first, then request creation."""
        attach_response = _make_response(
            201,
            {"temporaryAttachments": [{"temporaryAttachmentId": "tmp-abc"}]},
        )
        request_response = _make_response(
            201, {"issueKey": "EX-10", "issueId": "10"}
        )

        with patch("httpx.post") as mock_post:
            mock_post.side_effect = [attach_response, request_response]

            result = service.create_request(
                summary="Bug report",
                reporter_email="user@test.com",
                attachment_filename="screenshot.png",
                attachment_content=b"fake-image-bytes",
                attachment_content_type="image/png",
            )

        assert mock_post.call_count == 2
        assert result["issue_key"] == "EX-10"

    def test_attachment_id_included_in_request_payload(self, service):
        """temporaryAttachmentIds from upload are included in create request payload."""
        attach_response = _make_response(
            201,
            {"temporaryAttachments": [{"temporaryAttachmentId": "tmp-xyz"}]},
        )
        request_response = _make_response(
            201, {"issueKey": "EX-11", "issueId": "11"}
        )

        with patch("httpx.post") as mock_post:
            mock_post.side_effect = [attach_response, request_response]

            service.create_request(
                summary="With attachment",
                reporter_email="user@test.com",
                attachment_filename="file.txt",
                attachment_content=b"hello",
                attachment_content_type="text/plain",
            )

            # Second call is the request creation
            request_call_kwargs = mock_post.call_args_list[1].kwargs
            payload = request_call_kwargs["json"]
            assert payload["requestFieldValues"]["attachments"] == {
                "temporaryAttachmentIds": ["tmp-xyz"]
            }


# ---------------------------------------------------------------------------
# Error paths: authentication
# ---------------------------------------------------------------------------

class TestAuthErrors:
    def test_raises_auth_error_on_401(self, service):
        """create_request raises JiraAuthError on HTTP 401."""
        with patch("httpx.post") as mock_post:
            mock_post.return_value = _make_response(401, {})

            with pytest.raises(JiraAuthError):
                service.create_request(
                    summary="Test", reporter_email="user@test.com"
                )

    def test_raises_auth_error_on_403(self, service):
        """create_request raises JiraAuthError on HTTP 403."""
        with patch("httpx.post") as mock_post:
            mock_post.return_value = _make_response(403, {})

            with pytest.raises(JiraAuthError):
                service.create_request(
                    summary="Test", reporter_email="user@test.com"
                )

    def test_raises_auth_error_on_401_during_upload(self, service):
        """Attachment upload step raises JiraAuthError on 401."""
        with patch("httpx.post") as mock_post:
            mock_post.return_value = _make_response(401, {})

            with pytest.raises(JiraAuthError):
                service.create_request(
                    summary="Test",
                    reporter_email="user@test.com",
                    attachment_filename="file.txt",
                    attachment_content=b"data",
                )


# ---------------------------------------------------------------------------
# Error paths: timeout
# ---------------------------------------------------------------------------

class TestTimeoutErrors:
    def test_raises_timeout_error_on_request_timeout(self, service):
        """create_request raises JiraTimeoutError when httpx times out."""
        with patch("httpx.post") as mock_post:
            mock_post.side_effect = httpx.TimeoutException("timed out")

            with pytest.raises(JiraTimeoutError):
                service.create_request(
                    summary="Test", reporter_email="user@test.com"
                )

    def test_raises_timeout_error_on_attachment_upload_timeout(self, service):
        """Attachment upload step raises JiraTimeoutError on timeout."""
        with patch("httpx.post") as mock_post:
            mock_post.side_effect = httpx.TimeoutException("timed out")

            with pytest.raises(JiraTimeoutError):
                service.create_request(
                    summary="Test",
                    reporter_email="user@test.com",
                    attachment_filename="file.txt",
                    attachment_content=b"data",
                )


# ---------------------------------------------------------------------------
# Error paths: partial failure
# ---------------------------------------------------------------------------

class TestPartialFailure:
    def test_raises_partial_failure_when_upload_ok_but_request_fails(self, service):
        """JiraPartialFailureError raised when attachment ok but request creation times out."""
        attach_response = _make_response(
            201,
            {"temporaryAttachments": [{"temporaryAttachmentId": "tmp-1"}]},
        )

        with patch("httpx.post") as mock_post:
            mock_post.side_effect = [
                attach_response,
                httpx.TimeoutException("timed out"),
            ]

            with pytest.raises(JiraPartialFailureError) as exc_info:
                service.create_request(
                    summary="Test",
                    reporter_email="user@test.com",
                    attachment_filename="file.txt",
                    attachment_content=b"data",
                )

        assert "tmp-1" in exc_info.value.temp_attachment_ids

    def test_raises_partial_failure_when_upload_ok_but_request_returns_error(self, service):
        """JiraPartialFailureError raised when attachment uploaded but request returns 500."""
        attach_response = _make_response(
            201,
            {"temporaryAttachments": [{"temporaryAttachmentId": "tmp-2"}]},
        )
        request_response = _make_response(500, {})

        with patch("httpx.post") as mock_post:
            mock_post.side_effect = [attach_response, request_response]

            with pytest.raises(JiraPartialFailureError) as exc_info:
                service.create_request(
                    summary="Test",
                    reporter_email="user@test.com",
                    attachment_filename="file.txt",
                    attachment_content=b"data",
                )

        assert "tmp-2" in exc_info.value.temp_attachment_ids


# ---------------------------------------------------------------------------
# Error paths: upstream errors
# ---------------------------------------------------------------------------

class TestUpstreamErrors:
    def test_raises_upstream_error_on_500(self, service):
        """create_request raises JiraUpstreamError on unexpected HTTP status."""
        with patch("httpx.post") as mock_post:
            mock_post.return_value = _make_response(500, {})

            with pytest.raises(JiraUpstreamError) as exc_info:
                service.create_request(
                    summary="Test", reporter_email="user@test.com"
                )

        assert exc_info.value.status_code == 500

    def test_raises_upstream_error_on_attachment_upload_failure(self, service):
        """Attachment upload raises JiraUpstreamError on non-201 response."""
        with patch("httpx.post") as mock_post:
            mock_post.return_value = _make_response(400, {})

            with pytest.raises(JiraUpstreamError):
                service.create_request(
                    summary="Test",
                    reporter_email="user@test.com",
                    attachment_filename="file.txt",
                    attachment_content=b"data",
                )
