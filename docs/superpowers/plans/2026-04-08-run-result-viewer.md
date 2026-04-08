# Run Result Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a document viewer to control and series run results that shows PDFs and spreadsheets with extraction overlays, reusing existing TemplateBuilder components in read-only mode.

**Architecture:** New `RunResultViewer` component composes existing `PdfViewer`, `BboxCanvas`, `SpreadsheetViewer`, and `ExtractionResults` into a split-panel layout. Backend persists full `ExtractionResponse[]` alongside run summaries to support viewing historical results. Series step cards link to a new route that renders the same viewer.

**Tech Stack:** React, TypeScript, react-resizable-panels, react-pdf, react-router-dom, FastAPI, Pydantic

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/services/storage_backend.py` | Modify | Add `save/get_controle_run_details` methods |
| `backend/routers/controles.py` | Modify | Persist full responses on run, add GET details endpoint |
| `backend/routers/controle_series.py` | Modify | Persist full responses per step during series run |
| `frontend/src/types/index.ts` | Modify | Add `FileGroup`, `FileEntry` types |
| `frontend/src/api/client.ts` | Modify | Add `getControleRunDetails()` function |
| `frontend/src/components/BboxCanvas.tsx` | Modify | Add `readOnly` prop + `results` prop to decouple from store |
| `frontend/src/components/ExtractionResults.tsx` | Modify | Accept results as props with store fallback |
| `frontend/src/components/ReadOnlySpreadsheetViewer.tsx` | Create | Read-only spreadsheet grid with highlighted extracted cells |
| `frontend/src/components/FileSidebar.tsx` | Create | Left panel with collapsible file groups |
| `frontend/src/components/RunResultViewer.tsx` | Create | Main split-panel viewer component |
| `frontend/src/pages/RunControle.tsx` | Modify | Replace results phase with RunResultViewer |
| `frontend/src/pages/RunSeries.tsx` | Modify | Make step cards clickable |
| `frontend/src/pages/RunSeriesStepDetail.tsx` | Create | Series step detail page with RunResultViewer |
| `frontend/src/App.tsx` | Modify | Add series step detail route |

---

### Task 1: Backend — Persist and Serve Full Extraction Details

**Files:**
- Modify: `backend/services/storage_backend.py`
- Modify: `backend/routers/controles.py`
- Modify: `backend/routers/controle_series.py`
- Modify: `backend/models/schemas.py` (if needed for the new endpoint response model)

- [ ] **Step 1: Add storage methods for controle run details**

In `backend/services/storage_backend.py`, add abstract methods and implementations for both `FileSystemStorage` and `AzureBlobStorage`:

```python
# In StorageBackend (abstract class), after the existing controle run methods:

@abstractmethod
def save_controle_run_details(self, run_id: str, content: str) -> None: ...

@abstractmethod
def get_controle_run_details(self, run_id: str) -> str | None: ...
```

In `FileSystemStorage`:

```python
def save_controle_run_details(self, run_id: str, content: str) -> None:
    (self._controle_runs / f"{run_id}_details.json").write_text(content, encoding="utf-8")

def get_controle_run_details(self, run_id: str) -> str | None:
    path = self._controle_runs / f"{run_id}_details.json"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")
```

In `AzureBlobStorage`:

```python
def save_controle_run_details(self, run_id: str, content: str) -> None:
    self._controle_runs.upload_blob(f"{run_id}_details.json", content, overwrite=True)

def get_controle_run_details(self, run_id: str) -> str | None:
    blob_client = self._controle_runs.get_blob_client(f"{run_id}_details.json")
    if not blob_client.exists():
        return None
    return blob_client.download_blob().readall().decode("utf-8")
