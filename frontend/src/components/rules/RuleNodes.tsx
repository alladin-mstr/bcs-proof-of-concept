import { memo, useMemo, useState, useCallback } from 'react';
import { Handle, Position, useReactFlow, useEdges, useNodes, type NodeProps } from '@xyflow/react';
import { useAppStore } from '@/store/appStore';
import type { RuleNodeData, DataType, MathOperation, CompareOperator, AggregateOperation, RowFilterMode } from '../../types';

/* ── shared styles ── */

const HANDLE = '!w-2 !h-2 !border-[1.5px] !border-background';

const DATATYPE_COLORS: Record<DataType, string> = {
  string: 'border-slate-400 bg-slate-50 dark:bg-slate-900',
  number: 'border-blue-400 bg-blue-50 dark:bg-blue-950',
  integer: 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950',
  date: 'border-amber-400 bg-amber-50 dark:bg-amber-950',
  currency: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950',
};

const MATH_LABELS: Record<MathOperation, string> = {
  add: '+', subtract: '-', multiply: '*', divide: '/',
  modulo: '%', abs: 'abs', round: 'round',
  min: 'min', max: 'max', sum: 'Σ', average: 'avg',
};

const COMPARE_LABELS: Record<CompareOperator, string> = {
  less_than: '<', greater_than: '>', equals: '=',
  not_equals: '≠', less_or_equal: '≤', greater_or_equal: '≥',
  contains: '∋', not_contains: '∌', starts_with: 'a…', ends_with: '…z',
  in_array: '∈', not_in_array: '∉',
  matches_regex: '/./',
  is_empty: '∅', is_not_empty: '∅̸',
  date_before: '◁', date_after: '▷', date_between: '◇',
};

/* ── reusable editable name ── */

function EditableName({ id, name, textClass }: { id: string; name?: string; textClass: string }) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name || '');

  const commit = useCallback(() => {
    const val = draft.trim();
    setEditing(false);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, outputLabel: val } } : n
      )
    );
  }, [id, draft, setNodes]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(name || ''); setEditing(false); }
        }}
        placeholder="name..."
        className={`${textClass} bg-transparent border-b border-current/30 outline-none w-full text-center`}
      />
    );
  }

  if (!name) {
    return (
      <div
        className={`${textClass} cursor-text opacity-40 hover:opacity-70 truncate text-center italic text-[9px]`}
        onDoubleClick={() => { setDraft(''); setEditing(true); }}
        title="Double-click to name"
      >
        name...
      </div>
    );
  }

  return (
    <div
      className={`${textClass} cursor-text hover:opacity-70 truncate text-center`}
      onDoubleClick={() => { setDraft(name || ''); setEditing(true); }}
      title="Double-click to rename"
    >
      {name}
    </div>
  );
}

/* ── Field Input ── */

