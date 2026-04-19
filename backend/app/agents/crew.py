"""Multi-agent crew orchestration for NDA analysis.

Three domain specialists (Corporate, IP, Compliance) produce parallel domain
analyses; the General Counsel agent acts as the hierarchical manager that
synthesises their outputs into a single ``NDAAnalysisOutput``.
"""
from crewai import Crew, Process, Task

from app.agents.general_counsel import (
    GENERAL_COUNSEL_BACKSTORY,
    create_general_counsel_agent,
)
from app.agents.specialists import (
    create_compliance_specialist,
    create_corporate_specialist,
    create_ip_specialist,
)
from app.models import NDAAnalysisOutput


def create_specialist_task(agent, nda_text: str, domain: str) -> Task:
    return Task(
        description=f"""Analyze the following NDA contract from a {domain} perspective under Indian law.

For each clause relevant to your domain:
1. Identify the clause type
2. Assess risk: RED (high risk), YELLOW (medium), GREEN (standard/safe)
3. Explain WHY this risk level
4. Cite specific Indian law (statutes, sections, case law)
5. If you cannot confidently assess, state "Unable to assess"

Focus ONLY on clauses within your domain. Skip clauses outside your expertise.

NDA TEXT:
---
{nda_text}
---""",
        expected_output=(
            f"A detailed {domain} analysis of the NDA clauses with risk "
            f"levels, explanations, and citations."
        ),
        agent=agent,
    )


def create_synthesis_task(gc_agent, nda_text: str) -> Task:
    return Task(
        description=f"""You have received analyses from three specialist agents (Corporate, IP, Compliance).

Synthesize their findings into a single unified NDA analysis:

1. Combine all flagged clauses from all specialists (avoid duplicates)
2. If specialists disagree on a clause's risk level, use your judgment to assign the final level with explanation
3. Add any clauses the specialists may have missed
4. Write a comprehensive summary of the NDA's overall risk posture
5. Count red, yellow, and green flags

The original NDA for reference:
---
{nda_text}
---

Produce the final structured output with all flagged clauses, summary, and flag counts.""",
        expected_output=(
            "Structured JSON with all flagged clauses, summary, and flag counts."
        ),
        agent=gc_agent,
        output_json=NDAAnalysisOutput,
    )


def analyze_nda_multi_agent(nda_text: str) -> tuple["NDAAnalysisOutput", list]:
    """Run the full 4-agent hierarchical crew on an NDA.

    Returns:
        tuple of (NDAAnalysisOutput, trace_events list)
    """
    from app.agents.trace_listener import trace_listener

    # Reset trace listener for this run
    trace_listener.reset()

    # Create agents
    gc = create_general_counsel_agent()
    corporate = create_corporate_specialist()
    ip_specialist = create_ip_specialist()
    compliance = create_compliance_specialist()

    # Create tasks
    corporate_task = create_specialist_task(
        corporate, nda_text, "corporate law and entity governance"
    )
    ip_task = create_specialist_task(
        ip_specialist, nda_text, "intellectual property and confidentiality"
    )
    compliance_task = create_specialist_task(
        compliance, nda_text, "regulatory compliance and jurisdiction"
    )
    synthesis_task = create_synthesis_task(gc, nda_text)

    # Hierarchical crew — the GC acts as manager and synthesises specialist output
    crew = Crew(
        agents=[gc, corporate, ip_specialist, compliance],
        tasks=[corporate_task, ip_task, compliance_task, synthesis_task],
        process=Process.hierarchical,
        manager_llm="openai/gpt-5.4-mini",
        verbose=True,
    )

    result = crew.kickoff()

    # Capture trace before anything else
    trace_events = trace_listener.get_trace()

    # Parse output
    if hasattr(result, "json_dict") and result.json_dict:
        output = NDAAnalysisOutput(**result.json_dict)
    elif hasattr(result, "raw"):
        import json

        output = NDAAnalysisOutput(**json.loads(result.raw))
    else:
        raise ValueError("Failed to parse crew output")

    # Recompute flag counts (don't trust LLM math)
    output.red_flags = len([c for c in output.clauses if c.risk_level == "red"])
    output.yellow_flags = len([c for c in output.clauses if c.risk_level == "yellow"])
    output.green_flags = len([c for c in output.clauses if c.risk_level == "green"])

    return output, trace_events


# Re-export GC backstory for convenience (some callers may want it)
__all__ = [
    "analyze_nda_multi_agent",
    "create_specialist_task",
    "create_synthesis_task",
    "GENERAL_COUNSEL_BACKSTORY",
]
