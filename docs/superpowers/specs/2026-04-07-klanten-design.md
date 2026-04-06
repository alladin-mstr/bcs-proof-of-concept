# Klanten Feature — Design Spec

## Overview

Add persistent customer (klant) management to BCS. Klanten are selectable when creating a new controle, and controle run results are visible on the klant detail page.

Currently, klanten exist only as in-memory demo data in `TaskContext`. This feature adds full backend persistence (following the controle pattern) and rewires the frontend to use real API calls.

## Backend

### Klant Schema (`backend/models/schemas.py`)

```python
class KlantCreate(BaseModel):
    name: str
    medewerkerCount: int | None = None

class Klant(BaseModel):
    id: str
    name: str
    medewerkerCount: int | None = None
    createdAt: datetime
    updatedAt: datetime
```

### Storage Layer (`backend/services/storage_backend.py`)

Extend `StorageBackend` abstract class with:
- `save_klant(klant_id, content)`
- `get_klant(klant_id) -> str | None`
- `list_klant_ids() -> list[str]`
- `delete_klant(klant_id) -> bool`

Implement in both `LocalStorageBackend` (new `storage/klanten/` directory) and `AzureBlobStorageBackend` (new container config).

### Store Service (`backend/services/klant_store.py`)

Functions: `save_klant`, `get_klant`, `list_klanten`, `update_klant`, `delete_klant` — following the exact same pattern as `controle_store.py`.

### Router (`backend/routers/klanten.py`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/klanten` | Create klant |
| GET | `/klanten` | List all klanten |
| GET | `/klanten/{id}` | Get one klant |
| PUT | `/klanten/{id}` | Update klant |
| DELETE | `/klanten/{id}` | Delete klant |

Register in `main.py` via `app.include_router(klanten.router)`.

### Controle Schema Changes

Add to both `ControleCreate` and `Controle`:
- `klantId: str | None = None`
- `klantName: str | None = None`

Add to `ControleRunResult`:
- `klantId: str | None = None`
- `klantName: str | None = None`

The run endpoint (`POST /controles/{id}/run`) copies `klantId`/`klantName` from the controle into the persisted `ControleRunResult`.

## Frontend

### Types (`frontend/src/types/index.ts`)

```typescript
export interface Klant {
  id: string;
  name: string;
  medewerkerCount?: number;
  createdAt: string;
  updatedAt: string;
}
```

Add `klantId?: string` and `klantName?: string` to `Controle` and `ControleRunResult` interfaces.

### API Client (`frontend/src/api/client.ts`)

- `createKlant(data: { name: string; medewerkerCount?: number })` — POST `/klanten`
- `listKlanten()` — GET `/klanten`
- `getKlant(id)` — GET `/klanten/{id}`
- `updateKlant(id, data)` — PUT `/klanten/{id}`
- `deleteKlant(id)` — DELETE `/klanten/{id}`

### Zustand Store (`appStore.ts`)

Add to wizard state:
- `klantId: string | null`
- `klantName: string | null`

`initWizard` accepts optional `klantId`/`klantName`. `finalizeWizard` includes them in output.

### UI Changes

**MyControls.tsx — "New controle" dialog:**
- Add klant dropdown below the name field
- Fetch klanten on dialog open via `listKlanten()`
- On submit, navigate to `/controle/nieuw?naam={name}&klantId={id}&klantName={name}`
- Support `?newForKlant={klantId}` query param to pre-select klant (used from klant detail page)

**ControleWizard.tsx:**
- Read `klantId`/`klantName` from URL search params
- Pass to `initWizard`
- Include in `createControle` / `updateControle` calls
- Display klant name as read-only subtitle

**Clients.tsx — Replace demo data:**
- Fetch from `listKlanten()` instead of `TaskContext.getAllClients()`
- "Nieuwe klant" dialog calls `createKlant({ name, medewerkerCount })`
- Delete calls `deleteKlant(id)`
- Remove `TaskContext` dependency

**ClientDetail.tsx — Replace demo data:**
- Fetch klant from `getKlant(id)`
- Fetch runs from `listControleRuns()`, filter by `run.klantId === klantId`
- "Nieuwe controle" button navigates to `/controles?newForKlant={klantId}`
- Display real run history grouped by month

**ControleDetail.tsx:**
- Display linked klant name with link to `/klanten/{klantId}` if present

**MyControls.tsx — Results tab:**
- Show `klantName` column in the results table

### TaskContext Cleanup

Remove from `TaskContext.tsx`:
- `clients` state and `sampleClients` import
- `addClient`, `deleteClient`, `getTeamClients`, `getAllClients`, `getClientById`
- `getClientControlRuns`

Keep all other demo data (templates, controlRuns, teams) untouched.
