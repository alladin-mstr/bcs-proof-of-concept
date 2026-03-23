import { create } from 'zustand';
import type { Field, Template, FieldResult, Region, Rule, ChainStep, LayoutBlock, AnchorMode, AnchorRole, Anchor } from '../types';

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
    set({ pdfId, pdfFilename: filename ?? null, pageCount, currentPage: 1, fields: [], extractionResults: null, activeTemplateId: null, pendingAnchor: null, editingFieldId: null, chainEditFieldId: null, drawingRegionForStepId: null, pdfIdB: null, pdfFilenameB: null, pageCountB: 0, currentPageB: 1, activeSource: "a" }),

  clearPdf: () =>
    set({ pdfId: null, pdfFilename: null, pageCount: 0, currentPage: 1, fields: [], extractionResults: null, activeTemplateId: null, pendingAnchor: null, editingFieldId: null, chainEditFieldId: null, drawingRegionForStepId: null, pdfIdB: null, pdfFilenameB: null, pageCountB: 0, currentPageB: 1, activeSource: "a" }),

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
    set({ fields: template.fields, activeTemplateId: template.id, pendingAnchor: null, editingFieldId: null, chainEditFieldId: null, templateMode: template.mode ?? "single" }),

  setExtractionResults: (results) => set({ extractionResults: results }),

  editTemplate: (template) =>
    set({ fields: template.fields, activeTemplateId: template.id, pendingAnchor: null, extractionResults: null, editingFieldId: null, chainEditFieldId: null, templateMode: template.mode ?? "single" }),

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
          fields: state.fields.map((f) =>
            f.id === wizard.fieldId
              ? {
                  ...f,
                  type: wizard.targetMode === 'static' ? 'static' as const : 'dynamic' as const,
                  anchor_mode: wizard.targetMode,
                  anchors: completedAnchors,
                  anchor_region: primaryAnchor?.region,
                  expected_anchor_text: primaryAnchor?.expected_text,
                  chain: defaultChains[wizard.targetMode](),
                }
              : f
          ),
        };
      }

      // More steps to go
      return {
        anchorWizard: { ...wizard, currentStep: nextStep, completedAnchors },
      };
    }),

  cancelAnchorWizard: () => set({ anchorWizard: null }),

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
}));
