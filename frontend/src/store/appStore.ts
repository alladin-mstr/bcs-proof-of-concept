import { create } from 'zustand';
import type { Field, Template, FieldResult, Region, Rule, ChainStep, LayoutBlock, AnchorMode, AnchorRole, Anchor, TestRun, TableColumn, TableConfig, TemplateRule, ComputedField, TemplateRuleResult, DataType, Controle, ControleFile, WizardTab } from '../types';
import type { Node, Edge } from '@xyflow/react';

interface AppState {
  pdfId: string | null;
  pdfFilename: string | null;
  pageCount: number;
  currentPage: number;
  fields: Field[];
  templates: Template[];
  extractionResults: FieldResult[] | null;
  activeTemplateId: string | null;

  // Drawing mode
  drawMode: "static" | "dynamic";
  // For dynamic fields: tracks the pending anchor while waiting for value draw
  pendingAnchor: { region: Region; expectedText: string } | null;

  // Field edit mode (select a field to move/rename)
  editingFieldId: string | null;

  // Chain edit mode
  chainEditFieldId: string | null;
  // Drawing a search region for a chain step
  drawingRegionForStepId: { fieldId: string; stepId: string } | null;

  // Anchor wizard (guided multi-step anchor drawing)
  anchorWizard: {
    fieldId: string;
    targetMode: AnchorMode;
    currentStep: number;
    steps: { role: AnchorRole; prompt: string }[];
    completedAnchors: Anchor[];
  } | null;

  // Table wizard (guided table field creation)
  tableWizard: {
    fieldId: string;
    phase: 'bounds' | 'dividers' | 'labels';
    tableBounds: Region | null;
    columns: TableColumn[];
    keyColumnId: string | null;
  } | null;

  // Layout overlay
  layoutBlocks: LayoutBlock[];
  showLayoutOverlay: boolean;

  // Whether field drawing/editing is enabled (set by TemplatePanel based on mode)
  canDrawFields: boolean;

  // Comparison mode state
  pdfIdB: string | null;
  pdfFilenameB: string | null;
  pageCountB: number;
  currentPageB: number;
  activeSource: "a" | "b";
  templateMode: "single" | "comparison";

  setPdf: (pdfId: string, pageCount: number, filename?: string) => void;
  clearPdf: () => void;
  addField: (field: Field) => void;
  removeField: (id: string) => void;
  setCurrentPage: (page: number) => void;
  setTemplates: (templates: Template[]) => void;
  loadTemplate: (template: Template) => void;
  setExtractionResults: (results: FieldResult[] | null) => void;
  setDrawMode: (mode: "static" | "dynamic") => void;
  setPendingAnchor: (anchor: { region: Region; expectedText: string } | null) => void;
  editTemplate: (template: Template) => void;
  addRule: (fieldId: string, rule: Rule) => void;
  removeRule: (fieldId: string, ruleIndex: number) => void;

  // Field edit
  setEditingFieldId: (id: string | null) => void;
  updateFieldLabel: (fieldId: string, label: string) => void;
  updateFieldDataType: (fieldId: string, datatype: DataType | undefined) => void;

  // Chain operations
  setChainEditFieldId: (id: string | null) => void;
  addChainStep: (fieldId: string, step: ChainStep, afterIndex?: number) => void;
  removeChainStep: (fieldId: string, stepId: string) => void;
  updateChainStep: (fieldId: string, stepId: string, updates: Partial<ChainStep>) => void;
  reorderChainSteps: (fieldId: string, fromIndex: number, toIndex: number) => void;
  setFieldChain: (fieldId: string, chain: ChainStep[]) => void;
  setDrawingRegionForStepId: (info: { fieldId: string; stepId: string } | null) => void;
  updateFieldRegion: (fieldId: string, regionType: 'value' | 'anchor', region: Region) => void;

  updateRule: (fieldId: string, ruleIndex: number, updates: Partial<Rule>) => void;
  setCanDrawFields: (can: boolean) => void;
  setLayoutBlocks: (blocks: LayoutBlock[]) => void;
  setShowLayoutOverlay: (show: boolean) => void;

