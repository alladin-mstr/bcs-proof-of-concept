# Global Values PDF Upload & Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF upload, field marking, value extraction, and audit trail to global value groups.

**Architecture:** Extend the existing global values system with a "pdf" mode. A new `GlobalValuePdfTemplate` entity stores PDF + field definitions separately from the group. The frontend reuses PdfViewer + BboxCanvas for field marking and adds a diff preview + audit log. Backend reuses the existing extraction engine.

**Tech Stack:** FastAPI, Pydantic, React, TypeScript, Zustand, react-pdf, existing BboxCanvas/PdfViewer components.

---

### Task 1: Extend Backend Schemas

**Files:**
- Modify: `backend/models/schemas.py:531-554`

- [ ] **Step 1: Add AuditEntry schema**

Add after line 554 in `backend/models/schemas.py`:

```python
class AuditEntry(BaseModel):
    """A single event in a global value group's audit trail."""
    timestamp: str
    action: Literal["created", "pdf_uploaded", "values_confirmed", "pdf_template_updated"]
    details: dict = {}
```

- [ ] **Step 2: Extend GlobalValueGroup with mode, templateId, auditLog**

Replace the existing `GlobalValueGroupCreate` and `GlobalValueGroup` classes (lines 541-554):

```python
class GlobalValueGroupCreate(BaseModel):
    """Request body to create or update a global value group."""
    name: str
    values: list[GlobalValue] = []
    mode: Literal["manual", "pdf"] = "manual"


class GlobalValueGroup(BaseModel):
    """A persisted global value group with auto-incrementing version."""
    id: str
    name: str
    version: int = 1
    values: list[GlobalValue] = []
    createdAt: str
    updatedAt: str
    mode: Literal["manual", "pdf"] = "manual"
    templateId: str | None = None
    auditLog: list[AuditEntry] = []
```

- [ ] **Step 3: Add GlobalValuePdfTemplate schema**

Add after the `GlobalValueGroup` class:

```python
class GlobalValuePdfTemplate(BaseModel):
    """PDF template linked to a global value group."""
    id: str
    groupId: str
    pdfId: str
    filename: str
    fields: list[Field] = []
    createdAt: str
    updatedAt: str
```

- [ ] **Step 4: Verify the backend starts**

Run: `cd backend && python -c "from models.schemas import GlobalValueGroup, GlobalValuePdfTemplate, AuditEntry; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/models/schemas.py
git commit -m "feat(global-values): add AuditEntry, GlobalValuePdfTemplate schemas and extend GlobalValueGroup with mode/templateId/auditLog"
```

---

### Task 2: Add Template Storage Backend Methods

**Files:**
- Modify: `backend/services/storage_backend.py:174-186` (abstract), `backend/services/storage_backend.py:437-456` (local), `backend/services/storage_backend.py:762-786` (azure)

- [ ] **Step 1: Add abstract methods for template storage**

Add after line 186 (after `delete_global_value_group`) in `storage_backend.py`:

```python
    # -- Global Value Templates --

    @abstractmethod
    def save_global_value_template(self, template_id: str, content: str) -> None: ...

    @abstractmethod
    def get_global_value_template(self, template_id: str) -> str | None: ...

    @abstractmethod
    def delete_global_value_template(self, template_id: str) -> bool: ...
```

- [ ] **Step 2: Add LocalStorageBackend implementation**

Add `self._global_value_templates = base_dir / "global_value_templates"` after line 206 (`self._global_values = ...`).

Add `self._global_value_templates.mkdir(parents=True, exist_ok=True)` after line 217 (`self._global_values.mkdir(...)`).

Add after the `delete_global_value_group` method (after line 456):

```python
    # -- Global Value Templates --

    def save_global_value_template(self, template_id: str, content: str) -> None:
        (self._global_value_templates / f"{template_id}.json").write_text(content, encoding="utf-8")

    def get_global_value_template(self, template_id: str) -> str | None:
        path = self._global_value_templates / f"{template_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def delete_global_value_template(self, template_id: str) -> bool:
        path = self._global_value_templates / f"{template_id}.json"
        if not path.exists():
            return False
        path.unlink()
        return True
```

- [ ] **Step 3: Add AzureBlobStorageBackend implementation**

Add `global_value_templates_container: str = "global-value-templates"` parameter to the `__init__` signature (line 462).

Add `self._global_value_templates = self._client.get_container_client(global_value_templates_container)` after line 479.

Add `self._global_value_templates` to the container creation loop on line 481.

Add after the `delete_global_value_group` method (after line 786):

```python
    # -- Global Value Templates --

    def save_global_value_template(self, template_id: str, content: str) -> None:
        self._global_value_templates.upload_blob(f"{template_id}.json", content, overwrite=True)

    def get_global_value_template(self, template_id: str) -> str | None:
        blob_client = self._global_value_templates.get_blob_client(f"{template_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def delete_global_value_template(self, template_id: str) -> bool:
        blob_client = self._global_value_templates.get_blob_client(f"{template_id}.json")
        if not blob_client.exists():
            return False
        blob_client.delete_blob()
        return True
```

