# Bulk File Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a unified FileUploadManager component enabling multi-file upload per template slot, drag-and-drop assignment, and file reuse across series steps.

**Architecture:** A shared `FileUploadManager` React component with a file pool (upload zone) and assignment slots (drop targets). Backend endpoints accept arrays of file IDs per slot instead of single IDs. Results are rendered per-file within each template section.

**Tech Stack:** React + TypeScript, shadcn/ui, HTML5 drag-and-drop, FastAPI/Pydantic backend.

---

## File Structure

### New Files
- `frontend/src/components/FileUploadManager.tsx` — Main component: upload pool + assignment slots
- `frontend/src/components/DraggableFileChip.tsx` — Draggable file chip for pool/assigned items
- `frontend/src/components/FileDropSlot.tsx` — Drop target slot that accepts dragged files

### Modified Files
- `frontend/src/types/index.ts` — Add `UploadedFile` type, add `source_filename` to `ExtractionResponse`
- `frontend/src/api/client.ts` — Update `runControle` and `runControleSeries` to send `list[str]` per slot
- `backend/models/schemas.py` — Add `source_filename` to `ExtractionResponse`
- `backend/routers/controles.py` — Accept `dict[str, list[str] | str]`, loop extraction per file
- `backend/routers/controle_series.py` — Same array support for series run
- `frontend/src/pages/RunControle.tsx` — Replace inline upload with `FileUploadManager`, update results display
- `frontend/src/pages/RunSeries.tsx` — Replace per-step upload with `FileUploadManager` in series mode, update results

---

### Task 1: Add `UploadedFile` type and `source_filename` to frontend types

**Files:**
- Modify: `frontend/src/types/index.ts:291-299` (ExtractionResponse) and add new type

- [ ] **Step 1: Add `UploadedFile` interface to types**

In `frontend/src/types/index.ts`, add after the `ExtractionResponse` interface (after line 299):

```ts
export interface UploadedFile {
  id: string;           // pdf_id or spreadsheet_id
  filename: string;
  type: "pdf" | "spreadsheet";
}
```

- [ ] **Step 2: Add `source_filename` to `ExtractionResponse`**

In `frontend/src/types/index.ts`, modify the `ExtractionResponse` interface to add a new optional field:

```ts
export interface ExtractionResponse {
  pdf_id: string;
  template_id: string;
  results: FieldResult[];
  needs_review: boolean;
  pdf_id_b?: string;
  template_rule_results: TemplateRuleResult[];
  computed_values: Record<string, string>;
  source_filename?: string;  // NEW: identifies which uploaded file produced this response
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add UploadedFile type and source_filename to ExtractionResponse"
```

---

### Task 2: Add `source_filename` to backend `ExtractionResponse`

**Files:**
- Modify: `backend/models/schemas.py:327-334`

- [ ] **Step 1: Add `source_filename` field to `ExtractionResponse`**

In `backend/models/schemas.py`, add to the `ExtractionResponse` class:

```python
class ExtractionResponse(BaseModel):
    pdf_id: str
    template_id: str
    results: list[FieldResult]
    needs_review: bool
    pdf_id_b: str | None = None
    template_rule_results: list[TemplateRuleResult] = []
    computed_values: dict[str, str] = {}
    source_filename: str | None = None  # NEW: identifies which uploaded file produced this response
```

- [ ] **Step 2: Commit**

```bash
git add backend/models/schemas.py
git commit -m "feat: add source_filename to ExtractionResponse model"
```

---

### Task 3: Update backend controles run endpoint for multi-file per slot

**Files:**
- Modify: `backend/routers/controles.py:69-236`

- [ ] **Step 1: Update `RunControleRequest` to accept arrays**

Replace the `RunControleRequest` class and the beginning of `run_controle`:

```python
class RunControleRequest(BaseModel):
    files: dict[str, list[str] | str]  # file_id -> [pdf_id, ...] or pdf_id (backward compat)
```

- [ ] **Step 2: Add a normalization helper at the top of `run_controle`**

Right after the controle validation checks (after line 79), add normalization:

```python
    # Normalize: wrap single strings in lists for backward compatibility
    normalized_files: dict[str, list[str]] = {}
    for key, val in data.files.items():
        if isinstance(val, str):
            normalized_files[key] = [val]
        else:
            normalized_files[key] = val
```

- [ ] **Step 3: Update the file processing loop to iterate over multiple files per slot**

Replace the main file processing loop (the `for file_def in controle.files:` block). The key change: for each file_def, iterate over `normalized_files[file_def.id]` which is now a list. Each file gets its own `ExtractionResponse` with `source_filename` set.

For **spreadsheet** file definitions, the spreadsheet ID comes from the controle definition (not the upload), so keep the existing single-file behavior — but set `source_filename`.

For **PDF** file definitions, loop over all provided pdf_ids:

```python
    from services.translation_rules_store import get_translation_rules_dict
    translation_rules = get_translation_rules_dict()

    import json as _json

    # Load spreadsheet grid data for any spreadsheet files
    grid_data: dict[str, dict] = {}
    for file_def in controle.files:
        if file_def.fileType == "spreadsheet" and file_def.spreadsheetId:
            grid_json = storage.get_spreadsheet_grid(file_def.spreadsheetId)
            if grid_json:
                grid_data[file_def.spreadsheetId] = _json.loads(grid_json)

    # Collect all fields across files for combined rule evaluation
    all_fields = []
    for file_def in controle.files:
        all_fields.extend(file_def.fields)

    for file_def in controle.files:
        is_first_file_def = file_def.id == controle.files[0].id

        if file_def.fileType == "spreadsheet":
            # Spreadsheet files: single extraction from controle definition
            ss_id = file_def.spreadsheetId
            grid = grid_data.get(ss_id) if ss_id else None
            field_results = []
            extracted_values: dict[str, str] = {}

            for field in file_def.fields:
                value = ""
                if grid and field.type == "cell" and field.cell_ref:
                    row_val = grid["rows"][field.cell_ref.row][field.cell_ref.col] if field.cell_ref.row < grid["row_count"] and field.cell_ref.col < grid["col_count"] else None
                    value = str(row_val) if row_val is not None else ""
                elif grid and field.type == "cell_range" and field.range_ref:
                    values = []
                    for r in range(field.range_ref.startRow, field.range_ref.endRow + 1):
                        for c in range(field.range_ref.startCol, field.range_ref.endCol + 1):
                            if r < grid["row_count"] and c < grid["col_count"]:
                                val = grid["rows"][r][c]
                                if val is not None:
                                    values.append(str(val))
                    value = ", ".join(values)

                extracted_values[field.label] = value
                field_results.append(FieldResult(
                    label=field.label,
                    field_type=field.type,
                    value=value,
                    status="ok" if value else "empty",
                    rule_results=[],
                    step_traces=[],
                ))

            rule_results_list = []
            computed_values: dict[str, str] = {}
            if is_first_file_def and controle.rules:
                from services.rule_engine import RuleEngine
                engine = RuleEngine(
                    current_template_id=controle_id,
                    extracted_values=extracted_values,
                    grid_data=grid_data,
                    translation_rules=translation_rules,
                )
                computed_values, rule_results_list = engine.evaluate_all(
                    controle.rules, controle.computedFields
                )

            ss_filename = file_def.spreadsheetFilename or (ss_id or "")
            responses.append(ExtractionResponse(
                pdf_id=ss_id or "",
                template_id=controle_id,
                results=field_results,
                needs_review=any(r.status != "ok" for r in field_results),
                template_rule_results=rule_results_list,
                computed_values=computed_values,
                source_filename=ss_filename,
            ))
            continue

        # PDF handling: loop over all provided pdf_ids for this file_def
        pdf_ids = normalized_files.get(file_def.id, [])
        if not pdf_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Missing PDF for file '{file_def.label}' (id: {file_def.id}).",
            )

        for pdf_id in pdf_ids:
            if not storage.pdf_exists(pdf_id):
                raise HTTPException(status_code=404, detail=f"PDF {pdf_id} not found.")

            pdf_filename = data.filenames.get(pdf_id, pdf_id)

            with storage.pdf_temp_path(pdf_id) as pdf_path:
                field_results, rule_results, computed_values = extract_all_fields(
                    pdf_path=pdf_path,
                    fields=file_def.fields,
                    template_rules=controle.rules if is_first_file_def else [],
                    computed_fields=controle.computedFields if is_first_file_def else [],
                    template_id=controle_id,
                )

            responses.append(ExtractionResponse(
                pdf_id=pdf_id,
                template_id=controle_id,
                results=field_results,
                needs_review=any(r.status != "ok" for r in field_results),
                template_rule_results=rule_results,
                computed_values=computed_values,
                source_filename=pdf_filename,
            ))
```

- [ ] **Step 4: Add `filenames` to `RunControleRequest`**

The storage backend has no `get_metadata()` method, so filenames are passed from the frontend. Update the request model:

```python
class RunControleRequest(BaseModel):
    files: dict[str, list[str] | str]  # file_id -> [pdf_id, ...] or pdf_id
    filenames: dict[str, str] = {}  # pdf_id -> filename (optional, for display)
```

- [ ] **Step 5: Update the run result persistence at the bottom of `run_controle`**

The `fileResults` list now has multiple entries per file_def. Update to use `source_filename`:

```python
    # Persist run result
    total_fields = sum(len(r.results) for r in responses)
    passed_fields = sum(len([f for f in r.results if f.status == "ok"]) for r in responses)
    all_rule_results = [rr for r in responses for rr in r.template_rule_results]
    rules_passed = len([rr for rr in all_rule_results if rr.passed])

    status = "success" if passed_fields == total_fields and rules_passed == len(all_rule_results) else "review" if passed_fields > 0 else "error"

    entries: list[TestRunEntry] = []
    for r in responses:
        prefix = f"{r.source_filename} → " if r.source_filename and len(responses) > 1 else ""
        for fr in r.results:
            entries.append(TestRunEntry(
                label=f"{prefix}{fr.label}",
                value=fr.value or "",
                status=fr.status,
                table_data=fr.table_data,
            ))
    for key, val in (responses[0].computed_values.items() if responses else []):
        entries.append(TestRunEntry(label=key, value=str(val), status="computed"))

    run_result = ControleRunResult(
        id=str(uuid.uuid4()),
        controleId=controle_id,
        controleName=controle.name,
        klantId=controle.klantId,
        klantName=controle.klantName,
        status=status,
        totalFields=total_fields,
        passedFields=passed_fields,
        failedFields=total_fields - passed_fields,
        rulesPassed=rules_passed,
        rulesTotal=len(all_rule_results),
        fileResults=[
            {
                "fileLabel": r.source_filename or f"File {i+1}",
                "passed": len([f for f in r.results if f.status == "ok"]),
                "total": len(r.results),
            }
            for i, r in enumerate(responses)
        ],
        entries=entries,
        runAt=datetime.now(timezone.utc),
    )
    storage.save_controle_run(run_result.id, run_result.model_dump_json(indent=2))

    return responses
```

