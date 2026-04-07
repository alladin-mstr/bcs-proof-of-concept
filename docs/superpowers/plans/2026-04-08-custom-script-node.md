# Custom Script Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Custom Script" node to the Table category that lets users write JavaScript to manipulate table/spreadsheet data client-side.

**Architecture:** New `custom_script` node type with a modal code editor. The node accepts table/spreadsheet/column inputs, executes JS via `new Function()` client-side, and outputs the result as a computed field. Follows existing node patterns (teal Table styling, EditableName, Handle layout).

**Tech Stack:** React, @xyflow/react, lucide-react, TypeScript

---

### Task 1: Add types

**Files:**
- Modify: `frontend/src/types/index.ts:118` (RuleNodeType union)
- Modify: `frontend/src/types/index.ts:128-170` (RuleNodeData interface)

- [ ] **Step 1: Add `custom_script` to `RuleNodeType` union**

In `frontend/src/types/index.ts`, change line 118:

```ts
// OLD:
export type RuleNodeType = "field_input" | "literal_input" | "math_operation" | "comparison" | "validation" | "condition" | "table_column" | "table_aggregate" | "table_row_filter" | "formula" | "cell_range" | "signal_lookup" | "global_value_input";

// NEW:
export type RuleNodeType = "field_input" | "literal_input" | "math_operation" | "comparison" | "validation" | "condition" | "table_column" | "table_aggregate" | "table_row_filter" | "formula" | "cell_range" | "signal_lookup" | "global_value_input" | "custom_script";
```

- [ ] **Step 2: Add custom script fields to `RuleNodeData`**

After `globalDataType` (line ~169), add:

```ts
  // Custom script node
  customScript?: string;
  customScriptResult?: string;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add custom_script type to RuleNodeType and RuleNodeData"
```

---

### Task 2: Create `CustomScriptNode` component + modal

**Files:**
- Modify: `frontend/src/components/rules/RuleNodes.tsx`

- [ ] **Step 1: Add the `CustomScriptModal` component**

After the `TableRowFilterNode` block (after line 456), add the modal component. This is a portal-based modal with a code textarea, variable hints, run button, and result preview:

```tsx
/* ── Custom Script Modal ── */

function CustomScriptModal({
  script,
  onSave,
  onClose,
  inputData,
}: {
  script: string;
  onSave: (script: string) => void;
  onClose: () => void;
  inputData: { type: 'table' | 'spreadsheet' | 'column' | 'none'; rows?: Record<string, string>[]; headers?: string[]; sheetRows?: (string | number | boolean | null)[][]; values?: string[] };
}) {
  const [draft, setDraft] = useState(script);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runScript = useCallback(() => {
    setError(null);
    setResult(null);
    try {
      let res: unknown;
      if (inputData.type === 'table') {
        const rows = inputData.rows || [];
        const headers = inputData.headers || (rows.length > 0 ? Object.keys(rows[0]) : []);
        const columns: Record<string, string[]> = {};
        for (const h of headers) {
          columns[h] = rows.map((r) => r[h] ?? '');
        }
        const fn = new Function('rows', 'headers', 'columns', draft);
        res = fn(rows, headers, columns);
      } else if (inputData.type === 'spreadsheet') {
        const fn = new Function('rows', 'headers', draft);
        res = fn(inputData.sheetRows || [], inputData.headers || []);
      } else if (inputData.type === 'column') {
        const fn = new Function('values', draft);
        res = fn(inputData.values || []);
      } else {
        const fn = new Function(draft);
        res = fn();
      }
      setResult(typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res ?? ''));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [draft, inputData]);

  const variableHints = inputData.type === 'table'
    ? 'rows (object[]), headers (string[]), columns (Record<string, string[]>)'
    : inputData.type === 'spreadsheet'
    ? 'rows (any[][]), headers (string[])'
    : inputData.type === 'column'
    ? 'values (string[])'
    : 'no input connected';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-popover border border-border rounded-lg shadow-xl w-[560px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Custom Script</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">Advanced</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
        </div>

        {/* Variable hints */}
        <div className="px-4 py-2 bg-muted/50 border-b border-border">
          <div className="text-[10px] text-muted-foreground">
            <span className="font-semibold">Available:</span> {variableHints}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 p-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={inputData.type === 'table'
              ? '// Example: return rows.filter(r => Number(r.amount) > 100).length;'
              : inputData.type === 'column'
              ? '// Example: return values.reduce((a, b) => a + Number(b), 0);'
              : '// Write your script here...'}
            spellCheck={false}
            className="w-full h-48 font-mono text-xs bg-background border border-border rounded-md p-3 outline-none resize-y focus:border-teal-400 transition-colors"
          />
        </div>

        {/* Result area */}
        {(result !== null || error) && (
          <div className="px-4 pb-2">
            <div className={`text-xs font-mono p-2 rounded border max-h-24 overflow-auto ${
              error
                ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-400'
                : 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300'
            }`}>
              {error ? `Error: ${error}` : result}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <button
            onClick={runScript}
            className="px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 rounded-md transition-colors"
          >
            &#9654; Run
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { onSave(draft); onClose(); }}
              className="px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-md transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the `CustomScriptNode` component**

Directly after the modal, add the canvas node:

```tsx
/* ── Custom Script Node ── */

