"""
Tests for TeamCapacityService - FTE calculation for departments and sub-teams.
"""

import pytest
from datetime import date, datetime
from sqlalchemy.orm import Session

from app.models.user import User, UserHistory
from app.models.absence import Absence
from app.models.hiring_plan import HiringPlan
from app.models.organization import SubTeam
from app.services.team_capacity_service import TeamCapacityService


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _create_user_with_history(
    db: Session,
    user_id: str,
    name: str,
    dept_id: str,
    sub_team_id: str,
    pos_id: str,
    start_date: date,
    end_date: date | None = None,
    change_type: str = "HIRE",
) -> User:
    """Create a User and a matching UserHistory record."""
    user = User(
        id=user_id,
        email=f"{user_id}@test.com",
        name=name,
        hashed_password="hashed",
        department_id=dept_id,
        sub_team_id=sub_team_id,
        position_id=pos_id,
        is_active=end_date is None,
    )
    db.add(user)
    db.flush()
    history = UserHistory(
        user_id=user_id,
        department_id=dept_id,
        sub_team_id=sub_team_id,
        position_id=pos_id,
        start_date=datetime.combine(start_date, datetime.min.time()),
        end_date=datetime.combine(end_date, datetime.min.time()) if end_date else None,
        change_type=change_type,
    )
    db.add(history)
    db.commit()
    return user


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestTeamCapacityService:
    """Integration tests for TeamCapacityService using in-memory SQLite."""

    def test_basic_team_fte(
        self,
        db_session: Session,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """3 active users in a department -> active_members=3, available_fte=3.0"""
        dept_id = sample_department.id
        team_id = sample_sub_team.id
        pos_id = sample_position.id

        for i in range(3):
            _create_user_with_history(
                db_session,
                user_id=f"user-{i}",
                name=f"User {i}",
                dept_id=dept_id,
                sub_team_id=team_id,
                pos_id=pos_id,
                start_date=date(2025, 1, 1),
            )

        svc = TeamCapacityService(db_session)
        result = svc.get_team_fte(dept_id, 2026, 3)

        assert result.active_members == 3.0
        assert result.available_fte == 3.0

    def test_parental_leave_reduces_fte(
        self,
        db_session: Session,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """Absence with fte_impact=-1.0 reduces available FTE by 1."""
        dept_id = sample_department.id
        team_id = sample_sub_team.id
        pos_id = sample_position.id

        users = []
        for i in range(3):
            u = _create_user_with_history(
                db_session,
                user_id=f"user-pl-{i}",
                name=f"User PL {i}",
                dept_id=dept_id,
                sub_team_id=team_id,
                pos_id=pos_id,
                start_date=date(2025, 1, 1),
            )
            users.append(u)

        absence = Absence(
            user_id=users[0].id,
            absence_type="PARENTAL_LEAVE",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            fte_impact=-1.0,
            department_id=dept_id,
            sub_team_id=team_id,
            created_by=users[0].id,
        )
        db_session.add(absence)
        db_session.commit()

        svc = TeamCapacityService(db_session)
        result = svc.get_team_fte(dept_id, 2026, 3)

        assert result.active_members == 3.0
        assert result.absence_impact == -1.0
        assert result.available_fte == 2.0

    def test_partial_leave(
        self,
        db_session: Session,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """Absence with fte_impact=-0.5 reduces available FTE by 0.5."""
        dept_id = sample_department.id
        team_id = sample_sub_team.id
        pos_id = sample_position.id

        users = []
        for i in range(3):
            u = _create_user_with_history(
                db_session,
                user_id=f"user-partial-{i}",
                name=f"User Partial {i}",
                dept_id=dept_id,
                sub_team_id=team_id,
                pos_id=pos_id,
                start_date=date(2025, 1, 1),
            )
            users.append(u)

        absence = Absence(
            user_id=users[1].id,
            absence_type="MEDICAL_LEAVE",
            start_date=date(2026, 2, 1),
            end_date=date(2026, 6, 30),
            fte_impact=-0.5,
            department_id=dept_id,
            sub_team_id=team_id,
            created_by=users[1].id,
        )
        db_session.add(absence)
        db_session.commit()

        svc = TeamCapacityService(db_session)
        result = svc.get_team_fte(dept_id, 2026, 3)

        assert result.active_members == 3.0
        assert result.absence_impact == -0.5
        assert result.available_fte == 2.5

    def test_resignation_excludes_user(
        self,
        db_session: Session,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """A user whose HIRE history has end_date set is excluded from active count."""
        dept_id = sample_department.id
        team_id = sample_sub_team.id
        pos_id = sample_position.id

        # Two active users
        for i in range(2):
            _create_user_with_history(
                db_session,
                user_id=f"user-resign-{i}",
                name=f"User Resign {i}",
                dept_id=dept_id,
                sub_team_id=team_id,
                pos_id=pos_id,
                start_date=date(2025, 1, 1),
            )

        # One resigned user (end_date set before the queried month)
        _create_user_with_history(
            db_session,
            user_id="user-resigned",
            name="Resigned User",
            dept_id=dept_id,
            sub_team_id=team_id,
            pos_id=pos_id,
            start_date=date(2025, 1, 1),
            end_date=date(2026, 1, 31),
            change_type="HIRE",
        )

        svc = TeamCapacityService(db_session)
        result = svc.get_team_fte(dept_id, 2026, 3)

        assert result.active_members == 2.0
        assert result.available_fte == 2.0

    def test_planned_hire_adds_fte(
        self,
        db_session: Session,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """Unfilled hiring plan with target_date in range adds to planned_hires."""
        dept_id = sample_department.id
        team_id = sample_sub_team.id
        pos_id = sample_position.id

        _create_user_with_history(
            db_session,
            user_id="user-hire-base",
            name="Base User",
            dept_id=dept_id,
            sub_team_id=team_id,
            pos_id=pos_id,
            start_date=date(2025, 1, 1),
        )

        plan = HiringPlan(
            department_id=dept_id,
            position_id=pos_id,
            target_date=date(2026, 2, 15),
            headcount=1,
            status="APPROVED",
            hired_user_id=None,
        )
        db_session.add(plan)
        db_session.commit()

        svc = TeamCapacityService(db_session)
        result = svc.get_team_fte(dept_id, 2026, 3)

        assert result.active_members == 1.0
        assert result.planned_hires == 1.0
        assert result.available_fte == 2.0

    def test_department_transfer(
        self,
        db_session: Session,
        sample_division,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """User transfers from dept A to dept B: A count -1, B count +1."""
        from app.models.organization import Department, SubTeam as SubTeamModel

        dept_a = sample_department  # DEPT_TEST
        team_a = sample_sub_team   # TEAM_TEST

        # Create dept B and its sub-team
        dept_b = Department(
            id="DEPT_B",
            name="Department B",
            code="DEPT_B_CODE",
            division_id=sample_division.id,
            is_active=True,
        )
        db_session.add(dept_b)
        db_session.commit()
        team_b = SubTeamModel(
            id="TEAM_B",
            name="Team B",
            code="TEAM_B_CODE",
            department_id=dept_b.id,
            is_active=True,
        )
        db_session.add(team_b)
        db_session.commit()

        # Create user initially in dept A (HIRE ended on 2026-02-28)
        user = User(
            id="user-transfer",
            email="transfer@test.com",
            name="Transfer User",
            hashed_password="hashed",
            department_id=dept_b.id,
            sub_team_id=team_b.id,
            position_id=sample_position.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.flush()

        # HIRE record in dept A (ended)
        hist_a = UserHistory(
            user_id=user.id,
            department_id=dept_a.id,
            sub_team_id=team_a.id,
            position_id=sample_position.id,
            start_date=datetime(2025, 1, 1),
            end_date=datetime(2026, 2, 28),
            change_type="HIRE",
        )
        db_session.add(hist_a)

        # TRANSFER_IN record in dept B (ongoing)
        hist_b = UserHistory(
            user_id=user.id,
            department_id=dept_b.id,
            sub_team_id=team_b.id,
            position_id=sample_position.id,
            start_date=datetime(2026, 3, 1),
            end_date=None,
            change_type="TRANSFER_IN",
        )
        db_session.add(hist_b)
        db_session.commit()

        svc = TeamCapacityService(db_session)

        result_a = svc.get_team_fte(dept_a.id, 2026, 3)
        assert result_a.active_members == 0.0

        result_b = svc.get_team_fte(dept_b.id, 2026, 3)
        assert result_b.active_members == 1.0

    def test_open_ended_medical_leave(
        self,
        db_session: Session,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """Absence with end_date=None applies to all future months."""
        dept_id = sample_department.id
        team_id = sample_sub_team.id
        pos_id = sample_position.id

        user = _create_user_with_history(
            db_session,
            user_id="user-openleave",
            name="Open Leave User",
            dept_id=dept_id,
            sub_team_id=team_id,
            pos_id=pos_id,
            start_date=date(2025, 1, 1),
        )

        absence = Absence(
            user_id=user.id,
            absence_type="MEDICAL_LEAVE",
            start_date=date(2026, 1, 15),
            end_date=None,
            fte_impact=-1.0,
            department_id=dept_id,
            sub_team_id=team_id,
            created_by=user.id,
        )
        db_session.add(absence)
        db_session.commit()

        svc = TeamCapacityService(db_session)

        # Should impact March 2026
        result_mar = svc.get_team_fte(dept_id, 2026, 3)
        assert result_mar.absence_impact == -1.0
        assert result_mar.available_fte == 0.0

        # Should also impact December 2026
        result_dec = svc.get_team_fte(dept_id, 2026, 12)
        assert result_dec.absence_impact == -1.0
        assert result_dec.available_fte == 0.0

    def test_fte_range(
        self,
        db_session: Session,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """get_team_fte_range for 3 months returns a list of 3 TeamFTEResponse."""
        dept_id = sample_department.id
        team_id = sample_sub_team.id
        pos_id = sample_position.id

        _create_user_with_history(
            db_session,
            user_id="user-range",
            name="Range User",
            dept_id=dept_id,
            sub_team_id=team_id,
            pos_id=pos_id,
            start_date=date(2025, 1, 1),
        )

        svc = TeamCapacityService(db_session)
        results = svc.get_team_fte_range(dept_id, 2026, 1, 2026, 3)

        assert len(results) == 3
        assert results[0].year == 2026 and results[0].month == 1
        assert results[1].year == 2026 and results[1].month == 2
        assert results[2].year == 2026 and results[2].month == 3
        for r in results:
            assert r.active_members == 1.0

    def test_members_at(
        self,
        db_session: Session,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """get_team_members_at returns member list with is_absent flag."""
        dept_id = sample_department.id
        team_id = sample_sub_team.id
        pos_id = sample_position.id

        user_a = _create_user_with_history(
            db_session,
            user_id="user-member-a",
            name="Alice",
            dept_id=dept_id,
            sub_team_id=team_id,
            pos_id=pos_id,
            start_date=date(2025, 1, 1),
        )
        user_b = _create_user_with_history(
            db_session,
            user_id="user-member-b",
            name="Bob",
            dept_id=dept_id,
            sub_team_id=team_id,
            pos_id=pos_id,
            start_date=date(2025, 1, 1),
        )

        # Bob is on leave during March 2026
        absence = Absence(
            user_id=user_b.id,
            absence_type="PARENTAL_LEAVE",
            start_date=date(2026, 3, 1),
            end_date=date(2026, 5, 31),
            fte_impact=-1.0,
            department_id=dept_id,
            sub_team_id=team_id,
            created_by=user_b.id,
        )
        db_session.add(absence)
        db_session.commit()

        svc = TeamCapacityService(db_session)
        members = svc.get_team_members_at(dept_id, date(2026, 3, 15))

        assert len(members) == 2
        # Sorted by name: Alice, Bob
        alice = next(m for m in members if m.name == "Alice")
        bob = next(m for m in members if m.name == "Bob")

        assert alice.is_absent is False
        assert bob.is_absent is True
        assert len(bob.absences) == 1
        assert bob.absences[0].absence_type == "PARENTAL_LEAVE"

    def test_sub_team_filter(
        self,
        db_session: Session,
        sample_division,
        sample_department,
        sample_sub_team,
        sample_position,
    ):
        """Filtering by sub_team_id returns only that sub-team's members."""
        dept_id = sample_department.id
        team_a = sample_sub_team  # TEAM_TEST
        pos_id = sample_position.id

        # Create second sub-team in same department
        team_b = SubTeam(
            id="TEAM_FILTER_B",
            name="Filter Team B",
            code="FILTER_B",
            department_id=dept_id,
            is_active=True,
        )
        db_session.add(team_b)
        db_session.commit()

        # User in team A
        _create_user_with_history(
            db_session,
            user_id="user-filter-a",
            name="Filter A User",
            dept_id=dept_id,
            sub_team_id=team_a.id,
            pos_id=pos_id,
            start_date=date(2025, 1, 1),
        )

        # User in team B
        _create_user_with_history(
            db_session,
            user_id="user-filter-b",
            name="Filter B User",
            dept_id=dept_id,
            sub_team_id=team_b.id,
            pos_id=pos_id,
            start_date=date(2025, 1, 1),
        )

        svc = TeamCapacityService(db_session)

        # Filter by team A only
        result_a = svc.get_team_fte(dept_id, 2026, 3, sub_team_id=team_a.id)
        assert result_a.active_members == 1.0

        # Filter by team B only
        result_b = svc.get_team_fte(dept_id, 2026, 3, sub_team_id=team_b.id)
        assert result_b.active_members == 1.0

        # No filter -> both teams
        result_all = svc.get_team_fte(dept_id, 2026, 3)
        assert result_all.active_members == 2.0
