# Polaris Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Polaris" node to the rule graph editor that reads a spreadsheet's key+signal columns, looks up signal codes in the Regelbibliotheek translation rules, groups by key, and outputs a structured result table.

**Architecture:** New `polaris_lookup` node type flows through the existing pipeline: frontend node → serializeGraph → backend RuleEngine evaluation. Translation rules move from frontend-only demo data to a backend JSON store with API endpoint. The computed result is JSON that renders as a grouped table in Results.tsx.

**Tech Stack:** React 18, TypeScript, @xyflow/react, FastAPI, Pydantic, Zustand

---

## File Structure

| File | Role |
|------|------|
| `backend/models/schemas.py` | Add `PolarisConfig` model, `polaris_config` field on `ComputationConfig`, `TranslationRule` model |
| `backend/services/storage_backend.py` | Add translation_rules storage methods to abstract class + both backends |
| `backend/services/translation_rules_store.py` | **New** — CRUD for translation rules JSON storage |
| `backend/routers/translation_rules.py` | **New** — `GET /translation-rules` endpoint |
| `backend/main.py` | Register new router |
| `backend/services/rule_engine.py` | Handle `polaris_lookup` operation in `evaluate_computation` |
| `backend/routers/controles.py` | Load translation rules and pass to RuleEngine |
| `frontend/src/types/index.ts` | Add `polaris_lookup` to `RuleNodeType`, add config fields to `RuleNodeData` |
| `frontend/src/components/rules/RuleNodes.tsx` | **New component:** `PolarisLookupNode`, register in `nodeTypes` |
| `frontend/src/components/rules/RulesPanel.tsx` | Add "Polaris" category + menu item, update result syncing |
| `frontend/src/components/rules/serializeGraph.ts` | Handle `polaris_lookup` serialization |
| `frontend/src/pages/Results.tsx` | Render polaris lookup results as grouped table |
| `frontend/src/api/client.ts` | Add `listTranslationRules` API function |

---

### Task 1: Backend — Translation rules model and storage

**Files:**
- Modify: `backend/models/schemas.py`
- Modify: `backend/services/storage_backend.py`
- Create: `backend/services/translation_rules_store.py`

- [ ] **Step 1: Add TranslationRule model to schemas.py**

Add after the `Klant` model (around line 160):

```python
class TranslationRule(BaseModel):
    """A translation rule from the Regelbibliotheek."""
    id: str
    code: str
    rapport: str
    teamId: str
    teamName: str
    translation: str
    lastModified: datetime
```

- [ ] **Step 2: Add storage methods to StorageBackend abstract class**

Add after the klanten section (around line 110) in the `StorageBackend` abstract class:

```python
    # -- Translation Rules --

    @abstractmethod
    def save_translation_rule(self, rule_id: str, content: str) -> None: ...

    @abstractmethod
    def get_translation_rule(self, rule_id: str) -> str | None: ...

    @abstractmethod
    def list_translation_rule_ids(self) -> list[str]: ...

    @abstractmethod
    def delete_translation_rule(self, rule_id: str) -> bool: ...
```

- [ ] **Step 3: Implement storage methods in LocalStorageBackend**

Add `self._translation_rules = base_dir / "translation_rules"` and `self._translation_rules.mkdir(parents=True, exist_ok=True)` in `__init__`.

Add methods after the klanten section:

```python
    # -- Translation Rules --

    def save_translation_rule(self, rule_id: str, content: str) -> None:
        (self._translation_rules / f"{rule_id}.json").write_text(content, encoding="utf-8")

    def get_translation_rule(self, rule_id: str) -> str | None:
        path = self._translation_rules / f"{rule_id}.json"
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    def list_translation_rule_ids(self) -> list[str]:
        return [p.stem for p in sorted(self._translation_rules.glob("*.json"))]

    def delete_translation_rule(self, rule_id: str) -> bool:
        path = self._translation_rules / f"{rule_id}.json"
        if not path.exists():
            return False
        path.unlink()
        return True
```