export const CustomScriptNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { getEdges, getNodes, setNodes } = useReactFlow();
  const [showModal, setShowModal] = useState(false);

  const handleSave = useCallback((script: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, customScript: script } } : n
      )
    );
  }, [id, setNodes]);

  // Resolve input data from connected source
  const inputData = useMemo(() => {
    const edges = getEdges();
    const nodes = getNodes();
    const inEdge = edges.find((e) => e.target === id);
    const src = inEdge ? nodes.find((n) => n.id === inEdge.source) : undefined;
    if (!src) return { type: 'none' as const };
    const srcData = src.data as RuleNodeData;

    if (src.type === 'field_input' && srcData.fieldType === 'table' && srcData.tablePreview) {
      const headers = srcData.tablePreview[0] || [];
      const rows = srcData.tablePreview.slice(1).map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
        return obj;
      });
      return { type: 'table' as const, rows, headers };
    }

    if (src.type === 'table_column') {
      return { type: 'column' as const, values: [] as string[] };
    }

    // Spreadsheet field_input
    if (src.type === 'field_input' && (srcData.fieldType === 'cell' || srcData.fieldType === 'cell_range')) {
      return { type: 'spreadsheet' as const, sheetRows: [] as (string | number | boolean | null)[][], headers: [] as string[] };
    }

    return { type: 'none' as const };
  }, [id, getEdges, getNodes]);

  const scriptPreview = data.customScript
    ? data.customScript.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'))?.trim().slice(0, 30) || 'script...'
    : null;

  return (
    <>
      <div
        className="px-2.5 py-1.5 rounded-lg border-2 border-teal-600 bg-teal-50/80 dark:bg-teal-950 shadow-sm min-w-[130px] max-w-[200px] cursor-pointer"
        onDoubleClick={() => setShowModal(true)}
      >
        <Handle type="target" position={Position.Left} className={`${HANDLE} !bg-teal-600`} />
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <div className="text-[8px] uppercase tracking-wider font-semibold text-teal-600 dark:text-teal-400 leading-none">
            Custom Script
          </div>
          <svg className="w-3 h-3 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        {scriptPreview ? (
          <div className="text-[10px] font-mono text-foreground/70 truncate" title={data.customScript}>
            {scriptPreview}
          </div>
        ) : (
          <div className="text-[10px] italic text-muted-foreground/50">
            double-click to edit
          </div>
        )}
        <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-teal-600 dark:text-teal-400" />
        {data.lastValue !== undefined && (
          <div className="text-[10px] text-teal-600/60 dark:text-teal-400/60 truncate" title={data.lastValue}>= {data.lastValue}</div>
        )}
        <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-teal-600`} />
      </div>

      {showModal && (
        <CustomScriptModal
          script={data.customScript || ''}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
          inputData={inputData}
        />
      )}
    </>
  );
});
CustomScriptNode.displayName = 'CustomScriptNode';
```

- [ ] **Step 3: Register in `nodeTypes` export**

In the `nodeTypes` object (around line 691), add the new entry:

```ts
// OLD:
  global_value_input: GlobalValueNode,
};

// NEW:
  global_value_input: GlobalValueNode,
  custom_script: CustomScriptNode,
};
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to CustomScriptNode

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/rules/RuleNodes.tsx
git commit -m "feat: add CustomScriptNode component with modal editor"
```

---

### Task 3: Add menu entry and icon import

**Files:**
- Modify: `frontend/src/components/rules/RulesPanel.tsx`

- [ ] **Step 1: Import `Code` icon**

In the lucide-react import (line 24-33), add `Code`:

```ts
// OLD:
  CircleDot, CircleOff,
} from 'lucide-react';

// NEW:
  CircleDot, CircleOff,
  Code,
} from 'lucide-react';
```

- [ ] **Step 2: Add Custom Script to `NODE_MENU_ITEMS`**

After the Row Filter entries (after line 95, before the `// Spreadsheet` comment), add:

