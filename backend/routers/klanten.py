import uuid
import json

from fastapi import APIRouter, HTTPException

from models.schemas import Klant, KlantCreate, ControleCreate
from services.klant_store import (
    delete_klant,
    get_klant,
    list_klanten,
    save_klant,
    update_klant,
    list_children,
    list_descendants,
    update_klant_source_controls,
)
from services.controle_store import list_controles, save_controle, delete_controle
from services.storage_backend import get_storage

router = APIRouter(prefix="/klanten", tags=["klanten"])


@router.post("", response_model=Klant)
async def create_klant(data: KlantCreate):
    # Validate parent exists if provided
    if data.parentId:
        parent = get_klant(data.parentId)
        if parent is None:
            raise HTTPException(status_code=404, detail="Parent klant not found.")

    klant_id = str(uuid.uuid4())
    klant = save_klant(klant_id, data)

    # Auto-copy controls from parent to new child
    if data.parentId:
        parent_controles = [c for c in list_controles() if c.klantId == data.parentId]
        source_ids: dict[str, str] = {}
        for pc in parent_controles:
            new_id = str(uuid.uuid4())
            copy_data = ControleCreate(
                name=pc.name,
                status=pc.status,
                files=pc.files,
                rules=pc.rules,
                computedFields=pc.computedFields,
                ruleGraph=pc.ruleGraph,
                klantId=klant_id,
                klantName=klant.name,
            )
            save_controle(new_id, copy_data)
            source_ids[new_id] = pc.id

        if source_ids:
            update_klant_source_controls(klant_id, source_ids)

    return get_klant(klant_id) or klant


@router.get("", response_model=list[Klant])
async def get_all_klanten():
    return list_klanten()


@router.get("/{klant_id}", response_model=Klant)
async def get_one_klant(klant_id: str):
    klant = get_klant(klant_id)
    if klant is None:
        raise HTTPException(status_code=404, detail="Klant not found.")
    return klant


@router.get("/{klant_id}/children", response_model=list[Klant])
async def get_klant_children(klant_id: str):
    klant = get_klant(klant_id)
    if klant is None:
        raise HTTPException(status_code=404, detail="Klant not found.")
    return list_children(klant_id)


@router.put("/{klant_id}", response_model=Klant)
async def update_one_klant(klant_id: str, data: KlantCreate):
    # Validate parent exists if provided
    if data.parentId:
        if data.parentId == klant_id:
            raise HTTPException(status_code=400, detail="A klant cannot be its own parent.")
        parent = get_klant(data.parentId)
        if parent is None:
            raise HTTPException(status_code=404, detail="Parent klant not found.")
        # Prevent circular references
        descendants = list_descendants(klant_id)
        if any(d.id == data.parentId for d in descendants):
            raise HTTPException(status_code=400, detail="Cannot move a klant under its own descendant.")

    klant = update_klant(klant_id, data)
    if klant is None:
        raise HTTPException(status_code=404, detail="Klant not found.")
    return klant


@router.delete("/{klant_id}")
async def remove_klant(klant_id: str):
    klant = get_klant(klant_id)
    if klant is None:
        raise HTTPException(status_code=404, detail="Klant not found.")

    # Cascading delete: remove all descendants and their controles/series
    descendants = list_descendants(klant_id)
    all_klant_ids = [klant_id] + [d.id for d in descendants]

    all_controles = list_controles()
    storage = get_storage()

    for kid in all_klant_ids:
        # Delete controles belonging to this klant
        for c in all_controles:
            if c.klantId == kid:
                delete_controle(c.id)
        # Delete series belonging to this klant
        for sid in storage.list_controle_series_ids():
            content = storage.get_controle_series(sid)
            if content:
                series = json.loads(content)
                if series.get("klantId") == kid:
                    storage.delete_controle_series(sid)
        # Delete the klant itself
        delete_klant(kid)

    return {
        "detail": "Klant deleted.",
        "deletedKlanten": len(all_klant_ids),
    }


@router.post("/{klant_id}/unlink-control/{controle_id}")
async def unlink_control(klant_id: str, controle_id: str):
    """Remove the source tracking for an auto-copied control, making it independent."""
    klant = get_klant(klant_id)
    if klant is None:
        raise HTTPException(status_code=404, detail="Klant not found.")

    source_ids = dict(klant.sourceControlIds or {})
    if controle_id not in source_ids:
        raise HTTPException(status_code=404, detail="Control is not linked to a source.")

    del source_ids[controle_id]
    update_klant_source_controls(klant_id, source_ids if source_ids else None)
    return {"detail": "Control unlinked."}
