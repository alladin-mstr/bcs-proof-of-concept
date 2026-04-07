# Nested Klanten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unlimited-depth parent-child hierarchy to Klanten with tree sidebar navigation, auto-copy controls on creation, and cascading deletes.

**Architecture:** Add `parentId` and `sourceControlIds` fields to the Klant model. Frontend fetches a flat list and builds the tree client-side. Auto-copy logic lives server-side in the controle creation endpoint. The Klanten page becomes a two-panel layout: tree sidebar (left) + detail panel (right).

**Tech Stack:** FastAPI, Pydantic, React 18, TypeScript, Tailwind CSS, Radix UI, Lucide icons

---

## File Structure

### Backend

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/models/schemas.py` | Add `parentId`, `sourceControlIds` to Klant/KlantCreate |
| Modify | `backend/services/klant_store.py` | Add `list_children`, `list_descendants`, `get_ancestor_path` helpers |
| Modify | `backend/routers/klanten.py` | Add children endpoint, cascading delete, update parentId support |
| Modify | `backend/routers/controles.py` | Add auto-copy logic when creating a controle for a klant with descendants |

### Frontend

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/types/index.ts` | Add `parentId`, `sourceControlIds` to Klant interface |
| Modify | `frontend/src/api/client.ts` | Add `parentId` to createKlant, add `getKlantChildren`, `unlinkControl` calls |
| Create | `frontend/src/components/KlantTree.tsx` | Reusable tree sidebar component |
| Create | `frontend/src/lib/tree-utils.ts` | Pure functions: buildTree, filterTree, getAncestorPath |
| Modify | `frontend/src/pages/Clients.tsx` | Replace flat table with tree sidebar + detail panel layout |
| Modify | `frontend/src/pages/ClientDetail.tsx` | Add tree sidebar, sub-klanten section, inherited control badges |
| Modify | `frontend/src/components/layout/AppLayout.tsx` | Add "Klanten" breadcrumb segment for nested paths |

---

### Task 1: Backend — Extend Klant Schema

**Files:**
- Modify: `backend/models/schemas.py:405-418`

- [ ] **Step 1: Update KlantCreate schema**

In `backend/models/schemas.py`, update the `KlantCreate` class:

```python
class KlantCreate(BaseModel):
    """Request body to create or update a klant."""
    name: str
    medewerkerCount: int | None = None
    parentId: str | None = None
```

- [ ] **Step 2: Update Klant schema**

In `backend/models/schemas.py`, update the `Klant` class:

```python
class Klant(BaseModel):
    """A persisted klant (customer)."""
    id: str
    name: str
    medewerkerCount: int | None = None
    parentId: str | None = None
    sourceControlIds: dict[str, str] | None = None
    createdAt: datetime
    updatedAt: datetime
```

- [ ] **Step 3: Commit**

```bash
git add backend/models/schemas.py
git commit -m "feat(klanten): add parentId and sourceControlIds to Klant schema"
```

---

### Task 2: Backend — Extend klant_store with hierarchy helpers

**Files:**
- Modify: `backend/services/klant_store.py`

- [ ] **Step 1: Update save_klant to include new fields**

In `backend/services/klant_store.py`, update `save_klant`:

```python
def save_klant(klant_id: str, data: KlantCreate) -> Klant:
    now = datetime.now(timezone.utc)
    klant = Klant(
        id=klant_id,
        name=data.name,
        medewerkerCount=data.medewerkerCount,
        parentId=data.parentId,
        sourceControlIds=None,
        createdAt=now,
        updatedAt=now,
    )
    get_storage().save_klant(klant_id, klant.model_dump_json(indent=2))
    return klant
```

- [ ] **Step 2: Update update_klant to preserve and update new fields**

```python
def update_klant(klant_id: str, data: KlantCreate) -> Klant | None:
    storage = get_storage()
    existing_content = storage.get_klant(klant_id)
    if existing_content is None:
        return None

    existing = json.loads(existing_content)
    klant = Klant(
        id=klant_id,
        name=data.name,
        medewerkerCount=data.medewerkerCount,
        parentId=data.parentId,
        sourceControlIds=existing.get("sourceControlIds"),
        createdAt=existing.get("createdAt", datetime.now(timezone.utc).isoformat()),
        updatedAt=datetime.now(timezone.utc),
    )
    storage.save_klant(klant_id, klant.model_dump_json(indent=2))
    return klant
```

