import time
from datetime import datetime, timezone
from typing import List, Dict, Any
from crewai.events import (
    CrewKickoffStartedEvent,
    CrewKickoffCompletedEvent,
    AgentExecutionStartedEvent,
    AgentExecutionCompletedEvent,
    TaskStartedEvent,
    TaskCompletedEvent,
    ToolUsageStartedEvent,
    ToolUsageFinishedEvent,
    BaseEventListener,
)


class JessicaTraceListener(BaseEventListener):
    """Captures CrewAI execution events for observability and storage in Supabase."""

    def __init__(self):
        super().__init__()
        self.events: List[Dict[str, Any]] = []
        self._start_time: float = 0

    @staticmethod
    def _extract_agent_role(event: Any) -> str:
        """Extract agent role from event using multiple fallback strategies."""
        # 1. Direct agent_role field (most reliable)
        role = getattr(event, "agent_role", None)
        if role and role != "unknown":
            return role

        # 2. agent_key field (sometimes set when agent_role isn't)
        key = getattr(event, "agent_key", None)
        if key and key != "unknown":
            return key

        # 3. Nested agent object with .role
        agent = getattr(event, "agent", None)
        if agent:
            r = getattr(agent, "role", None)
            if r:
                return r

        # 4. from_agent field (used in delegation events)
        from_agent = getattr(event, "from_agent", None)
        if from_agent:
            r = getattr(from_agent, "role", None) if hasattr(from_agent, "role") else str(from_agent)
            if r:
                return r

        # 5. source_type as last resort
        src = getattr(event, "source_type", None)
        if src:
            return src

        return "unknown"

    def _serialize_event(
        self, event_type: str, event: Any, extra: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Serialize a CrewAI event into a storable dict."""
        entry = {
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "elapsed_ms": int((time.time() - self._start_time) * 1000)
            if self._start_time
            else 0,
        }
        if extra:
            entry.update(extra)
        return entry

    def setup_listeners(self, crewai_event_bus):
        @crewai_event_bus.on(CrewKickoffStartedEvent)
        def on_crew_started(source, event):
            self._start_time = time.time()
            self.events.append(
                self._serialize_event(
                    "crew_kickoff_started",
                    event,
                    {"crew_name": getattr(event, "crew_name", "unknown")},
                )
            )

        @crewai_event_bus.on(CrewKickoffCompletedEvent)
        def on_crew_completed(source, event):
            self.events.append(
                self._serialize_event(
                    "crew_kickoff_completed",
                    event,
                    {
                        "crew_name": getattr(event, "crew_name", "unknown"),
                        "output_preview": str(getattr(event, "output", ""))[:500],
                    },
                )
            )

        @crewai_event_bus.on(AgentExecutionStartedEvent)
        def on_agent_started(source, event):
            self.events.append(
                self._serialize_event(
                    "agent_execution_started",
                    event,
                    {"agent_role": self._extract_agent_role(event)},
                )
            )

        @crewai_event_bus.on(AgentExecutionCompletedEvent)
        def on_agent_completed(source, event):
            self.events.append(
                self._serialize_event(
                    "agent_execution_completed",
                    event,
                    {
                        "agent_role": self._extract_agent_role(event),
                        "output_preview": str(getattr(event, "output", ""))[:500],
                    },
                )
            )

        @crewai_event_bus.on(TaskStartedEvent)
        def on_task_started(source, event):
            task_name = getattr(event, "task_name", None) or ""
            # Infer agent domain from task description
            agent_role = self._extract_agent_role(event)
            if agent_role == "unknown" and task_name:
                lower = task_name.lower()
                if "corporate" in lower:
                    agent_role = "Corporate Law Specialist"
                elif "intellectual property" in lower or "confidentiality" in lower:
                    agent_role = "Intellectual Property Specialist"
                elif "compliance" in lower or "jurisdiction" in lower or "regulatory" in lower:
                    agent_role = "Regulatory Compliance Specialist"
                elif "synthesize" in lower or "synthesis" in lower:
                    agent_role = "Senior General Counsel"
            self.events.append(
                self._serialize_event(
                    "task_started",
                    event,
                    {
                        "task_description": task_name[:200] if task_name else "unknown",
                        "agent_role": agent_role,
                    },
                )
            )

        @crewai_event_bus.on(TaskCompletedEvent)
        def on_task_completed(source, event):
            task_name = getattr(event, "task_name", None) or ""
            agent_role = self._extract_agent_role(event)
            if agent_role == "unknown" and task_name:
                lower = task_name.lower()
                if "corporate" in lower:
                    agent_role = "Corporate Law Specialist"
                elif "intellectual property" in lower or "confidentiality" in lower:
                    agent_role = "Intellectual Property Specialist"
                elif "compliance" in lower or "jurisdiction" in lower or "regulatory" in lower:
                    agent_role = "Regulatory Compliance Specialist"
                elif "synthesize" in lower or "synthesis" in lower:
                    agent_role = "Senior General Counsel"
            self.events.append(
                self._serialize_event(
                    "task_completed",
                    event,
                    {
                        "task_description": task_name[:200] if task_name else "unknown",
                        "agent_role": agent_role,
                        "output_preview": str(getattr(event, "output", ""))[:500],
                    },
                )
            )

        @crewai_event_bus.on(ToolUsageStartedEvent)
        def on_tool_started(source, event):
            self.events.append(
                self._serialize_event(
                    "tool_usage_started",
                    event,
                    {
                        "tool_name": getattr(event, "tool_name", "unknown"),
                        "agent_role": self._extract_agent_role(event),
                    },
                )
            )

        @crewai_event_bus.on(ToolUsageFinishedEvent)
        def on_tool_finished(source, event):
            self.events.append(
                self._serialize_event(
                    "tool_usage_finished",
                    event,
                    {
                        "tool_name": getattr(event, "tool_name", "unknown"),
                        "agent_role": self._extract_agent_role(event),
                        "output_preview": str(getattr(event, "output", ""))[:300],
                    },
                )
            )

    def get_trace(self) -> List[Dict[str, Any]]:
        """Return all captured events as a list of dicts (ready for JSON serialization)."""
        return self.events

    def reset(self):
        """Clear all captured events."""
        self.events = []
        self._start_time = 0


# Global singleton — instantiate once, CrewAI auto-registers it
trace_listener = JessicaTraceListener()
