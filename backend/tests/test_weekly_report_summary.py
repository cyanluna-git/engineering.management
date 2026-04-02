"""
Tests for WeeklyReportSummaryService.

Covers:
- Flat summarization path (department with no sub_teams)
- Hierarchical path (department with sub_teams)

Uses a mock LLM client to avoid real API calls.
"""

import pytest
from datetime import date
from unittest.mock import AsyncMock, MagicMock

from app.models.organization import Department, SubTeam
from app.models.user import User
from app.models.weekly_report import WeeklyReport
from app.prompts.weekly_report_summary import (
    build_group_to_team_prompt,
    build_personal_to_group_prompt,
)
from app.services.weekly_report_summary_service import WeeklyReportSummaryService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(db_session, *, user_id: str, name: str, position_id: str, department_id: str, sub_team_id: str | None = None) -> User:
    user = User(
        id=user_id,
        email=f"{user_id}@test.com",
        hashed_password="hashed",
        name=name,
        position_id=position_id,
        role="USER",
        department_id=department_id,
        sub_team_id=sub_team_id,
        is_active=True,
    )
    db_session.add(user)
    return user


def _make_report(
    db_session,
    *,
    owner_user_id: str,
    week_start: date,
    body: str,
    sections: list[dict] | None = None,
) -> WeeklyReport:
    from datetime import timedelta
    week_end = week_start + timedelta(days=6)
    report = WeeklyReport(
        id=f"rpt-{owner_user_id}-{week_start}",
        scope="user",
        team_scope_type=None,
        scope_id=owner_user_id,
        target_key=f"user:{owner_user_id}",
        week_start=week_start,
        week_end=week_end,
        week_key=str(week_start),
        status="published",
        markdown_body=body,
        sections=sections,
        owner_user_id=owner_user_id,
        created_by_user_id=owner_user_id,
        updated_by_user_id=owner_user_id,
    )
    db_session.add(report)
    return report


def _mock_llm_client(summary: str = "## Summary\n- Test summary") -> MagicMock:
    """Return a mock LLM client that returns a fixed summary."""
    mock = MagicMock()
    mock.generate_json = AsyncMock(return_value={"summary_markdown": summary})
    return mock


def _capturing_llm(summary: str, captured: dict) -> MagicMock:
    """Return a mock LLM client that captures the prompts it receives."""
    mock = MagicMock()

    async def _capture(user_prompt: str, system_prompt: str):
        captured["user_prompt"] = user_prompt
        captured["system_prompt"] = system_prompt
        return {"summary_markdown": summary}

    mock.generate_json = AsyncMock(side_effect=_capture)
    return mock


# ---------------------------------------------------------------------------
# Tests: flat summarization (department with NO sub_teams)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_flat_summarization_department_no_subteams(db_session, sample_department, sample_position):
    """
    When a department has no sub_teams, summarize personal reports directly.
    The LLM should be called exactly once (personal → group level).
    """
    week_start = date(2026, 3, 9)
    llm = _mock_llm_client("## Flat Summary\n- Done flat")

    # Create two users in the department (no sub_team)
    u1 = _make_user(db_session, user_id="fs-u1", name="Alice", position_id=sample_position.id, department_id=sample_department.id)
    u2 = _make_user(db_session, user_id="fs-u2", name="Bob", position_id=sample_position.id, department_id=sample_department.id)
    _make_report(db_session, owner_user_id="fs-u1", week_start=week_start, body="Alice's report")
    # Bob has no report → should appear in missing_members
    db_session.commit()

    # Admin user (passes permission check)
    admin = _make_user(db_session, user_id="fs-admin", name="Admin", position_id=sample_position.id, department_id=sample_department.id)
    admin.role = "ADMIN"
    db_session.commit()

    service = WeeklyReportSummaryService(db=db_session, llm_client=llm)
    result = await service.summarize_for_team(
        team_scope_type="department",
        scope_id=sample_department.id,
        week_start=week_start,
        current_user=admin,
        save_intermediate=False,
    )

    assert result["team_summary_markdown"] == "## Flat Summary\n- Done flat"
    assert result["personal_report_count"] == 1
    assert "Bob" in result["missing_members"]
    assert result["sub_team_summaries"] is None
    assert "Department" in result["scope_description"]

    # LLM called exactly once (personal → group)
    assert llm.generate_json.call_count == 1


