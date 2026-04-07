# Spreadsheet Support in Control Creation

**Date:** 2026-04-07
**Status:** Approved

## Overview

Add `.xlsx` spreadsheet support to the control creation wizard alongside existing PDF support. Spreadsheets offer structured data that can be directly read (no OCR/bbox extraction needed), enabling a simpler field selection experience and new calculation capabilities in the rules canvas.

## Design Decisions

- **First sheet only** — multi-sheet support out of scope
- **Read-only viewer** — no in-app editing of spreadsheet data
- **`.xlsx` only** — no `.csv` or `.xls`
- **Output-only formulas** — no write-back to spreadsheet cells
- **Auto-import columns** — headers become field_input nodes on the rules canvas automatically

---

## 1. Data Model Changes

### ControleFile Extension

`ControleFile` gains a `fileType` discriminator and spreadsheet-specific fields:

```typescript
interface ControleFile {
  id: string;
  label: string;
  fileType: "pdf" | "spreadsheet";  // NEW discriminator
  // PDF-specific (existing)
  pdfId: string | null;
  pdfFilename: string | null;
  pageCount: number;
  // Spreadsheet-specific (NEW)
  spreadsheetId: string | null;
  spreadsheetFilename: string | null;
  sheetData: SheetData | null;
  // Shared
  fields: Field[];
  extractionResults: FieldResult[] | null;
}

interface SheetData {
  headers: string[];           // First row values (column names)
  rows: CellValue[][];         // 2D grid (row-major, excludes header row)
  rowCount: number;
  colCount: number;
}

type CellValue = string | number | boolean | null;
```

### New Field Types

Two new field types for spreadsheet sources, added to the existing Field union:

```typescript
interface CellField extends BaseField {
  type: "cell";
  cell_ref: { col: number; row: number };  // 0-indexed
}

interface CellRangeField extends BaseField {
  type: "cell_range";
  range_ref: {
    startCol: number; startRow: number;
    endCol: number; endRow: number;
  };
}
```

### New RuleOperand Types

```typescript
// Added to existing RuleOperand union
{ type: "formula"; expression: string; spreadsheet_id: string }
{ type: "range_ref"; spreadsheet_id: string; range: { startCol: number; startRow: number; endCol: number; endRow: number } }
```

---

## 2. Backend — Spreadsheet Upload & Parsing

### New Router: `backend/routers/spreadsheets.py`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/spreadsheets/upload` | POST | Upload `.xlsx`, parse first sheet, return grid |
| `/spreadsheets/{id}` | GET | Retrieve parsed grid data |
| `/spreadsheets/{id}/cell?col=N&row=N` | GET | Get single cell value |
| `/spreadsheets/{id}/range?startCol=N&startRow=N&endCol=N&endRow=N` | GET | Get range values |

### Upload Response Shape

```json
{
  "spreadsheet_id": "uuid",
  "filename": "report.xlsx",
  "headers": ["Naam", "Bedrag", "Datum"],
  "rows": [["Jan", 1500, "2026-01-01"]],
  "row_count": 150,
  "col_count": 8
}
```

### Storage

Same pattern as PDFs: raw `.xlsx` stored via `storage_backend`, parsed grid cached as JSON metadata file alongside it.

### Dependencies

- `openpyxl` — for parsing `.xlsx` files

---

## 3. Frontend — Spreadsheet Viewer & Cell Selection

### Bestanden Tab Changes

- Upload dropzone accepts `.xlsx` alongside PDF
- Label updated from "Alleen PDF-bestanden" to "PDF of Excel bestanden"
- When a spreadsheet file is present, "Bewerken" opens `SpreadsheetViewer` instead of `TemplateBuilder`
- No extraction preview step needed for spreadsheets (data is already structured)

### SpreadsheetViewer Component (`components/SpreadsheetViewer.tsx`)

- Renders read-only HTML `<table>` from `SheetData`
- First row as sticky header
- Click cell → creates `cell` field (cell highlighted with colored overlay)
- Click-drag across cells → creates `cell_range` field (range highlighted)
- Side panel lists selected fields with auto-generated labels (header + row, e.g. "Bedrag_R3"), user can rename
- No third-party grid library needed — simple `<table>` with click handlers

