# BCS - PDF Data Extractor

## Problem Statement

Azure Document Intelligence was tested for extracting labeled fields from invoices/receipts but confidence scores were too low and inconsistent for production use. Needed a deterministic, non-probabilistic approach with 100% labeling accuracy on known document layouts.

## Evolution of Approach

### Phase 1: Hybrid Bounding Box + AI (abandoned)

Initial approach used Claude AI to validate/clean extracted text. Removed because:
- AI is probabilistic — can't guarantee 100% accuracy
- Adds latency and API cost per extraction
- For known document templates, deterministic rules are more reliable

### Phase 2: Deterministic Static/Dynamic Fields

No AI. Pure algorithmic extraction with two field types and a validation rules engine.

### Phase 3: Configurable Chain System

Replaced hardcoded anchor fallback logic with per-field configurable chain pipelines. Each field defines its own search → value → validate strategy instead of using a one-size-fits-all approach. Also added PDF library for managing uploaded files.

### Phase 4: Two-File Comparison Mode (current)

Added comparison mode where a template works with two PDFs side by side (e.g., order receipt vs invoice). Fields can be drawn on either file, and `compare_field` rules validate values across documents. Uses React Flow for a pannable/zoomable side-by-side canvas.

---

## Core Concepts

### Field Types

**Static fields** — Single bounding box at a fixed position. For content that never moves (company name, logo area, header text). Extracts text directly from coordinates.

**Dynamic fields** — Two regions: an **anchor** (known text like "Total:") and a **value** (the actual data). The system verifies the anchor text matches before trusting the value. If anchor fails, value is flagged — never silently wrong.

The key insight: the anchor is the reference point. The value always follows it at the same **offset vector** (fixed dx/dy distance). This means if the layout shifts, the value follows the anchor automatically.

### Why Not Just Fixed Boxes?

1. **Layout shift** — Extra rows push content down. A fixed box for "Total" lands on empty space when there are more line items than expected.
2. **Silent failure** — A fixed box doesn't know what it reads. If "Invoice Date" and "Due Date" swap positions, the wrong value is extracted with no error.
3. **The anchor-value pattern** catches both problems: it verifies what it found, and it follows layout shifts.

---

## Anchor Fallback Chain

When a dynamic field's anchor isn't found at its expected position, the system runs a 4-step fallback:

| Step | What it does | Status | Trusted? |
|------|-------------|--------|----------|
| 1. Exact position | Check anchor at template coordinates | `ok` | Yes |
| 2. Vertical slide | Expand search ±30% vertically, same column | `anchor_shifted` | Yes, auto-trusted |
| 3. Full-page search | Search entire page for anchor text | `anchor_relocated` | Needs human review |
| 4. Not found | Anchor text doesn't exist on page | `anchor_not_found` | No |

### How the value follows the anchor

```
Template:  anchor(0.3, 0.5) → value(0.5, 0.5)  offset: (dx: +0.2, dy: 0)
Shifted:   anchor found at (0.3, 0.55)           dy = +0.05
Result:    value extracted from (0.5, 0.55)       same offset applied
```

- **Slide search** only shifts vertically (dx=0) — covers the most common case (rows added/removed above)
- **Full-page search** shifts both dx and dy — anchor could be anywhere

### Adjacent Scan (for relocated anchors)

When anchor is relocated and the offset-based value extraction returns empty (the spatial relationship between anchor and value changed), the system falls back to **adjacent scanning**:

1. Find the anchor's new position
2. Try offset-based extraction → if empty or wrong format...
3. Scan the same line as the found anchor, looking to the right for text matching the field's `value_format`
4. If found, use that value and return its exact coordinates

This handles the case where "Gross Pay:" moved to a completely different table structure but `$1,980.00` is still right next to it.

### Value Format Auto-Detection

When creating a template, the system auto-detects the value format from the template PDF:
- `currency` — e.g., `$4,200.00`
- `number` — e.g., `80.00`
- `integer` — e.g., `007841`
- `date` — e.g., `Mar 19, 2026`
- `string` — anything else

