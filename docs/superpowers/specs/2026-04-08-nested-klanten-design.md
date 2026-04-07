# Nested Klanten (Hierarchical Companies)

## Summary

Add unlimited-depth parent-child nesting to Klanten. All nodes in the tree are "Klanten" (uniform model). Controls created on a parent are auto-copied to all descendants. A tree sidebar replaces the flat list as the primary navigation.

## Data Model

### Klant Schema Changes

Two new fields on the existing `Klant` model:

- `parentId: UUID | None` — reference to parent Klant. `null` = top-level.
- `sourceControlIds: dict[str, str] | None` — maps `{copiedControlId: originalControlId}` to track auto-copied controls and their origin.

No changes to `Controle` or `ControleSeries` schemas. They already reference a Klant via `klantId`.

### Tree Construction

The frontend fetches all klanten via the existing flat `GET /klanten` endpoint and builds the tree client-side by grouping on `parentId`.

## Auto-Copy Behavior

### When a control is created on a Klant with children

1. Control is created normally on the target Klant.
2. For each direct child, a copy of the control is created with a new ID, linked to the child's `klantId`.
3. Recurse: each child that has its own children copies further down the subtree.
4. Each child Klant's `sourceControlIds` is updated with `{newControlId: originalControlId}`.

### When a new child Klant is added to a parent with existing controls

1. All controls from the parent are copied to the new child.
2. `sourceControlIds` is populated accordingly.

### Unlink action

- Removes the entry from `sourceControlIds`.
- The control remains but becomes fully independent — the "Overgenomen van" badge disappears.

### What auto-copy does NOT do

- No ongoing sync — once copied, changes to the original don't propagate.
- Deleting the original doesn't affect copies.
- Editing a copy doesn't affect the original or siblings.
- Moving a node (changing `parentId`) does NOT trigger auto-copy. The moved node keeps its existing controls as-is.

## API Changes

### Modified endpoints

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/klanten` | No change — returns flat list (includes `parentId`). Frontend builds tree. |
| `POST` | `/klanten` | Accepts optional `parentId`. If parent has controls, auto-copies them to new child. |
| `PUT` | `/klanten/{id}` | Can update `parentId` (move node in tree). |
| `DELETE` | `/klanten/{id}` | Cascading delete: removes all descendants and their associated controls/series. |

### New endpoint

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/klanten/{id}/children` | Returns direct children of a Klant. |

### Delete behavior

When deleting a Klant with children:
- All descendants are deleted recursively.
- All controls and series belonging to deleted klanten are deleted.
- The UI shows a confirmation dialog: "Dit verwijdert ook X sub-klanten en Y controles" (This will also delete X sub-klanten and Y controls).

### Auto-copy trigger

Happens server-side in `POST /controles`. When a control is created, the backend checks if the target Klant has descendants and creates copies automatically. The response includes how many copies were made.

## Frontend Changes

### Tree Sidebar (new component)

Replaces the current flat Klanten list. Appears on both the list page and detail page.

**Features:**
- Collapsible nodes with ▸/▾ toggles
- "+" button on hover for each node to add a child
- Search/filter input at the top
- Selected node highlighted
- Breadcrumb path shown above the detail panel title (e.g., "Acme Group › Finance › Accounts Payable")

### Klanten List Page (`/klanten`)

- Left panel: tree sidebar showing full hierarchy
- Right panel: detail view of the selected Klant
- "Nieuwe klant" button creates a top-level Klant
- "+" on a tree node creates a child Klant

### Klant Detail Page (`/klanten/:id`)

- Same tree sidebar on the left
- Detail panel shows:
  - Breadcrumb path to current node
  - **Controles** section (existing) — with "Overgenomen van [Parent]" badge on auto-copied controls and "Ontkoppelen" (unlink) action
  - **Sub-klanten** section (new) — lists direct children with "Toevoegen" (add) button
  - **Series** section (existing)
  - **Controlegeschiedenis** section (existing)

### Inherited Control Badge

On controls that were auto-copied:
- Purple text: "Overgenomen van [Parent Name]"
- "Ontkoppelen" link to unlink the control
- After unlinking, the badge disappears and the control is fully independent

### Create Klant Dialog

Updated to optionally accept a parent:
- When triggered from tree "+", `parentId` is pre-filled
- When triggered from "Sub-klanten" section, `parentId` is pre-filled
- When triggered from top-level "Nieuwe klant" button, `parentId` is null

## Storage

No structural changes to the file-based JSON storage. Each Klant remains a single JSON file in `backend/storage/klanten/`. The `parentId` field establishes the hierarchy.

## Migration

Existing klanten get `parentId: null` and `sourceControlIds: null` — they become top-level nodes. No data migration script needed; the backend handles missing fields with defaults.