### State Flow

1. User uploads `.xlsx` → `POST /spreadsheets/upload`
2. Response populates `ControleFile` with `fileType: "spreadsheet"`, `sheetData`, `spreadsheetId`
3. "Bewerken" → `SpreadsheetViewer`
4. Cell selections → `Field[]` entries
5. Back to Bestanden → proceed to Regels

---

## 4. Regels Canvas — Auto-Import & New Node Types

### Auto-Import

When entering Regels with a spreadsheet file, all `headers` from `SheetData` are automatically placed as `field_input` nodes on the canvas — one per column, arranged vertically on the left. Each references the full column as a `cell_range` field.

### New Node: `formula` (category: Spreadsheet, color: green)

- Text input for spreadsheet-style formulas (e.g. `=SUM(A1:A10)`, `=A1*B1`, `=IF(A1>100, "high", "low")`)
- Single computed output, connectable to any value-accepting node
- Evaluated by backend formula engine against cached grid

### New Node: `cell_range` (category: Spreadsheet, color: green)

- User specifies range via text (e.g. `B2:B50`) or auto-created from field selection
- Output connectable to aggregate nodes (sum, average, count, min, max), table nodes, or formula nodes

### Node Menu

New "Spreadsheet" category added to `RulesPanel.tsx`, only enabled when control has a spreadsheet file.

### Connection Rules

- `formula` output → math, comparison, validation, condition nodes
- `cell_range` output → aggregate nodes, table nodes, formula nodes

---

## 5. Backend — Rule Engine Changes

### New Service: `backend/services/formula_engine.py`

- Takes formula string + spreadsheet grid data
- Resolves cell references (e.g. `A1`, `B2:B50`) against the grid
- Evaluates using `formulas` Python package
- Supported functions: `SUM`, `AVERAGE`, `COUNT`, `MIN`, `MAX`, `IF`, `VLOOKUP`, `ABS`, `ROUND`, basic arithmetic
- Errors (bad reference, division by zero) return clear error message

### Rule Engine Integration (`rule_engine.py`)

New operand resolution:
- `"formula"` operand → call `formula_engine.evaluate(expression, grid)`
- `"range_ref"` operand → slice grid, return list of values
- `"cell"` / `"cell_range"` field types → direct grid lookup (no chain engine)

### Controle Execution (`controles.py`)

- Load spreadsheet grid data alongside PDF extraction when running a controle
- Pass grid into rule engine context

### Extraction Endpoint (`/test`)

- For spreadsheet fields, return cell values directly from grid — no extraction pipeline

---

## 6. Scope

### In Scope

- `.xlsx` upload, parsing, and storage
- Read-only spreadsheet viewer with cell/range selection
- Two new field types: `cell`, `cell_range`
- Two new canvas node types: `formula`, `cell_range`
- Auto-import of spreadsheet columns as field_input nodes
- Formula evaluation engine (backend)
- Rule engine support for new operand types

### Out of Scope

- Multiple sheet support (first sheet only)
- In-app spreadsheet editing
- `.csv` or `.xls` format support
- Write-back to spreadsheet cells
- Mixing PDF and spreadsheet fields in cross-file rules

---

## 7. Files Modified

### Backend (Python)
- **New:** `backend/routers/spreadsheets.py`
- **New:** `backend/services/formula_engine.py`
- **Modified:** `backend/services/rule_engine.py`
- **Modified:** `backend/routers/controles.py`
- **Modified:** `backend/models/schemas.py`
- **New dependency:** `openpyxl`, `formulas`

### Frontend (React/TypeScript)
- **New:** `frontend/src/components/SpreadsheetViewer.tsx`
- **Modified:** `frontend/src/components/rules/RuleNodes.tsx`
- **Modified:** `frontend/src/components/wizard/WizardBestandenTab.tsx`
- **Modified:** `frontend/src/components/rules/RulesPanel.tsx`
- **Modified:** `frontend/src/components/rules/serializeGraph.ts`
- **Modified:** `frontend/src/types/index.ts`
- **Modified:** `frontend/src/store/appStore.ts`
- **Modified:** `frontend/src/api/client.ts`