```

- [ ] **Step 2: Persist full responses in controles.py run endpoint**

In `backend/routers/controles.py`, after the line `storage.save_controle_run(run_result.id, run_result.model_dump_json(indent=2))`, add:

```python
# Persist full extraction details for the viewer
details_json = json.dumps([r.model_dump() for r in responses], indent=2, default=str)
storage.save_controle_run_details(run_result.id, details_json)
```

Make sure `json` is imported at the top (it should already be).

- [ ] **Step 3: Add GET endpoint for controle run details**

In `backend/routers/controles.py`, add a new endpoint after the existing `list_all_runs`:

```python
@router.get("/runs/{run_id}/details", response_model=list[ExtractionResponse])
async def get_run_details(run_id: str):
    storage = get_storage()
    content = storage.get_controle_run_details(run_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Run details not found")
    return json.loads(content)
```

- [ ] **Step 4: Persist full responses in controle_series.py run endpoint**

In `backend/routers/controle_series.py`, inside the series run endpoint, after the line `storage.save_controle_run(run_result.id, run_result.model_dump_json(indent=2))`, add the same persistence:

```python
details_json = json.dumps([r.model_dump() for r in responses], indent=2, default=str)
storage.save_controle_run_details(run_result.id, details_json)
```

- [ ] **Step 5: Verify the backend changes work**

Run the backend server and test:
```bash
cd /Users/alladin/Repositories/bcs/backend && python -c "from services.storage_backend import FileSystemStorage; print('Import OK')"
```

- [ ] **Step 6: Commit**

```bash
git add backend/services/storage_backend.py backend/routers/controles.py backend/routers/controle_series.py
git commit -m "$(cat <<'EOF'
feat: persist full extraction details for run result viewer

Save ExtractionResponse[] alongside ControleRunResult when running
controles and series. Add GET /controles/runs/{run_id}/details endpoint
to retrieve full extraction data including coordinates and regions.
EOF
)"
```

---

### Task 2: Frontend Types and API Client

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add types for the run result viewer**

In `frontend/src/types/index.ts`, add after the `ControleSeriesRun` interface:

```typescript
// --- Run Result Viewer ---

export interface FileGroup {
  label: string;
  files: FileEntry[];
}

export interface FileEntry {
  fileId: string;
  filename: string;
  fileType: "pdf" | "spreadsheet";
  results: FieldResult[];
  ruleResults: TemplateRuleResult[];
  computedValues: Record<string, string>;
  passed: number;
  total: number;
}
```

- [ ] **Step 2: Add API client function**

In `frontend/src/api/client.ts`, add after the existing `listControleRuns` function:

```typescript
export async function getControleRunDetails(runId: string): Promise<ExtractionResponse[]> {
  const response = await api.get(`/controles/runs/${runId}/details`);
  return response.data;
}
```

Make sure `ExtractionResponse` is in the imports from `@/types` at the top of the file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/client.ts
git commit -m "$(cat <<'EOF'
feat: add FileGroup/FileEntry types and getControleRunDetails API
EOF
)"
```

---

### Task 3: Make BboxCanvas Support Read-Only Mode with Props-Based Results

**Files:**
- Modify: `frontend/src/components/BboxCanvas.tsx`

- [ ] **Step 1: Add readOnly and resultsOverride props**

Change the Props interface and the component signature in `BboxCanvas.tsx`:

```typescript
interface Props {
  pageWidth: number;
  pageHeight: number;
  source?: "a" | "b";
  readOnly?: boolean;
  resultsOverride?: FieldResult[];
  fieldsOverride?: Field[];
  currentPageOverride?: number;
}
```

Update the component function to use overrides when provided:

```typescript
export default function BboxCanvas({ pageWidth, pageHeight, source, readOnly = false, resultsOverride, fieldsOverride, currentPageOverride }: Props) {
  const storeCurrentPage = useAppStore((s) => source === 'b' ? s.currentPageB : s.currentPage);
  const currentPage = currentPageOverride ?? storeCurrentPage;
  const storeFields = useAppStore((s) => s.fields);
  const fields = fieldsOverride ?? storeFields;
```

- [ ] **Step 2: Guard all editing actions behind readOnly check**

The component already uses `canEdit` from the store. For readOnly mode, override it:

After the existing `const canEdit = useAppStore((s) => s.canDrawFields);` line, add:

```typescript
const effectiveCanEdit = readOnly ? false : canEdit;
```

Then replace all references to `canEdit` in the component with `effectiveCanEdit`. The key places:
- `onDrawComplete` callback: `if (!effectiveCanEdit) return;`
- `startDrag` callback: `if (!effectiveCanEdit) return;`
- `onSvgMouseDown`: `if (!drag && effectiveCanEdit) handlers.onMouseDown(e);`
- `svgCursor`: `const svgCursor = drag ? 'grabbing' : !effectiveCanEdit ? 'default' : ...`
- All `onStartDrag` and `onSelect` and `onUpdateLabel` prop passes in the JSX

- [ ] **Step 3: Use resultsOverride when provided**

Change the results lookup to use override when available:

```typescript
const storeResults = useAppStore((s) => s.extractionResults);
const extractionResults = resultsOverride ?? storeResults;
```

Replace the existing `const extractionResults = useAppStore((s) => s.extractionResults);` with the above.

- [ ] **Step 4: In readOnly mode, build synthetic fields from FieldResult data**

When `fieldsOverride` is not explicitly provided but `resultsOverride` is, we need to generate field overlays from the `FieldResult.resolved_region` data. Add this after the fields/results setup:

```typescript
// In readOnly mode with results but no explicit fields, synthesize fields from results
const effectiveFields = (() => {
  if (fieldsOverride) return fieldsOverride;
  if (readOnly && resultsOverride) {
    return resultsOverride
      .filter((r) => r.resolved_region && r.resolved_region.page === currentPage)
      .map((r): Field => ({
        id: r.label,
        label: r.label,
        type: r.field_type === "cell" || r.field_type === "cell_range" ? "static" : r.field_type,
        anchor_mode: "static",
        anchors: [],
        value_region: r.resolved_region!,
        rules: [],
        chain: [],
      }));
  }
  return fields;
})();
```

Then use `effectiveFields` instead of `fields` for `currentPageFields` filtering.

- [ ] **Step 5: Verify BboxCanvas still works in TemplateBuilder**

Start the frontend dev server and open an existing controle in edit mode. Verify field overlays still render and are draggable.

```bash
cd /Users/alladin/Repositories/bcs/frontend && npm run dev
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/BboxCanvas.tsx
git commit -m "$(cat <<'EOF'
feat: add readOnly mode and props-based overrides to BboxCanvas

Supports resultsOverride and fieldsOverride props for decoupling
from the app store. In readOnly mode, all editing is disabled and
synthetic fields are built from FieldResult regions.
EOF
)"
```

---

### Task 4: Make ExtractionResults Accept Props

**Files:**
- Modify: `frontend/src/components/ExtractionResults.tsx`

- [ ] **Step 1: Add props for standalone usage**

Update the Props interface and component to accept results as props with store fallback:

```typescript
interface Props {
  onClose: () => void;
  embedded?: boolean;
  resultsOverride?: FieldResult[];
  templateRuleResultsOverride?: TemplateRuleResult[];
  computedValuesOverride?: Record<string, string>;
  onFieldClick?: (fieldIndex: number) => void;
}

export default function ExtractionResults({
  onClose,
  embedded = false,
  resultsOverride,
  templateRuleResultsOverride,
  computedValuesOverride,
  onFieldClick,
}: Props) {
  const storeResults = useAppStore((s) => s.extractionResults);
  const results = resultsOverride ?? storeResults;
  const templateMode = useAppStore((s) => s.templateMode);
  const pdfId = useAppStore((s) => s.pdfId);
  const pdfFilename = useAppStore((s) => s.pdfFilename);
  const activeTemplateId = useAppStore((s) => s.activeTemplateId);
  const templates = useAppStore((s) => s.templates);
  const addSavedTestRun = useAppStore((s) => s.addSavedTestRun);
  const setSavedTestRuns = useAppStore((s) => s.setSavedTestRuns);
  const storeRuleResults = useAppStore((s) => s.templateRuleResults);
  const templateRuleResults = templateRuleResultsOverride ?? storeRuleResults;
  const storeComputedValues = useAppStore((s) => s.computedValues);
  const computedValues = computedValuesOverride ?? storeComputedValues;
```

- [ ] **Step 2: Add click handler to field cards**

In the `FieldResultCards` component, add an `onFieldClick` prop and call it when a card is clicked:

```typescript
function FieldResultCards({ results, templateMode, onFieldClick }: {
  results: FieldResult[];
  templateMode: string;
  onFieldClick?: (fieldIndex: number) => void;
}) {
  return (
    <div className="space-y-2">
      {results.map((r, i) => (
        <div
          key={i}
          onClick={() => onFieldClick?.(i)}
          className={`rounded-md border p-2.5 ${onFieldClick ? 'cursor-pointer hover:ring-1 hover:ring-primary/50' : ''} ${
            // ... existing class logic
          }`}
        >
```

Pass `onFieldClick` through from the main component to `FieldResultCards`.

- [ ] **Step 3: Hide save button when resultsOverride is provided**

In the header section, change the save button condition:

```typescript
{!embedded && !resultsOverride && (
  <button
    onClick={handleSave}
    // ... rest of button
  >
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ExtractionResults.tsx
git commit -m "$(cat <<'EOF'
feat: allow ExtractionResults to accept results as props

Adds resultsOverride, templateRuleResultsOverride, computedValuesOverride,
and onFieldClick props. Falls back to store when overrides not provided.
Hides save button when using override props.
EOF
)"
```

---

### Task 5: Create ReadOnlySpreadsheetViewer