export const FieldInputNode = memo(({ data }: NodeProps & { data: RuleNodeData }) => {
  const dt = data.fieldRef?.resolution ? 'cross-template' : 'local';
  const isTable = data.fieldType === 'table';
  const isSpreadsheet = data.fieldType === 'cell' || data.fieldType === 'cell_range';
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div
      className={`px-2.5 py-1.5 rounded-md border shadow-sm max-w-[180px] relative ${
        isTable
          ? 'border-teal-400 bg-teal-50/50 dark:bg-teal-950/50'
          : isSpreadsheet
            ? 'border-green-400 bg-green-50/50 dark:bg-green-950/50'
            : DATATYPE_COLORS[data.literalDatatype || 'string']
      }`}
      onMouseEnter={() => isTable && data.tablePreview && setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      <div className="text-[8px] uppercase tracking-wider font-semibold text-muted-foreground leading-none mb-0.5 flex items-center gap-1">
        {isTable ? (
          <span className="text-teal-600 dark:text-teal-400">
            Table
            {dt !== 'local' && <span className="text-violet-500 ml-0.5">({dt})</span>}
          </span>
        ) : isSpreadsheet ? (
          <span className="text-green-600 dark:text-green-400">
            Spreadsheet
          </span>
        ) : (
          <>
            Field {dt !== 'local' && <span className="text-violet-500">({dt})</span>}
          </>
        )}
      </div>
      {data.fieldRef?.file_label && (
        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 mb-0.5 rounded text-[9px] font-semibold leading-none max-w-full truncate ${
          isSpreadsheet ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-primary/10 text-primary'
        }`}>
          {isSpreadsheet ? (
            <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M9 4v16M15 4v16M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
            </svg>
          ) : (
            <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          )}
          {data.fieldRef.file_label}
        </div>
      )}
      <div className="text-xs font-medium text-foreground truncate leading-tight">
        {data.fieldRef?.template_name && (
          <span className="text-muted-foreground">{data.fieldRef.template_name} &#9656; </span>
        )}
        {data.label}
      </div>
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-muted-foreground truncate" title={data.lastValue}>= {data.lastValue}</div>
      )}
      {isTable && data.tablePreview && (
        <div className="text-[9px] text-teal-600/70 dark:text-teal-400/70 mt-0.5">
          {(data.tablePreview.length - 1)} rows &middot; {data.tablePreview[0]?.length || 0} cols
        </div>
      )}
      {/* Table preview tooltip */}
      {showPreview && data.tablePreview && (
        <div className="absolute left-full top-0 ml-2 z-50 bg-popover border border-border rounded-md shadow-lg p-2 min-w-[200px] max-w-[360px]">
          <table className="text-[10px] w-full border-collapse">
            <thead>
              <tr>
                {data.tablePreview[0]?.map((h, i) => (
                  <th key={i} className="px-1.5 py-0.5 text-left font-semibold text-muted-foreground border-b border-border truncate max-w-[100px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.tablePreview.slice(1).map((row, ri) => (
                <tr key={ri} className="hover:bg-muted/50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-1.5 py-0.5 text-foreground/80 border-b border-border/50 truncate max-w-[100px]">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data.tablePreview.length > 6 && (
            <div className="text-[9px] text-muted-foreground text-center mt-1">showing first 5 rows...</div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} ${isTable ? '!bg-teal-500' : isSpreadsheet ? '!bg-green-500' : '!bg-primary'}`} />
    </div>
  );
});
FieldInputNode.displayName = 'FieldInputNode';

/* ── Literal Input ── */

export const LiteralInputNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.literalValue || '');

  const commit = useCallback(() => {
    setEditing(false);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, literalValue: draft } } : n
      )
    );
  }, [id, draft, setNodes]);

  return (
    <div className="px-2.5 py-1.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted shadow-sm min-w-[72px]">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-muted-foreground leading-none mb-0.5">
        Const
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(data.literalValue || ''); setEditing(false); }
          }}
          placeholder="value..."
          className="text-xs font-medium text-foreground bg-background border border-border rounded px-1 py-0.5 w-full outline-none"
        />
      ) : (
        <div
          className="text-xs font-medium text-foreground cursor-text hover:bg-background/50 rounded leading-tight"
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
        >
          {data.literalValue || <span className="text-muted-foreground/50 italic text-[10px]">set value</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-muted-foreground`} />
    </div>
  );
});
LiteralInputNode.displayName = 'LiteralInputNode';

/* ── Math Operation ── */

export const MathOperationNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const op = data.mathOperation || 'add';
  const label = MATH_LABELS[op] || op;
  return (
    <div className="px-2.5 py-1.5 rounded-lg border-2 border-blue-500 bg-blue-50/80 dark:bg-blue-950 shadow-sm min-w-[56px] text-center">
      <Handle type="target" position={Position.Left} id="a" style={{ top: '30%' }} className={`${HANDLE} !bg-blue-500`} />
      <Handle type="target" position={Position.Left} id="b" style={{ top: '70%' }} className={`${HANDLE} !bg-blue-500`} />
      <div className="text-[8px] uppercase tracking-wider font-semibold text-blue-500 dark:text-blue-400 leading-none">Math</div>
      <div className="text-base font-bold text-blue-700 dark:text-blue-300 leading-tight">{label}</div>
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-blue-500 dark:text-blue-400" />
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-blue-600/60 dark:text-blue-400/60">= {data.lastValue}</div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-blue-500`} />
    </div>
  );
});
MathOperationNode.displayName = 'MathOperationNode';