- [ ] **Step 3: Add list_children helper**

Add to `backend/services/klant_store.py`:

```python
def list_children(parent_id: str) -> list[Klant]:
    """Return direct children of a klant."""
    return [k for k in list_klanten() if k.parentId == parent_id]


def list_descendants(klant_id: str) -> list[Klant]:
    """Return all descendants of a klant (recursive)."""
    children = list_children(klant_id)
    descendants = list(children)
    for child in children:
        descendants.extend(list_descendants(child.id))
    return descendants


def get_ancestor_path(klant_id: str) -> list[Klant]:
    """Return the path from root to this klant (inclusive)."""
    path = []
    current = get_klant(klant_id)
    while current:
        path.insert(0, current)
        if current.parentId:
            current = get_klant(current.parentId)
        else:
            current = None
    return path


def update_klant_source_controls(klant_id: str, source_control_ids: dict[str, str]) -> Klant | None:
    """Update only the sourceControlIds field of a klant."""
    storage = get_storage()
    existing_content = storage.get_klant(klant_id)
    if existing_content is None:
        return None

    existing = json.loads(existing_content)
    existing["sourceControlIds"] = source_control_ids
    existing["updatedAt"] = datetime.now(timezone.utc).isoformat()
    storage.save_klant(klant_id, json.dumps(existing, indent=2))
    return Klant(**existing)
```

- [ ] **Step 4: Commit**

```bash
git add backend/services/klant_store.py
git commit -m "feat(klanten): add hierarchy helpers to klant_store"
```

---

### Task 3: Backend — Update klanten router with children endpoint and cascading delete

**Files:**
- Modify: `backend/routers/klanten.py`

- [ ] **Step 1: Add children endpoint and update imports**

Replace the entire contents of `backend/routers/klanten.py`:

```python
import uuid

from fastapi import APIRouter, HTTPException

from models.schemas import Klant, KlantCreate, Controle
from services.klant_store import (
    delete_klant,
    get_klant,
    list_klanten,
    save_klant,
    update_klant,
    list_children,
    list_descendants,
)
from services.controle_store import list_controles, save_controle, delete_controle
from models.schemas import ControleCreate
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
            from services.klant_store import update_klant_source_controls
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
                import json
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
    from services.klant_store import update_klant_source_controls
    update_klant_source_controls(klant_id, source_ids if source_ids else None)
    return {"detail": "Control unlinked."}
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/klanten.py
git commit -m "feat(klanten): add children endpoint, cascading delete, unlink, and auto-copy on create"
```

---

### Task 4: Backend — Auto-copy controls to descendants on controle creation

**Files:**
- Modify: `backend/routers/controles.py:22-26`

- [ ] **Step 1: Update create_controle to auto-copy to descendants**

In `backend/routers/controles.py`, replace the `create_controle` function:

```python
@router.post("", response_model=Controle)
async def create_controle(data: ControleCreate):
    controle_id = str(uuid.uuid4())
    controle = save_controle(controle_id, data)

    # Auto-copy to descendants if this controle belongs to a klant with children
    copies_made = 0
    if data.klantId:
        from services.klant_store import list_descendants, get_klant, update_klant_source_controls
        descendants = list_descendants(data.klantId)
        for desc in descendants:
            new_id = str(uuid.uuid4())
            copy_data = ControleCreate(
                name=data.name,
                status=data.status,
                files=data.files,
                rules=data.rules,
                computedFields=data.computedFields,
                ruleGraph=data.ruleGraph,
                klantId=desc.id,
                klantName=desc.name,
            )
            save_controle(new_id, copy_data)
            copies_made += 1

            # Track the source mapping on the descendant klant
            desc_klant = get_klant(desc.id)
            if desc_klant:
                source_ids = dict(desc_klant.sourceControlIds or {})
                source_ids[new_id] = controle_id
                update_klant_source_controls(desc.id, source_ids)

    return controle
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/controles.py
git commit -m "feat(controles): auto-copy controls to klant descendants on creation"
```

---

### Task 5: Frontend — Update types and API client

**Files:**
- Modify: `frontend/src/types/index.ts:372-378`
- Modify: `frontend/src/api/client.ts:289-318`

- [ ] **Step 1: Update Klant interface**

In `frontend/src/types/index.ts`, replace the `Klant` interface:

```typescript
export interface Klant {
  id: string;
  name: string;
  medewerkerCount?: number;
  parentId?: string | null;
  sourceControlIds?: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Update API client**

In `frontend/src/api/client.ts`, replace the Klanten section (lines 289-318):

```typescript
// --- Klanten ---

export async function createKlant(
  data: { name: string; medewerkerCount?: number; parentId?: string | null },
): Promise<Klant> {
  const response = await api.post("/klanten", data);
  return response.data;
}

export async function listKlanten(): Promise<Klant[]> {
  const response = await api.get("/klanten");
  return response.data;
}

export async function getKlant(id: string): Promise<Klant> {
  const response = await api.get(`/klanten/${id}`);
  return response.data;
}

export async function getKlantChildren(id: string): Promise<Klant[]> {
  const response = await api.get(`/klanten/${id}/children`);
  return response.data;
}

export async function updateKlant(
  id: string,
  data: { name: string; medewerkerCount?: number; parentId?: string | null },
): Promise<Klant> {
  const response = await api.put(`/klanten/${id}`, data);
  return response.data;
}

export async function deleteKlant(id: string): Promise<{ detail: string; deletedKlanten: number }> {
  const response = await api.delete(`/klanten/${id}`);
  return response.data;
}

export async function unlinkControl(klantId: string, controleId: string): Promise<void> {
  await api.post(`/klanten/${klantId}/unlink-control/${controleId}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/client.ts
git commit -m "feat(klanten): update frontend types and API client for nested klanten"
```

---

### Task 6: Frontend — Create tree utility functions

**Files:**
- Create: `frontend/src/lib/tree-utils.ts`

- [ ] **Step 1: Create tree-utils.ts**

Create `frontend/src/lib/tree-utils.ts`:

```typescript
import type { Klant } from "@/types";

export interface KlantTreeNode extends Klant {
  children: KlantTreeNode[];
  depth: number;
}

/**
 * Build a tree from a flat list of klanten.
 * Returns only root nodes (parentId is null/undefined).
 */
export function buildTree(klanten: Klant[]): KlantTreeNode[] {
  const map = new Map<string, KlantTreeNode>();

  // Create nodes
  for (const k of klanten) {
    map.set(k.id, { ...k, children: [], depth: 0 });
  }

  const roots: KlantTreeNode[] = [];

  // Link parent-child
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Fix depth recursively for deeper nodes
  function setDepth(node: KlantTreeNode, depth: number) {
    node.depth = depth;
    for (const child of node.children) {
      setDepth(child, depth + 1);
    }
  }
  for (const root of roots) {
    setDepth(root, 0);
  }

  // Sort children by name
  function sortChildren(node: KlantTreeNode) {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortChildren);
  }
  roots.sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach(sortChildren);

  return roots;
}

/**
 * Filter tree by search query. Returns a new tree with only matching nodes
 * and their ancestors to maintain tree structure.
 */
export function filterTree(roots: KlantTreeNode[], query: string): KlantTreeNode[] {
  if (!query.trim()) return roots;

  const lowerQuery = query.toLowerCase();

  function filterNode(node: KlantTreeNode): KlantTreeNode | null {
    const filteredChildren = node.children
      .map(filterNode)
      .filter((n): n is KlantTreeNode => n !== null);

    if (node.name.toLowerCase().includes(lowerQuery) || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  }

  return roots
    .map(filterNode)
    .filter((n): n is KlantTreeNode => n !== null);
}

/**
 * Get the ancestor path from root to a specific klant.
 */
export function getAncestorPath(klanten: Klant[], klantId: string): Klant[] {
  const map = new Map(klanten.map(k => [k.id, k]));
  const path: Klant[] = [];
  let current = map.get(klantId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return path;
}

/**
 * Find a node in the tree by ID.
 */
export function findNode(roots: KlantTreeNode[], id: string): KlantTreeNode | null {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNode(root.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Collect all IDs in a subtree (node + all descendants).
 */
export function collectSubtreeIds(node: KlantTreeNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectSubtreeIds(child));
  }
  return ids;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/tree-utils.ts
git commit -m "feat(klanten): add tree utility functions for building and filtering klant hierarchy"
```

---

### Task 7: Frontend — Create KlantTree component

**Files:**
- Create: `frontend/src/components/KlantTree.tsx`

- [ ] **Step 1: Create KlantTree.tsx**

Create `frontend/src/components/KlantTree.tsx`:

```tsx
import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Plus, Search, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Klant } from "@/types";
import { buildTree, filterTree, type KlantTreeNode } from "@/lib/tree-utils";

interface KlantTreeProps {
  klanten: Klant[];
  selectedId?: string;
  onSelect: (klant: Klant) => void;
  onAddChild: (parentId: string | null) => void;
}

function TreeNode({
  node,
  selectedId,
  onSelect,
  onAddChild,
  defaultExpanded,
}: {
  node: KlantTreeNode;
  selectedId?: string;
  onSelect: (klant: Klant) => void;
  onAddChild: (parentId: string) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? node.depth < 1);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer text-sm transition-colors",
          isSelected
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-muted/50 text-foreground"
        )}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <button
            className="p-0.5 hover:bg-muted rounded shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}

        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <span className="truncate flex-1">{node.name}</span>

        <button
          className="p-0.5 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(node.id);
          }}
          title="Sub-klant toevoegen"
        >
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function KlantTree({ klanten, selectedId, onSelect, onAddChild }: KlantTreeProps) {
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildTree(klanten), [klanten]);
  const filteredRoots = useMemo(() => filterTree(tree, search), [tree, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Klanten</span>
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs rounded-full"
            onClick={() => onAddChild(null)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Nieuw
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Zoeken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm rounded-lg"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1 pb-3">
        {filteredRoots.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {search ? "Geen resultaten" : "Nog geen klanten"}
          </div>
        ) : (
          filteredRoots.map((root) => (
            <TreeNode
              key={root.id}
              node={root}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              defaultExpanded
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/KlantTree.tsx
git commit -m "feat(klanten): create KlantTree sidebar component"
```

---

### Task 8: Frontend — Rewrite Clients page with tree + detail layout

**Files:**
- Modify: `frontend/src/pages/Clients.tsx`

- [ ] **Step 1: Rewrite Clients.tsx**

Replace the entire contents of `frontend/src/pages/Clients.tsx`:

```tsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, FileText, ChevronRight, Layers, CheckCircle, AlertTriangle, Clock, Link2Off } from "lucide-react";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import {
  listKlanten,
  createKlant,
  deleteKlant as deleteKlantApi,
  listControles,
  listControleRuns,
  listControleSeries,
  unlinkControl,
} from "@/api/client";
import type { Klant, Controle, ControleRunResult, ControleSeries } from "@/types";
import { KlantTree } from "@/components/KlantTree";
import { getAncestorPath, buildTree, findNode, collectSubtreeIds } from "@/lib/tree-utils";
import { useToast } from "@/hooks/use-toast";

export default function Clients() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Data state
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [allControles, setAllControles] = useState<Controle[]>([]);
  const [allRuns, setAllRuns] = useState<ControleRunResult[]>([]);
  const [allSeries, setAllSeries] = useState<ControleSeries[]>([]);

  // UI state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogParentId, setDialogParentId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [newMedewerkerCount, setNewMedewerkerCount] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [klantToDelete, setKlantToDelete] = useState<Klant | null>(null);

  useEffect(() => {
    Promise.all([
      listKlanten(),
      listControles(),
      listControleRuns(),
      listControleSeries(),
    ]).then(([k, c, r, s]) => {
      setKlanten(k);
      setAllControles(c);
      setAllRuns(r);
      setAllSeries(s);
      // Auto-select first root if nothing selected
      if (!selectedId && k.length > 0) {
        const roots = k.filter(kl => !kl.parentId);
        if (roots.length > 0) setSelectedId(roots[0].id);
      }
    });
  }, []);

  const selected = useMemo(() => klanten.find(k => k.id === selectedId), [klanten, selectedId]);
  const ancestorPath = useMemo(() => selectedId ? getAncestorPath(klanten, selectedId) : [], [klanten, selectedId]);

  // Filtered data for selected klant
  const controles = useMemo(
    () => allControles.filter(c => c.klantId === selectedId),
    [allControles, selectedId]
  );
  const runs = useMemo(
    () => allRuns.filter(r => r.klantId === selectedId),
    [allRuns, selectedId]
  );
  const series = useMemo(
    () => allSeries.filter(s => s.klantId === selectedId),
    [allSeries, selectedId]
  );
  const children = useMemo(
    () => klanten.filter(k => k.parentId === selectedId),
    [klanten, selectedId]
  );

  // Delete info
  const deleteInfo = useMemo(() => {
    if (!klantToDelete) return { descendants: 0, controles: 0 };
    const tree = buildTree(klanten);
    const node = findNode(tree, klantToDelete.id);
    if (!node) return { descendants: 0, controles: 0 };
    const subtreeIds = collectSubtreeIds(node);
    const descendantCount = subtreeIds.length - 1;
    const controleCount = allControles.filter(c => subtreeIds.includes(c.klantId || "")).length;
    return { descendants: descendantCount, controles: controleCount };
  }, [klantToDelete, klanten, allControles]);

  const handleAddClient = async () => {
    if (!newClientName.trim()) return;
    try {
      const klant = await createKlant({
        name: newClientName.trim(),
        medewerkerCount: newMedewerkerCount ? parseInt(newMedewerkerCount, 10) : undefined,
        parentId: dialogParentId,
      });
      // Refresh full list to get updated sourceControlIds
      const updated = await listKlanten();
      setKlanten(updated);
      // Also refresh controles since auto-copy may have created new ones
      const updatedControles = await listControles();
      setAllControles(updatedControles);
      setSelectedId(klant.id);
      setNewClientName("");
      setNewMedewerkerCount("");
      setDialogOpen(false);
    } catch {
      toast({ title: "Toevoegen mislukt", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!klantToDelete) return;
    try {
      await deleteKlantApi(klantToDelete.id);
      const updated = await listKlanten();
      setKlanten(updated);
      const updatedControles = await listControles();
      setAllControles(updatedControles);
      if (selectedId === klantToDelete.id) {
        setSelectedId(updated.length > 0 ? updated.find(k => !k.parentId)?.id || null : null);
      }
      setDeleteDialogOpen(false);
      setKlantToDelete(null);
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  };

  const handleUnlink = async (controleId: string) => {
    if (!selectedId) return;
    try {
      await unlinkControl(selectedId, controleId);
      const updated = await listKlanten();
      setKlanten(updated);
      toast({ title: "Controle ontkoppeld" });
    } catch {
      toast({ title: "Ontkoppelen mislukt", variant: "destructive" });
    }
  };

  const openAddDialog = (parentId: string | null) => {
    setDialogParentId(parentId);
    setNewClientName("");
    setNewMedewerkerCount("");
    setDialogOpen(true);
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

  const formatTime = (date: string) =>
    new Date(date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // Group runs by month
  const runsByMonth = runs.reduce((acc, run) => {
    const date = new Date(run.runAt);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    const monthLabel = date.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
    if (!acc[monthKey]) acc[monthKey] = { label: monthLabel, runs: [] };
    acc[monthKey].runs.push(run);
    return acc;
  }, {} as Record<string, { label: string; runs: ControleRunResult[] }>);

  const getSourceName = (controleId: string) => {
    if (!selected?.sourceControlIds) return null;
    const sourceId = selected.sourceControlIds[controleId];
    if (!sourceId) return null;
    const sourceControle = allControles.find(c => c.id === sourceId);
    if (!sourceControle?.klantId) return null;
    const sourceKlant = klanten.find(k => k.id === sourceControle.klantId);
    return sourceKlant?.name || null;
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-6">
      {/* Tree sidebar */}
      <div className="w-72 border-r bg-muted/30 shrink-0">
        <KlantTree
          klanten={klanten}
          selectedId={selectedId || undefined}
          onSelect={(k) => setSelectedId(k.id)}
          onAddChild={openAddDialog}
        />
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-auto p-6">
        {selected ? (
          <div className="space-y-6">
            {/* Breadcrumb */}
            {ancestorPath.length > 1 && (
              <div className="text-sm text-muted-foreground">
                {ancestorPath.slice(0, -1).map((a, i) => (
                  <span key={a.id}>
                    {i > 0 && " › "}
                    <button
                      className="hover:text-foreground transition-colors"
                      onClick={() => setSelectedId(a.id)}
                    >
                      {a.name}
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{selected.name}</h1>
                {selected.medewerkerCount && (
                  <p className="text-sm text-muted-foreground">{selected.medewerkerCount} medewerkers</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setKlantToDelete(selected);
                    setDeleteDialogOpen(true);
                  }}
                >
                  Verwijderen
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate(`/controles?newForKlant=${selected.id}`)}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Nieuwe controle
                </Button>
              </div>
            </div>

            {/* Controles */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Controles</CardTitle>
              </CardHeader>
              <CardContent>
                {controles.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nog geen controles</p>
                ) : (
                  <div className="space-y-2">
                    {controles.map((c) => {
                      const totalFields = c.files.reduce((sum, f) => sum + f.fields.length, 0);
                      const sourceName = getSourceName(c.id);
                      return (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border"
                          onClick={() => navigate(`/controle/${c.id}`)}
                        >
                          <div className="flex items-center gap-4">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="font-medium">{c.name}</span>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span>{c.files.length} bestanden</span>
                                <span>{totalFields} velden</span>
                                <span>{formatDate(c.createdAt)}</span>
                              </div>
                              {sourceName && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-xs text-primary">
                                    Overgenomen van {sourceName}
                                  </span>
                                  <button
                                    className="text-xs text-primary underline hover:text-primary/80"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUnlink(c.id);
                                    }}
                                  >
                                    Ontkoppelen
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {c.status === "published" ? (
                              <Badge variant="outline" className="text-success border-success/30 bg-success/10">
                                Gepubliceerd
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">
                                Concept
                              </Badge>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sub-klanten */}
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Sub-klanten</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary"
                    onClick={() => openAddDialog(selected.id)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Toevoegen
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {children.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Geen sub-klanten</p>
                ) : (
                  <div className="space-y-2">
                    {children.map((child) => {
                      const childControles = allControles.filter(c => c.klantId === child.id).length;
                      return (
                        <div
                          key={child.id}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border"
                          onClick={() => setSelectedId(child.id)}
                        >
                          <div>
                            <span className="font-medium">{child.name}</span>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {childControles} controles
                              {child.medewerkerCount ? ` · ${child.medewerkerCount} medewerkers` : ""}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Series */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Series</CardTitle>
              </CardHeader>
              <CardContent>
                {series.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nog geen series</p>
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
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {s.steps.length} stappen · {formatDate(s.createdAt)}
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

            {/* Control history */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Controlegeschiedenis</CardTitle>
              </CardHeader>
              <CardContent>
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nog geen controles uitgevoerd</p>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(runsByMonth).map(([monthKey, { label, runs: monthRuns }]) => (
                      <div key={monthKey}>
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3 border-b pb-2">
                          {label}
                        </h3>
                        <div className="space-y-2">
                          {monthRuns.map((run) => (
                            <div
                              key={run.id}
                              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border"
                              onClick={() => navigate(`/controle/${run.controleId}/run`)}
                            >
                              <div className="flex items-center gap-4">
                                <span className="text-sm text-muted-foreground w-32">
                                  {formatTime(run.runAt)}
                                </span>
                                <span className="font-medium">{run.controleName}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                {run.status === "success" ? (
                                  <Badge variant="outline" className="text-success border-success/30 bg-success/10 gap-1">
                                    <CheckCircle className="h-3 w-3" />
                                    Alles ok
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {run.failedFields} afwijking{run.failedFields !== 1 ? "en" : ""}
                                  </Badge>
                                )}
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Selecteer een klant om details te bekijken</p>
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogParentId
                ? `Sub-klant toevoegen aan ${klanten.find(k => k.id === dialogParentId)?.name}`
                : "Nieuwe klant toevoegen"}
            </DialogTitle>
            <DialogDescription>
              {dialogParentId
                ? "Deze klant wordt aangemaakt als sub-klant. Controles van de bovenliggende klant worden automatisch overgenomen."
                : "Voeg een nieuwe klant toe op het hoogste niveau."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Klantnaam</Label>
              <Input
                id="client-name"
                placeholder="Bijv. Bakkerij de Gouden Korst"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddClient()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-medewerkers">Aantal medewerkers</Label>
              <Input
                id="client-medewerkers"
                type="number"
                placeholder="Bijv. 25"
                value={newMedewerkerCount}
                onChange={(e) => setNewMedewerkerCount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleAddClient} disabled={!newClientName.trim()}>Toevoegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Klant verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je &ldquo;{klantToDelete?.name}&rdquo; wilt verwijderen?
              {deleteInfo.descendants > 0 && (
                <span className="block mt-2 font-medium text-destructive">
                  Dit verwijdert ook {deleteInfo.descendants} sub-klant{deleteInfo.descendants !== 1 ? "en" : ""} en {deleteInfo.controles} controle{deleteInfo.controles !== 1 ? "s" : ""}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
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
git add frontend/src/pages/Clients.tsx
git commit -m "feat(klanten): rewrite Clients page with tree sidebar and detail panel"
```

---

### Task 9: Frontend — Remove ClientDetail page, merge into Clients

**Files:**
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/pages/ClientDetail.tsx`

Since the Clients page now shows both the tree and detail panel in one view, the separate ClientDetail page is no longer needed. The route `/klanten/:clientId` should redirect to `/klanten` with the client selected.

- [ ] **Step 1: Update App.tsx routing**

In `frontend/src/App.tsx`, find the two klanten routes:

```tsx
<Route path="/klanten" element={<ProtectedPage><Clients /></ProtectedPage>} />
<Route path="/klanten/:clientId" element={<ProtectedPage><ClientDetail /></ProtectedPage>} />
```

Replace with:

```tsx
<Route path="/klanten" element={<ProtectedPage><Clients /></ProtectedPage>} />
<Route path="/klanten/:clientId" element={<ProtectedPage><Clients /></ProtectedPage>} />
```

Also remove the `ClientDetail` import at the top of App.tsx.

- [ ] **Step 2: Update Clients.tsx to read clientId from URL**

In `frontend/src/pages/Clients.tsx`, add `useParams` support. At the top of the `Clients` component, after the existing state declarations, add:

```tsx
const { clientId } = useParams<{ clientId?: string }>();
```

And update the `useEffect` to auto-select from URL:

```tsx
useEffect(() => {
  Promise.all([
    listKlanten(),
    listControles(),
    listControleRuns(),
    listControleSeries(),
  ]).then(([k, c, r, s]) => {
    setKlanten(k);
    setAllControles(c);
    setAllRuns(r);
    setAllSeries(s);
    // Auto-select from URL param or first root
    if (clientId && k.find(kl => kl.id === clientId)) {
      setSelectedId(clientId);
    } else if (!selectedId && k.length > 0) {
      const roots = k.filter(kl => !kl.parentId);
      if (roots.length > 0) setSelectedId(roots[0].id);
    }
  });
}, []);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/Clients.tsx
git commit -m "feat(klanten): merge ClientDetail into Clients page, support URL param selection"
```

---

### Task 10: Frontend — Verify alert-dialog component exists

**Files:**
- Check: `frontend/src/components/ui/alert-dialog.tsx`

The Clients page uses `AlertDialog` for the delete confirmation. The component already exists at `frontend/src/components/ui/alert-dialog.tsx`.

- [ ] **Step 1: Verify the component exists and exports needed parts**

Run: `grep -l "AlertDialogAction\|AlertDialogCancel" frontend/src/components/ui/alert-dialog.tsx`

Expected: file path is returned, confirming the component exists.

If it doesn't exist, install it:

```bash
cd frontend && npx shadcn@latest add alert-dialog
```

- [ ] **Step 2: Commit (only if shadcn component was added)**

```bash
git add frontend/src/components/ui/alert-dialog.tsx
git commit -m "chore: add alert-dialog shadcn component"
```

---

### Task 11: End-to-end smoke test

- [ ] **Step 1: Start the backend**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -m uvicorn main:app --reload --port 8000`

Verify: server starts without import errors.

- [ ] **Step 2: Start the frontend**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npm run dev`

Verify: Vite compiles without TypeScript errors.

- [ ] **Step 3: Manual smoke test checklist**

Open `http://localhost:5173/klanten` and verify:

1. Tree sidebar appears on the left with existing klanten
2. Click a klant — detail panel shows on the right
3. Click "+" on a tree node — dialog opens with parent pre-filled
4. Create a sub-klant — appears in tree under parent
5. If parent has controls, sub-klant gets auto-copied controls with "Overgenomen van" badge
6. Click "Ontkoppelen" — badge disappears
7. Click "Verwijderen" on a klant with children — confirmation shows cascade warning
8. Confirm delete — klant and descendants removed from tree
9. Search in tree — filters to matching nodes
10. Breadcrumb path appears above detail title for nested klanten

- [ ] **Step 4: Commit any fixes found during smoke test**

```bash
git add -A
git commit -m "fix(klanten): smoke test fixes for nested klanten"
```