**Files:**
- Create: `frontend/src/components/ReadOnlySpreadsheetViewer.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useState, useEffect } from "react";
import { getSpreadsheet } from "@/api/client";
import type { FieldResult, SheetData } from "@/types";

interface Props {
  fileId: string;
  results: FieldResult[];
  onFieldClick?: (fieldIndex: number) => void;
}

const TYPE_COLORS: Record<string, { bg: string; border: string }> = {
  static: { bg: "bg-blue-100/50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700" },
  dynamic: { bg: "bg-amber-100/50 dark:bg-amber-900/20", border: "border-amber-300 dark:border-amber-700" },
  table: { bg: "bg-violet-100/50 dark:bg-violet-900/20", border: "border-violet-300 dark:border-violet-700" },
  cell: { bg: "bg-blue-100/50 dark:bg-blue-900/20", border: "border-blue-300 dark:border-blue-700" },
  cell_range: { bg: "bg-violet-100/50 dark:bg-violet-900/20", border: "border-violet-300 dark:border-violet-700" },
};

export default function ReadOnlySpreadsheetViewer({ fileId, results, onFieldClick }: Props) {
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSpreadsheet(fileId)
      .then((resp) => setSheetData(resp.sheetData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Laden...
      </div>
    );
  }

  if (!sheetData) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Geen spreadsheetdata beschikbaar.
      </div>
    );
  }

  // Build a lookup: cell coord -> result index for highlighting
  const cellHighlights = new Map<string, { resultIndex: number; result: FieldResult }>();
  results.forEach((r, idx) => {
    if (r.field_type === "cell" && r.resolved_region) {
      // resolved_region.x = col (normalized), y = row (normalized) — but for cells
      // the backend stores cell_ref as col/row in the extraction, check value_found_x/y
      // For cell types, value_found_x = col index, value_found_y = row index
      if (r.value_found_x !== undefined && r.value_found_y !== undefined) {
        const key = `${Math.round(r.value_found_x)},${Math.round(r.value_found_y)}`;
        cellHighlights.set(key, { resultIndex: idx, result: r });
      }
    }
    if (r.field_type === "cell_range" && r.resolved_region) {
      // For ranges, resolved_region contains the range coords
      const reg = r.resolved_region;
      const startCol = Math.round(reg.x);
      const startRow = Math.round(reg.y);
      const endCol = Math.round(reg.x + reg.width);
      const endRow = Math.round(reg.y + reg.height);
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          cellHighlights.set(`${col},${row}`, { resultIndex: idx, result: r });
        }
      }
    }
  });

  return (
    <div className="flex-1 overflow-auto select-none">
      <table className="border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th className="border border-border bg-muted px-2 py-1 text-xs text-muted-foreground font-medium min-w-[3rem] text-center sticky left-0 z-20">
              #
            </th>
            {sheetData.headers.map((header, colIdx) => (
              <th
                key={colIdx}
                className="border border-border bg-muted px-3 py-1.5 text-xs font-medium text-left whitespace-nowrap min-w-[8rem]"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheetData.rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              <td className="border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground text-center sticky left-0 z-10">
                {rowIdx + 1}
              </td>
              {row.map((cell, colIdx) => {
                const highlight = cellHighlights.get(`${colIdx},${rowIdx}`);
                const colors = highlight ? TYPE_COLORS[highlight.result.field_type] ?? TYPE_COLORS.cell : null;

                return (
                  <td
                    key={colIdx}
                    className={`border px-3 py-1 whitespace-nowrap relative ${
                      colors
                        ? `${colors.bg} ${colors.border} cursor-pointer`
                        : "border-border"
                    }`}
                    onClick={highlight && onFieldClick ? () => onFieldClick(highlight.resultIndex) : undefined}
                    title={highlight ? `${highlight.result.label}: ${highlight.result.value}` : undefined}
                  >
                    {cell === null || cell === undefined ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : (
                      String(cell)
                    )}
                    {highlight && (
                      <span className="absolute -top-2 left-1 text-[8px] font-semibold px-1 rounded bg-background border border-border text-foreground/70 whitespace-nowrap">
                        {highlight.result.label}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify the getSpreadsheet API returns sheetData**

Check the API response shape. The `getSpreadsheet` function returns `SpreadsheetUploadResponse`. Verify it has a `sheetData` property:

```bash
cd /Users/alladin/Repositories/bcs/frontend && grep -n "SpreadsheetUploadResponse" src/types/index.ts src/api/client.ts
```

If the response shape is different, adjust the `useEffect` to extract `sheetData` correctly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ReadOnlySpreadsheetViewer.tsx
git commit -m "$(cat <<'EOF'
feat: add ReadOnlySpreadsheetViewer with extraction highlights

Displays spreadsheet grid with colored cell highlights for extracted
fields. Shows field labels as floating tags and supports click-to-select.
EOF
)"
```

---

### Task 6: Create FileSidebar

