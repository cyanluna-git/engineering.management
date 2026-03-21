"""
Team Capacity endpoints — team FTE queries
"""

from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.team_capacity import TeamFTEResponse, TeamMemberAtDate
from app.services.team_capacity_service import TeamCapacityService

router = APIRouter()


@router.get("/", response_model=List[TeamFTEResponse])
async def get_team_capacity(
    department_id: str = Query(..., description="Department ID"),
    sub_team_id: Optional[str] = Query(None, description="Optional sub-team filter"),
    start_year: int = Query(..., description="Start year"),
    start_month: int = Query(..., ge=1, le=12, description="Start month"),
    end_year: int = Query(..., description="End year"),
    end_month: int = Query(..., ge=1, le=12, description="End month"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get team FTE capacity for a date range.
    Returns monthly breakdown of active members, absence impact, planned hires,
    and available FTE.
    """
    service = TeamCapacityService(db)
    return service.get_team_fte_range(
        department_id=department_id,
        start_year=start_year,
        start_month=start_month,
        end_year=end_year,
        end_month=end_month,
        sub_team_id=sub_team_id,
    )


@router.get("/members", response_model=List[TeamMemberAtDate])
async def get_team_members(
    department_id: str = Query(..., description="Department ID"),
    sub_team_id: Optional[str] = Query(None, description="Optional sub-team filter"),
    year: int = Query(..., description="Year"),
    month: int = Query(..., ge=1, le=12, description="Month"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get team members at a specific month with absence status.
    Uses the 15th of the month as the reference date.
    """
    service = TeamCapacityService(db)
    target_date = date(year, month, 15)
    return service.get_team_members_at(
        department_id=department_id,
        target_date=target_date,
        sub_team_id=sub_team_id,
    )
