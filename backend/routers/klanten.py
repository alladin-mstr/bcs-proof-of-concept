import uuid

from fastapi import APIRouter, HTTPException

from models.schemas import Klant, KlantCreate
from services.klant_store import (
    delete_klant,
    get_klant,
    list_klanten,
    save_klant,
    update_klant,
)

router = APIRouter(prefix="/klanten", tags=["klanten"])


@router.post("", response_model=Klant)
async def create_klant(data: KlantCreate):
    klant_id = str(uuid.uuid4())
    klant = save_klant(klant_id, data)
    return klant


@router.get("", response_model=list[Klant])
async def get_all_klanten():
    return list_klanten()


@router.get("/{klant_id}", response_model=Klant)
async def get_one_klant(klant_id: str):
    klant = get_klant(klant_id)
    if klant is None:
        raise HTTPException(status_code=404, detail="Klant not found.")
    return klant


@router.put("/{klant_id}", response_model=Klant)
async def update_one_klant(klant_id: str, data: KlantCreate):
    klant = update_klant(klant_id, data)
    if klant is None:
        raise HTTPException(status_code=404, detail="Klant not found.")
    return klant


@router.delete("/{klant_id}")
async def remove_klant(klant_id: str):
    deleted = delete_klant(klant_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Klant not found.")
    return {"detail": "Klant deleted."}