**Files:**
- Create: `frontend/src/components/FileSidebar.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useState } from "react";
import { FileText, FileSpreadsheet, ChevronDown } from "lucide-react";
import type { FileGroup } from "@/types";

interface Props {
  fileGroups: FileGroup[];
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
}

export default function FileSidebar({ fileGroups, selectedFileId, onSelectFile }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="h-full flex flex-col bg-background border-r border-border">
      <div className="px-3 py-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bestanden</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {fileGroups.map((group) => {
          const isCollapsed = collapsed[group.label] ?? false;
          const groupPassed = group.files.reduce((s, f) => s + f.passed, 0);
          const groupTotal = group.files.reduce((s, f) => s + f.total, 0);
          const allOk = groupPassed === groupTotal;

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex-1 truncate">
                  {group.label}
                </span>
                <span className={`text-[10px] font-medium ${allOk ? "text-green-600" : "text-amber-600"}`}>
                  {groupPassed}/{groupTotal}
                </span>
              </button>
              {!isCollapsed && (
                <div className="pb-1">
                  {group.files.map((file) => {
                    const isSelected = file.fileId === selectedFileId;
                    const fileAllOk = file.passed === file.total;
                    const FileIcon = file.fileType === "spreadsheet" ? FileSpreadsheet : FileText;

                    return (
                      <button
                        key={file.fileId}
                        onClick={() => onSelectFile(file.fileId)}
                        className={`flex items-center gap-2 w-full px-3 pl-8 py-1.5 text-left transition-colors ${
                          isSelected
                            ? "bg-primary/10 border-l-2 border-primary"
                            : "hover:bg-muted/50 border-l-2 border-transparent"
                        }`}
                      >
                        <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium text-foreground flex-1 truncate">
                          {file.filename}
                        </span>
                        <span className={`text-[10px] font-medium shrink-0 ${fileAllOk ? "text-green-600" : "text-amber-600"}`}>
                          {file.passed}/{file.total}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FileSidebar.tsx
git commit -m "$(cat <<'EOF'
feat: add FileSidebar component for run result viewer

Collapsible file groups by slot with pass/fail indicators.
Highlights selected file with primary border.
EOF
)"
```

---

### Task 7: Create RunResultViewer

**Files:**
- Create: `frontend/src/components/RunResultViewer.tsx`

- [ ] **Step 1: Create the main viewer component**

