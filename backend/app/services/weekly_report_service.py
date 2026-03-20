"""
Service layer for weekly report CRUD and permissions.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import READ_ONLY_ROLES
from app.models.organization import Department, SubTeam
from app.models.project import Project
from app.models.resource import WorkLog
from app.models.user import User
from app.models.weekly_report import WeeklyReport


@dataclass(frozen=True)
class ResolvedWeeklyReportTarget:
    scope: str
    team_scope_type: Optional[str]
    scope_id: str
    target_key: str
    owner_user_id: Optional[str]


class WeeklyReportService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def get_week_range(reference_date: Optional[date] = None, week_start: Optional[date] = None) -> tuple[date, date, str]:
        if week_start is not None:
            if week_start.weekday() != 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="week_start must be a Monday",
                )
            start = week_start
        else:
            ref = reference_date or date.today()
            start = ref - timedelta(days=ref.weekday())

        end = start + timedelta(days=6)
        week_key = f"{start.isocalendar().year}-W{start.isocalendar().week:02d}"
        return start, end, week_key

    @staticmethod
    def is_in_progress(start: date, end: date, today: Optional[date] = None) -> bool:
        current = today or date.today()
        return start <= current <= end

    def resolve_target(
        self,
        current_user: User,
        scope: str,
        team_scope_type: Optional[str],
        scope_id: Optional[str],
        read_only: bool = False,
    ) -> ResolvedWeeklyReportTarget:
        if scope == "user":
            if team_scope_type is not None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="team_scope_type is not allowed for personal reports",
                )

            resolved_scope_id = scope_id or current_user.id
            if resolved_scope_id != current_user.id and not read_only:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Personal weekly reports can only be modified by the owner",
                )

            target_user = self.db.query(User).filter(User.id == resolved_scope_id).first()
            if not target_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Target user not found",
                )

            return ResolvedWeeklyReportTarget(
                scope="user",
                team_scope_type=None,
                scope_id=resolved_scope_id,
                target_key=f"user:{resolved_scope_id}",
                owner_user_id=resolved_scope_id,
            )

        if scope != "team":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="scope must be either 'user' or 'team'",
            )

        if team_scope_type not in {"department", "sub_team", "project"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="team_scope_type must be 'department', 'sub_team', or 'project' for team reports",
            )

        if team_scope_type == "project":
            if not scope_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="scope_id is required for project weekly reports",
                )
            project = self.db.query(Project).filter(Project.id == scope_id).first()
            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Target project not found",
                )
            return ResolvedWeeklyReportTarget(
                scope="team",
                team_scope_type="project",
                scope_id=scope_id,
                target_key=f"project:{scope_id}",
                owner_user_id=None,
            )

        if team_scope_type == "department":
            resolved_scope_id = scope_id or current_user.department_id
            if not resolved_scope_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Department context is required for department weekly reports",
                )
            department = self.db.query(Department).filter(Department.id == resolved_scope_id).first()
            if not department:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Target department not found",
                )
            if current_user.role != "ADMIN" and current_user.department_id != resolved_scope_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Department weekly reports are limited to members of the target department",
                )
            return ResolvedWeeklyReportTarget(
                scope="team",
                team_scope_type="department",
                scope_id=resolved_scope_id,
                target_key=f"department:{resolved_scope_id}",
                owner_user_id=None,
            )

        resolved_scope_id = scope_id or current_user.sub_team_id
        if not resolved_scope_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Sub-team context is required for sub-team weekly reports",
            )
        sub_team = self.db.query(SubTeam).filter(SubTeam.id == resolved_scope_id).first()
        if not sub_team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target sub-team not found",
            )
        if current_user.role != "ADMIN" and current_user.sub_team_id != resolved_scope_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sub-team weekly reports are limited to members of the target sub-team",
            )
        return ResolvedWeeklyReportTarget(
            scope="team",
            team_scope_type="sub_team",
            scope_id=resolved_scope_id,
            target_key=f"sub_team:{resolved_scope_id}",
            owner_user_id=None,
        )

    @staticmethod
    def ensure_write_access(current_user: User) -> None:
        if current_user.role in READ_ONLY_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Read-only access. This account does not have permission to modify data.",
            )

    def get_current(
        self,
        current_user: User,
        scope: str,
        team_scope_type: Optional[str],
        scope_id: Optional[str],
        reference_date: Optional[date],
        read_only: bool = False,
    ) -> dict:
        target = self.resolve_target(current_user, scope, team_scope_type, scope_id, read_only=read_only)
        week_start, week_end, week_key = self.get_week_range(reference_date=reference_date)
        report = (
            self.db.query(WeeklyReport)
            .filter(
                WeeklyReport.target_key == target.target_key,
                WeeklyReport.week_start == week_start,
            )
            .first()
        )

        return {
            "scope": target.scope,
            "team_scope_type": target.team_scope_type,
            "scope_id": target.scope_id,
            "target_key": target.target_key,
            "week_start": week_start,
            "week_end": week_end,
            "week_key": week_key,
            "is_in_progress": self.is_in_progress(week_start, week_end),
            "report": self.serialize(report) if report else None,
        }

    def get_history(
        self,
        current_user: User,
        scope: str,
        team_scope_type: Optional[str],
        scope_id: Optional[str],
        limit: int,
        read_only: bool = False,
    ) -> list[dict]:
        target = self.resolve_target(current_user, scope, team_scope_type, scope_id, read_only=read_only)
        reports = (
            self.db.query(WeeklyReport)
            .filter(WeeklyReport.target_key == target.target_key)
            .order_by(WeeklyReport.week_start.desc())
            .limit(limit)
            .all()
        )
        return [self.serialize(report) for report in reports]

    def upsert(
        self,
        current_user: User,
        *,
        scope: str,
        team_scope_type: Optional[str],
        scope_id: Optional[str],
        week_start: Optional[date],
        reference_date: Optional[date],
        status_value: str,
        title: Optional[str],
        markdown_body: str,
    ) -> dict:
        self.ensure_write_access(current_user)
        target = self.resolve_target(current_user, scope, team_scope_type, scope_id)
        resolved_week_start, week_end, week_key = self.get_week_range(
            reference_date=reference_date,
            week_start=week_start,
        )
        report = (
            self.db.query(WeeklyReport)
            .filter(
                WeeklyReport.target_key == target.target_key,
                WeeklyReport.week_start == resolved_week_start,
            )
            .first()
        )

        is_new = report is None
        if report is None:
            report = WeeklyReport(
                scope=target.scope,
                team_scope_type=target.team_scope_type,
                scope_id=target.scope_id,
                target_key=target.target_key,
                week_start=resolved_week_start,
                week_end=week_end,
                week_key=week_key,
                owner_user_id=target.owner_user_id,
                created_by_user_id=current_user.id,
                updated_by_user_id=current_user.id,
            )
            self.db.add(report)

        report.status = status_value
        report.title = title
        report.markdown_body = markdown_body
        report.week_end = week_end
        report.week_key = week_key
        report.updated_by_user_id = current_user.id

        if status_value == "published":
            report.published_at = datetime.utcnow()
            report.published_by_user_id = current_user.id
        else:
            report.published_at = None
            report.published_by_user_id = None

        self.db.commit()
        self.db.refresh(report)
        return self.serialize(report)

    def delete(self, current_user: User, report_id: str) -> None:
        self.ensure_write_access(current_user)
        report = self.db.query(WeeklyReport).filter(WeeklyReport.id == report_id).first()
        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Weekly report not found",
            )

        self.resolve_target(
            current_user,
            report.scope,
            report.team_scope_type,
            report.scope_id,
        )

        self.db.delete(report)
        self.db.commit()

    def serialize(self, report: WeeklyReport) -> dict:
        return {
            "id": report.id,
            "scope": report.scope,
            "team_scope_type": report.team_scope_type,
            "scope_id": report.scope_id,
            "target_key": report.target_key,
            "week_start": report.week_start,
            "week_end": report.week_end,
            "week_key": report.week_key,
            "is_in_progress": self.is_in_progress(report.week_start, report.week_end),
            "status": report.status,
            "title": report.title,
            "markdown_body": report.markdown_body,
            "source_metadata": report.source_metadata,
            "owner_user_id": report.owner_user_id,
            "created_by_user_id": report.created_by_user_id,
            "updated_by_user_id": report.updated_by_user_id,
            "published_by_user_id": report.published_by_user_id,
            "published_at": report.published_at,
            "created_at": report.created_at,
            "updated_at": report.updated_at,
        }

    def get_hierarchy(
        self,
        department_id: str,
        reference_date: Optional[date] = None,
    ) -> dict:
        """Get hierarchical weekly reports for a department: dept → sub_teams → members."""
        week_start, week_end, week_key = self.get_week_range(reference_date=reference_date)

        department = self.db.query(Department).filter(Department.id == department_id).first()
        if not department:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Department not found",
            )

        sub_teams = (
            self.db.query(SubTeam)
            .filter(SubTeam.department_id == department_id, SubTeam.is_active == True)
            .order_by(SubTeam.name)
            .all()
        )

        users = (
            self.db.query(User)
            .filter(User.department_id == department_id, User.is_active == True)
            .order_by(User.korean_name, User.name)
            .all()
        )

        # Build all target_keys to query in one batch
        target_keys = [f"department:{department_id}"]
        user_by_id = {}
        for st in sub_teams:
            target_keys.append(f"sub_team:{st.id}")
        for u in users:
            target_keys.append(f"user:{u.id}")
            user_by_id[u.id] = u

        # Single batch query for all reports
        reports = (
            self.db.query(WeeklyReport)
            .filter(
                WeeklyReport.target_key.in_(target_keys),
                WeeklyReport.week_start == week_start,
            )
            .all()
        )

        report_by_key = {r.target_key: r for r in reports}

        # Group users by sub_team
        users_by_st: dict[str | None, list] = {}
        for u in users:
            users_by_st.setdefault(u.sub_team_id, []).append(u)

        # Assemble sub_teams
        sub_team_data = []
        for st in sub_teams:
            st_users = users_by_st.get(st.id, [])
            st_report = report_by_key.get(f"sub_team:{st.id}")
            members = []
            submitted = 0
            for u in st_users:
                u_report = report_by_key.get(f"user:{u.id}")
                members.append({
                    "user_id": u.id,
                    "name": u.name,
                    "korean_name": u.korean_name,
                    "report": self.serialize(u_report) if u_report else None,
                })
                if u_report:
                    submitted += 1

            sub_team_data.append({
                "id": st.id,
                "name": st.name,
                "report": self.serialize(st_report) if st_report else None,
                "members": members,
                "submitted_count": submitted,
                "total_count": len(st_users),
            })

        # Users without sub_team
        unassigned = users_by_st.get(None, [])
        if unassigned:
            unassigned_members = []
            submitted = 0
            for u in unassigned:
                u_report = report_by_key.get(f"user:{u.id}")
                unassigned_members.append({
                    "user_id": u.id,
                    "name": u.name,
                    "korean_name": u.korean_name,
                    "report": self.serialize(u_report) if u_report else None,
                })
                if u_report:
                    submitted += 1
            sub_team_data.append({
                "id": None,
                "name": "Unassigned",
                "report": None,
                "members": unassigned_members,
                "submitted_count": submitted,
                "total_count": len(unassigned_members),
            })

        dept_report = report_by_key.get(f"department:{department_id}")

        return {
            "department": {"id": department.id, "name": department.name, "code": department.code},
            "week_start": str(week_start),
            "week_end": str(week_end),
            "week_key": week_key,
            "department_report": self.serialize(dept_report) if dept_report else None,
            "sub_teams": sub_team_data,
        }

    def get_project_hierarchy(
        self,
        project_id: str,
        reference_date: Optional[date] = None,
    ) -> dict:
        """Get hierarchical weekly reports for a project: project -> members."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # PM info
        pm_info = None
        if project.pm_id:
            pm_user = self.db.query(User).filter(User.id == project.pm_id).first()
            if pm_user:
                pm_info = {
                    "user_id": pm_user.id,
                    "name": pm_user.name,
                    "korean_name": pm_user.korean_name,
                }

        week_start, week_end, week_key = self.get_week_range(reference_date=reference_date)

        # Query distinct user_ids from WorkLog for this project in the target week
        member_ids = [
            r[0]
            for r in self.db.query(WorkLog.user_id)
            .filter(
                WorkLog.project_id == project_id,
                WorkLog.date >= week_start,
                WorkLog.date <= week_end,
            )
            .distinct()
            .all()
        ]

        # Batch query User objects
        users = (
            self.db.query(User)
            .filter(User.id.in_(member_ids))
            .order_by(User.korean_name, User.name)
            .all()
            if member_ids
            else []
        )

        # Build all target_keys to query in one batch
        target_keys = [f"project:{project_id}"]
        for u in users:
            target_keys.append(f"user:{u.id}")

        # Single batch query for all reports
        reports = (
            self.db.query(WeeklyReport)
            .filter(
                WeeklyReport.target_key.in_(target_keys),
                WeeklyReport.week_start == week_start,
            )
            .all()
        )

        report_by_key = {r.target_key: r for r in reports}

        # Assemble members
        members = []
        submitted_count = 0
        for u in users:
            u_report = report_by_key.get(f"user:{u.id}")
            members.append({
                "user_id": u.id,
                "name": u.name,
                "korean_name": u.korean_name,
                "report": self.serialize(u_report) if u_report else None,
            })
            if u_report:
                submitted_count += 1

        project_report = report_by_key.get(f"project:{project_id}")

        return {
            "project": {"id": project.id, "name": project.name},
            "pm": pm_info,
            "week_start": str(week_start),
            "week_end": str(week_end),
            "week_key": week_key,
            "project_report": self.serialize(project_report) if project_report else None,
            "members": members,
            "submitted_count": submitted_count,
            "total_count": len(members),
        }
