# Run Result Viewer Design

**Date:** 2026-04-08
**Status:** Approved

## Overview

Add a document viewer to control and series run results that shows PDFs and spreadsheets with extraction overlays — the same visual experience as the test run viewer, but read-only. Users can see exactly where and how fields were extracted from their documents.

## Decisions

| Question | Decision |
|---|---|
| Layout approach | Split layout: file sidebar (left), document viewer (center), extraction results (right) |
| Summary stats placement | Right panel as "Overzicht" tab alongside "Resultaten" tab |
| Series step navigation | Keep step cards as landing page, click a step to open viewer |
| File sidebar organization | Collapsible groups by slot with files nested underneath |
| Spreadsheet highlighting | Colored cell backgrounds matching field type colors, with labels |
| Implementation approach | Reuse existing TemplateBuilder components (PdfViewer, BboxCanvas, ExtractionResults) |

## Architecture

### New Component: `RunResultViewer`

A read-only split-panel viewer composing existing components. Used by both `RunControle` and `RunSeries`.

```
RunResultViewer
├── Left Panel: FileSidebar
│   └── Collapsible groups by slot (e.g., "TEST1")
│       └── File items with pass/fail indicator
├── Center Panel: Document Viewer
│   ├── PdfViewer + BboxCanvas (for PDFs) — read-only
│   └── ReadOnlySpreadsheetViewer (for spreadsheets) — highlighted cells
└── Right Panel: ResultsPanel (tabs)
    ├── Tab "Resultaten": ExtractionResults for selected file
    └── Tab "Overzicht": Summary stats + REGELRESULTATEN table
```

### Props Interface

```typescript
interface RunResultViewerProps {
  fileGroups: FileGroup[];
  ruleResults: TemplateRuleResult[];
  computedValues: Record<string, string>;
  summary: {
    fieldsOk: number;
    failures: number;
    rulesPassed: number;
    rulesTotal: number;
  };
}

interface FileGroup {
  label: string;              // slot name, e.g., "TEST1"
  files: FileEntry[];
}

interface FileEntry {
  fileId: string;             // pdf_id from ExtractionResponse
  filename: string;           // source_filename
  fileType: "pdf" | "spreadsheet";
  results: FieldResult[];
  passed: number;
  total: number;
}
```

Local state managed within the component: `selectedFileId`, `currentPage`, `zoomIndex`.

## Component Behavior

### FileSidebar (Left Panel)

- Collapsible groups by slot label, expanded by default
- Each file shows: filename, file type icon, `{passed}/{total} OK` badge
- Clicking selects the file — loads in center viewer, updates right panel
- First file auto-selected on mount
- Green badge if all OK, orange/red if failures

### Center Panel: Document Viewer

**PDF files:**
- `PdfViewer` renders the page, `BboxCanvas` overlays field regions from `FieldResult.resolved_region` and `value_found_x/y`
- Read-only: no dragging, resizing, or drawing
- Clicking an overlay highlights the corresponding field in the right panel
- Page navigation toolbar and zoom controls at top

**Spreadsheet files:**
- Grid display from spreadsheet data
- Extracted cells/ranges highlighted with colored backgrounds matching field type colors
- Field label shown as small floating tag on highlighted cells
- Hover shows extracted value in tooltip

### Right Panel: Tabs

**"Resultaten" tab (default):**
- `ExtractionResults` for the currently selected file (embedded mode)
- Clicking a field card scrolls center viewer to that field's location and pulses the overlay

**"Overzicht" tab:**
- Summary stat cards: Velden OK, Afwijkingen, Regels geslaagd
- REGELRESULTATEN table
- Computed values section (collapsible)
- Shows data for the entire run, not per-file

### Cross-panel Interaction

- Select file in sidebar → center + right panel update
- Click field in right panel → center viewer scrolls to field, overlay pulses
- Click overlay in center → field card highlights in right panel

## Routing

### RunControle

No new routes. Results phase replaces current table view with `<RunResultViewer>`. "Opnieuw uitvoeren" button stays in header.

### RunSeries

One new route: `/series/:seriesId/run/:runId/step/:stepId`
- Fetches step's controle run details (full `ExtractionResponse[]`)
- Renders `<RunResultViewer>`
- Back button returns to series run results
- Only steps with status `"passed"` or `"failed"` are clickable

## Backend Changes

### Problem

The `ExtractionResponse[]` (with coordinates, regions, anchors) is returned from `POST /controles/{id}/run` but only `ControleRunResult` (summary) is persisted. The series step detail view needs the full data.

### Solution

Persist the full `ExtractionResponse[]` alongside `ControleRunResult` when saving a run.

**New storage methods:**
- `save_controle_run_details(run_id, content)` — saves full `ExtractionResponse[]` JSON
- `get_controle_run_details(run_id)` — retrieves it

**New endpoint:**
- `GET /controles/runs/{run_id}/details` → returns `list[ExtractionResponse]`

**Modified endpoints:**
- `POST /controles/{controle_id}/run` — also calls `save_controle_run_details`
- `POST /controle-series/{series_id}/run` — also calls `save_controle_run_details` per step

## Files to Create

1. `frontend/src/components/RunResultViewer.tsx` — Main split-panel component
2. `frontend/src/components/FileSidebar.tsx` — Left panel with collapsible file groups
3. `frontend/src/components/ReadOnlySpreadsheetViewer.tsx` — Spreadsheet grid with highlighted cells

## Files to Modify

1. `frontend/src/components/BboxCanvas.tsx` — Add `readOnly` prop to disable drag/resize
2. `frontend/src/components/ExtractionResults.tsx` — Accept `FieldResult[]` and `TemplateRuleResult[]` as props (keep store fallback)
3. `frontend/src/pages/RunControle.tsx` — Replace results phase with `<RunResultViewer>`
4. `frontend/src/pages/RunSeries.tsx` — Make step cards clickable, navigate to step detail
5. `frontend/src/types/index.ts` — Add `FileGroup`, `FileEntry` types
6. `frontend/src/api/client.ts` — Add `getControleRunDetails()` API call
7. `frontend/src/App.tsx` (or router config) — Add series step detail route
8. `backend/routers/controles.py` — Persist full responses, add GET details endpoint
9. `backend/routers/controle_series.py` — Persist full responses per step
10. `backend/services/storage_backend.py` — Add `save/get_controle_run_details` methods

## Files Unchanged

- `PdfViewer.tsx` — already stateless, accepts props
- `SpreadsheetViewer.tsx` — not modified, new read-only variant created
- `appStore.ts` — `RunResultViewer` uses local state
