"""
Meeting import helpers for converting Microsoft calendar events into worklog drafts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models.internal_io import InternalIO
from app.models.project import Project
from app.models.resource import WorkLog
from app.models.user import User
from app.models.work_type import WorkTypeCategory
from app.schemas.worklog import (
    MeetingImportCommitItem,
    MeetingImportCommitResponse,
    MeetingImportDraft,
    MeetingImportPreviewResponse,
    WorkLog as WorkLogResponse,
)
from app.services.graph_calendar_service import GraphCalendarService
from app.services.keyword_mappings import get_project_code_by_keyword, get_worktype_code_by_keyword
from app.services.text_preprocessor import text_preprocessor
from app.services.worklog_service import WorkLogService
from app.utils import get_io_number


@dataclass
class _ResolvedProject:
    project: Optional[Project]
    keyword: Optional[str]


@dataclass
class _ResolvedWorkType:
    work_type: Optional[WorkTypeCategory]
    keyword: Optional[str]


class MeetingImportService:
    """Build meeting import previews and persist confirmed drafts."""

    MIN_DURATION_MINUTES = 15
    EXCLUDED_SUBJECT_KEYWORDS = (
        "focus time",
        "lunch",
        "out of office",
        "ooo",
        "commute",
    )

    def __init__(self, db: Session):
        self.db = db
        self.worklog_service = WorkLogService(db)
        self.graph_calendar_service = GraphCalendarService(db)

    @staticmethod
    def _parse_graph_datetime(value: dict | None) -> datetime | None:
        if not value:
            return None
        raw = value.get("dateTime")
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None

    @classmethod
    def _is_importable_event(cls, event: dict) -> bool:
        subject = (event.get("subject") or "").strip().lower()
        if not event.get("id"):
            return False
        if event.get("isCancelled"):
            return False
        if event.get("isAllDay"):
            return False
        if event.get("type") == "seriesMaster":
            return False
        if event.get("showAs") == "free":
            return False
        if any(keyword in subject for keyword in cls.EXCLUDED_SUBJECT_KEYWORDS):
            return False

        start_at = cls._parse_graph_datetime(event.get("start"))
        end_at = cls._parse_graph_datetime(event.get("end"))
        if not start_at or not end_at or end_at <= start_at:
            return False

        duration_minutes = (end_at - start_at).total_seconds() / 60
        return duration_minutes >= cls.MIN_DURATION_MINUTES

    def _existing_import_map(self, user_id: str, start_date: date, end_date: date) -> dict[str, WorkLog]:
        rows = (
            self.db.query(WorkLog)
            .filter(
                WorkLog.user_id == user_id,
                WorkLog.external_source == GraphCalendarService.EXTERNAL_SOURCE,
                WorkLog.external_event_id.isnot(None),
                WorkLog.date >= start_date,
                WorkLog.date <= end_date,
            )
            .all()
        )
        return {
            row.external_event_id: row
            for row in rows
            if row.external_event_id
        }

    def _resolve_project(self, normalized_subject: str) -> _ResolvedProject:
        project_code = get_project_code_by_keyword(normalized_subject)
        if not project_code:
            return _ResolvedProject(project=None, keyword=None)

        project = (
            self.db.query(Project)
            .options(joinedload(Project.internal_io))
            .join(InternalIO, Project.internal_io_id == InternalIO.id)
            .filter(InternalIO.io_number == project_code)
            .order_by(Project.updated_at.desc())
            .first()
        )
        return _ResolvedProject(project=project, keyword=project_code)

    def _resolve_work_type(self, normalized_subject: str) -> _ResolvedWorkType:
        raw_code = get_worktype_code_by_keyword(normalized_subject)
        candidate_codes: list[str] = []
        if raw_code:
            candidate_codes.append(raw_code)
            if raw_code.startswith("PRJ-MTG"):
                candidate_codes.append(raw_code.replace("PRJ-MTG", "MTG", 1))
        candidate_codes.extend(["MTG", "PRJ-MTG"])

        seen: set[str] = set()
        deduped_codes = []
        for code in candidate_codes:
            if code and code not in seen:
                deduped_codes.append(code)
                seen.add(code)

        for code in deduped_codes:
            work_type = (
                self.db.query(WorkTypeCategory)
                .filter(
                    WorkTypeCategory.code == code,
                    WorkTypeCategory.is_active == True,
                )
                .first()
            )
            if work_type:
                return _ResolvedWorkType(work_type=work_type, keyword=code)

        fallback = (
            self.db.query(WorkTypeCategory)
            .filter(WorkTypeCategory.is_active == True)
            .filter(
                (WorkTypeCategory.name.ilike("%meeting%"))
                | (WorkTypeCategory.name_ko.ilike("%회의%"))
                | (WorkTypeCategory.name_ko.ilike("%미팅%"))
            )
            .order_by(WorkTypeCategory.level.desc(), WorkTypeCategory.id.asc())
            .first()
        )
        return _ResolvedWorkType(work_type=fallback, keyword=raw_code)

    @staticmethod
    def _event_description(subject: str, location: str | None) -> str:
        subject = (subject or "").strip() or "(No subject)"
        location = (location or "").strip()
        if location:
            return f"{subject} [{location}]"
        return subject

    @staticmethod
    def _serialize_worklog(worklog: WorkLog) -> WorkLogResponse:
        return WorkLogResponse.model_validate(
            {
                "id": worklog.id,
                "date": worklog.date,
                "user_id": worklog.user_id,
                "project_id": worklog.project_id,
                "product_line_id": worklog.product_line_id,
                "work_type_category_id": worklog.work_type_category_id,
                "hours": worklog.hours,
                "description": worklog.description,
                "is_sudden_work": worklog.is_sudden_work,
                "is_business_trip": worklog.is_business_trip,
                "external_source": worklog.external_source,
                "external_event_id": worklog.external_event_id,
                "created_at": worklog.created_at,
                "updated_at": worklog.updated_at,
                "project_code": get_io_number(worklog.project) if worklog.project else None,
                "project_name": worklog.project.name if worklog.project else None,
                "project": worklog.project,
                "work_type_category": worklog.work_type_category,
            }
        )

    def preview(self, *, user: User, start_date: date, end_date: date) -> MeetingImportPreviewResponse:
        if end_date < start_date:
            raise ValueError("end_date must be on or after start_date")

        events = self.graph_calendar_service.list_calendar_events(
            user=user,
            start_date=start_date,
            end_date=end_date,
        )
        existing_map = self._existing_import_map(user.id, start_date, end_date)

        drafts: list[MeetingImportDraft] = []
        skipped_count = 0

        for event in events:
            if not self._is_importable_event(event):
                skipped_count += 1
                continue

            start_at = self._parse_graph_datetime(event.get("start"))
            end_at = self._parse_graph_datetime(event.get("end"))
            if not start_at or not end_at:
                skipped_count += 1
                continue

            subject = (event.get("subject") or "").strip() or "(No subject)"
            location_name = ((event.get("location") or {}).get("displayName") or "").strip() or None
            normalized_subject = text_preprocessor.normalize(subject)
            resolved_project = self._resolve_project(normalized_subject)
            resolved_work_type = self._resolve_work_type(normalized_subject)
            existing_worklog = existing_map.get(event["id"])

            drafts.append(
                MeetingImportDraft(
                    external_source=GraphCalendarService.EXTERNAL_SOURCE,
                    external_event_id=event["id"],
                    subject=subject,
                    date=start_at.date(),
                    start_at=start_at,
                    end_at=end_at,
                    hours=round((end_at - start_at).total_seconds() / 3600, 2),
                    description=self._event_description(subject, location_name),
                    location=location_name,
                    attendee_count=len(event.get("attendees") or []),
                    online_meeting=bool(event.get("onlineMeetingProvider")),
                    project_id=resolved_project.project.id if resolved_project.project else None,
                    project_code=get_io_number(resolved_project.project) if resolved_project.project else None,
                    project_name=resolved_project.project.name if resolved_project.project else None,
                    work_type_category_id=resolved_work_type.work_type.id if resolved_work_type.work_type else None,
                    work_type_category_code=resolved_work_type.work_type.code if resolved_work_type.work_type else None,
                    work_type_category_name=(
                        resolved_work_type.work_type.name_ko or resolved_work_type.work_type.name
                        if resolved_work_type.work_type
                        else None
                    ),
                    matched_project_keyword=resolved_project.keyword,
                    matched_work_type_keyword=resolved_work_type.keyword,
                    already_imported=existing_worklog is not None,
                    existing_worklog_id=existing_worklog.id if existing_worklog else None,
                )
            )

        drafts.sort(key=lambda item: (item.date, item.start_at, item.subject.lower()))
        return MeetingImportPreviewResponse(items=drafts, skipped_count=skipped_count)

    def commit(self, *, user: User, items: list[MeetingImportCommitItem]) -> MeetingImportCommitResponse:
        created: list[WorkLog] = []
        skipped_existing = 0

        for item in items:
            if item.work_type_category_id is None:
                raise ValueError("work_type_category_id is required to save imported meetings")
            existing = (
                self.db.query(WorkLog)
                .options(
                    joinedload(WorkLog.project),
                    joinedload(WorkLog.work_type_category),
                )
                .filter(
                    WorkLog.user_id == user.id,
                    WorkLog.external_source == GraphCalendarService.EXTERNAL_SOURCE,
                    WorkLog.external_event_id == item.external_event_id,
                )
                .first()
            )
            if existing:
                skipped_existing += 1
                continue

            self.worklog_service.validate_daily_hours(user.id, item.date, item.hours)

            worklog = WorkLog(
                date=item.date,
                user_id=user.id,
                project_id=item.project_id,
                work_type_category_id=item.work_type_category_id,
                hours=item.hours,
                description=item.description,
                is_sudden_work=item.is_sudden_work,
                is_business_trip=item.is_business_trip,
                external_source=GraphCalendarService.EXTERNAL_SOURCE,
                external_event_id=item.external_event_id,
            )
            self.db.add(worklog)
            created.append(worklog)

        if created:
            self.db.commit()
            for worklog in created:
                self.db.refresh(worklog)
        else:
            self.db.rollback()

        return MeetingImportCommitResponse(
            created=[self._serialize_worklog(worklog) for worklog in created],
            skipped_existing=skipped_existing,
        )
