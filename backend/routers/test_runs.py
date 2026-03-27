import uuid

from fastapi import APIRouter, HTTPException

from models.schemas import TestRun, TestRunCreate
from services.test_run_store import (
    delete_test_run,
    get_test_run,
    list_test_runs,
    save_test_run,
)

router = APIRouter(prefix="/test-runs", tags=["test-runs"])


@router.post("", response_model=TestRun)
async def create_test_run(data: TestRunCreate):
    run_id = str(uuid.uuid4())
    return save_test_run(run_id, data)


@router.get("", response_model=list[TestRun])
async def get_all_test_runs():
    return list_test_runs()


@router.get("/{run_id}", response_model=TestRun)
async def get_run(run_id: str):
    run = get_test_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Test run not found.")
    return run


@router.delete("/{run_id}")
async def delete_run(run_id: str):
    if not delete_test_run(run_id):
        raise HTTPException(status_code=404, detail="Test run not found.")
    return {"ok": True}
