"""Jira Service Desk proxy endpoint."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

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
    except JiraCredentialsMissingError:
        logger.error("Jira credentials not configured")
        raise HTTPException(
            status_code=503,
            detail={"code": "JIRA_CREDENTIALS_MISSING", "message": "Jira is not configured"},
        )
    except JiraAuthError:
        logger.error("Jira authentication failed")
        raise HTTPException(
            status_code=502,
            detail={"code": "JIRA_AUTH_ERROR", "message": "Could not authenticate with Jira"},
        )
    except JiraTimeoutError:
        logger.error("Jira request timed out")
        raise HTTPException(
            status_code=504,
            detail={"code": "JIRA_TIMEOUT", "message": "Jira request timed out"},
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
    except JiraUpstreamError as exc:
        logger.error("Jira upstream error: %s", exc)
        raise HTTPException(
            status_code=502,
            detail={"code": "JIRA_UPSTREAM_ERROR", "message": "Jira returned an unexpected error"},
        )

    return JSONResponse(status_code=201, content=result)
