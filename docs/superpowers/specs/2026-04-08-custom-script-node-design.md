# Custom Script Node — Design Spec

## Overview

Add a "Custom Script" node to the Table category in the rule graph editor. Users write JavaScript that receives table/spreadsheet data and returns a computed value. Execution is client-side only via `new Function()`.

## Node Type

- **Type key:** `custom_script`
- **Category:** Table
- **Menu icon:** `Code` from lucide-react + tooltip "Advanced"

## Data Model

New fields on `RuleNodeData`:

```ts
customScript?: string;        // JS code body
customScriptResult?: string;  // last evaluated result (display only)
```

New addition to `RuleNodeType` union: `"custom_script"`

## Canvas Node (`CustomScriptNode`)

- Teal border (matches Table family), `min-w-[120px]`
- Header: "Custom Script" + small unlock icon (`Lock` lucide icon)
- Body: truncated first line of script (or "double-click to edit" placeholder)
- Editable name via `EditableName`
- `lastValue` display
- **Input handle** (left): accepts table field_input, spreadsheet field_input, table_column, or other computed nodes
- **Output handle** (right): result value

## Modal Editor

Opens on double-click of the node. Contains:

1. **Header** with node name
2. **Available variables** hint bar showing what's available based on connected input:
   - Table input: `rows` (array of objects), `headers` (string[]), `columns` (Record<string, string[]>)
   - Spreadsheet input: `rows` (2D array), `headers` (string[])
   - Column input: `values` (string[])
3. **Textarea** — monospace, ~15 lines, with the script
4. **Run button** — executes the script with current data and shows result below
5. **Result preview** area
6. **Save & Close button**

## Execution

```ts
// Table source
const fn = new Function('rows', 'headers', 'columns', script);
const result = fn(rows, headers, columns);

// Spreadsheet source  
const fn = new Function('rows', 'headers', script);
const result = fn(rows, headers);

// Column source
const fn = new Function('values', script);
const result = fn(values);
```

Result is JSON.stringify'd if object/array, or toString'd if primitive, stored as `customScriptResult` and `lastValue`.

## Menu Entry

In `NODE_MENU_ITEMS` under Table category:
```ts
{ type: 'custom_script', label: 'Custom Script', category: 'Table', 
  icon: <Code className={ICN} />, defaults: { customScript: '' } }
```

With a small "Advanced" tooltip/badge after the label (unlock icon).

## Serialization (`serializeGraph.ts`)

Serializes as a computation rule:
```ts
{
  id: node.id,
  name: getNodeName(data, 'script(...)'),
  type: 'computation',
  enabled: true,
  computation: {
    operation: 'custom_script' as MathOperation,
    operands: [operandFromNode(src)],  // connected input
    output_label: name,
    output_datatype: data.outputDatatype,
  },
}
```

Also registers as a computed field. The `operandFromNode` function returns `computed_ref` for `custom_script` nodes.

## Connection Validation

`custom_script` nodes accept connections from:
- `field_input` (table or spreadsheet types)
- `table_column`
- Any computed node

## Files to Modify

1. `frontend/src/types/index.ts` — add `custom_script` to `RuleNodeType`, add fields to `RuleNodeData`
2. `frontend/src/components/rules/RuleNodes.tsx` — add `CustomScriptNode` component + modal, register in `nodeTypes`
3. `frontend/src/components/rules/RulesPanel.tsx` — add menu item, import `Code` icon, add to `handleAddNode`
4. `frontend/src/components/rules/serializeGraph.ts` — add serialization case for `custom_script`