/* ── Comparison ── */

export const ComparisonNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const op = data.comparisonOperator || 'equals';
  const label = COMPARE_LABELS[op] || op;
  return (
    <div className="px-2.5 py-1.5 rounded-lg border-2 border-amber-500 bg-amber-50/80 dark:bg-amber-950 shadow-sm min-w-[56px] text-center">
      <Handle type="target" position={Position.Left} id="a" style={{ top: '30%' }} className={`${HANDLE} !bg-amber-500`} />
      <Handle type="target" position={Position.Left} id="b" style={{ top: '70%' }} className={`${HANDLE} !bg-amber-500`} />
      <div className="text-[8px] uppercase tracking-wider font-semibold text-amber-500 dark:text-amber-400 leading-none">Compare</div>
      <div className="text-base font-bold text-amber-700 dark:text-amber-300 leading-tight">{label}</div>
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-amber-500 dark:text-amber-400" />
      {data.lastPassed !== undefined && (
        <div className={`text-[10px] font-medium ${data.lastPassed ? 'text-emerald-600' : 'text-red-600'}`}>
          {data.lastPassed ? 'Pass' : 'Fail'}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-amber-500`} />
    </div>
  );
});
ComparisonNode.displayName = 'ComparisonNode';

/* ── Validation ── */

const RULE_LABELS: Record<string, string> = {
  not_empty: 'Not Empty', empty: 'Empty', exact_match: 'Exact Match', data_type: 'Data Type',
  range: 'Range', one_of: 'One Of', pattern: 'Pattern',
  date_before: 'Before', date_after: 'After', compare_field: 'Compare',
};

export const ValidationNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const ruleType = data.validationRuleType || 'not_empty';
  const defaultLabel = RULE_LABELS[ruleType] || ruleType;
  return (
    <div className="px-2.5 py-1.5 rounded-lg border-2 border-purple-500 bg-purple-50/80 dark:bg-purple-950 shadow-sm min-w-[56px] text-center">
      <Handle type="target" position={Position.Left} className={`${HANDLE} !bg-purple-500`} />
      <div className="text-[8px] uppercase tracking-wider font-semibold text-purple-500 dark:text-purple-400 leading-none">Validate</div>
      <div className="text-xs font-medium text-purple-700 dark:text-purple-300 leading-tight">{defaultLabel}</div>
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-purple-500 dark:text-purple-400" />
      {data.lastPassed !== undefined && (
        <div className={`text-[10px] font-medium ${data.lastPassed ? 'text-emerald-600' : 'text-red-600'}`}>
          {data.lastPassed ? 'Pass' : 'Fail'}
        </div>
      )}
    </div>
  );
});
ValidationNode.displayName = 'ValidationNode';

/* ── Condition (If / Else) ── */

export const ConditionNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => (
  <div className="rounded-lg border-2 border-orange-500 bg-orange-50/80 dark:bg-orange-950 shadow-sm min-w-[72px]">
    {/* Three inputs on left */}
    <div className="border-b border-orange-300/40 dark:border-orange-700/40">
      <div className="relative flex items-center px-2 py-1">
        <Handle type="target" position={Position.Left} id="test" style={{ top: '50%' }} className={`${HANDLE} !bg-orange-500`} />
        <span className="text-[9px] font-semibold text-orange-500 dark:text-orange-400 select-none ml-1">If</span>
      </div>
      <div className="relative flex items-center px-2 py-1 border-t border-orange-300/40 dark:border-orange-700/40">
        <Handle type="target" position={Position.Left} id="true_val" style={{ top: '50%' }} className={`${HANDLE} !bg-emerald-500`} />
        <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 select-none ml-1">True</span>
      </div>
      <div className="relative flex items-center px-2 py-1 border-t border-orange-300/40 dark:border-orange-700/40">
        <Handle type="target" position={Position.Left} id="false_val" style={{ top: '50%' }} className={`${HANDLE} !bg-red-500`} />
        <span className="text-[9px] font-semibold text-red-500 dark:text-red-400 select-none ml-1">False</span>
      </div>
    </div>

    {/* Header + result output */}
    <div className="px-2.5 pt-1 pb-1.5 text-center">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-orange-500 dark:text-orange-400 leading-none">If / Else</div>
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-orange-500 dark:text-orange-400" />
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-orange-600/60 dark:text-orange-400/60">= {data.lastValue}</div>
      )}
    </div>

    {/* Single result output on right */}
    <Handle type="source" position={Position.Right} id="result" className={`${HANDLE} !bg-orange-500`} />
  </div>
));
ConditionNode.displayName = 'ConditionNode';

/* ── Table Column ── */

export const TableColumnNode = memo(({ data }: NodeProps & { data: RuleNodeData }) => {
  const ref = data.tableFieldRef;
  const tableName = ref?.template_name
    ? `${ref.template_name} \u25B8 ${ref.field_label}`
    : ref?.field_label || data.label;
  const colLabel = data.tableColumnLabel || '?';
  const preview = data.lastValue;

  return (
    <div className="px-2.5 py-1.5 rounded-md border-2 border-teal-500 bg-teal-50/80 dark:bg-teal-950 shadow-sm max-w-[180px]">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-teal-600 dark:text-teal-400 leading-none mb-0.5">
        Table Column
      </div>
      <div className="text-[10px] text-muted-foreground truncate leading-tight">{tableName}</div>
      <div className="text-xs font-medium text-teal-700 dark:text-teal-300 truncate leading-tight">{colLabel}</div>
      {preview !== undefined && (
        <div className="text-[10px] text-teal-600/60 dark:text-teal-400/60 truncate">{preview}</div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-teal-500`} />
    </div>
  );
});
TableColumnNode.displayName = 'TableColumnNode';