- [ ] **Step 4: Verify imports work**

Run: `cd backend && python -c "from services.storage_backend import get_storage; s = get_storage(); print(type(s))"`
Expected: `<class 'services.storage_backend.LocalStorageBackend'>`

- [ ] **Step 5: Commit**

```bash
git add backend/services/storage_backend.py
git commit -m "feat(global-values): add template storage methods to LocalStorageBackend and AzureBlobStorageBackend"
```

---

### Task 3: Add Template Service Layer

**Files:**
- Create: `backend/services/global_value_template_store.py`

- [ ] **Step 1: Create the template store service**

Create `backend/services/global_value_template_store.py`:

```python
import json
from datetime import datetime, timezone

from models.schemas import GlobalValuePdfTemplate, Field
from services.storage_backend import get_storage


def save_global_value_template(
    template_id: str, group_id: str, pdf_id: str, filename: str, fields: list[Field] | None = None
) -> GlobalValuePdfTemplate:
    now = datetime.now(timezone.utc).isoformat()
    template = GlobalValuePdfTemplate(
        id=template_id,
        groupId=group_id,
        pdfId=pdf_id,
        filename=filename,
        fields=fields or [],
        createdAt=now,
        updatedAt=now,
    )
    get_storage().save_global_value_template(template_id, template.model_dump_json(indent=2))
    return template


def get_global_value_template(template_id: str) -> GlobalValuePdfTemplate | None:
    content = get_storage().get_global_value_template(template_id)
    if content is None:
        return None
    return GlobalValuePdfTemplate(**json.loads(content))


def update_global_value_template(template_id: str, fields: list[Field] | None = None, pdf_id: str | None = None, filename: str | None = None) -> GlobalValuePdfTemplate | None:
    content = get_storage().get_global_value_template(template_id)
    if content is None:
        return None
    existing = json.loads(content)
    if fields is not None:
        existing["fields"] = [f.model_dump() for f in fields]
    if pdf_id is not None:
        existing["pdfId"] = pdf_id
    if filename is not None:
        existing["filename"] = filename
    existing["updatedAt"] = datetime.now(timezone.utc).isoformat()
    template = GlobalValuePdfTemplate(**existing)
    get_storage().save_global_value_template(template_id, template.model_dump_json(indent=2))
    return template


def delete_global_value_template(template_id: str) -> bool:
    return get_storage().delete_global_value_template(template_id)
```

- [ ] **Step 2: Verify import**

Run: `cd backend && python -c "from services.global_value_template_store import save_global_value_template; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/services/global_value_template_store.py
git commit -m "feat(global-values): add global_value_template_store service for PDF template CRUD"
```

---

### Task 4: Extend Global Value Store with Audit Log and Mode Support

**Files:**
- Modify: `backend/services/global_value_store.py`

- [ ] **Step 1: Update save_global_value_group to support mode and audit log**

Replace the entire `save_global_value_group` function (lines 8-19):

```python
def save_global_value_group(group_id: str, data: GlobalValueGroupCreate) -> GlobalValueGroup:
    now = datetime.now(timezone.utc).isoformat()
    audit_entry = {
        "timestamp": now,
        "action": "created",
        "details": {"mode": data.mode},
    }
    group = GlobalValueGroup(
        id=group_id,
        name=data.name,
        version=1,
        values=data.values,
        createdAt=now,
        updatedAt=now,
        mode=data.mode,
        auditLog=[audit_entry],
    )
    get_storage().save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group
```

- [ ] **Step 2: Update update_global_value_group to preserve mode, templateId, auditLog**

Replace the entire `update_global_value_group` function (lines 53-75):

```python
def update_global_value_group(group_id: str, data: GlobalValueGroupCreate) -> GlobalValueGroup | None:
    storage = get_storage()
    existing_content = storage.get_global_value_group(group_id)
    if existing_content is None:
        return None

    existing = json.loads(existing_content)
    old_version = existing.get("version", 1)

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
        mode=existing.get("mode", "manual"),
        templateId=existing.get("templateId"),
        auditLog=existing.get("auditLog", []),
    )
    storage.save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group
```

- [ ] **Step 3: Add helper to append audit entries and confirm values**

Add at the end of the file:

```python
def append_audit_entry(group_id: str, action: str, details: dict) -> GlobalValueGroup | None:
    """Append an audit entry to an existing group."""
    storage = get_storage()
    content = storage.get_global_value_group(group_id)
    if content is None:
        return None
    data = json.loads(content)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "details": details,
    }
    data.setdefault("auditLog", []).append(entry)
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    group = GlobalValueGroup(**data)
    storage.save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group


def confirm_extracted_values(group_id: str, new_values: list, filename: str) -> GlobalValueGroup | None:
    """Replace group values with extracted values, bump version, log audit entry."""
    storage = get_storage()
    content = storage.get_global_value_group(group_id)
    if content is None:
        return None
    data = json.loads(content)

    old_values = data.get("values", [])
    old_map = {v["id"]: v["value"] for v in old_values}
    new_map = {v["id"]: v["value"] for v in new_values}
    changed_fields = [
        v["name"] for v in new_values
        if old_map.get(v["id"]) != v["value"]
    ]

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": "values_confirmed",
        "details": {
            "filename": filename,
            "previousValues": old_values,
            "newValues": new_values,
            "changedFields": changed_fields,
        },
    }
    data["values"] = new_values
    data["version"] = data.get("version", 1) + 1
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    data.setdefault("auditLog", []).append(entry)

    group = GlobalValueGroup(**data)
    storage.save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group
```

