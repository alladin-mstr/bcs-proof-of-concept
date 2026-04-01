import uuid

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from models.schemas import Region
from services.pdf_service import extract_text_from_region, resolve_extraction_region, get_page_count, detect_value_format, get_page_words
from services.storage_backend import get_storage

router = APIRouter(prefix="/pdfs", tags=["pdfs"])


@router.post("/upload")
async def upload_pdf(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    storage = get_storage()
    pdf_id = str(uuid.uuid4())
    content = await file.read()
    storage.upload_pdf(pdf_id, content)

    try:
        with storage.pdf_temp_path(pdf_id) as path:
            page_count = get_page_count(path)
    except Exception as exc:
        storage.delete_pdf(pdf_id)
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {exc}")

    metadata = storage.load_metadata()
    metadata[pdf_id] = {
        "filename": file.filename,
        "page_count": page_count,
    }
    storage.save_metadata(metadata)

    return {"pdf_id": pdf_id, "page_count": page_count, "filename": file.filename}


@router.get("")
async def list_pdfs():
    """List all uploaded PDFs."""
    storage = get_storage()
    metadata = storage.load_metadata()
    result = []
    for pdf_id, info in metadata.items():
        if storage.pdf_exists(pdf_id):
            result.append({
                "pdf_id": pdf_id,
                "filename": info.get("filename", f"{pdf_id}.pdf"),
                "page_count": info.get("page_count", 0),
            })
    return result


@router.delete("/{pdf_id}")
async def delete_pdf(pdf_id: str):
    """Delete an uploaded PDF."""
    storage = get_storage()
    if not storage.pdf_exists(pdf_id):
        raise HTTPException(status_code=404, detail="PDF not found.")
    storage.delete_pdf(pdf_id)
    metadata = storage.load_metadata()
    metadata.pop(pdf_id, None)
    storage.save_metadata(metadata)
    return {"ok": True}


@router.get("/{pdf_id}")
async def get_pdf(pdf_id: str):
    storage = get_storage()
    if not storage.pdf_exists(pdf_id):
        raise HTTPException(status_code=404, detail="PDF not found.")
    try:
        return FileResponse(
            path=storage.get_pdf_response_path(pdf_id),
            media_type="application/pdf",
            filename=f"{pdf_id}.pdf",
        )
    except NotImplementedError:
        # Azure backend: read blob into memory and return
        with storage.pdf_temp_path(pdf_id) as path:
            with open(path, "rb") as f:
                data = f.read()
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{pdf_id}.pdf"'},
        )


@router.post("/{pdf_id}/extract-region")
async def extract_region(pdf_id: str, region: Region, extraction_mode: str = "strict"):
    storage = get_storage()
    if not storage.pdf_exists(pdf_id):
        raise HTTPException(status_code=404, detail="PDF not found.")
    with storage.pdf_temp_path(pdf_id) as path:
        resolved_region, text = resolve_extraction_region(path, region, extraction_mode)
    result: dict = {"text": text}
    if extraction_mode != "strict":
        result["resolved_region"] = resolved_region.model_dump()
    return result


@router.get("/{pdf_id}/words")
async def get_words(pdf_id: str, page: int = 1):
    """Return word-level bounding boxes for a PDF page (normalized 0-1 coords)."""
    storage = get_storage()
    if not storage.pdf_exists(pdf_id):
        raise HTTPException(status_code=404, detail="PDF not found.")
    with storage.pdf_temp_path(pdf_id) as path:
        words = get_page_words(path, page)
    return {"page": page, "words": words}


@router.post("/{pdf_id}/detect-format")
async def detect_format(pdf_id: str, region: Region):
    storage = get_storage()
    if not storage.pdf_exists(pdf_id):
        raise HTTPException(status_code=404, detail="PDF not found.")
    with storage.pdf_temp_path(pdf_id) as path:
        text = extract_text_from_region(path, region)
    fmt = detect_value_format(text)
    return {"text": text, "format": fmt}
