"""
Tests for Absence CRUD API endpoints and team capacity endpoint.
"""

import pytest
from datetime import date, datetime
from types import SimpleNamespace
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.main import app
from app.models.user import User
from app.models.absence import Absence


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_user(
    db_session: Session,
    sample_department,
    sample_sub_team,
    sample_position,
) -> User:
    """Create an admin user for auth overrides."""
    user = User(
        id="admin-abs-test",
        email="admin-abs@test.com",
        name="Admin Abs",
        hashed_password="hashed",
        role="ADMIN",
        department_id=sample_department.id,
        sub_team_id=sample_sub_team.id,
        position_id=sample_position.id,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def target_user(
    db_session: Session,
    sample_department,
    sample_sub_team,
    sample_position,
) -> User:
    """Create a normal user to attach absences to."""
    user = User(
        id="target-abs-user",
        email="target-abs@test.com",
        name="Target User",
        hashed_password="hashed",
        role="USER",
        department_id=sample_department.id,
        sub_team_id=sample_sub_team.id,
        position_id=sample_position.id,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_client(client: TestClient, admin_user: User):
    """TestClient with get_current_user overridden to return admin_user."""
    app.dependency_overrides[get_current_user] = lambda: admin_user
    yield client
    # client fixture already clears overrides


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAbsenceAPI:
    """API-level tests for /api/absences endpoints."""

    def test_create_absence(
        self,
        auth_client: TestClient,
        admin_user: User,
        target_user: User,
        sample_department,
        sample_sub_team,
    ):
        """POST /api/absences -> 201 with returned id."""
        payload = {
            "user_id": target_user.id,
            "absence_type": "PARENTAL_LEAVE",
            "start_date": "2026-04-01",
            "end_date": "2026-09-30",
            "fte_impact": -1.0,
            "department_id": sample_department.id,
            "sub_team_id": sample_sub_team.id,
            "remarks": "Parental leave for 6 months",
        }
        resp = auth_client.post("/api/absences/", json=payload)
        assert resp.status_code == 201
        body = resp.json()
        assert body["id"] is not None
        assert body["user_id"] == target_user.id
        assert body["absence_type"] == "PARENTAL_LEAVE"
        assert body["fte_impact"] == -1.0
        assert body["created_by"] == admin_user.id

    def test_list_absences(
        self,
        auth_client: TestClient,
        admin_user: User,
        target_user: User,
        sample_department,
        sample_sub_team,
    ):
        """GET /api/absences -> 200 with list."""
        # Create one absence first
        payload = {
            "user_id": target_user.id,
            "absence_type": "MEDICAL_LEAVE",
            "start_date": "2026-05-01",
            "end_date": "2026-05-31",
            "fte_impact": -1.0,
            "department_id": sample_department.id,
        }
        create_resp = auth_client.post("/api/absences/", json=payload)
        assert create_resp.status_code == 201

        resp = auth_client.get("/api/absences/")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) >= 1

    def test_get_absence(
        self,
        auth_client: TestClient,
        admin_user: User,
        target_user: User,
        sample_department,
    ):
        """GET /api/absences/{id} -> 200."""
        payload = {
            "user_id": target_user.id,
            "absence_type": "SABBATICAL",
            "start_date": "2026-07-01",
            "end_date": "2026-07-31",
            "fte_impact": -1.0,
            "department_id": sample_department.id,
        }
        create_resp = auth_client.post("/api/absences/", json=payload)
        absence_id = create_resp.json()["id"]

        resp = auth_client.get(f"/api/absences/{absence_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == absence_id
        assert resp.json()["absence_type"] == "SABBATICAL"

    def test_update_absence(
        self,
        auth_client: TestClient,
        admin_user: User,
        target_user: User,
        sample_department,
    ):
        """PUT /api/absences/{id} -> 200 with updated field."""
        payload = {
            "user_id": target_user.id,
            "absence_type": "OTHER",
            "start_date": "2026-08-01",
            "end_date": "2026-08-15",
            "fte_impact": -0.5,
            "department_id": sample_department.id,
            "remarks": "Original",
        }
        create_resp = auth_client.post("/api/absences/", json=payload)
        absence_id = create_resp.json()["id"]

        update_resp = auth_client.put(
            f"/api/absences/{absence_id}",
            json={"remarks": "Updated remark", "fte_impact": -0.3},
        )
        assert update_resp.status_code == 200
        body = update_resp.json()
        assert body["remarks"] == "Updated remark"
        assert body["fte_impact"] == -0.3

    def test_delete_absence(
        self,
        auth_client: TestClient,
        admin_user: User,
        target_user: User,
        sample_department,
    ):
        """DELETE /api/absences/{id} -> 204, then GET -> 404."""
        payload = {
            "user_id": target_user.id,
            "absence_type": "SECONDMENT",
            "start_date": "2026-09-01",
            "end_date": "2026-09-30",
            "fte_impact": -1.0,
            "department_id": sample_department.id,
        }
        create_resp = auth_client.post("/api/absences/", json=payload)
        absence_id = create_resp.json()["id"]

        del_resp = auth_client.delete(f"/api/absences/{absence_id}")
        assert del_resp.status_code == 204

        get_resp = auth_client.get(f"/api/absences/{absence_id}")
        assert get_resp.status_code == 404

    def test_team_capacity_endpoint(
        self,
        auth_client: TestClient,
        admin_user: User,
        sample_department,
        sample_sub_team,
        sample_position,
        db_session: Session,
    ):
        """GET /api/team-capacity/?department_id=...&start/end -> 200 with monthly data."""
        from app.models.user import UserHistory

        # Create a user with history so the capacity query returns data
        user = User(
            id="cap-user",
            email="cap@test.com",
            name="Cap User",
            hashed_password="hashed",
            department_id=sample_department.id,
            sub_team_id=sample_sub_team.id,
            position_id=sample_position.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.flush()
        hist = UserHistory(
            user_id=user.id,
            department_id=sample_department.id,
            sub_team_id=sample_sub_team.id,
            position_id=sample_position.id,
            start_date=datetime(2025, 1, 1),
            end_date=None,
            change_type="HIRE",
        )
        db_session.add(hist)
        db_session.commit()

        resp = auth_client.get(
            "/api/team-capacity/",
            params={
                "department_id": sample_department.id,
                "start_year": 2026,
                "start_month": 1,
                "end_year": 2026,
                "end_month": 3,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 3
        assert body[0]["year"] == 2026
        assert body[0]["month"] == 1
        assert body[0]["active_members"] == 1.0
