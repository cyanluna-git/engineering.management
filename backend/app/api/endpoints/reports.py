"""
Reports and Analytics endpoints
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User
from app.services.report_service import ReportService
from app.services.report_generation_service import ReportGenerationService
from app.schemas.generated_report import (
    GeneratedReportCreate,
    GeneratedReportListItem,
    GeneratedReportResponse,
)

router = APIRouter()


@router.get("/capacity-summary")
async def get_capacity_summary(
    year: Optional[int] = Query(
        None, description="Year to get summary for (default: current year)"
    ),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get capacity summary report with monthly FTE totals,
    breakdown by position and by project.
    """
    service = ReportService(db)
    return service.get_capacity_summary(year)


@router.get("/worklog-summary")
async def get_worklog_summary(
    year: Optional[int] = Query(
        None, description="Year to get summary for (default: current year)"
    ),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get worklog summary report with monthly hours totals,
    breakdown by work type and by project.
    """
    service = ReportService(db)
    return service.get_worklog_summary(year)


@router.get("/worklog-summary/by-project")
async def get_worklog_summary_by_project(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get monthly worklog summary grouped by project.
    Returns hours and FTE (hours/160) for each project/month combination.
    Used for comparing actual vs planned resources.
    """
    service = ReportService(db)
    return service.get_worklog_summary_by_project()


@router.get("/worklog-summary/by-role")
async def get_worklog_summary_by_role(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get monthly worklog summary grouped by user's position (role).
    Returns hours and FTE for each position/month combination.
    Used for comparing actual vs planned resources by role.
    """
    service = ReportService(db)
    return service.get_worklog_summary_by_role()


@router.get("/capacity")
async def get_capacity_report(
    department_id: Optional[int] = Query(None),
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get team capacity report
    Calculates working days minus holidays and leave
    """
    # TODO: Implement capacity calculation with holidays
    return {"message": "Capacity report endpoint - to be implemented"}


@router.get("/department/{department_id}")
async def get_department_report(
    department_id: int,
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get department resource summary
    Planned vs Actual hours
    """
    # TODO: Implement department report
    return {"message": f"Department {department_id} report - to be implemented"}


@router.get("/project/{project_id}")
async def get_project_report(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get project resource breakdown by department
    """
    # TODO: Implement project report
    return {"message": f"Project {project_id} report - to be implemented"}


@router.get("/user/{user_id}")
async def get_user_report(
    user_id: str,
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get user worklog summary
    """
    # TODO: Implement user report
    return {"message": f"User {user_id} report - to be implemented"}


@router.get("/holidays")
async def get_holidays(
    year: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Get holidays for a year
    """
    # TODO: Implement holidays listing
    return {"message": f"Holidays for {year} - to be implemented"}


@router.get("/working-days")
async def get_working_days(
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Calculate working days for a month (excluding weekends and holidays)
    """
    # TODO: Implement working days calculation
    return {"message": f"Working days for {year}/{month} - to be implemented"}


# ============================================================
# Generated AI Reports
# ============================================================


@router.post(
    "/generate",
    response_model=GeneratedReportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_report(
    body: GeneratedReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN", "PM", "FM"])),
):
    """Generate a new AI-powered engineering intelligence report."""
    service = ReportGenerationService(db)
    report = await service.generate_report(
        report_type=body.report_type,
        user_id=current_user.id,
        period_start=body.period_start,
        period_end=body.period_end,
    )
    return report


@router.get("/generated", response_model=List[GeneratedReportListItem])
async def list_generated_reports(
    report_type: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List generated reports, newest first."""
    service = ReportGenerationService(db)
    return service.get_reports(report_type=report_type, limit=limit)


@router.get("/generated/{report_id}", response_model=GeneratedReportResponse)
async def get_generated_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get a single generated report with full sections and chart data."""
    service = ReportGenerationService(db)
    report = service.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.post("/auto-generate")
async def auto_generate_report(
    report_type: str = Query(..., description="weekly or monthly"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["ADMIN"])),
):
    """Auto-generate report for the latest period if not already exists. For cron use."""
    service = ReportGenerationService(db)
    report = await service.auto_generate(report_type, current_user.id)
    if report is None:
        return {"message": "Report already exists for this period", "generated": False}
    return {"message": "Report generated", "generated": True, "id": report.id}
