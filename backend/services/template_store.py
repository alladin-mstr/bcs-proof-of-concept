import json
from datetime import datetime, timezone
from pathlib import Path

from models.schemas import Template, TemplateCreate

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "storage" / "templates"


def _template_path(template_id: str) -> Path:
    return TEMPLATES_DIR / f"{template_id}.json"


def save_template(template_id: str, data: TemplateCreate) -> Template:
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

    template = Template(
        id=template_id,
        name=data.name,
        fields=data.fields,
        created_at=datetime.now(timezone.utc),
    )

    _template_path(template_id).write_text(
        template.model_dump_json(indent=2), encoding="utf-8"
    )
    return template


def get_template(template_id: str) -> Template | None:
    path = _template_path(template_id)
    if not path.exists():
        return None
    raw = json.loads(path.read_text(encoding="utf-8"))
    return Template(**raw)


def list_templates() -> list[Template]:
    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    templates: list[Template] = []
    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        templates.append(Template(**raw))
    return templates


def update_template(template_id: str, data: TemplateCreate) -> Template | None:
    path = _template_path(template_id)
    if not path.exists():
        return None

    # Preserve original created_at
    existing = json.loads(path.read_text(encoding="utf-8"))
    template = Template(
        id=template_id,
        name=data.name,
        fields=data.fields,
        created_at=existing.get("created_at", datetime.now(timezone.utc).isoformat()),
    )

    path.write_text(template.model_dump_json(indent=2), encoding="utf-8")
    return template


def delete_template(template_id: str) -> bool:
    path = _template_path(template_id)
    if not path.exists():
        return False
    path.unlink()
    return True