- [ ] **Step 6: Verify the backend starts without errors**

```bash
cd /Users/alladin/Repositories/bcs/backend && python -c "from routers.controles import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/routers/controles.py
git commit -m "feat: support multi-file per slot in controle run endpoint"
```

---

### Task 4: Update backend series run endpoint for multi-file per slot

**Files:**
- Modify: `backend/routers/controle_series.py:98-282`

- [ ] **Step 1: Update `RunSeriesRequest` to accept arrays**

```python
class RunSeriesRequest(BaseModel):
    files: dict[str, dict[str, list[str] | str]]  # step_id -> { file_id -> [pdf_id, ...] or pdf_id }
    filenames: dict[str, str] = {}  # pdf_id -> filename (optional)
```

- [ ] **Step 2: Add normalization in the `run_series` function**

After `step_files = data.files.get(step.id, {})`, normalize values:

```python
            step_files_raw = data.files.get(step.id, {})
            step_files: dict[str, list[str]] = {}
            for key, val in step_files_raw.items():
                if isinstance(val, str):
                    step_files[key] = [val]
                else:
                    step_files[key] = val
```

- [ ] **Step 3: Update the file processing loop inside `run_series`**

Replace the inner `for file_def in controle.files:` loop to iterate over arrays of pdf_ids per file_def, similar to the controle router changes in Task 3. Each file gets its own `ExtractionResponse` with `source_filename`.

```python
            for file_def in controle.files:
                is_first_file_def = file_def.id == controle.files[0].id
                pdf_ids = step_files.get(file_def.id, [])
                if not pdf_ids:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Missing PDF for file '{file_def.label}' (id: {file_def.id}) in step '{step.controleName}'.",
                    )

                for pdf_id in pdf_ids:
                    if not storage.pdf_exists(pdf_id):
                        raise HTTPException(status_code=404, detail=f"PDF {pdf_id} not found.")

                    pdf_filename = data.filenames.get(pdf_id, pdf_id)

                    with storage.pdf_temp_path(pdf_id) as pdf_path:
                        field_results, rule_results, computed_values = extract_all_fields(
                            pdf_path=pdf_path,
                            fields=file_def.fields,
                            template_rules=controle.rules if is_first_file_def else [],
                            computed_fields=controle.computedFields if is_first_file_def else [],
                            template_id=step.controleId,
                            series_context=series_context,
                        )

                    responses.append(ExtractionResponse(
                        pdf_id=pdf_id,
                        template_id=step.controleId,
                        results=field_results,
                        needs_review=any(r.status != "ok" for r in field_results),
                        template_rule_results=rule_results,
                        computed_values=computed_values,
                        source_filename=pdf_filename,
                    ))
```

- [ ] **Step 4: Update run result persistence to use `source_filename`**

Same pattern as Task 3, Step 5 — use `r.source_filename` for `fileResults` and entry prefixes.

- [ ] **Step 5: Verify the backend starts without errors**

```bash
cd /Users/alladin/Repositories/bcs/backend && python -c "from routers.controle_series import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/routers/controle_series.py
git commit -m "feat: support multi-file per slot in series run endpoint"
```

---

### Task 5: Update frontend API client to send arrays

**Files:**
- Modify: `frontend/src/api/client.ts:276-282` and `352-358`

- [ ] **Step 1: Update `runControle` function signature**

```ts
export async function runControle(
  controleId: string,
  files: Record<string, string[]>,
  filenames?: Record<string, string>,
): Promise<ExtractionResponse[]> {
  const response = await api.post(`/controles/${controleId}/run`, { files, filenames: filenames ?? {} });
  return response.data;
}
```

- [ ] **Step 2: Update `runControleSeries` function signature**

```ts
export async function runControleSeries(
  seriesId: string,
  files: Record<string, Record<string, string[]>>,
  filenames?: Record<string, string>,
): Promise<ControleSeriesRun> {
  const response = await api.post(`/controle-series/${seriesId}/run`, { files, filenames: filenames ?? {} });
  return response.data;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: update API client to send file arrays for bulk upload"
```

---

### Task 6: Build `DraggableFileChip` component

**Files:**
- Create: `frontend/src/components/DraggableFileChip.tsx`

- [ ] **Step 1: Create the DraggableFileChip component**

