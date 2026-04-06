# Controle Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to chain multiple controles into a series that executes sequentially with conditions and data piping between steps.

**Architecture:** New `ControleSeries` entity with CRUD + run endpoints on backend, mirroring the existing controle/klant patterns. Frontend gets 4 new pages (builder, detail, runner, plus sidebar nav). The rule engine receives a `series_context` parameter for cross-controle data piping.

**Tech Stack:** Python/FastAPI, Pydantic, JSON file storage, React/TypeScript, Tailwind CSS, shadcn/ui

---

### Task 1: Backend — Pydantic Models

**Files:**
- Modify: `backend/models/schemas.py` (append after line 406)

- [ ] **Step 1: Add series models to schemas.py**

Append the following models at the end of `backend/models/schemas.py`:

```python
# --- Controle Series ---

class ControleSeriesStep(BaseModel):
    """A single step in a controle series."""
    id: str
    order: int
    controleId: str
    controleName: str
    condition: Literal["always", "if_passed", "if_failed"] = "always"


class ControleSeriesCreate(BaseModel):
    """Request body to create or update a controle series."""
    name: str
    klantId: str
    klantName: str
    steps: list[ControleSeriesStep] = []


class ControleSeries(BaseModel):
    """A persisted controle series."""
    id: str
    name: str
    klantId: str
    klantName: str
    steps: list[ControleSeriesStep] = []
    createdAt: datetime
    updatedAt: datetime


class ControleSeriesStepResult(BaseModel):
    """Result of a single step in a series run."""
    stepId: str
    controleId: str
    controleName: str
    status: Literal["passed", "failed", "skipped", "error"]
    controleRunId: str | None = None


class ControleSeriesRun(BaseModel):
    """A persisted result of running a controle series."""
    id: str
    seriesId: str
    seriesName: str
    klantId: str
    klantName: str
    status: Literal["running", "completed", "stopped"]
    stepResults: list[ControleSeriesStepResult] = []
    runAt: datetime
```

- [ ] **Step 2: Verify the models parse correctly**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "from models.schemas import ControleSeries, ControleSeriesRun; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/models/schemas.py
git commit -m "feat: add Pydantic models for controle series"
```

---

### Task 2: Backend — Storage Backend

**Files:**
- Modify: `backend/services/storage_backend.py` (add abstract methods + implementations)
- Modify: `backend/config.py` (add Azure container config)

- [ ] **Step 1: Add abstract methods to StorageBackend class**

Add after the `delete_klant` method (line 110) in the `StorageBackend` class:

```python
    # -- Controle Series --

    @abstractmethod
    def save_controle_series(self, series_id: str, content: str) -> None: ...

    @abstractmethod
    def get_controle_series(self, series_id: str) -> str | None: ...

    @abstractmethod
    def list_controle_series_ids(self) -> list[str]: ...

    @abstractmethod
    def delete_controle_series(self, series_id: str) -> bool: ...

    # -- Controle Series Runs --

    @abstractmethod
    def save_controle_series_run(self, run_id: str, content: str) -> None: ...

    @abstractmethod
    def get_controle_series_run(self, run_id: str) -> str | None: ...

    @abstractmethod
    def list_controle_series_run_ids(self) -> list[str]: ...
```

- [ ] **Step 2: Add directories to LocalStorageBackend.__init__**

In `LocalStorageBackend.__init__`, add after line 131 (`self._klanten = ...`):

```python
        self._controle_series = base_dir / "controle_series"
        self._controle_series_runs = base_dir / "controle_series_runs"
```

And add after line 131's `mkdir` calls:

```python
        self._controle_series.mkdir(parents=True, exist_ok=True)
        self._controle_series_runs.mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 3: Add LocalStorageBackend implementations**

Add at the end of the `LocalStorageBackend` class (after `delete_klant`):

```python
    # -- Controle Series --

    def save_controle_series(self, series_id: str, content: str) -> None:
        (self._controle_series / f"{series_id}.json").write_text(content, encoding="utf-8")

    def get_controle_series(self, series_id: str) -> str | None:
        path = self._controle_series / f"{series_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_controle_series_ids(self) -> list[str]:
        return [p.stem for p in sorted(self._controle_series.glob("*.json"))]

    def delete_controle_series(self, series_id: str) -> bool:
        path = self._controle_series / f"{series_id}.json"
        if not path.exists():
            return False
        path.unlink()
        return True

    # -- Controle Series Runs --

    def save_controle_series_run(self, run_id: str, content: str) -> None:
        (self._controle_series_runs / f"{run_id}.json").write_text(content, encoding="utf-8")

    def get_controle_series_run(self, run_id: str) -> str | None:
        path = self._controle_series_runs / f"{run_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_controle_series_run_ids(self) -> list[str]:
        return [p.stem for p in sorted(self._controle_series_runs.glob("*.json"))]
```

- [ ] **Step 4: Add AzureBlobStorageBackend implementations**

In `AzureBlobStorageBackend.__init__`, add after the klanten container client:

```python
        self._controle_series = self._client.get_container_client(controle_series_container)
        self._controle_series_runs = self._client.get_container_client(controle_series_runs_container)
```

Add the constructor parameters:

```python
    def __init__(self, account_name: str, pdfs_container: str = "pdfs", templates_container: str = "templates", test_runs_container: str = "test-runs", controles_container: str = "controles", controle_runs_container: str = "controle-runs", klanten_container: str = "klanten", controle_series_container: str = "controle-series", controle_series_runs_container: str = "controle-series-runs"):
```

Add containers to the ensure-exists loop:

```python
        for container in [self._pdfs, self._templates, self._test_runs, self._controles, self._controle_runs, self._klanten, self._controle_series, self._controle_series_runs]:
```

Add the method implementations at the end of the `AzureBlobStorageBackend` class:

```python
    # -- Controle Series --

    def save_controle_series(self, series_id: str, content: str) -> None:
        self._controle_series.upload_blob(f"{series_id}.json", content, overwrite=True)

    def get_controle_series(self, series_id: str) -> str | None:
        blob_client = self._controle_series.get_blob_client(f"{series_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def list_controle_series_ids(self) -> list[str]:
        ids = []
        for blob in self._controle_series.list_blobs():
            name = blob.name
            if name.endswith(".json"):
                ids.append(name.removesuffix(".json"))
        return sorted(ids)

    def delete_controle_series(self, series_id: str) -> bool:
        blob_client = self._controle_series.get_blob_client(f"{series_id}.json")
        if not blob_client.exists():
            return False
        blob_client.delete_blob()
        return True

    # -- Controle Series Runs --

    def save_controle_series_run(self, run_id: str, content: str) -> None:
        self._controle_series_runs.upload_blob(f"{run_id}.json", content, overwrite=True)

    def get_controle_series_run(self, run_id: str) -> str | None:
        blob_client = self._controle_series_runs.get_blob_client(f"{run_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def list_controle_series_run_ids(self) -> list[str]:
        ids = []
        for blob in self._controle_series_runs.list_blobs():
            name = blob.name
            if name.endswith(".json"):
                ids.append(name.removesuffix(".json"))
        return sorted(ids)
```

- [ ] **Step 5: Update config.py**

Add to `backend/config.py`:

```python
AZURE_STORAGE_CONTROLE_SERIES_CONTAINER = os.getenv("AZURE_STORAGE_CONTROLE_SERIES_CONTAINER", "controle-series")
AZURE_STORAGE_CONTROLE_SERIES_RUNS_CONTAINER = os.getenv("AZURE_STORAGE_CONTROLE_SERIES_RUNS_CONTAINER", "controle-series-runs")
```

- [ ] **Step 6: Update get_storage() to pass new config**

In the `get_storage()` function, update the import and the `AzureBlobStorageBackend` construction to include the two new config values:

```python
from config import STORAGE_BACKEND, AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_PDFS_CONTAINER, AZURE_STORAGE_TEMPLATES_CONTAINER, AZURE_STORAGE_TEST_RUNS_CONTAINER, AZURE_STORAGE_CONTROLES_CONTAINER, AZURE_STORAGE_CONTROLE_RUNS_CONTAINER, AZURE_STORAGE_KLANTEN_CONTAINER, AZURE_STORAGE_CONTROLE_SERIES_CONTAINER, AZURE_STORAGE_CONTROLE_SERIES_RUNS_CONTAINER
```

And in the `AzureBlobStorageBackend(...)` call:

```python
            _instance = AzureBlobStorageBackend(
                account_name=AZURE_STORAGE_ACCOUNT,
                pdfs_container=AZURE_STORAGE_PDFS_CONTAINER,
                templates_container=AZURE_STORAGE_TEMPLATES_CONTAINER,
                test_runs_container=AZURE_STORAGE_TEST_RUNS_CONTAINER,
                controles_container=AZURE_STORAGE_CONTROLES_CONTAINER,
                controle_runs_container=AZURE_STORAGE_CONTROLE_RUNS_CONTAINER,
                klanten_container=AZURE_STORAGE_KLANTEN_CONTAINER,
                controle_series_container=AZURE_STORAGE_CONTROLE_SERIES_CONTAINER,
                controle_series_runs_container=AZURE_STORAGE_CONTROLE_SERIES_RUNS_CONTAINER,
            )
```

- [ ] **Step 7: Verify imports work**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "from services.storage_backend import get_storage; s = get_storage(); print(type(s).__name__)"`

Expected: `LocalStorageBackend`

- [ ] **Step 8: Commit**

```bash
git add backend/services/storage_backend.py backend/config.py
git commit -m "feat: add storage backend methods for controle series"
```

---

### Task 3: Backend — Series Store

**Files:**
- Create: `backend/services/controle_series_store.py`

- [ ] **Step 1: Create the store module**

Create `backend/services/controle_series_store.py`:

```python
import json
from datetime import datetime, timezone

from models.schemas import ControleSeries, ControleSeriesCreate
from services.storage_backend import get_storage


def save_controle_series(series_id: str, data: ControleSeriesCreate) -> ControleSeries:
    now = datetime.now(timezone.utc)
    series = ControleSeries(
        id=series_id,
        name=data.name,
        klantId=data.klantId,
        klantName=data.klantName,
        steps=data.steps,
        createdAt=now,
        updatedAt=now,
    )
    get_storage().save_controle_series(series_id, series.model_dump_json(indent=2))
    return series


def get_controle_series(series_id: str) -> ControleSeries | None:
    content = get_storage().get_controle_series(series_id)
    if content is None:
        return None
    return ControleSeries(**json.loads(content))


def list_controle_series() -> list[ControleSeries]:
    storage = get_storage()
    result: list[ControleSeries] = []
    for sid in storage.list_controle_series_ids():
        content = storage.get_controle_series(sid)
        if content is not None:
            result.append(ControleSeries(**json.loads(content)))
    return sorted(result, key=lambda s: s.createdAt, reverse=True)


def update_controle_series(series_id: str, data: ControleSeriesCreate) -> ControleSeries | None:
    storage = get_storage()
    existing_content = storage.get_controle_series(series_id)
    if existing_content is None:
        return None

    existing = json.loads(existing_content)
    series = ControleSeries(
        id=series_id,
        name=data.name,
        klantId=data.klantId,
        klantName=data.klantName,
        steps=data.steps,
        createdAt=existing.get("createdAt", datetime.now(timezone.utc).isoformat()),
        updatedAt=datetime.now(timezone.utc),
    )
    storage.save_controle_series(series_id, series.model_dump_json(indent=2))
    return series


def delete_controle_series(series_id: str) -> bool:
    return get_storage().delete_controle_series(series_id)
```

- [ ] **Step 2: Verify import**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "from services.controle_series_store import save_controle_series, list_controle_series; print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/services/controle_series_store.py
git commit -m "feat: add controle series store layer"
```

---

### Task 4: Backend — API Router (CRUD)

