# Global Values ("Globale waarden") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared global value groups (with auto-versioning) to the Mijn controles page, importable as input nodes in the rules canvas.

**Architecture:** New backend entity (Pydantic schema + JSON storage + FastAPI router) following the existing klanten/controles pattern. Frontend adds a third tab to MyControls.tsx and a new node type to the rules canvas. The rule engine resolves global_value operands at evaluation time.

**Tech Stack:** FastAPI, Pydantic, JSON file storage, React, TypeScript, Zustand, React Flow, shadcn/ui

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/routers/global_values.py` | CRUD API endpoints |
| Create | `backend/services/global_value_store.py` | Storage layer (save/get/list/delete) |
| Modify | `backend/models/schemas.py` | Add GlobalValue, GlobalValueGroup, GlobalValueGroupCreate schemas |
| Modify | `backend/services/storage_backend.py` | Add global_values methods to StorageBackend, LocalStorageBackend, AzureBlobStorageBackend |
| Modify | `backend/main.py` | Register global_values router |
| Modify | `backend/services/rule_engine.py` | Resolve `global_value` operand type |
| Modify | `frontend/src/types/index.ts` | Add GlobalValue, GlobalValueGroup interfaces; extend RuleNodeType, RuleNodeData, RuleOperand |
| Modify | `frontend/src/api/client.ts` | Add 5 API functions for global values |
| Modify | `frontend/src/pages/MyControls.tsx` | Add "Globale waarden" tab with group CRUD UI |
| Modify | `frontend/src/components/rules/RulesPanel.tsx` | Add "Globale waarde" to Input menu with group/value picker |
| Modify | `frontend/src/components/rules/RuleNodes.tsx` | Add GlobalValueNode component + register in nodeTypes |
| Modify | `frontend/src/components/rules/serializeGraph.ts` | Handle global_value_input node → global_value operand |

---

### Task 1: Backend Pydantic Schemas

**Files:**
- Modify: `backend/models/schemas.py`

- [ ] **Step 1: Add GlobalValue and GlobalValueGroup schemas**

Add at the end of `backend/models/schemas.py` (before any closing comments), after the ControleSeries models:

```python
# --- Global Values ---

class GlobalValue(BaseModel):
    """A single named value within a global value group."""
    id: str
    name: str
    dataType: Literal["text", "number", "date", "boolean"]
    value: str = ""


class GlobalValueGroupCreate(BaseModel):
    """Request body to create or update a global value group."""
    name: str
    values: list[GlobalValue] = []


class GlobalValueGroup(BaseModel):
    """A persisted global value group with auto-incrementing version."""
    id: str
    name: str
    version: int = 1
    values: list[GlobalValue] = []
    createdAt: str
    updatedAt: str
```

- [ ] **Step 2: Extend RuleOperand to support global_value type**

In `backend/models/schemas.py`, update the `RuleOperand` model's `type` field (line 73):

Change:
```python
type: Literal["field_ref", "literal", "computed_ref", "column_ref", "formula", "range_ref"]
```
To:
```python
type: Literal["field_ref", "literal", "computed_ref", "column_ref", "formula", "range_ref", "global_value"]
```

Add two new optional fields to `RuleOperand`:
```python
    # Global value reference
    global_group_id: str | None = None       # when type = "global_value"
    global_value_id: str | None = None       # when type = "global_value"
```

- [ ] **Step 3: Commit**

```bash
git add backend/models/schemas.py
git commit -m "$(cat <<'EOF'
feat: add GlobalValue and GlobalValueGroup Pydantic schemas
EOF
)"
```

---

### Task 2: Storage Backend — Abstract + Local + Azure

**Files:**
- Modify: `backend/services/storage_backend.py`

- [ ] **Step 1: Add abstract methods to StorageBackend**

Add after the `delete_controle_series` / controle series runs section (around line 135):

```python
    # -- Global Values --

    @abstractmethod
    def save_global_value_group(self, group_id: str, content: str) -> None: ...

    @abstractmethod
    def get_global_value_group(self, group_id: str) -> str | None: ...

    @abstractmethod
    def list_global_value_group_ids(self) -> list[str]: ...

    @abstractmethod
    def delete_global_value_group(self, group_id: str) -> bool: ...
