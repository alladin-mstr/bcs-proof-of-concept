import json
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse

from models.schemas import Region
from services.pdf_service import extract_text_from_region, get_page_count, detect_value_format

router = APIRouter(prefix="/pdfs", tags=["pdfs"])

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "storage" / "uploads"
METADATA_FILE = UPLOADS_DIR / "_metadata.json"


def _load_metadata() -> dict:
    if METADATA_FILE.exists():
        return json.loads(METADATA_FILE.read_text())
    return {}


def _save_metadata(data: dict) -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_FILE.write_text(json.dumps(data, indent=2))


@router.post("/upload")
async def upload_pdf(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    pdf_id = str(uuid.uuid4())
    file_path = UPLOADS_DIR / f"{pdf_id}.pdf"

    content = await file.read()
    file_path.write_bytes(content)

    try:
        page_count = get_page_count(str(file_path))
    except Exception as exc:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {exc}")

    # Save metadata (original filename + page count)
    metadata = _load_metadata()
    metadata[pdf_id] = {
        "filename": file.filename,
        "page_count": page_count,
    }
    _save_metadata(metadata)

    return {"pdf_id": pdf_id, "page_count": page_count, "filename": file.filename}


@router.get("")
async def list_pdfs():
    """List all uploaded PDFs."""
    metadata = _load_metadata()
    result = []
    for pdf_id, info in metadata.items():
        file_path = UPLOADS_DIR / f"{pdf_id}.pdf"
        if file_path.exists():
            result.append({
                "pdf_id": pdf_id,
                "filename": info.get("filename", f"{pdf_id}.pdf"),
                "page_count": info.get("page_count", 0),
            })
    return result


@router.delete("/{pdf_id}")
async def delete_pdf(pdf_id: str):
    """Delete an uploaded PDF."""
    file_path = UPLOADS_DIR / f"{pdf_id}.pdf"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found.")
    file_path.unlink()
    metadata = _load_metadata()
    metadata.pop(pdf_id, None)
    _save_metadata(metadata)
    return {"ok": True}


@router.get("/{pdf_id}")
async def get_pdf(pdf_id: str):
    file_path = UPLOADS_DIR / f"{pdf_id}.pdf"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found.")
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=f"{pdf_id}.pdf",
    )


@router.post("/{pdf_id}/extract-region")
async def extract_region(pdf_id: str, region: Region):
    file_path = UPLOADS_DIR / f"{pdf_id}.pdf"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found.")
    text = extract_text_from_region(str(file_path), region)
    return {"text": text}


@router.post("/{pdf_id}/detect-format")
async def detect_format(pdf_id: str, region: Region):
    file_path = UPLOADS_DIR / f"{pdf_id}.pdf"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found.")
    text = extract_text_from_region(str(file_path), region)
    fmt = detect_value_format(text)
    return {"text": text, "format": fmt}
