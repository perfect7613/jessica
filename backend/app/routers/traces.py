from fastapi import APIRouter, HTTPException
from app.database import get_supabase_client

router = APIRouter()


@router.get("/runs/{run_id}/trace")
async def get_run_trace(run_id: str):
    """Get the CrewAI execution trace for a specific run."""
    supabase = get_supabase_client()
    response = (
        supabase.table("runs").select("crewai_trace").eq("id", run_id).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Run not found")
    trace = response.data[0].get("crewai_trace")
    if trace is None:
        return {"trace": [], "message": "No trace data available for this run"}
    return {"trace": trace}
