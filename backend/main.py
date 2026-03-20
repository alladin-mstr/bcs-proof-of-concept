from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import extract, pdfs, templates

STORAGE_DIR = Path(__file__).resolve().parent / "storage"


@asynccontextmanager
async def lifespan(app: FastAPI):
    (STORAGE_DIR / "uploads").mkdir(parents=True, exist_ok=True)
    (STORAGE_DIR / "templates").mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="BCS PDF Extraction API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdfs.router)
app.include_router(templates.router)
app.include_router(extract.router)
