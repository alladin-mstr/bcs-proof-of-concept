# BCS - PDF Data Extractor

## Problem Statement

Azure Document Intelligence was tested for extracting labeled fields from invoices/receipts but confidence scores were too low and inconsistent for production use. Needed a deterministic, non-probabilistic approach with 100% labeling accuracy on known document layouts.

## Evolution of Approach

### Phase 1: Hybrid Bounding Box + AI (abandoned)

Initial approach used Claude AI to validate/clean extracted text. Removed because:
- AI is probabilistic — can't guarantee 100% accuracy
- Adds latency and API cost per extraction
- For known document templates, deterministic rules are more reliable

### Phase 2: Deterministic Static/Dynamic Fields (current)

No AI. Pure algorithmic extraction with two field types and a validation rules engine.

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
│  Header: PDF Data Extractor          [Upload New]   │
├────────────┬──────────────────────┬─────────────────┤
│  Left      │  Center              │  Right          │
│  Sidebar   │  PDF Viewer          │  Test Results   │
│            │  + SVG overlay       │  (slide-out)    │
│  - Mode    │  + Toolbar           │                 │
│  - Draw    │    (zoom/pan/hide)   │  - Pass/fail    │
│  - Fields  │                      │  - Per-field    │
│  - Rules   │                      │  - Rule details │
│  - Save    │                      │  - Anchor info  │
│  - Temps   │                      │                 │
└────────────┴──────────────────────┴─────────────────┘
```

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

### Results Panel (right slide-out)

- Pass/fail count summary
- Per-field cards: label, type badge, value, status badge, anchor info, shift description, rule pass/fail list
- Color-coded: green rows for OK, red for errors, blue tint for shifted, amber tint for relocated

---

## Architecture (Current)

```
bcs/
├── backend/                  # Python FastAPI
│   ├── main.py               # App entry, CORS
│   ├── routers/
│   │   ├── pdfs.py           # Upload, serve, extract-region, detect-format
│   │   ├── templates.py      # CRUD + update for templates
│   │   └── extract.py        # POST /extract, POST /test
│   ├── services/
│   │   ├── pdf_service.py    # pdfplumber extraction, anchor search (slide + fullpage + adjacent)
│   │   ├── extraction_service.py  # Legacy fallback chain, rule validation, two-pass extraction
│   │   ├── chain_engine.py   # Configurable chain execution engine (replaces hardcoded logic)
│   │   └── template_store.py # JSON file storage
│   └── models/schemas.py     # Region, Field, Rule, Template, FieldResult, etc.
│
└── frontend/                 # React + TypeScript + Tailwind + Vite
    └── src/
        ├── components/
        │   ├── PdfUploader.tsx       # Drag-and-drop upload
        │   ├── PdfViewer.tsx         # react-pdf + toolbar (zoom/pan/hide markers)
        │   ├── BboxCanvas.tsx        # SVG overlay: fields, ghost boxes, shift arrows, chain edit mode
        │   ├── TemplatePanel.tsx     # Sidebar: 3 modes, fields, rules/chain, templates
        │   ├── ExtractionResults.tsx # Right panel: test results + chain traces
        │   ├── ChainEditor.tsx       # Chain pipeline editor (steps, config, reorder)
        │   └── RulesEditor.tsx       # Legacy inline rule editor per field
        ├── store/appStore.ts         # Zustand: fields, templates, results, drawing state
        ├── hooks/useBboxDrawing.ts   # Mouse drag → rectangle
        ├── api/client.ts             # All backend API calls
        └── utils/coords.ts           # Pixel ↔ normalized conversion
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/pdfs/upload` | Upload PDF, get pdf_id + page_count |
| GET | `/pdfs/{id}` | Serve PDF file |
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
