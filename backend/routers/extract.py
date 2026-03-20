from pathlib import Path

from fastapi import APIRouter, HTTPException

from models.schemas import ExtractionRequest, ExtractionResponse, TestRequest
from services.extraction_service import extract_all_fields
from services.template_store import get_template

router = APIRouter(tags=["extract"])

UPLOADS_DIR = Path(__file__).resolve().parent.parent / "storage" / "uploads"


@router.post("/extract", response_model=ExtractionResponse)
async def extract_data(request: ExtractionRequest):
    template = get_template(request.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")

    pdf_path = UPLOADS_DIR / f"{request.pdf_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found.")

    results = extract_all_fields(str(pdf_path), template.fields)
    needs_review = any(r.status not in ("ok",) for r in results)

    return ExtractionResponse(
        pdf_id=request.pdf_id,
        template_id=request.template_id,
        results=results,
        needs_review=needs_review,
    )


@router.post("/test", response_model=ExtractionResponse)
async def test_extraction(request: TestRequest):
    pdf_path = UPLOADS_DIR / f"{request.pdf_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found.")

    results = extract_all_fields(str(pdf_path), request.fields)
    needs_review = any(r.status not in ("ok",) for r in results)

    return ExtractionResponse(
        pdf_id=request.pdf_id,
        template_id="test",
        results=results,
        needs_review=needs_review,
    )
