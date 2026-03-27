from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from models.schemas import Template, TemplateCreate
from services.storage_backend import get_storage


def save_template(template_id: str, data: TemplateCreate) -> Template:
    template = Template(
        id=template_id,
        name=data.name,
        fields=data.fields,
        created_at=datetime.now(timezone.utc),
        mode=data.mode,
        rules=data.rules,
        computed_fields=data.computed_fields,
        rule_graph=data.rule_graph,
    )
    get_storage().save_template(template_id, template.model_dump_json(indent=2))
    return template


def get_template(template_id: str) -> Template | None:
    content = get_storage().get_template(template_id)
    if content is None:
        return None
    return Template(**json.loads(content))


def list_templates() -> list[Template]:
    storage = get_storage()
    templates: list[Template] = []
    for tid in storage.list_template_ids():
        content = storage.get_template(tid)
        if content is not None:
            templates.append(Template(**json.loads(content)))
    return templates


def update_template(template_id: str, data: TemplateCreate) -> Template | None:
    storage = get_storage()
    existing_content = storage.get_template(template_id)
    if existing_content is None:
        return None

    existing = json.loads(existing_content)
    template = Template(
        id=template_id,
        name=data.name,
        fields=data.fields,
        created_at=existing.get("created_at", datetime.now(timezone.utc).isoformat()),
        mode=data.mode,
        rules=data.rules,
        computed_fields=data.computed_fields,
        rule_graph=data.rule_graph,
    )
    storage.save_template(template_id, template.model_dump_json(indent=2))
    return template


def delete_template(template_id: str) -> bool:
    return get_storage().delete_template(template_id)