```tsx
import { FileText, FileSpreadsheet, X, GripVertical } from "lucide-react";
import type { UploadedFile } from "@/types";

interface DraggableFileChipProps {
  file: UploadedFile;
  onRemove?: () => void;
  showGrip?: boolean;
}

export default function DraggableFileChip({ file, onRemove, showGrip = true }: DraggableFileChipProps) {
  const Icon = file.type === "pdf" ? FileText : FileSpreadsheet;
  const colorClass = file.type === "pdf"
    ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800"
    : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/json", JSON.stringify(file));
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-grab active:cursor-grabbing select-none ${colorClass}`}
    >
      {showGrip && <GripVertical className="h-3 w-3 opacity-40" />}
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate max-w-[160px]">{file.filename}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DraggableFileChip.tsx
git commit -m "feat: add DraggableFileChip component"
```

---

### Task 7: Build `FileDropSlot` component

**Files:**
- Create: `frontend/src/components/FileDropSlot.tsx`

- [ ] **Step 1: Create the FileDropSlot component**

```tsx
import { useState } from "react";
import { FileText, FileSpreadsheet } from "lucide-react";
import DraggableFileChip from "./DraggableFileChip";
import type { UploadedFile } from "@/types";

interface FileDropSlotProps {
  label: string;
  fileType: "pdf" | "spreadsheet";
  assignedFiles: UploadedFile[];
  onFileDrop: (file: UploadedFile) => void;
  onFileRemove: (fileId: string) => void;
}

