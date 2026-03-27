import { useState, useRef, useCallback, useLayoutEffect } from 'react';
import { useAppStore } from '../store/appStore';
import type { Field, CompareOperator, RuleNodeData } from '../types';
import type { Node, Edge } from '@xyflow/react';

interface Connection {
  id: string;
  fieldA: Field;
  fieldB: Field;
  operator: CompareOperator;
  ownerFieldId: string;
  ruleIndex: number;
}

const OP_OPTIONS: { value: CompareOperator; label: string }[] = [
  { value: 'equals', label: 'is equal to' },
  { value: 'not_equals', label: 'is not equal to' },
  { value: 'less_than', label: 'is less than' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_or_equal', label: 'is at most' },
  { value: 'greater_or_equal', label: 'is at least' },
];

function getOpLabel(op: CompareOperator): string {
  return OP_OPTIONS.find((o) => o.value === op)?.label ?? op;
}

export default function ComparisonFieldsPanel() {
  const fields = useAppStore((s) => s.fields);
  const removeField = useAppStore((s) => s.removeField);
  const canEdit = useAppStore((s) => s.canDrawFields);
  const ruleNodes = useAppStore((s) => s.ruleNodes);
  const ruleEdges = useAppStore((s) => s.ruleEdges);

  const fieldsA = fields.filter((f) => (f.source ?? 'a') === 'a');
  const fieldsB = fields.filter((f) => (f.source ?? 'a') === 'b');

  // Refs for connect-point DOM elements: fieldId -> element
  const connectRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag state for creating connections
  const [dragFrom, setDragFrom] = useState<{ fieldId: string; source: 'a' | 'b' } | null>(null);
  const [dragMouse, setDragMouse] = useState<{ x: number; y: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);

  // Editing an existing connection
  const [editingConn, setEditingConn] = useState<string | null>(null);

  // Operator picker after completing a drag
  const [pendingConnect, setPendingConnect] = useState<{ fromId: string; toId: string } | null>(null);

  // Measured positions (recalc on layout changes)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  const measurePositions = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newPos: Record<string, { x: number; y: number }> = {};
    for (const [id, el] of Object.entries(connectRefs.current)) {
      if (el) {
        const rect = el.getBoundingClientRect();
        newPos[id] = {
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.top + rect.height / 2 - containerRect.top,
        };
      }
    }
    setPositions(newPos);
  }, []);

  useLayoutEffect(() => {
    measurePositions();
  }, [fields, measurePositions]);

  // Derive connections from rule graph (source of truth)
  const connections: Connection[] = [];
  {
    const compNodes = ruleNodes.filter((n) => n.type === 'comparison');
    for (const compNode of compNodes) {
      const data = compNode.data as RuleNodeData;
      const operator = (data.comparisonOperator ?? 'equals') as CompareOperator;

      const edgeA = ruleEdges.find((e) => e.target === compNode.id && e.targetHandle === 'a');
      const edgeB = ruleEdges.find((e) => e.target === compNode.id && e.targetHandle === 'b');
      if (!edgeA || !edgeB) continue;

      const srcNodeA = ruleNodes.find((n) => n.id === edgeA.source);
      const srcNodeB = ruleNodes.find((n) => n.id === edgeB.source);
      if (!srcNodeA || !srcNodeB) continue;
      if (srcNodeA.type !== 'field_input' || srcNodeB.type !== 'field_input') continue;

      const dataA = srcNodeA.data as RuleNodeData;
      const dataB = srcNodeB.data as RuleNodeData;
      const fieldA = fields.find((f) => `field-${f.id}` === srcNodeA.id || f.label === dataA.label);
      const fieldB = fields.find((f) => `field-${f.id}` === srcNodeB.id || f.label === dataB.label);
      if (!fieldA || !fieldB) continue;

      const srcA = fieldA.source ?? 'a';
      const srcB = fieldB.source ?? 'a';
      if (srcA === srcB) continue;

      const isFieldA = srcA === 'a';
      connections.push({
        id: `rg-${compNode.id}`,
        fieldA: isFieldA ? fieldA : fieldB,
        fieldB: isFieldA ? fieldB : fieldA,
        operator,
        ownerFieldId: (isFieldA ? fieldA : fieldB).id,
        ruleIndex: -2, // rule graph node
      });
    }
  }

  // Mouse handlers for drag-to-connect
  const handleConnectMouseDown = (fieldId: string, source: 'a' | 'b', e: React.MouseEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    setDragFrom({ fieldId, source });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragFrom || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDragMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseUp = () => {
    if (dragFrom && hoverTarget) {
      const fromField = fields.find((f) => f.id === dragFrom.fieldId);
      const toField = fields.find((f) => f.id === hoverTarget);
      if (fromField && toField && (fromField.source ?? 'a') !== (toField.source ?? 'a')) {
        setPendingConnect({ fromId: dragFrom.fieldId, toId: hoverTarget });
      }
    }
    setDragFrom(null);
    setDragMouse(null);
    setHoverTarget(null);
  };

  const confirmConnect = (operator: CompareOperator) => {
    if (!pendingConnect) return;
    const fromField = fields.find((f) => f.id === pendingConnect.fromId);
    const toField = fields.find((f) => f.id === pendingConnect.toId);
    if (!fromField || !toField) return;

    // Create comparison node + edges in the rule graph (source of truth)
    const state = useAppStore.getState();
    const fromNodeId = `field-${pendingConnect.fromId}`;
    const toNodeId = `field-${pendingConnect.toId}`;
    const isFromA = (fromField.source ?? 'a') === 'a';
    const compNodeId = crypto.randomUUID();

    const compNode: Node = {
      id: compNodeId,
      type: 'comparison',
      position: { x: 450 + Math.random() * 100, y: 50 + Math.random() * 200 },
      data: {
        label: `${fromField.label} ${operator} ${toField.label}`,
        nodeType: 'comparison',
        comparisonOperator: operator,
      } as RuleNodeData,
    };

    const newEdges: Edge[] = [
      {
        id: `e-${compNodeId}-a`,
        source: isFromA ? fromNodeId : toNodeId,
        target: compNodeId,
        targetHandle: 'a',
        animated: true,
        style: { strokeWidth: 2 },
      },
      {
        id: `e-${compNodeId}-b`,
        source: isFromA ? toNodeId : fromNodeId,
        target: compNodeId,
        targetHandle: 'b',
        animated: true,
        style: { strokeWidth: 2 },
      },
    ];

    state.setRuleNodes([...state.ruleNodes, compNode]);
    state.setRuleEdges([...state.ruleEdges, ...newEdges]);

    setPendingConnect(null);
    setTimeout(measurePositions, 50);
  };

  const handleDeleteConnection = (conn: Connection) => {
    // Remove comparison node from rule graph (source of truth)
    const compNodeId = conn.id.replace(/^rg-/, '');
    const state = useAppStore.getState();
    state.setRuleNodes(state.ruleNodes.filter((n) => n.id !== compNodeId));
    state.setRuleEdges(state.ruleEdges.filter((e) => e.target !== compNodeId && e.source !== compNodeId));
    setEditingConn(null);
    setTimeout(measurePositions, 50);
  };

  const handleChangeOperator = (conn: Connection, newOp: CompareOperator) => {
    // Update comparison node operator in rule graph
    const compNodeId = conn.id.replace(/^rg-/, '');
    const state = useAppStore.getState();
    state.setRuleNodes(state.ruleNodes.map((n) =>
      n.id === compNodeId
        ? { ...n, data: { ...n.data, comparisonOperator: newOp } }
        : n
    ));
  };

  // Build SVG line data
  const svgLines = connections.map((conn) => {
    const posA = positions[conn.fieldA.id];
    const posB = positions[conn.fieldB.id];
    if (!posA || !posB) return null;
    return { conn, x1: posA.x, y1: posA.y, x2: posB.x, y2: posB.y };
  }).filter(Boolean) as Array<{ conn: Connection; x1: number; y1: number; x2: number; y2: number }>;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-y-auto"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onScroll={measurePositions}
    >
      {/* SVG overlay for connection lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5, overflow: 'visible' }}>
        {svgLines.map(({ conn, x1, y1, x2, y2 }) => {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const cpX = Math.abs(x2 - x1) * 0.4;
          const path = `M ${x1} ${y1} C ${x1 + cpX} ${y1}, ${x2 - cpX} ${y2}, ${x2} ${y2}`;
          const isEditing = editingConn === conn.id;
          return (
            <g key={conn.id}>
              {/* Hit area */}
              <path d={path} fill="none" stroke="transparent" strokeWidth={12}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={() => canEdit && setEditingConn(isEditing ? null : conn.id)} />
              {/* Visible line */}
              <path d={path} fill="none"
                stroke={isEditing ? 'rgb(109,40,217)' : 'rgb(139,92,246)'}
                strokeWidth={isEditing ? 2.5 : 1.5} strokeDasharray={isEditing ? undefined : '5 3'} />
              {/* Dots */}
              <circle cx={x1} cy={y1} r={3.5} fill="rgb(139,92,246)" stroke="white" strokeWidth={1.5} />
              <circle cx={x2} cy={y2} r={3.5} fill="rgb(139,92,246)" stroke="white" strokeWidth={1.5} />
              {/* Operator label */}
              <g style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={() => canEdit && setEditingConn(isEditing ? null : conn.id)}>
                <rect x={midX - 36} y={midY - 9} width={72} height={18} rx={9}
                  fill={isEditing ? 'rgb(109,40,217)' : 'rgb(139,92,246)'} />
                <text x={midX} y={midY + 3.5} textAnchor="middle" fill="white"
                  fontSize={8} fontWeight={600} fontFamily="system-ui, sans-serif">
                  {getOpLabel(conn.operator)}
                </text>
              </g>
            </g>
          );
        })}
        {/* Drag preview line */}
        {dragFrom && dragMouse && positions[dragFrom.fieldId] && (
          <line
            x1={positions[dragFrom.fieldId].x} y1={positions[dragFrom.fieldId].y}
            x2={dragMouse.x} y2={dragMouse.y}
            stroke="rgb(139,92,246)" strokeWidth={2} strokeDasharray="4 3" opacity={0.6}
          />
        )}
      </svg>

      {/* Two-column layout */}
      <div className="flex min-h-full">
        {/* Column A */}
        <div className="flex-1 p-1.5 space-y-1.5">
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wide px-1 mb-1">PDF A</div>
          {fieldsA.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-3">Draw fields on PDF A</p>
          ) : fieldsA.map((field) => (
            <FieldCard
              key={field.id} field={field} side="a" canEdit={canEdit}
              connectRef={(el) => { connectRefs.current[field.id] = el; }}
              onRemove={() => removeField(field.id)}
              onConnectStart={(e) => handleConnectMouseDown(field.id, 'a', e)}
              isDragTarget={dragFrom !== null && dragFrom.source !== 'a'}
              isHoverTarget={hoverTarget === field.id}
              onHoverEnter={() => dragFrom && dragFrom.source !== 'a' && setHoverTarget(field.id)}
              onHoverLeave={() => setHoverTarget(null)}
            />
          ))}
        </div>

        {/* Gutter */}
        <div className="w-8 flex-shrink-0" />

        {/* Column B */}
        <div className="flex-1 p-1.5 space-y-1.5">
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide px-1 mb-1">PDF B</div>
          {fieldsB.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-3">Draw fields on PDF B</p>
          ) : fieldsB.map((field) => (
            <FieldCard
              key={field.id} field={field} side="b" canEdit={canEdit}
              connectRef={(el) => { connectRefs.current[field.id] = el; }}
              onRemove={() => removeField(field.id)}
              onConnectStart={(e) => handleConnectMouseDown(field.id, 'b', e)}
              isDragTarget={dragFrom !== null && dragFrom.source !== 'b'}
              isHoverTarget={hoverTarget === field.id}
              onHoverEnter={() => dragFrom && dragFrom.source !== 'b' && setHoverTarget(field.id)}
              onHoverLeave={() => setHoverTarget(null)}
            />
          ))}
        </div>
      </div>

      {/* Connection edit popover */}
      {editingConn && (() => {
        const conn = connections.find((c) => c.id === editingConn);
        if (!conn) return null;
        const posA = positions[conn.fieldA.id];
        const posB = positions[conn.fieldB.id];
        if (!posA || !posB) return null;
        const midY = (posA.y + posB.y) / 2;
        return (
          <div className="absolute left-1/2 -translate-x-1/2 z-20 bg-popover rounded-lg shadow-lg border border-violet-200 dark:border-violet-800 p-2 w-56"
            style={{ top: midY + 16 }}>
            <div className="text-[10px] text-muted-foreground mb-1.5">
              <span className="font-semibold text-blue-700">{conn.fieldA.label}</span>
              {' \u2194 '}
              <span className="font-semibold text-emerald-700">{conn.fieldB.label}</span>
            </div>
            {isRuleConnection(conn) ? (
              <>
                <select
                  value={conn.operator}
                  onChange={(e) => handleChangeOperator(conn, e.target.value as CompareOperator)}
                  className="w-full text-xs border border-border rounded px-2 py-1 mb-1.5"
                >
                  {OP_OPTIONS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <button onClick={() => setEditingConn(null)}
                    className="flex-1 text-[10px] text-muted-foreground hover:text-foreground py-1">
                    Done
                  </button>
                  <button onClick={() => handleDeleteConnection(conn)}
                    className="flex-1 text-[10px] text-red-500 hover:text-red-700 py-1 font-medium">
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground italic mb-1">
                  {getOpLabel(conn.operator)} (via chain step — edit in Fields tab)
                </p>
                <button onClick={() => setEditingConn(null)}
                  className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1">
                  Done
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* Operator picker after drag-to-connect */}
      {pendingConnect && (() => {
        const fromField = fields.find((f) => f.id === pendingConnect.fromId);
        const toField = fields.find((f) => f.id === pendingConnect.toId);
        if (!fromField || !toField) return null;
        return (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setPendingConnect(null)} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-popover rounded-xl shadow-2xl border border-violet-200 dark:border-violet-800 p-3 w-52">
              <p className="text-xs text-foreground mb-2 text-center">
                <span className="font-semibold">{fromField.label}</span>
                {' \u2194 '}
                <span className="font-semibold">{toField.label}</span>
              </p>
              <div className="space-y-1">
                {OP_OPTIONS.map((op) => (
                  <button key={op.value} onClick={() => confirmConnect(op.value)}
                    className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/30 text-foreground hover:text-violet-700 transition-colors">
                    {op.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setPendingConnect(null)}
                className="w-full mt-2 text-[10px] text-muted-foreground hover:text-foreground/70 text-center">
                Cancel
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}

function FieldCard({ field, side, canEdit, connectRef, onRemove, onConnectStart, isDragTarget, isHoverTarget, onHoverEnter, onHoverLeave }: {
  field: Field;
  side: 'a' | 'b';
  canEdit: boolean;
  connectRef: (el: HTMLDivElement | null) => void;
  onRemove: () => void;
  onConnectStart: (e: React.MouseEvent) => void;
  isDragTarget: boolean;
  isHoverTarget: boolean;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}) {
  const isA = side === 'a';
  return (
    <div
      className={`group/card relative rounded-lg border text-[11px] transition-colors ${
        isHoverTarget
          ? 'bg-violet-50 border-violet-300 ring-1 ring-violet-200'
          : isDragTarget
            ? 'border-violet-200 bg-violet-50/30'
            : isA
              ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'
              : 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
      }`}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        {/* Connect point on left for B, layout spacer for A */}
        {!isA && (
          <div
            ref={connectRef}
            onMouseDown={onConnectStart}
            className={`w-3 h-3 rounded-full border-2 flex-shrink-0 cursor-crosshair transition-colors ${
              isHoverTarget ? 'bg-violet-500 border-violet-600' : 'bg-emerald-400 border-emerald-500 hover:bg-violet-400 hover:border-violet-500'
            }`}
            title="Drag to connect"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded text-[8px] font-bold ${
              field.type === 'static' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            }`}>{field.type === 'static' ? 'S' : 'D'}</span>
            <span className="font-medium text-foreground truncate" title={field.label}>{field.label}</span>
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">Page {field.value_region.page}</div>
        </div>
        {/* Connect point on right for A, layout spacer for B */}
        {isA && (
          <div
            ref={connectRef}
            onMouseDown={onConnectStart}
            className={`w-3 h-3 rounded-full border-2 flex-shrink-0 cursor-crosshair transition-colors ${
              isHoverTarget ? 'bg-violet-500 border-violet-600' : 'bg-blue-400 border-blue-500 hover:bg-violet-400 hover:border-violet-500'
            }`}
            title="Drag to connect"
          />
        )}
      </div>
      {/* Delete button on hover */}
      {canEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity"
          title="Remove field"
        >x</button>
      )}
    </div>
  );
}
