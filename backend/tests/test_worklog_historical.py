"""
Tests for historical worklog filtering via UserHistory.
Verifies that historical=False uses current team and historical=True uses
the team the user belonged to at the worklog date.

Note: SQLite's CAST(x AS DATE) truncates date strings to an integer (year),
breaking datetime-to-date comparisons. We monkeypatch `cast` in the service
module to be a no-op so that SQLite text comparisons work correctly.
"""

import pytest
from datetime import date, datetime
from sqlalchemy.orm import Session

from app.models.user import User, UserHistory
from app.models.resource import WorkLog
from app.models.organization import Department, SubTeam
from app.models.work_type import WorkTypeCategory
from app.services import worklog_service as _wl_mod
from app.services.worklog_service import WorkLogService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def work_type_cat(db_session: Session) -> WorkTypeCategory:
    """Create a work type category required by WorkLog FK."""
    cat = WorkTypeCategory(
        id=1,
        code="TEST_CAT",
        name="Test Category",
        level=1,
        is_active=True,
    )
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)
    return cat


@pytest.fixture
def dept_a(sample_department) -> Department:
    """Alias for the default sample department (dept A)."""
    return sample_department


@pytest.fixture
def team_a(sample_sub_team) -> SubTeam:
    """Alias for the default sample sub-team (team A)."""
    return sample_sub_team


@pytest.fixture
def dept_b(db_session: Session, sample_division) -> Department:
    """Create a second department (dept B)."""
    dept = Department(
        id="DEPT_HIST_B",
        name="History Dept B",
        code="HIST_B",
        division_id=sample_division.id,
        is_active=True,
    )
    db_session.add(dept)
    db_session.commit()
    db_session.refresh(dept)
    return dept


@pytest.fixture
def team_b(db_session: Session, dept_b) -> SubTeam:
    """Create a sub-team in dept B."""
    team = SubTeam(
        id="TEAM_HIST_B",
        name="History Team B",
        code="HIST_TEAM_B",
        department_id=dept_b.id,
        is_active=True,
    )
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)
    return team


@pytest.fixture(autouse=True)
def _sqlite_cast_noop(monkeypatch):
    """Patch cast() in worklog_service to be a no-op for SQLite compatibility.

    SQLite's CAST(text AS DATE) truncates to the year integer, breaking
    date comparisons. Returning the column unmodified lets SQLite compare
    ISO-8601 text representations correctly.
    """
    monkeypatch.setattr(_wl_mod, "cast", lambda col, _type: col)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestWorklogHistorical:
    """Tests for the historical parameter on get_multi_with_user."""

    def test_historical_false_default(
        self,
        db_session: Session,
        dept_a: Department,
        team_a: SubTeam,
        sample_position,
        work_type_cat: WorkTypeCategory,
    ):
        """historical=false (default): filter by user's CURRENT department."""
        # Create user currently in dept_a
        user = User(
            id="user-hist-cur",
            email="cur@test.com",
            name="Current Team User",
            hashed_password="hashed",
            department_id=dept_a.id,
            sub_team_id=team_a.id,
            position_id=sample_position.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.flush()

        # Active history record
        hist = UserHistory(
            user_id=user.id,
            department_id=dept_a.id,
            sub_team_id=team_a.id,
            position_id=sample_position.id,
            start_date=datetime(2025, 1, 1),
            end_date=None,
            change_type="HIRE",
        )
        db_session.add(hist)

        # Create a worklog
        wl = WorkLog(
            date=date(2026, 3, 10),
            user_id=user.id,
            work_type_category_id=work_type_cat.id,
            hours=8.0,
        )
        db_session.add(wl)
        db_session.commit()

        svc = WorkLogService(db_session)
        results = svc.get_multi_with_user(
            department_id=dept_a.id,
            historical=False,
        )
        assert len(results) == 1
        assert results[0].user_id == user.id

    def test_historical_true(
        self,
        db_session: Session,
        dept_a: Department,
        team_a: SubTeam,
        dept_b: Department,
        team_b: SubTeam,
        sample_position,
        work_type_cat: WorkTypeCategory,
    ):
        """User transferred from dept A to dept B. historical=true filters
        by the team at worklog date via UserHistory."""
        # User currently in dept_b (transferred on 2026-03-01)
        user = User(
            id="user-hist-transfer",
            email="transfer-hist@test.com",
            name="Transfer Historical",
            hashed_password="hashed",
            department_id=dept_b.id,
            sub_team_id=team_b.id,
            position_id=sample_position.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.flush()

        # History: HIRE in dept A from 2025-01-01 to 2026-02-28
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

        # History: TRANSFER_IN to dept B from 2026-03-01 (ongoing)
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

        # Worklog in February (while in dept A)
        wl_feb = WorkLog(
            date=date(2026, 2, 15),
            user_id=user.id,
            work_type_category_id=work_type_cat.id,
            hours=6.0,
        )
        db_session.add(wl_feb)

        # Worklog in March (while in dept B)
        wl_mar = WorkLog(
            date=date(2026, 3, 10),
            user_id=user.id,
            work_type_category_id=work_type_cat.id,
            hours=7.0,
        )
        db_session.add(wl_mar)
        db_session.commit()

        svc = WorkLogService(db_session)

        # historical=True, filter by dept A -> only Feb worklog
        results_a = svc.get_multi_with_user(
            department_id=dept_a.id,
            historical=True,
        )
        assert len(results_a) == 1
        assert results_a[0].date == date(2026, 2, 15)

        # historical=True, filter by dept B -> only Mar worklog
        results_b = svc.get_multi_with_user(
            department_id=dept_b.id,
            historical=True,
        )
        assert len(results_b) == 1
        assert results_b[0].date == date(2026, 3, 10)

        # historical=False (default), filter by dept A -> NO worklogs
        # (user's current dept is B, not A)
        results_default_a = svc.get_multi_with_user(
            department_id=dept_a.id,
            historical=False,
        )
        assert len(results_default_a) == 0

        # historical=False, filter by dept B -> BOTH worklogs
        # (user is currently in dept B, so all their worklogs match)
        results_default_b = svc.get_multi_with_user(
            department_id=dept_b.id,
            historical=False,
        )
        assert len(results_default_b) == 2
