from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import CORS_ORIGINS
from routers import extract, pdfs, templates, test_runs
from services.storage_backend import get_storage


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_storage()  # initialize storage backend (creates dirs for local)
    yield


app = FastAPI(title="BCS PDF Extraction API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(pdfs.router)
app.include_router(templates.router)
app.include_router(extract.router)
app.include_router(test_runs.router)

# Serve React static build if the directory exists (production / Docker)
_static_dir = Path(__file__).resolve().parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