/* ── Table Aggregate ── */

const AGG_LABELS: Record<AggregateOperation, string> = {
  sum: '\u03A3', average: 'avg', count: '#', min: 'min', max: 'max',
};

export const TableAggregateNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { getEdges, getNodes, setNodes } = useReactFlow();
  const op = data.aggregateOperation || 'sum';
  const label = AGG_LABELS[op] || op;

  // Find the source node to detect if it's a table field_input (needs column picker)
  const edges = getEdges();
  const nodes = getNodes();
  const incomingEdge = edges.find((e) => e.target === id);
  const sourceNode = incomingEdge ? nodes.find((n) => n.id === incomingEdge.source) : undefined;
  const sourceData = sourceNode?.data as RuleNodeData | undefined;
  const isTableSource = sourceNode?.type === 'field_input' && sourceData?.fieldType === 'table';
  const columns: string[] = isTableSource && sourceData?.tablePreview ? sourceData.tablePreview[0] : [];

  const handleColumnChange = useCallback((col: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, selectedColumnLabel: col } } : n
      )
    );
  }, [id, setNodes]);

  return (
    <div className="px-2.5 py-1.5 rounded-lg border-2 border-teal-700 bg-teal-50/80 dark:bg-teal-950 shadow-sm min-w-[56px] text-center">
      <Handle type="target" position={Position.Left} className={`${HANDLE} !bg-teal-700`} />
      <div className="text-[8px] uppercase tracking-wider font-semibold text-teal-700 dark:text-teal-400 leading-none">Aggregate</div>
      <div className="text-base font-bold text-teal-800 dark:text-teal-300 leading-tight">{label}</div>
      {/* Column picker when source is a table field_input */}
      {isTableSource && columns.length > 0 && (
        <select
          value={data.selectedColumnLabel || ''}
          onChange={(e) => handleColumnChange(e.target.value)}
          className="mt-0.5 w-full text-[10px] bg-teal-100 dark:bg-teal-900 border border-teal-300 dark:border-teal-600 rounded px-1 py-0.5 text-teal-800 dark:text-teal-200 outline-none"
        >
          <option value="">select column...</option>
          {columns.map((col) => (
            <option key={col} value={col}>{col}</option>
          ))}
        </select>
      )}
      {isTableSource && columns.length === 0 && !data.selectedColumnLabel && (
        <div className="text-[9px] text-amber-600 mt-0.5">run extraction first</div>
      )}
      {data.selectedColumnLabel && (
        <div className="text-[9px] text-teal-600 dark:text-teal-400 truncate">{data.selectedColumnLabel}</div>
      )}
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-teal-600 dark:text-teal-400" />
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-teal-600/60 dark:text-teal-400/60">= {data.lastValue}</div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-teal-700`} />
    </div>
  );
});
TableAggregateNode.displayName = 'TableAggregateNode';