- [ ] **Step 4: Implement storage methods in AzureBlobStorageBackend**

Add `translation_rules_container: str = "translation-rules"` to `__init__` params, add `self._translation_rules = self._client.get_container_client(translation_rules_container)` and include it in the container creation loop.

Add methods:

```python
    # -- Translation Rules --

    def save_translation_rule(self, rule_id: str, content: str) -> None:
        self._translation_rules.upload_blob(f"{rule_id}.json", content, overwrite=True)

    def get_translation_rule(self, rule_id: str) -> str | None:
        blob_client = self._translation_rules.get_blob_client(f"{rule_id}.json")
        if not blob_client.exists():
            return None
        return blob_client.download_blob().readall().decode("utf-8")

    def list_translation_rule_ids(self) -> list[str]:
        ids = []
        for blob in self._translation_rules.list_blobs():
            name = blob.name
            if name.endswith(".json"):
                ids.append(name.removesuffix(".json"))
        return sorted(ids)

    def delete_translation_rule(self, rule_id: str) -> bool:
        blob_client = self._translation_rules.get_blob_client(f"{rule_id}.json")
        if not blob_client.exists():
            return False
        blob_client.delete_blob()
        return True
```

- [ ] **Step 5: Create translation_rules_store.py**

```python
import json
from models.schemas import TranslationRule
from services.storage_backend import get_storage


def list_translation_rules() -> list[TranslationRule]:
    storage = get_storage()
    rules: list[TranslationRule] = []
    for rid in storage.list_translation_rule_ids():
        content = storage.get_translation_rule(rid)
        if content is not None:
            rules.append(TranslationRule(**json.loads(content)))
    return rules


def get_translation_rules_dict() -> dict[str, str]:
    """Return a dict mapping signal code -> translation text for rule engine use."""
    rules = list_translation_rules()
    return {rule.code: rule.translation for rule in rules}
```

- [ ] **Step 6: Commit**

```bash
git add backend/models/schemas.py backend/services/storage_backend.py backend/services/translation_rules_store.py
git commit -m "feat: add TranslationRule model and storage backend"
```

---

### Task 2: Backend — Translation rules API endpoint

**Files:**
- Create: `backend/routers/translation_rules.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create translation_rules router**

```python
from fastapi import APIRouter
from models.schemas import TranslationRule
from services.translation_rules_store import list_translation_rules

router = APIRouter(prefix="/translation-rules", tags=["translation-rules"])


@router.get("", response_model=list[TranslationRule])
async def get_all_translation_rules():
    return list_translation_rules()
