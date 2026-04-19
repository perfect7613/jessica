"""Tests for the single General Counsel agent analysis pipeline.

These tests mock the CrewAI execution so we don't call a real LLM. They verify:
1. Output conforms to the NDAAnalysisOutput Pydantic schema
2. Flag counts are correctly recomputed from the clause list
3. Every clause has a non-empty citation
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


# If the real `crewai` / `firecrawl` packages aren't installed in the test
# environment (e.g. Python version mismatch), inject lightweight stub modules
# so that `app.agents.general_counsel` can still be imported and its logic
# tested with fully-mocked Crew execution.
def _install_stub(module_name: str, attrs: dict) -> None:
    if module_name in sys.modules:
        return
    mod = types.ModuleType(module_name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[module_name] = mod


try:  # pragma: no cover - environment sniff
    import crewai  # noqa: F401
except ImportError:  # pragma: no cover - only runs when crewai missing
    class _StubAgent:
        def __init__(self, *args, **kwargs):
            pass

    class _StubTask:
        def __init__(self, *args, **kwargs):
            pass

    class _StubCrew:
        def __init__(self, *args, **kwargs):
            pass

        def kickoff(self):
            raise RuntimeError("Stub Crew.kickoff should be patched in tests")

    class _StubProcess:
        sequential = "sequential"

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
except ImportError:  # pragma: no cover - only runs when firecrawl missing
    class _StubFirecrawl:
        def __init__(self, *args, **kwargs):
            pass

        def search(self, *args, **kwargs):
            return types.SimpleNamespace(data=[])

        def scrape(self, *args, **kwargs):
            return types.SimpleNamespace(markdown="")

    _install_stub("firecrawl", {"Firecrawl": _StubFirecrawl})


from app.models import FlaggedClause, NDAAnalysisOutput  # noqa: E402


# A pre-crafted, realistic NDAAnalysisOutput JSON used by the mocked crew.
# Note: the flag counts below are DELIBERATELY WRONG so we can verify that
# `analyze_nda_single_agent` recomputes them from the clause list.
MOCK_CREW_OUTPUT_JSON = {
    "clauses": [
        {
            "original_text": (
                "The Receiving Party covenants and agrees that for a period of "
                "three (3) years following the termination or expiration of this "
                "Agreement, it shall not engage in any business that competes "
                "with the Disclosing Party anywhere in India or globally."
            ),
            "risk_level": "red",
            "clause_type": "non-compete",
            "explanation": (
                "Post-termination non-compete restrictions are unenforceable "
                "under Indian law as they constitute a restraint of trade."
            ),
            "citation": (
                "Indian Contract Act, 1872, Section 27; Superintendence "
                "Company of India v. Krishan Murgai (1981) 2 SCC 246"
            ),
            "reference_section": "Indian Contract Act - Section 27 / Case Law",
        },
        {
            "original_text": (
                "Receiving Party shall indemnify, defend, and hold harmless "
                "the Disclosing Party... without any cap or limitation on "
                "liability."
            ),
            "risk_level": "red",
            "clause_type": "indemnification",
            "explanation": (
                "Uncapped one-sided indemnification exposes the Receiving "
                "Party to disproportionate liability and may be challenged "
                "as unconscionable."
            ),
            "citation": (
                "Indian Contract Act, 1872, Sections 23 and 73-74 "
                "(reasonable compensation, unlawful object)"
            ),
            "reference_section": "Indian Contract Act - Sections 23, 73, 74",
        },
        {
            "original_text": (
                "Confidential Information shall mean any and all information "
                "disclosed... whether or not marked as confidential... in "
                "perpetuity."
            ),
            "risk_level": "yellow",
            "clause_type": "confidentiality",
            "explanation": (
                "Overly broad scope and perpetual duration is unusual; Indian "
                "courts have favored reasonable, time-bound confidentiality "
                "obligations."
            ),
            "citation": (
                "Pepsi Foods Ltd v. Bharat Coca-Cola Holdings Pvt Ltd "
                "(1999) 81 DLT 122 (Del HC)"
            ),
            "reference_section": "Case Law - Pepsi Foods",
        },
        {
            "original_text": (
                "All intellectual property rights... during the term of this "
                "Agreement or within two (2) years thereafter, whether or not "
                "related to the Purpose... shall vest in the Disclosing Party."
            ),
            "risk_level": "yellow",
            "clause_type": "IP ownership",
            "explanation": (
                "IP assignment covering work unrelated to the Purpose and "
                "extending post-termination is overly broad and may be "
                "challenged."
            ),
            "citation": (
                "Mr. Diljeet Titus v. Mr. Alfred A. Adebare (2006) 130 DLT "
                "330 (Del HC)"
            ),
            "reference_section": "Case Law - Diljeet Titus",
        },
        {
            "original_text": (
                "This Agreement shall be governed by and construed in "
                "accordance with the laws of India. Exclusive jurisdiction: "
                "courts at Mumbai, Maharashtra."
            ),
            "risk_level": "green",
            "clause_type": "jurisdiction",
            "explanation": (
                "Standard and enforceable governing-law and exclusive-"
                "jurisdiction clause selecting an Indian forum."
            ),
            "citation": (
                "Code of Civil Procedure, 1908, Section 20; Indian Contract "
                "Act, 1872, Section 28 (exception for exclusive jurisdiction)"
            ),
            "reference_section": "CPC Section 20 / ICA Section 28",
        },
        {
            "original_text": (
                "This Agreement shall commence on the Effective Date and "
                "shall continue for a period of two (2) years, terminable "
                "with thirty (30) days' written notice."
            ),
            "risk_level": "green",
            "clause_type": "term and termination",
            "explanation": (
                "Standard fixed term with reasonable notice period. No "
                "enforceability concerns under Indian law."
            ),
            "citation": "Indian Contract Act, 1872, Section 10",
            "reference_section": "Indian Contract Act - Section 10",
        },
        {
            "original_text": (
                "Receiving Party shall implement reasonable security "
                "practices as required under Section 43A of the IT Act, "
                "2000, and comply with DPDP Act 2023."
            ),
            "risk_level": "green",
            "clause_type": "data privacy",
            "explanation": (
                "Clause correctly references applicable Indian data "
                "protection law and imposes standard obligations."
            ),
            "citation": (
                "Information Technology Act, 2000, Section 43A; IT "
                "(Reasonable Security Practices) Rules, 2011; Digital "
                "Personal Data Protection Act, 2023"
            ),
            "reference_section": "IT Act - Section 43A / DPDP Act 2023",
        },
    ],
    "summary": (
        "This mutual NDA contains several high-risk, one-sided terms "
        "favoring TechCorp. The post-termination non-compete is "
        "unenforceable under Section 27 of the Indian Contract Act. The "
        "uncapped indemnification and overly broad IP assignment warrant "
        "renegotiation. Jurisdiction, term, and data privacy clauses are "
        "generally acceptable."
    ),
    # Deliberately wrong counts to prove they get recomputed:
    "red_flags": 0,
    "yellow_flags": 0,
    "green_flags": 0,
}


def _make_mock_crew_output(json_dict):
    """Return a mock CrewOutput-like object that has .json_dict and .raw."""
    mock = MagicMock()
    mock.json_dict = json_dict
    mock.raw = json.dumps(json_dict)
    return mock


def test_mocked_analysis_conforms_to_schema():
    """The mocked output should be parseable by NDAAnalysisOutput."""
    from app.agents.general_counsel import analyze_nda_single_agent

    mock_output = _make_mock_crew_output(MOCK_CREW_OUTPUT_JSON)

    with patch(
        "app.agents.general_counsel.Crew"
    ) as mock_crew_cls:
        mock_crew_instance = MagicMock()
        mock_crew_instance.kickoff.return_value = mock_output
        mock_crew_cls.return_value = mock_crew_instance

        result, trace = analyze_nda_single_agent("dummy nda text")

    assert isinstance(result, NDAAnalysisOutput)
    assert isinstance(trace, list)
    assert len(result.clauses) == 7
    for clause in result.clauses:
        assert isinstance(clause, FlaggedClause)
        assert clause.risk_level in ("red", "yellow", "green")


def test_flag_counts_are_recomputed_from_clauses():
    """Flag counts must be recomputed from the clause list, not trusted from LLM."""
    from app.agents.general_counsel import analyze_nda_single_agent

    mock_output = _make_mock_crew_output(MOCK_CREW_OUTPUT_JSON)

    with patch("app.agents.general_counsel.Crew") as mock_crew_cls:
        mock_crew_instance = MagicMock()
        mock_crew_instance.kickoff.return_value = mock_output
        mock_crew_cls.return_value = mock_crew_instance

        result, trace = analyze_nda_single_agent("dummy nda text")

    # Expected counts based on the mock clauses: 2 red, 2 yellow, 3 green
    assert result.red_flags == 2
    assert result.yellow_flags == 2
    assert result.green_flags == 3

    # Sanity: match what we recomputed from the clauses directly
    red = len([c for c in result.clauses if c.risk_level == "red"])
    yellow = len([c for c in result.clauses if c.risk_level == "yellow"])
    green = len([c for c in result.clauses if c.risk_level == "green"])
    assert (red, yellow, green) == (
        result.red_flags,
        result.yellow_flags,
        result.green_flags,
    )


def test_every_clause_has_non_empty_citation():
    """Guardrail: every flagged clause must include a non-empty citation."""
    from app.agents.general_counsel import analyze_nda_single_agent

    mock_output = _make_mock_crew_output(MOCK_CREW_OUTPUT_JSON)

    with patch("app.agents.general_counsel.Crew") as mock_crew_cls:
        mock_crew_instance = MagicMock()
        mock_crew_instance.kickoff.return_value = mock_output
        mock_crew_cls.return_value = mock_crew_instance

        result, trace = analyze_nda_single_agent("dummy nda text")

    for clause in result.clauses:
        assert clause.citation, f"Empty citation for clause: {clause.clause_type}"
        assert clause.citation.strip() != ""
        assert clause.reference_section.strip() != ""


def test_parses_from_raw_when_json_dict_missing():
    """analyze_nda_single_agent should fall back to .raw JSON string."""
    from app.agents.general_counsel import analyze_nda_single_agent

    # Build a mock that does NOT have json_dict (set to None/falsy),
    # only .raw string.
    mock = MagicMock()
    mock.json_dict = None
    mock.raw = json.dumps(MOCK_CREW_OUTPUT_JSON)

    with patch("app.agents.general_counsel.Crew") as mock_crew_cls:
        mock_crew_instance = MagicMock()
        mock_crew_instance.kickoff.return_value = mock
        mock_crew_cls.return_value = mock_crew_instance

        result, trace = analyze_nda_single_agent("dummy nda text")

    assert isinstance(result, NDAAnalysisOutput)
    assert result.red_flags == 2
    assert result.yellow_flags == 2
    assert result.green_flags == 3


def test_pydantic_model_rejects_invalid_risk_level():
    """The Pydantic schema must reject risk levels outside red/yellow/green."""
    with pytest.raises(Exception):
        FlaggedClause(
            original_text="foo",
            risk_level="purple",  # invalid
            clause_type="confidentiality",
            explanation="bar",
            citation="baz",
            reference_section="qux",
        )
