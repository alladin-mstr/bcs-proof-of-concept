import { create } from 'zustand';
import type { Field, Template, FieldResult, Region, Rule, ChainStep } from '../types';

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

  // Chain edit mode
  chainEditFieldId: string | null;
  // Drawing a search region for a chain step
  drawingRegionForStepId: { fieldId: string; stepId: string } | null;

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

  // Chain operations
  setChainEditFieldId: (id: string | null) => void;
  addChainStep: (fieldId: string, step: ChainStep, afterIndex?: number) => void;
  removeChainStep: (fieldId: string, stepId: string) => void;
  updateChainStep: (fieldId: string, stepId: string, updates: Partial<ChainStep>) => void;
  reorderChainSteps: (fieldId: string, fromIndex: number, toIndex: number) => void;
  setFieldChain: (fieldId: string, chain: ChainStep[]) => void;
  setDrawingRegionForStepId: (info: { fieldId: string; stepId: string } | null) => void;
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
  chainEditFieldId: null,
  drawingRegionForStepId: null,

  setPdf: (pdfId, pageCount, filename) =>
    set({ pdfId, pdfFilename: filename ?? null, pageCount, currentPage: 1, fields: [], extractionResults: null, activeTemplateId: null, pendingAnchor: null, chainEditFieldId: null, drawingRegionForStepId: null }),

  clearPdf: () =>
    set({ pdfId: null, pdfFilename: null, pageCount: 0, currentPage: 1, fields: [], extractionResults: null, activeTemplateId: null, pendingAnchor: null, chainEditFieldId: null, drawingRegionForStepId: null }),

  addField: (field) =>
    set((state) => ({ fields: [...state.fields, field] })),

  removeField: (id) =>
    set((state) => ({
      fields: state.fields.filter((f) => f.id !== id),
      chainEditFieldId: state.chainEditFieldId === id ? null : state.chainEditFieldId,
    })),

  setCurrentPage: (page) => set({ currentPage: page }),

  setTemplates: (templates) => set({ templates }),

  loadTemplate: (template) =>
    set({ fields: template.fields, activeTemplateId: template.id, pendingAnchor: null, chainEditFieldId: null }),

  setExtractionResults: (results) => set({ extractionResults: results }),

  editTemplate: (template) =>
    set({ fields: template.fields, activeTemplateId: template.id, pendingAnchor: null, extractionResults: null, chainEditFieldId: null }),

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
}));