```

- [ ] **Step 2: Implement in LocalStorageBackend**

In `LocalStorageBackend.__init__`, add:
```python
        self._global_values = base_dir / "global_values"
        self._global_values.mkdir(parents=True, exist_ok=True)
```

Add after the controle series runs methods:
```python
    # -- Global Values --

    def save_global_value_group(self, group_id: str, content: str) -> None:
        (self._global_values / f"{group_id}.json").write_text(content, encoding="utf-8")

    def get_global_value_group(self, group_id: str) -> str | None:
        path = self._global_values / f"{group_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_global_value_group_ids(self) -> list[str]:
        return [p.stem for p in sorted(self._global_values.glob("*.json"))]

    def delete_global_value_group(self, group_id: str) -> bool:
        path = self._global_values / f"{group_id}.json"
        if not path.exists():
            return False
        path.unlink()
        return True
```

- [ ] **Step 3: Implement in AzureBlobStorageBackend**

In `AzureBlobStorageBackend.__init__`, add parameter `global_values_container: str = "global-values"`, add:
```python
        self._global_values = self._client.get_container_client(global_values_container)
```

Add to the container ensure loop.

Add methods:
```python
    # -- Global Values --

    def save_global_value_group(self, group_id: str, content: str) -> None:
        self._global_values.upload_blob(f"{group_id}.json", content, overwrite=True)

    def get_global_value_group(self, group_id: str) -> str | None:
        blob_client = self._global_values.get_blob_client(f"{group_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def list_global_value_group_ids(self) -> list[str]:
        ids = []
        for blob in self._global_values.list_blobs():
            name = blob.name
            if name.endswith(".json"):
                ids.append(name.removesuffix(".json"))
        return sorted(ids)

    def delete_global_value_group(self, group_id: str) -> bool:
        blob_client = self._global_values.get_blob_client(f"{group_id}.json")
        if not blob_client.exists():
            return False
        blob_client.delete_blob()
        return True
```

- [ ] **Step 4: Commit**

```bash
git add backend/services/storage_backend.py
git commit -m "$(cat <<'EOF'
feat: add global_values storage methods to StorageBackend
EOF
)"
```

---

### Task 3: Global Value Store Service

**Files:**
- Create: `backend/services/global_value_store.py`

- [ ] **Step 1: Create the store service**

```python
import json
from datetime import datetime, timezone

from models.schemas import GlobalValueGroup, GlobalValueGroupCreate
from services.storage_backend import get_storage


def save_global_value_group(group_id: str, data: GlobalValueGroupCreate) -> GlobalValueGroup:
    now = datetime.now(timezone.utc).isoformat()
    group = GlobalValueGroup(
        id=group_id,
        name=data.name,
        version=1,
        values=data.values,
        createdAt=now,
        updatedAt=now,
    )
    get_storage().save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group


def get_global_value_group(group_id: str) -> GlobalValueGroup | None:
    content = get_storage().get_global_value_group(group_id)
    if content is None:
        return None
    return GlobalValueGroup(**json.loads(content))


def list_global_value_groups() -> list[GlobalValueGroup]:
    storage = get_storage()
    groups: list[GlobalValueGroup] = []
    for gid in storage.list_global_value_group_ids():
        content = storage.get_global_value_group(gid)
        if content is not None:
            groups.append(GlobalValueGroup(**json.loads(content)))
    return sorted(groups, key=lambda g: g.createdAt, reverse=True)


def _values_changed(old_values: list, new_values: list) -> bool:
    """Check if values have changed (added, removed, or modified)."""
    if len(old_values) != len(new_values):
        return True
    old_map = {v["id"]: v for v in old_values}
    for nv in new_values:
        ov = old_map.get(nv["id"])
        if ov is None:
            return True
        if ov["name"] != nv["name"] or ov["dataType"] != nv["dataType"] or ov["value"] != nv["value"]:
            return True
    return False


