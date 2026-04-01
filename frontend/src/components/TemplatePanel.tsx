import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../store/appStore';
import {
  createTemplate,
  updateTemplate as apiUpdateTemplate,
  listTemplates,
  deleteTemplate as apiDeleteTemplate,
  testExtraction,
  listTestRuns,
  extractRegion,
} from '../api/client';
import { MousePointer2, BoxSelect, Table2 } from 'lucide-react';
import ComparisonFieldsPanel from './ComparisonFieldsPanel';
import type { TableRow, Field, DataType, TableEndAnchorMode } from '../types';

export default function TemplatePanel({ embedded = false }: { embedded?: boolean } = {}) {
  const fields = useAppStore((s) => s.fields);
  const templates = useAppStore((s) => s.templates);
  const setTemplates = useAppStore((s) => s.setTemplates);
  const loadTemplate = useAppStore((s) => s.loadTemplate);
  const editTemplate = useAppStore((s) => s.editTemplate);
  const activeTemplateId = useAppStore((s) => s.activeTemplateId);
  const pdfId = useAppStore((s) => s.pdfId);
  const pdfIdB = useAppStore((s) => s.pdfIdB);
  const currentPage = useAppStore((s) => s.currentPage);
  const currentPageB = useAppStore((s) => s.currentPageB);
  const pageCount = useAppStore((s) => s.pageCount);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const setExtractionResults = useAppStore((s) => s.setExtractionResults);
  const removeField = useAppStore((s) => s.removeField);
  const updateFieldLabel = useAppStore((s) => s.updateFieldLabel);
  const updateFieldDataType = useAppStore((s) => s.updateFieldDataType);
  const updateFieldExtractionMode = useAppStore((s) => s.updateFieldExtractionMode);
  const editingFieldId = useAppStore((s) => s.editingFieldId);
  const setEditingFieldId = useAppStore((s) => s.setEditingFieldId);
  const templateMode = useAppStore((s) => s.templateMode);
  const setTemplateMode = useAppStore((s) => s.setTemplateMode);

  const [saving, setSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [collapsedPages, setCollapsedPages] = useState<Set<number>>(new Set());
  const [isEditing, setIsEditing] = useState(false); // editing an existing template
  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [comparisonTab, setComparisonTab] = useState<'fields' | 'connections'>('fields');
  const tableWizard = useAppStore((s) => s.tableWizard);
  const startTableWizard = useAppStore((s) => s.startTableWizard);
  const setTableWizardPhase = useAppStore((s) => s.setTableWizardPhase);
  const finishTableWizard = useAppStore((s) => s.finishTableWizard);
  const cancelTableWizard = useAppStore((s) => s.cancelTableWizard);
  const updateTableColumnLabel = useAppStore((s) => s.updateTableColumnLabel);
  const removeTableDivider = useAppStore((s) => s.removeTableDivider);
  const setTableKeyColumn = useAppStore((s) => s.setTableKeyColumn);
  const addField = useAppStore((s) => s.addField);
  const drawTool = useAppStore((s) => s.drawTool);
  const setDrawTool = useAppStore((s) => s.setDrawTool);

  // Table preview: fieldId → extracted table data
  const [tablePreviews, setTablePreviews] = useState<Record<string, TableRow[]>>({});
  const [tablePreviewLoading, setTablePreviewLoading] = useState<string | null>(null);
  const [tableModalFieldId, setTableModalFieldId] = useState<string | null>(null);

  const extractTablePreview = useCallback(async (field: Field) => {
    if (!pdfId || field.type !== 'table' || !field.table_config) return;
    setTablePreviewLoading(field.id);
    try {
      const response = await testExtraction(pdfId, [field]);
      const result = response.results[0];
      if (result?.table_data) {
        setTablePreviews(prev => ({ ...prev, [field.id]: result.table_data! }));
      }
    } catch {
      // Silently fail
    } finally {
      setTablePreviewLoading(null);
    }
  }, [pdfId]);

  // Group fields by page number
  const fieldsByPage = fields.reduce<Record<number, typeof fields>>((acc, f) => {
    const page = f.type === 'table'
      ? f.table_config?.table_region.page ?? f.value_region.page
      : f.value_region.page;
    (acc[page] ??= []).push(f);
    return acc;
  }, {});
  const sortedPages = Object.keys(fieldsByPage).map(Number).sort((a, b) => a - b);

  // Mode logic:
  // - Testing: activeTemplateId set + !isEditing
  // - Editing existing: activeTemplateId set + isEditing
  // - Creating new: activeTemplateId null
  const isTestingMode = activeTemplateId !== null && !isEditing;
  const isEditMode = activeTemplateId !== null && isEditing;
  const isCreateMode = activeTemplateId === null;
  const canEditFields = isCreateMode || isEditMode;
  const activeTemplate = templates.find((t) => t.id === activeTemplateId);
  const setCanDrawFields = useAppStore((s) => s.setCanDrawFields);

  // Sync canDrawFields to store so BboxCanvas knows whether to allow drawing
  useEffect(() => {
    setCanDrawFields(canEditFields);
  }, [canEditFields, setCanDrawFields]);

  const setSavedTestRuns = useAppStore((s) => s.setSavedTestRuns);

  useEffect(() => {
    if (embedded) return;
    listTemplates()
      .then(setTemplates)
      .catch(() => {});
    listTestRuns()
      .then(setSavedTestRuns)
      .catch(() => {});
  }, [setTemplates, setSavedTestRuns, embedded]);

  const templateRules = useAppStore((s) => s.templateRules);
  const computedFields = useAppStore((s) => s.computedFields);
  const setTemplateRuleResults = useAppStore((s) => s.setTemplateRuleResults);
  const setComputedValues = useAppStore((s) => s.setComputedValues);
  const setRightPanelTab = useAppStore((s) => s.setRightPanelTab);
  const ruleNodes = useAppStore((s) => s.ruleNodes);
  const ruleEdges = useAppStore((s) => s.ruleEdges);

  const getRuleGraph = () => ({ nodes: ruleNodes, edges: ruleEdges });

  const handleSaveNew = async () => {
    if (fields.length === 0) return;
    const name = window.prompt('Template name:');
    if (!name || !name.trim()) return;
    setSaving(true);
    try {
      const created = await createTemplate(name.trim(), fields, templateMode, templateRules, computedFields, getRuleGraph());
      const updated = await listTemplates();
      setTemplates(updated);
      loadTemplate(created);
      setIsEditing(false);
    } catch {
      alert('Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!activeTemplateId || fields.length === 0) return;
    const currentName = activeTemplate?.name ?? '';
    const name = window.prompt('Template name:', currentName);
    if (!name || !name.trim()) return;
    setSaving(true);
    try {
      await apiUpdateTemplate(activeTemplateId, name.trim(), fields, templateMode, templateRules, computedFields, getRuleGraph());
      const updated = await listTemplates();
      setTemplates(updated);
      setIsEditing(false);
    } catch {
      alert('Failed to update template.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRules = async () => {
    if (!activeTemplateId || !activeTemplate) return;
    setSaving(true);
    try {
      await apiUpdateTemplate(activeTemplateId, activeTemplate.name, fields, templateMode, templateRules, computedFields, getRuleGraph());
      const updated = await listTemplates();
      setTemplates(updated);
    } catch {
      alert('Failed to save rules.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await apiDeleteTemplate(templateId);
      const updated = await listTemplates();
      setTemplates(updated);
      if (activeTemplateId === templateId) {
        handleExitToCreate();
      }
    } catch {
      alert('Failed to delete template.');
    }
  };

  const handleTest = async () => {
    if (!pdfId || fields.length === 0) return;
    if (templateMode === 'comparison' && !pdfIdB) {
      alert('Please select PDF B for comparison mode.');
      return;
    }
    setIsTesting(true);
    setExtractionResults(null);
    try {
      const response = await testExtraction(
        pdfId, fields,
        templateMode === 'comparison' ? (pdfIdB ?? undefined) : undefined,
        embedded ? [] : templateRules,
        embedded ? [] : computedFields,
      );
      setExtractionResults(response.results);
      if (!embedded) {
        setTemplateRuleResults(response.template_rule_results ?? []);
        setComputedValues(response.computed_values ?? {});
      }
      setRightPanelTab("results");
    } catch {
      alert('Test failed.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleExitToCreate = () => {
    useAppStore.setState({
      activeTemplateId: null,
      fields: [],
      extractionResults: null,
      pendingAnchor: null,
      ruleNodes: [],
      ruleEdges: [],
      templateRules: [],
      computedFields: [],
      templateRuleResults: [],
      computedValues: {},
    });
    setIsEditing(false);
  };

  const handleEditTemplate = (t?: typeof activeTemplate) => {
    const template = t ?? activeTemplate;
    if (!template) return;
    editTemplate(template);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    // Reload the original template to discard changes
    if (activeTemplate) {
      loadTemplate(activeTemplate);
    }
    setIsEditing(false);
  };

  return (
    <>
    <div className={`w-72 border-r border-border flex flex-col bg-background ${embedded ? "max-h-[80vh]" : "max-h-[75vh]"}`}>
      {/* Mode indicator */}
      {!embedded && <div className={`px-4 py-3 border-b flex-shrink-0 ${
        isTestingMode
          ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800'
          : isEditMode
            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
            : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isTestingMode ? 'bg-violet-500' : isEditMode ? 'bg-emerald-500' : 'bg-blue-500'
          }`} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${
            isTestingMode ? 'text-violet-700 dark:text-violet-300' : isEditMode ? 'text-emerald-700 dark:text-emerald-300' : 'text-blue-700 dark:text-blue-300'
          }`}>
            {isTestingMode ? 'Testing Mode' : isEditMode ? 'Editing Template' : 'Create Template'}
          </span>
        </div>
        {(isTestingMode || isEditMode) && activeTemplate && (
          <div className="mt-1.5 flex items-center justify-between">
            <span className={`text-xs font-medium truncate ${
              isTestingMode ? 'text-violet-600 dark:text-violet-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {activeTemplate.name}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {isTestingMode && (
                <button
                  onClick={() => handleEditTemplate()}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 font-medium"
                >
                  Edit
                </button>
              )}
              {isEditMode && (
                <button
                  onClick={handleCancelEdit}
                  className="text-[10px] text-muted-foreground hover:text-foreground font-medium"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleExitToCreate}
                className={`text-[10px] underline ${
                  isTestingMode ? 'text-violet-500 hover:text-violet-700' : 'text-emerald-500 hover:text-emerald-700'
                }`}
              >
                Exit
              </button>
            </div>
          </div>
        )}
        {isCreateMode && (
          <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
            Draw fields on the PDF, add rules, then save
          </p>
        )}
        {isEditMode && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
            Modify fields and rules, then save changes
          </p>
        )}
      </div>}

      {/* Template mode toggle (Single / Comparison) — only in create/edit mode */}
      {canEditFields && !embedded && (
        <div className="p-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Template Mode
          </p>
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              onClick={() => setTemplateMode('single')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                templateMode === 'single'
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Single
            </button>
            <button
              onClick={() => setTemplateMode('comparison')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                templateMode === 'comparison'
                  ? 'bg-violet-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Comparison
            </button>
          </div>
        </div>
      )}

      {/* Fields header + comparison tab switcher */}
      <div className="px-4 py-3 border-b border-border max-h-[90vh] flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Fields
          </h2>
          <span className="text-[10px] text-muted-foreground">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
        </div>
        {templateMode === 'comparison' && (
          <div className="flex mt-2 rounded-lg overflow-hidden border border-border">
            <button
              onClick={() => setComparisonTab('fields')}
              className={`flex-1 py-1 text-[10px] font-medium transition-colors ${
                comparisonTab === 'fields'
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Fields
            </button>
            <button
              onClick={() => setComparisonTab('connections')}
              className={`flex-1 py-1 text-[10px] font-medium transition-colors ${
                comparisonTab === 'connections'
                  ? 'bg-violet-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Connections
            </button>
          </div>
        )}
      </div>

      {/* Table wizard controls */}
      {tableWizard && (
        <div className="px-3 py-2 border-b border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">
              Table Wizard — {tableWizard.phase === 'bounds' ? 'Draw Bounds' : tableWizard.phase === 'dividers' ? 'Place Dividers' : 'Label Columns'}
            </span>
          </div>
          {tableWizard.phase === 'bounds' && (
            <p className="text-[10px] text-violet-600 dark:text-violet-400">Draw the table area on the PDF.</p>
          )}
          {tableWizard.phase === 'dividers' && (
            <>
              <p className="text-[10px] text-violet-600 dark:text-violet-400 mb-1.5">
                Click on the PDF to place column dividers. {tableWizard.columns.length} column{tableWizard.columns.length !== 1 ? 's' : ''} defined.
              </p>
              {tableWizard.columns.length > 1 && (
                <div className="space-y-1 mb-1.5">
                  {tableWizard.columns.slice(1).map((col) => (
                    <div key={col.id} className="flex items-center gap-1 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                      <span className="text-violet-600 dark:text-violet-400">{col.label}</span>
                      <button onClick={() => removeTableDivider(col.id)}
                        className="ml-auto text-red-400 hover:text-red-600 text-[10px]">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <button onClick={async () => {
                  // Auto-extract header text for each column from the first row
                  if (pdfId && tableWizard.tableBounds) {
                    const bounds = tableWizard.tableBounds;
                    const sorted = [...tableWizard.columns].sort((a, b) => a.x - b.x);
                    const tableRight = bounds.x + bounds.width;
                    // Header row: thin strip at top of table (just ~1 line height)
                    const headerHeight = Math.min(bounds.height * 0.08, 0.018);
                    for (let i = 0; i < sorted.length; i++) {
                      const colLeft = sorted[i].x;
                      const colRight = i + 1 < sorted.length ? sorted[i + 1].x : tableRight;
                      try {
                        const text = await extractRegion(pdfId, {
                          page: bounds.page,
                          x: colLeft,
                          y: bounds.y,
                          width: colRight - colLeft,
                          height: headerHeight,
                        });
                        if (text?.trim()) {
                          updateTableColumnLabel(sorted[i].id, text.trim());
                        }
                      } catch { /* keep default label */ }
                    }
                  }
                  setTableWizardPhase('labels');
                }}
                  disabled={tableWizard.columns.length < 2}
                  className="flex-1 py-1 text-[10px] font-medium bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  Done — Label Columns
                </button>
                <button onClick={cancelTableWizard}
                  className="px-2 py-1 text-[10px] font-medium text-muted-foreground bg-muted rounded hover:bg-muted/80">
                  Cancel
                </button>
              </div>
            </>
          )}
          {tableWizard.phase === 'labels' && (
            <>
              <div className="space-y-1.5 mb-2">
                {tableWizard.columns.map((col) => (
                  <div key={col.id} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                    <input
                      value={col.label}
                      onChange={(e) => updateTableColumnLabel(col.id, e.target.value)}
                      className="flex-1 text-[11px] px-1.5 py-0.5 bg-background border border-violet-300 dark:border-violet-700 rounded outline-none focus:ring-1 focus:ring-violet-400"
                      placeholder="Column label"
                    />
                  </div>
                ))}
              </div>
              {/* Key column picker */}
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 mb-1">
                  Key Column <span className="font-normal text-muted-foreground">(always has data — used to merge multiline rows)</span>
                </p>
                <select
                  value={tableWizard.keyColumnId ?? ''}
                  onChange={(e) => setTableKeyColumn(e.target.value || null)}
                  className="w-full text-[11px] px-1.5 py-1 bg-background border border-violet-300 dark:border-violet-700 rounded outline-none focus:ring-1 focus:ring-violet-400"
                >
                  <option value="">None (no merging)</option>
                  {tableWizard.columns.map((col) => (
                    <option key={col.id} value={col.id}>{col.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-1.5">
                <button onClick={async () => {
                  const label = window.prompt('Enter a label for this table field:');
                  if (!label?.trim()) return;
                  const newField: Field = {
                    id: tableWizard.fieldId,
                    label: label.trim(),
                    type: 'table',
                    anchor_mode: 'static',
                    anchors: [],
                    value_region: tableWizard.tableBounds!,
                    rules: [],
                    chain: [],
                    table_config: {
                      table_region: tableWizard.tableBounds!,
                      columns: tableWizard.columns,
                      header_row: true,
                      key_column_id: tableWizard.keyColumnId ?? undefined,
                    },
                  };
                  addField(newField);
                  useAppStore.setState({ tableWizard: null });
                  setExpandedFieldId(newField.id);
                  // Auto-extract preview
                  extractTablePreview(newField);
                }}
                  className="flex-1 py-1 text-[10px] font-medium bg-violet-600 text-white rounded hover:bg-violet-700">
                  Finish
                </button>
                <button onClick={() => setTableWizardPhase('dividers')}
                  className="px-2 py-1 text-[10px] font-medium text-muted-foreground bg-muted rounded hover:bg-muted/80">
                  Back
                </button>
                <button onClick={cancelTableWizard}
                  className="px-2 py-1 text-[10px] font-medium text-red-500 bg-muted rounded hover:bg-red-50">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Drawing tool switcher + Add Table */}
      {canEditFields && !tableWizard && (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex gap-1">
            <button
              onClick={() => setDrawTool('pointer')}
              className={`p-1.5 rounded-md border transition-colors ${
                drawTool === 'pointer'
                  ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700'
                  : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
              }`}
              title="Pointer — click on words to select"
            >
              <MousePointer2 size={14} />
            </button>
            <button
              onClick={() => setDrawTool('draw')}
              className={`p-1.5 rounded-md border transition-colors ${
                drawTool === 'draw'
                  ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700'
                  : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
              }`}
              title="Draw — drag to draw a box"
            >
              <BoxSelect size={14} />
            </button>
            <button
              onClick={() => {
                const fieldId = crypto.randomUUID();
                startTableWizard(fieldId);
              }}
              className="p-1.5 rounded-md border transition-colors bg-muted text-muted-foreground border-border hover:bg-muted/80"
              title="Table — add a table field"
            >
              <Table2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Fields list — connections tab in comparison mode, or normal field list */}
      {templateMode === 'comparison' && comparisonTab === 'connections' ? (
        <ComparisonFieldsPanel />
      ) : (
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {isTestingMode
              ? 'No fields defined.'
              : 'No fields yet. Draw on the PDF to add fields.'}
          </p>
        ) : (
          sortedPages.map((pageNum) => {
            const pageFieldList = fieldsByPage[pageNum];
            const isCollapsed = collapsedPages.has(pageNum);
            const isCurrentPage = pageNum === currentPage;
            return (
              <div key={`page-${pageNum}`}>
                <button
                  onClick={() => {
                    setCollapsedPages((prev) => {
                      const next = new Set(prev);
                      if (next.has(pageNum)) next.delete(pageNum); else next.add(pageNum);
                      return next;
                    });
                  }}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide rounded transition-colors mb-1 ${
                    isCurrentPage
                      ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <svg className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                  <span
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setCurrentPage(pageNum); }}
                  >
                    Page {pageNum}
                  </span>
                  <span className="text-[9px] font-normal opacity-60">({pageFieldList.length})</span>
                </button>
                {!isCollapsed && <div className="space-y-2">{pageFieldList.map((field, i) => (
            <div
              key={field.id}
              className={`group/field rounded-lg text-xs transition-colors cursor-pointer ${
                editingFieldId === field.id
                  ? 'bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-200 dark:ring-indigo-800'
                  : field.value_region.page === currentPage
                    ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800'
                    : 'bg-muted border border-border'
              }`}
              onClick={() => {
                setExpandedFieldId(expandedFieldId === field.id ? null : field.id);
                const fieldPage = field.type === 'table' ? field.table_config?.table_region.page ?? field.value_region.page : field.value_region.page;
                if (fieldPage !== currentPage) setCurrentPage(fieldPage);
              }}
            >
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center justify-center px-1 h-4 rounded text-[10px] font-bold ${
                      field.type === 'table' ? 'bg-violet-100 text-violet-700' :
                      { static: 'bg-blue-100 text-blue-700',
                        single: 'bg-amber-100 text-amber-700',
                        bracket: 'bg-orange-100 text-orange-700',
                        area_value: 'bg-green-100 text-green-700',
                        area_locator: 'bg-green-100 text-green-700',
                        area_bracket: 'bg-green-100 text-green-700',
                      }[field.anchor_mode ?? (field.type === 'dynamic' ? 'single' : 'static')]
                    }`}>
                      {field.type === 'table' ? 'T' : { static: 'S', single: '1', bracket: 'B', area_value: 'AV', area_locator: 'AL', area_bracket: 'AB' }[field.anchor_mode ?? (field.type === 'dynamic' ? 'single' : 'static')]}
                    </span>
                    {renamingFieldId === field.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          if (renameDraft.trim() && renameDraft.trim() !== field.label) {
                            updateFieldLabel(field.id, renameDraft.trim());
                          }
                          setRenamingFieldId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (renameDraft.trim() && renameDraft.trim() !== field.label) {
                              updateFieldLabel(field.id, renameDraft.trim());
                            }
                            setRenamingFieldId(null);
                          }
                          if (e.key === 'Escape') setRenamingFieldId(null);
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-foreground bg-background border border-indigo-300 dark:border-indigo-700 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400 dark:focus:ring-indigo-600 w-full text-xs"
                      />
                    ) : (
                      <span className="font-medium text-foreground truncate">
                        {i + 1}. {field.label}
                      </span>
                    )}
                    {renamingFieldId !== field.id && (field.detected_datatype || field.value_format) && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1 rounded">
                        {field.detected_datatype || field.value_format}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    Page {field.type === 'table' ? field.table_config?.table_region.page : field.value_region.page}
                    {field.type === 'table' && field.table_config && (
                      <span className="ml-1 text-violet-500">
                        | {field.table_config.columns.length} cols
                      </span>
                    )}
                    {field.anchors?.length > 0 && (
                      <span className="ml-1 text-amber-500">
                        | {field.anchors.map(a => `"${a.expected_text}"`).join(' × ')}
                      </span>
                    )}
                    {!field.anchors?.length && field.type === 'dynamic' && field.expected_anchor_text && (
                      <span className="ml-1 text-amber-500">
                        | &quot;{field.expected_anchor_text}&quot;
                      </span>
                    )}
                  </div>
                </div>
                {canEditFields && (
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFieldId(field.id);
                        setRenameDraft(field.label);
                        setRenamingFieldId(field.id);
                      }}
                      className="text-muted-foreground/50 hover:text-indigo-500 transition-colors opacity-0 group-hover/field:opacity-100"
                      title="Edit field"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                      className="text-muted-foreground/50 hover:text-red-500 transition-colors opacity-0 group-hover/field:opacity-100"
                      title="Remove"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              {canEditFields && expandedFieldId === field.id && (
                <div className="px-3 pb-2 border-t border-border pt-1.5" onClick={(e) => e.stopPropagation()}>
                  {/* Table config + preview */}
                  {field.type === 'table' && field.table_config && (
                    <div className="mb-1.5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">Columns</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); extractTablePreview(field); }}
                          disabled={tablePreviewLoading === field.id}
                          className="text-[9px] font-medium text-violet-500 hover:text-violet-700 disabled:opacity-40"
                        >
                          {tablePreviewLoading === field.id ? 'Extracting...' : tablePreviews[field.id] ? '↻ Refresh' : '▶ Extract Preview'}
                        </button>
                      </div>
                      {field.table_config.columns.map((col) => (
                        <div key={col.id} className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                          <span>{col.label}</span>
                          {field.table_config!.key_column_id === col.id && (
                            <span className="text-[9px] bg-violet-100 text-violet-600 px-1 rounded">key</span>
                          )}
                        </div>
                      ))}
                      {/* Table preview */}
                      {tablePreviews[field.id] && (
                        <div className="mt-2 overflow-x-auto rounded border border-violet-200 dark:border-violet-800">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="bg-violet-50 dark:bg-violet-950/30">
                                {field.table_config.columns.map((col) => (
                                  <th key={col.id} className="px-1.5 py-1 text-left font-semibold text-violet-700 dark:text-violet-300 border-b border-violet-200 dark:border-violet-800 whitespace-nowrap">
                                    {col.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tablePreviews[field.id].map((row, rowIdx) => (
                                <tr key={rowIdx} className={rowIdx % 2 === 0 ? '' : 'bg-muted/30'}>
                                  {field.table_config!.columns.map((col) => (
                                    <td key={col.id} className="px-1.5 py-0.5 text-foreground/70 border-b border-border font-mono whitespace-nowrap">
                                      {row[col.label] || <span className="text-muted-foreground">-</span>}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="px-1.5 py-0.5 text-[9px] text-muted-foreground bg-muted/50 border-t border-border flex items-center justify-between">
                            <span>{tablePreviews[field.id].length} row{tablePreviews[field.id].length !== 1 ? 's' : ''} extracted</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setTableModalFieldId(field.id); }}
                              className="text-violet-500 hover:text-violet-700 font-medium"
                              title="Expand table"
                            >
                              ⤢ Expand
                            </button>
                          </div>
                        </div>
                      )}
                      {tablePreviewLoading === field.id && (
                        <div className="mt-2 text-[10px] text-violet-500 animate-pulse">Extracting table data...</div>
                      )}
                    </div>
                  )}
                  {/* End anchor (table fields only) */}
                  {field.type === 'table' && field.table_config && (
                    <div className="mb-1.5">
                      <label className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 block mb-0.5">Table End</label>
                      <select
                        value={field.table_config.end_anchor_mode || 'none'}
                        onChange={(e) => {
                          const mode = e.target.value as TableEndAnchorMode;
                          const state = useAppStore.getState();
                          useAppStore.setState({
                            fields: state.fields.map(f =>
                              f.id === field.id && f.table_config
                                ? { ...f, table_config: { ...f.table_config, end_anchor_mode: mode, end_anchor_text: mode === 'text' ? (f.table_config.end_anchor_text || '') : undefined } }
                                : f
                            ),
                          });
                        }}
                        className="w-full text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-violet-400"
                      >
                        <option value="none">Fixed (drawn bounds)</option>
                        <option value="end_of_page">End of page</option>
                        <option value="text">Text anchor</option>
                      </select>
                      {field.table_config.end_anchor_mode === 'text' && (
                        <input
                          type="text"
                          value={field.table_config.end_anchor_text || ''}
                          placeholder="e.g. Subtotal, Total, etc."
                          onChange={(e) => {
                            const state = useAppStore.getState();
                            useAppStore.setState({
                              fields: state.fields.map(f =>
                                f.id === field.id && f.table_config
                                  ? { ...f, table_config: { ...f.table_config, end_anchor_text: e.target.value } }
                                  : f
                              ),
                            });
                          }}
                          className="mt-1 w-full text-xs bg-background border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-400"
                        />
                      )}
                      {field.table_config.end_anchor_mode === 'end_of_page' && (
                        <p className="text-[9px] text-muted-foreground mt-0.5">Scans from table top to bottom of page</p>
                      )}
                    </div>
                  )}
                  {/* Anchor info */}
                  {(field.anchors?.length > 0) && (
                    <div className="mb-1.5">
                      {field.anchors.map((a) => (
                        <div key={a.id} className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            a.role === 'area_top' || a.role === 'area_bottom' ? 'bg-green-400' :
                            a.role === 'secondary' ? 'bg-orange-400' : 'bg-amber-400'
                          }`} />
                          <span className="text-muted-foreground/70">{a.role}:</span>
                          <span className="truncate">&quot;{a.expected_text}&quot;</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add/change anchor button */}
                  <AnchorTierSelector fieldId={field.id} currentMode={field.anchor_mode ?? (field.type === 'dynamic' ? 'single' : 'static')} tableMode={field.type === 'table'} />
                  {field.type !== 'table' && (
                    <div className="mt-1.5">
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Data Type</label>
                      <select
                        value={field.detected_datatype || 'string'}
                        onChange={(e) => updateFieldDataType(field.id, e.target.value as DataType)}
                        className="w-full text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="integer">Integer</option>
                        <option value="date">Date</option>
                        <option value="currency">Currency</option>
                      </select>
                    </div>
                  )}
                  {field.type !== 'table' && (
                    <div className="mt-1.5">
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Extraction Mode</label>
                      <select
                        value={field.extraction_mode || 'word'}
                        onChange={(e) => updateFieldExtractionMode(field.id, e.target.value as import('../types').ExtractionMode)}
                        className="w-full text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        <option value="strict">Strict (exact box)</option>
                        <option value="word">Word</option>
                        <option value="line">Line</option>
                        <option value="edge">Edge of page</option>
                        <option value="paragraph">Paragraph</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}</div>}
              </div>
            );
          })
        )}
      </div>
      )}

      {/* Bottom actions */}
      {embedded ? (
        <div className="p-3 border-t border-border space-y-2">
          <button
            onClick={handleTest}
            disabled={!pdfId || fields.length === 0 || isTesting}
            className="w-full py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isTesting ? 'Testen...' : 'Test uitvoeren'}
          </button>
        </div>
      ) : isTestingMode ? (
        <div className="p-3 border-t border-border space-y-2">
          <button
            onClick={handleTest}
            disabled={!pdfId || fields.length === 0 || isTesting}
            className="w-full py-2.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isTesting ? 'Testing...' : 'Run Test'}
          </button>
          {(ruleNodes.length > 0 || templateRules.length > 0) && (
            <button
              onClick={handleSaveRules}
              disabled={saving}
              className="w-full py-1.5 text-xs font-medium text-foreground/70 bg-muted rounded-lg hover:bg-muted/80 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Rules'}
            </button>
          )}
          <p className="text-[10px] text-muted-foreground text-center">
            Validates this PDF against template rules
          </p>
        </div>
      ) : (
        <>
          {/* Save / Update button */}
          <div className="p-3 border-t border-border space-y-2">
            {isEditMode ? (
              <>
                <button
                  onClick={handleUpdate}
                  disabled={fields.length === 0 || saving}
                  className="w-full py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Update Template'}
                </button>
                <button
                  onClick={handleSaveNew}
                  disabled={fields.length === 0 || saving}
                  className="w-full py-1.5 text-xs font-medium text-foreground/70 bg-muted rounded-lg hover:bg-muted/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Save as New Template
                </button>
              </>
            ) : (
              <button
                onClick={handleSaveNew}
                disabled={fields.length === 0 || saving}
                className="w-full py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save as Template'}
              </button>
            )}
          </div>

        </>
      )}
    </div>
    {/* Table expand modal */}
    {tableModalFieldId && (() => {
      const modalField = fields.find(f => f.id === tableModalFieldId);
      const modalData = tablePreviews[tableModalFieldId];
      if (!modalField?.table_config || !modalData) return null;
      const cols = modalField.table_config.columns;
      return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setTableModalFieldId(null)}>
          <div className="bg-background rounded-lg shadow-xl border border-border max-w-[90vw] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-violet-100 text-violet-700">T</span>
                <span className="text-sm font-semibold text-foreground">{modalField.label}</span>
                <span className="text-xs text-muted-foreground">{modalData.length} row{modalData.length !== 1 ? 's' : ''} × {cols.length} col{cols.length !== 1 ? 's' : ''}</span>
              </div>
              <button onClick={() => setTableModalFieldId(null)} className="text-muted-foreground hover:text-foreground p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Modal body */}
            <div className="overflow-auto flex-1 p-1">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-violet-50 dark:bg-violet-950/30">
                    <th className="px-3 py-2 text-left font-semibold text-violet-700 dark:text-violet-300 border-b-2 border-violet-200 dark:border-violet-800 whitespace-nowrap text-[10px] text-muted-foreground w-8">#</th>
                    {cols.map((col) => (
                      <th key={col.id} className="px-3 py-2 text-left font-semibold text-violet-700 dark:text-violet-300 border-b-2 border-violet-200 dark:border-violet-800 whitespace-nowrap">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modalData.map((row, rowIdx) => (
                    <tr key={rowIdx} className={`${rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/30'} hover:bg-violet-50/50 dark:hover:bg-violet-950/10`}>
                      <td className="px-3 py-1.5 text-muted-foreground border-b border-border text-[10px]">{rowIdx + 1}</td>
                      {cols.map((col) => (
                        <td key={col.id} className="px-3 py-1.5 text-foreground/80 border-b border-border font-mono whitespace-nowrap">
                          {row[col.label] || <span className="text-muted-foreground">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      );
    })()}
    </>
  );
}

import type { AnchorMode } from '../types';

const ANCHOR_MODES: { mode: AnchorMode; label: string; icon: string; desc: string; tooltip: string }[] = [
  {
    mode: 'static', label: 'Static', icon: '▢',
    desc: 'Fixed position, no anchor',
    tooltip: 'Value is extracted from a fixed rectangle on the page. Use for content that never moves (company name, logo area, headers).',
  },
  {
    mode: 'single', label: 'Single Anchor', icon: '⊕',
    desc: '1 anchor + fixed offset to value',
    tooltip: 'One anchor text (e.g., "Total:") locates itself on the page. The value is extracted at a fixed distance from the anchor.\n\n  [anchor] ──fixed──▶ [value]\n\nIf the anchor shifts, the value follows.',
  },
  {
    mode: 'bracket', label: 'Bracket', icon: '⊞',
    desc: '2 anchors intersect (column × row)',
    tooltip: 'Two anchors form an intersection — one defines the column (e.g., "Amount" header), the other defines the row (e.g., "Regular Pay"). The value is at their crosspoint.\n\n       [Amount]\n          |\n  [Regular Pay] ──┼──▶ $4,200\n\nLike reading a table cell by its column and row headers.',
  },
  {
    mode: 'area_value', label: 'Area Value', icon: '⬚',
    desc: 'All text between two boundaries',
    tooltip: 'Two anchors mark the top and bottom boundaries of a region. Everything between them IS the value — handles variable-length content.\n\n  [Description:]  ← top anchor\n  ┌─────────────┐\n  │ Line 1...   │\n  │ Line 2...   │  ← value = all text here\n  │ Line 3...   │\n  └─────────────┘\n  [Subtotal:]     ← bottom anchor\n\n1 line or 10 lines, it captures all of them.',
  },
  {
    mode: 'area_locator', label: 'Area + Locator', icon: '⬚⊕',
    desc: 'Area boundaries + locator inside',
    tooltip: 'Two anchors define a search area (e.g., "EARNINGS" to "Gross Pay:"). A third anchor locates the value inside that area.\n\n  [EARNINGS]        ← area top\n  ┌───────────────┐\n  │ [Pay:] → $val │  ← locator + value\n  └───────────────┘\n  [Gross Pay:]      ← area bottom\n\nSolves ambiguity when the same label exists in multiple sections.',
  },
  {
    mode: 'area_bracket', label: 'Area + Bracket', icon: '⬚⊞',
    desc: 'Area + column × row inside',
    tooltip: 'Two area anchors scope to a section, then two bracket anchors intersect inside it.\n\n  [DEDUCTIONS]        ← area top\n  ┌──────────────────┐\n  │      [Amount]     │  ← column anchor\n  │         |         │\n  │ [Fed Tax] ─┼─ $747│  ← row anchor × value\n  └──────────────────┘\n  [Total Deductions:]  ← area bottom\n\nThe most precise option — handles duplicate labels across sections AND table cells.',
  },
];

function AnchorTierSelector({ fieldId, currentMode, tableMode }: { fieldId: string; currentMode: AnchorMode; tableMode?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hoveredMode, setHoveredMode] = useState<AnchorMode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const startAnchorWizard = useAppStore((s) => s.startAnchorWizard);
  const anchorWizard = useAppStore((s) => s.anchorWizard);

  const handleRowHover = useCallback((mode: AnchorMode | null, e?: React.MouseEvent) => {
    setHoveredMode(mode);
    if (mode && e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTooltipPos({ top: rect.top, left: rect.right + 8 });
    } else {
      setTooltipPos(null);
    }
  }, []);

  // Don't show selector if wizard is active for this field
  if (anchorWizard?.fieldId === fieldId) {
    const step = anchorWizard.steps[anchorWizard.currentStep];
    return (
      <div className="mb-1.5 p-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-[10px]">
        <p className="text-amber-800 dark:text-amber-300 font-medium">
          Step {anchorWizard.currentStep + 1}/{anchorWizard.steps.length}
        </p>
        <p className="text-amber-600 dark:text-amber-400">{step.prompt}</p>
        <button
          onClick={(e) => { e.stopPropagation(); useAppStore.getState().cancelAnchorWizard(); }}
          className="mt-1 text-amber-700 underline hover:text-amber-900"
        >
          Cancel
        </button>
      </div>
    );
  }

  const handleSelect = (mode: AnchorMode) => {
    setOpen(false);
    setHoveredMode(null);
    setTooltipPos(null);
    // Always clear previous anchors/chain before switching
    const state = useAppStore.getState();
    const field = state.fields.find(f => f.id === fieldId);
    const isTable = field?.type === 'table';
    useAppStore.setState({
      fields: state.fields.map(f =>
        f.id === fieldId
          ? {
              ...f,
              // Preserve type: "table" — only toggle static/dynamic for non-table fields
              type: isTable ? 'table' as const : mode === 'static' ? 'static' as const : 'dynamic' as const,
              anchor_mode: mode, anchors: [], anchor_region: undefined, expected_anchor_text: undefined, chain: [],
            }
          : f
      ),
    });
    if (mode !== 'static') {
      setTimeout(() => startAnchorWizard(fieldId, mode), 0);
    }
  };

  const hoveredInfo = hoveredMode ? ANCHOR_MODES.find(m => m.mode === hoveredMode) : null;

  return (
    <div className="mb-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
      >
        + Anchor
      </button>
      {open && (
        <div ref={dropdownRef} className="mt-1 bg-popover rounded-lg border border-border shadow-lg p-1.5 space-y-0.5">
          {ANCHOR_MODES.filter(m => !tableMode || m.mode === 'static' || m.mode === 'single').map(({ mode, label, icon, desc }) => {
            const isActive = mode === currentMode;
            return (
              <button
                key={mode}
                onClick={() => handleSelect(mode)}
                onMouseEnter={(e) => handleRowHover(mode, e)}
                onMouseLeave={() => handleRowHover(null)}
                className={`w-full text-left px-2 py-1.5 rounded transition-colors flex items-start gap-2 ${
                  isActive ? 'bg-blue-50 dark:bg-blue-950/20 ring-1 ring-blue-200 dark:ring-blue-800' : 'hover:bg-muted'
                }`}
              >
                <span className="text-[13px] leading-none mt-0.5 w-5 text-center flex-shrink-0">{icon}</span>
                <div className="min-w-0">
                  <span className={`text-[11px] font-semibold ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'}`}>{label}</span>
                  <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
                </div>
                {isActive && (
                  <span className="text-[9px] text-blue-500 font-medium ml-auto flex-shrink-0 mt-0.5">current</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {/* Portal tooltip — renders outside sidebar overflow */}
      {hoveredInfo && tooltipPos && createPortal(
        <div
          className="fixed w-60 bg-gray-900 text-white rounded-lg p-3 shadow-xl pointer-events-none"
          style={{ top: tooltipPos.top, left: tooltipPos.left, zIndex: 9999 }}
        >
          <p className="text-[11px] font-semibold mb-1.5">{hoveredInfo.label}</p>
          <pre className="text-[9px] leading-relaxed whitespace-pre-wrap font-mono text-gray-300">{hoveredInfo.tooltip}</pre>
        </div>,
        document.body,
      )}
    </div>
  );
}
