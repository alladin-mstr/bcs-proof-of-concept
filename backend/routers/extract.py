from fastapi import APIRouter, HTTPException

from models.schemas import ExtractionRequest, ExtractionResponse, TestRequest
from services.extraction_service import extract_all_fields
from services.storage_backend import get_storage
from services.template_store import get_template

router = APIRouter(tags=["extract"])


@router.post("/extract", response_model=ExtractionResponse)
async def extract_data(request: ExtractionRequest):
    template = get_template(request.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")

    storage = get_storage()
    if not storage.pdf_exists(request.pdf_id):
        raise HTTPException(status_code=404, detail="PDF not found.")

    pdf_path_b = None
    if request.pdf_id_b:
        if not storage.pdf_exists(request.pdf_id_b):
            raise HTTPException(status_code=404, detail="PDF B not found.")

    with storage.pdf_temp_path(request.pdf_id) as pdf_path:
        if request.pdf_id_b:
            with storage.pdf_temp_path(request.pdf_id_b) as path_b:
                pdf_path_b = path_b
                results = extract_all_fields(pdf_path, template.fields, pdf_path_b)
        else:
            results = extract_all_fields(pdf_path, template.fields, None)

    needs_review = any(r.status not in ("ok",) for r in results)

    return ExtractionResponse(
        pdf_id=request.pdf_id,
        template_id=request.template_id,
        results=results,
        needs_review=needs_review,
        pdf_id_b=request.pdf_id_b,
    )


@router.post("/test", response_model=ExtractionResponse)
async def test_extraction(request: TestRequest):
    storage = get_storage()
    if not storage.pdf_exists(request.pdf_id):
        raise HTTPException(status_code=404, detail="PDF not found.")

    if request.pdf_id_b and not storage.pdf_exists(request.pdf_id_b):
        raise HTTPException(status_code=404, detail="PDF B not found.")

    with storage.pdf_temp_path(request.pdf_id) as pdf_path:
        if request.pdf_id_b:
            with storage.pdf_temp_path(request.pdf_id_b) as path_b:
                results = extract_all_fields(pdf_path, request.fields, path_b)
        else:
            results = extract_all_fields(pdf_path, request.fields, None)

    needs_review = any(r.status not in ("ok",) for r in results)

    return ExtractionResponse(
        pdf_id=request.pdf_id,
        template_id="test",
        results=results,
        needs_review=needs_review,
        pdf_id_b=request.pdf_id_b,
    )