**Files:**
- Create: `backend/routers/controle_series.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create the router**

Create `backend/routers/controle_series.py`:

```python
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.schemas import (
    ControleSeries,
    ControleSeriesCreate,
    ControleSeriesRun,
    ControleSeriesStepResult,
    ControleRunResult,
)
from services.controle_series_store import (
    delete_controle_series,
    get_controle_series,
    list_controle_series,
    save_controle_series,
    update_controle_series,
)
from services.controle_store import get_controle
from services.storage_backend import get_storage
from services.extraction_service import extract_all_fields
from models.schemas import ExtractionResponse, TestRunEntry

router = APIRouter(prefix="/controle-series", tags=["controle-series"])


@router.post("", response_model=ControleSeries)
async def create_series(data: ControleSeriesCreate):
    series_id = str(uuid.uuid4())
    return save_controle_series(series_id, data)


@router.get("", response_model=list[ControleSeries])
async def get_all_series(klantId: str | None = Query(default=None)):
    all_series = list_controle_series()
    if klantId:
        return [s for s in all_series if s.klantId == klantId]
    return all_series


@router.get("/runs/all", response_model=list[ControleSeriesRun])
async def list_all_series_runs():
    storage = get_storage()
    runs: list[ControleSeriesRun] = []
    for rid in storage.list_controle_series_run_ids():
        content = storage.get_controle_series_run(rid)
        if content is not None:
            runs.append(ControleSeriesRun(**json.loads(content)))
    return sorted(runs, key=lambda r: r.runAt, reverse=True)


