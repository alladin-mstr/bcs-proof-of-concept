# BCS — Business Logic, Features & Processes

> Deterministic PDF & Spreadsheet Data Extraction System for HR/Payroll Controls
>
> **Tech Stack**: React + Vite (frontend) · FastAPI + Python (backend) · JSON file storage (local or Azure Blob)

---

## Table of Contents

1. [Domain Overview](#1-domain-overview)
2. [Data Model](#2-data-model)
3. [Klant (Customer) Management](#3-klant-customer-management)
4. [Controle (Audit Control) Lifecycle](#4-controle-audit-control-lifecycle)
5. [File Handling (PDF & Spreadsheet)](#5-file-handling-pdf--spreadsheet)
6. [Field Extraction Pipeline](#6-field-extraction-pipeline)
7. [Chain Engine (Step-by-Step Extraction)](#7-chain-engine-step-by-step-extraction)
8. [Rule Engine (Validation & Computation)](#8-rule-engine-validation--computation)
9. [Formula Engine (Spreadsheet Formulas)](#9-formula-engine-spreadsheet-formulas)
10. [Controle Series (Multi-Step Workflows)](#10-controle-series-multi-step-workflows)
11. [Translation Rules (Signal Lookup)](#11-translation-rules-signal-lookup)
12. [Global Values](#12-global-values)
13. [Status Determination Logic](#13-status-determination-logic)
14. [Data Type Auto-Detection](#14-data-type-auto-detection)
15. [API Endpoints Reference](#15-api-endpoints-reference)
16. [Frontend Pages & User Flows](#16-frontend-pages--user-flows)
17. [Authentication & Authorization](#17-authentication--authorization)
18. [Storage Architecture](#18-storage-architecture)
19. [Key Business Constraints](#19-key-business-constraints)

---

## 1. Domain Overview

BCS is a **business control system** for HR/payroll service providers. It allows consultants to:

- **Define controls** — specify which fields to extract from which documents (PDFs, spreadsheets)
- **Execute controls** — run extraction + validation against real client documents
- **Chain controls** — build multi-step workflows where output of one control feeds into the next
- **Track results** — maintain an audit trail of all control executions per client
- **Manage clients** — organize clients hierarchically with inherited controls

The extraction approach is **deterministic** (template-based bounding boxes), not AI/ML-based. Fields are located via anchor text search with a multi-step fallback chain, and values are validated against configurable business rules.

---

## 2. Data Model

### Entity Relationship Overview

```
Klant (Customer)
  ├── Controle (Audit Control)
  │     ├── ControleFile (PDF or Spreadsheet slot)
  │     │     └── Field (Extraction Point)
  │     │           ├── Anchor (Location Reference)
  │     │           ├── ChainStep (Search → Value → Validate pipeline)
  │     │           └── Rule (Legacy field-level validation)
  │     │
  │     ├── TemplateRule (Validation or Computation)
  │     │     ├── ValidationConfig → RuleOperand (field_ref | literal | computed_ref | …)
  │     │     └── ComputationConfig → RuleOperand + Condition (if/then/else)
  │     │
  │     └── ComputedField (Output of a computation rule)
  │
  ├── ControleSeries (Sequential Workflow)
  │     └── ControleSeriesStep (ordered, with condition: always | if_passed | if_failed)
  │
  └── ControleRunResult (Execution record)
        └── FieldResult (Per-field extraction outcome + RuleResult[])

GlobalValueGroup → GlobalValue (Shared constants)
TranslationRule (Signal code → human-readable translation)
```

### Core Entities

#### Klant (Customer)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Customer name |
| `medewerkerCount` | int? | Employee count |
| `parentId` | UUID? | Parent klant (hierarchical) |
| `sourceControlIds` | dict? | Maps child controle IDs → parent controle IDs for inheritance tracking |
| `createdAt` | datetime | Creation timestamp |
| `updatedAt` | datetime | Last update timestamp |

#### Controle (Audit Control)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | string | Control name |
| `status` | `"draft"` \| `"published"` | Only published controls can be executed |
| `files` | ControleFile[] | PDF/spreadsheet file definitions |
| `rules` | TemplateRule[] | Validation and computation rules |
| `computedFields` | ComputedField[] | Calculated output fields |
| `ruleGraph` | dict? | React Flow `{nodes, edges}` for visual rule editor persistence |
| `klantId` | UUID? | Associated customer |
| `klantName` | string? | Denormalized customer name |

#### ControleFile

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `label` | string | Display name (e.g., "Loonstrook", "Jaaropgave") |
| `fileType` | `"pdf"` \| `"spreadsheet"` | Source type |
| `pdfId` | UUID? | Uploaded PDF reference |
| `spreadsheetId` | UUID? | Uploaded spreadsheet reference |
| `fields` | Field[] | Extraction fields defined on this file |
| `extractionResults` | FieldResult[]? | Cached results |
| `sheetData` | SheetData? | Parsed spreadsheet grid |

#### Field (Extraction Point)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `label` | string | Field name |
| `type` | `"static"` \| `"dynamic"` \| `"table"` \| `"cell"` \| `"cell_range"` | Extraction method |
| `anchor_mode` | `"static"` \| `"single"` \| `"bracket"` \| `"area_value"` \| `"area_locator"` \| `"area_bracket"` | How anchors are used |
| `anchors` | Anchor[] | Reference points for locating the field |
| `value_region` | Region? | Where to find the value (normalized 0–1 coordinates) |
| `extraction_mode` | `"strict"` \| `"word"` \| `"line"` \| `"edge"` \| `"paragraph"` | Boundary snapping |
| `chain` | ChainStep[] | Multi-step extraction pipeline |
| `rules` | Rule[] | Legacy field-level validation rules |
| `value_format` | DataType? | Expected data type |
| `source` | `"a"` \| `"b"` | Which PDF in comparison mode |
| `table_config` | TableConfig? | For table fields |
| `cell_ref` | CellRef? | For spreadsheet cell fields |
| `range_ref` | CellRange? | For spreadsheet range fields |

#### Region (PDF Coordinates)

All coordinates are normalized 0–1 relative to page dimensions.

| Field | Type |
|-------|------|
| `page` | int (1-indexed) |
| `x` | float (0–1) |
| `y` | float (0–1) |
| `width` | float (0–1) |
| `height` | float (0–1) |

#### Anchor

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `role` | `"primary"` \| `"secondary"` \| `"area_top"` \| `"area_bottom"` | Purpose |
| `region` | Region | Expected location |
| `expected_text` | string | Text to search for |

---

## 3. Klant (Customer) Management

### Hierarchical Organization

Klanten support unlimited parent-child nesting. A sub-klant (child) can itself have sub-klanten.

### Business Rules

1. **No self-reference** — A klant's `parentId` cannot be its own `id`
2. **No circular references** — Before updating a klant's parent, the system traverses all descendants to ensure the new parent is not among them
3. **Cascading delete** — Deleting a klant removes all descendants, their controles, controle series, and associated run results
4. **Auto-copy on child creation** — When a child klant is created with a `parentId`, all parent controles are automatically copied to the child. The mapping is tracked in `sourceControlIds[childControleId] = parentControleId`
5. **Auto-copy on parent controle creation** — When a new controle is created on a parent klant, it propagates to all descendants
6. **Unlinking** — A child can unlink an inherited controle via `/klanten/{id}/unlink-control/{controleId}`, removing the `sourceControlIds` entry and making the controle independent

---

## 4. Controle (Audit Control) Lifecycle

### States

```
Draft (Concept)  ──publish──▶  Published (Gepubliceerd)
```

- **Draft**: Work-in-progress. Can be edited freely. Cannot be executed.
- **Published**: Locked for execution. Only published controls appear in series step selection.

### Creation Flow

1. User navigates to the Control Wizard (`/controle/nieuw`)
2. **Step 1 — Files**: Upload and configure PDF/spreadsheet files. Define extraction fields per file.
3. **Step 2 — Rules**: Define validation and computation rules using the visual rule graph editor.
4. Save as Draft or Publish immediately.

### Execution Flow

1. User navigates to Run Control (`/controle/:id/run`)
2. **Upload phase**: Assign actual files (PDFs/spreadsheets) to each file slot defined in the controle
3. **Running phase**: System extracts all fields, evaluates all rules
4. **Results phase**: View per-field extraction results, rule evaluation outcomes, computed values, and overall status

### Execution Data Flow

```
PDF/Spreadsheet files
       │
       ▼
┌─────────────────────────┐
│  For each ControleFile:  │
│  ┌───────────────────┐  │
│  │ Chain Engine       │  │
│  │ (per field)        │  │
│  │  Search → Value    │  │
│  └───────────────────┘  │
│           │              │
│           ▼              │
│  Field extraction results│
└─────────────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Rule Engine             │
│  1. Resolve operands     │
│  2. Topo-sort by deps    │
│  3. Evaluate computations│
│  4. Evaluate validations │
└─────────────────────────┘
       │
       ▼
┌─────────────────────────┐
│  ControleRunResult       │
│  - status                │
│  - fields passed/failed  │
│  - rules passed/total    │
│  - entries (for reuse)   │
└─────────────────────────┘
```

---

## 5. File Handling (PDF & Spreadsheet)

### PDF Upload & Storage

- **Upload**: `POST /pdfs/upload` (multipart form, PDF only)
- **Storage**: Binary file stored via storage backend (local or Azure Blob)
- **Metadata**: `{pdf_id, filename, page_count}` in metadata catalog
- **Serving**: Streamed directly from storage

### PDF Operations

| Endpoint | Description |
|----------|-------------|
| `POST /pdfs/{id}/extract-region` | Extract text from a normalized region with extraction mode |
| `GET /pdfs/{id}/words?page=N` | Word-level bounding boxes (normalized 0–1) |
| `POST /pdfs/{id}/detect-format` | Auto-detect data type from region text |

### Spreadsheet Upload & Storage

- **Upload**: `POST /spreadsheets/upload` (multipart form, XLSX only)
- **Parsing**: openpyxl reads all worksheets; first row = headers, rest = data rows
- **Grid caching**: Parsed `{headers, rows, row_count, col_count}` stored as JSON for fast formula evaluation
- **Cell types preserved**: int, float, bool, string, None

### Spreadsheet Operations

| Endpoint | Description |
|----------|-------------|
| `GET /spreadsheets/{id}` | Full grid data |
| `GET /spreadsheets/{id}/cell?col=N&row=N` | Single cell value (0-based) |
| `GET /spreadsheets/{id}/range?startCol=…&endCol=…` | Cell range (clamped to bounds) |

---

## 6. Field Extraction Pipeline

### Field Types

| Type | Source | Description |
|------|--------|-------------|
| `static` | PDF | Fixed-position extraction; no anchor search |
| `dynamic` | PDF | Anchor-based; uses chain engine to locate value |
| `table` | PDF | Structured table with column definitions |
| `cell` | Spreadsheet | Single cell reference (col, row) |
| `cell_range` | Spreadsheet | Range reference (startCol, startRow, endCol, endRow) |

### Anchor Modes

| Mode | Anchors Used | Description |
|------|-------------|-------------|
| `static` | None | Value region is fixed on the page |
| `single` | Primary | Single anchor + offset to value |
| `bracket` | Primary + Secondary | Two anchors define a cell intersection |
| `area_value` | Area top + Area bottom | Value within bounded vertical area |
| `area_locator` | Primary + Area top + Area bottom | Anchor within area, then offset |
| `area_bracket` | Primary + Secondary + Area top + Area bottom | Bracket within bounded area |

### Extraction Modes

| Mode | Behavior |
|------|----------|
| `strict` | Exact region coordinates only |
| `word` | Snap boundaries to word edges |
| `line` | Snap boundaries to full line edges |
| `edge` | Smart edge detection for precise boundaries |
| `paragraph` | Multi-line text block extraction |

### Anchor Fallback Chain (Legacy Default)

When a field has no explicit `chain` configured, the system uses this fallback:

1. **Exact Position** — Check if anchor text matches at the stored `anchor_region`
2. **Vertical Slide (±30%)** — Search vertically within tolerance
3. **Full Page Search** — Search entire page for anchor text
4. **Block Search** — Search within pdfminer layout blocks

Each step produces a status: `ok` → `anchor_shifted` → `anchor_relocated` → `anchor_not_found`

### Table Extraction

- **Column detection**: Defined by left-edge x positions (normalized 0–1)
- **Width inference**: Gap between adjacent column x positions
- **Header row handling**: First row optionally marked as header
- **Key column merging**: Rows with empty key column merge upward into previous row
- **End-anchor modes**:
  - `none` — Fixed table height
  - `text` — Search for text marker (e.g., "Totaal") to determine end
  - `end_of_page` — Table extends to page bottom

---

## 7. Chain Engine (Step-by-Step Extraction)

Each field can have a configurable `chain` — an ordered list of steps that execute sequentially.

### Chain Step Categories

#### Search Steps (Find Anchor)

| Type | Description |
|------|-------------|
| `exact_position` | Check anchor at stored region |
| `vertical_slide` | Search vertically within `slide_tolerance` (default 0.3) |
| `full_page_search` | Search entire page |
| `region_search` | Search within user-defined `search_region` |
| `block_search` | Search within pdfminer layout blocks |
| `bracket_search` | Two-anchor grid cell location |
| `area_search` | Search within bounded vertical area |

First successful search step wins; remaining are skipped.

#### Value Steps (Extract Value)

| Type | Description |
|------|-------------|
| `offset_value` | Apply stored offset from anchor to value region |
| `adjacent_scan` | Scan right/below anchor for format-matching value |
| `block_value` | Extract from same/next layout block |
| `intersection_value` | Bracket intersection cell extraction |
| `area_text_value` | Extract text within resolved area bounds |

First successful value step wins; remaining are skipped.

### Chain Context (State Machine)

```python
{
    anchor_found: bool,
    anchor_text: str,
    anchor_dx: float,    # horizontal shift from expected position
    anchor_dy: float,    # vertical shift from expected position
    anchor_status: "ok" | "anchor_shifted" | "anchor_relocated" | "anchor_not_found",
    value: str,
    value_found: bool,
    step_traces: [...]   # execution log for debugging
}
```

---

## 8. Rule Engine (Validation & Computation)

### Architecture

The rule engine processes all template-level rules after field extraction. It receives:

- `extracted_values` — dict of all field values (keyed by label)
- `table_values` — dict of table data (keyed by label)
- `grid_data` — dict of spreadsheet grids (keyed by spreadsheet ID)
- `translation_rules` — lookup table for signal translations
- `series_context` — previous step results (for controle series data piping)

### Dependency Resolution

Rules are topologically sorted using Kahn's algorithm:

1. Build dependency graph from `computed_ref` operands
2. Process in dependency order (computations first, then validations)
3. Circular dependencies detected and appended at end

### Operand Types

| Type | Resolves To |
|------|-------------|
| `field_ref` | Extracted field value (local or cross-template) |
| `literal` | Constant value with datatype |
| `computed_ref` | Previously computed field value |
| `column_ref` | Array of values from a table column |
| `formula` | Spreadsheet formula evaluation result |
| `range_ref` | Spreadsheet cell range (comma-separated) |
| `global_value` | Value from global value store |

### Cross-Template Field References

A `field_ref` can reference fields from other templates/controles:

| Resolution Mode | Description |
|-----------------|-------------|
| `latest_run` | Use most recent test/controle run for that template |
| `specific_run` | Reference a specific saved run ID |
| `live` | Extract fresh from current template state |

In a controle series, references are resolved from `series_context` — the output of previous steps.

### Validation Rules

| Rule Type | Operands | Logic |
|-----------|----------|-------|
| `not_empty` | A | `A.strip() != ""` |
| `empty` | A | `A.strip() == ""` |
| `exact_match` | A, expected | `A == expected` |
| `data_type` | A, type | Parse A as type (string/number/integer/date/currency) |
| `range` | A, min, max | `min ≤ float(A) ≤ max` |
| `one_of` | A, allowed[] | `A.lower() in [x.lower() for x in allowed]` |
| `pattern` | A, regex | `re.match(regex, A)` |
| `date_before` | A, threshold | `parse_date(A) < threshold` |
| `date_after` | A, threshold | `parse_date(A) > threshold` |
| `compare_field` | A, B, operator | Compare A and B with operator |

#### Comparison Operators

| Operator | Description |
|----------|-------------|
| `equals` / `not_equals` | Equality check (numeric-aware) |
| `less_than` / `greater_than` | Numeric comparison |
| `less_or_equal` / `greater_or_equal` | Numeric comparison |
| `contains` / `not_contains` | Substring check |
| `starts_with` / `ends_with` | Prefix/suffix check |
| `in_array` / `not_in_array` | Membership in comma-separated list |
| `matches_regex` | Regex pattern match |
| `is_empty` / `is_not_empty` | Empty check |
| `date_before` / `date_after` / `date_between` | Date comparison |

### Computation Rules

#### Math Operations

| Operation | Inputs | Output |
|-----------|--------|--------|
| `add` | [a, b, …] | Sum of all operands |
| `subtract` | [a, b, …] | a − b − … |
| `multiply` | [a, b] | a × b |
| `divide` | [a, b] | a ÷ b (returns "error" if b = 0) |
| `modulo` | [a, b] | a mod b |
| `abs` | [a] | \|a\| |
| `round` | [a, decimals] | Round a to N decimals |
| `min` / `max` | [a, b, …] | Minimum/maximum |
| `sum` / `average` | [a, b, …] | Aggregate over operands |

#### Aggregate Operations (on table columns)

| Operation | Input | Output |
|-----------|-------|--------|
| `agg_sum` | column values | Sum |
| `agg_average` | column values | Mean |
| `agg_count` | column values | Row count |
| `agg_min` / `agg_max` | column values | Min/max value |

#### Row Filter

Evaluates a condition against each row in a table column:

| Mode | Output |
|------|--------|
| `count` | Number of rows matching condition |
| `all_pass` | `"true"` if all rows match, else `"false"` |
| `any_pass` | `"true"` if any row matches, else `"false"` |

#### Signal Lookup (`polaris_lookup`)

Takes a spreadsheet with key + signal columns, groups signals by key (employee ID), and applies translation rules. Returns JSON: `{key: [{code, translation}]}`.

#### Conditional Logic

Any computation can have a `condition`:

```
if (operand_a <operator> operand_b)
    then → then_value
    else → else_value
```

Supports all comparison operators listed above.

### Value Parsing

#### Currency Parsing

- Strips symbols: `$`, `€`, `£`, `¥`, `₹`
- Handles thousands separators: `1,234,567.89` → `1234567.89`
- Handles accounting negatives: `(1234)` → `-1234`
- Handles Dutch format: `1.234,56` → `1234.56`

#### Date Parsing (Multi-format)

Supported formats:
- `YYYY-MM-DD`
- `MM/DD/YYYY`, `DD/MM/YYYY`
- `MM-DD-YYYY`, `DD-MM-YYYY`
- `Month DD, YYYY`, `Month DD YYYY`
- `DD Month YYYY`

---

## 9. Formula Engine (Spreadsheet Formulas)

Evaluates Excel-style formulas against spreadsheet grid data.

### Supported Functions

| Function | Example | Description |
|----------|---------|-------------|
| `SUM(range)` | `SUM(A1:A10)` | Sum all numeric cells in range |
| `AVERAGE(range)` | `AVERAGE(B1:B5)` | Mean of numeric cells |
| `COUNT(range)` | `COUNT(A1:C10)` | Count non-empty cells |
| `MIN(range)` | `MIN(A1:A10)` | Minimum value |
| `MAX(range)` | `MAX(A1:A10)` | Maximum value |
| `IF(cond, t, f)` | `IF(A1>100,"High","Low")` | Conditional |
| Arithmetic | `=A1*B1+C1/2` | Expression evaluation |

### Cell References

- **Single cell**: `A1` (column letter + row number, 1-based)
- **Ranges**: `A1:C10` (inclusive)
- **Column mapping**: A=0, B=1, …, Z=25, AA=26, AB=27, …

### Condition Operators in IF()

`>`, `<`, `>=`, `<=`, `=`, `==`, `<>`, `!=`

---

## 10. Controle Series (Multi-Step Workflows)

### Definition

A controle series chains multiple controles into a sequential workflow for a specific klant.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Series ID |
| `name` | string | Series name |
| `klantId` | UUID | Customer |
| `steps` | ControleSeriesStep[] | Ordered steps |

### Step Definition

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Step ID |
| `order` | int | Execution order (1, 2, 3…) |
| `controleId` | UUID | Which control to run |
| `condition` | `"always"` \| `"if_passed"` \| `"if_failed"` | When to execute |

### Execution Flow

```
Step 1 (always)
  │ → Run Controle → status: success/review/error
  │
Step 2 (if_passed)
  │ → Skip if Step 1 ≠ success
  │ → Run Controle if Step 1 = success
  │ → Previous results available via series_context
  │
Step 3 (if_failed)
  │ → Run only if Step 2 ≠ success
  │
  ▼
Final Status: "completed" (all steps ran) or "stopped" (condition-based skip)
```

### Data Piping

Each step's `ControleRunResult` (including extracted values and computed values) is stored in `series_context[controle_id]`. Subsequent steps can reference earlier step outputs via cross-template `field_ref` operands. This enables chains like:

1. Step 1: Extract employee data from payroll PDF
2. Step 2: Compare extracted data against HR spreadsheet (referencing Step 1 values)
3. Step 3: Generate signal report (referencing Step 1 + Step 2 values)

### Step Result Statuses

| Status | Meaning |
|--------|---------|
| `passed` | Controle run status was `"success"` |
| `failed` | Controle run status was `"review"` or `"error"` |
| `skipped` | Condition not met; step was not executed |
| `error` | Execution error |

---

## 11. Translation Rules (Signal Lookup)

### Purpose

Maps HR system signal codes to human-readable Dutch translations. Used in the `polaris_lookup` computation and available in the Rule Library UI.

### Signal Categories

| Category | Code Range | Example |
|----------|-----------|---------|
| **Verwerkingssignalen** (Processing) | P0003–P0312 | P0003: "Functie ingangsdatum ligt voor datum indiensttreding" |
| **Loonaangifte** (Payroll Filing) | — | Missing BSN, anonymous tax rate (52%), negative social security wage |
| **Reserveringen** (Reserves) | — | Non-zero balance after exit, negative reserve balance |
| **Betalingen** (Payments) | — | Cash payment detected, duplicate payment |
| **In-dienst/Uit-dienst** (On/Offboarding) | — | Roster differs from contract, missing vacation reserve, trial period > 2 months |
| **TWK** (Retroactive Adjustments) | — | Retroactive salary change, retroactive part-time % change |
| **Delta** (Insurance Implementation) | — | Risk premium mismatch, franchise mismatch, CAO code mismatch, WKR not configured |
| **HR Essentials** | — | Pension contribution variance > €1, pension base exceeds fiscal max |

### Structure

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | Signal code (e.g., "P0003") |
| `rapport` | string | Report type category |
| `teamId` | string | Team identifier |
| `teamName` | string | Team name |
| `translation` | string | Human-readable description |

42 rules are auto-seeded on first access.

---

## 12. Global Values

Shared named constants reusable across controles.

### Structure

**GlobalValueGroup**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Group ID |
| `name` | string | Group name (e.g., "CAO Tabel 2025") |
| `version` | int | Auto-incrementing on update |
| `values` | GlobalValue[] | Key-value pairs |

**GlobalValue**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Value ID |
| `name` | string | Value name (e.g., "Minimumloon") |
| `dataType` | `"text"` \| `"number"` \| `"date"` \| `"boolean"` | Type |
| `value` | string | The value |

Referenced in rules via the `global_value` operand type with `global_group_id` and `global_value_id`.

---

## 13. Status Determination Logic

### ControleRunResult Status

```python
if passed_fields == total_fields and rules_passed == total_rules:
    status = "success"
elif passed_fields > 0:
    status = "review"      # Partial pass — needs human review
else:
    status = "error"        # Complete failure
```

### ControleSeriesStepResult Status

```python
if controle_run_status == "success":
    step_status = "passed"
else:
    step_status = "failed"  # "review" and "error" both count as failed
```

### ControleSeriesRun Status

```python
if all_steps_executed:
    final_status = "completed"
else:
    final_status = "stopped"  # At least one step was skipped due to condition
```

### Field Extraction Statuses

| Status | Meaning |
|--------|---------|
| `ok` | Anchor found at expected position, value extracted |
| `anchor_shifted` | Anchor found via vertical slide (slight positional drift) |
| `anchor_relocated` | Anchor found via full-page search (significant movement) |
| `anchor_not_found` | Anchor not found; value extracted at fallback position |
| `anchor_mismatch` | Anchor text doesn't match expected |
| `empty` | No value found at extraction region |
| `rule_failed` | Value extracted but failed validation |

---

## 14. Data Type Auto-Detection

The system auto-detects the data type of extracted values:

| Priority | Type | Detection Pattern |
|----------|------|-------------------|
| 1 | `currency` | Contains `$€£¥₹` or matches `\d{1,3}(,\d{3})*\.\d{2}$` |
| 2 | `date` | Matches common date patterns (YYYY-MM-DD, DD/MM/YYYY, etc.) |
| 3 | `integer` | Numeric string without decimal point |
| 4 | `number` | Numeric string with decimal point |
| 5 | `string` | Default fallback |

---

## 15. API Endpoints Reference

### PDFs (`/pdfs`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/pdfs/upload` | Upload PDF file |
| GET | `/pdfs` | List all PDFs |
| GET | `/pdfs/{id}` | Download PDF |
| DELETE | `/pdfs/{id}` | Delete PDF |
| POST | `/pdfs/{id}/extract-region` | Extract text from region |
| GET | `/pdfs/{id}/words?page=N` | Word-level bounding boxes |
| POST | `/pdfs/{id}/detect-format` | Auto-detect data type from region |

### Templates (`/templates`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/templates` | Create template |
| GET | `/templates` | List all templates |
| GET | `/templates/{id}` | Get template |
| PUT | `/templates/{id}` | Update template |
| DELETE | `/templates/{id}` | Delete template |
| GET | `/templates/all-fields` | List all fields across templates + controles |

### Extraction (`/extract`, `/test`, `/test-mixed`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/extract` | Run extraction with saved template |
| POST | `/test` | Test extraction with ad-hoc fields (no saved template) |
| POST | `/test-mixed` | Test extraction with mixed PDF + spreadsheet files |

### Controles (`/controles`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/controles` | Create controle (auto-cascades to descendants) |
| GET | `/controles` | List all controles |
| GET | `/controles/{id}` | Get controle |
| PUT | `/controles/{id}` | Update controle |
| DELETE | `/controles/{id}` | Delete controle |
| POST | `/controles/{id}/run` | Execute controle against files |
| GET | `/controles/runs/all` | List all run results |
| GET | `/controles/runs/{id}/details` | Get full extraction details for a run |

### Controle Series (`/controle-series`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/controle-series` | Create series |
| GET | `/controle-series` | List series (optional `?klantId=`) |
| GET | `/controle-series/{id}` | Get series |
| PUT | `/controle-series/{id}` | Update series |
| DELETE | `/controle-series/{id}` | Delete series |
| POST | `/controle-series/{id}/run` | Execute series |
| GET | `/controle-series/runs/all` | List all series runs |
| GET | `/controle-series/runs/{id}` | Get series run details |

### Klanten (`/klanten`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/klanten` | Create customer (auto-inherits parent controls) |
| GET | `/klanten` | List all customers |
| GET | `/klanten/{id}` | Get customer |
| PUT | `/klanten/{id}` | Update customer |
| DELETE | `/klanten/{id}` | Delete customer + cascading |
| GET | `/klanten/{id}/children` | Get direct children |
| POST | `/klanten/{id}/unlink-control/{controleId}` | Unlink inherited control |

### Spreadsheets (`/spreadsheets`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/spreadsheets/upload` | Upload XLSX |
| GET | `/spreadsheets/{id}` | Get full grid |
| GET | `/spreadsheets/{id}/cell?col=N&row=N` | Get single cell |
| GET | `/spreadsheets/{id}/range?startCol=…` | Get cell range |

### Global Values (`/global-values`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/global-values` | Create group |
| GET | `/global-values` | List all groups |
| GET | `/global-values/{id}` | Get group |
| PUT | `/global-values/{id}` | Update group (auto-increments version) |
| DELETE | `/global-values/{id}` | Delete group |

### Translation Rules (`/translation-rules`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/translation-rules` | List all rules (auto-seeds if empty) |

### Test Runs (`/test-runs`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/test-runs` | Save test run |
| GET | `/test-runs` | List all runs |
| GET | `/test-runs/{id}` | Get specific run |
| DELETE | `/test-runs/{id}` | Delete run |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{status: "ok"}` |

---

## 16. Frontend Pages & User Flows

### Navigation Structure

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Statistics, recent runs, quick actions |
| `/klanten` | Klanten | Client hierarchy tree + detail panel |
| `/klanten/:id` | Klant Detail | Controls, series, history for specific client |
| `/controles` | Controles | Three tabs: Definities, Resultaten, Globale Waarden |
| `/controle/nieuw` | Control Wizard | Multi-step creation (Files → Rules) |
| `/controle/:id` | Control Detail | View control definition |
| `/controle/:id/edit` | Control Edit | Edit existing control |
| `/controle/:id/run` | Run Control | Execute + view results |
| `/controle-series` | Series List | All control series |
| `/controle-series/nieuw` | Series Builder | Create new series |
| `/controle-series/:id` | Series Detail | View series + history |
| `/controle-series/:id/edit` | Series Edit | Edit series steps |
| `/controle-series/:id/run` | Run Series | Execute series + view results |
| `/controle-series/:id/run/:runId/step/:stepId` | Step Detail | Deep dive into series step results |
| `/regels` | Rule Library | Translation rules (signal lookups) |
| `/instellingen` | Settings | Theme, notifications, behavior |
| `/login` | Login | Authentication |

### Dashboard

- Statistics cards: controls executed, passed, findings count
- Recent runs table with status badges, field/rule counts, re-run button
- Quick navigation to create new control or view clients

### Klanten Page

- **Left panel**: Collapsible tree sidebar showing hierarchical client structure
- **Right panel**: Client detail with:
  - Client info (name, employee count)
  - Sub-klanten section (add/manage children)
  - Controles section (shows inherited vs own controls, unlink option)
  - Series section
  - Run history grouped by month

### Controles Page (Three Tabs)

1. **Definities**: Searchable list of all controls with status, field/rule counts
2. **Resultaten**: Run history with status badges, filterable
3. **Globale Waarden**: Create/edit/delete value groups with versioning

### Control Wizard

- Step 1 — **Bestanden (Files)**: Upload PDFs/spreadsheets, define extraction fields
- Step 2 — **Regels (Rules)**: Visual rule graph editor (React Flow nodes/edges)
- Save as Draft or Publish

### Run Control / Run Series

- **Phase 1 — Upload**: File upload manager with drag-drop, file pool, slot assignment
- **Phase 2 — Running**: Progress spinner
- **Phase 3 — Results**: Field results table, rule results, computed values, summary stats

### Rule Library

- Searchable/filterable table of translation rules
- Filter by team, rapport type
- Statistics: total rules, per-team breakdowns
- Inline editing of translation text

### Settings

- Theme: Light / Dark / System
- Notifications: Deviation alerts, task completion
- Behavior: Compact view, auto-run after upload

---

## 17. Authentication & Authorization

### Current State

- **Frontend**: Hard-coded credentials (`admin@bcs-hr.nl` / `admin123`) with localStorage persistence
- **Backend**: No authentication or authorization on any endpoint
- **Supabase**: JWT configuration present in frontend `.env` but not actively enforced at backend level

All routes are effectively public if the backend is network-accessible.

---

## 18. Storage Architecture

### Pluggable Backend

Configured via `STORAGE_BACKEND` environment variable:

| Backend | Description |
|---------|-------------|
| `local` (default) | JSON files in `./storage/` directory |
| `azure` | Azure Blob Storage with configurable containers |

### Storage Layout (Local)

```
storage/
├── uploads/          # Raw PDF files
├── spreadsheets/     # Raw XLSX files
├── spreadsheet-grids/ # Cached parsed grid JSON
├── templates/        # Template definitions (JSON)
├── controles/        # Control definitions (JSON)
├── controle_runs/    # Run result summaries (JSON)
├── controle_series/  # Series definitions (JSON)
├── controle_series_runs/ # Series run results (JSON)
├── klanten/          # Customer data (JSON)
├── test_runs/        # Test execution history (JSON)
├── global_values/    # Global value groups (JSON)
├── translation_rules/ # Translation rules (JSON)
└── metadata.json     # File catalog (PDF/spreadsheet metadata)
```

### Metadata Catalog

Single `metadata.json` file tracking all uploaded files:

```json
{
  "pdf:{id}": {"pdf_id": "...", "filename": "...", "page_count": 3},
  "ss:{id}": {"spreadsheet_id": "...", "filename": "..."}
}
```

---

## 19. Key Business Constraints

| Domain | Constraint | Enforcement |
|--------|-----------|-------------|
| **Klant Hierarchy** | No self-reference | `parentId != klantId` check |
| | No circular references | Descendant traversal before update |
| | Cascading delete | All descendants + their data removed |
| | Auto-inheritance | Parent controls auto-copied to children |
| **Controle** | Must be published to run | Status check before execution |
| | Auto-cascade to descendants | New controles propagate to child klanten |
| **Series** | Ordered execution | Steps sorted by `order` field |
| | Conditional branching | Steps can skip based on previous status |
| | Data piping | Previous step results available to next step |
| **Rules** | Dependency-ordered evaluation | Topological sort via Kahn's algorithm |
| | Enabled flag | Only enabled rules evaluated |
| | Computations before validations | Ensures computed values available for validation |
| **Fields** | Type-specific extraction | Different logic per field type |
| | Anchor fallback chain | Multi-step search ensures extraction even if anchor drifts |
| **Tables** | Key column merging | Rows with empty key merge upward |
| | Dynamic height | End-anchor resolves actual table bounds |
| **Currency** | Flexible parsing | Strips symbols, handles thousands separators, accounting negatives |
| **Dates** | Multi-format | 11+ date format patterns supported |
| **Storage** | Single metadata file | All PDF/spreadsheet metadata in one JSON file |
