import json
from datetime import datetime, timezone

from models.schemas import Klant, KlantCreate
from services.storage_backend import get_storage


def save_klant(klant_id: str, data: KlantCreate) -> Klant:
    now = datetime.now(timezone.utc)
    klant = Klant(
        id=klant_id,
        name=data.name,
        medewerkerCount=data.medewerkerCount,
        parentId=data.parentId,
        sourceControlIds=None,
        createdAt=now,
        updatedAt=now,
    )
    get_storage().save_klant(klant_id, klant.model_dump_json(indent=2))
    return klant


def get_klant(klant_id: str) -> Klant | None:
    content = get_storage().get_klant(klant_id)
    if content is None:
        return None
    return Klant(**json.loads(content))


def list_klanten() -> list[Klant]:
    storage = get_storage()
    klanten: list[Klant] = []
    for kid in storage.list_klant_ids():
        content = storage.get_klant(kid)
        if content is not None:
            klanten.append(Klant(**json.loads(content)))
    return sorted(klanten, key=lambda k: k.createdAt, reverse=True)


def update_klant(klant_id: str, data: KlantCreate) -> Klant | None:
    storage = get_storage()
    existing_content = storage.get_klant(klant_id)
    if existing_content is None:
        return None

    existing = json.loads(existing_content)
    klant = Klant(
        id=klant_id,
        name=data.name,
        medewerkerCount=data.medewerkerCount,
        parentId=data.parentId,
        sourceControlIds=existing.get("sourceControlIds"),
        createdAt=existing.get("createdAt", datetime.now(timezone.utc).isoformat()),
        updatedAt=datetime.now(timezone.utc),
    )
    storage.save_klant(klant_id, klant.model_dump_json(indent=2))
    return klant


def delete_klant(klant_id: str) -> bool:
    return get_storage().delete_klant(klant_id)


def list_children(parent_id: str) -> list[Klant]:
    """Return direct children of a klant."""
    return [k for k in list_klanten() if k.parentId == parent_id]


def list_descendants(klant_id: str) -> list[Klant]:
    """Return all descendants of a klant (recursive)."""
    children = list_children(klant_id)
    descendants = list(children)
    for child in children:
        descendants.extend(list_descendants(child.id))
    return descendants


def get_ancestor_path(klant_id: str) -> list[Klant]:
    """Return the path from root to this klant (inclusive)."""
    path = []
    current = get_klant(klant_id)
    while current:
        path.insert(0, current)
        if current.parentId:
            current = get_klant(current.parentId)
        else:
            current = None
    return path


def update_klant_source_controls(klant_id: str, source_control_ids: dict[str, str] | None) -> Klant | None:
    """Update only the sourceControlIds field of a klant."""
    storage = get_storage()
    existing_content = storage.get_klant(klant_id)
    if existing_content is None:
        return None

    existing = json.loads(existing_content)
    existing["sourceControlIds"] = source_control_ids
    existing["updatedAt"] = datetime.now(timezone.utc).isoformat()
    storage.save_klant(klant_id, json.dumps(existing, indent=2))
    return Klant(**existing)