export default function FileDropSlot({ label, fileType, assignedFiles, onFileDrop, onFileRemove }: FileDropSlotProps) {
  const [dragOver, setDragOver] = useState(false);
  const [rejectFlash, setRejectFlash] = useState(false);

  const Icon = fileType === "pdf" ? FileText : FileSpreadsheet;
  const typeLabel = fileType === "pdf" ? "PDF" : "XLSX";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const file: UploadedFile = JSON.parse(e.dataTransfer.getData("application/json"));
      if (file.type !== fileType) {
        setRejectFlash(true);
        setTimeout(() => setRejectFlash(false), 600);
        return;
      }
      // Don't add duplicates
      if (assignedFiles.some((f) => f.id === file.id)) return;
      onFileDrop(file);
    } catch {
      // ignore invalid drop data
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-xl border-2 p-4 transition-all ${
        rejectFlash
          ? "border-red-400 bg-red-50/50 dark:bg-red-950/10"
          : dragOver
            ? "border-primary/50 bg-primary/5"
            : assignedFiles.length > 0
              ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10"
              : "border-dashed border-border"
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
          assignedFiles.length > 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
        }`}>
          <Icon className={`h-4 w-4 ${assignedFiles.length > 0 ? "text-green-600" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">
            {typeLabel} · {assignedFiles.length} bestand{assignedFiles.length !== 1 ? "en" : ""}
          </p>
        </div>
      </div>

      {assignedFiles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {assignedFiles.map((f) => (
            <DraggableFileChip
              key={f.id}
              file={f}
              showGrip={false}
              onRemove={() => onFileRemove(f.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground italic mt-1">
          Sleep bestanden hierheen
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FileDropSlot.tsx
git commit -m "feat: add FileDropSlot component"
```

---

### Task 8: Build `FileUploadManager` component

**Files:**
- Create: `frontend/src/components/FileUploadManager.tsx`

- [ ] **Step 1: Create the FileUploadManager component**

```tsx
import { useState, useCallback, useRef } from "react";
import { Upload, Loader2, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { uploadPdf, uploadSpreadsheet } from "@/api/client";
import DraggableFileChip from "./DraggableFileChip";
import FileDropSlot from "./FileDropSlot";
import type { UploadedFile } from "@/types";

export interface SlotDefinition {
  key: string;
  label: string;
  group?: string;
  fileType: "pdf" | "spreadsheet";
}

interface FileUploadManagerProps {
  slots: SlotDefinition[];
  onAssignmentsChange: (assignments: Record<string, UploadedFile[]>) => void;
  onPoolChange?: (pool: UploadedFile[]) => void;
}

export default function FileUploadManager({ slots, onAssignmentsChange, onPoolChange }: FileUploadManagerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pool, setPool] = useState<UploadedFile[]>([]);
  const [assignments, setAssignments] = useState<Record<string, UploadedFile[]>>({});
  const [uploading, setUploading] = useState(false);
  const [dragOverZone, setDragOverZone] = useState(false);

  const updateAssignments = useCallback((next: Record<string, UploadedFile[]>) => {
    setAssignments(next);
    onAssignmentsChange(next);
  }, [onAssignmentsChange]);

  const updatePool = useCallback((next: UploadedFile[]) => {
    setPool(next);
    onPoolChange?.(next);
  }, [onPoolChange]);

  const handleFiles = useCallback(async (files: FileList) => {
    setUploading(true);
    const newPoolFiles: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      try {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const { pdf_id } = await uploadPdf(file);
          newPoolFiles.push({ id: pdf_id, filename: file.name, type: "pdf" });
        } else if (
          file.name.toLowerCase().endsWith(".xlsx") ||
          file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ) {
          const { spreadsheet_id } = await uploadSpreadsheet(file);
          newPoolFiles.push({ id: spreadsheet_id, filename: file.name, type: "spreadsheet" });
        } else {
          toast({ title: `Ongeldig bestandstype: ${file.name}`, description: "Alleen PDF en XLSX bestanden zijn toegestaan.", variant: "destructive" });
        }
      } catch {
        toast({ title: `Upload mislukt: ${file.name}`, variant: "destructive" });
      }
    }

    if (newPoolFiles.length > 0) {
      const nextPool = [...pool, ...newPoolFiles];
      updatePool(nextPool);
    }
    setUploading(false);
  }, [pool, toast, updatePool]);

  const handleDropZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverZone(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const removeFromPool = useCallback((fileId: string) => {
    const nextPool = pool.filter((f) => f.id !== fileId);
    updatePool(nextPool);
    // Also remove from all assignments
    const nextAssignments = { ...assignments };
    for (const key in nextAssignments) {
      nextAssignments[key] = nextAssignments[key].filter((f) => f.id !== fileId);
    }
    updateAssignments(nextAssignments);
  }, [pool, assignments, updatePool, updateAssignments]);

  const handleSlotDrop = useCallback((slotKey: string, file: UploadedFile) => {
    const current = assignments[slotKey] ?? [];
    if (current.some((f) => f.id === file.id)) return;
    const next = { ...assignments, [slotKey]: [...current, file] };
    updateAssignments(next);
  }, [assignments, updateAssignments]);

  const handleSlotRemove = useCallback((slotKey: string, fileId: string) => {
    const current = assignments[slotKey] ?? [];
    const next = { ...assignments, [slotKey]: current.filter((f) => f.id !== fileId) };
    updateAssignments(next);
  }, [assignments, updateAssignments]);

  // Group slots by group (for series)
  const groups = new Map<string | undefined, SlotDefinition[]>();
  for (const slot of slots) {
    const key = slot.group;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(slot);
  }

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Bestanden uploaden</h2>
          <p className="text-sm text-muted-foreground">
            Upload PDF en XLSX bestanden. {pool.length} bestand{pool.length !== 1 ? "en" : ""} in pool.
          </p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverZone(true); }}
          onDragLeave={() => setDragOverZone(false)}
          onDrop={handleDropZone}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragOverZone ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Bestanden uploaden...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Sleep bestanden hierheen of{" "}
                <button
                  className="text-primary underline underline-offset-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  blader
                </button>
              </p>
              <p className="text-xs text-muted-foreground">PDF, XLSX</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Pool chips */}
        {pool.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pool.map((f) => (
              <DraggableFileChip
                key={f.id}
                file={f}
                onRemove={() => removeFromPool(f.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Assignment slots */}
      {pool.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Bestanden toewijzen</h2>
            <p className="text-sm text-muted-foreground">
              Sleep bestanden uit de pool naar de juiste slots.
            </p>
          </div>

          {Array.from(groups.entries()).map(([group, groupSlots]) => (
            <div key={group ?? "__default"} className="space-y-2">
              {group && (
                <h3 className="text-sm font-semibold text-muted-foreground mt-4">{group}</h3>
              )}
              {groupSlots.map((slot) => (
                <FileDropSlot
                  key={slot.key}
                  label={slot.label}
                  fileType={slot.fileType}
                  assignedFiles={assignments[slot.key] ?? []}
                  onFileDrop={(file) => handleSlotDrop(slot.key, file)}
                  onFileRemove={(fileId) => handleSlotRemove(slot.key, fileId)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the component compiles**

```bash
cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors related to new components.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FileUploadManager.tsx
git commit -m "feat: add FileUploadManager component with pool and drag-and-drop assignment"
```

---

### Task 9: Rewrite `RunControle.tsx` to use `FileUploadManager`

**Files:**
- Modify: `frontend/src/pages/RunControle.tsx`

- [ ] **Step 1: Replace the upload phase**

Replace the imports and state management. Remove `fileUploads`, `uploading`, `handleUploadFile` state. Add `FileUploadManager` imports and new state:

```tsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getControle, runControle } from "@/api/client";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Loader2, CheckCircle, XCircle, AlertTriangle,
  Play, RotateCcw, ChevronDown,
} from "lucide-react";
import FileUploadManager from "@/components/FileUploadManager";
import type { SlotDefinition } from "@/components/FileUploadManager";
import type { Controle, ExtractionResponse, TemplateRuleResult, UploadedFile } from "@/types";

type RunPhase = "upload" | "running" | "results";

export default function RunControle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [controle, setControle] = useState<Controle | null>(null);
  const [phase, setPhase] = useState<RunPhase>("upload");
  const [assignments, setAssignments] = useState<Record<string, UploadedFile[]>>({});
  const [pool, setPool] = useState<UploadedFile[]>([]);
  const [results, setResults] = useState<ExtractionResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getControle(id)
      .then(setControle)
      .catch(() => {
        toast({ title: "Controle niet gevonden", variant: "destructive" });
        navigate("/controles");
      });
  }, [id, toast, navigate]);

  const allSlotsAssigned = controle?.files.every((f) => {
    const assigned = assignments[f.id];
    return assigned && assigned.length > 0;
  }) ?? false;

  const handleRun = useCallback(async () => {
    if (!controle || !allSlotsAssigned) return;
    setPhase("running");
    setError(null);
    try {
      const files: Record<string, string[]> = {};
      const filenames: Record<string, string> = {};
      for (const fileDef of controle.files) {
        const assigned = assignments[fileDef.id] ?? [];
        files[fileDef.id] = assigned.map((f) => f.id);
        for (const f of assigned) {
          filenames[f.id] = f.filename;
        }
      }
      const res = await runControle(controle.id, files, filenames);
      setResults(res);
      setPhase("results");
    } catch {
      setError("Uitvoeren mislukt.");
      setPhase("upload");
    }
  }, [controle, assignments, allSlotsAssigned]);

  if (!controle) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Laden...
      </div>
    );
  }

  // Build slot definitions from controle files
  const slots: SlotDefinition[] = controle.files.map((f) => ({
    key: f.id,
    label: f.label,
    fileType: f.fileType,
  }));

  // Results calculations
  const totalFields = results ? results.reduce((s, r) => s + r.results.length, 0) : 0;
  const totalPassed = results ? results.reduce((s, r) => s + r.results.filter((f) => f.status === "ok").length, 0) : 0;
  const totalFailed = totalFields - totalPassed;
  const allRuleResults: TemplateRuleResult[] = results?.flatMap((r) => r.template_rule_results) ?? [];
  const rulesPassed = allRuleResults.filter((r) => r.passed).length;
  const allComputedValues = results?.reduce((acc, r) => ({ ...acc, ...r.computed_values }), {} as Record<string, string>) ?? {};

  // Group results by file definition for display
  const resultsByFileDef: Map<string, ExtractionResponse[]> = new Map();
  if (results) {
    // Map each result back to its file_def by matching the controle's file order
    // Since we now have multiple results per file_def, group by source_filename prefix
    for (const fileDef of controle.files) {
      const assigned = assignments[fileDef.id] ?? [];
      const fileDefResults = results.filter((r) =>
        assigned.some((a) => a.id === r.pdf_id)
      );
      resultsByFileDef.set(fileDef.id, fileDefResults);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <HeaderAction>
        {phase === "results" && (
          <Button variant="outline" className="rounded-full" size="sm" onClick={() => { setPhase("upload"); setResults(null); setAssignments({}); setPool([]); }}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Opnieuw uitvoeren
          </Button>
        )}
      </HeaderAction>

      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{controle.name}</h1>
        <p className="text-muted-foreground text-sm">
          {controle.files.length} bestand{controle.files.length !== 1 ? "en" : ""} · {controle.rules.length} regel{controle.rules.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Upload phase */}
      {phase === "upload" && (
        <div className="space-y-6">
          <FileUploadManager
            slots={slots}
            onAssignmentsChange={setAssignments}
            onPoolChange={setPool}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            size="lg"
            className="w-full"
            disabled={!allSlotsAssigned}
            onClick={handleRun}
          >
            <Play className="h-4 w-4 mr-2" />
            Controle uitvoeren
          </Button>
        </div>
      )}

      {/* Running phase */}
      {phase === "running" && (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <h2 className="text-lg font-semibold">Controle wordt uitgevoerd...</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Bestanden worden geanalyseerd en regels worden geëvalueerd.
          </p>
        </div>
      )}

      {/* Results phase */}
      {phase === "results" && results && (
        <div className="space-y-8">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold text-green-600">{totalPassed}</p>
                <p className="text-sm text-muted-foreground mt-1">Velden OK</p>
              </CardContent>
            </Card>
            <Card className={totalFailed > 0 ? "border-red-200 dark:border-red-800" : "border-green-200 dark:border-green-800"}>
              <CardContent className="p-6 text-center">
                <p className={`text-3xl font-bold ${totalFailed > 0 ? "text-red-600" : "text-green-600"}`}>
                  {totalFailed}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Afwijkingen</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className={`text-3xl font-bold ${
                  allRuleResults.length === 0 ? "text-muted-foreground"
                  : rulesPassed === allRuleResults.length ? "text-green-600"
                  : "text-amber-600"
                }`}>
                  {allRuleResults.length > 0 ? `${rulesPassed}/${allRuleResults.length}` : "—"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Regels geslaagd</p>
              </CardContent>
            </Card>
          </div>

          {/* Rule results */}
          {allRuleResults.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Regelresultaten</h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Regel</TableHead>
                        <TableHead className="text-right">Resultaat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRuleResults.map((rr, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            {rr.passed ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{rr.rule_name}</TableCell>
                          <TableCell className="text-right">
                            {rr.computed_value ? (
                              <span className="font-mono">= {rr.computed_value}</span>
                            ) : rr.passed ? (
                              <span className="text-green-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-500 text-sm">{rr.message}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Computed values */}
          {Object.keys(allComputedValues).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Berekende waarden</h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Naam</TableHead>
                        <TableHead className="text-right">Waarde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(allComputedValues).map(([label, value]) => (
                        <TableRow key={label}>
                          <TableCell className="font-medium">{label}</TableCell>
                          <TableCell className="text-right font-mono">{value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Per-file-def results with per-file collapsibles */}
          {controle.files.map((fileDef) => {
            const fileDefResults = resultsByFileDef.get(fileDef.id) ?? [];
            if (fileDefResults.length === 0) return null;
            return (
              <div key={fileDef.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {fileDef.label}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {fileDefResults.length} bestand{fileDefResults.length !== 1 ? "en" : ""}
                  </span>
                </div>

                {fileDefResults.map((fr, fi) => {
                  const passed = fr.results.filter((r) => r.status === "ok").length;
                  return (
                    <Collapsible key={fi} defaultOpen={fileDefResults.length <= 3}>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                        <span className="text-sm font-medium flex-1">
                          {fr.source_filename || `Bestand ${fi + 1}`}
                        </span>
                        <span className={`text-xs font-medium ${passed === fr.results.length ? "text-green-600" : "text-amber-600"}`}>
                          {passed}/{fr.results.length} OK
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Card className="mt-1">
                          <CardContent className="p-0">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-10"></TableHead>
                                  <TableHead>Veld</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Waarde</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {fr.results.map((r, ri) => (
                                  <TableRow key={ri}>
                                    <TableCell>
                                      {r.status === "ok" ? (
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                      ) : r.status === "empty" ? (
                                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium">{r.label}</TableCell>
                                    <TableCell>
                                      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                        r.field_type === "static" ? "bg-blue-100 text-blue-700" :
                                        r.field_type === "dynamic" ? "bg-amber-100 text-amber-700" :
                                        "bg-violet-100 text-violet-700"
                                      }`}>
                                        {r.field_type === "static" ? "S" : r.field_type === "dynamic" ? "D" : "T"}
                                      </span>
                                    </TableCell>
                                    <TableCell>
                                      <span className={`text-xs font-medium ${
                                        r.status === "ok" ? "text-green-600" :
                                        r.status === "empty" ? "text-amber-600" :
                                        "text-red-600"
                                      }`}>
                                        {r.status === "ok" ? "OK" : r.status}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-sm">
                                      {r.value || "—"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            );
          })}

          <div className="pb-8" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Check if Collapsible exists in the UI library**

```bash
ls /Users/alladin/Repositories/bcs/frontend/src/components/ui/collapsible*
```

If it doesn't exist, install it:

```bash
cd /Users/alladin/Repositories/bcs/frontend && npx shadcn@latest add collapsible
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RunControle.tsx frontend/src/components/ui/collapsible.tsx
git commit -m "feat: rewrite RunControle to use FileUploadManager with multi-file results"
```

---

### Task 10: Rewrite `RunSeries.tsx` to use `FileUploadManager`

**Files:**
- Modify: `frontend/src/pages/RunSeries.tsx`

- [ ] **Step 1: Replace the entire component**

```tsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Play, Loader2, CheckCircle, XCircle, SkipForward,
  AlertTriangle, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeaderAction } from "@/context/HeaderActionContext";
import { useToast } from "@/hooks/use-toast";
import {
  getControleSeries,
  getControle,
  runControleSeries,
} from "@/api/client";
import FileUploadManager from "@/components/FileUploadManager";
import type { SlotDefinition } from "@/components/FileUploadManager";
import type {
  ControleSeries,
  Controle,
  ControleSeriesRun,
  SeriesStepResultStatus,
  UploadedFile,
} from "@/types";

type Phase = "upload" | "running" | "results";

interface StepInfo {
  stepId: string;
  order: number;
  controleId: string;
  controleName: string;
  condition: string;
  controle: Controle | null;
}

export default function RunSeries() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [series, setSeries] = useState<ControleSeries | null>(null);
  const [stepInfos, setStepInfos] = useState<StepInfo[]>([]);
  const [phase, setPhase] = useState<Phase>("upload");
  const [assignments, setAssignments] = useState<Record<string, UploadedFile[]>>({});
  const [pool, setPool] = useState<UploadedFile[]>([]);
  const [result, setResult] = useState<ControleSeriesRun | null>(null);

  useEffect(() => {
    if (!id) return;
    getControleSeries(id).then(async (s) => {
      setSeries(s);
      const sorted = [...s.steps].sort((a, b) => a.order - b.order);
      const infos: StepInfo[] = [];
      for (const step of sorted) {
        let controle: Controle | null = null;
        try {
          controle = await getControle(step.controleId);
        } catch { /* skip */ }
        infos.push({
          stepId: step.id,
          order: step.order,
          controleId: step.controleId,
          controleName: step.controleName,
          condition: step.condition,
          controle,
        });
      }
      setStepInfos(infos);
    }).catch(() => {
      toast({ title: "Serie niet gevonden", variant: "destructive" });
      navigate("/controles");
    });
  }, [id, toast, navigate]);

  // Build slot definitions: one per file_def per step, grouped by step
  const slots: SlotDefinition[] = [];
  const conditionLabels: Record<string, string> = {
    always: "Altijd",
    if_passed: "Als vorige geslaagd",
    if_failed: "Als vorige gefaald",
  };

  for (const info of stepInfos) {
    if (!info.controle) continue;
    const condLabel = info.order > 1 ? ` [${conditionLabels[info.condition] ?? info.condition}]` : "";
    const group = `Stap ${info.order}: ${info.controleName}${condLabel}`;
    for (const fileDef of info.controle.files) {
      slots.push({
        key: `${info.stepId}_${fileDef.id}`,
        label: fileDef.label,
        group,
        fileType: fileDef.fileType,
      });
    }
  }

  const allSlotsAssigned = slots.every((slot) => {
    const assigned = assignments[slot.key];
    return assigned && assigned.length > 0;
  });

  const handleRun = useCallback(async () => {
    if (!series || !allSlotsAssigned) return;
    setPhase("running");
    try {
      const files: Record<string, Record<string, string[]>> = {};
      const filenames: Record<string, string> = {};
      for (const info of stepInfos) {
        if (!info.controle) continue;
        const stepFiles: Record<string, string[]> = {};
        for (const fileDef of info.controle.files) {
          const assigned = assignments[`${info.stepId}_${fileDef.id}`] ?? [];
          stepFiles[fileDef.id] = assigned.map((f) => f.id);
          for (const f of assigned) {
            filenames[f.id] = f.filename;
          }
        }
        files[info.stepId] = stepFiles;
      }
      const res = await runControleSeries(series.id, files, filenames);
      setResult(res);
      setPhase("results");
    } catch {
      toast({ title: "Uitvoeren mislukt", variant: "destructive" });
      setPhase("upload");
    }
  }, [series, stepInfos, assignments, allSlotsAssigned, toast]);

  const stepStatusIcon = (status: SeriesStepResultStatus) => {
    switch (status) {
      case "passed": return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed": return <XCircle className="h-5 w-5 text-red-500" />;
      case "skipped": return <SkipForward className="h-5 w-5 text-muted-foreground" />;
      case "error": return <AlertTriangle className="h-5 w-5 text-red-500" />;
    }
  };

  if (!series) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <HeaderAction>
        {phase === "results" && (
          <Button
            variant="outline"
            className="rounded-full"
            size="sm"
            onClick={() => {
              setPhase("upload");
              setResult(null);
              setAssignments({});
              setPool([]);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Opnieuw uitvoeren
          </Button>
        )}
      </HeaderAction>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{series.name}</h1>
        <p className="text-sm text-muted-foreground">
          {series.klantName} · {series.steps.length} stap{series.steps.length !== 1 ? "pen" : ""}
        </p>
      </div>

      {/* Upload phase */}
      {phase === "upload" && (
        <div className="space-y-6">
          <FileUploadManager
            slots={slots}
            onAssignmentsChange={setAssignments}
            onPoolChange={setPool}
          />

          <Button size="lg" className="w-full" disabled={!allSlotsAssigned} onClick={handleRun}>
            <Play className="h-4 w-4 mr-2" />
            Serie uitvoeren
          </Button>
        </div>
      )}

      {/* Running phase */}
      {phase === "running" && (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <h2 className="text-lg font-semibold">Serie wordt uitgevoerd...</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Stappen worden sequentieel verwerkt.
          </p>
        </div>
      )}

      {/* Results phase */}
      {phase === "results" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={
                result.status === "completed"
                  ? "text-success border-success/30 bg-success/10"
                  : "text-warning border-warning/30 bg-warning/10"
              }
            >
              {result.status === "completed" ? "Voltooid" : "Gestopt"}
            </Badge>
          </div>

          {result.stepResults.map((sr, idx) => (
            <Card key={sr.stepId}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-6 w-6 flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                {stepStatusIcon(sr.status)}
                <span className="font-medium flex-1">{sr.controleName}</span>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    sr.status === "passed" ? "text-success border-success/30 bg-success/10"
                    : sr.status === "failed" ? "text-destructive border-destructive/30 bg-destructive/10"
                    : sr.status === "skipped" ? "text-muted-foreground"
                    : "text-destructive border-destructive/30 bg-destructive/10"
                  }`}
                >
                  {sr.status === "passed" ? "Geslaagd" : sr.status === "failed" ? "Gefaald" : sr.status === "skipped" ? "Overgeslagen" : "Fout"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/RunSeries.tsx
git commit -m "feat: rewrite RunSeries to use FileUploadManager with upload-once-assign-many"
```

---

### Task 11: Manual end-to-end verification

- [ ] **Step 1: Start backend**

```bash
cd /Users/alladin/Repositories/bcs/backend && python -m uvicorn main:app --reload --port 8000
```

- [ ] **Step 2: Start frontend**

```bash
cd /Users/alladin/Repositories/bcs/frontend && npm run dev
```

- [ ] **Step 3: Test single controle bulk upload**

1. Navigate to a published controle and click "Uitvoeren"
2. Upload 2+ PDF files into the pool via drag-and-drop or file picker
3. Drag files to the correct slots — verify type validation (PDF to PDF, XLSX to XLSX)
4. Assign multiple files to one slot
5. Click "Controle uitvoeren"
6. Verify results show per-file collapsible sections with individual field results

- [ ] **Step 4: Test series bulk upload**

1. Navigate to a series and click "Uitvoeren"
2. Upload all files into the pool
3. Drag files to step slots — verify files can be reused across steps
4. Click "Serie uitvoeren"
5. Verify step results display correctly

- [ ] **Step 5: Test backward compatibility**

Verify that the existing API still works with single file IDs (string instead of array) by checking the backend normalization.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during E2E verification"
```