```typescript
import { useState, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { getPdfUrl } from "@/api/client";
import BboxCanvas from "@/components/BboxCanvas";
import ExtractionResults from "@/components/ExtractionResults";
import ReadOnlySpreadsheetViewer from "@/components/ReadOnlySpreadsheetViewer";
import FileSidebar from "@/components/FileSidebar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Minus, Plus, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { FileGroup, FileEntry, FieldResult, TemplateRuleResult } from "@/types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

interface Props {
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

type RightTab = "resultaten" | "overzicht";

export default function RunResultViewer({ fileGroups, ruleResults, computedValues, summary }: Props) {
  // Find first file across all groups
  const allFiles = fileGroups.flatMap((g) => g.files);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(allFiles[0]?.fileId ?? null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(2); // 1.0x
  const [showMarkers, setShowMarkers] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("resultaten");
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedFile: FileEntry | null = allFiles.find((f) => f.fileId === selectedFileId) ?? null;

  const handleSelectFile = useCallback((fileId: string) => {
    setSelectedFileId(fileId);
    setCurrentPage(1);
    setNumPages(null);
    setPageDims(null);
  }, []);

  const zoom = ZOOM_LEVELS[zoomIndex];

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  const onRenderSuccess = useCallback(() => {
    if (containerRef.current) {
      const canvas = containerRef.current.querySelector("canvas");
      if (canvas) {
        setPageDims({ width: canvas.clientWidth, height: canvas.clientHeight });
      }
    }
  }, []);

  const handleFieldClick = useCallback((fieldIndex: number) => {
    if (!selectedFile) return;
    const result = selectedFile.results[fieldIndex];
    if (result?.resolved_region) {
      setCurrentPage(result.resolved_region.page);
    }
  }, [selectedFile]);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-8rem)] rounded-lg border border-border">
      {/* Left: File Sidebar */}
      <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
        <FileSidebar
          fileGroups={fileGroups}
          selectedFileId={selectedFileId}
          onSelectFile={handleSelectFile}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* Center: Document Viewer */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <div className="h-full flex flex-col bg-muted/20">
          {/* Toolbar */}
          {selectedFile && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
              <div className="flex items-center gap-1">
                {selectedFile.fileType === "pdf" && numPages && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground min-w-[4rem] text-center">
                      {currentPage} / {numPages}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage >= numPages} onClick={() => setCurrentPage((p) => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                {selectedFile.fileType === "pdf" && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoomIndex <= 0} onClick={() => setZoomIndex((z) => z - 1)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoomIndex >= ZOOM_LEVELS.length - 1} onClick={() => setZoomIndex((z) => z + 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowMarkers((s) => !s)}>
                      {showMarkers ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Document area */}
          <div className="flex-1 overflow-auto flex items-start justify-center p-4">
            {!selectedFile && (
              <div className="text-muted-foreground text-sm mt-16">Selecteer een bestand</div>
            )}

            {selectedFile?.fileType === "pdf" && (
              <div ref={containerRef} className="relative inline-block shadow-lg rounded-lg overflow-hidden border border-border">
                <Document
                  file={getPdfUrl(selectedFile.fileId)}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={<div className="p-8 text-muted-foreground">Loading PDF...</div>}
                >
                  <Page
                    pageNumber={currentPage}
                    scale={zoom}
                    onRenderSuccess={onRenderSuccess}
                    loading={<div className="p-8 text-muted-foreground">Loading page...</div>}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>
                {pageDims && showMarkers && (
                  <BboxCanvas
                    pageWidth={pageDims.width}
                    pageHeight={pageDims.height}
                    readOnly
                    resultsOverride={selectedFile.results}
                    currentPageOverride={currentPage}
                  />
                )}
              </div>
            )}

            {selectedFile?.fileType === "spreadsheet" && (
              <ReadOnlySpreadsheetViewer
                fileId={selectedFile.fileId}
                results={selectedFile.results}
                onFieldClick={handleFieldClick}
              />
            )}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* Right: Results Panel */}
      <ResizablePanel defaultSize={32} minSize={20} maxSize={45}>
        <div className="h-full flex flex-col bg-background">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setRightTab("resultaten")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                rightTab === "resultaten"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Resultaten
            </button>
            <button
              onClick={() => setRightTab("overzicht")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                rightTab === "overzicht"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Overzicht
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {rightTab === "resultaten" && selectedFile && (
              <ExtractionResults
                onClose={() => {}}
                embedded
                resultsOverride={selectedFile.results}
                templateRuleResultsOverride={selectedFile.ruleResults}
                computedValuesOverride={selectedFile.computedValues}
                onFieldClick={handleFieldClick}
              />
            )}

            {rightTab === "overzicht" && (
              <div className="p-4 space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-green-200 dark:border-green-800 p-3 text-center">
                    <p className="text-xl font-bold text-green-600">{summary.fieldsOk}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Velden OK</p>
                  </div>
                  <div className={`rounded-lg border p-3 text-center ${summary.failures > 0 ? "border-red-200 dark:border-red-800" : "border-green-200 dark:border-green-800"}`}>
                    <p className={`text-xl font-bold ${summary.failures > 0 ? "text-red-600" : "text-green-600"}`}>
                      {summary.failures}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Afwijkingen</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className={`text-xl font-bold ${
                      ruleResults.length === 0 ? "text-muted-foreground"
                      : summary.rulesPassed === summary.rulesTotal ? "text-green-600"
                      : "text-amber-600"
                    }`}>
                      {ruleResults.length > 0 ? `${summary.rulesPassed}/${summary.rulesTotal}` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Regels geslaagd</p>
                  </div>
                </div>

                {/* Rule results */}
                {ruleResults.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Regelresultaten</h4>
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8"></TableHead>
                              <TableHead className="text-xs">Regel</TableHead>
                              <TableHead className="text-xs text-right">Resultaat</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ruleResults.map((rr, i) => (
                              <TableRow key={i}>
                                <TableCell className="py-1.5">
                                  {rr.passed ? (
                                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  )}
                                </TableCell>
                                <TableCell className="text-xs font-medium py-1.5">{rr.rule_name}</TableCell>
                                <TableCell className="text-right py-1.5">
                                  {rr.computed_value ? (
                                    <span className="font-mono text-xs">= {rr.computed_value}</span>
                                  ) : rr.passed ? (
                                    <span className="text-green-600 text-xs font-medium">OK</span>
                                  ) : (
                                    <span className="text-red-500 text-[11px]">{rr.message}</span>
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
                {Object.keys(computedValues).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Berekende waarden</h4>
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Naam</TableHead>
                              <TableHead className="text-xs text-right">Waarde</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(computedValues).map(([label, value]) => (
                              <TableRow key={label}>
                                <TableCell className="text-xs font-medium py-1.5">{label}</TableCell>
                                <TableCell className="text-right font-mono text-xs py-1.5">{value}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/RunResultViewer.tsx
git commit -m "$(cat <<'EOF'
feat: add RunResultViewer split-panel component

Three-panel layout: file sidebar, document viewer (PDF with BboxCanvas
overlays or spreadsheet with cell highlights), and results panel with
Resultaten/Overzicht tabs.
EOF
)"
```

---

### Task 8: Integrate RunResultViewer into RunControle

