import json
from datetime import datetime, timezone

from models.schemas import GlobalValuePdfTemplate, Field
from services.storage_backend import get_storage


def save_global_value_template(
    template_id: str, group_id: str, pdf_id: str, filename: str, fields: list[Field] | None = None
) -> GlobalValuePdfTemplate:
    now = datetime.now(timezone.utc).isoformat()
    template = GlobalValuePdfTemplate(
        id=template_id,
        groupId=group_id,
        pdfId=pdf_id,
        filename=filename,
        fields=fields or [],
        createdAt=now,
        updatedAt=now,
    )
    get_storage().save_global_value_template(template_id, template.model_dump_json(indent=2))
    return template


def get_global_value_template(template_id: str) -> GlobalValuePdfTemplate | None:
    content = get_storage().get_global_value_template(template_id)
    if content is None:
        return None
    return GlobalValuePdfTemplate(**json.loads(content))


def update_global_value_template(template_id: str, fields: list[Field] | None = None, pdf_id: str | None = None, filename: str | None = None) -> GlobalValuePdfTemplate | None:
    content = get_storage().get_global_value_template(template_id)
    if content is None:
        return None
    existing = json.loads(content)
    if fields is not None:
        existing["fields"] = [f.model_dump() for f in fields]
    if pdf_id is not None:
        existing["pdfId"] = pdf_id
    if filename is not None:
        existing["filename"] = filename
    existing["updatedAt"] = datetime.now(timezone.utc).isoformat()
    template = GlobalValuePdfTemplate(**existing)
    get_storage().save_global_value_template(template_id, template.model_dump_json(indent=2))
    return template


def delete_global_value_template(template_id: str) -> bool:
    return get_storage().delete_global_value_template(template_id)
