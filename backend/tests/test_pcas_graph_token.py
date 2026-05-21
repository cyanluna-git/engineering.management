"""
Unit tests for PCAS graph token threading (kanban #2881).

Covers:
- PCASClient._get_headers() includes 'user-graph-token' when token provided
- SummaryService._get_graph_token() returns None for non-PCAS providers
- SummaryService._get_graph_token() returns None when CalendarConnectionError raised
- generate_user_summary / generate_group_summary return friendly error dict (not 500)
  when current_user is None and provider is PCAS
"""

import asyncio
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from app.services.llm.pcas_client import PCASClient
from app.services.summary_service import SummaryService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(coro):
    return asyncio.run(coro)


def _make_pcas_client() -> PCASClient:
    """Create a PCASClient with minimal settings patched."""
    with patch("app.services.llm.pcas_client.settings") as mock_settings:
        mock_settings.PCAS_LLM_KEY = "test-token"
        mock_settings.PCAS_LLM_BASE_URL = "https://test.example.com/api"
        mock_settings.PCAS_LLM_MODEL = "gpt-5"
        mock_settings.PCAS_LLM_TIMEOUT = 10
        mock_settings.PCAS_LLM_VERIFY_SSL = True
        return PCASClient()


def _make_fake_user(email: str = "user@edwards.com") -> MagicMock:
    user = MagicMock()
    user.email = email
    return user


# ---------------------------------------------------------------------------
# PCASClient._get_headers
# ---------------------------------------------------------------------------

class TestPCASClientGetHeaders:
    """PCASClient._get_headers() — graph token injection."""

    def test_get_headers_without_token_omits_graph_header(self):
        """_get_headers() without token must NOT include 'user-graph-token'."""
        client = _make_pcas_client()
        headers = client._get_headers()
        assert "user-graph-token" not in headers

    def test_get_headers_with_token_includes_graph_header(self):
        """_get_headers(user_graph_token='abc') MUST include 'user-graph-token': 'abc'."""
        client = _make_pcas_client()
        headers = client._get_headers(user_graph_token="abc-graph-token")
        assert "user-graph-token" in headers
        assert headers["user-graph-token"] == "abc-graph-token"

    def test_get_headers_with_token_preserves_existing_headers(self):
        """Adding graph token must not remove ai-brains-token or User-Agent."""
        client = _make_pcas_client()
        headers = client._get_headers(user_graph_token="some-token")
        assert "ai-brains-token" in headers
        assert "User-Agent" in headers
        assert "Content-Type" in headers

    def test_get_headers_with_none_token_omits_graph_header(self):
        """Explicitly passing None must behave the same as omitting the argument."""
        client = _make_pcas_client()
        headers = client._get_headers(user_graph_token=None)
        assert "user-graph-token" not in headers


# ---------------------------------------------------------------------------
# PCASClient.generate / generate_json — token threading
# ---------------------------------------------------------------------------

class TestPCASClientTokenThreading:
    """Verify user_graph_token is forwarded to the HTTP call."""

    @pytest.mark.asyncio
    async def test_generate_sends_graph_token_in_headers(self):
        """generate() must pass user_graph_token to _get_headers, which adds it to the request."""
        client = _make_pcas_client()

        with patch.object(
            client,
            "_get_headers",
            wraps=client._get_headers,
        ) as spy:
            mock_response = MagicMock()
            mock_response.json.return_value = {"message": {"content": "ok"}}
            mock_response.raise_for_status = MagicMock()

            from unittest.mock import AsyncMock
            with patch("httpx.AsyncClient") as mock_cls:
                mock_http = AsyncMock()
                mock_http.post.return_value = mock_response
                mock_http.__aenter__ = AsyncMock(return_value=mock_http)
                mock_http.__aexit__ = AsyncMock(return_value=False)
                mock_cls.return_value = mock_http

                await client.generate(
                    "hello",
                    user_email="user@edwards.com",
                    user_graph_token="my-graph-token",
                )

            spy.assert_called_once_with(user_graph_token="my-graph-token")

    @pytest.mark.asyncio
    async def test_generate_json_forwards_graph_token_to_generate(self):
        """generate_json() must forward user_graph_token to generate()."""
        client = _make_pcas_client()

        called_with: dict = {}

        async def mock_generate(prompt, system_prompt=None, user_email=None, user_graph_token=None):
            called_with["user_graph_token"] = user_graph_token
            return '{"result": "ok"}'

        with patch.object(client, "generate", side_effect=mock_generate):
            await client.generate_json(
                "parse this",
                user_graph_token="forwarded-token",
            )

        assert called_with["user_graph_token"] == "forwarded-token"


# ---------------------------------------------------------------------------
# SummaryService._get_graph_token
# ---------------------------------------------------------------------------