- [ ] **Step 4: Update imports at top of file**

The imports at line 4 need the updated schema:

```python
from models.schemas import GlobalValueGroup, GlobalValueGroupCreate
```

No change needed — the existing import already covers the updated schemas.

- [ ] **Step 5: Verify the module loads**

Run: `cd backend && python -c "from services.global_value_store import confirm_extracted_values, append_audit_entry; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/services/global_value_store.py
git commit -m "feat(global-values): add audit log support, confirm_extracted_values, and mode preservation"
```

---

### Task 5: Add New Backend API Endpoints

**Files:**
- Modify: `backend/routers/global_values.py`

- [ ] **Step 1: Add imports**

Replace the imports at the top of `backend/routers/global_values.py` (lines 1-12):

```python
import uuid

from fastapi import APIRouter, HTTPException, UploadFile

from models.schemas import (
    Field,
    FieldResult,
    GlobalValue,
    GlobalValueGroup,
    GlobalValueGroupCreate,
    GlobalValuePdfTemplate,
)
from services.extraction_service import extract_all_fields
from services.global_value_store import (
    append_audit_entry,
    confirm_extracted_values,
    delete_global_value_group,
    get_global_value_group,
    list_global_value_groups,
    save_global_value_group,
    update_global_value_group,
)
from services.global_value_template_store import (
    delete_global_value_template,
    get_global_value_template,
    save_global_value_template,
    update_global_value_template,
)
from services.pdf_service import get_page_count
from services.storage_backend import get_storage
```

- [ ] **Step 2: Add PDF upload endpoint**

Add after the `remove_group` function (after line 49):

```python
@router.post("/{group_id}/pdf")
async def upload_group_pdf(group_id: str, file: UploadFile):
    """Upload a PDF for a PDF-backed group. Creates or updates the template."""
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if group.mode != "pdf":
        raise HTTPException(status_code=400, detail="Group is not in PDF mode.")
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    storage = get_storage()
    pdf_id = str(uuid.uuid4())
    content = await file.read()
    storage.upload_pdf(pdf_id, content)

    try:
        with storage.pdf_temp_path(pdf_id) as path:
            page_count = get_page_count(path)
    except Exception as exc:
        storage.delete_pdf(pdf_id)
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {exc}")

    # Save PDF metadata
    metadata = storage.load_metadata()
    metadata[pdf_id] = {"filename": file.filename, "page_count": page_count}
    storage.save_metadata(metadata)

    # Create or update template
    old_filename = None
    if group.templateId:
        existing_template = get_global_value_template(group.templateId)
        if existing_template:
            old_filename = existing_template.filename
            update_global_value_template(group.templateId, pdf_id=pdf_id, filename=file.filename)
    else:
        template_id = str(uuid.uuid4())
        save_global_value_template(template_id, group_id, pdf_id, file.filename)
        # Link template to group
        storage_content = storage.get_global_value_group(group_id)
        import json
        data = json.loads(storage_content)
        data["templateId"] = template_id
        from models.schemas import GlobalValueGroup as GVG
        updated = GVG(**data)
        storage.save_global_value_group(group_id, updated.model_dump_json(indent=2))

    # Audit log
    details = {"filename": file.filename}
    if old_filename:
        details["replacedFilename"] = old_filename
    append_audit_entry(group_id, "pdf_uploaded", details)

    return {"pdf_id": pdf_id, "page_count": page_count, "filename": file.filename}
```

- [ ] **Step 3: Add template GET and PUT endpoints**

```python
@router.get("/{group_id}/template", response_model=GlobalValuePdfTemplate)
async def get_group_template(group_id: str):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if not group.templateId:
        raise HTTPException(status_code=404, detail="Group has no PDF template.")
    template = get_global_value_template(group.templateId)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template


@router.put("/{group_id}/template", response_model=GlobalValuePdfTemplate)
async def update_group_template(group_id: str, data: dict):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if not group.templateId:
        raise HTTPException(status_code=404, detail="Group has no PDF template.")

    fields = [Field(**f) for f in data.get("fields", [])]
    template = update_global_value_template(group.templateId, fields=fields)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")

    append_audit_entry(group_id, "pdf_template_updated", {"fieldCount": len(fields)})
    return template
```

- [ ] **Step 4: Add extraction endpoint**

