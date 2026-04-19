from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from uuid import UUID
from datetime import datetime


class FlaggedClause(BaseModel):
    original_text: str = Field(..., description="The original clause text from the NDA")
    risk_level: Literal["red", "yellow", "green"] = Field(
        ..., description="Risk severity"
    )
    clause_type: str = Field(
        ...,
        description="Type of clause: non-compete, confidentiality, jurisdiction, etc.",
    )
    explanation: str = Field(
        ..., description="Why this clause is flagged at this risk level"
    )
    citation: str = Field(
        ..., description="Indian law citation grounding this flag"
    )
    reference_section: str = Field(
        ..., description="Which section of reference material was used"
    )


class NDAAnalysisOutput(BaseModel):
    clauses: List[FlaggedClause] = Field(..., description="All flagged clauses")
    summary: str = Field(..., description="General Counsel's synthesized summary")
    red_flags: int = Field(..., description="Count of red-flagged clauses")
    yellow_flags: int = Field(..., description="Count of yellow-flagged clauses")
    green_flags: int = Field(..., description="Count of green-flagged clauses")


class RunRecord(BaseModel):
    id: UUID
    created_at: datetime
    input_text: str
    red_flags: int
    yellow_flags: int
    green_flags: int
    summary: str
    full_output: dict
    crewai_trace: Optional[dict] = None


class AnnotationCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    note: Optional[str] = None


class AnnotationRecord(BaseModel):
    id: UUID
    run_id: UUID
    rating: int
    note: Optional[str] = None