/* ── Table Row Filter ── */

const ROW_FILTER_LABELS: Record<RowFilterMode, string> = {
  count: 'count', all_pass: 'all?', any_pass: 'any?',
};

export const TableRowFilterNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const mode = data.rowFilterMode || 'count';
  const label = ROW_FILTER_LABELS[mode] || mode;
  return (
    <div className="px-2.5 py-1.5 rounded-lg border-2 border-teal-500 bg-teal-50/80 dark:bg-teal-950 shadow-sm min-w-[72px] text-center"
      style={{ borderColor: 'color-mix(in srgb, var(--color-teal-500) 60%, var(--color-orange-500) 40%)' }}>
      <Handle type="target" position={Position.Left} id="column" style={{ top: '30%' }} className={`${HANDLE} !bg-teal-500`} />
      <Handle type="target" position={Position.Left} id="condition" style={{ top: '70%' }} className={`${HANDLE} !bg-amber-500`} />
      <div className="text-[8px] uppercase tracking-wider font-semibold text-teal-600 dark:text-teal-400 leading-none">Row Filter</div>
      <div className="text-sm font-bold text-teal-700 dark:text-teal-300 leading-tight">{label}</div>
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-teal-600 dark:text-teal-400" />
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-teal-600/60 dark:text-teal-400/60">= {data.lastValue}</div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-teal-600`} />
    </div>
  );
});
TableRowFilterNode.displayName = 'TableRowFilterNode';

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

/* ── Custom Script Node ── */

export const CustomScriptNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { setNodes } = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes();
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
  }, [id, edges, nodes]);

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

/* ── Formula Node (Spreadsheet) ── */

export const FormulaNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.formulaExpression || '');

  const commit = useCallback(() => {
    const val = draft.trim();
    setEditing(false);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, formulaExpression: val } } : n
      )
    );
  }, [id, draft, setNodes]);

  return (
    <div className="px-2.5 py-1.5 rounded-md border shadow-sm max-w-[220px] border-green-400 bg-green-50 dark:bg-green-950/50">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-green-600 dark:text-green-400 leading-none mb-0.5">
        Formula
      </div>
      <Handle type="target" position={Position.Left} className={`${HANDLE} !bg-green-500`} />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(data.formulaExpression || ''); setEditing(false); }
          }}
          placeholder="=SUM(A1:A10)"
          className="text-xs bg-transparent border-b border-green-400/30 outline-none w-full font-mono"
        />
      ) : (
        <div
          className="text-xs font-mono text-foreground truncate cursor-text hover:opacity-70"
          onDoubleClick={() => { setDraft(data.formulaExpression || ''); setEditing(true); }}
          title="Double-click to edit formula"
        >
          {data.formulaExpression || <span className="opacity-40 italic">formula...</span>}
        </div>
      )}
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-green-600/70 dark:text-green-400/70" />
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-muted-foreground truncate" title={data.lastValue}>= {data.lastValue}</div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-green-500`} />
    </div>
  );
});
FormulaNode.displayName = 'FormulaNode';

/* ── Cell Range Node (Spreadsheet) ── */

