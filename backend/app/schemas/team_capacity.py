"""
Team Capacity schemas for FTE calculation and team member tracking
"""

from datetime import date
from pydantic import BaseModel
from typing import Optional


class TeamFTEResponse(BaseModel):
    """Monthly FTE snapshot for a department/sub-team"""
    year: int
    month: int
    active_members: float
    absence_impact: float
    planned_hires: float
    available_fte: float


class TeamFTERangeResponse(BaseModel):
    """FTE data across a date range"""
    department_id: str
    sub_team_id: Optional[str] = None
    months: list[TeamFTEResponse]


class TeamMemberAbsence(BaseModel):
    """Absence info attached to a team member"""
    absence_type: str
    start_date: date
    end_date: Optional[date] = None
    fte_impact: float


class TeamMemberAtDate(BaseModel):
    """A team member's status at a specific date"""
    user_id: str
    name: str
    korean_name: Optional[str] = None
    email: str
    sub_team_id: Optional[str] = None
    sub_team_name: Optional[str] = None
    position_id: Optional[str] = None
    position_name: Optional[str] = None
    is_absent: bool = False
    absences: list[TeamMemberAbsence] = []

    class Config:
        from_attributes = True