class TestSummaryServiceGetGraphToken:
    """SummaryService._get_graph_token() behaviour for different providers."""

    def _make_service(self, client) -> SummaryService:
        db = MagicMock()
        return SummaryService(db, client=client)

    def test_returns_none_for_non_pcas_provider(self):
        """_get_graph_token() must return None when client is NOT PCASClient."""
        non_pcas_client = MagicMock()  # a Groq/Gemini-like stub
        # Ensure it's not an instance of PCASClient
        assert not isinstance(non_pcas_client, PCASClient)

        service = self._make_service(non_pcas_client)
        user = _make_fake_user()
        result = service._get_graph_token(user)
        assert result is None

    def test_returns_none_when_calendar_connection_error(self):
        """_get_graph_token() returns None when CalendarConnectionError is raised."""
        from app.services.graph_calendar_service import CalendarConnectionError

        pcas_client = _make_pcas_client()
        service = self._make_service(pcas_client)
        user = _make_fake_user()

        with patch(
            "app.services.summary_service.GraphCalendarService"
        ) as mock_graph_cls:
            mock_graph_instance = MagicMock()
            mock_graph_instance.refresh_graph_access_token.side_effect = CalendarConnectionError(
                "Calendar not connected"
            )
            mock_graph_cls.return_value = mock_graph_instance

            result = service._get_graph_token(user)

        assert result is None

    def test_returns_token_when_graph_service_succeeds(self):
        """_get_graph_token() returns the token string from GraphCalendarService."""
        pcas_client = _make_pcas_client()
        service = self._make_service(pcas_client)
        user = _make_fake_user()

        with patch(
            "app.services.summary_service.GraphCalendarService"
        ) as mock_graph_cls:
            mock_graph_instance = MagicMock()
            mock_graph_instance.refresh_graph_access_token.return_value = "real-graph-token"
            mock_graph_cls.return_value = mock_graph_instance

            result = service._get_graph_token(user)

        assert result == "real-graph-token"


# ---------------------------------------------------------------------------
# Friendly error when current_user is None (PCAS provider)
# ---------------------------------------------------------------------------

class TestSummaryServiceNoCurrentUser:
    """generate_*_summary() with PCAS client + no current_user returns friendly dict."""

    def _seed_worklog(self, db_session):
        """Seed minimal DB entities so worklogs are found."""
        from app.models.organization import Department, JobPosition, SubTeam
        from app.models.project import Project
        from app.models.resource import WorkLog
        from app.models.user import User
        from app.models.work_type import WorkTypeCategory

        position = JobPosition(id="POS_X", name="Eng", level=1, is_active=True)
        dept = Department(id="DEPT_X", name="D", code="DX", is_active=True)
        team = SubTeam(id="TEAM_X", department_id="DEPT_X", name="T", code="TX", is_active=True)
        user = User(
            id="user-x",
            email="x@e.com",
            hashed_password="h",
            name="X",
            korean_name="엑스",
            department_id="DEPT_X",
            sub_team_id="TEAM_X",
            position_id="POS_X",
            is_active=True,
        )
        project = Project(id="proj-x", name="ProjX", category="PRODUCT", status="InProgress")
        wtype = WorkTypeCategory(id=9, code="ENG", name="Engineering", level=1, is_active=True, project_required=True)
        db_session.add_all([position, dept, team, user, project, wtype])
        db_session.commit()

        worklog = WorkLog(
            date=date(2026, 2, 10),
            user_id="user-x",
            project_id="proj-x",
            work_type_category_id=9,
            hours=8.0,
            description="Some work",
        )
        db_session.add(worklog)
        db_session.commit()

    def test_generate_user_summary_no_current_user_returns_friendly_error(self, db_session):
        """generate_user_summary with PCAS client and no current_user returns friendly dict."""
        self._seed_worklog(db_session)
        pcas_client = _make_pcas_client()
        service = SummaryService(db_session, client=pcas_client)

        result = _run(
            service.generate_user_summary(
                user_id="user-x",
                start_date=date(2026, 2, 1),
                end_date=date(2026, 2, 28),
                current_user=None,
            )
        )

        assert "error" in result
        assert result["summary"]  # non-empty list — not a blank 500
        assert "PCAS" in result["summary"][0] or "unavailable" in result["summary"][0]
        assert "focus_areas" in result
        assert "workload_observations" in result

    def test_generate_group_summary_no_current_user_returns_friendly_error(self, db_session):
        """generate_group_summary with PCAS client and no current_user returns friendly dict."""
        self._seed_worklog(db_session)
        pcas_client = _make_pcas_client()
        service = SummaryService(db_session, client=pcas_client)

        result = _run(
            service.generate_group_summary(
                group_type="department",
                group_id="DEPT_X",
                start_date=date(2026, 2, 1),
                end_date=date(2026, 2, 28),
                current_user=None,
            )
        )

        assert "error" in result
        # Issues list carries the user-facing message
        assert result["issues"]
        assert "PCAS" in result["issues"][0] or "unavailable" in result["issues"][0]
        assert "analysis" in result
        assert "workload_observations" in result

    def test_generate_user_summary_with_calendar_error_proceeds_without_token(self, db_session):
        """When CalendarConnectionError is raised, summary still generates (graph_token=None)."""
        from app.services.graph_calendar_service import CalendarConnectionError

        self._seed_worklog(db_session)
        pcas_client = _make_pcas_client()
        service = SummaryService(db_session, client=pcas_client)

        called_with: dict = {}

        async def mock_generate_json(prompt, system_prompt=None, user_email=None, user_graph_token=None):
            called_with["user_graph_token"] = user_graph_token
            return {
                "focus_areas": ["Done"],
                "workload_observations": [],
                "risk_signals": [],
                "record_quality_notes": [],
            }

        fake_user = _make_fake_user()

        with patch(
            "app.services.summary_service.GraphCalendarService"
        ) as mock_graph_cls:
            mock_graph_instance = MagicMock()
            mock_graph_instance.refresh_graph_access_token.side_effect = CalendarConnectionError("no cal")
            mock_graph_cls.return_value = mock_graph_instance

            with patch.object(pcas_client, "generate_json", side_effect=mock_generate_json):
                result = _run(
                    service.generate_user_summary(
                        user_id="user-x",
                        start_date=date(2026, 2, 1),
                        end_date=date(2026, 2, 28),
                        current_user=fake_user,
                    )
                )

        # Must have called generate_json with graph_token=None (graceful degradation)
        assert called_with["user_graph_token"] is None
        # Must still return a valid response shape
        assert "focus_areas" in result
        assert "error" not in result