**Files:**
- Modify: `frontend/src/pages/RunControle.tsx`

- [ ] **Step 1: Replace the results phase rendering**

Import the new component and types at the top of `RunControle.tsx`:

```typescript
import RunResultViewer from "@/components/RunResultViewer";
import type { FileGroup } from "@/types";
```

- [ ] **Step 2: Build fileGroups from results**

Replace the entire results phase JSX block (the `{phase === "results" && results && ( ... )}` section, lines 156-346) with:

```typescript
{phase === "results" && results && (() => {
  const fileGroups: FileGroup[] = controle.files.map((fileDef) => {
    const assigned = assignments[fileDef.id] ?? [];
    const fileDefResults = results.filter((r) =>
      assigned.some((a) => a.id === r.pdf_id)
    );
    return {
      label: fileDef.label,
      files: fileDefResults.map((fr) => {
        const passed = fr.results.filter((r) => r.status === "ok").length;
        return {
          fileId: fr.pdf_id,
          filename: fr.source_filename || "Bestand",
          fileType: fileDef.fileType,
          results: fr.results,
          ruleResults: fr.template_rule_results,
          computedValues: fr.computed_values,
          passed,
          total: fr.results.length,
        };
      }),
    };
  });

  return (
    <RunResultViewer
      fileGroups={fileGroups}
      ruleResults={allRuleResults}
      computedValues={allComputedValues}
      summary={{
        fieldsOk: totalPassed,
        failures: totalFailed,
        rulesPassed,
        rulesTotal: allRuleResults.length,
      }}
    />
  );
})()}
```

- [ ] **Step 3: Remove the `max-w-4xl` constraint from the outer div**

The split-panel viewer needs full width. Change the outer div class from `"max-w-4xl mx-auto space-y-8"` to `"space-y-4"` only for the results phase, or conditionally:

```typescript
<div className={phase === "results" ? "space-y-4" : "max-w-4xl mx-auto space-y-8"}>
```

- [ ] **Step 4: Remove unused imports**

Remove `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from the imports since the results table rendering is now in RunResultViewer. Also remove `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger`, `ChevronDown` if no longer used.

Keep `Card`, `CardContent` only if still used in other phases — check the upload phase.

- [ ] **Step 5: Verify the integration works**

Start the dev server, navigate to a controle, upload files, run it, and verify the split-panel viewer appears.

```bash
cd /Users/alladin/Repositories/bcs/frontend && npm run dev
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RunControle.tsx
git commit -m "$(cat <<'EOF'
feat: integrate RunResultViewer into controle run results

Replace the flat table results view with the split-panel viewer
showing PDF/spreadsheet documents with extraction overlays.
EOF
)"
```

---

### Task 9: Create RunSeriesStepDetail Page

**Files:**
- Create: `frontend/src/pages/RunSeriesStepDetail.tsx`

- [ ] **Step 1: Create the step detail page**

```typescript
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderAction } from "@/context/HeaderActionContext";
import { getControleRunDetails, getControleSeriesRun, getControle } from "@/api/client";
import RunResultViewer from "@/components/RunResultViewer";
import type { ExtractionResponse, FileGroup, TemplateRuleResult, Controle } from "@/types";