Stored as `value_format` on the field. Used during relocated anchor adjacent scanning to find the right value.

---

## Validation Rules System

Each field has a `rules: Rule[]` array. All rules must pass or the field is flagged `rule_failed`.

| Rule | Purpose | Example |
|------|---------|---------|
| `exact_match` | Value must equal a specific string | Company name = "Meridian Technologies Inc." |
| `data_type` | Must be string/number/integer/date/currency | Total must be `currency` |
| `range` | Numeric value within min/max bounds | Amount between 0 and 100,000 |
| `one_of` | Must be from a list of allowed values | Department in [Engineering, Sales, HR] |
| `pattern` | Must match a regex | Employee ID matches `^EMP-\d{5}$` |
| `not_empty` | Must have a value | — |
| `date_before` | Date must be before threshold | Pay date before 2026-03-18 |
| `date_after` | Date must be after threshold | Start date after 2025-01-01 |
| `compare_field` | Compare against another field's value | net < gross, total_deductions < gross |

### Cross-Field Comparison

Rules can reference other fields by label. The extraction uses a **two-pass approach**:
1. Pass 1: Extract all field values
2. Pass 2: Validate rules (including cross-field comparisons with access to all values)

### Exact Match Auto-Populate

When adding an `exact_match` rule, the "Use Current" button extracts the text from the field's region on the current PDF and fills it in automatically. No manual typing needed.

---

## UI Architecture

### Three Modes

