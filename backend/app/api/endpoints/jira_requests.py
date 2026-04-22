"""Jira Service Desk proxy endpoint."""
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.security import get_current_user, require_write_permission
from app.services.jira_service import (
    JiraAuthError,
    JiraCredentialsMissingError,
    JiraPartialFailureError,
    JiraService,
    JiraTimeoutError,
    JiraUpstreamError,
)

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


class JiraTicketResponse(BaseModel):
    key: str
    summary: str
    status: str
    status_category: str
    created: str
    reporter_name: str
    assignee_name: str | None
    priority: str | None


class JiraTicketDetailResponse(BaseModel):
    key: str
    summary: str
    status: str
    status_category: str
    description: Any  # ADF JSON
    created: str
    updated: str
    reporter_name: str
    reporter_avatar: str | None
    assignee_name: str | None
    assignee_avatar: str | None
    priority: str | None


def _raise_jira_http_exception(exc: Exception) -> None:
    if isinstance(exc, JiraCredentialsMissingError):
        raise HTTPException(503, {"code": "JIRA_CREDENTIALS_MISSING", "message": "Jira is not configured"})
    if isinstance(exc, JiraAuthError):
        raise HTTPException(502, {"code": "JIRA_AUTH_ERROR", "message": "Could not authenticate with Jira"})
    if isinstance(exc, JiraTimeoutError):
        raise HTTPException(504, {"code": "JIRA_TIMEOUT", "message": "Jira request timed out"})
    raise HTTPException(502, {"code": "JIRA_UPSTREAM_ERROR", "message": "Jira returned an unexpected error"})


@router.get("/requests", response_model=list[JiraTicketResponse])
async def list_jira_requests(
    current_user=Depends(get_current_user),
) -> list[JiraTicketResponse]:
    service = JiraService()
    try:
        tickets = service.list_requests()
    except (JiraCredentialsMissingError, JiraAuthError, JiraTimeoutError, JiraUpstreamError) as exc:
        _raise_jira_http_exception(exc)
    return [
        JiraTicketResponse(
            key=t.key,
            summary=t.summary,
            status=t.status,
            status_category=t.status_category,
            created=t.created,
            reporter_name=t.reporter_name,
            assignee_name=t.assignee_name,
            priority=t.priority,
        )
        for t in tickets  # type: ignore[union-attr]
    ]


@router.get("/requests/{issue_key}", response_model=JiraTicketDetailResponse)
async def get_jira_request_detail(
    issue_key: str,
    current_user=Depends(get_current_user),
) -> JiraTicketDetailResponse:
    service = JiraService()
    try:
        detail = service.get_request(issue_key)
    except (JiraCredentialsMissingError, JiraAuthError, JiraTimeoutError, JiraUpstreamError) as exc:
        _raise_jira_http_exception(exc)
    return JiraTicketDetailResponse(
        key=detail.key,  # type: ignore[union-attr]
        summary=detail.summary,
        status=detail.status,
        status_category=detail.status_category,
        description=detail.description,
        created=detail.created,
        updated=detail.updated,
        reporter_name=detail.reporter_name,
        reporter_avatar=detail.reporter_avatar,
        assignee_name=detail.assignee_name,
        assignee_avatar=detail.assignee_avatar,
        priority=detail.priority,
    )


@router.post("/requests", status_code=201)
async def create_jira_request(
    summary: str = Form(..., max_length=255),
    description: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user=Depends(get_current_user),
    _=Depends(require_write_permission()),
) -> JSONResponse:
    content: Optional[bytes] = None
    if file is not None:
        content = await file.read()
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "FILE_TOO_LARGE", "message": "File must be under 10 MB"},
            )

    service = JiraService()
    try:
        result = service.create_request(
            summary=summary,
            reporter_email=current_user.email,
            description=description or None,
            attachment_filename=file.filename if file and content else None,
            attachment_content=content,
            attachment_content_type=file.content_type if file and content else None,
        )
    except JiraPartialFailureError as exc:
        logger.error(
            "Jira partial failure: attachment uploaded but request failed. ids=%s",
            exc.temp_attachment_ids,
        )
        raise HTTPException(
            status_code=502,
            detail={
                "code": "JIRA_PARTIAL_FAILURE",
                "message": "Attachment uploaded but request creation failed",
            },
        )
    except (JiraCredentialsMissingError, JiraAuthError, JiraTimeoutError, JiraUpstreamError) as exc:
        logger.error("Jira error during create_request: %s", exc)
        _raise_jira_http_exception(exc)

    return JSONResponse(status_code=201, content=result)
