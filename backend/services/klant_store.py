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
        createdAt=existing.get("createdAt", datetime.now(timezone.utc).isoformat()),
        updatedAt=datetime.now(timezone.utc),
    )
    storage.save_klant(klant_id, klant.model_dump_json(indent=2))
    return klant


def delete_klant(klant_id: str) -> bool:
    return get_storage().delete_klant(klant_id)
