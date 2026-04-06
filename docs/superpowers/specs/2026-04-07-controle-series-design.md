# Controle Series Design

Chain multiple controles to run in sequence for a klant, with conditional execution and data piping between steps.

## Data Model

### ControleSeries

Stored in `/backend/storage/controle_series/{id}.json`

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique identifier |
| name | string | Series name |
| klantId | string | Associated customer (required) |
| klantName | string | Denormalized customer name |
| steps | ControleSeriesStep[] | Ordered list of steps |
| createdAt | datetime | Creation timestamp |
| updatedAt | datetime | Last update timestamp |

### ControleSeriesStep

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Step identifier |
| order | int | Execution order (0-based) |
| controleId | string | Reference to published controle |
| controleName | string | Denormalized for display |
| condition | "always" \| "if_passed" \| "if_failed" | When to execute this step |

The first step's condition is always `"always"` (enforced by the UI — condition dropdown disabled on step 0).

### ControleSeriesRun

Stored in `/backend/storage/controle_series_runs/{id}.json`

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Run identifier |
| seriesId | string | Reference to series |
| seriesName | string | Denormalized |
| klantId | string | Customer |
| klantName | string | Denormalized |
| status | "running" \| "completed" \| "stopped" | Overall run status |
| stepResults | ControleSeriesStepResult[] | Per-step outcomes |
| runAt | datetime | Execution timestamp |

`"stopped"` means a step's condition was not met and execution halted.

### ControleSeriesStepResult

| Field | Type | Description |
|-------|------|-------------|
| stepId | string | Reference to step |
| controleId | string | Reference to controle |
| controleName | string | Denormalized |
| status | "passed" \| "failed" \| "skipped" \| "error" | Step outcome |
| controleRunId | string \| null | Links to the ControleRunResult produced by this step |

## API Endpoints

New router: `/backend/routers/controle_series.py`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/controle-series` | Create a new series |
| GET | `/controle-series` | List all series (filterable by `klantId` query param) |
| GET | `/controle-series/{id}` | Get single series |
| PUT | `/controle-series/{id}` | Update series (name, steps, conditions) |
| DELETE | `/controle-series/{id}` | Delete series |
| POST | `/controle-series/{id}/run` | Execute series with PDFs per step |
| GET | `/controle-series/runs/all` | List all series run results |
| GET | `/controle-series/runs/{id}` | Get single series run result |

### Run Endpoint

`POST /controle-series/{id}/run` accepts multipart form data with PDFs keyed by step ID and file label (e.g., `step_0_file_Invoice`).

Execution logic:

1. Load series definition
2. Iterate steps in order
3. For each step: evaluate condition against previous step's result
4. If condition met: run the controle with its PDFs, passing `series_context` to the rule engine
5. If condition not met: mark step as `skipped`, stop execution
6. Store the `ControleSeriesRun` result

## Rule Engine Integration (Data Piping)

The `RuleEngine` constructor receives a new optional parameter:

```python
series_context: dict[str, ControleRunResult] | None = None
```

When a rule operand references a field from another controle (via existing `FieldRef` with `controle_id`), the engine checks `series_context` for a matching controle's run result before falling back to stored test runs.

This means controles don't need to "know" they're in a series. They're authored independently with cross-controle field references in their rules. The series provides the live runtime data.

No changes to the rule definition schema — existing `FieldRef` already supports cross-controle references.

## Frontend

### New Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/controle-series/nieuw` | `SeriesBuilder.tsx` | Create new series |
| `/controle-series/{id}` | `SeriesDetail.tsx` | View series and run history |
| `/controle-series/{id}/edit` | `SeriesBuilder.tsx` | Edit existing series |
| `/controle-series/{id}/run` | `RunSeries.tsx` | Upload PDFs, execute, view progress |

### Navigation

Add "Series" to the sidebar under the CONTROLES group, between "Mijn controles" and "Klanten".

### SeriesBuilder UI

- **Top:** Series name input + klant dropdown (required)
- **Steps list:** Ordered cards, each showing:
  - Controle name dropdown (published controles filtered by selected klant)
  - Condition dropdown: "Altijd" / "Als vorige geslaagd" / "Als vorige gefaald" (disabled on first step)
  - Drag handle for reordering
  - Delete button
- **Bottom:** "Stap toevoegen" button
- **Header:** "Opslaan" / "Verwijderen" buttons

### RunSeries UI

- Vertical stepper showing each step
- Each step expands to show file upload slots (same pattern as RunControle, scoped per step)
- "Uitvoeren" button starts execution
- Progress updates live as each step completes: pass/fail/skipped per step
- Final summary at the bottom

### ClientDetail Integration

Show the klant's series on their detail page alongside their controles.

## Storage & Persistence

- New store: `/backend/services/controle_series_store.py` (mirrors `controle_store.py`)
- Storage directories created on first write:
  - `/backend/storage/controle_series/`
  - `/backend/storage/controle_series_runs/`
- Pydantic models added to `/backend/models/schemas.py`
- TypeScript types added to `/frontend/src/types/index.ts`
- API client functions added to `/frontend/src/api/client.ts`

No migration needed — file-based storage.

## Scope

### In Scope

- CRUD for series (create, read, update, delete)
- Sequential execution with condition checking per step
- Data piping via series_context in the rule engine
- Run history tracking
- Sidebar navigation
- Client detail page integration

### Out of Scope

- Parallel step execution
- Complex branching (if/else trees) — only linear chains with simple conditions
- Visual flow builder (React Flow canvas) — linear list only
- Scheduling / automated series runs