| Mode | Header | Purpose |
|------|--------|---------|
| **Create** (blue) | Draw fields, add rules, save template |
| **Testing** (violet) | Load template, run test against new PDF |
| **Editing** (green) | Modify existing template fields/rules |

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Header: PDF Data Extractor — file.pdf  [Files][+]  │
├────────────┬──────────────────────┬─────────────────┤
│  Left      │  Center              │  Right          │
│  Sidebar   │  PDF Viewer          │  Test Results   │
│            │  + SVG overlay       │  (slide-out)    │
│  - Mode    │  + Toolbar           │                 │
│  - Draw    │    (zoom/pan/hide)   │  - Pass/fail    │
│  - Fields  │                      │  - Per-field    │
│  - Chain   │                      │  - Rule details │
│  - Rules   │                      │  - Chain traces │
│  - Save    │                      │  - Anchor info  │
│  - Temps   │                      │                 │
└────────────┴──────────────────────┴─────────────────┘
```

### App Startup & PDF Management

On startup, the app auto-loads the first uploaded PDF so the editor is immediately visible — no blank upload screen. Upload is a **modal** triggered by the header "Upload" button. The "Files" button opens a dropdown to switch between uploaded PDFs.

If no PDFs exist at all, a minimal empty state with an "Upload PDF" button is shown.

### Header Controls

- **Files** button: dropdown listing all uploaded PDFs with switch/delete
- **Upload** button: opens modal for drag-and-drop multi-file upload
- Current filename shown next to the app title

### PDF Toolbar

- Page navigation: `< 1/3 >`
- Zoom: `-` / `100%` / `+` (50% to 300%)
- Toggle markers: eye icon to show/hide all field overlays

### Field Visualization on PDF

- **Static fields**: Blue boxes with label tag
- **Dynamic fields**: Amber anchor box (with anchor icon) + blue value box + dashed connecting line
- **Test results**: Border colors change (green=OK, red=error, blue=shifted, amber=relocated)
- **Shifted fields**: Gray ghost boxes at original position + purple shift arrows + colored boxes at new position
- **Adjacent-found values**: Value box renders at the actual data location, not the offset position
- **Draggable boxes**: In edit/create mode, anchor and value boxes can be grabbed and dragged to reposition them (indigo dashed border while dragging). No need to delete and redraw.

### Per-Field Edit Mode

Clicking the pencil icon (visible on hover) on a sidebar field row enters edit mode:
- The field label turns into an inline input for renaming (Enter to confirm, Escape to cancel)
- `editingFieldId` is set in the store, which hides all other fields on the canvas (`display: none`)
- The selected field gets an indigo dashed border on the canvas
- Drag handles (`cursor: move`) on anchor/value boxes allow repositioning
- Escape key or clicking empty canvas exits edit mode
- The sidebar row highlights with an indigo border to show which field is active

Both the pencil (edit) and X (delete) icons on sidebar field rows are hidden by default and appear on hover (`group-hover/field:opacity-100`).

### Chain Edit Mode on PDF

When editing a field's chain, all other fields are fully hidden (same mechanism as field edit mode). The active field shows:
- Vertical slide tolerance zone (amber dashed rectangle)
- Full-page search boundary (subtle page outline)
- Custom region search areas (amber dashed rectangle with "search region" label)
- Adjacent scan direction arrows (blue arrows showing scan direction)
- Offset vector (indigo dashed arrow from anchor center to value center)

### Results Panel (right slide-out)

- Pass/fail count summary
- Per-field cards: label, type badge, value, status badge, anchor info, shift description, rule pass/fail list
- Chain step traces: per-step execution trace with category colors (amber=search, blue=value, green/red=validate)
- Color-coded: green rows for OK, red for errors, blue tint for shifted, amber tint for relocated

---

## Architecture (Current)

```
bcs/
├── backend/                  # Python FastAPI
│   ├── main.py               # App entry, CORS
│   ├── routers/
│   │   ├── pdfs.py           # Upload (multi-file), serve, list, delete, extract-region, detect-format
│   │   ├── templates.py      # CRUD + update for templates
│   │   └── extract.py        # POST /extract, POST /test
│   ├── services/
│   │   ├── pdf_service.py    # pdfplumber extraction, anchor search (slide + fullpage + adjacent)
│   │   ├── extraction_service.py  # Legacy fallback chain, rule validation, two-pass extraction
│   │   ├── chain_engine.py   # Configurable chain execution engine (replaces hardcoded logic)
│   │   └── template_store.py # JSON file storage
│   ├── models/schemas.py     # Region, Field, Rule, ChainStep, StepTrace, Template, FieldResult
│   └── storage/
│       ├── uploads/           # Uploaded PDF files ({uuid}.pdf)
│       │   └── _metadata.json # Original filenames + page counts
│       └── templates/         # Saved template JSON files
│
└── frontend/                 # React + TypeScript + Tailwind + Vite
    └── src/
        ├── App.tsx                  # Main layout, header, files dropdown, upload modal, auto-load first PDF
        ├── components/
        │   ├── PdfUploader.tsx       # Standalone upload component (used as fallback, not primary)
        │   ├── PdfViewer.tsx         # react-pdf + toolbar (zoom/pan/hide markers) — single mode
        │   ├── ComparisonCanvas.tsx  # React Flow canvas with two PdfNode nodes — comparison mode
        │   ├── ComparisonFieldsPanel.tsx # Two-column drag-to-connect field linking UI
        │   ├── BboxCanvas.tsx        # SVG overlay: fields, ghost boxes, shift arrows, chain edit, drag-to-move
        │   ├── TemplatePanel.tsx     # Sidebar: 3 modes, fields/connections tabs, rules/chain, templates
        │   ├── ExtractionResults.tsx # Right panel: test results + chain traces
        │   ├── ChainEditor.tsx       # Chain pipeline editor (steps, config, reorder, region draw)
        │   └── RulesEditor.tsx       # Legacy inline rule editor per field
        ├── store/appStore.ts         # Zustand: fields, templates, results, drawing, chain edit, drag state, comparison mode
        ├── hooks/useBboxDrawing.ts   # Mouse drag → rectangle
        ├── api/client.ts             # All backend API calls (upload, list, delete PDFs + templates + extract)
        ├── types/index.ts            # Region, Field, ChainStep, StepTrace, Rule, FieldResult, etc.
        └── utils/coords.ts           # Pixel ↔ normalized conversion
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/pdfs/upload` | Upload PDF, get pdf_id + page_count + filename |
| GET | `/pdfs` | List all uploaded PDFs (filename, page_count, pdf_id) |
| GET | `/pdfs/{id}` | Serve PDF file |
| DELETE | `/pdfs/{id}` | Delete an uploaded PDF |
| POST | `/pdfs/{id}/extract-region` | Extract text from a single region |
| POST | `/pdfs/{id}/detect-format` | Extract text + auto-detect format |
| POST | `/templates` | Create template |
| GET | `/templates` | List all templates |
| GET | `/templates/{id}` | Get one template |
| PUT | `/templates/{id}` | Update template |
| DELETE | `/templates/{id}` | Delete template |
| POST | `/extract` | Extract using saved template |
| POST | `/test` | Test with inline fields (no saved template) |

## Running the App

**Backend:**
```bash
cd backend
pip install -e .
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Key Design Decisions & Rationale

