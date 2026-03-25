"""
Generated Report Schemas
"""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class GeneratedReportCreate(BaseModel):
    report_type: str  # "weekly" | "monthly"
    period_start: Optional[date] = None
    period_end: Optional[date] = None


class GeneratedReportListItem(BaseModel):
    id: str
    report_type: str
    period_start: date
    period_end: date
    title: str
    status: str
    ai_model: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GeneratedReportResponse(GeneratedReportListItem):
    sections: Optional[dict] = None
    charts_data: Optional[dict] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True
