"""
AI WorkLog endpoints
Endpoints for AI-assisted worklog entry parsing
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.ai_worklog import (
    AIWorklogParseRequest,
    AIWorklogParseResponse,
    AIHealthResponse,
)
from app.services.ai_worklog_service import AIWorklogService

router = APIRouter()


@router.post("/ai-parse", response_model=AIWorklogParseResponse)
async def parse_worklog_with_ai(
    request: AIWorklogParseRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Parse natural language input into structured worklog entries using AI.

    Takes a free-form text description of work done and returns
    structured worklog entries with matched projects and work types.
    """
    service = AIWorklogService(db)

    try:
        result = await service.parse_worklog(request)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI 파싱 중 오류 발생: {str(e)}",
        )


@router.get("/ai-health")
async def check_ai_health(
    db: Session = Depends(get_db),
):
    """
    Check the health status of the AI service.

    Returns the connection status and configured model information.
    Healthy responses are cacheable for 5 minutes; unhealthy are not cached.
    """
    service = AIWorklogService(db)

    try:
        result = await service.check_health()
        data = AIHealthResponse(**result)
        response = JSONResponse(content=data.model_dump())
        if result.get("status") == "healthy":
            response.headers["Cache-Control"] = "public, max-age=300"
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response
    except Exception as e:
        data = AIHealthResponse(
            status="unhealthy",
            model="unknown",
            message=f"상태 확인 실패: {str(e)}",
        )
        response = JSONResponse(content=data.model_dump())
        response.headers["Cache-Control"] = "no-cache"
        return response