### No AI — Deterministic Only

Decision: Remove Claude AI entirely. Use algorithmic extraction + rule-based validation.

Why: For known document templates, deterministic rules give 100% predictable results. AI adds uncertainty — a model might return different confidence scores on the same document. The user needs to trust that "OK" means definitively OK, not "probably OK."

### Normalized Coordinates (0.0-1.0)

All coordinates stored as percentages of page dimensions. Conversion happens in exactly two places:
- Frontend `coords.ts`: pixel ↔ normalized
- Backend `pdf_service.py`: normalized → pdfplumber absolute points

This makes templates work across different PDF sizes, zoom levels, and DPIs.

### Two-Pass Extraction

Pass 1 extracts all values. Pass 2 validates rules. This separation is necessary because `compare_field` rules need access to other fields' values that may not be extracted yet.

### Configurable Chain System

Replaced the hardcoded 4-step anchor fallback with a configurable chain pipeline per field. Each field has a `chain: ChainStep[]` that defines its extraction + validation strategy.

**Chain step categories:**
- **search** (amber): Find the anchor — if-else semantics (first match wins, rest skipped). Types: `exact_position`, `vertical_slide`, `full_page_search`, `region_search`
- **value** (blue): Land the value — if-else semantics. Types: `offset_value`, `adjacent_scan`
- **validate** (purple): Check the value — AND semantics (all must pass). Types: all existing rule types (`not_empty`, `exact_match`, `data_type`, `range`, `one_of`, `pattern`, `date_before`, `date_after`, `compare_field`)

**Execution order:** search steps → value steps → validate steps. Each category is processed in order within the chain.

**Default chain for new dynamic fields:**
1. exact_position → 2. vertical_slide(±30%) → 3. full_page_search → 4. offset_value → 5. adjacent_scan(right)

**Chain edit mode:** When editing a field's chain, all other fields on the PDF dim to 15% opacity. The active field's chain visualizations (search regions, scan directions, offset vectors) render on the PDF overlay.

**Backward compatibility:** Fields with empty `chain: []` use the legacy hardcoded logic + flat `rules` array. Fields with a non-empty chain use the chain engine exclusively.

**Architecture:**
- `chain_engine.py`: Interprets chain steps using existing `pdf_service.py` functions
- `ChainEditor.tsx`: Vertical pipeline UI with connected steps, drag reorder, inline config
- `StepTrace`: Each chain execution produces per-step traces shown in test results

### Custom Region Search

The `region_search` chain step allows users to draw a search region directly on the PDF. Instead of searching the full page or sliding vertically, the engine only looks for the anchor text within the user-defined rectangle. This is useful when anchor text appears multiple times on a page and you need to constrain which instance to match.

**Flow:** User adds a `region_search` step → clicks "Draw Region" → draws a rectangle on the PDF → that region is saved as `search_region` on the step → the chain engine uses it during extraction.

When in region drawing mode, an amber banner appears on the PDF and the next drawn rectangle is captured as the search region (not as a new field).

### Two-File Comparison Mode

Templates can operate in `"single"` (default) or `"comparison"` mode. Comparison mode adds:

