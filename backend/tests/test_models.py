import pytest
from pydantic import ValidationError
from app.models import (
    FlaggedClause,
    NDAAnalysisOutput,
    AnnotationCreate,
)


def _make_clause(**overrides) -> dict:
    """Helper to build a valid FlaggedClause dict with optional overrides."""
    base = {
        "original_text": "The Receiving Party shall not disclose...",
        "risk_level": "red",
        "clause_type": "non-compete",
        "explanation": "Overly broad non-compete with no time limit",
        "citation": "Section 27, Indian Contract Act 1872",
        "reference_section": "Section 3.2 - Non-Compete Analysis",
    }
    base.update(overrides)
    return base


class TestFlaggedClause:
    def test_valid_clause_accepted(self):
        clause = FlaggedClause(**_make_clause())
        assert clause.risk_level == "red"
        assert clause.clause_type == "non-compete"

    def test_invalid_risk_level_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            FlaggedClause(**_make_clause(risk_level="blue"))
        assert "risk_level" in str(exc_info.value)

    def test_missing_citation_rejected(self):
        data = _make_clause()
        del data["citation"]
        with pytest.raises(ValidationError) as exc_info:
            FlaggedClause(**data)
        assert "citation" in str(exc_info.value)


class TestNDAAnalysisOutput:
    def test_valid_output_accepted(self):
        clause_data = _make_clause()
        output = NDAAnalysisOutput(
            clauses=[FlaggedClause(**clause_data)],
            summary="This NDA contains a problematic non-compete clause.",
            red_flags=1,
            yellow_flags=0,
            green_flags=0,
        )
        assert output.red_flags == 1
        assert len(output.clauses) == 1
        assert output.summary.startswith("This NDA")


class TestAnnotationCreate:
    def test_valid_annotation_accepted(self):
        annotation = AnnotationCreate(rating=3, note="Looks reasonable")
        assert annotation.rating == 3

    def test_rating_below_1_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            AnnotationCreate(rating=0)
        assert "rating" in str(exc_info.value)

    def test_rating_above_5_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            AnnotationCreate(rating=6)
        assert "rating" in str(exc_info.value)

    def test_note_is_optional(self):
        annotation = AnnotationCreate(rating=5)
        assert annotation.note is None
