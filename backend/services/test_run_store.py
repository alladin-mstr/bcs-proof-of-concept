from __future__ import annotations

import json
from datetime import datetime, timezone

from models.schemas import TestRun, TestRunCreate
from services.storage_backend import get_storage


def save_test_run(run_id: str, data: TestRunCreate) -> TestRun:
    run = TestRun(
        id=run_id,
        pdf_id=data.pdf_id,
        pdf_filename=data.pdf_filename,
        template_name=data.template_name,
        template_id=data.template_id,
        entries=data.entries,
        created_at=datetime.now(timezone.utc),
    )
    get_storage().save_test_run(run_id, run.model_dump_json(indent=2))
    return run


def get_test_run(run_id: str) -> TestRun | None:
    content = get_storage().get_test_run(run_id)
    if content is None:
        return None
    return TestRun(**json.loads(content))


def list_test_runs() -> list[TestRun]:
    storage = get_storage()
    runs: list[TestRun] = []
    for rid in storage.list_test_run_ids():
        content = storage.get_test_run(rid)
        if content is not None:
            runs.append(TestRun(**json.loads(content)))
    return sorted(runs, key=lambda r: r.created_at, reverse=True)


def delete_test_run(run_id: str) -> bool:
    return get_storage().delete_test_run(run_id)