**Backend:**
- `Field.source: "a" | "b"` — which PDF the field belongs to (default `"a"`)
- `Template.mode: "single" | "comparison"` — persisted with the template
- `extract_all_fields(pdf_path, fields, pdf_path_b=None)` — routes each field to correct PDF by `field.source`
- `compare_field` rule: `equals`/`not_equals` do string comparison (dates, text work). Ordering operators try numeric, fall back to string.

**Frontend:**
- `ComparisonCanvas.tsx` — React Flow canvas with two `PdfNode` custom nodes. Each node: file selector, page nav, PDF render + BboxCanvas overlay. Nodes are draggable.
- `ComparisonFieldsPanel.tsx` — Two-column (A left, B right) with SVG connection lines. Drag from connect dot to create `compare_field` rules. Click connection to edit operator or delete.
- `TemplatePanel` — "Single / Comparison" mode toggle. "Fields / Connections" tab switcher in comparison mode. Fields tab: full field list with chains/rules. Connections tab: the two-column linking UI.
- `BboxCanvas` — `source` prop filters fields per PDF. Results keyed by `source:label` to handle same-named fields.
- `appStore` — PDF B state (`pdfIdB`, `pageCountB`, etc.), `activeSource`, `templateMode`, `canDrawFields`.

**Backward compatibility:** All new fields have defaults. Existing single-file templates load without issues.

### Draggable Field Boxes

Anchor and value boxes can be repositioned by dragging them directly on the PDF in create/edit mode. Hover on a box → cursor changes to move → drag to new position → release to commit. The box shows an indigo dashed border while being dragged. This eliminates the need to delete and redraw fields when the position is slightly off.

Implementation: Transparent SVG rects with `cursor: move` overlay each field box. On mousedown they `stopPropagation()` + `preventDefault()` to prevent the drawing hook from firing. A synchronous `dragStartedRef` (useRef) is set immediately to prevent a race condition where React's batched `setDrag()` hasn't updated yet when `onSvgMouseDown` checks the `drag` state — without the ref, the drawing handler would also fire, creating a duplicate field on top of the dragged one. On mouseup, the pixel delta is converted to normalized coordinates and the field's region is updated in the store.

### PDF Library & Upload Modal

PDFs persist across sessions. Users don't need to re-upload files they've already uploaded.

**Backend storage:** Uploaded PDFs are stored in `backend/storage/uploads/` with metadata (original filename, page count) in `_metadata.json`. The `GET /pdfs` endpoint lists all uploaded files. `DELETE /pdfs/{id}` removes them.

**Auto-load on startup:** On mount, the app fetches the PDF list and auto-loads the first one so the editor is immediately visible. No blank upload screen on startup when files exist.

**Upload modal:** Upload is a modal (not a full page), triggered by the header "Upload" button. Supports drag-and-drop and file picker with multi-file selection. The last uploaded file opens automatically.

**PDF switching:** The header "Files" button opens a dropdown listing all uploaded PDFs. Click to switch, hover to reveal delete button. Current PDF is highlighted with "Current" badge.

### Value Format as Template Metadata

Auto-detecting format at template creation time (not at test time) means the template carries enough information to find the right value even when the layout changes dramatically. The format acts as a fingerprint for the value.

---

## Issues Encountered & Fixed

