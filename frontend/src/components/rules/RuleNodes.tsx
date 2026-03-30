import { memo, useState, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
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
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div
      className={`px-2.5 py-1.5 rounded-md border shadow-sm max-w-[180px] relative ${
        isTable
          ? 'border-teal-400 bg-teal-50/50 dark:bg-teal-950/50'
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
        ) : (
          <>
            Field {dt !== 'local' && <span className="text-violet-500">({dt})</span>}
          </>
        )}
      </div>
      {data.fieldRef?.file_label && (
        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 mb-0.5 rounded text-[9px] font-semibold bg-primary/10 text-primary leading-none max-w-full truncate">
          <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
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
      <Handle type="source" position={Position.Right} className={`${HANDLE} ${isTable ? '!bg-teal-500' : '!bg-primary'}`} />
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
  not_empty: 'Not Empty', exact_match: 'Exact Match', data_type: 'Data Type',
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
};