```python
@router.post("/{group_id}/extract")
async def extract_group_values(group_id: str):
    """Run extraction on the group's PDF using its template fields. Returns values without saving."""
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if not group.templateId:
        raise HTTPException(status_code=400, detail="Group has no PDF template.")

    template = get_global_value_template(group.templateId)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")
    if not template.fields:
        raise HTTPException(status_code=400, detail="Template has no fields defined.")

    storage = get_storage()
    with storage.pdf_temp_path(template.pdfId) as pdf_path:
        field_results, _, _ = extract_all_fields(pdf_path, template.fields)

    # Map field results to GlobalValue entries
    format_to_datatype = {
        "string": "text", "number": "number", "integer": "number",
        "currency": "number", "date": "date",
    }
    extracted_values = []
    for field, result in zip(template.fields, field_results):
        datatype = "text"
        if field.value_format:
            datatype = format_to_datatype.get(field.value_format, "text")
        extracted_values.append({
            "id": field.id,
            "name": field.label,
            "dataType": datatype,
            "value": result.value,
        })

    # Build current values map for diff
    current_map = {v.id: {"name": v.name, "value": v.value, "dataType": v.dataType} for v in group.values}

    return {
        "extractedValues": extracted_values,
        "currentValues": [v.model_dump() for v in group.values],
        "fieldResults": [r.model_dump() for r in field_results],
    }
```

- [ ] **Step 5: Add confirm endpoint**

```python
@router.post("/{group_id}/confirm", response_model=GlobalValueGroup)
async def confirm_group_values(group_id: str, data: dict):
    """Confirm extracted values — saves them to the group, bumps version, logs audit."""
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    if not group.templateId:
        raise HTTPException(status_code=400, detail="Group has no PDF template.")

    template = get_global_value_template(group.templateId)
    filename = template.filename if template else "unknown"

    values = data.get("values", [])
    updated = confirm_extracted_values(group_id, values, filename)
    if updated is None:
        raise HTTPException(status_code=404, detail="Group not found.")
    return updated
```

- [ ] **Step 6: Add audit log endpoint**

```python
@router.get("/{group_id}/audit")
async def get_group_audit(group_id: str):
    group = get_global_value_group(group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Global value group not found.")
    return group.auditLog
```

- [ ] **Step 7: Verify the server starts**

Run: `cd backend && python -c "from routers.global_values import router; print(len(router.routes), 'routes')"`
Expected: `11 routes` (5 existing + 6 new)

- [ ] **Step 8: Commit**

```bash
git add backend/routers/global_values.py
git commit -m "feat(global-values): add PDF upload, template CRUD, extraction, confirm, and audit endpoints"
```

---

### Task 6: Extend Frontend Types

**Files:**
- Modify: `frontend/src/types/index.ts:495-511`

- [ ] **Step 1: Update GlobalValueGroup and add new types**

Replace the global values section (lines 495-511) in `frontend/src/types/index.ts`:

```typescript
// --- Global Values ---

export interface GlobalValue {
  id: string;
  name: string;
  dataType: "text" | "number" | "date" | "boolean";
  value: string;
}

export interface AuditEntry {
  timestamp: string;
  action: "created" | "pdf_uploaded" | "values_confirmed" | "pdf_template_updated";
  details: {
    filename?: string;
    replacedFilename?: string;
    previousValues?: GlobalValue[];
    newValues?: GlobalValue[];
    changedFields?: string[];
    mode?: string;
    fieldCount?: number;
  };
}

export interface GlobalValueGroup {
  id: string;
  name: string;
  version: number;
  values: GlobalValue[];
  createdAt: string;
  updatedAt: string;
  mode: "manual" | "pdf";
  templateId: string | null;
  auditLog: AuditEntry[];
}

export interface GlobalValuePdfTemplate {
  id: string;
  groupId: string;
  pdfId: string;
  filename: string;
  fields: Field[];
  createdAt: string;
  updatedAt: string;
}

export interface ExtractionPreview {
  extractedValues: GlobalValue[];
  currentValues: GlobalValue[];
  fieldResults: FieldResult[];
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(global-values): add AuditEntry, GlobalValuePdfTemplate, ExtractionPreview types and extend GlobalValueGroup"
```

---

### Task 7: Add Frontend API Client Methods

**Files:**
- Modify: `frontend/src/api/client.ts:394-423`

- [ ] **Step 1: Add new API methods**

Add after the existing `deleteGlobalValueGroup` function (after line 423) in `frontend/src/api/client.ts`:

```typescript
export async function uploadGlobalValuePdf(
  groupId: string,
  file: File,
): Promise<{ pdf_id: string; page_count: number; filename: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post(`/global-values/${groupId}/pdf`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function getGlobalValueTemplate(
  groupId: string,
): Promise<GlobalValuePdfTemplate> {
  const response = await api.get(`/global-values/${groupId}/template`);
  return response.data;
}

export async function updateGlobalValueTemplate(
  groupId: string,
  data: { fields: Field[] },
): Promise<GlobalValuePdfTemplate> {
  const response = await api.put(`/global-values/${groupId}/template`, data);
  return response.data;
}

export async function extractGlobalValues(
  groupId: string,
): Promise<ExtractionPreview> {
  const response = await api.post(`/global-values/${groupId}/extract`);
  return response.data;
}

export async function confirmGlobalValues(
  groupId: string,
  values: GlobalValue[],
): Promise<GlobalValueGroup> {
  const response = await api.post(`/global-values/${groupId}/confirm`, { values });
  return response.data;
}

export async function getGlobalValueAudit(
  groupId: string,
): Promise<AuditEntry[]> {
  const response = await api.get(`/global-values/${groupId}/audit`);
  return response.data;
}
```