# ---------------------------------------------------------------------------
# Tests: hierarchical path (department WITH sub_teams)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hierarchical_summarization_department_with_subteams(db_session, sample_department, sample_sub_team, sample_position):
    """
    When a department has sub_teams, the service should:
    1. Summarize each sub_team from personal reports (LLM call per sub_team).
    2. Aggregate sub_team summaries into a department summary (1 LLM call).
    """
    week_start = date(2026, 3, 9)
    llm = _mock_llm_client("## Hierarchical Summary\n- Aggregated")

    # Create user in the sub_team
    u1 = _make_user(
        db_session,
        user_id="hs-u1",
        name="Charlie",
        position_id=sample_position.id,
        department_id=sample_department.id,
        sub_team_id=sample_sub_team.id,
    )
    _make_report(db_session, owner_user_id="hs-u1", week_start=week_start, body="Charlie's report")
    db_session.commit()

    # Admin user
    admin = _make_user(db_session, user_id="hs-admin", name="Admin2", position_id=sample_position.id, department_id=sample_department.id)
    admin.role = "ADMIN"
    db_session.commit()

    service = WeeklyReportSummaryService(db=db_session, llm_client=llm)
    result = await service.summarize_for_team(
        team_scope_type="department",
        scope_id=sample_department.id,
        week_start=week_start,
        current_user=admin,
        save_intermediate=False,
    )

    # Two LLM calls: one for sub_team summary + one for department aggregation
    assert llm.generate_json.call_count == 2

    assert result["team_summary_markdown"] == "## Hierarchical Summary\n- Aggregated"
    assert result["personal_report_count"] == 1
    assert result["sub_team_summaries"] is not None
    assert len(result["sub_team_summaries"]) == 1
    st = result["sub_team_summaries"][0]
    assert st["sub_team_id"] == sample_sub_team.id
    assert st["sub_team_name"] == sample_sub_team.name
    assert st["member_count"] == 1
    assert "Department" in result["scope_description"]


# ---------------------------------------------------------------------------
# Tests: sub_team scope
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sub_team_scope_direct_summarization(db_session, sample_department, sample_sub_team, sample_position):
    """
    When team_scope_type='sub_team', summarize directly from personal reports.
    """
    week_start = date(2026, 3, 9)
    llm = _mock_llm_client("## SubTeam Summary\n- Done")

    u1 = _make_user(
        db_session,
        user_id="st-u1",
        name="Diana",
        position_id=sample_position.id,
        department_id=sample_department.id,
        sub_team_id=sample_sub_team.id,
    )
    _make_report(db_session, owner_user_id="st-u1", week_start=week_start, body="Diana's report")
    db_session.commit()

    # Admin user - no sub_team_id so they don't appear in member missing list
    admin = _make_user(db_session, user_id="st-admin", name="Admin3", position_id=sample_position.id, department_id=sample_department.id, sub_team_id=None)
    admin.role = "ADMIN"
    db_session.commit()

    service = WeeklyReportSummaryService(db=db_session, llm_client=llm)
    result = await service.summarize_for_team(
        team_scope_type="sub_team",
        scope_id=sample_sub_team.id,
        week_start=week_start,
        current_user=admin,
        save_intermediate=False,
    )

    assert llm.generate_json.call_count == 1
    assert result["team_summary_markdown"] == "## SubTeam Summary\n- Done"
    assert result["personal_report_count"] == 1
    assert result["missing_members"] == []
    assert result["sub_team_summaries"] is None
    assert "Sub-Team" in result["scope_description"]


