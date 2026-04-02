"""
Prompt templates for weekly report LLM summarization.

Supports two summarization levels:
- personal -> group (aggregate individual reports into sub-team/department/project summary)
- group -> team (aggregate sub-team summaries into department summary)
"""


def build_personal_to_group_prompt(
    reports: list[dict],
    group_name: str,
    existing_body: str = "",
) -> tuple[str, str]:
    """
    Build prompts to summarize personal weekly reports into a group/team report.

    Args:
        reports: List of dicts with keys:
                 - user_name: str
                 - content: str
                 - project_sections: list[{"project_name": str, "content": str}]
                 - explicit_plans: list[str | {"project_name": str, "content": str}]
                 Content is already truncated to 2000 chars.
        group_name: Name of the group/team being summarized (e.g., department or sub-team name).
        existing_body: Existing team report body to use as reference (optional).

    Returns:
        Tuple of (system_prompt, user_prompt).
    """
    system_prompt = """당신은 팀 관리자를 위한 주간 보고서 초안 작성 전문가입니다.

개인 주간 보고서들을 취합하여 팀 단위의 구조화된 주간 보고서 초안을 작성합니다.

## 작성 규칙
- 반드시 한국어로 작성하십시오.
- 아래 JSON 형식으로만 응답하십시오.
- 개인 보고서의 내용을 팀 관점에서 종합하되, 반드시 프로젝트 단위로 묶어서 작성하십시오.
- 사람별 나열보다 프로젝트별 묶음을 우선하십시오.
- 각 섹션은 bullet point 목록으로 작성하십시오.
- 진행 현황을 장황하게 풀기보다 완료된 산출물, 결정사항, 확인된 변경, 해결된 이슈 같은 객관적 결과를 우선 정리하십시오.
- 근거가 약한 추정 표현("예상", "보인다", "추정", "계획될 것으로")은 사용하지 마십시오.
- 입력에 없는 수치, 일정, 리스크, 향후 계획을 절대 만들어내지 마십시오.
- 향후 계획 섹션은 입력의 명시된 계획/남은 업무가 제공된 경우에만 포함하고, 없으면 섹션 자체를 생략하십시오.
- 프로젝트가 특정되지 않은 내용만 공통/미분류 섹션으로 정리하십시오.
- 존재하는 기존 보고서가 있다면 그것을 참고하여 내용을 보완하십시오.
- JSON 형식:
{
  "summary_markdown": "## 프로젝트별 주요 결과\\n### 프로젝트 A\\n- ...\\n\\n## 공통 운영/지원\\n- ...\\n\\n## 이슈/리스크\\n- ...\\n\\n## 향후 계획 (명시된 내용만)\\n- ..."
}"""

    project_map: dict[str, list[tuple[str, str]]] = {}
    common_entries: list[tuple[str, str]] = []
    explicit_plan_entries: list[tuple[str, str, str]] = []

    for report in reports:
        user_name = report.get("user_name", "Unknown")
        content = report.get("content", "").strip()

        project_sections = report.get("project_sections") or []
        if project_sections:
            for section in project_sections:
                project_name = (section.get("project_name") or "공통/미분류").strip() or "공통/미분류"
                section_content = (section.get("content") or "").strip()
                if not section_content:
                    continue
                project_map.setdefault(project_name, []).append((user_name, section_content))
        elif content:
            common_entries.append((user_name, content))

        for plan in report.get("explicit_plans") or []:
            if isinstance(plan, dict):
                project_name = (plan.get("project_name") or "공통/미분류").strip() or "공통/미분류"
                normalized_plan = str(plan.get("content") or "").strip()
            else:
                project_name = "공통/미분류"
                normalized_plan = str(plan).strip()
            if normalized_plan:
                explicit_plan_entries.append((user_name, project_name, normalized_plan))

    project_section_lines = []
    for project_name, entries in project_map.items():
        item_lines = [f"### {project_name}"]
        for entry_user_name, entry_content in entries:
            item_lines.append(f"- 작성자: {entry_user_name}")
            item_lines.append(entry_content)
        project_section_lines.append("\n".join(item_lines))

    if common_entries:
        common_lines = ["### 공통/미분류"]
        for entry_user_name, entry_content in common_entries:
            common_lines.append(f"- 작성자: {entry_user_name}")
            common_lines.append(entry_content)
        project_section_lines.append("\n".join(common_lines))

    project_section = "\n\n".join(project_section_lines) or "### 공통/미분류\n- 정리 가능한 내용 없음"

    explicit_plan_section = ""
    if explicit_plan_entries:
        plan_lines = ["## 명시된 향후 계획 / 남은 업무"]
        for user_name, project_name, plan in explicit_plan_entries:
            plan_lines.append(f"- [{project_name}] {user_name}: {plan}")
        explicit_plan_section = "\n\n" + "\n".join(plan_lines)

    reference_section = ""
    if existing_body and existing_body.strip():
        reference_section = f"\n\n## 기존 팀 보고서 (참고용)\n{existing_body.strip()}"

    user_prompt = f"""다음은 [{group_name}] 팀원들의 이번 주 개인 보고서입니다.
이 내용을 종합하여 팀 주간 보고서 초안을 작성해 주세요.{reference_section}

## 프로젝트별 근거 데이터 ({len(reports)}명)

{project_section}{explicit_plan_section}

위 근거 데이터를 종합하여 팀 관점의 주간 보고서 초안을 JSON 형식으로 작성해 주세요.
프로젝트별 주요 결과를 먼저 정리하고, 향후 계획은 '명시된 향후 계획 / 남은 업무' 블록에 있는 내용만 포함하십시오."""

    return system_prompt, user_prompt


