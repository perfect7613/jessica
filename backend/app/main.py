from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.analysis import router as analysis_router
from app.routers.traces import router as traces_router

app = FastAPI(title="Jessica - AI Legal Team NDA Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router, prefix="/api")
app.include_router(traces_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
