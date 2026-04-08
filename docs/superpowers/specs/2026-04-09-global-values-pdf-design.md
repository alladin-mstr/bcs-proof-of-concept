# Global Values: PDF Upload & Field Extraction

**Date:** 2026-04-09
**Status:** Approved

## Overview

Extend the Global Values (Globale waarden) feature to support PDF-backed value groups. Users can upload a PDF, mark fields on it (using the same BboxCanvas as controls), and extract values automatically. When a new PDF is uploaded (e.g., next year's tax rates), the same field definitions re-extract values, with a diff preview before saving. An event-based audit trail tracks all changes.

## Design Decisions

- **Mode separation:** A group is either "manual" (today's behavior) or "pdf" (new). Chosen at creation time, cannot be changed afterward.
- **Template-like approach:** Field definitions are saved with the group's PDF template. Uploading a new PDF re-extracts using the same fields.
- **Full feature parity:** PDF field marking supports all field types (static, dynamic, table) with the full chain engine — identical to controls.
- **Extract and preview:** Extraction results are shown as a diff (current vs new values). User must confirm before values are saved.
- **Event-based audit trail:** Chronological log of events (created, pdf_uploaded, values_extracted, values_confirmed, pdf_template_updated) with inline diffs on confirmation events.
- **Separate PDF template entity:** A new `GlobalValuePdfTemplate` entity holds PDF config (pdf_id, fields, filename), linked from the group via `templateId`.

## Data Model

### GlobalValueGroup (extended)

```typescript
interface GlobalValueGroup {
  id: string
  name: string
  version: number
  values: GlobalValue[]
  createdAt: string
  updatedAt: string
  // New fields:
  mode: "manual" | "pdf"
  templateId: string | null
  auditLog: AuditEntry[]
}
```

### GlobalValuePdfTemplate (new)

```typescript
interface GlobalValuePdfTemplate {
  id: string
  groupId: string              // back-reference to owning group
  pdfId: string                // reference to uploaded PDF
  filename: string             // original filename for display
  fields: Field[]              // same Field type used in controls
  createdAt: string
  updatedAt: string
}
```

### AuditEntry (new)

```typescript
interface AuditEntry {
  timestamp: string
  action: "created" | "pdf_uploaded" | "values_confirmed" | "pdf_template_updated"
  details: {
    filename?: string
    previousValues?: GlobalValue[]
    newValues?: GlobalValue[]
    changedFields?: string[]
  }
}
```

### Backend Schemas (Pydantic)

```python
class GlobalValueGroup(BaseModel):
    id: str
    name: str
    version: int = 1
    values: list[GlobalValue] = []
    createdAt: str
    updatedAt: str
    mode: Literal["manual", "pdf"] = "manual"
    templateId: str | None = None
    auditLog: list[AuditEntry] = []

class GlobalValuePdfTemplate(BaseModel):
    id: str
    groupId: str
    pdfId: str
    filename: str
    fields: list[Field] = []
    createdAt: str
    updatedAt: str

class AuditEntry(BaseModel):
    timestamp: str
    action: Literal["created", "pdf_uploaded", "values_confirmed", "pdf_template_updated"]
    details: dict = {}
```

### Storage

- Templates stored as `global_value_templates/{id}.json` (local) / `global-value-templates-container` (Azure)
- Audit log embedded in the group JSON file (no separate storage)
- PDFs stored via existing PDF storage infrastructure

## API Endpoints

### Existing (unchanged behavior)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/global-values` | List all groups |
| GET | `/global-values/{id}` | Get single group |
| DELETE | `/global-values/{id}` | Delete group |

### Modified

| Method | Endpoint | Change |
|--------|----------|--------|
| POST | `/global-values` | Accepts `mode` field ("manual" or "pdf") in creation payload |
| PUT | `/global-values/{id}` | For manual groups: unchanged. For PDF groups: only used for name changes |

### New

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/global-values/{id}/pdf` | Upload PDF for a PDF-backed group. Stores PDF, creates/updates template, logs audit event. Returns `{ pdfId, pageCount, filename }` |
| GET | `/global-values/{id}/template` | Get the PDF template (fields, pdfId, filename) |
| PUT | `/global-values/{id}/template` | Save/update field definitions on the template |
| POST | `/global-values/{id}/extract` | Run extraction against current PDF + fields. Returns extracted values without saving |
| POST | `/global-values/{id}/confirm` | Confirm extracted values. Saves to group, bumps version, logs audit entry with diff |
| GET | `/global-values/{id}/audit` | Get audit log for the group |

## Frontend Architecture

### Reused Components (no changes)

- `PdfViewer` — renders PDF pages with zoom controls
- `BboxCanvas` — field marking canvas with draw/pointer tools, all field types
- `PdfUploader` — drag-and-drop PDF upload

### New Components

- **`GlobalValuePdfEditor`** — Main view for editing a PDF-backed group. Composes PdfViewer + BboxCanvas + field list sidebar. Opens as a full-page view at route `/global-values/{id}/edit`.
- **`GlobalValueDiffPreview`** — Diff table showing current vs extracted values, with confirm/cancel buttons. Color-coded: red for old values, green for new values, dash for empty.
- **`GlobalValueAuditLog`** — Event log panel showing chronological history. Color-coded icons per event type. Inline diffs on confirmation events. Accessible via "Geschiedenis" in the group's action menu.

### State Management

Uses existing `appStore` (Zustand) slices: `pdfId`, `fields`, `currentPage`, `extractionResults`. Loads/saves fields from template endpoint instead of controle endpoint.

### Modified Components

- **`MyControls.tsx`** — "Globale waarden" tab updated:
  - "+ Nieuwe groep" shows mode selection (Handmatig / PDF)
  - PDF-backed groups show PDF icon, filename, and "Velden bewerken" link
  - Manual groups behave exactly as today
  - Group action menu (•••) gets "Geschiedenis" option for PDF-backed groups

## User Workflows

### First-Time Setup (New PDF-Backed Group)

1. Click "+ Nieuwe groep" → select "PDF" mode
2. Enter group name
3. Upload PDF via drag-and-drop
4. Mark fields on PDF using BboxCanvas (static, dynamic, table)
5. Save field definitions (template is created)
6. Click "Extractie uitvoeren" (run extraction)
7. Review diff preview (all values show "—" → new value since first extraction)
8. Click "Bevestigen" to save values
9. Audit log: `created` → `pdf_uploaded` → `values_confirmed`

### Re-Upload (New Year's PDF)

1. Open existing PDF-backed group
2. Click "Nieuw PDF uploaden" button
3. Upload new PDF
4. System auto-extracts using saved field definitions
5. Diff preview shows current values vs newly extracted values
6. Review and click "Bevestigen"
7. Audit log: `pdf_uploaded` → `values_confirmed` (with diff details)

### Edit Field Definitions

1. Open PDF-backed group → click "Velden bewerken"
2. Opens `GlobalValuePdfEditor` with current PDF and field markings
3. Add/modify/delete field regions
4. Save template
5. Optionally re-run extraction to update values
6. Audit log: `pdf_template_updated`

## Audit Trail Design

### Event Types

| Event | Icon | Details |
|-------|------|---------|
| `created` | Purple + | Group name, mode |
| `pdf_uploaded` | Blue document | Filename, replaces previous filename if applicable |
| `values_confirmed` | Green checkmark | Inline diff table (field name, old value, new value) |
| `pdf_template_updated` | Blue document | Fields added/removed/modified |

### Display

- Chronological list, newest first
- Collapsible section within group detail view, or accessible via "Geschiedenis" in action menu
- Confirmation events show inline old/new value diff table
- PDF upload events show filename and whether it replaced a previous file

## Field-to-Value Mapping

When extraction runs on a PDF-backed group, each template field produces a GlobalValue entry:

- `GlobalValue.id` = `Field.id` (1:1 link between field definition and value)
- `GlobalValue.name` = `Field.label` (the user-assigned field name)
- `GlobalValue.dataType` = inferred from `Field.value_format` or extraction result (`detect_value_format`). Mapped as: "string" → "text", "number"/"integer"/"currency" → "number", "date" → "date". Defaults to "text".
- `GlobalValue.value` = extracted text string

When the user confirms extraction, the group's `values` array is rebuilt entirely from the template fields + extracted values. This means adding/removing fields on the template directly controls which values exist on the group.

## Backend Reuse

- `pdf_service.py` — all extraction functions (extract_text_from_region, search_anchor_slide, etc.) used as-is
- `extraction_service.py` — `extract_all_fields()` called from the `/extract` endpoint
- `chain_engine.py` — chain step execution for dynamic fields
- `storage_backend.py` — new methods following existing patterns for template CRUD

## Navigation

- `MyControls` page → "Globale waarden" tab → click PDF group → `GlobalValuePdfEditor` at `/global-values/{id}/edit`
- Back navigation returns to MyControls with the Globale waarden tab active
