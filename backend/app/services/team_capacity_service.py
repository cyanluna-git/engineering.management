"""
Team Capacity Service - FTE calculation for departments and sub-teams

Calculates available FTE as:
    available_fte = active_members + absence_impact + planned_hires

Where:
    active_members  = count of users with active history records in the period
    absence_impact  = sum of fte_impact from overlapping absences (negative values)
    planned_hires   = sum of headcount from unfilled hiring plans targeting <= month_end
"""

from calendar import monthrange
from datetime import date
from typing import Optional

from sqlalchemy import and_, or_, func
from sqlalchemy.orm import Session, joinedload

from app.models.absence import Absence
from app.models.hiring_plan import HiringPlan
from app.models.organization import SubTeam
from app.models.user import User, UserHistory
from app.schemas.team_capacity import (
    TeamFTEResponse,
    TeamMemberAbsence,
    TeamMemberAtDate,
)


class TeamCapacityService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_sub_team_ids(
        self,
        department_id: str,
        sub_team_id: Optional[str] = None,
    ) -> list[str]:
        """Return sub-team IDs belonging to *department_id*.

        If *sub_team_id* is given, return only that ID (after verifying it
        belongs to the department).  Otherwise return all active sub-teams
        for the department.
        """
        if sub_team_id:
            exists = (
                self.db.query(SubTeam.id)
                .filter(
                    SubTeam.id == sub_team_id,
                    SubTeam.department_id == department_id,
                )
                .first()
            )
            return [sub_team_id] if exists else []

        rows = (
            self.db.query(SubTeam.id)
            .filter(
                SubTeam.department_id == department_id,
                SubTeam.is_active == True,  # noqa: E712
            )
            .all()
        )
        return [r[0] for r in rows]

    def _count_active_members(
        self,
        department_id: str,
        sub_team_ids: list[str],
        month_start: date,
        month_end: date,
    ) -> float:
        """Count distinct users with an active UserHistory record overlapping
        the month, excluding TRANSFER_OUT and RESIGN records.

        A record overlaps the month when:
            start_date < month_end  AND  (end_date IS NULL OR end_date > month_start)
        """
        if not sub_team_ids:
            return 0.0

        # Users with active history records overlapping the month
        history_count_q = (
            self.db.query(func.distinct(UserHistory.user_id))
            .filter(
                and_(
                    UserHistory.department_id == department_id,
                    UserHistory.sub_team_id.in_(sub_team_ids),
                    UserHistory.start_date < month_end,
                    (
                        (UserHistory.end_date.is_(None))
                        | (UserHistory.end_date > month_start)
                    ),
                    UserHistory.change_type.notin_(["TRANSFER_OUT", "RESIGN"]),
                ),
            )
        )
        history_user_ids = {row[0] for row in history_count_q.all()}

        # Fallback: users in sub_team with no history records at all
        # Include if: (is_active=True) OR (termination_date is in the future relative to month)
        history_exists_subq = (
            self.db.query(UserHistory.user_id)
            .filter(UserHistory.sub_team_id.in_(sub_team_ids))
            .distinct()
            .subquery()
        )
        fallback_count_q = (
            self.db.query(User.id)
            .filter(
                and_(
                    User.department_id == department_id,
                    User.sub_team_id.in_(sub_team_ids),
                    or_(
                        User.is_active.is_(True),
                        # Include inactive users whose termination_date is after month_start
                        and_(
                            User.termination_date.isnot(None),
                            User.termination_date > month_start,
                        ),
                    ),
                    ~User.id.in_(
                        self.db.query(history_exists_subq.c.user_id)
                    ),
                ),
            )
        )
        fallback_user_ids = {row[0] for row in fallback_count_q.all()}

        return float(len(history_user_ids | fallback_user_ids))

    def _sum_absence_impact(
        self,
        department_id: str,
        sub_team_ids: Optional[list[str]],
        month_start: date,
        month_end: date,
    ) -> float:
        """Sum fte_impact from Absence records overlapping the month.

        An absence overlaps when:
            start_date <= month_end  AND  (end_date IS NULL OR end_date >= month_start)

        fte_impact is stored as a negative number (e.g. -1.0 for full absence).
        """
        filters = [
            Absence.department_id == department_id,
            Absence.start_date <= month_end,
            (Absence.end_date.is_(None)) | (Absence.end_date >= month_start),
        ]
        if sub_team_ids:
            filters.append(Absence.sub_team_id.in_(sub_team_ids))

        total = (
            self.db.query(func.sum(Absence.fte_impact))
            .filter(and_(*filters))
            .scalar()
        )
        return float(total or 0.0)

    def _sum_planned_hires(
        self,
        department_id: str,
        month_end: date,
    ) -> float:
        """Sum headcount from unfilled HiringPlan records with
        target_date <= month_end.

        Only considers statuses that represent open positions:
        PLANNED, APPROVED, IN_PROGRESS.
        HiringPlan has no sub_team column, so no sub-team filter is applied.
        """
        total = (
            self.db.query(func.sum(HiringPlan.headcount))
            .filter(
                and_(
                    HiringPlan.department_id == department_id,
                    HiringPlan.target_date <= month_end,
                    HiringPlan.status.in_(["PLANNED", "APPROVED", "IN_PROGRESS"]),
                    HiringPlan.hired_user_id.is_(None),
                ),
            )
            .scalar()
        )
        return float(total or 0.0)

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def get_team_fte(
        self,
        department_id: str,
        year: int,
        month: int,
        sub_team_id: Optional[str] = None,
    ) -> TeamFTEResponse:
        """Calculate available FTE for a single month."""
        _, last_day = monthrange(year, month)
        month_start = date(year, month, 1)
        month_end = date(year, month, last_day)

        sub_team_ids = self._get_sub_team_ids(department_id, sub_team_id)

        active_members = self._count_active_members(
            department_id, sub_team_ids, month_start, month_end,
        )
        absence_impact = self._sum_absence_impact(
            department_id, sub_team_ids, month_start, month_end,
        )
        planned_hires = self._sum_planned_hires(department_id, month_end)

        available_fte = active_members + absence_impact + planned_hires

        return TeamFTEResponse(
            year=year,
            month=month,
            active_members=active_members,
            absence_impact=absence_impact,
            planned_hires=planned_hires,
            available_fte=available_fte,
        )

    def get_team_fte_range(
        self,
        department_id: str,
        start_year: int,
        start_month: int,
        end_year: int,
        end_month: int,
        sub_team_id: Optional[str] = None,
    ) -> list[TeamFTEResponse]:
        """Calculate available FTE for each month in [start, end] inclusive."""
        results: list[TeamFTEResponse] = []
        y, m = start_year, start_month
        while (y, m) <= (end_year, end_month):
            results.append(
                self.get_team_fte(department_id, y, m, sub_team_id)
            )
            # advance to next month
            if m == 12:
                y += 1
                m = 1
            else:
                m += 1
        return results

    def get_team_members_at(
        self,
        department_id: str,
        target_date: date,
        sub_team_id: Optional[str] = None,
    ) -> list[TeamMemberAtDate]:
        """Return members belonging to the department (optionally filtered by
        sub-team) who are active on *target_date*, annotated with absence info.
        """
        sub_team_ids = self._get_sub_team_ids(department_id, sub_team_id)
        if not sub_team_ids:
            return []

        # 1) Users with active history records on target_date
        history_user_ids_q = (
            self.db.query(func.distinct(UserHistory.user_id))
            .filter(
                and_(
                    UserHistory.department_id == department_id,
                    UserHistory.sub_team_id.in_(sub_team_ids),
                    UserHistory.start_date <= target_date,
                    (
                        (UserHistory.end_date.is_(None))
                        | (UserHistory.end_date > target_date)
                    ),
                    UserHistory.change_type.notin_(["TRANSFER_OUT", "RESIGN"]),
                ),
            )
        )
        history_user_ids = {row[0] for row in history_user_ids_q.all()}

        # 2) Fallback: users assigned to the sub_team in users table
        #    but missing from user_history (no history record at all)
        #    Include inactive users whose termination_date is after target_date
        history_exists_subq = (
            self.db.query(UserHistory.user_id)
            .filter(UserHistory.sub_team_id.in_(sub_team_ids))
            .distinct()
            .subquery()
        )
        fallback_user_ids_q = (
            self.db.query(User.id)
            .filter(
                and_(
                    User.department_id == department_id,
                    User.sub_team_id.in_(sub_team_ids),
                    or_(
                        User.is_active.is_(True),
                        and_(
                            User.termination_date.isnot(None),
                            User.termination_date > target_date,
                        ),
                    ),
                    ~User.id.in_(
                        self.db.query(history_exists_subq.c.user_id)
                    ),
                ),
            )
        )
        fallback_user_ids = {row[0] for row in fallback_user_ids_q.all()}

        active_user_ids = list(history_user_ids | fallback_user_ids)
        if not active_user_ids:
            return []

        # Load user details
        users = (
            self.db.query(User)
            .options(
                joinedload(User.sub_team),
                joinedload(User.position),
            )
            .filter(User.id.in_(active_user_ids))
            .all()
        )

        # Load absences overlapping target_date for these users
        absences = (
            self.db.query(Absence)
            .filter(
                and_(
                    Absence.user_id.in_(active_user_ids),
                    Absence.start_date <= target_date,
                    (Absence.end_date.is_(None)) | (Absence.end_date >= target_date),
                ),
            )
            .all()
        )

        # Group absences by user_id
        absence_map: dict[str, list[Absence]] = {}
        for a in absences:
            absence_map.setdefault(a.user_id, []).append(a)

        results: list[TeamMemberAtDate] = []
        for user in users:
            user_absences = absence_map.get(user.id, [])
            results.append(
                TeamMemberAtDate(
                    user_id=user.id,
                    name=user.name,
                    korean_name=user.korean_name,
                    email=user.email,
                    sub_team_id=user.sub_team_id,
                    sub_team_name=user.sub_team.name if user.sub_team else None,
                    position_id=user.position_id,
                    position_name=user.position.name if user.position else None,
                    is_absent=len(user_absences) > 0,
                    absences=[
                        TeamMemberAbsence(
                            absence_type=a.absence_type,
                            start_date=a.start_date,
                            end_date=a.end_date,
                            fte_impact=a.fte_impact,
                        )
                        for a in user_absences
                    ],
                )
            )

        # Sort by name for consistent ordering
        results.sort(key=lambda m: m.name)
        return results