export const CellRangeNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.rangeExpression || '');

  const commit = useCallback(() => {
    const val = draft.trim();
    setEditing(false);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, rangeExpression: val } } : n
      )
    );
  }, [id, draft, setNodes]);

  return (
    <div className="px-2.5 py-1.5 rounded-md border shadow-sm max-w-[180px] border-green-400 bg-green-50 dark:bg-green-950/50">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-green-600 dark:text-green-400 leading-none mb-0.5">
        Cell Range
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(data.rangeExpression || ''); setEditing(false); }
          }}
          placeholder="B2:B50"
          className="text-xs bg-transparent border-b border-green-400/30 outline-none w-full font-mono"
        />
      ) : (
        <div
          className="text-xs font-mono text-foreground truncate cursor-text hover:opacity-70"
          onDoubleClick={() => { setDraft(data.rangeExpression || ''); setEditing(true); }}
          title="Double-click to edit range"
        >
          {data.rangeExpression || <span className="opacity-40 italic">range...</span>}
        </div>
      )}
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-green-600/70 dark:text-green-400/70" />
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-green-500`} />
    </div>
  );
});
CellRangeNode.displayName = 'CellRangeNode';

/* ── Signal Lookup Node ── */

export const SignalLookupNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { setNodes } = useReactFlow();
  const wizardControle = useAppStore((s) => s.wizardControle);
  const ssFiles = wizardControle?.files?.filter((f) => f.fileType === 'spreadsheet') || [];

  // Get headers for selected spreadsheet
  const selectedFile = ssFiles.find((f) => f.spreadsheetId === data.signalSpreadsheetId);
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
        Signal Lookup
      </div>

      {/* Spreadsheet selector */}
      <select
        value={data.signalSpreadsheetId || ''}
        onChange={(e) => {
          updateField('signalSpreadsheetId', e.target.value);
          updateField('signalKeyColumn', '');
          updateField('signalSignalColumn', '');
        }}
        className="w-full text-[10px] bg-violet-100 dark:bg-violet-900 border border-violet-300 dark:border-violet-600 rounded px-1 py-0.5 text-violet-800 dark:text-violet-200 outline-none mb-1"
      >
        <option value="">spreadsheet...</option>
        {ssFiles.map((f) => (
          <option key={f.spreadsheetId} value={f.spreadsheetId || ''}>
            {f.label || f.spreadsheetFilename || f.spreadsheetId}
          </option>
        ))}
      </select>

      {/* Key column selector */}
      <select
        value={data.signalKeyColumn || ''}
        onChange={(e) => updateField('signalKeyColumn', e.target.value)}
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
        value={data.signalSignalColumn || ''}
        onChange={(e) => updateField('signalSignalColumn', e.target.value)}
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
        <div className="text-[10px] text-violet-600 dark:text-violet-400 mt-0.5">
          {(() => {
            try {
              const parsed = JSON.parse(data.lastValue);
              const entries = Object.entries(parsed);
              const totalSignals = entries.reduce((sum, [, v]) => sum + (v as any[]).length, 0);
              return (
                <div className="space-y-0.5">
                  <div className="font-medium">{entries.length} medewerkers · {totalSignals} signalen</div>
                </div>
              );
            } catch {
              return <span className="truncate">{data.lastValue}</span>;
            }
          })()}
        </div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-violet-500`} />
    </div>
  );
});
SignalLookupNode.displayName = 'SignalLookupNode';

/* ── Global Value Input ── */

export const GlobalValueNode = memo(({ data }: NodeProps & { data: RuleNodeData }) => {
  return (
    <div className="px-2.5 py-1.5 rounded-md border shadow-sm max-w-[180px] border-amber-400 bg-amber-50/50 dark:bg-amber-950/50">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-400 leading-none mb-0.5 flex items-center gap-1">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        Global
      </div>
      {data.groupName && (
        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 mb-0.5 rounded text-[9px] font-semibold leading-none max-w-full truncate bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {data.groupName}
        </div>
      )}
      <div className="text-xs font-medium text-foreground truncate leading-tight">
        {data.label}
      </div>
      {data.globalDataType && (
        <div className="text-[9px] text-muted-foreground">{data.globalDataType}</div>
      )}
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-muted-foreground truncate" title={data.lastValue}>= {data.lastValue}</div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-amber-500`} />
    </div>
  );
});
GlobalValueNode.displayName = 'GlobalValueNode';

/* ── Export ── */

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
  signal_lookup: SignalLookupNode,
  global_value_input: GlobalValueNode,
  custom_script: CustomScriptNode,
};