# ---------------------------------------------------------------------------
# Tests: save_intermediate=True actually persists sub-team report
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_intermediate_calls_upsert(db_session, sample_department, sample_sub_team, sample_position):
    """
    When save_intermediate=True, after generating each sub-team summary the
    service must call report_service.upsert() to persist it to the database.
    """
    from unittest.mock import patch

    week_start = date(2026, 3, 9)
    llm = _mock_llm_client("## Saved Summary\n- Persisted")

    u1 = _make_user(
        db_session,
        user_id="si-u1",
        name="Eve",
        position_id=sample_position.id,
        department_id=sample_department.id,
        sub_team_id=sample_sub_team.id,
    )
    _make_report(db_session, owner_user_id="si-u1", week_start=week_start, body="Eve's report")
    db_session.commit()

    admin = _make_user(db_session, user_id="si-admin", name="Admin4", position_id=sample_position.id, department_id=sample_department.id)
    admin.role = "ADMIN"
    db_session.commit()

    service = WeeklyReportSummaryService(db=db_session, llm_client=llm)

    with patch.object(service.report_service, "upsert", wraps=service.report_service.upsert) as mock_upsert:
        result = await service.summarize_for_team(
            team_scope_type="sub_team",
            scope_id=sample_sub_team.id,
            week_start=week_start,
            current_user=admin,
            save_intermediate=True,
        )

    # upsert must have been called once for the sub-team
    mock_upsert.assert_called_once()
    call_kwargs = mock_upsert.call_args.kwargs
    assert call_kwargs["scope"] == "team"
    assert call_kwargs["team_scope_type"] == "sub_team"
    assert call_kwargs["scope_id"] == sample_sub_team.id
    assert call_kwargs["markdown_body"] == "## Saved Summary\n- Persisted"

    # Result is still correctly returned
    assert result["team_summary_markdown"] == "## Saved Summary\n- Persisted"


# ---------------------------------------------------------------------------
# Tests: 403 behavior — non-member cannot access another team's reports
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_target_raises_403_for_non_member(db_session, sample_department, sample_sub_team, sample_position):
    """
    A non-ADMIN user who does not belong to the requested sub-team should
    receive a 403 Forbidden when attempting to generate a summary.
    """
    from fastapi import HTTPException

    week_start = date(2026, 3, 9)
    llm = _mock_llm_client("## Should Not Be Generated")

    # Create an outsider user with no sub_team membership
    outsider = _make_user(
        db_session,
        user_id="403-outsider",
        name="Outsider",
        position_id=sample_position.id,
        department_id=sample_department.id,
        sub_team_id=None,
    )
    outsider.role = "USER"
    db_session.commit()

    service = WeeklyReportSummaryService(db=db_session, llm_client=llm)

    with pytest.raises(HTTPException) as exc_info:
        await service.summarize_for_team(
            team_scope_type="sub_team",
            scope_id=sample_sub_team.id,
            week_start=week_start,
            current_user=outsider,
            save_intermediate=False,
        )

    assert exc_info.value.status_code == 403
    # LLM should never be called — permission check happens before LLM invocation
    assert llm.generate_json.call_count == 0


def test_personal_prompt_requires_project_grouping_and_explicit_future_plan_only():
    """Prompt should require project-grouped, result-centered summaries."""
    system_prompt, user_prompt = build_personal_to_group_prompt(
        reports=[
            {
                "user_name": "Alice",
                "project_sections": [
                    {"project_name": "Project Alpha", "content": "- 설계 변경표 작성 완료"},
                ],
                "explicit_plans": [{"project_name": "Project Alpha", "content": "고객 검토 대응"}],
            }
        ],
        group_name="Electrical",
    )

    assert "반드시 프로젝트 단위로 묶어서 작성" in system_prompt
    assert "완료된 산출물, 결정사항, 확인된 변경" in system_prompt
    assert "향후 계획 섹션은 입력의 명시된 계획/남은 업무가 제공된 경우에만" in system_prompt
    assert "입력에 없는 수치, 일정, 리스크, 향후 계획을 절대 만들어내지 마십시오" in system_prompt
    assert "## 프로젝트별 근거 데이터" in user_prompt
    assert "### Project Alpha" in user_prompt
    assert "## 명시된 향후 계획 / 남은 업무" in user_prompt


