"""Tests for the multi-agent NDA analysis crew.

These tests mock ``Crew.kickoff`` so no real LLM is called. They verify:
1. Output contains clauses from multiple domains (corporate, IP, compliance)
2. Flag counts are recomputed from the clause list
3. All four agents (GC + three specialists) are created with correct roles
4. The crew is configured with ``Process.hierarchical``
"""
import json
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure backend/ is on the path
BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))


# Install stubs for crewai / firecrawl if the real packages aren't importable
# in this environment (mirrors test_single_agent.py behaviour).
def _install_stub(module_name: str, attrs: dict) -> None:
    if module_name in sys.modules:
        return
    mod = types.ModuleType(module_name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[module_name] = mod


try:  # pragma: no cover - environment sniff
    import crewai  # noqa: F401
except ImportError:  # pragma: no cover
    class _StubAgent:
        def __init__(self, *args, **kwargs):
            # Record kwargs so tests can inspect role/goal/etc
            for k, v in kwargs.items():
                setattr(self, k, v)

    class _StubTask:
        def __init__(self, *args, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    class _StubCrew:
        def __init__(self, *args, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

        def kickoff(self):
            raise RuntimeError("Stub Crew.kickoff should be patched in tests")

    class _StubProcess:
        sequential = "sequential"
        hierarchical = "hierarchical"

    _install_stub(
        "crewai",
        {
            "Agent": _StubAgent,
            "Task": _StubTask,
            "Crew": _StubCrew,
            "Process": _StubProcess,
        },
    )

    class _StubBaseTool:
        name: str = ""
        description: str = ""
        args_schema = None

        def _run(self, *args, **kwargs):
            return ""

    _install_stub("crewai.tools", {"BaseTool": _StubBaseTool})

try:  # pragma: no cover - environment sniff
    import firecrawl  # noqa: F401
except ImportError:  # pragma: no cover
    class _StubFirecrawl:
        def __init__(self, *args, **kwargs):
            pass

        def search(self, *args, **kwargs):
            return types.SimpleNamespace(data=[])

        def scrape(self, *args, **kwargs):
            return types.SimpleNamespace(markdown="")

    _install_stub("firecrawl", {"Firecrawl": _StubFirecrawl})


from app.models import FlaggedClause, NDAAnalysisOutput  # noqa: E402


# A pre-crafted multi-domain output covering corporate, IP, and compliance
# flags. Flag counts are DELIBERATELY WRONG so we can verify recomputation.
MOCK_MULTI_AGENT_OUTPUT_JSON = {
    "clauses": [
        # --- Corporate domain ---
        {
            "original_text": (
                "Signed on behalf of TechCorp Pvt Ltd by its duly authorised "
                "representative."
            ),
            "risk_level": "yellow",
            "clause_type": "signatory authority",
            "explanation": (
                "The signature block references a 'duly authorised "
                "representative' without citing a Board resolution or POA. "
                "Under Indian corporate practice the authority source should "
                "be identified to avoid later challenge."
            ),
            "citation": "Companies Act, 2013, Sections 46 and 179",
            "reference_section": "Companies Act 2013 - Sections 46, 179",
        },
        {
            "original_text": (
                "This Agreement shall bind TechCorp, its affiliates, "
                "subsidiaries and associates worldwide."
            ),
            "risk_level": "red",
            "clause_type": "party definition / affiliate binding",
            "explanation": (
                "The clause purports to bind affiliates and associates that "
                "are not signatories and that the signing entity has no "
                "authority to bind under Indian company law."
            ),
            "citation": (
                "Companies Act, 2013, Sections 2(6), 2(87) and Section 179 "
                "(scope of Board powers)"
            ),
            "reference_section": "Companies Act 2013 - Sections 2(6), 2(87), 179",
        },
        # --- IP domain ---
        {
            "original_text": (
                "All intellectual property rights... during the term or "
                "within two (2) years thereafter, whether or not related to "
                "the Purpose... shall vest in the Disclosing Party."
            ),
            "risk_level": "red",
            "clause_type": "IP assignment",
            "explanation": (
                "IP assignment extending beyond the Purpose and covering "
                "post-termination creations is overly broad and may fail "
                "Copyright Act Sec. 19 specificity requirements; also risks "
                "being treated as restraint of trade."
            ),
            "citation": (
                "Copyright Act, 1957, Sections 18 and 19; Mr. Diljeet Titus "
                "v. Mr. Alfred A. Adebare (2006) 130 DLT 330 (Del HC)"
            ),
            "reference_section": "Copyright Act 1957 / Diljeet Titus case",
        },
        {
            "original_text": (
                "Confidential Information shall mean any and all information "
                "disclosed, whether or not marked as confidential, in "
                "perpetuity."
            ),
            "risk_level": "yellow",
            "clause_type": "confidentiality scope",
            "explanation": (
                "Perpetual and unmarked confidentiality is unusually broad; "
                "Indian courts prefer reasonable, time-bound and "
                "identifiable scope."
            ),
            "citation": (
                "IT Act, 2000, Section 72A; Pepsi Foods Ltd v. Bharat "
                "Coca-Cola Holdings Pvt Ltd (1999) 81 DLT 122"
            ),
            "reference_section": "IT Act Section 72A / Pepsi Foods case",
        },
        # --- Compliance domain ---
        {
            "original_text": (
                "This Agreement shall be governed by the laws of the State "
                "of Delaware, USA, and the courts of Delaware shall have "
                "exclusive jurisdiction."
            ),
            "risk_level": "red",
            "clause_type": "governing law and jurisdiction",
            "explanation": (
                "Foreign exclusive jurisdiction imposed on an Indian party "
                "with no US nexus practically denies access to courts and "
                "creates enforcement risk."
            ),
            "citation": (
                "Indian Contract Act, 1872, Section 28 (exception applies "
                "only to Indian fora); CPC Section 44A"
            ),
            "reference_section": "ICA Section 28 / CPC Section 44A",
        },
        {
            "original_text": (
                "Confidential Information may be transferred to TechCorp "
                "affiliates in any country without additional consent."
            ),
            "risk_level": "red",
            "clause_type": "cross-border data transfer",
            "explanation": (
                "Blanket cross-border transfer of personal/SPDI without "
                "consent or adequate-protection language contravenes SPDI "
                "Rules and the DPDP Act."
            ),
            "citation": (
                "IT Act, 2000, Section 43A; SPDI Rules, 2011, Rule 7; "
                "Digital Personal Data Protection Act, 2023, Section 16"
            ),
            "reference_section": "IT Act 43A / SPDI Rule 7 / DPDP Act Sec. 16",
        },
        {
            "original_text": (
                "Receiving Party shall implement reasonable security "
                "practices as required under Section 43A of the IT Act, "
                "2000, and comply with the DPDP Act, 2023."
            ),
            "risk_level": "green",
            "clause_type": "data protection",
            "explanation": (
                "Correctly references the current Indian data-protection "
                "framework and imposes standard obligations."
            ),
            "citation": (
                "IT Act, 2000, Section 43A; Digital Personal Data "
                "Protection Act, 2023"
            ),
            "reference_section": "IT Act 43A / DPDP Act 2023",
        },
    ],
    "summary": (
        "Multi-domain synthesis: the NDA contains significant corporate "
        "(affiliate binding, unclear signatory authority), IP (overbroad "
        "assignment, perpetual confidentiality) and compliance (foreign "
        "exclusive jurisdiction, cross-border transfer without consent) "
        "red flags. Only the baseline data-protection reference is "
        "acceptable as drafted."
    ),
    # Deliberately wrong to prove recomputation:
    "red_flags": 99,
    "yellow_flags": 99,
    "green_flags": 99,
}


def _make_mock_crew_output(json_dict):
    mock = MagicMock()
    mock.json_dict = json_dict
    mock.raw = json.dumps(json_dict)
    return mock


def test_multi_agent_output_contains_multiple_domains():
    """The synthesised output must contain clauses from all three specialist domains."""
    from app.agents.crew import analyze_nda_multi_agent

    mock_output = _make_mock_crew_output(MOCK_MULTI_AGENT_OUTPUT_JSON)

    with patch("app.agents.crew.Crew") as mock_crew_cls:
        mock_crew_instance = MagicMock()
        mock_crew_instance.kickoff.return_value = mock_output
        mock_crew_cls.return_value = mock_crew_instance

        result, trace = analyze_nda_multi_agent("dummy nda text")

    assert isinstance(result, NDAAnalysisOutput)
    assert isinstance(trace, list)
    assert len(result.clauses) == 7

    clause_types = " ".join(c.clause_type.lower() for c in result.clauses)
    citations = " ".join(c.citation.lower() for c in result.clauses)

    # Corporate domain signal
    assert (
        "signatory" in clause_types
        or "affiliate" in clause_types
        or "companies act" in citations
    )
    # IP domain signal
    assert (
        "ip" in clause_types
        or "confidentiality" in clause_types
        or "copyright act" in citations
        or "diljeet titus" in citations
    )
    # Compliance domain signal
    assert (
        "jurisdiction" in clause_types
        or "data" in clause_types
        or "dpdp" in citations
        or "spdi" in citations
        or "ica section 28" in citations.replace(",", "")
        or "section 28" in citations
    )


def test_flag_counts_are_recomputed_from_clauses():
    """Flag counts must be recomputed from the clause list, not trusted from the manager LLM."""
    from app.agents.crew import analyze_nda_multi_agent

    mock_output = _make_mock_crew_output(MOCK_MULTI_AGENT_OUTPUT_JSON)

    with patch("app.agents.crew.Crew") as mock_crew_cls:
        mock_crew_instance = MagicMock()
        mock_crew_instance.kickoff.return_value = mock_output
        mock_crew_cls.return_value = mock_crew_instance

        result, trace = analyze_nda_multi_agent("dummy nda text")

    # Expected from the mock fixture: 4 red, 2 yellow, 1 green
    expected_red = sum(1 for c in MOCK_MULTI_AGENT_OUTPUT_JSON["clauses"] if c["risk_level"] == "red")
    expected_yellow = sum(1 for c in MOCK_MULTI_AGENT_OUTPUT_JSON["clauses"] if c["risk_level"] == "yellow")
    expected_green = sum(1 for c in MOCK_MULTI_AGENT_OUTPUT_JSON["clauses"] if c["risk_level"] == "green")

    assert result.red_flags == expected_red == 4
    assert result.yellow_flags == expected_yellow == 2
    assert result.green_flags == expected_green == 1

    # And the wrong original counts (99) must NOT be present
    assert result.red_flags != 99
    assert result.yellow_flags != 99
    assert result.green_flags != 99


def test_all_specialists_have_correct_roles():
    """Verify the three specialist factories produce agents with the expected roles."""
    from app.agents.specialists import (
        create_compliance_specialist,
        create_corporate_specialist,
        create_ip_specialist,
    )
    from app.agents.general_counsel import create_general_counsel_agent

    gc = create_general_counsel_agent()
    corporate = create_corporate_specialist()
    ip_specialist = create_ip_specialist()
    compliance = create_compliance_specialist()

    assert getattr(gc, "role", None) == "Senior General Counsel"
    assert getattr(corporate, "role", None) == "Corporate Law Specialist"
    assert getattr(ip_specialist, "role", None) == "Intellectual Property Specialist"
    assert getattr(compliance, "role", None) == "Regulatory Compliance Specialist"

    # All specialists must disallow delegation and be verbose
    for agent in (corporate, ip_specialist, compliance):
        assert getattr(agent, "allow_delegation", None) is False
        assert getattr(agent, "verbose", None) is True
        # And must have at least one tool (search + scrape)
        tools = getattr(agent, "tools", [])
        assert tools and len(tools) >= 2


def test_crew_uses_hierarchical_process():
    """The multi-agent crew must be configured with Process.hierarchical and a manager_llm."""
    from crewai import Process

    from app.agents.crew import analyze_nda_multi_agent

    mock_output = _make_mock_crew_output(MOCK_MULTI_AGENT_OUTPUT_JSON)

    captured_kwargs = {}

    def _fake_crew_ctor(*args, **kwargs):
        captured_kwargs.update(kwargs)
        instance = MagicMock()
        instance.kickoff.return_value = mock_output
        return instance

    with patch("app.agents.crew.Crew", side_effect=_fake_crew_ctor):
        _result, _trace = analyze_nda_multi_agent("dummy nda text")

    assert captured_kwargs.get("process") == Process.hierarchical
    assert captured_kwargs.get("manager_llm") == "openai/gpt-5.4-mini"

    # Sanity: should be given 4 agents and 4 tasks
    agents = captured_kwargs.get("agents", [])
    tasks = captured_kwargs.get("tasks", [])
    assert len(agents) == 4
    assert len(tasks) == 4


def test_parses_from_raw_when_json_dict_missing():
    """analyze_nda_multi_agent should fall back to .raw JSON string."""
    from app.agents.crew import analyze_nda_multi_agent

    mock = MagicMock()
    mock.json_dict = None
    mock.raw = json.dumps(MOCK_MULTI_AGENT_OUTPUT_JSON)

    with patch("app.agents.crew.Crew") as mock_crew_cls:
        mock_crew_instance = MagicMock()
        mock_crew_instance.kickoff.return_value = mock
        mock_crew_cls.return_value = mock_crew_instance

        result, trace = analyze_nda_multi_agent("dummy nda text")

    assert isinstance(result, NDAAnalysisOutput)
    assert result.red_flags == 4
    assert result.yellow_flags == 2
    assert result.green_flags == 1


def test_every_clause_has_non_empty_citation():
    """Guardrail also applies to multi-agent output: every flag must cite Indian law."""
    from app.agents.crew import analyze_nda_multi_agent

    mock_output = _make_mock_crew_output(MOCK_MULTI_AGENT_OUTPUT_JSON)

    with patch("app.agents.crew.Crew") as mock_crew_cls:
        mock_crew_instance = MagicMock()
        mock_crew_instance.kickoff.return_value = mock_output
        mock_crew_cls.return_value = mock_crew_instance

        result, trace = analyze_nda_multi_agent("dummy nda text")

    for clause in result.clauses:
        assert isinstance(clause, FlaggedClause)
        assert clause.citation and clause.citation.strip() != ""
        assert clause.reference_section and clause.reference_section.strip() != ""