def update_global_value_group(group_id: str, data: GlobalValueGroupCreate) -> GlobalValueGroup | None:
    storage = get_storage()
    existing_content = storage.get_global_value_group(group_id)
    if existing_content is None:
        return None

    existing = json.loads(existing_content)
    old_version = existing.get("version", 1)

    # Check if values changed to determine version bump
    new_values_dicts = [v.model_dump() for v in data.values]
    old_values_dicts = existing.get("values", [])
    version = old_version + 1 if _values_changed(old_values_dicts, new_values_dicts) else old_version

    group = GlobalValueGroup(
        id=group_id,
        name=data.name,
        version=version,
        values=data.values,
        createdAt=existing.get("createdAt", datetime.now(timezone.utc).isoformat()),
        updatedAt=datetime.now(timezone.utc).isoformat(),
    )
    storage.save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group


def delete_global_value_group(group_id: str) -> bool:
    return get_storage().delete_global_value_group(group_id)
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/global_value_store.py
git commit -m "$(cat <<'EOF'
feat: add global_value_store service with version auto-increment
EOF
)"
```

---

### Task 4: Backend API Router

**Files:**
- Create: `backend/routers/global_values.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create the router**

```python
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
```

- [ ] **Step 2: Register in main.py**

In `backend/main.py`, add the import:
```python
from routers import extract, pdfs, templates, test_runs, controles, klanten, controle_series, spreadsheets, global_values
```

Add the router:
```python
app.include_router(global_values.router)
```

- [ ] **Step 3: Test the API**

Run: `cd backend && python -m uvicorn main:app --reload`

Test with curl:
```bash
# Create
curl -s -X POST http://localhost:8000/global-values \
  -H "Content-Type: application/json" \
  -d '{"name":"Loonheffing 2026","values":[{"id":"v1","name":"Minimumloon","dataType":"number","value":"1995"}]}' | python3 -m json.tool

# List
curl -s http://localhost:8000/global-values | python3 -m json.tool
```

Expected: 200 with group JSON including `version: 1`.

- [ ] **Step 4: Commit**

```bash
git add backend/routers/global_values.py backend/main.py
git commit -m "$(cat <<'EOF'
feat: add /global-values API router with CRUD endpoints
EOF
)"
```

---

### Task 5: Rule Engine — Resolve global_value Operands

**Files:**
- Modify: `backend/services/rule_engine.py`

- [ ] **Step 1: Add global_value resolution to resolve_operand**

In `rule_engine.py`, in the `resolve_operand` method (around line 166), add a new block after the `range_ref` handler and before the final `return None`:

```python
        if operand.type == "global_value":
            from services.global_value_store import get_global_value_group
            if operand.global_group_id:
                group = get_global_value_group(operand.global_group_id)
                if group:
                    for gv in group.values:
                        if gv.id == operand.global_value_id:
                            return gv.value
            return None
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/rule_engine.py
git commit -m "$(cat <<'EOF'
feat: resolve global_value operands in rule engine
EOF
)"
```

---

### Task 6: Frontend Types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add GlobalValue and GlobalValueGroup interfaces**

Add at the end of `frontend/src/types/index.ts`:

```typescript
// --- Global Values ---

export interface GlobalValue {
  id: string;
  name: string;
  dataType: "text" | "number" | "date" | "boolean";
  value: string;
}

export interface GlobalValueGroup {
  id: string;
  name: string;
  version: number;
  values: GlobalValue[];
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Extend RuleNodeType**

Update the `RuleNodeType` type (line 116):

```typescript
export type RuleNodeType = "field_input" | "literal_input" | "math_operation" | "comparison" | "validation" | "condition" | "table_column" | "table_aggregate" | "table_row_filter" | "formula" | "cell_range" | "global_value_input";
```

- [ ] **Step 3: Extend RuleNodeData**

Add these fields to the `RuleNodeData` interface (after the existing cell range fields):

```typescript
  // Global value reference
  globalGroupId?: string;
  globalValueId?: string;
  groupName?: string;
  globalDataType?: "text" | "number" | "date" | "boolean";
```

- [ ] **Step 4: Extend RuleOperand**

Add a new union member to the `RuleOperand` type (line 50-56):

```typescript
  | { type: "global_value"; global_group_id: string; global_value_id: string };
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "$(cat <<'EOF'
feat: add GlobalValue types and extend rule node/operand types
EOF
)"
```

---

### Task 7: Frontend API Client

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add imports and API functions**

Add `GlobalValueGroup` to the import from `"../types"`:

```typescript
import type { ..., GlobalValueGroup } from "../types";
```

Add at the end of the file:

```typescript
// --- Global Values ---

