"""
Report Generation Service
Collects data, generates AI insights via LLM, and saves periodic reports.
"""

import logging
from datetime import date, datetime, timedelta
from calendar import monthrange
from typing import Optional
from uuid import uuid4
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, and_

from app.models.resource import ResourcePlan, WorkLog
from app.models.project import Project, ProjectMilestone
from app.models.user import User
from app.models.organization import JobPosition, ProjectRole
from app.models.weekly_report import WeeklyReport
from app.models.generated_report import GeneratedReport
from app.services.llm import get_llm_client
from app.core.config import settings

logger = logging.getLogger(__name__)

SECTION_PROMPTS = {
    "executive_summary": """You are an engineering operations analyst writing an executive brief.

Given the following engineering data for the period, produce a concise executive summary.

## Input Data
{data}

## Response (JSON only)
{{
  "headline": "One sentence capturing the most important insight",
  "health_status": "green|yellow|red",
  "insights": ["3-5 key observations, each 1-2 sentences"],
  "risk_level_reason": "Why you chose this health status"
}}

Rules:
- Respond in Korean
- Be specific: cite project names, FTE numbers, percentages
- green = on track, yellow = attention needed, red = critical issues
- Do NOT invent data not present in the input""",

    "resource_utilization": """You are an engineering resource analyst.

Analyze the following Plan vs Actual resource data and identify utilization patterns.

## Input Data
{data}

## Response (JSON only)
{{
  "headline": "One sentence summary of utilization status",
  "insights": ["3-5 observations about resource utilization patterns"],
  "risk_level": "green|yellow|red",
  "overloaded": ["List of overloaded members/roles if any"],
  "underutilized": ["List of underutilized members/roles if any"],
  "recommendations": ["1-3 actionable recommendations"]
}}

Rules:
- Respond in Korean
- FTE > 1.0 per person = overloaded, FTE < 0.3 = underutilized
- Be specific with numbers""",

    "project_health": """You are an engineering project health analyst.

Assess the health of active projects based on milestone progress and resource allocation.

## Input Data
{data}

## Response (JSON only)
{{
  "headline": "One sentence summary of overall project health",
  "insights": ["3-5 observations about project status"],
  "risk_level": "green|yellow|red",
  "delayed_gates": ["List of delayed milestones with project name"],
  "recommendations": ["1-3 actionable recommendations"]
}}

Rules:
- Respond in Korean
- Flag milestones past target_date with status != Completed
- Consider resource allocation adequacy""",

    "capacity_forecast": """You are an engineering capacity planning analyst.

Forecast capacity needs for the next 3 months based on current allocation and project pipeline.

## Input Data
{data}

## Response (JSON only)
{{
  "headline": "One sentence capacity outlook",
  "insights": ["3-5 observations about capacity trends"],
  "risk_level": "green|yellow|red",
  "gaps": ["Specific role/skill gaps identified"],
  "recommendations": ["1-3 actionable recommendations"]
}}

Rules:
- Respond in Korean
- Compare planned FTE demand vs available headcount
- Identify roles with supply < demand""",

    "weekly_digest": """You are an engineering team activity analyst.

Summarize the weekly activity based on report submissions and worklog patterns.

## Input Data
{data}

## Response (JSON only)
{{
  "headline": "One sentence weekly activity summary",
  "insights": ["3-5 observations about team activity"],
  "submission_rate_comment": "Comment on report submission rate",
  "key_issues": ["Notable issues or blockers mentioned"]
}}

Rules:
- Respond in Korean
- Note submission gaps if any
- Highlight unusual patterns""",
}