```

- [ ] **Step 2: Register router in main.py**

Add import:
```python
from routers import extract, pdfs, templates, test_runs, controles, klanten, controle_series, spreadsheets, translation_rules
```

Add after `app.include_router(spreadsheets.router)`:
```python
app.include_router(translation_rules.router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/routers/translation_rules.py backend/main.py
git commit -m "feat: add GET /translation-rules endpoint"
```

---

### Task 3: Backend — PolarisConfig and RuleEngine evaluation

**Files:**
- Modify: `backend/models/schemas.py`
- Modify: `backend/services/rule_engine.py`
- Modify: `backend/routers/controles.py`

- [ ] **Step 1: Add PolarisConfig to schemas.py**

Add after the `Condition` model:

```python
class PolarisConfig(BaseModel):
    """Configuration for a Polaris signal lookup node."""
    spreadsheet_id: str
    key_column: str
    signal_column: str
```

- [ ] **Step 2: Add polaris_config field to ComputationConfig**

In the `ComputationConfig` class, add:

```python
    polaris_config: PolarisConfig | None = None  # for polaris_lookup operation
```

- [ ] **Step 3: Handle polaris_lookup in RuleEngine.evaluate_computation**

Add a new block in `evaluate_computation` after the `row_filter` handling (around line 380) and before the generic operand resolution:

```python
        # Handle polaris_lookup operation
        if op == "polaris_lookup":
            pc = comp.polaris_config
            if not pc or not pc.spreadsheet_id or pc.spreadsheet_id not in self.grid_data:
                return None
            grid = self.grid_data[pc.spreadsheet_id]
            headers = grid.get("headers", [])
            if pc.key_column not in headers or pc.signal_column not in headers:
                return None
            key_idx = headers.index(pc.key_column)
            sig_idx = headers.index(pc.signal_column)
            # Group signals by key
            grouped: dict[str, list[dict[str, str]]] = {}
            for row in grid["rows"]:
                key_val = str(row[key_idx]) if key_idx < len(row) and row[key_idx] is not None else ""
                sig_val = str(row[sig_idx]) if sig_idx < len(row) and row[sig_idx] is not None else ""
                if not key_val or not sig_val:
                    continue
                translation = self.translation_rules.get(sig_val, "")
                if key_val not in grouped:
                    grouped[key_val] = []
                grouped[key_val].append({"code": sig_val, "translation": translation})
            import json as _json
            return _json.dumps(grouped, ensure_ascii=False)
```

- [ ] **Step 4: Add translation_rules parameter to RuleEngine.__init__**

Update the `__init__` signature to accept `translation_rules`:

```python
    def __init__(
        self,
        current_template_id: str,
        extracted_values: dict[str, str],
        cross_template_values: dict[str, dict[str, str]] | None = None,
        table_values: dict[str, list[dict[str, str]]] | None = None,
        cross_table_values: dict[str, dict[str, list[dict[str, str]]]] | None = None,
        series_context: dict[str, "ControleRunResult"] | None = None,
        grid_data: dict[str, dict] | None = None,
        translation_rules: dict[str, str] | None = None,
    ):
```

And add: `self.translation_rules = translation_rules or {}`

- [ ] **Step 5: Load translation rules in run_controle**

In `backend/routers/controles.py`, in the `run_controle` function, after loading `grid_data` (around line 92), add:

```python
    from services.translation_rules_store import get_translation_rules_dict
    translation_rules = get_translation_rules_dict()
```

Then pass `translation_rules=translation_rules` to every `RuleEngine(...)` constructor call in this function. There are two: one for spreadsheet files (around line 137) and one for PDF files (inside `extract_all_fields`, but that's called with a different signature — only the direct `RuleEngine` call needs updating).

Update the spreadsheet RuleEngine call:

```python
                engine = RuleEngine(
                    current_template_id=controle_id,
                    extracted_values=extracted_values,
                    grid_data=grid_data,
                    translation_rules=translation_rules,
                )
```

- [ ] **Step 6: Commit**

```bash
git add backend/models/schemas.py backend/services/rule_engine.py backend/routers/controles.py
git commit -m "feat: add polaris_lookup evaluation to RuleEngine"
```

---

### Task 4: Frontend — Types and API client

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Update RuleNodeType**

Change the `RuleNodeType` union (line 116) to include `polaris_lookup`:

```typescript
export type RuleNodeType = "field_input" | "literal_input" | "math_operation" | "comparison" | "validation" | "condition" | "table_column" | "table_aggregate" | "table_row_filter" | "formula" | "cell_range" | "polaris_lookup";
```

- [ ] **Step 2: Add PolarisConfig interface**

Add after `CellRange` interface (around line 331):

```typescript
export interface PolarisConfig {
  spreadsheet_id: string;
  key_column: string;
  signal_column: string;
}
```

- [ ] **Step 3: Add polaris fields to RuleNodeData**

Add after the `cellRange` field (around line 155):

```typescript
  // Polaris lookup node
  polarisSpreadsheetId?: string;
  polarisKeyColumn?: string;
  polarisSignalColumn?: string;
```

- [ ] **Step 4: Add polaris_config to ComputationConfig**

The frontend `ComputationConfig` interface (line 80) — add:

```typescript
  polaris_config?: PolarisConfig;
```

- [ ] **Step 5: Add listTranslationRules to API client**

Add to `frontend/src/api/client.ts`:

```typescript
export async function listTranslationRules(): Promise<{ id: string; code: string; rapport: string; teamId: string; teamName: string; translation: string; lastModified: string }[]> {
  const { data } = await api.get("/translation-rules");
  return data;
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/client.ts
git commit -m "feat: add polaris_lookup types and API client function"
```

---

### Task 5: Frontend — PolarisLookupNode component

**Files:**
- Modify: `frontend/src/components/rules/RuleNodes.tsx`

- [ ] **Step 1: Add PolarisLookupNode component**

Add before the `/* ── Export ── */` section (before line 563):

```tsx
/* ── Polaris Lookup Node ── */

export const PolarisLookupNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { setNodes } = useReactFlow();
  const appStore = (window as any).__appStore;

  // Get spreadsheet files from the wizard controle
  const wizardControle = appStore?.getState?.()?.wizardControle;
  const ssFiles = wizardControle?.files?.filter((f: any) => f.fileType === 'spreadsheet') || [];

  // Get headers for selected spreadsheet
  const selectedFile = ssFiles.find((f: any) => f.spreadsheetId === data.polarisSpreadsheetId);
  const headers: string[] = selectedFile?.sheetData?.headers || [];

  const updateField = useCallback((field: string, value: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n
      )
    );
  }, [id, setNodes]);

  return (
    <div className="px-2.5 py-2 rounded-lg border-2 border-violet-500 bg-violet-50/80 dark:bg-violet-950 shadow-sm min-w-[180px] max-w-[220px]">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-violet-500 dark:text-violet-400 leading-none mb-1">
        Polaris Lookup
      </div>

      {/* Spreadsheet selector */}
      <select
        value={data.polarisSpreadsheetId || ''}
        onChange={(e) => {
          updateField('polarisSpreadsheetId', e.target.value);
          updateField('polarisKeyColumn', '');
          updateField('polarisSignalColumn', '');
        }}
        className="w-full text-[10px] bg-violet-100 dark:bg-violet-900 border border-violet-300 dark:border-violet-600 rounded px-1 py-0.5 text-violet-800 dark:text-violet-200 outline-none mb-1"
      >
        <option value="">spreadsheet...</option>
        {ssFiles.map((f: any) => (
          <option key={f.spreadsheetId} value={f.spreadsheetId}>
            {f.label || f.spreadsheetFilename || f.spreadsheetId}
          </option>
        ))}
      </select>

      {/* Key column selector */}
      <select
        value={data.polarisKeyColumn || ''}
        onChange={(e) => updateField('polarisKeyColumn', e.target.value)}
        className="w-full text-[10px] bg-violet-100 dark:bg-violet-900 border border-violet-300 dark:border-violet-600 rounded px-1 py-0.5 text-violet-800 dark:text-violet-200 outline-none mb-1"
        disabled={headers.length === 0}
      >
        <option value="">key column...</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>

      {/* Signal column selector */}
      <select
        value={data.polarisSignalColumn || ''}
        onChange={(e) => updateField('polarisSignalColumn', e.target.value)}
        className="w-full text-[10px] bg-violet-100 dark:bg-violet-900 border border-violet-300 dark:border-violet-600 rounded px-1 py-0.5 text-violet-800 dark:text-violet-200 outline-none mb-1"
        disabled={headers.length === 0}
      >
        <option value="">signal column...</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>

      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-violet-500 dark:text-violet-400" />
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-violet-600/60 dark:text-violet-400/60 truncate" title={data.lastValue}>
          {(() => {
            try {
              const parsed = JSON.parse(data.lastValue);
              const keys = Object.keys(parsed);
              return `${keys.length} groups`;
            } catch {
              return data.lastValue;
            }
          })()}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-violet-500`} />
    </div>
  );
});
PolarisLookupNode.displayName = 'PolarisLookupNode';
```

- [ ] **Step 2: Register in nodeTypes export**

Update the `nodeTypes` export to include the new node:

```typescript
export const nodeTypes = {
  field_input: FieldInputNode,
  literal_input: LiteralInputNode,
  math_operation: MathOperationNode,
  comparison: ComparisonNode,
  validation: ValidationNode,
  condition: ConditionNode,
  table_column: TableColumnNode,
  table_aggregate: TableAggregateNode,
  table_row_filter: TableRowFilterNode,
  formula: FormulaNode,
  cell_range: CellRangeNode,
  polaris_lookup: PolarisLookupNode,
};
```

- [ ] **Step 3: Expose appStore on window for node access**

The Polaris node needs access to `wizardControle` from the app store. In `frontend/src/store/appStore.ts`, add at the end of the file (after the store creation):

```typescript
// Expose store for rule nodes that need wizard state
(window as any).__appStore = useAppStore;
```

Note: This matches how the `TableAggregateNode` accesses `getEdges/getNodes` — but it uses `useReactFlow` which is React-Flow-scoped. For Zustand store access from a node component, we need a direct reference since nodes render inside ReactFlow's context, not the app's component tree. Alternatively, we can use `useAppStore` directly in the node component since it's a Zustand store hook. Let me revise:

Actually, `useAppStore` is a Zustand hook that works anywhere in the React tree. The node components ARE React components rendered by ReactFlow. So we can just import and use it directly:

Replace the `appStore` approach in the PolarisLookupNode with:

```tsx
import { useAppStore } from '@/store/appStore';

// Inside the component:
  const wizardControle = useAppStore((s) => s.wizardControle);
  const ssFiles = wizardControle?.files?.filter((f) => f.fileType === 'spreadsheet') || [];
```

This means we need to add the import at the top of `RuleNodes.tsx`:

```typescript
import { useAppStore } from '@/store/appStore';
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/rules/RuleNodes.tsx
git commit -m "feat: add PolarisLookupNode component"
```

---

### Task 6: Frontend — Add Polaris to menu and serialization

**Files:**
- Modify: `frontend/src/components/rules/RulesPanel.tsx`
- Modify: `frontend/src/components/rules/serializeGraph.ts`

- [ ] **Step 1: Add Polaris category and menu item to RulesPanel**

Add to `NODE_MENU_ITEMS` array (after the Spreadsheet items, around line 97):

```typescript
  // Polaris
  { type: 'polaris_lookup', label: 'Signal Lookup', category: 'Polaris', icon: <Search className={ICN} /> },
```

Update `CATEGORIES` (line 100):

```typescript
const CATEGORIES = ['Input', 'Math', 'Logic', 'Validate', 'Conditionals', 'Table', 'Spreadsheet', 'Polaris'];
```

Add to `CATEGORY_COLORS` (around line 109):

```typescript
  Polaris: 'text-violet-600 dark:text-violet-400',
```

- [ ] **Step 2: Show Polaris category when spreadsheets are present**

The `visibleCategories` memo (around line 213) already conditionally shows 'Spreadsheet'. Update it to also show 'Polaris':

```typescript
  const visibleCategories = useMemo(() => {
    const hasSpreadsheet = wizardControle?.files.some((f) => f.fileType === "spreadsheet");
    if (hasSpreadsheet) return CATEGORIES;
    return CATEGORIES.filter((c) => c !== 'Spreadsheet' && c !== 'Polaris');
  }, [wizardControle]);
```

- [ ] **Step 3: Add polaris_lookup result syncing**

In the effect that updates node data with results (around line 650), add a block for polaris_lookup nodes:

```typescript
      // Polaris lookup nodes: populate lastValue from computedValues
      if (n.type === 'polaris_lookup') {
        const result = ruleResultMap[n.id];
        if (result?.computed_value !== undefined && result.computed_value !== data.lastValue) {
          patch.lastValue = result.computed_value;
          updated = true;
        }
      }
```

- [ ] **Step 4: Add polaris_lookup to serializeGraph**

In `serializeGraph.ts`, add a new block at the end of the `for (const node of nodes)` loop (before the closing `}`), after the `condition` block:

```typescript
    if (node.type === 'polaris_lookup') {
      const name = getNodeName(data, 'Polaris Lookup');
      const ssId = data.polarisSpreadsheetId || '';
      const keyCol = data.polarisKeyColumn || '';
      const sigCol = data.polarisSignalColumn || '';

      if (!ssId || !keyCol || !sigCol) continue;

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: 'polaris_lookup' as MathOperation,
          operands: [],
          output_label: name,
          polaris_config: {
            spreadsheet_id: ssId,
            key_column: keyCol,
            signal_column: sigCol,
          },
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
      });
    }
```

- [ ] **Step 5: Update operandFromNode for polaris_lookup**

In `serializeGraph.ts`, add to `operandFromNode` (around line 42):

```typescript
  if (node.type === 'polaris_lookup') {
    return { type: 'computed_ref' as const, computed_id: node.id };
  }
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/rules/RulesPanel.tsx frontend/src/components/rules/serializeGraph.ts
git commit -m "feat: add Polaris menu category and graph serialization"
```

---

### Task 7: Frontend — Results display for Polaris lookup

**Files:**
- Modify: `frontend/src/pages/Results.tsx`

- [ ] **Step 1: Add Polaris results rendering**

In `Results.tsx`, find the "Gecombineerd terugkoppelbestand" Card (around line 651). Add a new Card BEFORE it that renders polaris lookup results. The polaris result is in `computedValues` — look for entries whose value is valid JSON with the grouped structure.

Add this block before the terugkoppelbestand Card:

```tsx
      {/* Polaris Signal Lookup Results */}
      {Object.entries(data.computedValues || {}).map(([label, value]) => {
        let parsed: Record<string, { code: string; translation: string }[]> | null = null;
        try {
          const obj = JSON.parse(value);
          // Check if it looks like a polaris result (object with array values containing code+translation)
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            const firstVal = Object.values(obj)[0];
            if (Array.isArray(firstVal) && firstVal.length > 0 && 'code' in firstVal[0] && 'translation' in firstVal[0]) {
              parsed = obj;
            }
          }
        } catch { /* not JSON, skip */ }
        if (!parsed) return null;

        return (
          <Card key={label} className="shadow-sm border-violet-200 dark:border-violet-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="h-5 w-5 text-violet-500" />
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Identifier</TableHead>
                    <TableHead>Signalen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(parsed).map(([key, signals]) => (
                    <TableRow key={key}>
                      <TableCell className="font-mono text-xs font-medium align-top">{key}</TableCell>
                      <TableCell className="text-xs">
                        <ul className="space-y-1">
                          {signals.map((sig, i) => (
                            <li key={i} className="flex gap-2">
                              <code className="bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 px-1 rounded text-[10px] shrink-0">{sig.code}</code>
                              <span className="text-muted-foreground">{sig.translation || <em className="text-amber-500">geen vertaling</em>}</span>
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
```

Make sure `Search` is imported from lucide-react at the top of Results.tsx. Check if it's already imported; if not, add it.

- [ ] **Step 2: Verify computed values are available in Results**

The Results page receives `data.computedValues` from the run result. Check that the `ControleRunResult` type and the run handler pass `computed_values` through. The existing code at `controles.py:152` already includes `computed_values` in the `ExtractionResponse`, and the frontend stores it. The Results page accesses it — verify the exact prop name and add if missing.

Look at how `computedValues` is accessed in Results.tsx and ensure polaris results flow through.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Results.tsx
git commit -m "feat: render Polaris lookup results as grouped table in Results page"
```

---

### Task 8: Seed translation rules and integration test

**Files:**
- Modify: `backend/services/translation_rules_store.py`

- [ ] **Step 1: Add seed function for demo data**

Add to `translation_rules_store.py`:

```python
def seed_translation_rules_if_empty() -> None:
    """Seed translation rules with demo data if none exist."""
    storage = get_storage()
    if storage.list_translation_rule_ids():
        return  # already have data

    from datetime import datetime, timezone

    demo_rules = [
        {"id": "rule-1", "code": "P0003", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Ingangsdatum functie ligt voor aanvang dienstverband. Graag corrigeren naar de juiste datum of bevestigen dat dit correct is."},
        {"id": "rule-2", "code": "P0012", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Adresgegevens ontbreken. Graag het woonadres invoeren — dit is verplicht voor de loonaangifte."},
        {"id": "rule-3", "code": "P0047", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Geboortedatum is niet ingevuld. Dit is een verplicht veld voor de Belastingdienst. Graag aanvullen."},
        {"id": "rule-4", "code": "P0089", "rapport": "Verwerkingssignalen", "teamId": "polaris", "teamName": "Polaris", "translation": "Parttime percentage is gewijzigd maar contracturen zijn niet aangepast. Graag de contracturen bijwerken naar het nieuwe percentage, of bevestigen dat het huidige rooster klopt."},
        {"id": "rule-5", "code": "BSN ontbreekt", "rapport": "Loonaangifte", "teamId": "polaris", "teamName": "Polaris", "translation": "BSN ontbreekt. Verplicht voor loonaangifte Belastingdienst. Graag aanvullen."},
        {"id": "rule-6", "code": "Saldo ≠ 0 + UitDienst", "rapport": "Reserveringen", "teamId": "polaris", "teamName": "Polaris", "translation": "Medewerker is uit dienst maar heeft nog een openstaand saldo. Graag uitbetalen of bevestigen dat verrekening loopt."},
    ]

    now = datetime.now(timezone.utc)
    for rule_data in demo_rules:
        rule = TranslationRule(
            id=rule_data["id"],
            code=rule_data["code"],
            rapport=rule_data["rapport"],
            teamId=rule_data["teamId"],
            teamName=rule_data["teamName"],
            translation=rule_data["translation"],
            lastModified=now,
        )
        storage.save_translation_rule(rule.id, rule.model_dump_json(indent=2))
```

- [ ] **Step 2: Call seed in the translation rules router**

Update `backend/routers/translation_rules.py`:

```python
from fastapi import APIRouter
from models.schemas import TranslationRule
from services.translation_rules_store import list_translation_rules, seed_translation_rules_if_empty

router = APIRouter(prefix="/translation-rules", tags=["translation-rules"])


@router.get("", response_model=list[TranslationRule])
async def get_all_translation_rules():
    seed_translation_rules_if_empty()
    return list_translation_rules()
```

- [ ] **Step 3: Commit**

```bash
git add backend/services/translation_rules_store.py backend/routers/translation_rules.py
git commit -m "feat: seed translation rules with demo data"
```

---

### Task 9: Manual integration test

- [ ] **Step 1: Start the backend**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -m uvicorn main:app --reload`

- [ ] **Step 2: Verify translation rules endpoint**

Run: `curl http://localhost:8000/translation-rules`

Expected: JSON array with 6 translation rule objects.

- [ ] **Step 3: Start the frontend**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npm run dev`

- [ ] **Step 4: Test the full flow**

1. Open the app, create or edit a controle with a spreadsheet file
2. Go to the Rules tab
3. Click "+ Add Node" — verify "Polaris" tab appears
4. Click "Signal Lookup" — verify the node appears with violet styling
5. Select the spreadsheet, key column, and signal column in the dropdowns
6. Run the controle
7. Verify the Results page shows the grouped Polaris lookup table

- [ ] **Step 5: Verify connectable output**

1. Connect the Polaris node's output handle to a comparison node
2. Run the controle
3. Verify the comparison node receives the JSON string value