def test_group_prompt_requires_project_regrouping_and_no_invented_plans():
    """Department aggregation prompt should preserve project-centered rules."""
    system_prompt, user_prompt = build_group_to_team_prompt(
        sub_team_summaries=[
            {
                "sub_team_name": "Team A",
                "summary": "## 프로젝트별 주요 결과\n### Project Alpha\n- 설계 변경표 작성 완료",
            }
        ],
        team_name="Engineering",
    )

    assert "가능한 한 프로젝트 단위로 재구성" in system_prompt
    assert "입력에 없는 수치, 일정, 리스크, 향후 계획을 절대 만들어내지 마십시오" in system_prompt
    assert "향후 계획 섹션은 입력에 명시된 경우에만 포함" in system_prompt
    assert "## 소그룹별 요약" in user_prompt
    assert "### Team A" in user_prompt


@pytest.mark.asyncio
async def test_sub_team_prompt_groups_reports_by_project_and_separates_explicit_plans(
    db_session,
    sample_department,
    sample_sub_team,
    sample_position,
):
    """Structured report sections should be regrouped by project before LLM summarization."""
    week_start = date(2026, 3, 9)
    captured: dict[str, str] = {}
    llm = _capturing_llm("## Structured Summary\n- Done", captured)

    _make_user(
        db_session,
        user_id="grp-u1",
        name="Alice",
        position_id=sample_position.id,
        department_id=sample_department.id,
        sub_team_id=sample_sub_team.id,
    )
    _make_user(
        db_session,
        user_id="grp-u2",
        name="Bob",
        position_id=sample_position.id,
        department_id=sample_department.id,
        sub_team_id=sample_sub_team.id,
    )
    _make_report(
        db_session,
        owner_user_id="grp-u1",
        week_start=week_start,
        body="",
        sections=[
            {
                "project_id": "PROJ_ALPHA",
                "project_name": "Project Alpha",
                "body": "## 주요 활동\n- 설계 변경표 작성 완료\n## 다음 주 계획\n- 고객 검토 대응",
            },
            {
                "project_id": "PROJ_BETA",
                "project_name": "Project Beta",
                "body": "- IO List 작성 완료",
            },
        ],
    )
    _make_report(
        db_session,
        owner_user_id="grp-u2",
        week_start=week_start,
        body="## 주요 활동\n- 공용 템플릿 정비 완료\n## 이번 주 남은 업무\n- 배포 확인",
    )
    db_session.commit()

    admin = _make_user(
        db_session,
        user_id="grp-admin",
        name="Admin5",
        position_id=sample_position.id,
        department_id=sample_department.id,
    )
    admin.role = "ADMIN"
    db_session.commit()

    service = WeeklyReportSummaryService(db=db_session, llm_client=llm)
    result = await service.summarize_for_team(
        team_scope_type="sub_team",
        scope_id=sample_sub_team.id,
        week_start=week_start,
        current_user=admin,
        save_intermediate=False,
    )

    assert result["team_summary_markdown"] == "## Structured Summary\n- Done"
    assert result["personal_report_count"] == 2
    assert "### Project Alpha" in captured["user_prompt"]
    assert "### Project Beta" in captured["user_prompt"]
    assert "### 공통/미분류" in captured["user_prompt"]
    assert "설계 변경표 작성 완료" in captured["user_prompt"]
    assert "IO List 작성 완료" in captured["user_prompt"]
    assert "공용 템플릿 정비 완료" in captured["user_prompt"]
    assert "## 명시된 향후 계획 / 남은 업무" in captured["user_prompt"]
    assert "[Project Alpha] Alice: 고객 검토 대응" in captured["user_prompt"]
    assert "[공통/미분류] Bob: 배포 확인" in captured["user_prompt"]
    assert "## 다음 주 계획" not in captured["user_prompt"]
    assert "## 이번 주 남은 업무" not in captured["user_prompt"]
