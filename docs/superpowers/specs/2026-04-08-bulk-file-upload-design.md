# Bulk File Upload for Controles and Series

**Date:** 2026-04-08
**Status:** Approved

## Overview

Implement a unified `FileUploadManager` component that centralizes file uploading and assignment for both single controle execution and series execution. Users upload files into a pool, then drag-and-drop them onto template slots. Each slot accepts multiple files. Files can be reused across slots. Both PDF and XLSX file types are supported.

## Requirements

1. **Multi-file per template slot** — Each template file definition accepts 1 or more uploaded files (e.g., 3 PDFs for "sample_signalen").
2. **Upload once, assign many (series)** — Files are uploaded into a central pool and assigned to steps via drag-and-drop. A single file can be reused across multiple steps.
3. **File type support** — Both PDF (.pdf) and spreadsheet (.xlsx) uploads during execution, matching the controle's file type definitions.
4. **Per-file results** — Each uploaded file gets its own independent extraction and rule evaluation. Results are displayed per-file within each template slot section.

## Architecture

### FileUploadManager Component

A shared React component used by both `RunControle` and `RunSeries`. Two-phase UI:

**Phase 1 — Upload pool:**
- Central drop zone accepting multiple files via drag-and-drop or file picker
- Accepts PDF and XLSX files
- Uploaded files appear as chips in a pool area with filename, type icon, and remove button
- Files are uploaded to the backend immediately on drop/select (using existing `uploadPdf` / `uploadSpreadsheet` endpoints)

**Phase 2 — Assignment:**
- Below the pool, each template slot is rendered as a drop target card
- Slots display their label and expected file type (PDF/XLSX)
- User drags files from the pool into slots
- Files stay in the pool after assignment (reusable across slots)
- Assigned files appear as removable chips within the slot
- File type validation on drop — reject mismatched types with a toast
- For series: slots are grouped by step, with step name and condition badge

### Props Interface

```ts
interface UploadedFile {
  id: string;           // pdf_id or spreadsheet_id
  filename: string;
  type: "pdf" | "spreadsheet";
}

interface SlotDefinition {
  key: string;           // fileDefId (controle) or stepId_fileDefId (series)
  label: string;         // e.g., "sample_medewerkers"
  group?: string;        // For series: step name with condition
  fileType: "pdf" | "spreadsheet";
}

interface FileUploadManagerProps {
  slots: SlotDefinition[];
  onAssignmentsChange: (assignments: Record<string, UploadedFile[]>) => void;
}
```

### Sub-components

- `DraggableFileChip` — Draggable chip for pool items. Shows filename, file type icon, remove button.
- `FileDropSlot` — Drop target for assignment slots. Shows label, file type badge, drop zone, assigned file chips.

### Drag-and-Drop

HTML5 native drag-and-drop, no external library:
- Pool chips are `draggable` with `onDragStart` setting file data in `dataTransfer`
- Slot cards have `onDragOver` (with `preventDefault` to allow drop) and `onDrop` handlers
- Visual feedback: slot highlights on drag-over, dims on invalid file type

## Backend Changes

### Controle Run Endpoint

**Current:** `POST /controles/{id}/run` with `files: { file_def_id: pdf_id }`

**New:** `files: { file_def_id: [pdf_id_1, pdf_id_2, ...] }`

Backward compatible: if a value is a plain string, wrap it in a list.

For each file definition, the backend loops over all provided file IDs and runs extraction independently per file. Each `ExtractionResponse` gains a `source_filename` field for frontend grouping.

### Series Run Endpoint

**Current:** `POST /controle-series/{id}/run` with `files: { step_id: { file_def_id: pdf_id } }`

**New:** `files: { step_id: { file_def_id: [pdf_id_1, ...] } }`

Same backward-compatible wrapping.

### Run Result Storage

`ControleRunResult.fileResults` entries are tagged with `fileDefId` and `sourceFilename` to distinguish multiple files within the same template slot.

## Results Display

### Single Controle

```
┌─ Summary ───────────────────────────┐
│  12 Velden OK  │  3 Afwijkingen  │  4/5 Regels │
└─────────────────────────────────────┘

┌─ sample_medewerkers ────────────────┐
│  ▸ file2.xlsx    (4/4 OK)           │
│    [field table]                     │
│  ▸ file5.xlsx    (3/4 OK)           │
│    [field table]                     │
└─────────────────────────────────────┘

┌─ sample_signalen ───────────────────┐
│  ▸ file1.pdf     (2/3 OK)           │
│    [field table]                     │
│  ▸ file3.pdf     (3/3 OK)           │
│    [field table]                     │
└─────────────────────────────────────┘
```

Each file definition is a collapsible section. Within it, each uploaded file has its own sub-section with field results table. Summary cards aggregate across all files.

Rules are evaluated per-file — each file gets its own independent rule evaluation against its own extracted values. Rule results are displayed per-file alongside field results.

### Series

Step-by-step status cards (unchanged). Each step's controle results follow the same per-file grouping.

## File Changes

### New Files
- `frontend/src/components/FileUploadManager.tsx`
- `frontend/src/components/DraggableFileChip.tsx`
- `frontend/src/components/FileDropSlot.tsx`

### Modified Files
- `frontend/src/pages/RunControle.tsx` — Replace inline upload UI with `FileUploadManager`
- `frontend/src/pages/RunSeries.tsx` — Replace per-step upload with `FileUploadManager` (series mode)
- `frontend/src/api/client.ts` — Update `runControle` and `runControleSeries` to send arrays
- `frontend/src/types/index.ts` — Add `UploadedFile` type
- `backend/routers/controles.py` — Accept `list[str]` per slot, loop extraction per file
- `backend/routers/controle_series.py` — Same array support
- `backend/models/schemas.py` — Add `source_filename` to `ExtractionResponse`

## Validation

Before allowing "Controle uitvoeren" / "Serie uitvoeren":
- Every slot must have at least one file assigned
- File types must match slot expectations (PDF slots only accept PDFs, spreadsheet slots only accept spreadsheets)

## Dependencies

No external dependencies. HTML5 drag-and-drop + existing shadcn/ui components.