  // Anchor wizard actions
  startAnchorWizard: (fieldId: string, targetMode: AnchorMode) => void;
  completeAnchorWizardStep: (region: Region, expectedText: string) => void;
  cancelAnchorWizard: () => void;

  // Table wizard actions
  startTableWizard: (fieldId: string) => void;
  completeTableBounds: (region: Region) => void;
  addTableDivider: (x: number) => void;
  removeTableDivider: (columnId: string) => void;
  updateTableDividerX: (columnId: string, x: number) => void;
  updateTableColumnLabel: (columnId: string, label: string) => void;
  setTableWizardPhase: (phase: 'bounds' | 'dividers' | 'labels') => void;
  setTableKeyColumn: (columnId: string | null) => void;
  finishTableWizard: () => void;
  cancelTableWizard: () => void;

  // Comparison mode actions
  setPdfB: (pdfId: string, pageCount: number, filename?: string) => void;
  clearPdfB: () => void;
  setActiveSource: (source: "a" | "b") => void;
  setTemplateMode: (mode: "single" | "comparison") => void;
  setCurrentPageB: (page: number) => void;

  // Zoom & markers (shared between header toolbar and PdfViewer)
  zoomIndex: number;
  showMarkers: boolean;
  setZoomIndex: (index: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setShowMarkers: (show: boolean) => void;

  // Connection drag state (for drag-to-connect on PDF canvas)
  connectDragFrom: { fieldId: string; source: 'a' | 'b' } | null;
  connectDragMouse: { x: number; y: number } | null; // screen coords
  pendingConnection: { fromId: string; toId: string } | null;
  setConnectDragFrom: (from: { fieldId: string; source: 'a' | 'b' } | null) => void;
  setConnectDragMouse: (pos: { x: number; y: number } | null) => void;
  setPendingConnection: (conn: { fromId: string; toId: string } | null) => void;

  // Saved test runs
  savedTestRuns: TestRun[];
  setSavedTestRuns: (runs: TestRun[]) => void;
  addSavedTestRun: (run: TestRun) => void;
  removeSavedTestRun: (runId: string) => void;

  // Template-level rules (Rules panel)
  templateRules: TemplateRule[];
  computedFields: ComputedField[];
  templateRuleResults: TemplateRuleResult[];
  computedValues: Record<string, string>;
  rightPanelTab: "results" | "rules";
  rightPanelCollapsed: boolean;

  // React Flow state for rules editor
  ruleNodes: Node[];
  ruleEdges: Edge[];
  setRuleNodes: (nodes: Node[]) => void;
  setRuleEdges: (edges: Edge[]) => void;

  addTemplateRule: (rule: TemplateRule) => void;
  updateTemplateRule: (ruleId: string, updates: Partial<TemplateRule>) => void;
  removeTemplateRule: (ruleId: string) => void;
  setTemplateRules: (rules: TemplateRule[]) => void;
  addComputedField: (field: ComputedField) => void;
  removeComputedField: (fieldId: string) => void;
  setComputedFields: (fields: ComputedField[]) => void;
  setRightPanelTab: (tab: "results" | "rules") => void;
  toggleRightPanel: () => void;
  setTemplateRuleResults: (results: TemplateRuleResult[]) => void;
  setComputedValues: (values: Record<string, string>) => void;

  // --- Controle wizard ---
  wizardControle: Controle | null;
  wizardActiveFileId: string | null;
  wizardActiveTab: WizardTab;
  wizardSwapping: boolean;

  initWizard: (controle?: Controle, name?: string) => void;
  setWizardTab: (tab: WizardTab) => void;
  setWizardName: (name: string) => void;
  addWizardFile: (file: ControleFile) => void;
  removeWizardFile: (fileId: string) => void;
  updateWizardFileLabel: (fileId: string, label: string) => void;
  setWizardFilePdf: (fileId: string, pdfId: string, pageCount: number, filename: string) => void;
  saveCurrentFileToWizard: () => void;
  loadFileIntoStore: (fileId: string) => void;
  loadAllFieldsForRules: () => void;
  saveRulesToWizard: () => void;
  finalizeWizard: () => Controle | null;
  clearWizard: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  pdfId: null,
  pdfFilename: null,
  pageCount: 0,
  currentPage: 1,
  fields: [],
  templates: [],
  extractionResults: null,
  activeTemplateId: null,
  drawMode: "static",
  pendingAnchor: null,
  editingFieldId: null,
  chainEditFieldId: null,
  drawingRegionForStepId: null,

  anchorWizard: null,
  tableWizard: null,

  layoutBlocks: [],
  showLayoutOverlay: false,

  canDrawFields: true,

  // Comparison mode defaults
  pdfIdB: null,
  pdfFilenameB: null,
  pageCountB: 0,
  currentPageB: 1,
  activeSource: "a",
  templateMode: "single",

  setPdf: (pdfId, pageCount, filename) =>
    set({ pdfId, pdfFilename: filename ?? null, pageCount, currentPage: 1, extractionResults: null, pendingAnchor: null, editingFieldId: null, chainEditFieldId: null, drawingRegionForStepId: null, pdfIdB: null, pdfFilenameB: null, pageCountB: 0, currentPageB: 1, activeSource: "a", templateRuleResults: [], computedValues: {} }),

  clearPdf: () =>
    set({ pdfId: null, pdfFilename: null, pageCount: 0, currentPage: 1, fields: [], extractionResults: null, activeTemplateId: null, pendingAnchor: null, editingFieldId: null, chainEditFieldId: null, drawingRegionForStepId: null, pdfIdB: null, pdfFilenameB: null, pageCountB: 0, currentPageB: 1, activeSource: "a", ruleNodes: [], ruleEdges: [], templateRules: [], computedFields: [], templateRuleResults: [], computedValues: {} }),

  addField: (field) =>
    set((state) => ({
      fields: [...state.fields, {
        ...field,
        source: field.source ?? state.activeSource,
      }],
    })),

  removeField: (id) =>
    set((state) => ({
      fields: state.fields.filter((f) => f.id !== id),
      editingFieldId: state.editingFieldId === id ? null : state.editingFieldId,
      chainEditFieldId: state.chainEditFieldId === id ? null : state.chainEditFieldId,
    })),

  setCurrentPage: (page) => set({ currentPage: page }),

  setTemplates: (templates) => set({ templates }),

  loadTemplate: (template) =>
    set({
      fields: template.fields, activeTemplateId: template.id, pendingAnchor: null,
      editingFieldId: null, chainEditFieldId: null, templateMode: template.mode ?? "single",
      templateRules: template.rules ?? [], computedFields: template.computed_fields ?? [],
      ruleNodes: (template.rule_graph?.nodes as Node[] | undefined) ?? [],
      ruleEdges: (template.rule_graph?.edges as Edge[] | undefined) ?? [],
    }),

  setExtractionResults: (results) => set({ extractionResults: results }),

  editTemplate: (template) =>
    set({
      fields: template.fields, activeTemplateId: template.id, pendingAnchor: null,
      extractionResults: null, editingFieldId: null, chainEditFieldId: null,
      templateMode: template.mode ?? "single",
      templateRules: template.rules ?? [], computedFields: template.computed_fields ?? [],
      ruleNodes: (template.rule_graph?.nodes as Node[] | undefined) ?? [],
      ruleEdges: (template.rule_graph?.edges as Edge[] | undefined) ?? [],
    }),

  setDrawMode: (mode) => set({ drawMode: mode, pendingAnchor: null }),

  setPendingAnchor: (anchor) => set({ pendingAnchor: anchor }),

  addRule: (fieldId, rule) =>
    set((state) => ({
      fields: state.fields.map((f) =>
        f.id === fieldId ? { ...f, rules: [...f.rules, rule] } : f
      ),
    })),

  removeRule: (fieldId, ruleIndex) =>
    set((state) => ({
      fields: state.fields.map((f) =>
        f.id === fieldId
          ? { ...f, rules: f.rules.filter((_, i) => i !== ruleIndex) }
          : f
      ),
    })),

  // Field edit
  setEditingFieldId: (id) => set({ editingFieldId: id }),

  updateFieldLabel: (fieldId, label) =>
    set((state) => ({
      fields: state.fields.map((f) =>
        f.id === fieldId ? { ...f, label } : f
      ),
    })),

  updateFieldDataType: (fieldId, datatype) =>
    set((state) => ({
      fields: state.fields.map((f) =>
        f.id === fieldId ? { ...f, detected_datatype: datatype } : f
      ),
    })),

  // Chain operations
  setChainEditFieldId: (id) => set({ chainEditFieldId: id }),

  addChainStep: (fieldId, step, afterIndex) =>
    set((state) => ({
      fields: state.fields.map((f) => {
        if (f.id !== fieldId) return f;
        const chain = [...f.chain];
        if (afterIndex !== undefined && afterIndex >= 0) {
          chain.splice(afterIndex + 1, 0, step);
        } else {
          chain.push(step);
        }
        return { ...f, chain };
      }),
    })),

  removeChainStep: (fieldId, stepId) =>
    set((state) => ({
      fields: state.fields.map((f) =>
        f.id === fieldId
          ? { ...f, chain: f.chain.filter((s) => s.id !== stepId) }
          : f
      ),
    })),

  updateChainStep: (fieldId, stepId, updates) =>
    set((state) => ({
      fields: state.fields.map((f) =>
        f.id === fieldId
          ? {
              ...f,
              chain: f.chain.map((s) =>
                s.id === stepId ? { ...s, ...updates } : s
              ),
            }
          : f
      ),
    })),

  reorderChainSteps: (fieldId, fromIndex, toIndex) =>
    set((state) => ({
      fields: state.fields.map((f) => {
        if (f.id !== fieldId) return f;
        const chain = [...f.chain];
        const [moved] = chain.splice(fromIndex, 1);
        chain.splice(toIndex, 0, moved);
        return { ...f, chain };
      }),
    })),

  setFieldChain: (fieldId, chain) =>
    set((state) => ({
      fields: state.fields.map((f) =>
        f.id === fieldId ? { ...f, chain } : f
      ),
    })),

  setDrawingRegionForStepId: (info) => set({ drawingRegionForStepId: info }),

  updateFieldRegion: (fieldId, regionType, region) =>
    set((state) => ({
      fields: state.fields.map((f) => {
        if (f.id !== fieldId) return f;
        if (regionType === 'value') return { ...f, value_region: region };
        if (regionType === 'anchor') return { ...f, anchor_region: region };
        return f;
      }),
    })),

  updateRule: (fieldId, ruleIndex, updates) =>
    set((state) => ({
      fields: state.fields.map((f) =>
        f.id === fieldId
          ? { ...f, rules: f.rules.map((r, i) => i === ruleIndex ? { ...r, ...updates } : r) }
          : f
      ),
    })),

  setCanDrawFields: (can) => set({ canDrawFields: can }),
  setLayoutBlocks: (blocks) => set({ layoutBlocks: blocks }),
  setShowLayoutOverlay: (show) => set({ showLayoutOverlay: show }),

  // Anchor wizard
  startAnchorWizard: (fieldId, targetMode) => {
    const WIZARD_STEPS: Record<AnchorMode, { role: AnchorRole; prompt: string }[]> = {
      static: [],
      single: [{ role: 'primary', prompt: 'Draw the anchor region (the label text near the value)' }],
      bracket: [
        { role: 'primary', prompt: 'Draw the COLUMN header above the value (e.g., "Amount")' },
        { role: 'secondary', prompt: 'Draw the ROW label to the left of the value (e.g., "Gross Pay")' },
      ],
      area_value: [
        { role: 'area_top', prompt: 'Draw the top boundary anchor (text above the value area)' },
        { role: 'area_bottom', prompt: 'Draw the bottom boundary anchor (text below the value area)' },
      ],
      area_locator: [
        { role: 'area_top', prompt: 'Draw the top area boundary' },
        { role: 'area_bottom', prompt: 'Draw the bottom area boundary' },
        { role: 'primary', prompt: 'Draw the locator anchor (the label inside the area)' },
      ],
      area_bracket: [
        { role: 'area_top', prompt: 'Draw the top area boundary' },
        { role: 'area_bottom', prompt: 'Draw the bottom area boundary' },
        { role: 'primary', prompt: 'Draw the COLUMN header above the value (inside the area)' },
        { role: 'secondary', prompt: 'Draw the ROW label to the left of the value (inside the area)' },
      ],
    };
    set({
      anchorWizard: {
        fieldId, targetMode,
        currentStep: 0,
        steps: WIZARD_STEPS[targetMode],
        completedAnchors: [],
      },
    });
  },

  completeAnchorWizardStep: (region, expectedText) =>
    set((state) => {
      const wizard = state.anchorWizard;
      if (!wizard) return {};
      const step = wizard.steps[wizard.currentStep];
      const newAnchor: Anchor = {
        id: crypto.randomUUID(),
        role: step.role,
        region,
        expected_text: expectedText,
      };
      const completedAnchors = [...wizard.completedAnchors, newAnchor];
      const nextStep = wizard.currentStep + 1;

      // If all steps done, finalize: update the field
      if (nextStep >= wizard.steps.length) {
        const defaultChains: Record<AnchorMode, () => ChainStep[]> = {
          static: () => [],
          single: () => [
            { id: crypto.randomUUID(), category: 'search', type: 'exact_position' },
            { id: crypto.randomUUID(), category: 'search', type: 'vertical_slide', slide_tolerance: 0.3 },
            { id: crypto.randomUUID(), category: 'search', type: 'full_page_search' },
            { id: crypto.randomUUID(), category: 'value', type: 'offset_value' },
            { id: crypto.randomUUID(), category: 'value', type: 'adjacent_scan', search_direction: 'right' },
          ],
          bracket: () => [
            { id: crypto.randomUUID(), category: 'search', type: 'bracket_search' },
            { id: crypto.randomUUID(), category: 'value', type: 'intersection_value' },
          ],
          area_value: () => [
            { id: crypto.randomUUID(), category: 'search', type: 'area_search' },
            { id: crypto.randomUUID(), category: 'value', type: 'area_text_value' },
          ],
          area_locator: () => [
            { id: crypto.randomUUID(), category: 'search', type: 'area_search' },
            { id: crypto.randomUUID(), category: 'value', type: 'offset_value' },
            { id: crypto.randomUUID(), category: 'value', type: 'adjacent_scan', search_direction: 'right' },
          ],
          area_bracket: () => [
            { id: crypto.randomUUID(), category: 'search', type: 'area_search' },
            { id: crypto.randomUUID(), category: 'value', type: 'intersection_value' },
          ],
        };

        const primaryAnchor = completedAnchors.find(a => a.role === 'primary');
        return {
          anchorWizard: null,
          fields: state.fields.map((f) => {
            if (f.id !== wizard.fieldId) return f;
            // Preserve type: "table" — only set static/dynamic for non-table fields
            const newType = f.type === 'table'
              ? 'table' as const
              : wizard.targetMode === 'static' ? 'static' as const : 'dynamic' as const;
            return {
              ...f,
              type: newType,
              anchor_mode: wizard.targetMode,
              anchors: completedAnchors,
              anchor_region: primaryAnchor?.region,
              expected_anchor_text: primaryAnchor?.expected_text,
              chain: defaultChains[wizard.targetMode](),
            };
          }),
        };
      }

      // More steps to go
      return {
        anchorWizard: { ...wizard, currentStep: nextStep, completedAnchors },
      };
    }),

  cancelAnchorWizard: () => set({ anchorWizard: null }),

  // Table wizard actions
  startTableWizard: (fieldId) =>
    set({ tableWizard: { fieldId, phase: 'bounds', tableBounds: null, columns: [], keyColumnId: null } }),

  completeTableBounds: (region) =>
    set((state) => {
      if (!state.tableWizard) return {};
      // Auto-create first column at table left edge
      const firstCol: TableColumn = { id: crypto.randomUUID(), label: 'Column 1', x: region.x };
      return {
        tableWizard: {
          ...state.tableWizard,
          phase: 'dividers' as const,
          tableBounds: region,
          columns: [firstCol],
        },
      };
    }),

  addTableDivider: (x) =>
    set((state) => {
      if (!state.tableWizard || !state.tableWizard.tableBounds) return {};
      const bounds = state.tableWizard.tableBounds;
      // Clamp x within table bounds
      if (x <= bounds.x || x >= bounds.x + bounds.width) return {};
      const newCol: TableColumn = {
        id: crypto.randomUUID(),
        label: `Column ${state.tableWizard.columns.length + 1}`,
        x,
      };
      const columns = [...state.tableWizard.columns, newCol].sort((a, b) => a.x - b.x);
      // Re-label columns sequentially
      columns.forEach((c, i) => { c.label = `Column ${i + 1}`; });
      return { tableWizard: { ...state.tableWizard, columns } };
    }),

  removeTableDivider: (columnId) =>
    set((state) => {
      if (!state.tableWizard) return {};
      // Don't remove the first column (table left edge)
      const cols = state.tableWizard.columns;
      if (cols.length <= 1) return {};
      const idx = cols.findIndex(c => c.id === columnId);
      if (idx === 0) return {}; // Can't remove first column
      const columns = cols.filter(c => c.id !== columnId);
      columns.forEach((c, i) => { c.label = `Column ${i + 1}`; });
      return { tableWizard: { ...state.tableWizard, columns } };
    }),

  updateTableDividerX: (columnId, x) =>
    set((state) => {
      if (!state.tableWizard || !state.tableWizard.tableBounds) return {};
      const bounds = state.tableWizard.tableBounds;
      const clampedX = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width));
      const columns = state.tableWizard.columns
        .map(c => c.id === columnId ? { ...c, x: clampedX } : c)
        .sort((a, b) => a.x - b.x);
      return { tableWizard: { ...state.tableWizard, columns } };
    }),

  updateTableColumnLabel: (columnId, label) =>
    set((state) => {
      if (!state.tableWizard) return {};
      return {
        tableWizard: {
          ...state.tableWizard,
          columns: state.tableWizard.columns.map(c =>
            c.id === columnId ? { ...c, label } : c
          ),
        },
      };
    }),

  setTableWizardPhase: (phase) =>
    set((state) => {
      if (!state.tableWizard) return {};
      return { tableWizard: { ...state.tableWizard, phase } };
    }),

  setTableKeyColumn: (columnId) =>
    set((state) => {
      if (!state.tableWizard) return {};
      return { tableWizard: { ...state.tableWizard, keyColumnId: columnId } };
    }),

  finishTableWizard: () =>
    set((state) => {
      const wiz = state.tableWizard;
      if (!wiz || !wiz.tableBounds || wiz.columns.length === 0) return { tableWizard: null };
      const tableConfig: TableConfig = {
        table_region: wiz.tableBounds,
        columns: wiz.columns,
        header_row: true,
        key_column_id: wiz.keyColumnId ?? undefined,
      };
      return {
        tableWizard: null,
        fields: state.fields.map(f =>
          f.id === wiz.fieldId
            ? { ...f, table_config: tableConfig }
            : f
        ),
      };
    }),

  cancelTableWizard: () =>
    set((state) => {
      const wiz = state.tableWizard;
      if (!wiz) return {};
      // Remove the field if wizard is cancelled (it was created empty)
      return {
        tableWizard: null,
        fields: state.fields.filter(f => f.id !== wiz.fieldId),
      };
    }),

  // Comparison mode actions
  setPdfB: (pdfId, pageCount, filename) =>
    set({ pdfIdB: pdfId, pdfFilenameB: filename ?? null, pageCountB: pageCount, currentPageB: 1 }),

  clearPdfB: () =>
    set({ pdfIdB: null, pdfFilenameB: null, pageCountB: 0, currentPageB: 1 }),

  setActiveSource: (source) => set({ activeSource: source }),

  setTemplateMode: (mode) => set({ templateMode: mode }),

  setCurrentPageB: (page) => set({ currentPageB: page }),

  // Zoom & markers
  zoomIndex: 2, // Default: 100% (index into ZOOM_LEVELS)
  showMarkers: true,
  setZoomIndex: (index) => set({ zoomIndex: index }),
  zoomIn: () => set((s) => ({ zoomIndex: Math.min(s.zoomIndex + 1, 7) })),
  zoomOut: () => set((s) => ({ zoomIndex: Math.max(s.zoomIndex - 1, 0) })),
  resetZoom: () => set({ zoomIndex: 2 }),
  setShowMarkers: (show) => set({ showMarkers: show }),

  // Connection drag state
  connectDragFrom: null,
  connectDragMouse: null,
  pendingConnection: null,
  setConnectDragFrom: (from) => set({ connectDragFrom: from }),
  setConnectDragMouse: (pos) => set({ connectDragMouse: pos }),
  setPendingConnection: (conn) => set({ pendingConnection: conn }),

  // Saved test runs
  savedTestRuns: [],
  setSavedTestRuns: (runs) => set({ savedTestRuns: runs }),
  addSavedTestRun: (run) => set((s) => ({ savedTestRuns: [run, ...s.savedTestRuns] })),
  removeSavedTestRun: (runId) => set((s) => ({ savedTestRuns: s.savedTestRuns.filter((r) => r.id !== runId) })),

  // Template-level rules
  templateRules: [],
  computedFields: [],
  templateRuleResults: [],
  computedValues: {},
  rightPanelTab: "rules",
  rightPanelCollapsed: false,

  // React Flow state
  ruleNodes: [],
  ruleEdges: [],
  setRuleNodes: (nodes) => set({ ruleNodes: nodes }),
  setRuleEdges: (edges) => set({ ruleEdges: edges }),

  addTemplateRule: (rule) =>
    set((s) => ({ templateRules: [...s.templateRules, rule] })),

  updateTemplateRule: (ruleId, updates) =>
    set((s) => ({
      templateRules: s.templateRules.map((r) =>
        r.id === ruleId ? { ...r, ...updates } : r
      ),
    })),

  removeTemplateRule: (ruleId) =>
    set((s) => ({
      templateRules: s.templateRules.filter((r) => r.id !== ruleId),
      computedFields: s.computedFields.filter((cf) => cf.rule_id !== ruleId),
    })),

  setTemplateRules: (rules) => set({ templateRules: rules }),

  addComputedField: (field) =>
    set((s) => ({ computedFields: [...s.computedFields, field] })),

  removeComputedField: (fieldId) =>
    set((s) => ({ computedFields: s.computedFields.filter((cf) => cf.id !== fieldId) })),

  setComputedFields: (fields) => set({ computedFields: fields }),

  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  toggleRightPanel: () =>
    set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),

  setTemplateRuleResults: (results) => set({ templateRuleResults: results }),

  setComputedValues: (values) => set({ computedValues: values }),

  // --- Controle wizard ---
  wizardControle: null,
  wizardActiveFileId: null,
  wizardActiveTab: "bestanden",
  wizardSwapping: false,

  initWizard: (controle, name) => {
    if (controle) {
      set({
        wizardControle: controle,
        wizardActiveTab: "bestanden",
        wizardActiveFileId: null,
        templateRules: controle.rules ?? [],
        computedFields: controle.computedFields ?? [],
        ruleNodes: (controle.ruleGraph?.nodes as Node[] | undefined) ?? [],
        ruleEdges: (controle.ruleGraph?.edges as Edge[] | undefined) ?? [],
      });
    } else {
      const now = new Date().toISOString();
      set({
        wizardControle: {
          id: crypto.randomUUID(),
          name: name ?? "",
          status: "draft",
          files: [],
          rules: [],
          computedFields: [],
          ruleGraph: null,
          createdAt: now,
          updatedAt: now,
        },
        wizardActiveTab: "bestanden",
        wizardActiveFileId: null,
        fields: [],
        pdfId: null,
        pdfFilename: null,
        pageCount: 0,
        currentPage: 1,
        extractionResults: null,
        templateRules: [],
        computedFields: [],
        ruleNodes: [],
        ruleEdges: [],
      });
    }
  },

  setWizardTab: (tab) =>
    set((state) => {
      if (state.wizardSwapping) return {};
      return { wizardActiveTab: tab };
    }),

  setWizardName: (name) =>
    set((state) => {
      if (!state.wizardControle) return {};
      return {
        wizardControle: { ...state.wizardControle, name, updatedAt: new Date().toISOString() },
      };
    }),

  addWizardFile: (file) =>
    set((state) => {
      if (!state.wizardControle) return {};
      return {
        wizardControle: {
          ...state.wizardControle,
          files: [...state.wizardControle.files, file],
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  removeWizardFile: (fileId) =>
    set((state) => {
      if (!state.wizardControle) return {};
      return {
        wizardControle: {
          ...state.wizardControle,
          files: state.wizardControle.files.filter((f) => f.id !== fileId),
          updatedAt: new Date().toISOString(),
        },
        wizardActiveFileId: state.wizardActiveFileId === fileId ? null : state.wizardActiveFileId,
      };
    }),

  updateWizardFileLabel: (fileId, label) =>
    set((state) => {
      if (!state.wizardControle) return {};
      return {
        wizardControle: {
          ...state.wizardControle,
          files: state.wizardControle.files.map((f) =>
            f.id === fileId ? { ...f, label } : f
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  setWizardFilePdf: (fileId, pdfId, pageCount, filename) =>
    set((state) => {
      if (!state.wizardControle) return {};
      return {
        wizardControle: {
          ...state.wizardControle,
          files: state.wizardControle.files.map((f) =>
            f.id === fileId ? { ...f, pdfId, pdfFilename: filename, pageCount } : f
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  saveCurrentFileToWizard: () =>
    set((state) => {
      if (!state.wizardControle || !state.wizardActiveFileId) return {};
      return {
        wizardControle: {
          ...state.wizardControle,
          files: state.wizardControle.files.map((f) =>
            f.id === state.wizardActiveFileId
              ? { ...f, fields: state.fields, extractionResults: state.extractionResults }
              : f
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  loadFileIntoStore: (fileId) =>
    set((state) => {
      if (!state.wizardControle) return {};
      const file = state.wizardControle.files.find((f) => f.id === fileId);
      if (!file) return {};
      return {
        wizardActiveFileId: fileId,
        pdfId: file.pdfId,
        pdfFilename: file.pdfFilename,
        pageCount: file.pageCount,
        currentPage: 1,
        fields: file.fields,
        extractionResults: file.extractionResults,
        editingFieldId: null,
        chainEditFieldId: null,
        drawingRegionForStepId: null,
        pendingAnchor: null,
        templateMode: "single" as const,
      };
    }),

  loadAllFieldsForRules: () =>
    set((state) => {
      if (!state.wizardControle) return {};
      const allFields: (Field & { _wizardFileId?: string; _wizardFileLabel?: string })[] = [];
      for (const file of state.wizardControle.files) {
        for (const field of file.fields) {
          allFields.push({
            ...field,
            _wizardFileId: file.id,
            _wizardFileLabel: file.label,
          });
        }
      }
      return { fields: allFields as Field[] };
    }),

  saveRulesToWizard: () =>
    set((state) => {
      if (!state.wizardControle) return {};
      return {
        wizardControle: {
          ...state.wizardControle,
          rules: state.templateRules,
          computedFields: state.computedFields,
          ruleGraph: { nodes: state.ruleNodes, edges: state.ruleEdges },
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  finalizeWizard: () => {
    const state = useAppStore.getState();
    if (!state.wizardControle) return null;
    return {
      ...state.wizardControle,
      rules: state.templateRules,
      computedFields: state.computedFields,
      ruleGraph: { nodes: state.ruleNodes, edges: state.ruleEdges },
      updatedAt: new Date().toISOString(),
    };
  },

  clearWizard: () =>
    set({
      wizardControle: null,
      wizardActiveFileId: null,
      wizardActiveTab: "naam",
      wizardSwapping: false,
    }),
}));
