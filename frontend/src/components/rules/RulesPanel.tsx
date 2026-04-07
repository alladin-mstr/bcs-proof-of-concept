import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  Panel,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore } from '@/store/appStore';
import { nodeTypes } from './RuleNodes';
import { serializeGraph } from './serializeGraph';
import { listAllTemplateFields, listTestRuns, listControleRuns, updateTemplate as apiUpdateTemplate, type TemplateFieldInfo } from '../../api/client';
import type { RuleNodeData, MathOperation, CompareOperator, AggregateOperation, RowFilterMode, DataType, TestRun, Field } from '../../types';
import {
  Plus, Minus, X, Divide, Sigma, BarChart3, ArrowDownNarrowWide, ArrowUpNarrowWide,
  FlipVertical, RotateCcw,
  Equal, EqualNot, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft,
  GitBranch,
  Ban, TextCursorInput, FileType2, Gauge, Regex,
  Search, SearchX, TextCursor, TextCursorInput as TextEnd,
  ListChecks, ListX, CalendarCheck, CalendarClock, CalendarRange,
  CircleDot, CircleOff,
} from 'lucide-react';

const ICN = "w-3.5 h-3.5";

const NODE_MENU_ITEMS: {
  type: string;
  label: string;
  category: string;
  group?: string;
  icon?: ReactNode;
  defaults?: Partial<RuleNodeData>;
}[] = [
  { type: 'literal_input', label: 'Constant', category: 'Input' },
  { type: 'math_operation', label: 'Add (+)', category: 'Math', icon: <Plus className={ICN} />, defaults: { mathOperation: 'add' } },
  { type: 'math_operation', label: 'Subtract (-)', category: 'Math', icon: <Minus className={ICN} />, defaults: { mathOperation: 'subtract' } },
  { type: 'math_operation', label: 'Multiply (*)', category: 'Math', icon: <X className={ICN} />, defaults: { mathOperation: 'multiply' } },
  { type: 'math_operation', label: 'Divide (/)', category: 'Math', icon: <Divide className={ICN} />, defaults: { mathOperation: 'divide' } },
  { type: 'math_operation', label: 'Sum', category: 'Math', icon: <Sigma className={ICN} />, defaults: { mathOperation: 'sum' } },
  { type: 'math_operation', label: 'Average', category: 'Math', icon: <BarChart3 className={ICN} />, defaults: { mathOperation: 'average' } },
  { type: 'math_operation', label: 'Min', category: 'Math', icon: <ArrowDownNarrowWide className={ICN} />, defaults: { mathOperation: 'min' } },
  { type: 'math_operation', label: 'Max', category: 'Math', icon: <ArrowUpNarrowWide className={ICN} />, defaults: { mathOperation: 'max' } },
  { type: 'math_operation', label: 'Abs', category: 'Math', icon: <FlipVertical className={ICN} />, defaults: { mathOperation: 'abs' } },
  { type: 'math_operation', label: 'Round', category: 'Math', icon: <RotateCcw className={ICN} />, defaults: { mathOperation: 'round' } },
  // Numeric
  { type: 'comparison', label: 'Equals (=)', group: 'Numeric', category: 'Logic', icon: <Equal className={ICN} />, defaults: { comparisonOperator: 'equals' } },
  { type: 'comparison', label: 'Not Equal (≠)', group: 'Numeric', category: 'Logic', icon: <EqualNot className={ICN} />, defaults: { comparisonOperator: 'not_equals' } },
  { type: 'comparison', label: 'Greater (>)', group: 'Numeric', category: 'Logic', icon: <ChevronRight className={ICN} />, defaults: { comparisonOperator: 'greater_than' } },
  { type: 'comparison', label: 'Less (<)', group: 'Numeric', category: 'Logic', icon: <ChevronLeft className={ICN} />, defaults: { comparisonOperator: 'less_than' } },
  { type: 'comparison', label: 'Greater or Equal (≥)', group: 'Numeric', category: 'Logic', icon: <ChevronsRight className={ICN} />, defaults: { comparisonOperator: 'greater_or_equal' } },
  { type: 'comparison', label: 'Less or Equal (≤)', group: 'Numeric', category: 'Logic', icon: <ChevronsLeft className={ICN} />, defaults: { comparisonOperator: 'less_or_equal' } },
  // Text
  { type: 'comparison', label: 'Contains', group: 'Text', category: 'Logic', icon: <Search className={ICN} />, defaults: { comparisonOperator: 'contains' } },
  { type: 'comparison', label: 'Not Contains', group: 'Text', category: 'Logic', icon: <SearchX className={ICN} />, defaults: { comparisonOperator: 'not_contains' } },
  { type: 'comparison', label: 'Starts With', group: 'Text', category: 'Logic', icon: <TextCursor className={ICN} />, defaults: { comparisonOperator: 'starts_with' } },
  { type: 'comparison', label: 'Ends With', group: 'Text', category: 'Logic', icon: <TextEnd className={ICN} />, defaults: { comparisonOperator: 'ends_with' } },
  { type: 'comparison', label: 'Matches Regex', group: 'Text', category: 'Logic', icon: <Regex className={ICN} />, defaults: { comparisonOperator: 'matches_regex' } },
  // List
  { type: 'comparison', label: 'In List', group: 'List', category: 'Logic', icon: <ListChecks className={ICN} />, defaults: { comparisonOperator: 'in_array' } },
  { type: 'comparison', label: 'Not In List', group: 'List', category: 'Logic', icon: <ListX className={ICN} />, defaults: { comparisonOperator: 'not_in_array' } },
  // Presence
  { type: 'comparison', label: 'Is Empty', group: 'Presence', category: 'Logic', icon: <CircleOff className={ICN} />, defaults: { comparisonOperator: 'is_empty' } },
  { type: 'comparison', label: 'Is Not Empty', group: 'Presence', category: 'Logic', icon: <CircleDot className={ICN} />, defaults: { comparisonOperator: 'is_not_empty' } },
  // Date
  { type: 'comparison', label: 'Date Before', group: 'Date', category: 'Logic', icon: <CalendarCheck className={ICN} />, defaults: { comparisonOperator: 'date_before' } },
  { type: 'comparison', label: 'Date After', group: 'Date', category: 'Logic', icon: <CalendarClock className={ICN} />, defaults: { comparisonOperator: 'date_after' } },
  { type: 'comparison', label: 'Date Between', group: 'Date', category: 'Logic', icon: <CalendarRange className={ICN} />, defaults: { comparisonOperator: 'date_between' } },
  { type: 'validation', label: 'Not Empty', category: 'Validate', icon: <Ban className="w-3.5 h-3.5" />, defaults: { validationRuleType: 'not_empty' } },
  { type: 'validation', label: 'Exact Match', category: 'Validate', icon: <TextCursorInput className="w-3.5 h-3.5" />, defaults: { validationRuleType: 'exact_match' } },
  { type: 'validation', label: 'Data Type', category: 'Validate', icon: <FileType2 className="w-3.5 h-3.5" />, defaults: { validationRuleType: 'data_type' } },
  { type: 'validation', label: 'Range', category: 'Validate', icon: <Gauge className="w-3.5 h-3.5" />, defaults: { validationRuleType: 'range' } },
  { type: 'validation', label: 'Pattern', category: 'Validate', icon: <Regex className="w-3.5 h-3.5" />, defaults: { validationRuleType: 'pattern' } },
  // Conditionals
  { type: 'condition', label: 'If / Else', category: 'Conditionals', icon: <GitBranch className={ICN} /> },
  // Table
  { type: 'table_aggregate', label: 'Sum (Σ)', category: 'Table', icon: <Sigma className={ICN} />, defaults: { aggregateOperation: 'sum' as AggregateOperation } },
  { type: 'table_aggregate', label: 'Average', category: 'Table', icon: <BarChart3 className={ICN} />, defaults: { aggregateOperation: 'average' as AggregateOperation } },
  { type: 'table_aggregate', label: 'Count (#)', category: 'Table', icon: <ListChecks className={ICN} />, defaults: { aggregateOperation: 'count' as AggregateOperation } },
  { type: 'table_aggregate', label: 'Min', category: 'Table', icon: <ArrowDownNarrowWide className={ICN} />, defaults: { aggregateOperation: 'min' as AggregateOperation } },
  { type: 'table_aggregate', label: 'Max', category: 'Table', icon: <ArrowUpNarrowWide className={ICN} />, defaults: { aggregateOperation: 'max' as AggregateOperation } },
  { type: 'table_row_filter', label: 'Row Filter (count)', category: 'Table', icon: <Search className={ICN} />, defaults: { rowFilterMode: 'count' as RowFilterMode } },
  { type: 'table_row_filter', label: 'Row Filter (all?)', category: 'Table', icon: <ListChecks className={ICN} />, defaults: { rowFilterMode: 'all_pass' as RowFilterMode } },
  { type: 'table_row_filter', label: 'Row Filter (any?)', category: 'Table', icon: <CircleDot className={ICN} />, defaults: { rowFilterMode: 'any_pass' as RowFilterMode } },
  // Spreadsheet
  { type: 'formula', label: 'Formula', category: 'Spreadsheet', icon: <Sigma className={ICN} />, defaults: { formulaExpression: '' } },
  { type: 'cell_range', label: 'Cell Range', category: 'Spreadsheet', icon: <BarChart3 className={ICN} />, defaults: { rangeExpression: '' } },
];

