"""Jira Service Desk API integration."""
import base64
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class JiraCredentialsMissingError(Exception):
    pass


class JiraAuthError(Exception):
    pass


class JiraTimeoutError(Exception):
    pass


class JiraUpstreamError(Exception):
    def __init__(self, message: str, status_code: int = 0) -> None:
        super().__init__(message)
        self.status_code = status_code


class JiraPartialFailureError(Exception):
    def __init__(self, message: str, temp_attachment_ids: list[str]) -> None:
        super().__init__(message)
        self.temp_attachment_ids = temp_attachment_ids


class JiraService:
    def __init__(self) -> None:
        self._base_url = settings.JIRA_BASE_URL.rstrip("/")
        self._email = settings.JIRA_EMAIL
        self._token = settings.JIRA_TOKEN
        self._service_desk_id = settings.JIRA_SERVICE_DESK_ID
        self._request_type_id = settings.JIRA_REQUEST_TYPE_ID
        self._component = settings.JIRA_DEFAULT_COMPONENT
        self._timeout = settings.JIRA_HTTP_TIMEOUT

    def _check_credentials(self) -> None:
        if not self._email or not self._token:
            raise JiraCredentialsMissingError("JIRA_EMAIL and JIRA_TOKEN must be set")

    def _auth_header(self) -> str:
        credentials = base64.b64encode(
            f"{self._email}:{self._token}".encode()
        ).decode()
        return f"Basic {credentials}"

    def _upload_temp_attachment(
        self, filename: str, content: bytes, content_type: str
    ) -> list[str]:
        """Upload file and return temporaryAttachmentIds."""
        url = (
            f"{self._base_url}/rest/servicedeskapi/servicedesk"
            f"/{self._service_desk_id}/attachTemporaryFile"
        )
        try:
            resp = httpx.post(
                url,
                headers={
                    "Authorization": self._auth_header(),
                    # Required to bypass Atlassian XSRF check for file uploads
                    "X-Atlassian-Token": "no-check",
                },
                files={"file": (filename, content, content_type)},
                timeout=self._timeout,
            )
        except httpx.TimeoutException as exc:
            raise JiraTimeoutError("Jira attachment upload timed out") from exc

        if resp.status_code in (401, 403):
            raise JiraAuthError("Jira authentication failed")
        if resp.status_code != 201:
            raise JiraUpstreamError(
                f"Jira attachment upload failed: {resp.status_code}",
                resp.status_code,
            )
        return [
            att["temporaryAttachmentId"]
            for att in resp.json().get("temporaryAttachments", [])
        ]

    def create_request(
        self,
        summary: str,
        reporter_email: str,
        description: Optional[str] = None,
        attachment_filename: Optional[str] = None,
        attachment_content: Optional[bytes] = None,
        attachment_content_type: Optional[str] = None,
    ) -> dict:
        """Create a Jira Service Desk request. Returns {issue_key, issue_id, web_url}."""
        self._check_credentials()

        temp_attachment_ids: list[str] = []
        if attachment_filename and attachment_content:
            temp_attachment_ids = self._upload_temp_attachment(
                attachment_filename,
                attachment_content,
                attachment_content_type or "application/octet-stream",
            )

        payload: dict = {
            "serviceDeskId": self._service_desk_id,
            "requestTypeId": self._request_type_id,
            "raiseOnBehalfOf": reporter_email,
            "requestFieldValues": {
                "summary": summary,
                "components": [{"name": self._component}],
            },
        }
        if description:
            payload["requestFieldValues"]["description"] = description
        if temp_attachment_ids:
            payload["requestFieldValues"]["attachments"] = {
                "temporaryAttachmentIds": temp_attachment_ids
            }

        url = f"{self._base_url}/rest/servicedeskapi/request"
        try:
            resp = httpx.post(
                url,
                headers={
                    "Authorization": self._auth_header(),
                    "Content-Type": "application/json",
                    "X-Atlassian-Token": "no-check",
                },
                json=payload,
                timeout=self._timeout,
            )
        except httpx.TimeoutException as exc:
            if temp_attachment_ids:
                raise JiraPartialFailureError(
                    "Attachment uploaded but request creation timed out",
                    temp_attachment_ids,
                ) from exc
            raise JiraTimeoutError("Jira request creation timed out") from exc

        if resp.status_code in (401, 403):
            raise JiraAuthError("Jira authentication failed")
        if resp.status_code not in (200, 201):
            if temp_attachment_ids:
                raise JiraPartialFailureError(
                    f"Attachment uploaded but request creation failed: {resp.status_code}",
                    temp_attachment_ids,
                )
            raise JiraUpstreamError(
                f"Jira request creation failed: {resp.status_code}",
                resp.status_code,
            )

        data = resp.json()
        issue_key = data.get("issueKey", "")
        issue_id = data.get("issueId", "")
        web_url = f"{self._base_url}/browse/{issue_key}" if issue_key else ""
        return {"issue_key": issue_key, "issue_id": issue_id, "web_url": web_url}
