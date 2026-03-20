from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.main import app
from app.models.project import Project


def _make_test_client(db_session: Session) -> TestClient:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _set_current_user():
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="user-1",
        role="USER",
        sub_team_id="TEAM_A",
        department_id="DEPT_A",
        primary_business_unit_id="BU_MAIN",
    )


def _clear(client: TestClient):
    client.close()
    app.dependency_overrides.clear()


def test_project_hierarchy_calls_service(db_session: Session, monkeypatch):
    """GET /api/weekly-reports/hierarchy/project calls get_project_hierarchy"""
    from app.api.endpoints import weekly_reports as wr_endpoint

    captured = {}

    def fake_get_project_hierarchy(self, project_id, reference_date=None):
        captured["project_id"] = project_id
        return {
            "project": {"id": project_id, "name": "Test", "category": "PRODUCT", "pm": None},
            "week_start": "2026-03-16", "week_end": "2026-03-22", "week_key": "2026-W12",
            "project_report": None, "members": [], "submitted_count": 0, "total_count": 0,
        }

    from app.services.weekly_report_service import WeeklyReportService
    monkeypatch.setattr(WeeklyReportService, "get_project_hierarchy", fake_get_project_hierarchy)

    client = _make_test_client(db_session)
    _set_current_user()
    try:
        response = client.get("/api/weekly-reports/hierarchy/project?project_id=PROJ_TEST")
    finally:
        _clear(client)

    assert response.status_code == 200
    assert captured["project_id"] == "PROJ_TEST"
    data = response.json()
    assert "project" in data
    assert "members" in data


def test_project_hierarchy_requires_project_id(db_session: Session):
    """GET /api/weekly-reports/hierarchy/project without project_id returns 422"""
    client = _make_test_client(db_session)
    _set_current_user()
    try:
        response = client.get("/api/weekly-reports/hierarchy/project")
    finally:
        _clear(client)

    assert response.status_code == 422


def test_project_hierarchy_requires_auth(db_session: Session):
    """GET /api/weekly-reports/hierarchy/project without auth returns 401"""
    client = _make_test_client(db_session)
    # Do NOT set current_user
    try:
        response = client.get("/api/weekly-reports/hierarchy/project?project_id=PROJ_TEST")
    finally:
        _clear(client)

    assert response.status_code == 401
