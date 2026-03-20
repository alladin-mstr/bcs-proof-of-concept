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