export async function listGlobalValueGroups(): Promise<GlobalValueGroup[]> {
  const response = await api.get("/global-values");
  return response.data;
}

export async function getGlobalValueGroup(id: string): Promise<GlobalValueGroup> {
  const response = await api.get(`/global-values/${id}`);
  return response.data;
}

export async function createGlobalValueGroup(
  data: { name: string; values: GlobalValueGroup["values"] },
): Promise<GlobalValueGroup> {
  const response = await api.post("/global-values", data);
  return response.data;
}

export async function updateGlobalValueGroup(
  id: string,
  data: { name: string; values: GlobalValueGroup["values"] },
): Promise<GlobalValueGroup> {
  const response = await api.put(`/global-values/${id}`, data);
  return response.data;
}

export async function deleteGlobalValueGroup(id: string): Promise<void> {
  await api.delete(`/global-values/${id}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "$(cat <<'EOF'
feat: add global values API client functions
EOF
)"
```

---

### Task 8: MyControls.tsx — Globale waarden Tab

**Files:**
- Modify: `frontend/src/pages/MyControls.tsx`

- [ ] **Step 1: Add imports**

Add to existing imports:

```typescript
import { Globe } from "lucide-react";
import { listGlobalValueGroups, createGlobalValueGroup, updateGlobalValueGroup, deleteGlobalValueGroup } from "@/api/client";
import type { GlobalValueGroup, GlobalValue } from "@/types";
```

- [ ] **Step 2: Add state variables**

Inside `MyControls()`, add after the existing state declarations:

```typescript
const [globalGroups, setGlobalGroups] = useState<GlobalValueGroup[]>([]);
const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
const [editingGroup, setEditingGroup] = useState<{ id: string | null; name: string; values: GlobalValue[] } | null>(null);
const [deleteGroupTarget, setDeleteGroupTarget] = useState<GlobalValueGroup | null>(null);
const [deletingGroup, setDeletingGroup] = useState(false);
```

- [ ] **Step 3: Add data fetching**

Add a useEffect to load global groups:

```typescript
useEffect(() => {
  listGlobalValueGroups().then(setGlobalGroups).catch(() => {});
}, []);
```

- [ ] **Step 4: Update tab type and add tab button**

Change the tab state type:
```typescript
const [tab, setTab] = useState<"definities" | "resultaten" | "globale_waarden">("definities");
```

Add a third tab button after the "Resultaten" button:
```tsx
<button
  onClick={() => setTab("globale_waarden")}
  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
    tab === "globale_waarden"
      ? "border-primary text-primary"
      : "border-transparent text-muted-foreground hover:text-foreground"
  }`}
>
  Globale waarden
</button>
```

- [ ] **Step 5: Add helper functions for group CRUD**

```typescript
const handleSaveGroup = async (groupId: string | null, name: string, values: GlobalValue[]) => {
  try {
    if (groupId) {
      const updated = await updateGlobalValueGroup(groupId, { name, values });
      setGlobalGroups((prev) => prev.map((g) => (g.id === groupId ? updated : g)));
    } else {
      const created = await createGlobalValueGroup({ name, values });
      setGlobalGroups((prev) => [created, ...prev]);
    }
    setEditingGroup(null);
    toast({ title: groupId ? "Groep bijgewerkt" : "Groep aangemaakt" });
  } catch {
    toast({ title: "Opslaan mislukt", variant: "destructive" });
  }
};

const handleDeleteGroup = async () => {
  if (!deleteGroupTarget) return;
  setDeletingGroup(true);
  try {
    await deleteGlobalValueGroup(deleteGroupTarget.id);
    setGlobalGroups((prev) => prev.filter((g) => g.id !== deleteGroupTarget.id));
    toast({ title: "Groep verwijderd" });
  } catch {
    toast({ title: "Verwijderen mislukt", variant: "destructive" });
  } finally {
    setDeletingGroup(false);
    setDeleteGroupTarget(null);
  }
};

const filteredGroups = globalGroups.filter((g) =>
  g.name.toLowerCase().includes(search.toLowerCase())
);
```

- [ ] **Step 6: Add the Globale waarden tab content**

After the `{tab === "resultaten" ? ( ... ) : null}` block (which is the else branch for `{tab === "definities" ? ...}`), replace the ternary to add a third branch. The tab content structure becomes:

```tsx
{tab === "definities" ? (
  /* existing Controles card — keep as-is */
) : tab === "resultaten" ? (
  /* existing Resultaten card — keep as-is */
) : (
  <>
    <div className="flex justify-end">
      <Button
        size="sm"
        className="rounded-full shadow-lg"
        onClick={() => setEditingGroup({ id: null, name: "", values: [] })}
      >
        <Plus className="h-4 w-4 mr-1" />
        Nieuwe groep
      </Button>
    </div>

    {/* Inline edit form */}
    {editingGroup && (
      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Groepsnaam</Label>
            <Input
              value={editingGroup.name}
              onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
              placeholder="Bijv. Loonheffing 2026"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Waarden</Label>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Naam</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead>Waarde</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editingGroup.values.map((v, i) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <Input
                          value={v.name}
                          onChange={(e) => {
                            const vals = [...editingGroup.values];
                            vals[i] = { ...v, name: e.target.value };
                            setEditingGroup({ ...editingGroup, values: vals });
                          }}
                          placeholder="Naam"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={v.dataType}
                          onValueChange={(val) => {
                            const vals = [...editingGroup.values];
                            vals[i] = { ...v, dataType: val as GlobalValue["dataType"] };
                            setEditingGroup({ ...editingGroup, values: vals });
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Tekst</SelectItem>
                            <SelectItem value="number">Nummer</SelectItem>
                            <SelectItem value="date">Datum</SelectItem>
                            <SelectItem value="boolean">Boolean</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={v.value}
                          onChange={(e) => {
                            const vals = [...editingGroup.values];
                            vals[i] = { ...v, value: e.target.value };
                            setEditingGroup({ ...editingGroup, values: vals });
                          }}
                          placeholder="Waarde"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() => {
                            const vals = editingGroup.values.filter((_, j) => j !== i);
                            setEditingGroup({ ...editingGroup, values: vals });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newVal: GlobalValue = {
                  id: crypto.randomUUID(),
                  name: "",
                  dataType: "text",
                  value: "",
                };
                setEditingGroup({ ...editingGroup, values: [...editingGroup.values, newVal] });
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Waarde toevoegen
            </Button>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditingGroup(null)}>
              Annuleren
            </Button>
            <Button
              disabled={!editingGroup.name.trim()}
              onClick={() => handleSaveGroup(editingGroup.id, editingGroup.name, editingGroup.values)}
            >
              Opslaan
            </Button>
          </div>
        </CardContent>
      </Card>
    )}

    {/* Groups table */}
    <Card className="shadow-sm">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Waarden</TableHead>
              <TableHead>Versie</TableHead>
              <TableHead>Laatst bijgewerkt</TableHead>
              <TableHead className="text-right">Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredGroups.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell className="text-muted-foreground">{g.values.length}</TableCell>
                <TableCell>
                  <Badge variant="outline">v{g.version}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(g.updatedAt)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingGroup({ id: g.id, name: g.name, values: g.values })}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Bewerken
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteGroupTarget(g)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Verwijderen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {filteredGroups.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">Nog geen globale waarden</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    {/* Delete group confirmation */}
    <AlertDialog open={!!deleteGroupTarget} onOpenChange={(open) => !open && setDeleteGroupTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Groep verwijderen?</AlertDialogTitle>
          <AlertDialogDescription>
            Weet je zeker dat je "{deleteGroupTarget?.name}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteGroup}
            disabled={deletingGroup}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deletingGroup ? "Verwijderen..." : "Verwijderen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
)}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/MyControls.tsx
git commit -m "$(cat <<'EOF'
feat: add Globale waarden tab to Mijn controles page
EOF
)"
```

---

### Task 9: GlobalValueNode Component

**Files:**
- Modify: `frontend/src/components/rules/RuleNodes.tsx`

- [ ] **Step 1: Add the GlobalValueNode component**

Add before the `/* ── Export ── */` section:

```tsx
/* ── Global Value Input ── */

export const GlobalValueNode = memo(({ data }: NodeProps & { data: RuleNodeData }) => {
  return (
    <div className="px-2.5 py-1.5 rounded-md border shadow-sm max-w-[180px] border-amber-400 bg-amber-50/50 dark:bg-amber-950/50">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-400 leading-none mb-0.5 flex items-center gap-1">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        Global
      </div>
      {data.groupName && (
        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 mb-0.5 rounded text-[9px] font-semibold leading-none max-w-full truncate bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {data.groupName}
        </div>
      )}
      <div className="text-xs font-medium text-foreground truncate leading-tight">
        {data.label}
      </div>
      {data.globalDataType && (
        <div className="text-[9px] text-muted-foreground">{data.globalDataType}</div>
      )}
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-muted-foreground truncate" title={data.lastValue}>= {data.lastValue}</div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-amber-500`} />
    </div>
  );
});
GlobalValueNode.displayName = 'GlobalValueNode';
```

- [ ] **Step 2: Register in nodeTypes**

Add to the `nodeTypes` export:

```typescript
export const nodeTypes = {
  field_input: FieldInputNode,
  literal_input: LiteralInputNode,
  math_operation: MathOperationNode,
  comparison: ComparisonNode,
  validation: ValidationNode,
  condition: ConditionNode,
  table_column: TableColumnNode,
  table_aggregate: TableAggregateNode,
  table_row_filter: TableRowFilterNode,
  formula: FormulaNode,
  cell_range: CellRangeNode,
  global_value_input: GlobalValueNode,
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/rules/RuleNodes.tsx
git commit -m "$(cat <<'EOF'
feat: add GlobalValueNode component for rules canvas
EOF
)"
```

---

### Task 10: Rules Panel — Add Global Value to Input Menu

**Files:**
- Modify: `frontend/src/components/rules/RulesPanel.tsx`

- [ ] **Step 1: Add imports**

Add to the imports:

```typescript
import { listGlobalValueGroups } from '../../api/client';
import type { GlobalValueGroup } from '../../types';
```

- [ ] **Step 2: Add state and data loading for global values**

In `RulesPanel()`, add state:

```typescript
const [globalGroups, setGlobalGroups] = useState<GlobalValueGroup[]>([]);
```

Add a useEffect to load global values when the Input menu opens (inside the existing `useEffect` for external data, or as a new one):

```typescript
useEffect(() => {
  if (showAddMenu && menuCategory === 'Input') {
    listGlobalValueGroups()
      .then(setGlobalGroups)
      .catch(() => {});
  }
}, [showAddMenu, menuCategory]);
```

- [ ] **Step 3: Add handleAddGlobalValue function**

```typescript
const handleAddGlobalValue = (group: GlobalValueGroup, value: GlobalValueGroup["values"][0]) => {
  const id = crypto.randomUUID();
  const newNode: Node = {
    id,
    type: 'global_value_input',
    position: { x: 250 + Math.random() * 100, y: 50 + Math.random() * 200 },
    data: {
      label: value.name,
      nodeType: 'global_value_input',
      globalGroupId: group.id,
      globalValueId: value.id,
      groupName: group.name,
      globalDataType: value.dataType,
      lastValue: value.value,
    } as RuleNodeData,
  };
  setRuleNodes([...ruleNodes, newNode]);
  setShowAddMenu(false);
};
```

- [ ] **Step 4: Pass to InputSourceMenu**

Update the `InputSourceMenu` call to pass `globalGroups` and `handleAddGlobalValue`:

```tsx
<InputSourceMenu
  localFields={fields}
  externalTemplates={externalTemplates}
  externalRuns={externalRuns}
  globalGroups={globalGroups}
  onAddConstant={() => handleAddNode({ type: 'literal_input', label: 'Constant', category: 'Input' })}
  onAddExternalField={handleAddExternalField}
  onAddTableColumn={handleAddTableColumn}
  onAddGlobalValue={handleAddGlobalValue}
/>
```

- [ ] **Step 5: Update InputSourceMenu component**

Add to the props:

```typescript
function InputSourceMenu({
  localFields,
  externalTemplates,
  externalRuns,
  globalGroups,
  onAddConstant,
  onAddExternalField,
  onAddTableColumn,
  onAddGlobalValue,
}: {
  localFields: Field[];
  externalTemplates: TemplateFieldInfo[];
  externalRuns: TestRun[];
  globalGroups: GlobalValueGroup[];
  onAddConstant: () => void;
  onAddExternalField: (...) => void;
  onAddTableColumn: (...) => void;
  onAddGlobalValue: (group: GlobalValueGroup, value: GlobalValueGroup["values"][0]) => void;
}) {
```

Add the global values section after the Constant button and before the Table Columns section:

```tsx
{/* Global Values */}
{globalGroups.length > 0 && (
  <>
    <div className="h-px bg-border mx-2 my-1" />
    <div className="px-3 pt-2 pb-1">
      <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Globale waarden</span>
    </div>
    {globalGroups.map((g) => (
      <div key={g.id}>
        <button
          onClick={() => setExpandedSection(expandedSection === `gv-${g.id}` ? null : `gv-${g.id}`)}
          className="w-full text-left px-3 py-1.5 text-foreground hover:bg-muted transition-colors flex items-center gap-2"
        >
          <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
          <span className="flex-1 truncate">{g.name}</span>
          <span className="text-[10px] text-muted-foreground">v{g.version}</span>
          <svg className={`w-3 h-3 text-muted-foreground transition-transform ${expandedSection === `gv-${g.id}` ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {expandedSection === `gv-${g.id}` && (
          <div className="pl-8 pr-2 pb-1">
            {g.values.map((v) => (
              <button
                key={v.id}
                onClick={() => onAddGlobalValue(g, v)}
                className="w-full text-left px-2 py-1 text-[11px] text-foreground/80 hover:bg-muted rounded transition-colors flex items-center gap-1.5"
              >
                <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="truncate flex-1">{v.name}</span>
                <span className="text-[9px] text-muted-foreground">{v.value || "—"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    ))}
  </>
)}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/rules/RulesPanel.tsx
git commit -m "$(cat <<'EOF'
feat: add global value picker to Add Node Input menu
EOF
)"
```

---

### Task 11: Serialization — Handle global_value_input

**Files:**
- Modify: `frontend/src/components/rules/serializeGraph.ts`

- [ ] **Step 1: Update operandFromNode function**

In `serializeGraph.ts`, add a handler for `global_value_input` in the `operandFromNode` function (after the `literal_input` handler, around line 26):

```typescript
  if (node.type === 'global_value_input') {
    return {
      type: 'global_value' as const,
      global_group_id: data.globalGroupId ?? '',
      global_value_id: data.globalValueId ?? '',
    };
  }
```

- [ ] **Step 2: Update getOperandLabel function**

Add a handler for `global_value` in `getOperandLabel` (after the `computed_ref` handler):

```typescript
  if (op.type === 'global_value') return `[global:${(op as any).global_value_id?.slice(0, 6)}]`;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/rules/serializeGraph.ts
git commit -m "$(cat <<'EOF'
feat: serialize global_value_input nodes to global_value operands
EOF
)"
```

---

### Task 12: Manual Integration Test

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && python -m uvicorn main:app --reload &
cd frontend && npm run dev &
```

- [ ] **Step 2: Test the Globale waarden tab**

1. Navigate to `http://localhost:5173/controles`
2. Click the "Globale waarden" tab
3. Click "+ Nieuwe groep"
4. Create a group "Loonheffing 2026" with values: Minimumloon (number, 1995), Startdatum (date, 2026-01-01)
5. Save → verify it appears in the table with version v1
6. Edit the group, change Minimumloon to 2050, save → verify version bumps to v2

- [ ] **Step 3: Test rules canvas integration**

1. Create or edit a controle
2. Go to the Rules tab
3. Click "Add Node" → Input category
4. Verify "Globale waarden" section appears with the group
5. Expand "Loonheffing 2026" → click "Minimumloon"
6. Verify a global value node appears on the canvas (amber colored, shows group name badge, value preview)
7. Connect it to a comparison or math node → verify the connection works

- [ ] **Step 4: Commit all changes**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: complete global values feature (Globale waarden)
EOF
)"
```
