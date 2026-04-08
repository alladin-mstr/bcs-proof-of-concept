import json
import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from models.schemas import (
    Field,
    GlobalValueGroup,
    GlobalValueGroupCreate,
    GlobalValuePdfTemplate,
)
from services.extraction_service import extract_all_fields
from services.global_value_store import (
    append_audit_entry,
    confirm_extracted_values,
    delete_global_value_group,
    get_global_value_group,
    list_global_value_groups,
    save_global_value_group,
    update_global_value_group,
)
from services.global_value_template_store import (
    delete_global_value_template,
    get_global_value_template,
    save_global_value_template,
    update_global_value_template,
)
from services.pdf_service import get_page_count
from services.storage_backend import get_storage

router = APIRouter(prefix="/global-values", tags=["global-values"])


@router.post("", response_model=GlobalValueGroup)
async def create_group(data: GlobalValueGroupCreate):
    group_id = str(uuid.uuid4())
    return save_global_value_group(group_id, data)


@router.get("", response_model=list[GlobalValueGroup])
async def get_all_groups():
    return list_global_value_groups()


@router.get("/{group_id}", response_model=GlobalValueGroup)
async def get_one_group(group_id: str):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    return group


@router.put("/{group_id}", response_model=GlobalValueGroup)
async def update_group(group_id: str, data: GlobalValueGroupCreate):
    group = update_global_value_group(group_id, data)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    return group


@router.delete("/{group_id}")
async def remove_group(group_id: str):
    deleted = delete_global_value_group(group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    return {"detail": "Global value group deleted."}


@router.post("/{group_id}/pdf")
async def upload_group_pdf(group_id: str, file: UploadFile):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if group.mode != "pdf":
        raise HTTPException(status_code=400, detail="Group is not in PDF mode.")
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
    metadata[pdf_id] = {"filename": file.filename, "page_count": page_count}
    storage.save_metadata(metadata)

    old_filename = None
    if group.templateId:
        existing_template = get_global_value_template(group.templateId)
        if existing_template:
            old_filename = existing_template.filename
            update_global_value_template(group.templateId, pdf_id=pdf_id, filename=file.filename)
    else:
        template_id = str(uuid.uuid4())
        save_global_value_template(template_id, group_id, pdf_id, file.filename)
        storage_content = storage.get_global_value_group(group_id)
        data = json.loads(storage_content)
        data["templateId"] = template_id
        updated = GlobalValueGroup(**data)
        storage.save_global_value_group(group_id, updated.model_dump_json(indent=2))

    details = {"filename": file.filename}
    if old_filename:
        details["replacedFilename"] = old_filename
    append_audit_entry(group_id, "pdf_uploaded", details)

    return {"pdf_id": pdf_id, "page_count": page_count, "filename": file.filename}


@router.get("/{group_id}/template", response_model=GlobalValuePdfTemplate)
async def get_group_template(group_id: str):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if not group.templateId:
        raise HTTPException(status_code=404, detail="Group has no PDF template.")
    template = get_global_value_template(group.templateId)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template


@router.put("/{group_id}/template", response_model=GlobalValuePdfTemplate)
async def update_group_template(group_id: str, data: dict):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if not group.templateId:
        raise HTTPException(status_code=404, detail="Group has no PDF template.")
    fields = [Field(**f) for f in data.get("fields", [])]
    template = update_global_value_template(group.templateId, fields=fields)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    append_audit_entry(group_id, "pdf_template_updated", {"fieldCount": len(fields)})
    return template


@router.post("/{group_id}/extract")
async def extract_group_values(group_id: str):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if not group.templateId:
        raise HTTPException(status_code=400, detail="Group has no PDF template.")
    template = get_global_value_template(group.templateId)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    if not template.fields:
        raise HTTPException(status_code=400, detail="Template has no fields defined.")

    storage = get_storage()
    with storage.pdf_temp_path(template.pdfId) as pdf_path:
        field_results, _, _ = extract_all_fields(pdf_path, template.fields)

    format_to_datatype = {
        "string": "text", "number": "number", "integer": "number",
        "currency": "number", "date": "date",
    }
    extracted_values = []
    for field, result in zip(template.fields, field_results):
        datatype = "text"
        if field.value_format:
            datatype = format_to_datatype.get(field.value_format, "text")
        extracted_values.append({
            "id": field.id,
            "name": field.label,
            "dataType": datatype,
            "value": result.value,
        })

    return {
        "extractedValues": extracted_values,
        "currentValues": [v.model_dump() for v in group.values],
        "fieldResults": [r.model_dump() for r in field_results],
    }


@router.post("/{group_id}/confirm", response_model=GlobalValueGroup)
async def confirm_group_values(group_id: str, data: dict):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if not group.templateId:
        raise HTTPException(status_code=400, detail="Group has no PDF template.")
    template = get_global_value_template(group.templateId)
    filename = template.filename if template else "unknown"
    values = data.get("values", [])
    updated = confirm_extracted_values(group_id, values, filename)
    if updated is None:
        raise HTTPException(status_code=404, detail="Group not found.")
    return updated


@router.get("/{group_id}/audit")
async def get_group_audit(group_id: str):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    return group.auditLog
