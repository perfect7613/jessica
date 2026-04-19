import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, UploadFile, File, HTTPException
from app.models import AnnotationCreate
from app.database import get_supabase_client
import uuid

router = APIRouter()

# Thread pool for running blocking CrewAI analysis
_executor = ThreadPoolExecutor(max_workers=2)


@router.post("/analyze")
async def analyze_nda(file: UploadFile = File(...)):
    """Upload a markdown NDA file and get risk analysis."""
    # Validate file type
    if not file.filename or not file.filename.endswith((".md", ".markdown", ".txt")):
        raise HTTPException(
            status_code=400,
            detail="Only markdown (.md, .markdown, .txt) files accepted",
        )

    # Read file content
    content = await file.read()
    nda_text = content.decode("utf-8")

    if len(nda_text.strip()) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    # Run analysis in thread pool to avoid blocking the event loop
    from app.agents.crew import analyze_nda_multi_agent

    loop = asyncio.get_event_loop()
    result, trace_events = await loop.run_in_executor(
        _executor, analyze_nda_multi_agent, nda_text
    )

    # Store in Supabase (including trace)
    run_id = str(uuid.uuid4())
    supabase = get_supabase_client()

    run_data = {
        "id": run_id,
        "input_text": nda_text,
        "red_flags": result.red_flags,
        "yellow_flags": result.yellow_flags,
        "green_flags": result.green_flags,
        "summary": result.summary,
        "full_output": result.model_dump(),
        "crewai_trace": trace_events,
    }

    supabase.table("runs").insert(run_data).execute()

    return {
        "run_id": run_id,
        "analysis": result.model_dump(),
        "trace": trace_events,
    }


@router.get("/runs")
async def list_runs():
    """List all past analysis runs."""
    supabase = get_supabase_client()
    response = (
        supabase.table("runs")
        .select("id, created_at, red_flags, yellow_flags, green_flags, summary")
        .order("created_at", desc=True)
        .execute()
    )
    return {"runs": response.data}


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    """Get full details of a specific run."""
    supabase = get_supabase_client()
    response = supabase.table("runs").select("*").eq("id", run_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run": response.data[0]}


@router.post("/runs/{run_id}/annotate")
async def annotate_run(run_id: str, annotation: AnnotationCreate):
    """Add a rating and optional note to a run."""
    supabase = get_supabase_client()

    # Verify run exists
    run = supabase.table("runs").select("id").eq("id", run_id).execute()
    if not run.data:
        raise HTTPException(status_code=404, detail="Run not found")

    annotation_data = {
        "run_id": run_id,
        "rating": annotation.rating,
        "note": annotation.note,
    }

    supabase.table("annotations").insert(annotation_data).execute()
    return {"status": "ok", "message": "Annotation saved"}


@router.get("/runs/{run_id}/annotations")
async def get_annotations(run_id: str):
    """Get all annotations for a specific run."""
    supabase = get_supabase_client()
    response = (
        supabase.table("annotations").select("*").eq("run_id", run_id).execute()
    )
    return {"annotations": response.data}