1. **pyproject.toml missing wheel config** — Hatchling couldn't determine package structure. Fixed by adding packages list.
2. **API endpoint mismatch** — Frontend `/pdf/upload` vs backend `/pdfs/upload`. Fixed frontend client.
3. **Page indexing** — Frontend 1-indexed (react-pdf) vs backend 0-indexed (pdfplumber). Fixed backend to subtract 1.
4. **Can't draw bounding boxes** — react-pdf text/annotation layers intercepted mouse events. Fixed by disabling both layers.
5. **Anchor not found on layout shift** — Fixed by implementing the 4-step fallback chain (exact → slide → fullpage → not found).
6. **Relocated anchor finds empty value** — Offset vector becomes invalid when anchor moves horizontally. Fixed with adjacent scanning using value_format matching.
7. **Value box renders at wrong position** — When adjacent scan finds value, box rendered at offset position (empty space) instead of actual data location. Fixed by returning `value_found_x/y/width` from backend and using those coordinates in the SVG overlay.
8. **Circular import between chain_engine and extraction_service** — Both imported from each other. Fixed by using lazy imports (`_validate_rule` wrapper with deferred `from services.extraction_service import validate_rule`) and duplicating `_anchor_matches` locally in chain_engine.
9. **useBboxDrawing handlers referenced before definition** — Drag handler callbacks used `handlers` from `useBboxDrawing` before the hook was called. Fixed by moving `useBboxDrawing` call above the drag handler definitions.
10. **Drag-to-move also creates new field** — Race condition: `startDrag` calls `setDrag()` but React batches the state update, so `onSvgMouseDown` still sees `drag` as `null` and starts the drawing handler too. Fixed with a synchronous `dragStartedRef` (useRef) checked in `onSvgMouseDown` before delegating to the drawing handler.
11. **Same-named fields across PDFs show wrong result color** — `resultByLabel[r.label]` overwrites when two fields share a label (e.g., "total" on PDF A and "total" on PDF B). Fixed by keying results as `source:label` (e.g., `"a:total"`, `"b:total"`).
12. **compare_field fails on non-numeric values** — `compare_field` rule forced `parse_currency()` on all values, failing on dates like "March 18, 2026". Fixed: `equals`/`not_equals` now do direct string comparison. Ordering operators try numeric first, fall back to string lexicographic.
13. **ComparisonFieldsPanel misses same-named cross-PDF connections** — `fields.find(f => f.label === label)` returned the first match (same source), skipping the cross-PDF target. Fixed by preferring fields on the opposite source.
14. **ComparisonFieldsPanel only checked legacy rules, not chain steps** — Chain-based `compare_field` steps weren't shown as connections. Fixed by scanning both `field.rules` and `field.chain` with deduplication.
15. **Connection drag from PDF canvas nodes didn't register** — Drop target rects rendered inside each BboxCanvas SVG pane. The global `window mouseup` handler fired first and cleared drag state, removing the drop targets before they could see the event. Fixed by moving drop detection to the global `mouseup` handler using `document.elementsFromPoint()` to find the target field via `data-field-value` / `data-field-id` attributes.

---

## Phase 5: Canvas Connection Nodes (current)

Added drag-to-connect directly on the PDF canvas fields in comparison mode. Users can grab a connection node on a field and drag to a field on the other PDF to create a `compare_field` rule.

### What was added

**Connection nodes on fields (BboxCanvas.tsx):**
- Each field in comparison mode shows a violet circle (ring + inner dot) on the edge of its value box
- Source A fields: node on right edge. Source B fields: node on left edge
- Mousedown initiates connection drag via store state

**Drag-to-connect flow:**
1. Mousedown on node → `setConnectDragFrom({ fieldId, source })` in store
2. Global `mousemove` (via `useEffect` in ComparisonCanvas) → updates `connectDragMouse`
3. `ConnectionOverlay` renders dashed violet preview line from origin to cursor
4. Global `mouseup` → `document.elementsFromPoint()` checks for field from opposite source
5. If valid target → `setPendingConnection({ fromId, toId })`
6. Operator picker popup (equals, not equals, less than, etc.)
7. Confirm → `addRule(fromId, { type: 'compare_field', ... })`

**Always-visible connections:**
- `ConnectionOverlay` now always renders (not gated behind Linkages toggle)
- Existing connection lines (violet curved paths with operator badges) shown at all times
- Line endpoints positioned at field edges (right for A, left for B)

### Store additions (appStore.ts)
- `connectDragFrom: { fieldId, source } | null`
- `connectDragMouse: { x, y } | null` (screen coords)
- `pendingConnection: { fromId, toId } | null`
- Setters: `setConnectDragFrom`, `setConnectDragMouse`, `setPendingConnection`

### Key design decision: cross-pane drag
Each PDF pane has its own SVG canvas. SVG events don't bubble across panes. Solution: drag state lives in Zustand store (shared), global window event listeners handle mousemove/mouseup, and `document.elementsFromPoint()` detects the drop target across pane boundaries.
