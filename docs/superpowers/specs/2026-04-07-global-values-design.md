# Global Values ("Globale waarden") — Design Spec

## Overview

Add a "Globale waarden" tab to the Mijn controles page where users can manage shared global value groups. These groups contain named values (text, number, date, boolean) that can be imported as input nodes in the rules canvas. Groups are versioned — updating any value auto-increments the group version. Rules always resolve the latest value at evaluation time.

## Data Model

### GlobalValueGroup

One JSON file per group, stored in `/storage/global_values/{id}.json`.

```json
{
  "id": "uuid",
  "name": "Loonheffing 2026",
  "version": 1,
  "values": [
    {
      "id": "uuid",
      "name": "Minimumloon",
      "dataType": "number",
      "value": "1995.00"
    },
    {
      "id": "uuid",
      "name": "Startdatum",
      "dataType": "date",
      "value": "2026-01-01"
    }
  ],
  "createdAt": "2026-04-07T12:00:00Z",
  "updatedAt": "2026-04-07T12:00:00Z"
}
```

**Fields:**
- `id` — UUID, generated on creation
- `name` — Custom group name (e.g. "Loonheffing 2026")
- `version` — Integer starting at 1, auto-incremented when any value is added, removed, or changed on save
- `values` — Array of value entries
  - `id` — UUID per value
  - `name` — Display name (e.g. "Minimumloon")
  - `dataType` — One of: `"text"`, `"number"`, `"date"`, `"boolean"`
  - `value` — Stored as string, parsed by `dataType` at evaluation time
- `createdAt` / `updatedAt` — ISO datetime strings

### Rules canvas node data

When a global value is added as a node on the rules canvas:

```typescript
{
  nodeType: "global_value_input",
  label: "Minimumloon",
  globalGroupId: "uuid",
  globalValueId: "uuid",
  groupName: "Loonheffing 2026",
  dataType: "number"
}
```

### Serialized operand

In `serializeGraph.ts`, a `global_value_input` node produces an operand:

```typescript
{
  type: "global_value",
  globalGroupId: "uuid",
  globalValueId: "uuid"
}
```

## Backend

### API Router — `/global-values`

New file: `backend/routers/global_values.py`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/global-values` | Create a new group (name + initial values). Version starts at 1. |
| `GET` | `/global-values` | List all groups. |
| `GET` | `/global-values/{id}` | Get single group with all values. |
| `PUT` | `/global-values/{id}` | Update group. Compares incoming values against stored values — if any value name, dataType, or value field differs, or values were added/removed, auto-increments version. |
| `DELETE` | `/global-values/{id}` | Delete group. |

### Pydantic Schemas — `backend/models/schemas.py`

```python
class GlobalValue(BaseModel):
    id: str
    name: str
    dataType: Literal["text", "number", "date", "boolean"]
    value: str

class GlobalValueGroup(BaseModel):
    id: str
    name: str
    version: int = 1
    values: list[GlobalValue] = []
    createdAt: str
    updatedAt: str
```

### Storage — `backend/services/global_value_store.py`

Follows the same pattern as `controle_store.py` and `klant_store.py`:
- Uses `StorageBackend` for local JSON / Azure Blob abstraction
- Directory: `/storage/global_values/`
- One `{id}.json` file per group

### Rule Engine — `backend/services/rule_engine.py`

When resolving operands:
- If operand type is `"global_value"`, load the group from storage by `globalGroupId`
- Find the value entry by `globalValueId`
- Parse the stored string value by `dataType`:
  - `text` → `str`
  - `number` → `float`
  - `date` → `datetime`
  - `boolean` → `bool`
- Return the parsed value as the operand

**Error handling:**
- Group or value ID not found (deleted after node was placed): return an error result for that rule, do not crash
- Empty/null value: treated same as an empty field input

## Frontend

### Types — `frontend/src/types/index.ts`

```typescript
interface GlobalValue {
  id: string
  name: string
  dataType: "text" | "number" | "date" | "boolean"
  value: string
}