def build_group_to_team_prompt(
    sub_team_summaries: list[dict],
    team_name: str,
    existing_body: str = "",
) -> tuple[str, str]:
    """
    Build prompts to aggregate sub-team summaries into a department-level report.

    Args:
        sub_team_summaries: List of {"sub_team_name": str, "summary": str} dicts.
        team_name: Name of the department/team being summarized.
        existing_body: Existing department report body to use as reference (optional).

    Returns:
        Tuple of (system_prompt, user_prompt).
    """
    system_prompt = """당신은 부서 관리자를 위한 주간 보고서 초안 작성 전문가입니다.

각 소그룹/파트의 주간 요약을 취합하여 부서 단위의 구조화된 주간 보고서 초안을 작성합니다.

## 작성 규칙
- 반드시 한국어로 작성하십시오.
- 아래 JSON 형식으로만 응답하십시오.
- 각 소그룹의 핵심 내용을 부서 관점에서 종합하되, 가능한 한 프로젝트 단위로 재구성하십시오.
- 사람/파트별 서술보다 프로젝트별 묶음과 객관적 결과를 우선하십시오.
- 각 섹션은 bullet point 목록으로 작성하십시오.
- 완료된 산출물, 결정사항, 확인된 변경, 해결된 이슈 중심으로 정리하십시오.
- 입력에 없는 수치, 일정, 리스크, 향후 계획을 절대 만들어내지 마십시오.
- 향후 계획 섹션은 입력에 명시된 경우에만 포함하고, 그렇지 않으면 생략하십시오.
- 중요한 이슈나 리스크는 빠짐없이 포함하되 과장하지 마십시오.
- 존재하는 기존 보고서가 있다면 그것을 참고하여 내용을 보완하십시오.
- JSON 형식:
{
  "summary_markdown": "## 프로젝트별 주요 결과\\n### 프로젝트 A\\n- ...\\n\\n## 공통 운영/지원\\n- ...\\n\\n## 이슈/리스크\\n- ...\\n\\n## 향후 계획 (명시된 내용만)\\n- ..."
}"""

    group_section_lines = []
    for group in sub_team_summaries:
        group_name = group.get("sub_team_name", "Unknown")
        summary = group.get("summary", "(요약 없음)")
        group_section_lines.append(f"### {group_name}\n{summary}")

    group_section = "\n\n".join(group_section_lines)

    reference_section = ""
    if existing_body and existing_body.strip():
        reference_section = f"\n\n## 기존 부서 보고서 (참고용)\n{existing_body.strip()}"

    user_prompt = f"""다음은 [{team_name}] 부서 내 각 소그룹/파트의 이번 주 요약입니다.
이 내용을 종합하여 부서 주간 보고서 초안을 작성해 주세요.{reference_section}

## 소그룹별 요약 ({len(sub_team_summaries)}개 그룹)

{group_section}

위 소그룹 요약들을 종합하여 부서 관점의 주간 보고서 초안을 JSON 형식으로 작성해 주세요."""

    return system_prompt, user_prompt