@router.get("/runs/{run_id}", response_model=ControleSeriesRun)
async def get_series_run(run_id: str):
    content = get_storage().get_controle_series_run(run_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Series run not found.")
    return ControleSeriesRun(**json.loads(content))


@router.get("/{series_id}", response_model=ControleSeries)
async def get_one_series(series_id: str):
    series = get_controle_series(series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found.")
    return series


@router.put("/{series_id}", response_model=ControleSeries)
async def update_one_series(series_id: str, data: ControleSeriesCreate):
    series = update_controle_series(series_id, data)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found.")
    return series


@router.delete("/{series_id}")
async def remove_series(series_id: str):
    deleted = delete_controle_series(series_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Series not found.")
    return {"detail": "Series deleted."}


class RunSeriesRequest(BaseModel):
    """Maps step_id -> { file_id -> pdf_id }."""
    files: dict[str, dict[str, str]]


@router.post("/{series_id}/run", response_model=ControleSeriesRun)
async def run_series(series_id: str, data: RunSeriesRequest):
    series = get_controle_series(series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found.")

    storage = get_storage()
    sorted_steps = sorted(series.steps, key=lambda s: s.order)
    step_results: list[ControleSeriesStepResult] = []
    series_context: dict[str, ControleRunResult] = {}
    final_status = "completed"

    for i, step in enumerate(sorted_steps):
        # Evaluate condition
        if i > 0 and step.condition != "always":
            prev_result = step_results[i - 1]
            if step.condition == "if_passed" and prev_result.status != "passed":
                step_results.append(ControleSeriesStepResult(
                    stepId=step.id,
                    controleId=step.controleId,
                    controleName=step.controleName,
                    status="skipped",
                ))
                final_status = "stopped"
                break
            if step.condition == "if_failed" and prev_result.status != "failed":
                step_results.append(ControleSeriesStepResult(
                    stepId=step.id,
                    controleId=step.controleId,
                    controleName=step.controleName,
                    status="skipped",
                ))
                final_status = "stopped"
                break

        # Load the controle
        controle = get_controle(step.controleId)
        if controle is None:
            step_results.append(ControleSeriesStepResult(
                stepId=step.id,
                controleId=step.controleId,
                controleName=step.controleName,
                status="error",
            ))
            final_status = "stopped"
            break

        # Get PDFs for this step
        step_files = data.files.get(step.id, {})

        # Run the controle (reuse logic from controles router)
        responses: list[ExtractionResponse] = []
        try:
            all_fields = []
            for file_def in controle.files:
                all_fields.extend(file_def.fields)

            for file_def in controle.files:
                pdf_id = step_files.get(file_def.id)
                if not pdf_id:
                    raise ValueError(f"Missing PDF for file '{file_def.label}'")
                if not storage.pdf_exists(pdf_id):
                    raise ValueError(f"PDF {pdf_id} not found.")

                with storage.pdf_temp_path(pdf_id) as pdf_path:
                    field_results, rule_results, computed_values = extract_all_fields(
                        pdf_path=pdf_path,
                        fields=file_def.fields,
                        template_rules=controle.rules if file_def.id == controle.files[0].id else [],
                        computed_fields=controle.computedFields if file_def.id == controle.files[0].id else [],
                        template_id=controle.id,
                        series_context=series_context,
                    )

                responses.append(ExtractionResponse(
                    pdf_id=pdf_id,
                    template_id=controle.id,
                    results=field_results,
                    needs_review=any(r.status != "ok" for r in field_results),
                    template_rule_results=rule_results,
                    computed_values=computed_values,
                ))
        except Exception:
            step_results.append(ControleSeriesStepResult(
                stepId=step.id,
                controleId=step.controleId,
                controleName=step.controleName,
                status="error",
            ))
            final_status = "stopped"
            break

        # Compute step status
        total_fields = sum(len(r.results) for r in responses)
        passed_fields = sum(len([f for f in r.results if f.status == "ok"]) for r in responses)
        all_rule_results = [rr for r in responses for rr in r.template_rule_results]
        rules_passed = len([rr for rr in all_rule_results if rr.passed])
        step_passed = passed_fields == total_fields and rules_passed == len(all_rule_results)
        step_status_str = "passed" if step_passed else "failed"

        # Persist individual controle run result
        entries: list[TestRunEntry] = []
        for fi, r in enumerate(responses):
            file_label = controle.files[fi].label if fi < len(controle.files) else f"File {fi+1}"
            prefix = f"{file_label} → " if len(controle.files) > 1 else ""
            for fr in r.results:
                entries.append(TestRunEntry(
                    label=f"{prefix}{fr.label}",
                    value=fr.value or "",
                    status=fr.status,
                    table_data=fr.table_data,
                ))
        for key, val in (responses[0].computed_values.items() if responses else []):
            entries.append(TestRunEntry(label=key, value=str(val), status="computed"))

        controle_run_status = "success" if step_passed else "review" if passed_fields > 0 else "error"
        controle_run = ControleRunResult(
            id=str(uuid.uuid4()),
            controleId=controle.id,
            controleName=controle.name,
            klantId=controle.klantId,
            klantName=controle.klantName,
            status=controle_run_status,
            totalFields=total_fields,
            passedFields=passed_fields,
            failedFields=total_fields - passed_fields,
            rulesPassed=rules_passed,
            rulesTotal=len(all_rule_results),
            fileResults=[
                {
                    "fileLabel": controle.files[fi].label if fi < len(controle.files) else f"File {fi+1}",
                    "passed": len([f for f in r.results if f.status == "ok"]),
                    "total": len(r.results),
                }
                for fi, r in enumerate(responses)
            ],
            entries=entries,
            runAt=datetime.now(timezone.utc),
        )
        storage.save_controle_run(controle_run.id, controle_run.model_dump_json(indent=2))

        # Add to series context for data piping
        series_context[controle.id] = controle_run

        step_results.append(ControleSeriesStepResult(
            stepId=step.id,
            controleId=step.controleId,
            controleName=step.controleName,
            status=step_status_str,
            controleRunId=controle_run.id,
        ))

    # Persist series run
    series_run = ControleSeriesRun(
        id=str(uuid.uuid4()),
        seriesId=series.id,
        seriesName=series.name,
        klantId=series.klantId,
        klantName=series.klantName,
        status=final_status,
        stepResults=step_results,
        runAt=datetime.now(timezone.utc),
    )
    storage.save_controle_series_run(series_run.id, series_run.model_dump_json(indent=2))

    return series_run
```

- [ ] **Step 2: Register the router in main.py**

Add to `backend/main.py` imports:

```python
from routers import extract, pdfs, templates, test_runs, controles, klanten, controle_series
```

Add after `app.include_router(klanten.router)`:

```python
app.include_router(controle_series.router)
```

- [ ] **Step 3: Verify server starts**

Run: `cd /Users/alladin/Repositories/bcs/backend && timeout 5 python -c "from main import app; print('OK')" 2>&1 || true`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/routers/controle_series.py backend/main.py
git commit -m "feat: add controle series API router with CRUD and run endpoint"
```

---

### Task 5: Backend — Rule Engine series_context Integration

**Files:**
- Modify: `backend/services/extraction_service.py` (the `extract_all_fields` function signature)

- [ ] **Step 1: Find the extract_all_fields function signature**

Read `backend/services/extraction_service.py` and find the `extract_all_fields` function definition. Add an optional `series_context` parameter.

The function signature should change from:

```python
def extract_all_fields(pdf_path, fields, template_rules=None, computed_fields=None, template_id=None):
```

to:

```python
def extract_all_fields(pdf_path, fields, template_rules=None, computed_fields=None, template_id=None, series_context=None):
```

This parameter should be passed through to the `RuleEngine` when it's instantiated in the extraction flow. The exact code depends on how the `RuleEngine` is constructed in the extraction service — find where `RuleEngine(` is called and add `series_context=series_context` as an argument.

- [ ] **Step 2: Update RuleEngine to accept series_context**

In `backend/services/rule_engine.py`, find the `RuleEngine.__init__` method and add `series_context=None` parameter. Store it as `self.series_context = series_context or {}`.

Then find where the engine resolves cross-template field references (look for `test_run_id` or `resolution` handling). Before falling back to stored test runs, check if the referenced `template_id` exists in `self.series_context`. If it does, resolve the field value from `series_context[template_id].entries` instead.

The lookup logic should be:

```python
# In the method that resolves cross-template field values:
if ref.template_id and ref.template_id in self.series_context:
    run_result = self.series_context[ref.template_id]
    for entry in run_result.entries:
        if entry.label == ref.field_label or entry.label.endswith(f"→ {ref.field_label}"):
            return entry.value
```

- [ ] **Step 3: Verify the backend starts with the changes**

Run: `cd /Users/alladin/Repositories/bcs/backend && timeout 5 python -c "from services.extraction_service import extract_all_fields; print('OK')" 2>&1 || true`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/services/extraction_service.py backend/services/rule_engine.py
git commit -m "feat: add series_context to rule engine for cross-controle data piping"
```

---

### Task 6: Frontend — TypeScript Types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add series types**

Append at the end of `frontend/src/types/index.ts`:

```typescript
// --- Controle Series ---

export type SeriesStepCondition = "always" | "if_passed" | "if_failed";

export interface ControleSeriesStep {
  id: string;
  order: number;
  controleId: string;
  controleName: string;
  condition: SeriesStepCondition;
}

export interface ControleSeries {
  id: string;
  name: string;
  klantId: string;
  klantName: string;
  steps: ControleSeriesStep[];
  createdAt: string;
  updatedAt: string;
}

export type SeriesStepResultStatus = "passed" | "failed" | "skipped" | "error";

export interface ControleSeriesStepResult {
  stepId: string;
  controleId: string;
  controleName: string;
  status: SeriesStepResultStatus;
  controleRunId?: string;
}

export type SeriesRunStatus = "running" | "completed" | "stopped";

export interface ControleSeriesRun {
  id: string;
  seriesId: string;
  seriesName: string;
  klantId: string;
  klantName: string;
  status: SeriesRunStatus;
  stepResults: ControleSeriesStepResult[];
  runAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add TypeScript types for controle series"
```

---

### Task 7: Frontend — API Client

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add series API functions**

Add import of new types at the top of `frontend/src/api/client.ts` — update the import line:

```typescript
import type { Template, Field, ExtractionResponse, Region, LayoutBlock, TestRun, TemplateRule, ComputedField, Controle, ControleRunResult, Klant, ControleSeries, ControleSeriesRun } from "../types";
```

Append at the end of the file:

```typescript
// --- Controle Series ---

export async function createControleSeries(
  data: Omit<ControleSeries, "id" | "createdAt" | "updatedAt">,
): Promise<ControleSeries> {
  const response = await api.post("/controle-series", data);
  return response.data;
}

export async function listControleSeries(klantId?: string): Promise<ControleSeries[]> {
  const params = klantId ? { klantId } : {};
  const response = await api.get("/controle-series", { params });
  return response.data;
}

export async function getControleSeries(id: string): Promise<ControleSeries> {
  const response = await api.get(`/controle-series/${id}`);
  return response.data;
}

export async function updateControleSeries(
  id: string,
  data: Omit<ControleSeries, "id" | "createdAt" | "updatedAt">,
): Promise<ControleSeries> {
  const response = await api.put(`/controle-series/${id}`, data);
  return response.data;
}

export async function deleteControleSeries(id: string): Promise<void> {
  await api.delete(`/controle-series/${id}`);
}

export async function runControleSeries(
  seriesId: string,
  files: Record<string, Record<string, string>>,
): Promise<ControleSeriesRun> {
  const response = await api.post(`/controle-series/${seriesId}/run`, { files });
  return response.data;
}

export async function listControleSeriesRuns(): Promise<ControleSeriesRun[]> {
  const response = await api.get("/controle-series/runs/all");
  return response.data;
}

export async function getControleSeriesRun(runId: string): Promise<ControleSeriesRun> {
  const response = await api.get(`/controle-series/runs/${runId}`);
  return response.data;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add API client functions for controle series"
```

---

### Task 8: Frontend — SeriesBuilder Page

**Files:**
- Create: `frontend/src/pages/SeriesBuilder.tsx`

- [ ] **Step 1: Create the SeriesBuilder component**

Create `frontend/src/pages/SeriesBuilder.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, GripVertical, Trash2, Save, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HeaderAction } from "@/context/HeaderActionContext";
import { useToast } from "@/hooks/use-toast";
import {
  listKlanten,
  listControles,
  getControleSeries,
  createControleSeries,
  updateControleSeries,
} from "@/api/client";
import type { Klant, Controle, ControleSeriesStep, SeriesStepCondition } from "@/types";

export default function SeriesBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  const [name, setName] = useState("");
  const [klantId, setKlantId] = useState("");
  const [klantName, setKlantName] = useState("");
  const [steps, setSteps] = useState<ControleSeriesStep[]>([]);
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [controles, setControles] = useState<Controle[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    listKlanten().then(setKlanten).catch(() => {});
    listControles().then(setControles).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    getControleSeries(id).then((series) => {
      setName(series.name);
      setKlantId(series.klantId);
      setKlantName(series.klantName);
      setSteps(series.steps);
    }).catch(() => {
      toast({ title: "Serie niet gevonden", variant: "destructive" });
      navigate("/controles");
    });
  }, [id, toast, navigate]);

  const publishedForKlant = controles.filter(
    (c) => c.status === "published" && (!klantId || c.klantId === klantId),
  );

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        order: prev.length,
        controleId: "",
        controleName: "",
        condition: "always" as SeriesStepCondition,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
  };

  const updateStep = (idx: number, patch: Partial<ControleSeriesStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next.map((s, i) => ({ ...s, order: i }));
    });
    setDragIdx(idx);
  };

  const handleSave = useCallback(async () => {
    if (!name.trim() || !klantId) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), klantId, klantName, steps };
      if (isEditing) {
        await updateControleSeries(id!, payload);
        toast({ title: "Serie opgeslagen" });
      } else {
        const created = await createControleSeries(payload);
        toast({ title: "Serie aangemaakt" });
        navigate(`/controle-series/${created.id}`);
      }
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [name, klantId, klantName, steps, isEditing, id, navigate, toast]);

  const conditionLabels: Record<SeriesStepCondition, string> = {
    always: "Altijd",
    if_passed: "Als vorige geslaagd",
    if_failed: "Als vorige gefaald",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <HeaderAction>
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim() || !klantId}
          className="rounded-full shadow-lg"
          size="sm"
        >
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Opslaan..." : "Opslaan"}
        </Button>
      </HeaderAction>

      {/* Name + Klant */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="series-name">Naam</Label>
          <Input
            id="series-name"
            placeholder="Bijv. Jaarrekening serie 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="series-klant">Klant</Label>
          <Select
            value={klantId}
            onValueChange={(val) => {
              setKlantId(val);
              const k = klanten.find((k) => k.id === val);
              setKlantName(k?.name ?? "");
            }}
          >
            <SelectTrigger id="series-klant">
              <SelectValue placeholder="Selecteer een klant" />
            </SelectTrigger>
            <SelectContent>
              {klanten.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Stappen</h2>

        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nog geen stappen toegevoegd. Voeg een stap toe om te beginnen.
          </p>
        )}

        {steps.map((step, idx) => (
          <Card
            key={step.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={() => setDragIdx(null)}
            className={`transition-opacity ${dragIdx === idx ? "opacity-50" : ""}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="cursor-grab pt-2 text-muted-foreground hover:text-foreground">
                  <GripVertical className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-6 w-6 flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <Select
                      value={step.controleId}
                      onValueChange={(val) => {
                        const c = publishedForKlant.find((c) => c.id === val);
                        updateStep(idx, { controleId: val, controleName: c?.name ?? "" });
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecteer controle" />
                      </SelectTrigger>
                      <SelectContent>
                        {publishedForKlant.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground shrink-0">Voorwaarde:</Label>
                    <Select
                      value={step.condition}
                      onValueChange={(val) => updateStep(idx, { condition: val as SeriesStepCondition })}
                      disabled={idx === 0}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(conditionLabels) as [SeriesStepCondition, string][]).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeStep(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button variant="outline" onClick={addStep} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Stap toevoegen
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/SeriesBuilder.tsx
git commit -m "feat: add SeriesBuilder page for creating/editing series"
```

---

### Task 9: Frontend — SeriesDetail Page

**Files:**
- Create: `frontend/src/pages/SeriesDetail.tsx`

- [ ] **Step 1: Create the SeriesDetail component**

Create `frontend/src/pages/SeriesDetail.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Pencil, Play, Trash2, CheckCircle, XCircle, SkipForward, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeaderAction } from "@/context/HeaderActionContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getControleSeries, deleteControleSeries, listControleSeriesRuns } from "@/api/client";
import type { ControleSeries, ControleSeriesRun, SeriesStepResultStatus } from "@/types";

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [series, setSeries] = useState<ControleSeries | null>(null);
  const [runs, setRuns] = useState<ControleSeriesRun[]>([]);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getControleSeries(id).then(setSeries).catch(() => {
      toast({ title: "Serie niet gevonden", variant: "destructive" });
      navigate("/controles");
    });
    listControleSeriesRuns().then((allRuns) => {
      setRuns(allRuns.filter((r) => r.seriesId === id));
    }).catch(() => {});
  }, [id, toast, navigate]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteControleSeries(id);
      toast({ title: "Serie verwijderd" });
      navigate("/controles");
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

  const formatTime = (date: string) =>
    new Date(date).toLocaleDateString("nl-NL", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });

  const conditionLabels = {
    always: "Altijd",
    if_passed: "Als vorige geslaagd",
    if_failed: "Als vorige gefaald",
  };

  const stepStatusIcon = (status: SeriesStepResultStatus) => {
    switch (status) {
      case "passed": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "skipped": return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      case "error": return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
  };

  if (!series) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <HeaderAction>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => navigate(`/controle-series/${id}/edit`)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Bewerken
          </Button>
          <Button
            size="sm"
            className="rounded-full shadow-lg"
            onClick={() => navigate(`/controle-series/${id}/run`)}
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            Uitvoeren
          </Button>
        </div>
      </HeaderAction>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{series.name}</h1>
        <p className="text-sm text-muted-foreground">
          {series.klantName} · {series.steps.length} stap{series.steps.length !== 1 ? "pen" : ""} · aangemaakt {formatDate(series.createdAt)}
        </p>
      </div>

      {/* Steps overview */}
      <Card>
        <CardHeader>
          <CardTitle>Stappen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {series.steps
            .sort((a, b) => a.order - b.order)
            .map((step, idx) => (
              <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg border">
                <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-6 w-6 flex items-center justify-center">
                  {idx + 1}
                </span>
                <span className="font-medium flex-1">{step.controleName || "—"}</span>
                <Badge variant="outline" className="text-xs">
                  {conditionLabels[step.condition]}
                </Badge>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Run history */}
      <Card>
        <CardHeader>
          <CardTitle>Uitvoergeschiedenis</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nog niet uitgevoerd
            </p>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => (
                <div key={run.id} className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{formatTime(run.runAt)}</span>
                    <Badge
                      variant="outline"
                      className={
                        run.status === "completed"
                          ? "text-success border-success/30 bg-success/10"
                          : "text-warning border-warning/30 bg-warning/10"
                      }
                    >
                      {run.status === "completed" ? "Voltooid" : "Gestopt"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    {run.stepResults.map((sr) => (
                      <div key={sr.stepId} className="flex items-center gap-1">
                        {stepStatusIcon(sr.status)}
                        <span className="text-xs text-muted-foreground">{sr.controleName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete */}
      <div className="flex justify-end">
        <Button variant="outline" className="text-destructive" onClick={() => setShowDelete(true)}>
          <Trash2 className="h-4 w-4 mr-2" />
          Serie verwijderen
        </Button>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Serie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je "{series.name}" wilt verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/SeriesDetail.tsx
git commit -m "feat: add SeriesDetail page with steps overview and run history"
```

---

### Task 10: Frontend — RunSeries Page

**Files:**
- Create: `frontend/src/pages/RunSeries.tsx`

- [ ] **Step 1: Create the RunSeries component**

Create `frontend/src/pages/RunSeries.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Play, Upload, Loader2, CheckCircle, XCircle, SkipForward,
  AlertTriangle, FileText, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeaderAction } from "@/context/HeaderActionContext";
import { useToast } from "@/hooks/use-toast";
import {
  getControleSeries,
  getControle,
  uploadPdf,
  runControleSeries,
} from "@/api/client";
import type {
  ControleSeries,
  Controle,
  ControleSeriesStep,
  ControleSeriesRun,
  SeriesStepResultStatus,
} from "@/types";

type Phase = "upload" | "running" | "results";

interface StepUploadState {
  step: ControleSeriesStep;
  controle: Controle | null;
  files: Record<string, { pdfId: string; filename: string }>;
}

export default function RunSeries() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [series, setSeries] = useState<ControleSeries | null>(null);
  const [stepStates, setStepStates] = useState<StepUploadState[]>([]);
  const [phase, setPhase] = useState<Phase>("upload");
  const [uploading, setUploading] = useState<string | null>(null);
  const [result, setResult] = useState<ControleSeriesRun | null>(null);
  const [expandedStep, setExpandedStep] = useState<number>(0);

  useEffect(() => {
    if (!id) return;
    getControleSeries(id).then(async (s) => {
      setSeries(s);
      const sorted = [...s.steps].sort((a, b) => a.order - b.order);
      const states: StepUploadState[] = [];
      for (const step of sorted) {
        let controle: Controle | null = null;
        try {
          controle = await getControle(step.controleId);
        } catch { /* skip */ }
        states.push({ step, controle, files: {} });
      }
      setStepStates(states);
    }).catch(() => {
      toast({ title: "Serie niet gevonden", variant: "destructive" });
      navigate("/controles");
    });
  }, [id, toast, navigate]);

  const handleUploadFile = useCallback(async (stepIdx: number, fileDefId: string, file: File) => {
    if (file.type !== "application/pdf") return;
    const key = `${stepIdx}_${fileDefId}`;
    setUploading(key);
    try {
      const { pdf_id } = await uploadPdf(file);
      setStepStates((prev) =>
        prev.map((s, i) =>
          i === stepIdx
            ? { ...s, files: { ...s.files, [fileDefId]: { pdfId: pdf_id, filename: file.name } } }
            : s,
        ),
      );
    } catch {
      toast({ title: "Upload mislukt", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }, [toast]);

  const allUploaded = stepStates.every(
    (s) => s.controle?.files.every((f) => s.files[f.id]) ?? false,
  );

  const handleRun = useCallback(async () => {
    if (!series || !allUploaded) return;
    setPhase("running");
    try {
      const files: Record<string, Record<string, string>> = {};
      for (const s of stepStates) {
        const stepFiles: Record<string, string> = {};
        for (const [fileId, upload] of Object.entries(s.files)) {
          stepFiles[fileId] = upload.pdfId;
        }
        files[s.step.id] = stepFiles;
      }
      const res = await runControleSeries(series.id, files);
      setResult(res);
      setPhase("results");
    } catch {
      toast({ title: "Uitvoeren mislukt", variant: "destructive" });
      setPhase("upload");
    }
  }, [series, stepStates, allUploaded, toast]);

  const stepStatusIcon = (status: SeriesStepResultStatus) => {
    switch (status) {
      case "passed": return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed": return <XCircle className="h-5 w-5 text-red-500" />;
      case "skipped": return <SkipForward className="h-5 w-5 text-muted-foreground" />;
      case "error": return <AlertTriangle className="h-5 w-5 text-red-500" />;
    }
  };

  const conditionLabels = {
    always: "Altijd",
    if_passed: "Als vorige geslaagd",
    if_failed: "Als vorige gefaald",
  };

  if (!series) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <HeaderAction>
        {phase === "results" && (
          <Button
            variant="outline"
            className="rounded-full"
            size="sm"
            onClick={() => {
              setPhase("upload");
              setResult(null);
              setStepStates((prev) => prev.map((s) => ({ ...s, files: {} })));
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Opnieuw uitvoeren
          </Button>
        )}
      </HeaderAction>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{series.name}</h1>
        <p className="text-sm text-muted-foreground">
          {series.klantName} · {series.steps.length} stap{series.steps.length !== 1 ? "pen" : ""}
        </p>
      </div>

      {/* Upload phase */}
      {phase === "upload" && (
        <div className="space-y-6">
          {stepStates.map((state, stepIdx) => {
            const isExpanded = expandedStep === stepIdx;
            const stepComplete = state.controle?.files.every((f) => state.files[f.id]) ?? false;
            return (
              <Card key={state.step.id} className={stepComplete ? "border-green-200 dark:border-green-800" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => setExpandedStep(isExpanded ? -1 : stepIdx)}
                  >
                    <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-6 w-6 flex items-center justify-center shrink-0">
                      {stepIdx + 1}
                    </span>
                    <span className="font-medium flex-1">{state.step.controleName}</span>
                    {stepIdx > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {conditionLabels[state.step.condition]}
                      </Badge>
                    )}
                    {stepComplete && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                  </div>
                  {isExpanded && state.controle && (
                    <div className="pl-9 space-y-2">
                      {state.controle.files.map((fileDef) => {
                        const upload = state.files[fileDef.id];
                        const isUpl = uploading === `${stepIdx}_${fileDef.id}`;
                        return (
                          <div
                            key={fileDef.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                              upload ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10" : "border-dashed"
                            }`}
                          >
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{fileDef.label}</p>
                              {upload && <p className="text-xs text-green-600">{upload.filename}</p>}
                            </div>
                            {isUpl ? (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            ) : (
                              <Button
                                variant={upload ? "ghost" : "outline"}
                                size="sm"
                                onClick={() => {
                                  const input = document.createElement("input");
                                  input.type = "file";
                                  input.accept = "application/pdf";
                                  input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) handleUploadFile(stepIdx, fileDef.id, file);
                                  };
                                  input.click();
                                }}
                              >
                                {upload ? "Wijzig" : (
                                  <>
                                    <Upload className="h-3.5 w-3.5 mr-1" />
                                    PDF
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Button size="lg" className="w-full" disabled={!allUploaded} onClick={handleRun}>
            <Play className="h-4 w-4 mr-2" />
            Serie uitvoeren
          </Button>
        </div>
      )}

      {/* Running phase */}
      {phase === "running" && (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <h2 className="text-lg font-semibold">Serie wordt uitgevoerd...</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Stappen worden sequentieel verwerkt.
          </p>
        </div>
      )}

      {/* Results phase */}
      {phase === "results" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={
                result.status === "completed"
                  ? "text-success border-success/30 bg-success/10"
                  : "text-warning border-warning/30 bg-warning/10"
              }
            >
              {result.status === "completed" ? "Voltooid" : "Gestopt"}
            </Badge>
          </div>

          {result.stepResults.map((sr, idx) => (
            <Card key={sr.stepId}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-6 w-6 flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                {stepStatusIcon(sr.status)}
                <span className="font-medium flex-1">{sr.controleName}</span>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    sr.status === "passed" ? "text-success border-success/30 bg-success/10"
                    : sr.status === "failed" ? "text-destructive border-destructive/30 bg-destructive/10"
                    : sr.status === "skipped" ? "text-muted-foreground"
                    : "text-destructive border-destructive/30 bg-destructive/10"
                  }`}
                >
                  {sr.status === "passed" ? "Geslaagd" : sr.status === "failed" ? "Gefaald" : sr.status === "skipped" ? "Overgeslagen" : "Fout"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/RunSeries.tsx
git commit -m "feat: add RunSeries page with step-by-step upload and execution"
```

---

### Task 11: Frontend — Routes and Sidebar

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/AppSidebar.tsx`

- [ ] **Step 1: Add routes to App.tsx**

Add imports at the top of `frontend/src/App.tsx`:

```typescript
import SeriesBuilder from "./pages/SeriesBuilder";
import SeriesDetail from "./pages/SeriesDetail";
import RunSeries from "./pages/RunSeries";
```

Add routes after the `/controles` route (line 50):

```tsx
                <Route path="/controle-series/nieuw" element={<ProtectedPage><SeriesBuilder /></ProtectedPage>} />
                <Route path="/controle-series/:id" element={<ProtectedPage><SeriesDetail /></ProtectedPage>} />
                <Route path="/controle-series/:id/edit" element={<ProtectedPage><SeriesBuilder /></ProtectedPage>} />
                <Route path="/controle-series/:id/run" element={<ProtectedPage><RunSeries /></ProtectedPage>} />
```

- [ ] **Step 2: Add sidebar navigation**

In `frontend/src/components/layout/AppSidebar.tsx`, add the `Layers` icon to the import:

```typescript
import { Home, Users, Settings, ChevronDown, ClipboardCheck, LogOut, BookOpen, ListChecks, MoreVertical, Sun, Moon, Monitor, Layers } from "lucide-react";
```

Add a new `SidebarMenuItem` after the "Mijn controles" item (after line 117) and before the "Klanten" item:

```tsx
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/controle-series"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm"
                  >
                    <Layers className="h-5 w-5" />
                    <span>Series</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
```

Wait — we need a page for `/controle-series` (the list). We don't have a dedicated list page yet. Let's add a route that goes to MyControls with a "series" tab, or create a simple series list page. Since the existing MyControls already has a tab system, let's add a dedicated route for the series list.

Actually, let's keep it simple: the sidebar "Series" link goes to `/controle-series` which we'll make a simple list page.

- [ ] **Step 3: Create SeriesList page**

Create `frontend/src/pages/SeriesList.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Layers, Play, Pencil, MoreHorizontal, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { HeaderAction } from "@/context/HeaderActionContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listControleSeries, deleteControleSeries } from "@/api/client";
import { useToast } from "@/hooks/use-toast";
import type { ControleSeries } from "@/types";

export default function SeriesList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [seriesList, setSeriesList] = useState<ControleSeries[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ControleSeries | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    listControleSeries().then(setSeriesList).catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteControleSeries(deleteTarget.id);
      setSeriesList((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      toast({ title: "Serie verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const filtered = seriesList.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.klantName.toLowerCase().includes(search.toLowerCase()),
  );

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      <HeaderAction>
        <Button onClick={() => navigate("/controle-series/nieuw")} className="rounded-full shadow-lg" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nieuwe serie
        </Button>
      </HeaderAction>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Zoek op naam of klant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 rounded-full"
        />
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Klant</TableHead>
                <TableHead>Stappen</TableHead>
                <TableHead>Aangemaakt</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/controle-series/${s.id}`)}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.klantName}</TableCell>
                  <TableCell className="text-muted-foreground">{s.steps.length}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/controle-series/${s.id}`)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Bekijken
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/controle-series/${s.id}/edit`)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Bewerken
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/controle-series/${s.id}/run`)}>
                          <Play className="h-4 w-4 mr-2" />
                          Uitvoeren
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(s)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Verwijderen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">Nog geen series aangemaakt</p>
                    <Button
                      variant="link"
                      className="mt-2"
                      onClick={() => navigate("/controle-series/nieuw")}
                    >
                      Maak je eerste serie
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Serie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je "{deleteTarget?.name}" wilt verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: Add SeriesList route to App.tsx**

Add import:

```typescript
import SeriesList from "./pages/SeriesList";
```

Add route:

```tsx
                <Route path="/controle-series" element={<ProtectedPage><SeriesList /></ProtectedPage>} />
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/AppSidebar.tsx frontend/src/pages/SeriesList.tsx
git commit -m "feat: add series routes, sidebar navigation, and series list page"
```

---

### Task 12: Frontend — ClientDetail Integration

**Files:**
- Modify: `frontend/src/pages/ClientDetail.tsx`

- [ ] **Step 1: Add series section to ClientDetail**

Add imports at the top of `frontend/src/pages/ClientDetail.tsx`:

```typescript
import { listControleSeries } from "@/api/client";
import type { ControleSeries } from "@/types";
```

Update the existing import line to include `Layers`:

```typescript
import { Plus, CheckCircle, AlertTriangle, ChevronRight, FileText, Clock, Pencil, Play, Layers } from "lucide-react";
```

Add state for series:

```typescript
const [series, setSeries] = useState<ControleSeries[]>([]);
```

In the `useEffect` that loads data, add `listControleSeries(clientId)` to the `Promise.all`:

```typescript
Promise.all([
  getKlant(clientId),
  listControles(),
  listControleRuns(),
  listControleSeries(clientId),
])
  .then(([klant, allControles, allRuns, klantSeries]) => {
    setClient(klant);
    setControles(allControles.filter((c) => c.klantId === clientId));
    setControlRuns(allRuns.filter((r) => r.klantId === clientId));
    setSeries(klantSeries);
  })
```

Add a new Card section between the Controles card and the Controlegeschiedenis card:

```tsx
      {/* Series for this klant */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Series</CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">Nog geen series voor deze klant</p>
            </div>
          ) : (
            <div className="space-y-2">
              {series.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border"
                  onClick={() => navigate(`/controle-series/${s.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium">{s.name}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{s.steps.length} stappen</span>
                        <span>{formatDate(s.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ClientDetail.tsx
git commit -m "feat: show controle series on klant detail page"
```

---

### Task 13: Smoke Test

- [ ] **Step 1: Start backend and verify series endpoints**

Run: `cd /Users/alladin/Repositories/bcs/backend && timeout 5 python -c "
from fastapi.testclient import TestClient
from main import app
client = TestClient(app)

# Create series
resp = client.post('/controle-series', json={
    'name': 'Test serie',
    'klantId': 'k1',
    'klantName': 'Test Klant',
    'steps': []
})
print('CREATE:', resp.status_code)
series_id = resp.json()['id']

# List series
resp = client.get('/controle-series')
print('LIST:', resp.status_code, len(resp.json()))

# Get series
resp = client.get(f'/controle-series/{series_id}')
print('GET:', resp.status_code)

# Update series
resp = client.put(f'/controle-series/{series_id}', json={
    'name': 'Updated serie',
    'klantId': 'k1',
    'klantName': 'Test Klant',
    'steps': []
})
print('UPDATE:', resp.status_code)

# Delete series
resp = client.delete(f'/controle-series/{series_id}')
print('DELETE:', resp.status_code)
" 2>&1 || true`

Expected:
```
CREATE: 200
LIST: 200 1
GET: 200
UPDATE: 200
DELETE: 200
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors (or existing errors unrelated to our changes).

- [ ] **Step 3: Commit if any fixes were needed**

Only commit if fixes were required:

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