interface GlobalValueGroup {
  id: string
  name: string
  version: number
  values: GlobalValue[]
  createdAt: string
  updatedAt: string
}
```

Add `"global_value_input"` to the `RuleNodeType` union.

Add to `RuleNodeData`:
```typescript
globalGroupId?: string
globalValueId?: string
groupName?: string
```

### API Client — `frontend/src/api/client.ts`

New functions:
- `getGlobalValueGroups(): Promise<GlobalValueGroup[]>`
- `getGlobalValueGroup(id: string): Promise<GlobalValueGroup>`
- `createGlobalValueGroup(data): Promise<GlobalValueGroup>`
- `updateGlobalValueGroup(id: string, data): Promise<GlobalValueGroup>`
- `deleteGlobalValueGroup(id: string): Promise<void>`

### Mijn controles page — `frontend/src/pages/MyControls.tsx`

Add a third tab: **"Globale waarden"** alongside "Controles" and "Resultaten".

**Tab content:**
- Search bar filtering groups by name
- "+ Nieuwe groep" button (top right)
- Table with columns: **Naam**, **Waarden** (count), **Versie**, **Laatst bijgewerkt**, **Acties** (edit/delete via dropdown)

**Group editing:**
- Click a group row to expand inline, showing an editable table of values
- Each value row: **Naam** (text input), **Type** (dropdown: text/number/date/boolean), **Waarde** (type-appropriate input), delete button
- "+ Waarde toevoegen" button to add a new value row
- "Opslaan" button saves changes → auto-increments version if anything changed
- Creating a new group opens same UI but empty

**Styling:** Same shadcn table components, spacing, and patterns as the existing Controles tab.

### Rules Canvas — Add Node Popover — `frontend/src/components/rules/RulesPanel.tsx`

Under the **"Input"** category in `NODE_MENU_ITEMS`, add:
- **"Globale waarde"** with a globe icon
- Clicking opens a nested picker: select group → select value
- Places a `global_value_input` node on the canvas

### Node Component — `frontend/src/components/rules/RuleNodes.tsx`

New `GlobalValueNode` component:
- Displays: value name (label), group name (small badge), current value (preview), data type indicator
- Distinct color (amber/orange) to differentiate from field inputs and literals
- Read-only — no editable fields on the node
- Single output handle
- Connectable to math, comparison, validation, condition nodes (same rules as `literal_input`)

### Serialization — `frontend/src/components/rules/serializeGraph.ts`

When serializing:
- `global_value_input` nodes produce operands with `type: "global_value"` and `{ globalGroupId, globalValueId }`
- Backend rule engine recognizes this operand type and resolves the live value

### Connection Rules — `frontend/src/components/rules/RulesPanel.tsx`

`global_value_input` follows same connection rules as `literal_input` — output can connect to any node that accepts an input value.

## Change Summary

| Layer | File | Change |
|-------|------|--------|
| Backend model | `models/schemas.py` | Add `GlobalValue`, `GlobalValueGroup` schemas |
| Backend storage | `services/global_value_store.py` | New file — CRUD for global value groups |
| Backend API | `routers/global_values.py` | New file — 5 endpoints |
| Backend app | `main.py` | Register new router |
| Backend rule engine | `services/rule_engine.py` | Add `global_value` operand resolution |
| Frontend types | `types/index.ts` | Add interfaces, extend `RuleNodeType` and `RuleNodeData` |
| Frontend API | `api/client.ts` | Add 5 new API functions |
| Frontend page | `pages/MyControls.tsx` | Add "Globale waarden" tab with group management UI |
| Frontend canvas | `components/rules/RulesPanel.tsx` | Add "Globale waarde" to Input category with group/value picker |
| Frontend node | `components/rules/RuleNodes.tsx` | Add `GlobalValueNode` component |
| Frontend serialization | `components/rules/serializeGraph.ts` | Handle `global_value_input` operand type |
