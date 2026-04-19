"""Tests for FastAPI endpoints with mocked Supabase and CrewAI."""

import io
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import FlaggedClause, NDAAnalysisOutput


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_NDA_TEXT = "# Non-Disclosure Agreement\nThis is a sample NDA for testing."

SAMPLE_CLAUSE = FlaggedClause(
    original_text="The Receiving Party shall not disclose...",
    risk_level="red",
    clause_type="non-compete",
    explanation="Overly broad non-compete with no time limit",
    citation="Section 27, Indian Contract Act 1872",
    reference_section="Section 3.2 - Non-Compete Analysis",
)

SAMPLE_ANALYSIS = NDAAnalysisOutput(
    clauses=[SAMPLE_CLAUSE],
    summary="This NDA contains a problematic non-compete clause.",
    red_flags=1,
    yellow_flags=0,
    green_flags=0,
)

FAKE_RUN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


def _make_mock_supabase():
    """Build a mock Supabase client that chains .table().select().eq() etc."""
    mock_client = MagicMock()

    # Each chained call returns the same chain object so we can
    # configure .execute() at the end of any chain.
    chain = MagicMock()
    chain.execute.return_value = MagicMock(data=[])

    # .table() returns a new chain each time, but we'll override per-test
    mock_client.table.return_value = chain
    chain.insert.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain

    return mock_client, chain


@pytest.fixture()
def client():
    """FastAPI TestClient with mocked Supabase."""
    mock_sb, _chain = _make_mock_supabase()
    with patch("app.routers.analysis.get_supabase_client", return_value=mock_sb):
        yield TestClient(app)


@pytest.fixture()
def client_and_supabase():
    """Return both TestClient and the mock Supabase client for assertions."""
    mock_sb, chain = _make_mock_supabase()
    with patch("app.routers.analysis.get_supabase_client", return_value=mock_sb):
        yield TestClient(app), mock_sb, chain


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestHealthEndpoint:
    def test_health_endpoint(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


class TestAnalyzeEndpoint:
    @patch("app.routers.analysis.uuid.uuid4", return_value=FAKE_RUN_ID)
    def test_analyze_endpoint_accepts_markdown(self, _mock_uuid, client_and_supabase):
        test_client, mock_sb, chain = client_and_supabase

        with patch(
            "app.agents.crew.analyze_nda_multi_agent",
            return_value=(SAMPLE_ANALYSIS, [{"event_type": "crew_kickoff_started"}]),
        ):
            file_content = SAMPLE_NDA_TEXT.encode("utf-8")
            response = test_client.post(
                "/api/analyze",
                files={"file": ("contract.md", io.BytesIO(file_content), "text/markdown")},
            )

        assert response.status_code == 200
        data = response.json()
        assert "run_id" in data
        assert "analysis" in data
        assert data["analysis"]["red_flags"] == 1
        assert data["analysis"]["summary"] == SAMPLE_ANALYSIS.summary

        # Verify Supabase insert was called
        mock_sb.table.assert_any_call("runs")
        chain.insert.assert_called_once()

    def test_analyze_endpoint_rejects_invalid_file(self, client):
        response = client.post(
            "/api/analyze",
            files={"file": ("image.jpg", io.BytesIO(b"fake image"), "image/jpeg")},
        )
        assert response.status_code == 400
        assert "markdown" in response.json()["detail"].lower()

    def test_analyze_endpoint_rejects_empty_file(self, client):
        response = client.post(
            "/api/analyze",
            files={"file": ("empty.md", io.BytesIO(b""), "text/markdown")},
        )
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()


class TestRunsEndpoints:
    def test_list_runs_endpoint(self, client_and_supabase):
        test_client, mock_sb, chain = client_and_supabase
        chain.execute.return_value = MagicMock(
            data=[
                {
                    "id": FAKE_RUN_ID,
                    "created_at": "2025-01-01T00:00:00Z",
                    "red_flags": 1,
                    "yellow_flags": 0,
                    "green_flags": 0,
                    "summary": "Test summary",
                }
            ]
        )

        response = test_client.get("/api/runs")
        assert response.status_code == 200
        data = response.json()
        assert "runs" in data
        assert len(data["runs"]) == 1
        assert data["runs"][0]["id"] == FAKE_RUN_ID

    def test_get_run_endpoint(self, client_and_supabase):
        test_client, mock_sb, chain = client_and_supabase
        chain.execute.return_value = MagicMock(
            data=[
                {
                    "id": FAKE_RUN_ID,
                    "input_text": SAMPLE_NDA_TEXT,
                    "red_flags": 1,
                    "yellow_flags": 0,
                    "green_flags": 0,
                    "summary": "Test summary",
                    "full_output": SAMPLE_ANALYSIS.model_dump(),
                }
            ]
        )

        response = test_client.get(f"/api/runs/{FAKE_RUN_ID}")
        assert response.status_code == 200
        data = response.json()
        assert "run" in data
        assert data["run"]["id"] == FAKE_RUN_ID

    def test_get_run_not_found(self, client_and_supabase):
        test_client, mock_sb, chain = client_and_supabase
        chain.execute.return_value = MagicMock(data=[])

        response = test_client.get("/api/runs/nonexistent-id")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestAnnotationEndpoints:
    def test_annotate_run(self, client_and_supabase):
        test_client, mock_sb, chain = client_and_supabase

        # First call (select to verify run exists) returns data;
        # second call (insert) returns data too.
        chain.execute.return_value = MagicMock(data=[{"id": FAKE_RUN_ID}])

        response = test_client.post(
            f"/api/runs/{FAKE_RUN_ID}/annotate",
            json={"rating": 4, "note": "Good analysis"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

        # Verify insert was called on annotations table
        mock_sb.table.assert_any_call("annotations")

    def test_get_annotations(self, client_and_supabase):
        test_client, mock_sb, chain = client_and_supabase
        chain.execute.return_value = MagicMock(
            data=[
                {
                    "id": "ann-1",
                    "run_id": FAKE_RUN_ID,
                    "rating": 4,
                    "note": "Good analysis",
                }
            ]
        )

        response = test_client.get(f"/api/runs/{FAKE_RUN_ID}/annotations")
        assert response.status_code == 200
        data = response.json()
        assert "annotations" in data
        assert len(data["annotations"]) == 1
        assert data["annotations"][0]["rating"] == 4
