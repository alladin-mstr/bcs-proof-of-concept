import uuid

from fastapi import APIRouter, HTTPException

from models.schemas import GlobalValueGroup, GlobalValueGroupCreate
from services.global_value_store import (
    delete_global_value_group,
    get_global_value_group,
    list_global_value_groups,
    save_global_value_group,
    update_global_value_group,
)

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
