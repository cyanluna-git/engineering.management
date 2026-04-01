from datetime import date, datetime
from types import SimpleNamespace

from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.main import app
from app.models.internal_io import InternalIO
from app.models.project import Project
from app.models.resource import WorkLog
from app.models.user import User
from app.models.work_type import WorkTypeCategory
from app.services.meeting_import_service import MeetingImportService


def _make_client(db_session: Session) -> TestClient:
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _clear_overrides(client: TestClient):
    client.close()
    app.dependency_overrides.clear()


def _seed_user(db_session: Session, sample_position) -> User:
    user = User(
        id="user-meeting-import",
        email="meeting.import@edwards.com",
        hashed_password="not-used",
        name="Meeting Importer",
        position_id=sample_position.id,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _seed_project(db_session: Session) -> Project:
    internal_io = InternalIO(
        id="io-oqc",
        io_number="888888-160",
        name="OQC Digitalization Infrastructure",
        is_active=True,
    )
    project = Project(
        id="project-oqc",
        internal_io_id=internal_io.id,
        name="OQC Digitalization Infrastructure",
        status="InProgress",
    )
    db_session.add(internal_io)
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def _seed_work_type(db_session: Session, *, work_type_id: int, code: str, name: str, name_ko: str) -> WorkTypeCategory:
    work_type = WorkTypeCategory(
        id=work_type_id,
        code=code,
        name=name,
        name_ko=name_ko,
        level=2,
        is_active=True,
        project_required=False,
    )
    db_session.add(work_type)
    db_session.commit()
    db_session.refresh(work_type)
    return work_type


def test_meeting_import_preview_maps_project_work_type_and_existing_items(
    db_session: Session,
    sample_position,
    monkeypatch,
):
    user = _seed_user(db_session, sample_position)
    _seed_project(db_session)
    _seed_work_type(
        db_session,
        work_type_id=100,
        code="MTG-UPD",
        name="Periodic Updates",
        name_ko="정기 점검",
    )

    existing = WorkLog(
        date=date(2026, 4, 1),
        user_id=user.id,
        project_id="project-oqc",
        work_type_category_id=100,
        hours=1.0,
        description="Existing import",
        external_source="microsoft_calendar",
        external_event_id="evt-existing",
    )
    db_session.add(existing)
    db_session.commit()
    db_session.refresh(existing)

    events = [
        {
            "id": "evt-existing",
            "subject": "OQC weekly meeting",
            "start": {"dateTime": "2026-04-01T09:00:00"},
            "end": {"dateTime": "2026-04-01T10:00:00"},
            "attendees": [{"emailAddress": {"address": "a@edwards.com"}}],
            "onlineMeetingProvider": "teamsForBusiness",
            "location": {"displayName": "Room A"},
            "isCancelled": False,
            "isAllDay": False,
            "type": "singleInstance",
            "showAs": "busy",
        },
        {
            "id": "evt-new",
            "subject": "OQC weekly meeting",
            "start": {"dateTime": "2026-04-02T09:30:00"},
            "end": {"dateTime": "2026-04-02T10:15:00"},
            "attendees": [{"emailAddress": {"address": "b@edwards.com"}}],
            "onlineMeetingProvider": "teamsForBusiness",
            "location": {"displayName": "Teams"},
            "isCancelled": False,
            "isAllDay": False,
            "type": "singleInstance",
            "showAs": "busy",
        },
        {
            "id": "evt-skip",
            "subject": "Focus Time",
            "start": {"dateTime": "2026-04-02T13:00:00"},
            "end": {"dateTime": "2026-04-02T14:00:00"},
            "attendees": [],
            "onlineMeetingProvider": None,
            "location": {"displayName": ""},
            "isCancelled": False,
            "isAllDay": False,
            "type": "singleInstance",
            "showAs": "busy",
        },
    ]

    monkeypatch.setattr(
        "app.services.meeting_import_service.GraphCalendarService.list_calendar_events",
        lambda self, *, user, start_date, end_date: events,
    )

    response = MeetingImportService(db_session).preview(
        user=user,
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 3),
    )

    assert response.skipped_count == 1
    assert len(response.items) == 2

    existing_item = next(item for item in response.items if item.external_event_id == "evt-existing")
    assert existing_item.already_imported is True
    assert existing_item.existing_worklog_id == existing.id

    new_item = next(item for item in response.items if item.external_event_id == "evt-new")
    assert new_item.project_id == "project-oqc"
    assert new_item.project_code == "888888-160"
    assert new_item.work_type_category_code == "MTG-UPD"
    assert new_item.hours == 0.75


def test_meeting_import_commit_creates_worklogs_and_skips_duplicates(
    db_session: Session,
    sample_position,
):
    user = _seed_user(db_session, sample_position)
    _seed_work_type(
        db_session,
        work_type_id=101,
        code="MTG",
        name="Meeting & Collaboration",
        name_ko="미팅/협업",
    )

    service = MeetingImportService(db_session)
    first_result = service.commit(
        user=user,
        items=[
            SimpleNamespace(
                external_event_id="evt-commit",
                date=date(2026, 4, 3),
                hours=1.5,
                description="Customer sync",
                project_id=None,
                work_type_category_id=101,
                is_sudden_work=False,
                is_business_trip=False,
            )
        ],
    )

    assert first_result.skipped_existing == 0
    assert len(first_result.created) == 1
    assert first_result.created[0].external_event_id == "evt-commit"

    second_result = service.commit(
        user=user,
        items=[
            SimpleNamespace(
                external_event_id="evt-commit",
                date=date(2026, 4, 3),
                hours=1.5,
                description="Customer sync",
                project_id=None,
                work_type_category_id=101,
                is_sudden_work=False,
                is_business_trip=False,
            )
        ],
    )

    assert second_result.skipped_existing == 1
    assert len(second_result.created) == 0
    assert (
        db_session.query(WorkLog)
        .filter(WorkLog.external_event_id == "evt-commit")
        .count()
        == 1
    )


def test_meeting_import_preview_endpoint_requires_calendar_connection(
    db_session: Session,
    sample_position,
):
    user = _seed_user(db_session, sample_position)
    client = _make_client(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    try:
        response = client.post(
            "/api/worklogs/meeting-import/preview",
            json={"start_date": "2026-04-01", "end_date": "2026-04-03"},
        )
    finally:
        _clear_overrides(client)

    assert response.status_code == status.HTTP_409_CONFLICT
    assert "Calendar" in response.json()["detail"]