- [ ] **Step 2: Update createGlobalValueGroup to include mode**

Replace the existing `createGlobalValueGroup` function (lines 406-411):

```typescript
export async function createGlobalValueGroup(
  data: { name: string; values: GlobalValueGroup["values"]; mode?: "manual" | "pdf" },
): Promise<GlobalValueGroup> {
  const response = await api.post("/global-values", data);
  return response.data;
}
```

- [ ] **Step 3: Add imports for new types**

Ensure the import at the top of `client.ts` includes the new types. Find the existing import from `@/types` and add the new types:

```typescript
import type { GlobalValuePdfTemplate, ExtractionPreview, AuditEntry, GlobalValue, Field } from "@/types";
```

(Merge with existing imports from `@/types` — the exact line depends on how imports are currently structured.)

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to global value types.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat(global-values): add API client methods for PDF upload, template CRUD, extraction, and audit"
```

---

### Task 8: Update PdfUploader to Accept Callback Props

**Files:**
- Modify: `frontend/src/components/PdfUploader.tsx`

The current `PdfUploader` has no props — it directly calls the store's `setPdf`. We need it to optionally accept an `onUpload` callback for use in the global values editor.

- [ ] **Step 1: Add optional props**

At the top of `PdfUploader.tsx`, add a props interface and update the component signature:

```tsx
interface PdfUploaderProps {
  onUpload?: (file: File) => Promise<void> | void;
  uploading?: boolean;
}

export default function PdfUploader({ onUpload, uploading: externalUploading }: PdfUploaderProps = {}) {
```

- [ ] **Step 2: Update the upload handler**

In the file handling logic, when `onUpload` is provided, call it instead of the default behavior:

```tsx
const handleFile = async (file: File) => {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    setError("Alleen PDF-bestanden zijn toegestaan.");
    return;
  }
  if (onUpload) {
    await onUpload(file);
    return;
  }
  // ... existing default upload logic (uploadPdf + setPdf)
};
```

- [ ] **Step 3: Use external uploading state when provided**

Where `isUploading` is used for disabled states / spinner, also check `externalUploading`:

```tsx
const isLoading = isUploading || externalUploading;
```

Use `isLoading` in place of `isUploading` for the disabled/spinner checks.

- [ ] **Step 4: Verify existing usage is unaffected**

The component is used without props elsewhere. The default `= {}` on the destructuring ensures backward compatibility.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PdfUploader.tsx
git commit -m "feat(global-values): add optional onUpload callback to PdfUploader for reuse in global values editor"
```

---

### Task 9: Add setFields to appStore

**Files:**
- Modify: `frontend/src/store/appStore.ts`

The `GlobalValuePdfEditor` needs `setFields` to load template fields into the store. Check if it already exists.

- [ ] **Step 1: Check if setFields exists**

Search for `setFields` in `appStore.ts`. If it doesn't exist, add it to the interface and implementation.

In the interface section, add:

```typescript
setFields: (fields: Field[]) => void;
```

In the implementation section, add:

```typescript
setFields: (fields) => set({ fields }),
```

- [ ] **Step 2: Commit (only if changes were needed)**

```bash
git add frontend/src/store/appStore.ts
git commit -m "feat(global-values): add setFields action to appStore"
```

---

### Task 10: Create GlobalValueDiffPreview Component

**Files:**
- Create: `frontend/src/components/GlobalValueDiffPreview.tsx`

- [ ] **Step 1: Create the diff preview component**

Create `frontend/src/components/GlobalValueDiffPreview.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import type { ExtractionPreview } from "@/types";

interface Props {
  preview: ExtractionPreview;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}

export default function GlobalValueDiffPreview({ preview, onConfirm, onCancel, saving }: Props) {
  const currentMap = new Map(
    preview.currentValues.map((v) => [v.id, v])
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-6">
        <h2 className="text-lg font-semibold mb-1">Extractie resultaat</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Controleer de geëxtraheerde waarden voordat u ze opslaat.
        </p>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left py-2 px-4 font-medium">Veld</th>
                <th className="text-left py-2 px-4 font-medium">Type</th>
                <th className="text-left py-2 px-4 font-medium">Huidig</th>
                <th className="text-left py-2 px-4 font-medium">Nieuw</th>
                <th className="text-left py-2 px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.extractedValues.map((ev, i) => {
                const current = currentMap.get(ev.id);
                const currentVal = current?.value ?? "—";
                const changed = currentVal !== ev.value;
                const result = preview.fieldResults[i];

                return (
                  <tr key={ev.id} className="border-t">
                    <td className="py-2 px-4 font-medium">{ev.name}</td>
                    <td className="py-2 px-4 text-muted-foreground">{ev.dataType}</td>
                    <td className={`py-2 px-4 ${changed ? "text-red-500 line-through" : "text-muted-foreground"}`}>
                      {currentVal}
                    </td>
                    <td className={`py-2 px-4 ${changed ? "text-green-600 font-medium" : ""}`}>
                      {ev.value || "—"}
                    </td>
                    <td className="py-2 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          result?.status === "ok"
                            ? "bg-green-100 text-green-800"
                            : result?.status === "empty"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {result?.status ?? "unknown"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2 p-4 border-t">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Annuleren
        </Button>
        <Button onClick={onConfirm} disabled={saving}>
          {saving ? "Opslaan..." : "Bevestigen"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/GlobalValueDiffPreview.tsx
git commit -m "feat(global-values): create GlobalValueDiffPreview component for extraction result review"
```

