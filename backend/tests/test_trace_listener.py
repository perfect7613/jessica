"""Tests for the JessicaTraceListener and the GET /runs/{id}/trace endpoint.

These tests do NOT fire real CrewAI events. They:
1. Verify the listener can be instantiated
2. Verify get_trace() / reset() behavior
3. Verify _serialize_event() produces the right dict shape
4. Verify that manually-appended events (what the event bus would append)
   flow through get_trace() correctly
5. Test the GET /api/runs/{run_id}/trace endpoint with a mocked Supabase client
"""
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Ensure backend/ is on the path
BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))


# ---------------------------------------------------------------------------
# JessicaTraceListener unit tests
# ---------------------------------------------------------------------------


def test_listener_can_be_instantiated():
    from app.agents.trace_listener import JessicaTraceListener

    listener = JessicaTraceListener()
    assert listener is not None
    assert isinstance(listener.events, list)
    assert listener.events == []
    assert listener._start_time == 0


def test_get_trace_returns_empty_list_initially():
    from app.agents.trace_listener import JessicaTraceListener

    listener = JessicaTraceListener()
    trace = listener.get_trace()
    assert trace == []
    assert isinstance(trace, list)


def test_reset_clears_events_and_start_time():
    from app.agents.trace_listener import JessicaTraceListener

    listener = JessicaTraceListener()
    # Simulate captured state
    listener.events.append({"event_type": "foo", "timestamp": "now", "elapsed_ms": 1})
    listener._start_time = time.time()

    assert len(listener.events) == 1
    assert listener._start_time != 0

    listener.reset()

    assert listener.events == []
    assert listener._start_time == 0
    assert listener.get_trace() == []


def test_manually_appending_events_flows_through_get_trace():
    """Simulate what event-bus handlers do: build and append serialized events."""
    from app.agents.trace_listener import JessicaTraceListener

    listener = JessicaTraceListener()
    listener._start_time = time.time()

    fake_event = MagicMock()
    entry1 = listener._serialize_event(
        "crew_kickoff_started", fake_event, {"crew_name": "test_crew"}
    )
    listener.events.append(entry1)

    entry2 = listener._serialize_event(
        "agent_execution_started", fake_event, {"agent_role": "General Counsel"}
    )
    listener.events.append(entry2)

    trace = listener.get_trace()
    assert len(trace) == 2
    assert trace[0]["event_type"] == "crew_kickoff_started"
    assert trace[0]["crew_name"] == "test_crew"
    assert trace[1]["event_type"] == "agent_execution_started"
    assert trace[1]["agent_role"] == "General Counsel"


def test_serialize_event_produces_required_fields():
    from app.agents.trace_listener import JessicaTraceListener

    listener = JessicaTraceListener()
    listener._start_time = time.time()

    fake_event = MagicMock()
    entry = listener._serialize_event(
        "task_started", fake_event, {"task_description": "Analyze clauses"}
    )

    # Required base fields
    assert "event_type" in entry
    assert "timestamp" in entry
    assert "elapsed_ms" in entry

    assert entry["event_type"] == "task_started"
    assert isinstance(entry["elapsed_ms"], int)
    assert entry["elapsed_ms"] >= 0

    # ISO-8601 UTC timestamp
    assert isinstance(entry["timestamp"], str)
    assert "T" in entry["timestamp"]
    # Either offset "+00:00" or "Z" — datetime.now(tz=utc).isoformat() returns "+00:00"
    assert entry["timestamp"].endswith("+00:00") or entry["timestamp"].endswith("Z")

    # Extra fields merged in
    assert entry["task_description"] == "Analyze clauses"


def test_serialize_event_elapsed_ms_zero_when_no_start_time():
    """Before crew_kickoff_started, _start_time is 0, so elapsed_ms must be 0."""
    from app.agents.trace_listener import JessicaTraceListener

    listener = JessicaTraceListener()
    assert listener._start_time == 0

    entry = listener._serialize_event("foo", MagicMock(), None)
    assert entry["elapsed_ms"] == 0


def test_serialize_event_without_extra_does_not_error():
    from app.agents.trace_listener import JessicaTraceListener

    listener = JessicaTraceListener()
    entry = listener._serialize_event("bare_event", MagicMock())
    assert entry["event_type"] == "bare_event"
    # Only the three base keys should be present
    assert set(entry.keys()) == {"event_type", "timestamp", "elapsed_ms"}


def test_elapsed_ms_grows_after_start_time_is_set():
    """After _start_time is set, elapsed_ms on a later event should be >= 0 and
    greater than an event captured immediately before a sleep."""
    from app.agents.trace_listener import JessicaTraceListener

    listener = JessicaTraceListener()
    listener._start_time = time.time()

    first = listener._serialize_event("a", MagicMock())
    time.sleep(0.02)  # 20ms
    second = listener._serialize_event("b", MagicMock())

    assert second["elapsed_ms"] >= first["elapsed_ms"]
    assert second["elapsed_ms"] >= 10  # at least ~10ms after a 20ms sleep


def test_module_level_singleton_exists():
    """The module exposes a `trace_listener` singleton."""
    from app.agents.trace_listener import JessicaTraceListener, trace_listener

    assert isinstance(trace_listener, JessicaTraceListener)


# ---------------------------------------------------------------------------
# GET /api/runs/{run_id}/trace endpoint tests
# ---------------------------------------------------------------------------


def _build_app_with_traces_router():
    from fastapi import FastAPI
    from app.routers.traces import router as traces_router

    app = FastAPI()
    app.include_router(traces_router, prefix="/api")
    return app


def _build_mock_supabase(data):
    """Build a MagicMock Supabase client whose chain returns `data`."""
    mock_response = MagicMock()
    mock_response.data = data

    mock_supabase = MagicMock()
    (
        mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value
    ) = mock_response
    return mock_supabase


def test_get_run_trace_returns_trace_when_present():
    app = _build_app_with_traces_router()

    trace_data = [
        {
            "event_type": "crew_kickoff_started",
            "timestamp": "2026-04-19T00:00:00+00:00",
            "elapsed_ms": 0,
            "crew_name": "nda_crew",
        },
        {
            "event_type": "crew_kickoff_completed",
            "timestamp": "2026-04-19T00:00:05+00:00",
            "elapsed_ms": 5000,
            "crew_name": "nda_crew",
            "output_preview": "done",
        },
    ]
    mock_supabase = _build_mock_supabase([{"crewai_trace": trace_data}])

    with patch(
        "app.routers.traces.get_supabase_client", return_value=mock_supabase
    ):
        client = TestClient(app)
        resp = client.get("/api/runs/abc-123/trace")

    assert resp.status_code == 200
    body = resp.json()
    assert body == {"trace": trace_data}


def test_get_run_trace_returns_empty_list_when_trace_is_null():
    app = _build_app_with_traces_router()

    mock_supabase = _build_mock_supabase([{"crewai_trace": None}])

    with patch(
        "app.routers.traces.get_supabase_client", return_value=mock_supabase
    ):
        client = TestClient(app)
        resp = client.get("/api/runs/abc-123/trace")

    assert resp.status_code == 200
    body = resp.json()
    assert body["trace"] == []
    assert "message" in body


def test_get_run_trace_returns_404_when_run_not_found():
    app = _build_app_with_traces_router()

    mock_supabase = _build_mock_supabase([])

    with patch(
        "app.routers.traces.get_supabase_client", return_value=mock_supabase
    ):
        client = TestClient(app)
        resp = client.get("/api/runs/does-not-exist/trace")

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Run not found"