class ReportGenerationService:
    def __init__(self, db: Session):
        self.db = db

    def _get_period(
        self, report_type: str, period_start: Optional[date] = None, period_end: Optional[date] = None
    ) -> tuple[date, date]:
        """Calculate report period if not provided."""
        today = date.today()
        if period_start and period_end:
            return period_start, period_end

        if report_type == "weekly":
            # Last completed week (Mon-Sun)
            last_sunday = today - timedelta(days=today.weekday() + 1)
            last_monday = last_sunday - timedelta(days=6)
            return last_monday, last_sunday
        else:  # monthly
            # Last completed month
            first_of_month = today.replace(day=1)
            last_month_end = first_of_month - timedelta(days=1)
            last_month_start = last_month_end.replace(day=1)
            return last_month_start, last_month_end

    def _collect_resource_summary(self, period_start: date, period_end: date) -> dict:
        """Plan FTE by month/role/project."""
        start_year, start_month = period_start.year, period_start.month
        end_year, end_month = period_end.year, period_end.month

        plans = (
            self.db.query(
                ResourcePlan.year,
                ResourcePlan.month,
                func.sum(ResourcePlan.planned_hours).label("total_fte"),
                func.count(ResourcePlan.id).label("count"),
            )
            .filter(
                and_(
                    ResourcePlan.year * 100 + ResourcePlan.month >= start_year * 100 + start_month,
                    ResourcePlan.year * 100 + ResourcePlan.month <= end_year * 100 + end_month,
                )
            )
            .group_by(ResourcePlan.year, ResourcePlan.month)
            .order_by(ResourcePlan.year, ResourcePlan.month)
            .all()
        )

        by_project = (
            self.db.query(
                Project.name,
                func.sum(ResourcePlan.planned_hours).label("total_fte"),
            )
            .join(Project, ResourcePlan.project_id == Project.id)
            .filter(
                and_(
                    ResourcePlan.year * 100 + ResourcePlan.month >= start_year * 100 + start_month,
                    ResourcePlan.year * 100 + ResourcePlan.month <= end_year * 100 + end_month,
                )
            )
            .group_by(Project.name)
            .order_by(func.sum(ResourcePlan.planned_hours).desc())
            .limit(15)
            .all()
        )

        by_role = (
            self.db.query(
                ProjectRole.name,
                func.sum(ResourcePlan.planned_hours).label("total_fte"),
            )
            .join(ProjectRole, ResourcePlan.project_role_id == ProjectRole.id)
            .filter(
                and_(
                    ResourcePlan.year * 100 + ResourcePlan.month >= start_year * 100 + start_month,
                    ResourcePlan.year * 100 + ResourcePlan.month <= end_year * 100 + end_month,
                )
            )
            .group_by(ProjectRole.name)
            .order_by(func.sum(ResourcePlan.planned_hours).desc())
            .all()
        )

        return {
            "monthly": [{"year": r.year, "month": r.month, "planned_fte": round(r.total_fte, 1)} for r in plans],
            "by_project": [{"name": r.name, "planned_fte": round(r.total_fte, 1)} for r in by_project],
            "by_role": [{"name": r.name, "planned_fte": round(r.total_fte, 1)} for r in by_role],
        }

    def _collect_worklog_summary(self, period_start: date, period_end: date) -> dict:
        """Actual hours/FTE by month/project."""
        monthly = (
            self.db.query(
                extract("year", WorkLog.date).label("year"),
                extract("month", WorkLog.date).label("month"),
                func.sum(WorkLog.hours).label("total_hours"),
            )
            .filter(WorkLog.date.between(period_start, period_end))
            .group_by("year", "month")
            .order_by("year", "month")
            .all()
        )

        by_project = (
            self.db.query(
                Project.name,
                func.sum(WorkLog.hours).label("total_hours"),
            )
            .join(Project, WorkLog.project_id == Project.id)
            .filter(WorkLog.date.between(period_start, period_end))
            .group_by(Project.name)
            .order_by(func.sum(WorkLog.hours).desc())
            .limit(15)
            .all()
        )

        return {
            "monthly": [
                {"year": int(r.year), "month": int(r.month), "actual_hours": round(r.total_hours, 1), "actual_fte": round(r.total_hours / 160, 1)}
                for r in monthly
            ],
            "by_project": [
                {"name": r.name, "actual_hours": round(r.total_hours, 1), "actual_fte": round(r.total_hours / 160, 1)}
                for r in by_project
            ],
        }

    def _collect_project_health(self) -> dict:
        """Active project statuses + milestone progress."""
        active_projects = (
            self.db.query(Project)
            .filter(Project.status.in_(["Active", "Planning", "Opportunity", "Lead", "Launched"]))
            .order_by(Project.name)
            .all()
        )

        projects_data = []
        today = date.today()
        for p in active_projects:
            milestones = (
                self.db.query(ProjectMilestone)
                .filter(ProjectMilestone.project_id == p.id)
                .order_by(ProjectMilestone.target_date)
                .all()
            )
            total_ms = len(milestones)
            completed_ms = sum(1 for m in milestones if m.status == "Completed")
            delayed_ms = [
                {"name": m.name, "target": m.target_date.strftime("%Y-%m") if m.target_date else "N/A"}
                for m in milestones
                if m.status != "Completed" and m.target_date and m.target_date.date() < today
            ] if milestones else []

            projects_data.append({
                "name": p.name,
                "status": p.status,
                "milestones_total": total_ms,
                "milestones_completed": completed_ms,
                "delayed_milestones": delayed_ms,
                "start_month": p.start_month,
                "end_month": p.end_month,
            })

        return {"projects": projects_data}

    def _collect_capacity_info(self, period_start: date, period_end: date) -> dict:
        """Active users, overloaded/underutilized."""
        active_users = self.db.query(User).filter(User.is_active == True, User.role != "GUEST").count()

        # Per-user FTE for the period
        user_fte = (
            self.db.query(
                User.name,
                func.sum(ResourcePlan.planned_hours).label("total_fte"),
            )
            .join(ResourcePlan, ResourcePlan.user_id == User.id)
            .filter(
                ResourcePlan.year == period_end.year,
                ResourcePlan.month == period_end.month,
            )
            .group_by(User.name)
            .all()
        )

        overloaded = [{"name": r.name, "fte": round(r.total_fte, 2)} for r in user_fte if r.total_fte > 1.0]
        underutilized = [{"name": r.name, "fte": round(r.total_fte, 2)} for r in user_fte if 0 < r.total_fte < 0.3]

        return {
            "active_users": active_users,
            "overloaded": overloaded,
            "underutilized": underutilized,
            "allocated_users": len(user_fte),
        }

    def _collect_weekly_digest(self, period_start: date, period_end: date) -> dict:
        """Weekly report submission rate + summary."""
        reports = (
            self.db.query(WeeklyReport)
            .filter(
                WeeklyReport.week_start >= period_start,
                WeeklyReport.week_end <= period_end,
                WeeklyReport.scope == "user",
            )
            .all()
        )

        active_users = self.db.query(User).filter(User.is_active == True, User.role.notin_(["GUEST", "VIEWER"])).count()
        submitted = len(reports)

        return {
            "total_users": active_users,
            "submitted": submitted,
            "submission_rate": round(submitted / max(active_users, 1) * 100, 1),
        }

    def collect_report_data(self, report_type: str, period_start: date, period_end: date) -> dict:
        """Collect all data for report generation."""
        resource = self._collect_resource_summary(period_start, period_end)
        worklog = self._collect_worklog_summary(period_start, period_end)
        project_health = self._collect_project_health()
        capacity = self._collect_capacity_info(period_start, period_end)

        data = {
            "period": {"start": period_start.isoformat(), "end": period_end.isoformat(), "type": report_type},
            "resource_summary": resource,
            "worklog_summary": worklog,
            "project_health": project_health,
            "capacity_info": capacity,
        }

        if report_type == "weekly":
            data["weekly_digest"] = self._collect_weekly_digest(period_start, period_end)

        return data

    def _format_section_data(self, section: str, data: dict) -> str:
        """Format collected data into a concise text for LLM prompt."""
        period = data["period"]
        lines = [f"Period: {period['start']} ~ {period['end']} ({period['type']})"]

        if section == "executive_summary":
            r = data["resource_summary"]
            w = data["worklog_summary"]
            ph = data["project_health"]
            cap = data["capacity_info"]
            lines.append(f"\nActive Users: {cap['active_users']}, Allocated: {cap['allocated_users']}")
            lines.append(f"Overloaded (>1.0 FTE): {len(cap['overloaded'])}, Underutilized (<0.3): {len(cap['underutilized'])}")
            lines.append(f"\nPlanned FTE by month: {r['monthly']}")
            lines.append(f"Actual FTE by month: {w['monthly']}")
            lines.append(f"\nTop projects by planned FTE: {r['by_project'][:5]}")
            lines.append(f"Top projects by actual hours: {w['by_project'][:5]}")
            active_count = len(ph["projects"])
            delayed_count = sum(len(p["delayed_milestones"]) for p in ph["projects"])
            lines.append(f"\nActive projects: {active_count}, Delayed milestones: {delayed_count}")

        elif section == "resource_utilization":
            r = data["resource_summary"]
            w = data["worklog_summary"]
            cap = data["capacity_info"]
            lines.append(f"\nPlanned FTE by month: {r['monthly']}")
            lines.append(f"Actual FTE by month: {w['monthly']}")
            lines.append(f"By role: {r['by_role']}")
            lines.append(f"\nOverloaded members: {cap['overloaded']}")
            lines.append(f"Underutilized members: {cap['underutilized']}")

        elif section == "project_health":
            ph = data["project_health"]
            for p in ph["projects"]:
                if p["milestones_total"] > 0 or p["status"] in ("Active", "Planning"):
                    lines.append(
                        f"\n{p['name']} [{p['status']}]: {p['milestones_completed']}/{p['milestones_total']} gates done"
                        f", delayed: {p['delayed_milestones']}, period: {p['start_month']}~{p['end_month']}"
                    )

        elif section == "capacity_forecast":
            r = data["resource_summary"]
            cap = data["capacity_info"]
            lines.append(f"\nActive users: {cap['active_users']}, Currently allocated: {cap['allocated_users']}")
            lines.append(f"Planned FTE by month (next 3m included): {r['monthly']}")
            lines.append(f"By project demand: {r['by_project'][:10]}")
            lines.append(f"By role demand: {r['by_role']}")
            lines.append(f"Overloaded: {cap['overloaded']}")

        elif section == "weekly_digest":
            wd = data.get("weekly_digest", {})
            lines.append(f"\nSubmission: {wd.get('submitted', 0)}/{wd.get('total_users', 0)} ({wd.get('submission_rate', 0)}%)")

        return "\n".join(lines)

    async def generate_report(
        self, report_type: str, user_id: str,
        period_start: Optional[date] = None, period_end: Optional[date] = None,
    ) -> GeneratedReport:
        """Full report generation pipeline."""
        p_start, p_end = self._get_period(report_type, period_start, period_end)

        # Check for existing report
        existing = (
            self.db.query(GeneratedReport)
            .filter(
                GeneratedReport.report_type == report_type,
                GeneratedReport.period_start == p_start,
                GeneratedReport.period_end == p_end,
                GeneratedReport.status == "published",
            )
            .first()
        )
        if existing:
            return existing

        # Create report record
        if report_type == "monthly":
            title = f"{p_start.year}년 {p_start.month}월 월간 보고서"
        else:
            title = f"{p_start.strftime('%m/%d')}~{p_end.strftime('%m/%d')} 주간 보고서"

        report = GeneratedReport(
            id=str(uuid4()),
            report_type=report_type,
            period_start=p_start,
            period_end=p_end,
            title=title,
            status="generating",
            ai_model=settings.PCAS_LLM_MODEL if settings.AI_PROVIDER == "pcas" else settings.AI_PROVIDER,
            generated_by=user_id,
        )
        self.db.add(report)
        self.db.commit()

        try:
            # Collect data
            data = self.collect_report_data(report_type, p_start, p_end)

            # Generate AI sections
            client = get_llm_client()
            sections = {}
            section_names = ["executive_summary", "resource_utilization", "project_health", "capacity_forecast"]
            if report_type == "weekly":
                section_names.append("weekly_digest")

            for section_name in section_names:
                prompt_template = SECTION_PROMPTS[section_name]
                section_data = self._format_section_data(section_name, data)
                prompt = prompt_template.format(data=section_data)

                try:
                    result = await client.generate_json(prompt)
                    sections[section_name] = result
                except Exception as e:
                    logger.warning(f"AI generation failed for {section_name}: {e}")
                    sections[section_name] = {
                        "headline": f"{section_name} 생성 실패",
                        "insights": [str(e)],
                        "risk_level": "yellow",
                    }

            # Build charts data from collected data
            charts_data = {
                "resource_monthly": data["resource_summary"]["monthly"],
                "worklog_monthly": data["worklog_summary"]["monthly"],
                "resource_by_project": data["resource_summary"]["by_project"],
                "worklog_by_project": data["worklog_summary"]["by_project"],
                "resource_by_role": data["resource_summary"]["by_role"],
                "capacity": data["capacity_info"],
                "projects": data["project_health"]["projects"],
            }

            report.sections = sections
            report.charts_data = charts_data
            report.status = "published"
            self.db.commit()
            self.db.refresh(report)

        except Exception as e:
            logger.error(f"Report generation failed: {e}")
            report.status = "failed"
            report.error_message = str(e)
            self.db.commit()
            self.db.refresh(report)

        return report

    def get_reports(self, report_type: Optional[str] = None, limit: int = 20) -> list[GeneratedReport]:
        """List generated reports."""
        query = self.db.query(GeneratedReport).order_by(GeneratedReport.created_at.desc())
        if report_type:
            query = query.filter(GeneratedReport.report_type == report_type)
        return query.limit(limit).all()

    def get_report(self, report_id: str) -> Optional[GeneratedReport]:
        """Get single report."""
        return self.db.query(GeneratedReport).filter(GeneratedReport.id == report_id).first()

    async def auto_generate(self, report_type: str, user_id: str) -> Optional[GeneratedReport]:
        """Auto-generate if not already exists for the period."""
        p_start, p_end = self._get_period(report_type)
        existing = (
            self.db.query(GeneratedReport)
            .filter(
                GeneratedReport.report_type == report_type,
                GeneratedReport.period_start == p_start,
                GeneratedReport.period_end == p_end,
            )
            .first()
        )
        if existing:
            return None
        return await self.generate_report(report_type, user_id, p_start, p_end)