---

### Task 11: Create GlobalValueAuditLog Component

**Files:**
- Create: `frontend/src/components/GlobalValueAuditLog.tsx`

- [ ] **Step 1: Create the audit log component**

Create `frontend/src/components/GlobalValueAuditLog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Check, FileText, Plus, Settings } from "lucide-react";
import { getGlobalValueAudit } from "@/api/client";
import type { AuditEntry } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  groupId: string | null;
  onClose: () => void;
}

const iconMap: Record<string, { icon: typeof Check; bg: string; color: string }> = {
  created: { icon: Plus, bg: "bg-purple-100", color: "text-purple-600" },
  pdf_uploaded: { icon: FileText, bg: "bg-blue-100", color: "text-blue-600" },
  values_confirmed: { icon: Check, bg: "bg-green-100", color: "text-green-600" },
  pdf_template_updated: { icon: Settings, bg: "bg-blue-100", color: "text-blue-600" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const actionLabels: Record<string, string> = {
  created: "Groep aangemaakt",
  pdf_uploaded: "PDF geüpload",
  values_confirmed: "Waarden bevestigd",
  pdf_template_updated: "Velden bijgewerkt",
};

export default function GlobalValueAuditLog({ groupId, onClose }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    getGlobalValueAudit(groupId)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [groupId]);

  return (
    <Dialog open={!!groupId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Geschiedenis</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Laden...</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Geen gebeurtenissen.</p>
        ) : (
          <div className="space-y-0">
            {[...entries].reverse().map((entry, i) => {
              const mapping = iconMap[entry.action] ?? iconMap.created;
              const Icon = mapping.icon;
              return (
                <div key={i} className="flex gap-3 py-3 border-b last:border-b-0">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${mapping.bg}`}>
                    <Icon className={`h-4 w-4 ${mapping.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-sm">
                        {actionLabels[entry.action] ?? entry.action}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                        {formatDate(entry.timestamp)}
                      </span>
                    </div>

                    {entry.details.filename && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {entry.details.filename}
                        {entry.details.replacedFilename && (
                          <> — vervangt {entry.details.replacedFilename}</>
                        )}
                      </p>
                    )}

                    {entry.details.mode && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {entry.details.mode === "pdf" ? "PDF-modus" : "Handmatige modus"}
                      </p>
                    )}

                    {entry.details.fieldCount !== undefined && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {entry.details.fieldCount} velden
                      </p>
                    )}

                    {entry.action === "values_confirmed" && entry.details.newValues && (
                      <div className="mt-2 text-xs bg-muted/50 rounded overflow-hidden">
                        <div className="flex font-medium px-3 py-1.5 border-b">
                          <span className="flex-1">Veld</span>
                          <span className="flex-1">Oud</span>
                          <span className="flex-1">Nieuw</span>
                        </div>
                        {entry.details.newValues.map((nv) => {
                          const ov = entry.details.previousValues?.find(
                            (p) => p.id === nv.id
                          );
                          const changed = ov?.value !== nv.value;
                          if (!changed) return null;
                          return (
                            <div key={nv.id} className="flex px-3 py-1 border-b last:border-b-0">
                              <span className="flex-1">{nv.name}</span>
                              <span className="flex-1 text-red-500">{ov?.value ?? "—"}</span>
                              <span className="flex-1 text-green-600">{nv.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/GlobalValueAuditLog.tsx
git commit -m "feat(global-values): create GlobalValueAuditLog dialog component with event log and inline diffs"
```

---

### Task 12: Update MyControls — Mode Selection on Group Creation

**Files:**
- Modify: `frontend/src/pages/MyControls.tsx`

- [ ] **Step 1: Add mode state to creation form**

Find the `editingGroup` state (around line 66) and add a mode selector. Add state:

```typescript
const [newGroupMode, setNewGroupMode] = useState<"manual" | "pdf">("manual");
```

- [ ] **Step 2: Update the "+ Nieuwe groep" button handler**

Find where `setEditingGroup({ id: null, name: "", values: [] })` is called (around line 385). Change it to also reset mode:

```typescript
onClick={() => {
  setEditingGroup({ id: null, name: "", values: [] });
  setNewGroupMode("manual");
}}
```

- [ ] **Step 3: Add mode toggle in the creation form**

Find the inline edit form card (around line 395). Add a mode selector right after the group name input (after the "Groepsnaam" section, around line 403), but only when creating (not editing):

```tsx
{editingGroup.id === null && (
  <div className="mb-4">
    <label className="block text-sm font-medium mb-2">Type</label>
    <div className="flex gap-2">
      <button
        type="button"
        className={`px-4 py-2 rounded border text-sm ${newGroupMode === "manual" ? "bg-primary text-white border-primary" : "border-gray-300"}`}
        onClick={() => setNewGroupMode("manual")}
      >
        Handmatig
      </button>
      <button
        type="button"
        className={`px-4 py-2 rounded border text-sm ${newGroupMode === "pdf" ? "bg-primary text-white border-primary" : "border-gray-300"}`}
        onClick={() => setNewGroupMode("pdf")}
      >
        PDF
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Update save handler for creation to include mode**

Find the save handler (around line 99-107). When creating (`editingGroup.id === null`), pass the mode:

```typescript
if (editingGroup.id === null) {
  const created = await createGlobalValueGroup({
    name: editingGroup.name,
    values: editingGroup.values,
    mode: newGroupMode,
  });
  // ... rest of handler
}
```

- [ ] **Step 5: When mode is "pdf" and creating, redirect to PDF editor after creation**

After the group is created with mode "pdf", navigate to the PDF editor:

```typescript
if (newGroupMode === "pdf") {
  navigate(`/global-values/${created.id}/edit`);
  return;
}
```

Add `useNavigate` import from `react-router-dom` if not already present.

- [ ] **Step 6: Update the groups table to show PDF indicator**

In the groups table (around line 535-592), add a PDF icon next to the name for PDF-backed groups:

```tsx
<td className="py-3 px-4">
  <div className="flex items-center gap-2">
    {g.mode === "pdf" && (
      <span title="PDF-modus" className="text-primary">
        <FileText className="h-4 w-4" />
      </span>
    )}
    {g.name}
  </div>
</td>
```

Import `FileText` from `lucide-react`.

- [ ] **Step 7: Add "Velden bewerken" and "Geschiedenis" to action menu for PDF groups**

In the group action dropdown (around line 560-580), add options for PDF groups:

```tsx
{g.mode === "pdf" && (
  <>
    <DropdownMenuItem onClick={() => navigate(`/global-values/${g.id}/edit`)}>
      Velden bewerken
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => setAuditGroupId(g.id)}>
      Geschiedenis
    </DropdownMenuItem>
  </>
)}
```

Add state for audit modal: `const [auditGroupId, setAuditGroupId] = useState<string | null>(null);`

- [ ] **Step 8: Disable inline value editing for PDF groups**

In the edit handler (around line 564), prevent inline editing for PDF groups:

```typescript
onClick={() => {
  if (g.mode === "pdf") {
    navigate(`/global-values/${g.id}/edit`);
    return;
  }
  setEditingGroup({ id: g.id, name: g.name, values: g.values });
}}
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/MyControls.tsx
git commit -m "feat(global-values): add mode selection on group creation, PDF indicators, and action menu items"
```

---

### Task 13: Create GlobalValuePdfEditor Page

**Files:**
- Create: `frontend/src/pages/GlobalValuePdfEditor.tsx`

- [ ] **Step 1: Create the editor page**

Create `frontend/src/pages/GlobalValuePdfEditor.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import PdfViewer from "@/components/PdfViewer";
import PdfUploader from "@/components/PdfUploader";
import { useAppStore } from "@/store/appStore";
import {
  getGlobalValueGroup,
  getGlobalValueTemplate,
  updateGlobalValueTemplate,
  uploadGlobalValuePdf,
  extractGlobalValues,
  confirmGlobalValues,
} from "@/api/client";
import type {
  GlobalValueGroup,
  GlobalValuePdfTemplate,
  ExtractionPreview,
} from "@/types";
import GlobalValueDiffPreview from "@/components/GlobalValueDiffPreview";