```ts
  { type: 'custom_script', label: 'Custom Script', category: 'Table', icon: <Code className={ICN} />, defaults: { customScript: '' } },
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/rules/RulesPanel.tsx
git commit -m "feat: add Custom Script entry to Table node menu"
```

---

### Task 4: Add serialization support

**Files:**
- Modify: `frontend/src/components/rules/serializeGraph.ts`

- [ ] **Step 1: Add `custom_script` to `operandFromNode`**

In the `operandFromNode` function (around line 41-53), add `custom_script` to the computed_ref check:

```ts
// OLD:
  if (node.type === 'math_operation' || node.type === 'comparison' || node.type === 'condition'
    || node.type === 'table_aggregate' || node.type === 'table_row_filter') {
    return { type: 'computed_ref' as const, computed_id: node.id };
  }

// NEW:
  if (node.type === 'math_operation' || node.type === 'comparison' || node.type === 'condition'
    || node.type === 'table_aggregate' || node.type === 'table_row_filter' || node.type === 'custom_script') {
    return { type: 'computed_ref' as const, computed_id: node.id };
  }
```

- [ ] **Step 2: Add serialization block for `custom_script` nodes**

After the `signal_lookup` block (after line 471, before the closing `return`), add:

```ts
    if (node.type === 'custom_script') {
      const src = sourceNode(nodes, edges, node.id);
      const operands: RuleOperand[] = src ? [operandFromNode(src)].filter((op): op is RuleOperand => op !== null) : [];
      const name = getNodeName(data, `script(${(data.customScript || '').split('\n')[0]?.trim().slice(0, 20) || '...'})`);

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: 'custom_script' as MathOperation,
          operands,
          output_label: name,
          output_datatype: data.outputDatatype,
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
        datatype: data.outputDatatype,
      });
    }
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/rules/serializeGraph.ts
git commit -m "feat: serialize custom_script nodes in rule graph"
```

---

### Task 5: Add connection validation

**Files:**
- Modify: `frontend/src/components/rules/RulesPanel.tsx`

- [ ] **Step 1: Add `custom_script` to connection validation**

In `isValidConnection` callback (~line 330), make three changes:

**Change A** — table_column nodes can connect to custom_script (line 341-342):

```ts
// OLD:
      if (src?.type === 'table_column') {
        return tgt?.type === 'table_aggregate' || (tgt?.type === 'table_row_filter' && connection.targetHandle === 'column');
      }

// NEW:
      if (src?.type === 'table_column') {
        return tgt?.type === 'table_aggregate' || tgt?.type === 'custom_script' || (tgt?.type === 'table_row_filter' && connection.targetHandle === 'column');
      }
```

**Change B** — table/spreadsheet field_input nodes can connect to custom_script (line 346-349):

```ts
// OLD:
      if (isTableOrSpreadsheetFieldInput(src)) {
        if (tgt?.type === 'table_aggregate') return true;
        if (tgt?.type === 'table_row_filter' && connection.targetHandle === 'column') return true;
      }

// NEW:
      if (isTableOrSpreadsheetFieldInput(src)) {
        if (tgt?.type === 'table_aggregate') return true;
        if (tgt?.type === 'custom_script') return true;
        if (tgt?.type === 'table_row_filter' && connection.targetHandle === 'column') return true;
      }
```

**Change C** — cell_range output can connect to custom_script (line 362-364):

```ts
// OLD:
      if (src?.type === 'cell_range') {
        return tgt?.type === 'table_aggregate' || tgt?.type === 'math_operation' || tgt?.type === 'formula';
      }

// NEW:
      if (src?.type === 'cell_range') {
        return tgt?.type === 'table_aggregate' || tgt?.type === 'math_operation' || tgt?.type === 'formula' || tgt?.type === 'custom_script';
      }
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/rules/RulesPanel.tsx
git commit -m "feat: allow custom_script in table connection validation"
```

---

### Task 6: Manual smoke test

- [ ] **Step 1: Start dev server**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npm run dev`

- [ ] **Step 2: Verify Custom Script appears in Table menu**

Open the rule editor, click "+ Add Node", select the Table tab. Confirm "Custom Script" appears with a code icon after the Row Filter entries.

- [ ] **Step 3: Add the node and test the modal**

Click "Custom Script" to add it. Double-click the node to open the modal. Verify:
- Variable hints display correctly
- Textarea accepts JS code
- Run button executes and shows result
- Save button updates the node's script preview
- Close button works

- [ ] **Step 4: Test with connected table**

Connect a table field_input to the Custom Script node. Open the modal. Write `return rows.length;` and click Run. Verify the result shows a number.

- [ ] **Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: custom script node for table manipulation"
```
