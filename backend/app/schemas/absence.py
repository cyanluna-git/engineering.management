"""
Pydantic Schemas for Absence CRUD operations
"""

from datetime import date, datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, model_validator


ABSENCE_TYPES = Literal[
    "PARENTAL_LEAVE",
    "MEDICAL_LEAVE",
    "SECONDMENT",
    "SABBATICAL",
    "OTHER",
]


class AbsenceBase(BaseModel):
    """Base schema for absence attributes"""

    user_id: str
    absence_type: ABSENCE_TYPES
    start_date: date
    end_date: Optional[date] = None
    fte_impact: float = Field(
        default=-1.0,
        ge=-1.0,
        le=0.0,
        description="FTE impact: -1.0 (full absence) to 0.0 (no impact)",
    )
    department_id: str
    sub_team_id: Optional[str] = None
    remarks: Optional[str] = None

    @model_validator(mode="after")
    def validate_date_range(self) -> "AbsenceBase":
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class AbsenceCreate(AbsenceBase):
    """Schema for creating an absence"""

    pass


class AbsenceUpdate(BaseModel):
    """Schema for updating an absence - all fields optional"""

    user_id: Optional[str] = None
    absence_type: Optional[ABSENCE_TYPES] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    fte_impact: Optional[float] = Field(
        default=None,
        ge=-1.0,
        le=0.0,
    )
    department_id: Optional[str] = None
    sub_team_id: Optional[str] = None
    remarks: Optional[str] = None

    @model_validator(mode="after")
    def validate_date_range(self) -> "AbsenceUpdate":
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("end_date must be >= start_date")
        return self


class AbsenceResponse(AbsenceBase):
    """Schema for returning an absence from the API"""

    id: str
    created_by: str
    created_at: datetime
    updated_at: datetime

    # Nested relationship info
    user_name: Optional[str] = None
    department_name: Optional[str] = None
    sub_team_name: Optional[str] = None
    creator_name: Optional[str] = None

    class Config:
        from_attributes = True
