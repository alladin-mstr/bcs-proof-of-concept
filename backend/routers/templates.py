import uuid

from fastapi import APIRouter, HTTPException

from models.schemas import Template, TemplateCreate
from services.template_store import (
    delete_template,
    get_template,
    list_templates,
    save_template,
    update_template,
)

router = APIRouter(prefix="/templates", tags=["templates"])


@router.post("", response_model=Template)
async def create_template(data: TemplateCreate):
    template_id = str(uuid.uuid4())
    template = save_template(template_id, data)
    return template


@router.get("", response_model=list[Template])
async def get_all_templates():
    return list_templates()


@router.get("/{template_id}", response_model=Template)
async def get_one_template(template_id: str):
    template = get_template(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template


@router.put("/{template_id}", response_model=Template)
async def update_one_template(template_id: str, data: TemplateCreate):
    template = update_template(template_id, data)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template


@router.delete("/{template_id}")
async def remove_template(template_id: str):
    deleted = delete_template(template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found.")
    return {"detail": "Template deleted."}


@router.get("/all-fields", response_model=list[dict])
async def get_all_template_fields():
    """Return all templates with their field labels and datatypes for cross-template references."""
    templates = list_templates()
    result = []
    for t in templates:
        fields = []
        for f in t.fields:
            entry: dict = {"label": f.label, "datatype": f.value_format or f.detected_datatype, "field_type": f.type}
            if f.type == "table" and f.table_config:
                entry["table_columns"] = [{"id": c.id, "label": c.label} for c in f.table_config.columns]
            fields.append(entry)
        computed = [
            {"label": cf.label, "datatype": cf.datatype, "computed": True}
            for cf in t.computed_fields
        ]
        result.append({
            "template_id": t.id,
            "template_name": t.name,
            "fields": fields + computed,
        })
    return result