const CATEGORIES = ['Input', 'Math', 'Logic', 'Validate', 'Conditionals', 'Table', 'Spreadsheet'];

const CATEGORY_COLORS: Record<string, string> = {
  Input: 'text-slate-600 dark:text-slate-400',
  Math: 'text-blue-600 dark:text-blue-400',
  Logic: 'text-amber-600 dark:text-amber-400',
  Validate: 'text-purple-600 dark:text-purple-400',
  Conditionals: 'text-orange-600 dark:text-orange-400',
  Table: 'text-teal-600 dark:text-teal-400',
  Spreadsheet: 'text-green-600 dark:text-green-400',
};

export default function RulesPanel() {
  const fields = useAppStore((s) => s.fields);
  const ruleNodes = useAppStore((s) => s.ruleNodes);
  const ruleEdges = useAppStore((s) => s.ruleEdges);
  const setRuleNodes = useAppStore((s) => s.setRuleNodes);
  const setRuleEdges = useAppStore((s) => s.setRuleEdges);
  const templateRuleResults = useAppStore((s) => s.templateRuleResults);
  const computedValues = useAppStore((s) => s.computedValues);
  const setTemplateRules = useAppStore((s) => s.setTemplateRules);
  const setComputedFields = useAppStore((s) => s.setComputedFields);
  const activeTemplateId = useAppStore((s) => s.activeTemplateId);

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [menuCategory, setMenuCategory] = useState('Input');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [externalTemplates, setExternalTemplates] = useState<TemplateFieldInfo[]>([]);
  const [externalRuns, setExternalRuns] = useState<TestRun[]>([]);
  const savedTestRuns = useAppStore((s) => s.savedTestRuns);
  const setSavedTestRuns = useAppStore((s) => s.setSavedTestRuns);
  const templates = useAppStore((s) => s.templates);

  // Load cross-template data (test runs + controle runs) on mount for table previews
  useEffect(() => {
    Promise.all([
      listTestRuns().catch(() => [] as TestRun[]),
      listControleRuns().catch(() => []),
    ]).then(([testRuns, controleRuns]) => {
      const converted: TestRun[] = controleRuns
        .filter((cr) => cr.entries && cr.entries.length > 0)
        .map((cr) => ({
          id: cr.id,
          pdf_id: '',
          pdf_filename: cr.controleName,
          template_name: cr.controleName,
          template_id: cr.controleId,
          entries: cr.entries,
          created_at: cr.runAt,
        }));
      setSavedTestRuns([...testRuns, ...converted]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-populate field input nodes from template fields
  const fieldNodes = useMemo(() =>
    fields.map((f, i) => {
      const wizardFileId = (f as Field & { _wizardFileId?: string })._wizardFileId;
      const wizardFileLabel = (f as Field & { _wizardFileLabel?: string })._wizardFileLabel;
      return {
        id: `field-${f.id}`,
        type: 'field_input' as const,
        position: { x: 0, y: i * 80 },
        data: {
          label: f.label,
          nodeType: 'field_input' as const,
          fieldRef: {
            field_label: f.label,
            ...(wizardFileId && { file_id: wizardFileId, file_label: wizardFileLabel }),
          },
          literalDatatype: f.detected_datatype || f.value_format || 'string',
          fieldType: f.type,
        } as RuleNodeData,
      };
    }),
    [fields]
  );

  // Sync field nodes — add new fields, remove deleted fields
  // Note: nodes starting with 'field-ss-' are auto-imported spreadsheet columns, not from the fields array
  useEffect(() => {
    const existingFieldNodeIds = new Set(
      ruleNodes.filter(n => n.id.startsWith('field-') && !n.id.startsWith('field-ss-')).map(n => n.id)
    );
    const currentFieldIds = new Set(fieldNodes.map(n => n.id));

    // Add missing field nodes
    const newFieldNodes = fieldNodes.filter(n => !existingFieldNodeIds.has(n.id));
    // Remove stale field nodes (but not spreadsheet column nodes)
    const stalIds = [...existingFieldNodeIds].filter(id => !currentFieldIds.has(id));

    if (newFieldNodes.length > 0 || stalIds.length > 0) {
      setRuleNodes([
        ...ruleNodes.filter(n => !stalIds.includes(n.id)),
        ...newFieldNodes,
      ]);
    }
  }, [fieldNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Serialize React Flow graph → TemplateRule[] whenever nodes or edges change
  useEffect(() => {
    const { rules, computedFields } = serializeGraph(
      ruleNodes,
      ruleEdges,
      activeTemplateId || 'test',
    );
    setTemplateRules(rules);
    setComputedFields(computedFields);
  }, [ruleNodes, ruleEdges, activeTemplateId, setTemplateRules, setComputedFields]);

  const wizardControle = useAppStore((s) => s.wizardControle);
  const spreadsheetColumnsImported = useRef(false);

  const visibleCategories = useMemo(() => {
    const hasSpreadsheet = wizardControle?.files.some((f) => f.fileType === "spreadsheet");
    if (hasSpreadsheet) return CATEGORIES;
    return CATEGORIES.filter((c) => c !== 'Spreadsheet');
  }, [wizardControle]);

  useEffect(() => {
    if (spreadsheetColumnsImported.current || !wizardControle) return;
    const ssFiles = wizardControle.files.filter((f) => f.fileType === "spreadsheet" && f.sheetData);
    if (ssFiles.length === 0) return;

    const existingFieldIds = new Set(
      ruleNodes.filter(n => n.id.startsWith('field-')).map(n => n.id)
    );
    const newNodes: typeof ruleNodes = [];

    for (const file of ssFiles) {
      if (!file.sheetData) continue;
      file.sheetData.headers.forEach((header, colIdx) => {
        const nodeId = `field-ss-${file.id}-col-${colIdx}`;
        if (existingFieldIds.has(nodeId)) return;
        newNodes.push({
          id: nodeId,
          type: 'field_input' as const,
          position: { x: 0, y: (existingFieldIds.size + newNodes.length) * 80 },
          data: {
            label: header,
            nodeType: 'field_input' as const,
            fieldRef: {
              field_label: header,
              file_id: file.id,
              file_label: file.label,
            },
            literalDatatype: 'string',
            fieldType: 'cell_range',
          } as RuleNodeData,
        });
      });
    }

    if (newNodes.length > 0) {
      setRuleNodes([...ruleNodes, ...newNodes]);
      spreadsheetColumnsImported.current = true;
    }
  }, [wizardControle, ruleNodes, setRuleNodes]);

  const templateMode = useAppStore((s) => s.templateMode);

  // Auto-save rule graph to the current template (debounced)
  const storeTemplateRules = useAppStore((s) => s.templateRules);
  const storeComputedFields = useAppStore((s) => s.computedFields);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeCount = useRef(0);
  const lastTemplateId = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTemplateId) { changeCount.current = 0; lastTemplateId.current = null; return; }
    // Reset counter when switching templates
    if (lastTemplateId.current !== activeTemplateId) {
      changeCount.current = 0;
      lastTemplateId.current = activeTemplateId;
      return;
    }
    changeCount.current++;
    // Skip the first change (field-sync after load)
    if (changeCount.current <= 1) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const tpl = templates.find((t) => t.id === activeTemplateId);
      if (!tpl) return;
      apiUpdateTemplate(
        activeTemplateId, tpl.name, fields, templateMode,
        storeTemplateRules, storeComputedFields,
        { nodes: ruleNodes, edges: ruleEdges },
      ).catch(() => {});
    }, 1000);

    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [ruleNodes, ruleEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setRuleNodes(applyNodeChanges(changes, ruleNodes)),
    [ruleNodes, setRuleNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setRuleEdges(applyEdgeChanges(changes, ruleEdges)),
    [ruleEdges, setRuleEdges]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => setRuleEdges(addEdge({
      ...connection,
      animated: true,
      style: { strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    }, ruleEdges)),
    [ruleEdges, setRuleEdges]
  );

  // Restrict condition node's "test" handle to only accept comparison nodes
  const isTableFieldInput = useCallback(
    (node: Node | undefined) => {
      if (!node || node.type !== 'field_input') return false;
      const d = node.data as RuleNodeData;
      // Check explicit fieldType OR detect from value pattern
      return d.fieldType === 'table' || (d.lastValue != null && /^\d+ rows? x \d+ cols?$/.test(d.lastValue));
    }, []
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const src = ruleNodes.find((n) => n.id === connection.source);
      const tgt = ruleNodes.find((n) => n.id === connection.target);

      // Condition node's "test" handle only accepts comparison nodes
      if (connection.targetHandle === 'test') {
        return src?.type === 'comparison';
      }

      // Table column nodes can only connect to table_aggregate or table_row_filter
      if (src?.type === 'table_column') {
        return tgt?.type === 'table_aggregate' || (tgt?.type === 'table_row_filter' && connection.targetHandle === 'column');
      }

      // Table field_input nodes can connect to table_aggregate or table_row_filter (column handle)
      if (isTableFieldInput(src)) {
        if (tgt?.type === 'table_aggregate') return true;
        if (tgt?.type === 'table_row_filter' && connection.targetHandle === 'column') return true;
      }

      // Row filter's "condition" handle only accepts comparison nodes
      if (tgt?.type === 'table_row_filter' && connection.targetHandle === 'condition') {
        return src?.type === 'comparison';
      }

      // Aggregate nodes accept table_column or table field_input
      if (tgt?.type === 'table_aggregate') {
        return src?.type === 'table_column' || isTableFieldInput(src);
      }

      // Cell range output can connect to aggregate, math, or formula nodes
      if (src?.type === 'cell_range') {
        return tgt?.type === 'table_aggregate' || tgt?.type === 'math_operation' || tgt?.type === 'formula';
      }

      return true;
    },
    [ruleNodes, isTableFieldInput]
  );

  // Load external data sources when Input tab is opened
  useEffect(() => {
    if (showAddMenu && menuCategory === 'Input') {
      listAllTemplateFields()
        .then((t) => setExternalTemplates(t.filter((tt) => tt.template_id !== activeTemplateId)))
        .catch(() => {});
      Promise.all([
        listTestRuns().catch(() => [] as TestRun[]),
        listControleRuns().catch(() => []),
      ]).then(([testRuns, controleRuns]) => {
        const converted: TestRun[] = controleRuns
          .filter((cr) => cr.entries && cr.entries.length > 0)
          .map((cr) => ({
            id: cr.id,
            pdf_id: '',
            pdf_filename: cr.controleName,
            template_name: cr.controleName,
            template_id: cr.controleId,
            entries: cr.entries,
            created_at: cr.runAt,
          }));
        setExternalRuns([...testRuns, ...converted]);
      });
    }
  }, [showAddMenu, menuCategory, activeTemplateId]);

  const handleAddNode = (item: typeof NODE_MENU_ITEMS[0]) => {
    const id = crypto.randomUUID();
    const newNode: Node = {
      id,
      type: item.type,
      position: { x: 250 + Math.random() * 100, y: 50 + Math.random() * 200 },
      data: {
        label: item.label,
        nodeType: item.type,
        ...item.defaults,
      } as RuleNodeData,
    };
    setRuleNodes([...ruleNodes, newNode]);
    setShowAddMenu(false);
  };

  // Helper: look up cross-template table data from savedTestRuns
  const getCrossTablePreview = (templateId: string, fieldLabel: string): string[][] | undefined => {
    const run = savedTestRuns.find((r) => r.template_id === templateId);
    if (!run) return undefined;
    const entry = run.entries.find((e) => e.label === fieldLabel);
    if (!entry?.table_data || entry.table_data.length === 0) return undefined;
    const cols = Object.keys(entry.table_data[0]);
    const rows = entry.table_data.slice(0, 5).map((row) => cols.map((c) => row[c] || ''));
    return [cols, ...rows];
  };

  const handleAddExternalField = (
    templateId: string, templateName: string, fieldLabel: string,
    resolution: 'latest_run' | 'specific_run' = 'latest_run', testRunId?: string,
    fieldType?: string,
  ) => {
    const id = crypto.randomUUID();
    // Pre-populate table preview and value from saved test runs
    const tablePreview = fieldType === 'table' ? getCrossTablePreview(templateId, fieldLabel) : undefined;
    const run = savedTestRuns.find((r) => r.template_id === templateId);
    const lastValue = run?.entries.find((e) => e.label === fieldLabel)?.value;
    const newNode: Node = {
      id,
      type: 'field_input',
      position: { x: 250 + Math.random() * 100, y: 50 + Math.random() * 200 },
      data: {
        label: fieldLabel,
        nodeType: 'field_input',
        fieldRef: {
          template_id: templateId,
          template_name: templateName,
          field_label: fieldLabel,
          resolution,
          test_run_id: testRunId,
        },
        fieldType: fieldType as RuleNodeData['fieldType'],
        ...(tablePreview ? { tablePreview } : {}),
        ...(lastValue !== undefined ? { lastValue } : {}),
      } as RuleNodeData,
    };
    setRuleNodes([...ruleNodes, newNode]);
    setShowAddMenu(false);
  };

  const handleAddTableColumn = (
    fieldLabel: string, columnLabel: string, columnId: string,
    templateId?: string, templateName?: string,
  ) => {
    const id = crypto.randomUUID();
    // Pre-populate column preview from saved test runs
    let lastValue: string | undefined;
    if (templateId) {
      const tbl = getCrossTablePreview(templateId, fieldLabel);
      if (tbl && tbl.length > 1) {
        const colIdx = tbl[0].indexOf(columnLabel);
        if (colIdx >= 0) {
          const vals = tbl.slice(1).map((row) => row[colIdx]).filter(Boolean);
          lastValue = `[${vals.join(', ')}${tbl.length > 6 ? ', ...' : ''}]`;
        }
      }
    }
    const newNode: Node = {
      id,
      type: 'table_column',
      position: { x: 250 + Math.random() * 100, y: 50 + Math.random() * 200 },
      data: {
        label: `${fieldLabel} \u25B8 ${columnLabel}`,
        nodeType: 'table_column',
        tableFieldRef: {
          field_label: fieldLabel,
          ...(templateId ? { template_id: templateId, template_name: templateName, resolution: 'latest_run' as const } : {}),
        },
        tableColumnLabel: columnLabel,
        tableColumnId: columnId,
        ...(lastValue !== undefined ? { lastValue } : {}),
      } as RuleNodeData,
    };
    setRuleNodes([...ruleNodes, newNode]);
    setShowAddMenu(false);
  };

  const handleDeleteSelected = () => {
    if (!selectedNodeId) return;
    // Don't delete field input nodes
    if (selectedNodeId.startsWith('field-')) return;
    setRuleNodes(ruleNodes.filter(n => n.id !== selectedNodeId));
    setRuleEdges(ruleEdges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  };

  // Protect field input nodes from keyboard deletion, allow everything else
  const onBeforeDelete = useCallback(
    async ({ nodes: nodesToDelete, edges: edgesToDelete }: { nodes: Node[]; edges: Edge[] }) => {
      // Filter out field input nodes (they're auto-synced from template fields)
      const filteredNodes = nodesToDelete.filter(n => !n.id.startsWith('field-'));
      // Allow if there are deletable nodes or edges
      return filteredNodes.length > 0 || edgesToDelete.length > 0;
    },
    []
  );

  // Remove field nodes from the actual delete (onBeforeDelete only gates, doesn't filter)
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const ids = new Set(deleted.filter(n => !n.id.startsWith('field-')).map(n => n.id));
      if (ids.size === 0) return;
      setRuleNodes(ruleNodes.filter(n => !ids.has(n.id)));
      setRuleEdges(ruleEdges.filter(e => !ids.has(e.source) && !ids.has(e.target)));
    },
    [ruleNodes, ruleEdges, setRuleNodes, setRuleEdges]
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const ids = new Set(deleted.map(e => e.id));
      setRuleEdges(ruleEdges.filter(e => !ids.has(e.id)));
    },
    [ruleEdges, setRuleEdges]
  );

  // Update node data with results after extraction
  const extractionResults = useAppStore((s) => s.extractionResults);

  useEffect(() => {
    const hasLocalResults = !!extractionResults || templateRuleResults.length > 0 || Object.keys(computedValues).length > 0;
    const hasCrossData = savedTestRuns.length > 0;
    if (!hasLocalResults && !hasCrossData) return;

    // Build value lookups from local extraction
    const fieldValues: Record<string, string> = {};
    const tableData: Record<string, string[][]> = {};
    if (extractionResults) {
      for (const r of extractionResults) {
        fieldValues[r.label] = r.value;
        if (r.table_data && r.table_data.length > 0) {
          const cols = Object.keys(r.table_data[0]);
          const rows = r.table_data.slice(0, 5).map((row) => cols.map((c) => row[c] || ''));
          tableData[r.label] = [cols, ...rows];
        }
      }
    }

    // Build cross-template value lookup from saved test runs (use latest per template)
    const crossValues: Record<string, Record<string, string>> = {};
    const crossTableData: Record<string, Record<string, string[][]>> = {};
    for (const run of savedTestRuns) {
      if (run.template_id && !crossValues[run.template_id]) {
        crossValues[run.template_id] = {};
        crossTableData[run.template_id] = {};
        for (const e of run.entries) {
          crossValues[run.template_id][e.label] = e.value;
          if (e.table_data && e.table_data.length > 0) {
            const cols = Object.keys(e.table_data[0]);
            const rows = e.table_data.slice(0, 5).map((row) => cols.map((c) => row[c] || ''));
            crossTableData[run.template_id][e.label] = [cols, ...rows];
          }
        }
      }
    }

    const ruleResultMap: Record<string, TemplateRuleResult> = {};
    for (const r of templateRuleResults) {
      ruleResultMap[r.rule_id] = r;
    }

    const currentNodes = useAppStore.getState().ruleNodes;
    setRuleNodes(currentNodes.map((n) => {
      const data = n.data as RuleNodeData;
      let updated = false;
      const patch: Partial<RuleNodeData> = {};

      // Field input nodes: populate lastValue from extraction results
      if (n.type === 'field_input') {
        if (data.fieldRef?.template_id) {
          // Cross-template field: try to get value from saved test runs
          const tplVals = crossValues[data.fieldRef.template_id];
          const val = tplVals?.[data.fieldRef.field_label];
          if (val !== undefined && val !== data.lastValue) {
            patch.lastValue = val;
            updated = true;
          }
          // Cross-template table preview
          const tplTables = crossTableData[data.fieldRef.template_id];
          const tbl = tplTables?.[data.fieldRef.field_label];
          if (tbl) {
            if (JSON.stringify(tbl) !== JSON.stringify(data.tablePreview)) {
              patch.tablePreview = tbl;
              updated = true;
            }
            if (data.fieldType !== 'table') {
              patch.fieldType = 'table';
              updated = true;
            }
          }
          // Fallback: detect table from value pattern "N rows x N cols"
          const effectiveVal = val ?? data.lastValue;
          if (!tbl && effectiveVal && /^\d+ rows? x \d+ cols?$/.test(effectiveVal) && data.fieldType !== 'table') {
            patch.fieldType = 'table';
            updated = true;
          }
        } else {
          // Local field: get from extraction results
          const val = fieldValues[data.label];
          if (val !== undefined && val !== data.lastValue) {
            patch.lastValue = val;
            updated = true;
          }
          // Table preview data
          const tbl = tableData[data.label];
          if (tbl) {
            patch.tablePreview = tbl;
            updated = true;
          }
        }
      }

      // Table column nodes: show column values preview
      if (n.type === 'table_column') {
        const fieldLabel = data.tableFieldRef?.field_label;
        const colLabel = data.tableColumnLabel;
        const tplId = data.tableFieldRef?.template_id;
        if (fieldLabel && colLabel) {
          // Try local table data first, then cross-template
          let tbl = tableData[fieldLabel];
          if (!tbl && tplId) {
            const tplTables = crossTableData[tplId];
            tbl = tplTables?.[fieldLabel];
          }
          if (tbl && tbl.length > 1) {
            const colIdx = tbl[0].indexOf(colLabel);
            if (colIdx >= 0) {
              const vals = tbl.slice(1).map((row) => row[colIdx]).filter(Boolean);
              const preview = `[${vals.join(', ')}${tbl.length > 6 ? ', ...' : ''}]`;
              if (preview !== data.lastValue) {
                patch.lastValue = preview;
                updated = true;
              }
            }
          }
        }
      }

      // Computation nodes: populate lastValue from computedValues
      if (n.type === 'math_operation' || n.type === 'table_aggregate' || n.type === 'table_row_filter' || n.type === 'condition') {
        const result = ruleResultMap[n.id];
        if (result?.computed_value !== undefined && result.computed_value !== data.lastValue) {
          patch.lastValue = result.computed_value;
          updated = true;
        }
      }

      // Comparison/validation nodes: populate lastPassed
      if (n.type === 'comparison' || n.type === 'validation') {
        const result = ruleResultMap[n.id];
        if (result && result.passed !== data.lastPassed) {
          patch.lastPassed = result.passed;
          updated = true;
        }
      }

      if (!updated) return n;
      return { ...n, data: { ...data, ...patch } };
    }));
  }, [extractionResults, templateRuleResults, computedValues, savedTestRuns]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Rules</h3>
        <div className="flex items-center gap-1">
          {selectedNodeId && !selectedNodeId.startsWith('field-') && (
            <button
              onClick={handleDeleteSelected}
              className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
              title="Delete selected node"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            data-add-node-btn
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Node
          </button>
        </div>
      </div>

      {/* Add Node Menu */}
      {showAddMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
          <div className="fixed right-auto top-auto z-50 w-[28rem] bg-popover border border-border rounded-lg shadow-lg overflow-hidden" style={{ top: (document.querySelector('[data-add-node-btn]') as HTMLElement)?.getBoundingClientRect().bottom ?? 48, right: window.innerWidth - ((document.querySelector('[data-add-node-btn]') as HTMLElement)?.getBoundingClientRect().right ?? 0) }}>
            <div className="flex border-b border-border">
              {visibleCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setMenuCategory(cat)}
                  className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
                    menuCategory === cat
                      ? `bg-muted ${CATEGORY_COLORS[cat]}`
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {menuCategory === 'Input' ? (
                <InputSourceMenu
                  localFields={fields}
                  externalTemplates={externalTemplates}
                  externalRuns={externalRuns}
                  onAddConstant={() => handleAddNode({ type: 'literal_input', label: 'Constant', category: 'Input' })}
                  onAddExternalField={handleAddExternalField}
                  onAddTableColumn={handleAddTableColumn}
                />
              ) : (
                (() => {
                  const items = NODE_MENU_ITEMS.filter((item) => item.category === menuCategory);
                  let lastGroup: string | undefined;
                  return items.map((item, i) => {
                    const showGroupHeader = item.group && item.group !== lastGroup;
                    lastGroup = item.group;
                    return (
                      <div key={i}>
                        {showGroupHeader && (
                          <div className="px-3 pt-2 pb-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{item.group}</span>
                          </div>
                        )}
                        <button
                          onClick={() => handleAddNode(item)}
                          className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors flex items-center gap-2"
                        >
                          {item.icon && <span className={`${CATEGORY_COLORS[item.category]} opacity-70`}>{item.icon}</span>}
                          {item.label}
                        </button>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </>
      )}

      {/* React Flow Canvas */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={ruleNodes}
          edges={ruleEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onBeforeDelete={onBeforeDelete}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          defaultEdgeOptions={{
            animated: true,
            selectable: true,
            style: { strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          }}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
        >
          <Controls
            showInteractive={false}
            className="!bg-background !border-border !shadow-sm"
          />
          <Background gap={16} size={1} color="var(--border)" />
          {ruleNodes.length === 0 && (
            <Panel position="top-center">
              <div className="text-center py-8 px-4">
                <p className="text-muted-foreground text-xs mb-2">
                  No rules yet. Add nodes to build validation and computation rules.
                </p>
                <p className="text-muted-foreground/60 text-[11px]">
                  Connect field inputs to math/comparison nodes, then to outputs or validations.
                </p>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Results Summary (shown after test run) */}
      {templateRuleResults.length > 0 && (
        <div className="border-t border-border px-3 py-2 flex-shrink-0 max-h-32 overflow-y-auto">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Rule Results
          </div>
          {templateRuleResults.map((r) => (
            <div key={r.rule_id} className="flex items-center gap-1.5 py-0.5">
              <span className={`text-[10px] ${r.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                {r.passed ? '✓' : '✗'}
              </span>
              <span className="text-[11px] text-foreground truncate">{r.rule_name}</span>
              {r.computed_value && (
                <span className="text-[11px] text-muted-foreground ml-auto">= {r.computed_value}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Input Source Sub-Menu ---

function InputSourceMenu({
  localFields,
  externalTemplates,
  externalRuns,
  onAddConstant,
  onAddExternalField,
  onAddTableColumn,
}: {
  localFields: Field[];
  externalTemplates: TemplateFieldInfo[];
  externalRuns: TestRun[];
  onAddConstant: () => void;
  onAddExternalField: (templateId: string, templateName: string, fieldLabel: string, resolution?: 'latest_run' | 'specific_run', testRunId?: string, fieldType?: string) => void;
  onAddTableColumn: (fieldLabel: string, columnLabel: string, columnId: string, templateId?: string, templateName?: string) => void;
}) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const tableFields = localFields.filter((f) => f.type === 'table' && f.table_config?.columns.length);

  return (
    <div className="text-xs">
      {/* Constant */}
      <button
        onClick={onAddConstant}
        className="w-full text-left px-3 py-2 text-foreground hover:bg-muted transition-colors flex items-center gap-2"
      >
        <span className="w-5 h-5 rounded bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">
          #
        </span>
        Constant value
      </button>

      {/* Local Table Columns */}
      {tableFields.length > 0 && (
        <>
          <div className="h-px bg-border mx-2 my-1" />
          <div className="px-3 pt-2 pb-1">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Table Columns</span>
          </div>
          {tableFields.map((f) => (
            <div key={f.id}>
              <button
                onClick={() => setExpandedSection(expandedSection === `tbl-${f.id}` ? null : `tbl-${f.id}`)}
                className="w-full text-left px-3 py-1.5 text-foreground hover:bg-muted transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5c-.621 0-1.125.504-1.125 1.125M12 12h7.5c.621 0 1.125.504 1.125 1.125" />
                </svg>
                <span className="flex-1 truncate">{f.label}</span>
                <span className="text-[10px] text-muted-foreground">{f.table_config!.columns.length} cols</span>
                <svg className={`w-3 h-3 text-muted-foreground transition-transform ${expandedSection === `tbl-${f.id}` ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {expandedSection === `tbl-${f.id}` && (
                <div className="pl-8 pr-2 pb-1">
                  {f.table_config!.columns.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => onAddTableColumn(f.label, col.label, col.id)}
                      className="w-full text-left px-2 py-1 text-[11px] text-foreground/80 hover:bg-muted rounded transition-colors flex items-center gap-1.5"
                    >
                      <span className="w-1 h-1 rounded-full bg-teal-400 flex-shrink-0" />
                      <span className="truncate">{col.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <div className="h-px bg-border mx-2 my-1" />

      {/* Other Templates */}
      {externalTemplates.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Other Templates</span>
          </div>
          {externalTemplates.map((t) => (
            <div key={t.template_id}>
              <button
                onClick={() => setExpandedSection(expandedSection === `tpl-${t.template_id}` ? null : `tpl-${t.template_id}`)}
                className="w-full text-left px-3 py-1.5 text-foreground hover:bg-muted transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="flex-1 truncate">{t.template_name}</span>
                <span className="text-[10px] text-muted-foreground">{t.fields.length}</span>
                <svg className={`w-3 h-3 text-muted-foreground transition-transform ${expandedSection === `tpl-${t.template_id}` ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {expandedSection === `tpl-${t.template_id}` && (
                <div className="pl-8 pr-2 pb-1">
                  {t.fields.map((f, i) => (
                    <div key={i}>
                      {f.field_type === 'table' && f.table_columns?.length ? (
                        <>
                          <button
                            onClick={() => setExpandedSection(
                              expandedSection === `tpl-${t.template_id}-tbl-${i}` ? `tpl-${t.template_id}` : `tpl-${t.template_id}-tbl-${i}`
                            )}
                            className="w-full text-left px-2 py-1 text-[11px] text-foreground/80 hover:bg-muted rounded transition-colors flex items-center gap-1.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-sm bg-teal-400 flex-shrink-0" />
                            <span className="truncate flex-1">{f.label}</span>
                            <span className="text-[9px] text-teal-600">table</span>
                            <svg className={`w-2.5 h-2.5 text-muted-foreground transition-transform ${expandedSection === `tpl-${t.template_id}-tbl-${i}` ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          {expandedSection === `tpl-${t.template_id}-tbl-${i}` && (
                            <div className="pl-4 pb-0.5">
                              <button
                                onClick={() => onAddExternalField(t.template_id, t.template_name, f.label, 'latest_run', undefined, 'table')}
                                className="w-full text-left px-2 py-0.5 text-[10px] text-teal-600 hover:bg-muted rounded transition-colors"
                              >
                                + Add whole table reference
                              </button>
                              {f.table_columns!.map((col) => (
                                <button
                                  key={col.id}
                                  onClick={() => onAddTableColumn(f.label, col.label, col.id, t.template_id, t.template_name)}
                                  className="w-full text-left px-2 py-0.5 text-[10px] text-foreground/70 hover:bg-muted rounded transition-colors flex items-center gap-1.5"
                                >
                                  <span className="w-1 h-1 rounded-full bg-teal-400 flex-shrink-0" />
                                  <span className="truncate">{col.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => onAddExternalField(t.template_id, t.template_name, f.label, 'latest_run', undefined, f.field_type)}
                          className="w-full text-left px-2 py-1 text-[11px] text-foreground/80 hover:bg-muted rounded transition-colors flex items-center gap-1.5"
                        >
                          {f.computed ? (
                            <span className="text-[8px] text-emerald-600 font-bold">fx</span>
                          ) : (
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                          )}
                          <span className="truncate">{f.label}</span>
                          {f.datatype && <span className="text-[9px] text-muted-foreground ml-auto">{f.datatype}</span>}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="h-px bg-border mx-2 my-1" />
        </>
      )}

      {/* Saved Runs */}
      {externalRuns.length > 0 && (
        <>
          <div className="px-3 pt-2 pb-1">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Saved Runs</span>
          </div>
          {externalRuns.map((run) => (
            <div key={run.id}>
              <button
                onClick={() => setExpandedSection(expandedSection === `run-${run.id}` ? null : `run-${run.id}`)}
                className="w-full text-left px-3 py-1.5 text-foreground hover:bg-muted transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{run.pdf_filename}</div>
                  <div className="text-[9px] text-muted-foreground">
                    {run.template_name && <span>{run.template_name} - </span>}
                    {new Date(run.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">{run.entries.length}</span>
                <svg className={`w-3 h-3 text-muted-foreground transition-transform ${expandedSection === `run-${run.id}` ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {expandedSection === `run-${run.id}` && (
                <div className="pl-8 pr-2 pb-1">
                  {run.entries.map((entry, i) => (
                    <button
                      key={i}
                      onClick={() => onAddExternalField(
                        run.template_id || run.id, run.template_name || run.pdf_filename,
                        entry.label, 'specific_run', run.id,
                        entry.table_data ? 'table' : undefined,
                      )}
                      className="w-full text-left px-2 py-1 text-[11px] text-foreground/80 hover:bg-muted rounded transition-colors flex items-center gap-1.5"
                    >
                      {entry.status === 'computed' ? (
                        <span className="text-[8px] text-emerald-600 font-bold flex-shrink-0">fx</span>
                      ) : entry.table_data ? (
                        <span className="w-1.5 h-1.5 rounded-sm bg-teal-400 flex-shrink-0" />
                      ) : (
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                      )}
                      <span className="truncate flex-1">{entry.label}</span>
                      <span className="text-[9px] font-mono text-muted-foreground truncate max-w-[80px]">{entry.value || '(empty)'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {externalTemplates.length === 0 && externalRuns.length === 0 && (
        <div className="px-3 py-3 text-center text-muted-foreground text-[11px]">
          No other templates or saved runs yet
        </div>
      )}
    </div>
  );
}