export default function RunSeriesStepDetail() {
  const { seriesId, runId, stepId } = useParams<{ seriesId: string; runId: string; stepId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepName, setStepName] = useState("");
  const [fileGroups, setFileGroups] = useState<FileGroup[]>([]);
  const [ruleResults, setRuleResults] = useState<TemplateRuleResult[]>([]);
  const [computedValues, setComputedValues] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState({ fieldsOk: 0, failures: 0, rulesPassed: 0, rulesTotal: 0 });

  useEffect(() => {
    if (!runId || !stepId) return;

    const load = async () => {
      try {
        // Get the series run to find the step's controleRunId
        const seriesRun = await getControleSeriesRun(runId);
        const stepResult = seriesRun.stepResults.find((sr) => sr.stepId === stepId);
        if (!stepResult?.controleRunId) {
          setError("Stap niet gevonden of geen resultaten beschikbaar.");
          setLoading(false);
          return;
        }

        setStepName(stepResult.controleName);

        // Fetch the full extraction details
        const details: ExtractionResponse[] = await getControleRunDetails(stepResult.controleRunId);

        // Fetch the controle to get file definitions (for labels and types)
        let controle: Controle | null = null;
        try {
          controle = await getControle(stepResult.controleId);
        } catch { /* continue without labels */ }

        // Build file groups
        const allRules = details.flatMap((r) => r.template_rule_results);
        const allComputed = details.reduce((acc, r) => ({ ...acc, ...r.computed_values }), {} as Record<string, string>);

        // Group by controle file definitions if available, otherwise flat
        const groups: FileGroup[] = [];
        if (controle) {
          for (const fileDef of controle.files) {
            const matching = details.filter((d) => d.template_id === controle!.id);
            // Simple approach: distribute results across file defs by order
            if (matching.length > 0) {
              groups.push({
                label: fileDef.label,
                files: matching.map((fr) => {
                  const passed = fr.results.filter((r) => r.status === "ok").length;
                  return {
                    fileId: fr.pdf_id,
                    filename: fr.source_filename || "Bestand",
                    fileType: fileDef.fileType,
                    results: fr.results,
                    ruleResults: fr.template_rule_results,
                    computedValues: fr.computed_values,
                    passed,
                    total: fr.results.length,
                  };
                }),
              });
            }
          }
        }

        // Fallback: if no groups built, put all results in one group
        if (groups.length === 0) {
          groups.push({
            label: "Bestanden",
            files: details.map((fr) => {
              const passed = fr.results.filter((r) => r.status === "ok").length;
              return {
                fileId: fr.pdf_id,
                filename: fr.source_filename || "Bestand",
                fileType: "pdf",
                results: fr.results,
                ruleResults: fr.template_rule_results,
                computedValues: fr.computed_values,
                passed,
                total: fr.results.length,
              };
            }),
          });
        }

        const totalFields = details.reduce((s, r) => s + r.results.length, 0);
        const totalPassed = details.reduce((s, r) => s + r.results.filter((f) => f.status === "ok").length, 0);
        const rulesPassed = allRules.filter((r) => r.passed).length;

        setFileGroups(groups);
        setRuleResults(allRules);
        setComputedValues(allComputed);
        setSummary({
          fieldsOk: totalPassed,
          failures: totalFields - totalPassed,
          rulesPassed,
          rulesTotal: allRules.length,
        });
      } catch {
        setError("Kon resultaten niet laden.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [runId, stepId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Laden...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-4">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Terug
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HeaderAction>
        <Button variant="outline" className="rounded-full" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Terug naar serie
        </Button>
      </HeaderAction>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{stepName}</h1>
        <p className="text-muted-foreground text-sm">Stapresultaten</p>
      </div>

      <RunResultViewer
        fileGroups={fileGroups}
        ruleResults={ruleResults}
        computedValues={computedValues}
        summary={summary}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/RunSeriesStepDetail.tsx
git commit -m "$(cat <<'EOF'
feat: add RunSeriesStepDetail page for viewing series step results

Loads full extraction details via controleRunId from the series step,
builds file groups, and renders RunResultViewer.
EOF
)"
```

---

### Task 10: Integrate Into RunSeries and Router

**Files:**
- Modify: `frontend/src/pages/RunSeries.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Make step result cards clickable in RunSeries**

In `RunSeries.tsx`, add `useNavigate` usage and modify the step result cards (lines 211-232). Replace the `<Card>` wrapper with a clickable version:

```typescript
{result.stepResults.map((sr, idx) => {
  const isClickable = sr.status === "passed" || sr.status === "failed";
  return (
    <Card
      key={sr.stepId}
      className={isClickable ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}
      onClick={isClickable ? () => navigate(`/controle-series/${id}/run/${result.id}/step/${sr.stepId}`) : undefined}
    >
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
        {isClickable && (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </CardContent>
    </Card>
  );
})}
```

Add the `ChevronRight` import from lucide-react at the top of the file:

```typescript
import {
  Play, Loader2, CheckCircle, XCircle, SkipForward,
  AlertTriangle, RotateCcw, ChevronRight,
} from "lucide-react";
```

- [ ] **Step 2: Add the route in App.tsx**

Import the new page and add the route:

```typescript
import RunSeriesStepDetail from "@/pages/RunSeriesStepDetail";
```

Add the route inside the `<Routes>` block, after the existing `/controle-series/:id/run` route:

```typescript
<Route path="/controle-series/:seriesId/run/:runId/step/:stepId" element={<ProtectedPage><RunSeriesStepDetail /></ProtectedPage>} />
```

- [ ] **Step 3: Verify end-to-end**

Start the dev server, run a series, verify:
1. Step cards show a chevron for passed/failed steps
2. Clicking a step navigates to the detail page
3. The detail page shows the split-panel viewer with the step's results
4. Back button returns to the series results

```bash
cd /Users/alladin/Repositories/bcs/frontend && npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RunSeries.tsx frontend/src/App.tsx frontend/src/pages/RunSeriesStepDetail.tsx
git commit -m "$(cat <<'EOF'
feat: make series step results clickable with viewer navigation

Passed/failed step cards navigate to a detail page that shows
the full RunResultViewer for that step's extraction results.
EOF
)"
```
