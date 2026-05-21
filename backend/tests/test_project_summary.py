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


def test_project_ai_summary_calls_generate_group_summary(db_session: Session, monkeypatch):
    from app.api.endpoints import dashboard as dashboard_endpoint

    captured = {}

    async def fake_generate_group_summary(self, group_type, group_id, start_date, end_date, force_regenerate, dashboard_context=None, current_user=None):
        captured["group_type"] = group_type
        captured["group_id"] = group_id
        return {"project_summary": ["test"], "member_summary": [], "issues": [], "generated_at": "2026-03-20"}

    monkeypatch.setattr(dashboard_endpoint.SummaryService, "generate_group_summary", fake_generate_group_summary)

    proj = Project(id="PROJ_TEST", name="Test Project", category="PRODUCT")
    db_session.add(proj)
    db_session.commit()

    client = _make_test_client(db_session)
    _set_current_user()
    try:
        response = client.get("/api/dashboard/ai-summary/project/PROJ_TEST?period=weekly")
    finally:
        _clear(client)

    assert response.status_code == 200
    assert captured["group_type"] == "project"
    assert captured["group_id"] == "PROJ_TEST"
    assert "project_summary" in response.json()


def test_project_ai_summary_not_found(db_session: Session):
    client = _make_test_client(db_session)
    _set_current_user()
    try:
        response = client.get("/api/dashboard/ai-summary/project/NONEXISTENT?period=weekly")
    finally:
        _clear(client)

    assert response.status_code == 404


def test_project_ai_summary_history(db_session: Session, monkeypatch):
    from app.api.endpoints import dashboard as dashboard_endpoint

    captured = {}

    def fake_get_summary_history(self, scope, scope_id, limit, team_type=None):
        captured["scope"] = scope
        captured["scope_id"] = scope_id
        captured["team_type"] = team_type
        return []

    monkeypatch.setattr(dashboard_endpoint.SummaryService, "get_summary_history", fake_get_summary_history)

    proj = Project(id="PROJ_HIST", name="History Test", category="PRODUCT")
    db_session.add(proj)
    db_session.commit()

    client = _make_test_client(db_session)
    _set_current_user()
    try:
        response = client.get("/api/dashboard/ai-summary/project/PROJ_HIST/history?limit=5")
    finally:
        _clear(client)

    assert response.status_code == 200
    assert captured["scope"] == "team"
    assert captured["scope_id"] == "PROJ_HIST"
    assert captured["team_type"] == "project"


def test_team_ai_summary_backward_compat(db_session: Session, monkeypatch):
    from app.api.endpoints import dashboard as dashboard_endpoint

    captured = {}

    async def fake_generate_group_summary(self, group_type, group_id, start_date, end_date, force_regenerate, dashboard_context=None, current_user=None):
        captured["group_type"] = group_type
        captured["group_id"] = group_id
        return {"project_summary": [], "member_summary": [], "issues": []}

    monkeypatch.setattr(dashboard_endpoint.SummaryService, "generate_group_summary", fake_generate_group_summary)

    client = _make_test_client(db_session)
    _set_current_user()
    try:
        response = client.get("/api/dashboard/ai-summary/team?scope=department")
    finally:
        _clear(client)

    assert response.status_code == 200
    assert captured["group_type"] == "department"
    assert captured["group_id"] == "DEPT_A"


def test_project_ai_summary_force_regenerate(db_session: Session, monkeypatch):
    from app.api.endpoints import dashboard as dashboard_endpoint

    captured = {}

    async def fake_generate_group_summary(self, group_type, group_id, start_date, end_date, force_regenerate, dashboard_context=None, current_user=None):
        captured["force_regenerate"] = force_regenerate
        return {"project_summary": [], "member_summary": [], "issues": [], "generated_at": "2026-03-20"}

    monkeypatch.setattr(dashboard_endpoint.SummaryService, "generate_group_summary", fake_generate_group_summary)

    proj = Project(id="PROJ_FORCE", name="Force Test", category="PRODUCT")
    db_session.add(proj)
    db_session.commit()

    client = _make_test_client(db_session)
    _set_current_user()
    try:
        response = client.get("/api/dashboard/ai-summary/project/PROJ_FORCE?force_regenerate=true")
    finally:
        _clear(client)

    assert response.status_code == 200
    assert captured["force_regenerate"] is True