export default function GlobalValuePdfEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fields = useAppStore((s) => s.fields);
  const setFields = useAppStore((s) => s.setFields);
  const setPdf = useAppStore((s) => s.setPdf);
  const pdfId = useAppStore((s) => s.pdfId);

  const [group, setGroup] = useState<GlobalValueGroup | null>(null);
  const [template, setTemplate] = useState<GlobalValuePdfTemplate | null>(null);
  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showUploader, setShowUploader] = useState(false);

  // Load group and template on mount
  useEffect(() => {
    if (!id) return;
    (async () => {
      const g = await getGlobalValueGroup(id);
      setGroup(g);
      if (g.templateId) {
        try {
          const t = await getGlobalValueTemplate(id);
          setTemplate(t);
          setPdf(t.pdfId, 0, t.filename);
          setFields(t.fields);
        } catch {
          // No template yet — show uploader
          setShowUploader(true);
        }
      } else {
        setShowUploader(true);
      }
    })();
  }, [id]);

  const handlePdfUpload = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      const result = await uploadGlobalValuePdf(id, file);
      setPdf(result.pdf_id, result.page_count, result.filename);
      // Reload template
      const t = await getGlobalValueTemplate(id);
      setTemplate(t);
      setFields(t.fields);
      setShowUploader(false);
      // Auto-extract when fields already exist (re-upload scenario)
      if (t.fields.length > 0) {
        setExtracting(true);
        try {
          const extractResult = await extractGlobalValues(id);
          setPreview(extractResult);
        } finally {
          setExtracting(false);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSaveFields = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateGlobalValueTemplate(id, { fields });
      setTemplate(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleExtract = async () => {
    if (!id) return;
    setExtracting(true);
    try {
      const result = await extractGlobalValues(id);
      setPreview(result);
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirm = async () => {
    if (!id || !preview) return;
    setSaving(true);
    try {
      const updated = await confirmGlobalValues(id, preview.extractedValues);
      setGroup(updated);
      setPreview(null);
    } finally {
      setSaving(false);
    }
  };

  if (!group) {
    return <div className="p-8 text-center text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/controles")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{group.name}</h1>
            <p className="text-sm text-muted-foreground">
              {template ? template.filename : "Geen PDF geüpload"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {template && (
            <Button variant="outline" size="sm" onClick={() => setShowUploader(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Nieuw PDF uploaden
            </Button>
          )}
          {template && fields.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleSaveFields} disabled={saving}>
                {saving ? "Opslaan..." : "Velden opslaan"}
              </Button>
              <Button size="sm" onClick={handleExtract} disabled={extracting}>
                <Play className="h-4 w-4 mr-1" />
                {extracting ? "Extraheren..." : "Extractie uitvoeren"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {preview ? (
          <GlobalValueDiffPreview
            preview={preview}
            onConfirm={handleConfirm}
            onCancel={() => setPreview(null)}
            saving={saving}
          />
        ) : showUploader || !pdfId ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-96">
              <PdfUploader onUpload={handlePdfUpload} uploading={uploading} />
            </div>
          </div>
        ) : (
          <PdfViewer />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/GlobalValuePdfEditor.tsx
git commit -m "feat(global-values): create GlobalValuePdfEditor page with PDF upload, field marking, and auto-extraction on re-upload"
```

---

### Task 14: Wire Up Audit Log in MyControls

**Files:**
- Modify: `frontend/src/pages/MyControls.tsx`

- [ ] **Step 1: Import the audit log component**

Add import at the top of `MyControls.tsx`:

```typescript
import GlobalValueAuditLog from "@/components/GlobalValueAuditLog";
```

- [ ] **Step 2: Render the audit dialog**

Add before the closing fragment/div of the Globale waarden tab section (around line 614):

```tsx
<GlobalValueAuditLog
  groupId={auditGroupId}
  onClose={() => setAuditGroupId(null)}
/>
```

(The `auditGroupId` state was added in Task 12, Step 7.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MyControls.tsx
git commit -m "feat(global-values): wire up GlobalValueAuditLog dialog in MyControls page"
```

---

### Task 15: Add Route for GlobalValuePdfEditor

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Import the new page**

Add import at the top of `App.tsx` (after line 19):

```typescript
import GlobalValuePdfEditor from "./pages/GlobalValuePdfEditor";
```

- [ ] **Step 2: Add the route**

Add after the `/controles` route (after line 54):

```tsx
<Route path="/global-values/:id/edit" element={<ProtectedPage><GlobalValuePdfEditor /></ProtectedPage>} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(global-values): add route for GlobalValuePdfEditor at /global-values/:id/edit"
```

---

### Task 16: End-to-End Manual Test

**Files:** None (testing only)

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && python main.py &
cd frontend && npm run dev &
```

- [ ] **Step 2: Test manual group creation (unchanged behavior)**

1. Go to `/controles` → "Globale waarden" tab
2. Click "+ Nieuwe groep"
3. Verify mode toggle shows "Handmatig" / "PDF"
4. With "Handmatig" selected, create group — should work exactly as before
5. Verify inline editing works for manual groups

- [ ] **Step 3: Test PDF group creation flow**

1. Click "+ Nieuwe groep"
2. Select "PDF" mode, enter name, save
3. Should redirect to `/global-values/{id}/edit`
4. Upload a PDF via drag-and-drop
5. Mark fields on the PDF using BboxCanvas
6. Click "Velden opslaan"
7. Click "Extractie uitvoeren"
8. Verify diff preview shows extracted values
9. Click "Bevestigen"
10. Navigate back to `/controles` → "Globale waarden" tab
11. Verify group shows in list with PDF icon and version v1

- [ ] **Step 4: Test re-upload flow**

1. Open the PDF group action menu (•••)
2. Click "Velden bewerken" — should open editor
3. Click "Nieuw PDF uploaden"
4. Upload a different PDF
5. Extraction should auto-run (fields already exist), diff preview shows old vs new values
6. Confirm — version should bump to v2

- [ ] **Step 5: Test audit trail**

1. Open group action menu (•••)
2. Click "Geschiedenis"
3. Verify audit log shows: created → pdf_uploaded → values_confirmed events
4. Verify inline diffs on confirmation events show correct old/new values

- [ ] **Step 6: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix(global-values): fixes from end-to-end testing"
```
