import { useCallback, useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useBboxDrawing } from '../hooks/useBboxDrawing';
import { normalizedToPixel, pixelToNormalized } from '../utils/coords';
import { detectFormat, getPageWords, type WordInfo } from '../api/client';
import type { Field, FieldResult, Region, TableColumn } from '../types';

interface DragState {
  fieldId: string;
  regionType: 'value' | 'anchor';
  startMouseX: number;
  startMouseY: number;
  origRegion: Region;
}

const COLORS = {
  staticValue: { fill: 'rgba(59,130,246,0.25)', stroke: 'rgb(59,130,246)' },
  dynamicAnchor: { fill: 'rgba(245,158,11,0.25)', stroke: 'rgb(245,158,11)' },
  dynamicValue: { fill: 'rgba(59,130,246,0.25)', stroke: 'rgb(59,130,246)' },
  pendingAnchor: { fill: 'rgba(245,158,11,0.15)', stroke: 'rgb(245,158,11)' },
  ghost: { fill: 'rgba(156,163,175,0.06)', stroke: 'rgba(156,163,175,0.35)' },
  resultOk: { fill: 'rgba(34,197,94,0.12)', stroke: 'rgb(34,197,94)' },
  resultError: { fill: 'rgba(239,68,68,0.12)', stroke: 'rgb(239,68,68)' },
  resultWarning: { fill: 'rgba(245,158,11,0.12)', stroke: 'rgb(245,158,11)' },
  resultShifted: { fill: 'rgba(59,130,246,0.15)', stroke: 'rgb(59,130,246)' },
  resultRelocated: { fill: 'rgba(245,158,11,0.15)', stroke: 'rgb(245,158,11)' },
  resultEmpty: { fill: 'rgba(156,163,175,0.12)', stroke: 'rgb(156,163,175)' },
  // Source B colors (emerald tones)
  staticValueB: { fill: 'rgba(16,185,129,0.25)', stroke: 'rgb(16,185,129)' },
  dynamicAnchorB: { fill: 'rgba(245,158,11,0.25)', stroke: 'rgb(217,119,6)' },
  dynamicValueB: { fill: 'rgba(16,185,129,0.25)', stroke: 'rgb(16,185,129)' },
  // Table field colors (violet)
  tableField: { fill: 'rgba(139,92,246,0.12)', stroke: 'rgb(139,92,246)' },
  tableDivider: { stroke: 'rgba(139,92,246,0.6)' },
};

function getResultColor(status: FieldResult['status']) {
  switch (status) {
    case 'ok': return COLORS.resultOk;
    case 'anchor_shifted': return COLORS.resultShifted;
    case 'anchor_mismatch': case 'rule_failed': return COLORS.resultError;
    case 'anchor_not_found': case 'anchor_relocated': return COLORS.resultWarning;
    case 'empty': return COLORS.resultEmpty;
  }
}

interface Props {
  pageWidth: number;
  pageHeight: number;
  source?: "a" | "b";
  readOnly?: boolean;
  resultsOverride?: FieldResult[];
  fieldsOverride?: Field[];
  currentPageOverride?: number;
}

function pixelRectToRegion(rect: { x: number; y: number; width: number; height: number }, page: number, pw: number, ph: number): Region {
  const tl = pixelToNormalized(rect.x, rect.y, pw, ph);
  const sz = pixelToNormalized(rect.width, rect.height, pw, ph);
  return { page, x: tl.x, y: tl.y, width: sz.x, height: sz.y };
}

function regionCenter(region: Region, pw: number, ph: number) {
  const p = normalizedToPixel(region.x, region.y, pw, ph);
  const d = normalizedToPixel(region.width, region.height, pw, ph);
  return { cx: p.x + d.x / 2, cy: p.y + d.y / 2 };
}

export default function BboxCanvas({ pageWidth, pageHeight, source, readOnly = false, resultsOverride, fieldsOverride, currentPageOverride }: Props) {
  const storeCurrentPage = useAppStore((s) => source === 'b' ? s.currentPageB : s.currentPage);
  const currentPage = currentPageOverride ?? storeCurrentPage;
  const storeFields = useAppStore((s) => s.fields);
  const addField = useAppStore((s) => s.addField);
  const removeField = useAppStore((s) => s.removeField);
  const drawMode = useAppStore((s) => s.drawMode);
  const pendingAnchor = useAppStore((s) => s.pendingAnchor);
  const setPendingAnchor = useAppStore((s) => s.setPendingAnchor);
  const pdfId = useAppStore((s) => s.pdfId);
  const storeResults = useAppStore((s) => s.extractionResults);
  const extractionResults = resultsOverride ?? storeResults;
  const editingFieldId = useAppStore((s) => s.editingFieldId);
  const setEditingFieldId = useAppStore((s) => s.setEditingFieldId);
  const updateFieldLabel = useAppStore((s) => s.updateFieldLabel);
  const chainEditFieldId = useAppStore((s) => s.chainEditFieldId);
  const setChainEditFieldId = useAppStore((s) => s.setChainEditFieldId);
  const drawingRegionForStepId = useAppStore((s) => s.drawingRegionForStepId);
  const setDrawingRegionForStepId = useAppStore((s) => s.setDrawingRegionForStepId);
  const updateChainStep = useAppStore((s) => s.updateChainStep);
  const updateFieldRegion = useAppStore((s) => s.updateFieldRegion);
  const anchorWizard = useAppStore((s) => s.anchorWizard);
  const completeAnchorWizardStep = useAppStore((s) => s.completeAnchorWizardStep);
  const tableWizard = useAppStore((s) => s.tableWizard);
  const completeTableBounds = useAppStore((s) => s.completeTableBounds);
  const addTableDivider = useAppStore((s) => s.addTableDivider);
  const drawTool = useAppStore((s) => s.drawTool);
  const pageWordsCache = useAppStore((s) => s.pageWordsCache);
  const setPageWords = useAppStore((s) => s.setPageWords);

  // Drag state for moving existing boxes
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const dragStartedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Pointer tool state
  const [pointerSelection, setPointerSelection] = useState<{
    words: WordInfo[];
    region: { x: number; y: number; width: number; height: number }; // normalized
    startNormX: number; // normalized X where the click started
  } | null>(null);
  const pointerDraggingRef = useRef(false);
  const allWordsRef = useRef<WordInfo[]>([]);

  // Load words for current page when in pointer mode
  useEffect(() => {
    if (drawTool !== 'pointer' || !pdfId) return;
    const cacheKey = `${pdfId}:${currentPage}`;
    if (pageWordsCache[cacheKey]) {
      allWordsRef.current = pageWordsCache[cacheKey];
      return;
    }
    getPageWords(pdfId, currentPage).then((words) => {
      setPageWords(cacheKey, words);
      allWordsRef.current = words;
    }).catch(() => {});
  }, [drawTool, pdfId, currentPage, pageWordsCache, setPageWords]);

  // Escape key exits field edit mode or chain edit mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingFieldId) setEditingFieldId(null);
        if (chainEditFieldId) setChainEditFieldId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingFieldId, setEditingFieldId, chainEditFieldId, setChainEditFieldId]);

  // Click outside the SVG canvas also exits field/chain edit mode
  useEffect(() => {
    if (!editingFieldId && !chainEditFieldId) return;
    const handleGlobalMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (svgRef.current && !svgRef.current.contains(target)) {
        if (editingFieldId) setEditingFieldId(null);
        // Don't exit chain edit when clicking inside the chain editor panel
        if (chainEditFieldId && !(target instanceof HTMLElement && target.closest('[data-chain-editor]'))) {
          setChainEditFieldId(null);
        }
      }
    };
    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown);
  }, [editingFieldId, setEditingFieldId, chainEditFieldId, setChainEditFieldId]);

  // Whether field drawing/editing is allowed (set by TemplatePanel)
  const canEdit = useAppStore((s) => s.canDrawFields);
  const effectiveCanEdit = readOnly ? false : canEdit;

  // Build effective fields: use overrides or synthesize from results in readOnly mode
  const effectiveFields = (() => {
    if (fieldsOverride) return fieldsOverride;
    if (readOnly && resultsOverride) {
      return resultsOverride
        .filter((r) => r.resolved_region)
        .map((r): Field => ({
          id: r.label,
          label: r.label,
          type: r.field_type === "cell" || r.field_type === "cell_range" ? "static" : r.field_type,
          anchor_mode: "static",
          anchors: [],
          value_region: r.resolved_region!,
          rules: [],
          chain: [],
        }));
    }
    return storeFields;
  })();

  // Pointer tool: find the word at a normalized position
  const findWordAt = useCallback((normX: number, normY: number): WordInfo | null => {
    const words = allWordsRef.current;
    for (const w of words) {
      if (normX >= w.x && normX <= w.x + w.width && normY >= w.y && normY <= w.y + w.height) {
        return w;
      }
    }
    // Fuzzy: find closest word within a small tolerance
    const tolerance = 0.01;
    let best: WordInfo | null = null;
    let bestDist = Infinity;
    for (const w of words) {
      const cx = w.x + w.width / 2;
      const cy = w.y + w.height / 2;
      const dx = Math.max(0, Math.abs(normX - cx) - w.width / 2);
      const dy = Math.max(0, Math.abs(normY - cy) - w.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < tolerance && dist < bestDist) {
        bestDist = dist;
        best = w;
      }
    }
    return best;
  }, []);

  // Pointer tool: compute bounding box of selected words with padding
  const computeWordRegion = useCallback((words: WordInfo[]): { x: number; y: number; width: number; height: number } => {
    const PAD = 0.003; // small padding around word(s)
    const minX = Math.max(0, Math.min(...words.map((w) => w.x)) - PAD);
    const minY = Math.max(0, Math.min(...words.map((w) => w.y)) - PAD);
    const maxX = Math.min(1, Math.max(...words.map((w) => w.x + w.width)) + PAD);
    const maxY = Math.min(1, Math.max(...words.map((w) => w.y + w.height)) + PAD);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, []);

  // Pointer tool: find words that overlap the horizontal span from startX to endX on the same line
  const findWordsInSpan = useCallback((clickedWord: WordInfo, startNormX: number, currentNormX: number): WordInfo[] => {
    const words = allWordsRef.current;
    const lineY = clickedWord.y;
    const lineH = clickedWord.height;
    // Words on the same line (vertical overlap)
    const lineWords = words.filter((w) => {
      const overlapTop = Math.max(w.y, lineY);
      const overlapBot = Math.min(w.y + w.height, lineY + lineH);
      return overlapBot - overlapTop > lineH * 0.3;
    });
    // Determine horizontal range
    const minX = Math.min(startNormX, currentNormX);
    const maxX = Math.max(startNormX, currentNormX);
    // Words whose horizontal center falls within the range
    const selected = lineWords.filter((w) => {
      const wcx = w.x + w.width / 2;
      return wcx >= minX && wcx <= maxX;
    });
    // Always include the clicked word
    if (selected.length === 0) return [clickedWord];
    return selected;
  }, []);

  // Handle pointer tool completion: create field from selected region
  const handlePointerComplete = useCallback(async (region: { x: number; y: number; width: number; height: number }) => {
    if (!effectiveCanEdit) return;
    const normRegion: Region = { page: currentPage, ...region };

    // If anchor/table wizard or drawing region for step, delegate to onDrawComplete path
    if (tableWizard && tableWizard.phase === 'bounds') {
      completeTableBounds(normRegion);
      return;
    }
    if (anchorWizard && pdfId) {
      try {
        const { extractRegion } = await import('../api/client');
        const text = await extractRegion(pdfId, normRegion);
        if (!text?.trim()) {
          window.alert('No text found in the drawn region. Try drawing over visible text.');
          return;
        }
        completeAnchorWizardStep(normRegion, text.trim());
      } catch {
        window.alert('Failed to extract text from region.');
      }
      return;
    }
    if (drawingRegionForStepId) {
      updateChainStep(drawingRegionForStepId.fieldId, drawingRegionForStepId.stepId, { search_region: normRegion });
      setDrawingRegionForStepId(null);
      return;
    }

    if (drawMode === 'static') {
      const label = window.prompt('Enter a label for this field:');
      if (!label?.trim()) return;
      addField({ id: crypto.randomUUID(), label: label.trim(), type: 'static', anchor_mode: 'static', anchors: [], value_region: normRegion, rules: [], chain: [] });
    } else if (!pendingAnchor) {
      const expectedText = window.prompt('What text should this anchor contain?');
      if (!expectedText?.trim()) return;
      setPendingAnchor({ region: normRegion, expectedText: expectedText.trim() });
    } else {
      const label = window.prompt('Enter a label for this field:');
      if (!label?.trim()) return;
      let detectedFormat: Field['value_format'] = undefined;
      if (pdfId) {
        try {
          const { format } = await detectFormat(pdfId, normRegion);
          detectedFormat = format as Field['value_format'];
        } catch { /* silently continue */ }
      }
      const defaultChain = [
        { id: crypto.randomUUID(), category: 'search' as const, type: 'exact_position' },
        { id: crypto.randomUUID(), category: 'search' as const, type: 'vertical_slide', slide_tolerance: 0.3 },
        { id: crypto.randomUUID(), category: 'search' as const, type: 'full_page_search' },
        { id: crypto.randomUUID(), category: 'value' as const, type: 'offset_value' },
        { id: crypto.randomUUID(), category: 'value' as const, type: 'adjacent_scan', search_direction: 'right' },
      ];
      addField({
        id: crypto.randomUUID(),
        label: label.trim(),
        type: 'dynamic',
        anchor_mode: 'single',
        anchors: [{ id: crypto.randomUUID(), role: 'primary', region: pendingAnchor.region, expected_text: pendingAnchor.expectedText }],
        value_region: normRegion,
        anchor_region: pendingAnchor.region,
        expected_anchor_text: pendingAnchor.expectedText,
        rules: [],
        value_format: detectedFormat,
        chain: defaultChain,
      });
      setPendingAnchor(null);
    }
  }, [effectiveCanEdit, currentPage, drawMode, pendingAnchor, setPendingAnchor, pdfId, addField, tableWizard, completeTableBounds, anchorWizard, completeAnchorWizardStep, drawingRegionForStepId, updateChainStep, setDrawingRegionForStepId]);

  const currentPageFields = effectiveFields.filter(
    (f) => {
      const onPage = f.type === 'table'
        ? f.table_config?.table_region.page === currentPage
        : f.value_region.page === currentPage || (f.anchor_region && f.anchor_region.page === currentPage);
      if (!onPage) return false;
      // When source prop is provided (comparison mode), only show fields for this source
      if (source !== undefined) return (f.source ?? "a") === source;
      return true;
    }
  );

  // Key results by label+source to handle same-named fields across PDFs
  const resultByKey: Record<string, FieldResult> = {};
  if (extractionResults) {
    for (const r of extractionResults) {
      resultByKey[`${r.source ?? 'a'}:${r.label}`] = r;
      // Also store by label alone as fallback for single-mode
      if (!resultByKey[r.label]) resultByKey[r.label] = r;
    }
  }

  const onDrawComplete = useCallback(
    async (rect: { x: number; y: number; width: number; height: number }) => {
      if (!effectiveCanEdit) return;
      const region = pixelRectToRegion(rect, currentPage, pageWidth, pageHeight);

      // If table wizard is in bounds phase, capture the drawn rectangle
      if (tableWizard && tableWizard.phase === 'bounds') {
        completeTableBounds(region);
        return;
      }

      // If anchor wizard is active, auto-extract text from the drawn region
      if (anchorWizard) {
        if (pdfId) {
          try {
            const { extractRegion } = await import('../api/client');
            const text = await extractRegion(pdfId, region);
            if (!text?.trim()) {
              window.alert('No text found in the drawn region. Try drawing over visible text.');
              return;
            }
            completeAnchorWizardStep(region, text.trim());
          } catch {
            window.alert('Failed to extract text from region.');
          }
        }
        return;
      }

      // If drawing a search region for a chain step, capture it there
      if (drawingRegionForStepId) {
        updateChainStep(drawingRegionForStepId.fieldId, drawingRegionForStepId.stepId, { search_region: region });
        setDrawingRegionForStepId(null);
        return;
      }

      if (drawMode === 'static') {
        const label = window.prompt('Enter a label for this field:');
        if (!label?.trim()) return;
        addField({ id: crypto.randomUUID(), label: label.trim(), type: 'static', anchor_mode: 'static', anchors: [], value_region: region, rules: [], chain: [] });
      } else if (!pendingAnchor) {
        const expectedText = window.prompt('What text should this anchor contain?');
        if (!expectedText?.trim()) return;
        setPendingAnchor({ region, expectedText: expectedText.trim() });
      } else {
        const label = window.prompt('Enter a label for this field:');
        if (!label?.trim()) return;

        // Auto-detect format from the current PDF
        let detectedFormat: Field['value_format'] = undefined;
        if (pdfId) {
          try {
            const { format } = await detectFormat(pdfId, region);
            detectedFormat = format as Field['value_format'];
          } catch {
            // Silently continue without format
          }
        }

        // Default chain for dynamic fields
        const defaultChain = [
          { id: crypto.randomUUID(), category: 'search' as const, type: 'exact_position' },
          { id: crypto.randomUUID(), category: 'search' as const, type: 'vertical_slide', slide_tolerance: 0.3 },
          { id: crypto.randomUUID(), category: 'search' as const, type: 'full_page_search' },
          { id: crypto.randomUUID(), category: 'value' as const, type: 'offset_value' },
          { id: crypto.randomUUID(), category: 'value' as const, type: 'adjacent_scan', search_direction: 'right' },
        ];

        addField({
          id: crypto.randomUUID(),
          label: label.trim(),
          type: 'dynamic',
          anchor_mode: 'single',
          anchors: [{
            id: crypto.randomUUID(),
            role: 'primary',
            region: pendingAnchor.region,
            expected_text: pendingAnchor.expectedText,
          }],
          value_region: region,
          anchor_region: pendingAnchor.region,
          expected_anchor_text: pendingAnchor.expectedText,
          rules: [],
          value_format: detectedFormat,
          chain: defaultChain,
        });
        setPendingAnchor(null);
      }
    },
    [effectiveCanEdit, addField, currentPage, pageWidth, pageHeight, drawMode, pendingAnchor, setPendingAnchor, pdfId, drawingRegionForStepId, updateChainStep, setDrawingRegionForStepId, anchorWizard, completeAnchorWizardStep, tableWizard, completeTableBounds]
  );

  const { currentRect, handlers } = useBboxDrawing(onDrawComplete);

  const startDrag = useCallback((fieldId: string, regionType: 'value' | 'anchor', e: React.MouseEvent) => {
    if (!effectiveCanEdit) return;
    e.stopPropagation();
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = svg.clientWidth / rect.width;
    const scaleY = svg.clientHeight / rect.height;
    const field = effectiveFields.find((f) => f.id === fieldId);
    if (!field) return;
    const origRegion = regionType === 'anchor' ? field.anchor_region : field.value_region;
    if (!origRegion) return;
    dragStartedRef.current = true;
    setDrag({
      fieldId,
      regionType,
      startMouseX: (e.clientX - rect.left) * scaleX,
      startMouseY: (e.clientY - rect.top) * scaleY,
      origRegion,
    });
    setDragPreview(null);
  }, [effectiveCanEdit, effectiveFields]);

  const onSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (drag) {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const scaleX = svg.clientWidth / rect.width;
      const scaleY = svg.clientHeight / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      setDragPreview({ x: mx - drag.startMouseX, y: my - drag.startMouseY });
    }
    // Pointer tool: expand selection while dragging
    if (pointerDraggingRef.current && pointerSelection) {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const scaleX = svg.clientWidth / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      const normX = mx / pageWidth;
      // Find the clicked word (first word in the initial selection)
      const clickedWord = pointerSelection.words[0];
      if (clickedWord) {
        const selected = findWordsInSpan(clickedWord, pointerSelection.startNormX, normX);
        const region = computeWordRegion(selected);
        setPointerSelection({ words: selected, region, startNormX: pointerSelection.startNormX });
      }
    }
    handlers.onMouseMove(e);
  }, [drag, handlers, pointerSelection, findWordsInSpan, computeWordRegion, pageWidth]);

  const onSvgMouseUp = useCallback(() => {
    // Pointer tool: complete selection
    if (pointerDraggingRef.current && pointerSelection) {
      pointerDraggingRef.current = false;
      const region = pointerSelection.region;
      setPointerSelection(null);
      handlePointerComplete(region);
      return;
    }
    if (drag && dragPreview) {
      const dxNorm = dragPreview.x / pageWidth;
      const dyNorm = dragPreview.y / pageHeight;
      // Only commit if moved more than 2px
      if (Math.abs(dragPreview.x) > 2 || Math.abs(dragPreview.y) > 2) {
        const orig = drag.origRegion;
        const newRegion: Region = {
          ...orig,
          x: Math.max(0, Math.min(1 - orig.width, orig.x + dxNorm)),
          y: Math.max(0, Math.min(1 - orig.height, orig.y + dyNorm)),
        };
        updateFieldRegion(drag.fieldId, drag.regionType, newRegion);
      }
      setDrag(null);
      setDragPreview(null);
      return;
    }
    if (drag) {
      setDrag(null);
      setDragPreview(null);
      return;
    }
    handlers.onMouseUp();
  }, [drag, dragPreview, pageWidth, pageHeight, updateFieldRegion, handlers, pointerSelection, handlePointerComplete]);

  const onSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragStartedRef.current) {
      dragStartedRef.current = false;
      return;
    }
    // Click anywhere on the canvas (outside editing field's own handlers) exits edit modes
    if (editingFieldId) {
      setEditingFieldId(null);
    }
    if (chainEditFieldId) {
      setChainEditFieldId(null);
    }
    // Table wizard dividers phase: click to place vertical dividers
    if (tableWizard && tableWizard.phase === 'dividers' && tableWizard.tableBounds) {
      const svg = svgRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        const scaleX = svg.clientWidth / rect.width;
        const mx = (e.clientX - rect.left) * scaleX;
        const normX = mx / pageWidth;
        addTableDivider(normX);
      }
      return;
    }

    // Pointer tool: find word at click position
    const isPointerMode = drawTool === 'pointer' && effectiveCanEdit && !drag
      && !anchorWizard && !(tableWizard && tableWizard.phase === 'bounds')
      && !drawingRegionForStepId;
    if (isPointerMode) {
      const svg = svgRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        const scaleX = svg.clientWidth / rect.width;
        const scaleY = svg.clientHeight / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        const normX = mx / pageWidth;
        const normY = my / pageHeight;
        const word = findWordAt(normX, normY);
        if (word) {
          const region = computeWordRegion([word]);
          setPointerSelection({ words: [word], region, startNormX: normX });
          pointerDraggingRef.current = true;
          return;
        }
      }
      // No word found at click — don't start drawing in pointer mode
      return;
    }

    if (!drag && effectiveCanEdit) handlers.onMouseDown(e);
  }, [drag, handlers, editingFieldId, setEditingFieldId, chainEditFieldId, setChainEditFieldId, tableWizard, addTableDivider, pageWidth, pageHeight, drawTool, effectiveCanEdit, findWordAt, computeWordRegion, anchorWizard, drawingRegionForStepId]);
  const previewColor = drawingRegionForStepId
    ? { fill: 'rgba(245,158,11,0.1)', stroke: 'rgb(245,158,11)' }
    : drawMode === 'dynamic' && !pendingAnchor
      ? { fill: 'rgba(245,158,11,0.15)', stroke: 'rgb(245,158,11)' }
      : { fill: 'rgba(59,130,246,0.15)', stroke: 'rgb(59,130,246)' };

  const svgCursor = drag ? 'grabbing' : !effectiveCanEdit ? 'default' : drawTool === 'pointer' ? 'default' : 'crosshair';

  return (
    <svg ref={svgRef} className="absolute top-0 left-0 w-full h-full" style={{ cursor: svgCursor, zIndex: 10 }}
      onMouseDown={onSvgMouseDown} onMouseMove={onSvgMouseMove} onMouseUp={onSvgMouseUp}>
      <defs>
        <style>{`
          @keyframes pulse-anchor { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          .pending-anchor-rect { animation: pulse-anchor 1.5s ease-in-out infinite; }
        `}</style>
        <marker id="shift-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(99,102,241)" />
        </marker>
      </defs>

      {currentPageFields.filter(f => f.type !== 'table').map((field) => {
        const activeFieldId = editingFieldId ?? chainEditFieldId;
        const isHidden = activeFieldId && field.id !== activeFieldId;
        const isFieldEditing = editingFieldId === field.id;
        // Compute drag offset for this field's boxes
        const isDragging = drag?.fieldId === field.id;
        const valueDx = isDragging && drag.regionType === 'value' && dragPreview ? dragPreview.x : 0;
        const valueDy = isDragging && drag.regionType === 'value' && dragPreview ? dragPreview.y : 0;
        const anchorDx = isDragging && drag.regionType === 'anchor' && dragPreview ? dragPreview.x : 0;
        const anchorDy = isDragging && drag.regionType === 'anchor' && dragPreview ? dragPreview.y : 0;
        return (
          <g key={field.id} data-field-id={field.id}
            style={{ display: isHidden ? 'none' : undefined }}>
            <FieldOverlay field={field} pw={pageWidth} ph={pageHeight}
              currentPage={currentPage} onRemove={() => removeField(field.id)} result={resultByKey[`${field.source ?? 'a'}:${field.label}`] ?? resultByKey[field.label] ?? null}
              onStartDrag={effectiveCanEdit ? startDrag : undefined}
              isEditing={isFieldEditing}
              onSelect={effectiveCanEdit ? () => setEditingFieldId(field.id) : undefined}
              onUpdateLabel={effectiveCanEdit ? (label: string) => updateFieldLabel(field.id, label) : undefined}
              valueDragOffset={{ dx: valueDx, dy: valueDy }}
              anchorDragOffset={{ dx: anchorDx, dy: anchorDy }}
              source={source}
              readOnly={readOnly} />
          </g>
        );
      })}

      {/* Chain edit mode visualizations */}
      {chainEditFieldId && (() => {
        const editField = effectiveFields.find((f) => f.id === chainEditFieldId);
        if (!editField || editField.value_region.page !== currentPage) return null;
        return <ChainEditOverlay field={editField} pw={pageWidth} ph={pageHeight} />;
      })()}

      {/* Pending anchor */}
      {pendingAnchor && pendingAnchor.region.page === currentPage && (() => {
        const pos = normalizedToPixel(pendingAnchor.region.x, pendingAnchor.region.y, pageWidth, pageHeight);
        const dim = normalizedToPixel(pendingAnchor.region.width, pendingAnchor.region.height, pageWidth, pageHeight);
        return (
          <g className="pending-anchor-rect">
            <rect x={pos.x} y={pos.y} width={dim.x} height={dim.y}
              fill={COLORS.pendingAnchor.fill} stroke={COLORS.pendingAnchor.stroke} strokeWidth={2} strokeDasharray="6 3" rx={2} />
            <rect x={pos.x} y={pos.y - 18} width={Math.max(dim.x, pendingAnchor.expectedText.length * 7 + 24)} height={18}
              fill={COLORS.pendingAnchor.stroke} rx={2} />
            <AnchorIcon x={pos.x + 2} y={pos.y - 16} />
            <text x={pos.x + 15} y={pos.y - 4} fill="white" fontSize={10} fontWeight={600} fontFamily="system-ui, sans-serif">
              {pendingAnchor.expectedText}
            </text>
          </g>
        );
      })()}

      {/* Anchor wizard banner */}
      {anchorWizard && (() => {
        const step = anchorWizard.steps[anchorWizard.currentStep];
        const bannerText = `Step ${anchorWizard.currentStep + 1}/${anchorWizard.steps.length}: ${step.prompt}`;
        return (
          <g>
            <rect x={0} y={0} width={pageWidth} height={28} fill="rgba(245,158,11,0.95)" rx={0} />
            <text x={pageWidth / 2} y={18} fill="white" fontSize={12} fontWeight={600}
              fontFamily="system-ui, sans-serif" textAnchor="middle">
              {bannerText}
            </text>
          </g>
        );
      })()}

      {/* Table wizard banner */}
      {tableWizard && (() => {
        const bannerText = tableWizard.phase === 'bounds'
          ? 'Draw the table area (top-left to bottom-right)'
          : tableWizard.phase === 'dividers'
            ? `Click to place column dividers (${tableWizard.columns.length} columns) — press Done when finished`
            : 'Label your columns';
        return (
          <g>
            <rect x={0} y={0} width={pageWidth} height={28} fill="rgba(139,92,246,0.95)" rx={0} />
            <text x={pageWidth / 2} y={18} fill="white" fontSize={12} fontWeight={600}
              fontFamily="system-ui, sans-serif" textAnchor="middle">
              {bannerText}
            </text>
          </g>
        );
      })()}

      {/* Table wizard: show bounds + dividers being placed */}
      {tableWizard && tableWizard.tableBounds && (() => {
        const tb = tableWizard.tableBounds;
        const pos = normalizedToPixel(tb.x, tb.y, pageWidth, pageHeight);
        const dim = normalizedToPixel(tb.width, tb.height, pageWidth, pageHeight);
        return (
          <g>
            {/* Table bounds rectangle */}
            <rect x={pos.x} y={pos.y} width={dim.x} height={dim.y}
              fill={COLORS.tableField.fill} stroke={COLORS.tableField.stroke}
              strokeWidth={2} strokeDasharray="6 3" rx={2} />
            {/* Column dividers */}
            {tableWizard.columns.slice(1).map((col) => {
              const cx = normalizedToPixel(col.x, 0, pageWidth, pageHeight).x;
              return (
                <g key={col.id}>
                  <line x1={cx} y1={pos.y} x2={cx} y2={pos.y + dim.y}
                    stroke={COLORS.tableDivider.stroke} strokeWidth={2} strokeDasharray="4 3" />
                  <text x={cx + 3} y={pos.y + 12} fill="rgb(139,92,246)" fontSize={9} fontWeight={600}
                    fontFamily="system-ui, sans-serif">
                    {col.label}
                  </text>
                </g>
              );
            })}
            {/* First column label */}
            {tableWizard.columns[0] && (
              <text x={pos.x + 3} y={pos.y + 12} fill="rgb(139,92,246)" fontSize={9} fontWeight={600}
                fontFamily="system-ui, sans-serif">
                {tableWizard.columns[0].label}
              </text>
            )}
          </g>
        );
      })()}

      {/* Table fields: render table bounds + dividers for completed table fields */}
      {currentPageFields.filter(f => f.type === 'table' && f.table_config).map((field) => {
        const tc = field.table_config!;
        if (tc.table_region.page !== currentPage) return null;
        const fieldResult = resultByKey[`${field.source ?? 'a'}:${field.label}`] ?? resultByKey[field.label] ?? null;
        const resolvedHeight = fieldResult?.resolved_table_height ?? tc.table_region.height;
        const pos = normalizedToPixel(tc.table_region.x, tc.table_region.y, pageWidth, pageHeight);
        const dim = normalizedToPixel(tc.table_region.width, resolvedHeight, pageWidth, pageHeight);
        const resultColor = extractionResults
          ? getResultColor(fieldResult?.status ?? 'empty')
          : null;
        const color = resultColor ?? COLORS.tableField;
        return (
          <g key={`table-${field.id}`} className="group">
            {/* Table bounds */}
            <rect x={pos.x} y={pos.y} width={dim.x} height={dim.y}
              fill={color.fill} stroke={color.stroke} strokeWidth={2} rx={2} />
            {/* Label bar */}
            <rect x={pos.x} y={pos.y - 20} width={Math.max(dim.x, field.label.length * 8 + 30)} height={20}
              fill={color.stroke} rx={2} />
            <text x={pos.x + 4} y={pos.y - 5} fill="white" fontSize={12} fontWeight={600} fontFamily="system-ui, sans-serif">
              {field.label}
            </text>
            <text x={pos.x + field.label.length * 8 + 10} y={pos.y - 5} fill="rgba(255,255,255,0.7)" fontSize={9}
              fontFamily="system-ui, sans-serif">
              TABLE
            </text>
            {/* Column dividers */}
            {tc.columns.slice(1).map((col) => {
              const cx = normalizedToPixel(col.x, 0, pageWidth, pageHeight).x;
              return (
                <line key={col.id} x1={cx} y1={pos.y} x2={cx} y2={pos.y + dim.y}
                  stroke={COLORS.tableDivider.stroke} strokeWidth={1.5} strokeDasharray="4 3" />
              );
            })}
            {/* Column labels along top */}
            {tc.columns.map((col, i) => {
              const colX = normalizedToPixel(col.x, 0, pageWidth, pageHeight).x;
              const nextX = i + 1 < tc.columns.length
                ? normalizedToPixel(tc.columns[i + 1].x, 0, pageWidth, pageHeight).x
                : pos.x + dim.x;
              const colWidth = nextX - colX;
              return (
                <text key={col.id} x={colX + colWidth / 2} y={pos.y + dim.y + 14}
                  fill="rgb(139,92,246)" fontSize={9} fontWeight={600}
                  fontFamily="system-ui, sans-serif" textAnchor="middle">
                  {col.label}
                </text>
              );
            })}
            {/* End anchor indicator */}
            {tc.end_anchor_mode && tc.end_anchor_mode !== 'none' && (() => {
              const endY = tc.end_anchor_mode === 'end_of_page'
                ? pageHeight
                : pos.y + dim.y; // for "text" mode, show at drawn bottom (actual resolved at runtime)
              const lineY = tc.end_anchor_mode === 'end_of_page' ? pageHeight : pos.y + dim.y;
              const endLabel = tc.end_anchor_mode === 'end_of_page'
                ? '↓ end of page'
                : tc.end_anchor_text ? `↓ "${tc.end_anchor_text}"` : '↓ end anchor';
              return (
                <g>
                  {tc.end_anchor_mode === 'end_of_page' && (
                    <rect x={pos.x} y={pos.y + dim.y} width={dim.x} height={pageHeight - (pos.y + dim.y)}
                      fill="rgba(139,92,246,0.04)" stroke="none" />
                  )}
                  <line x1={pos.x} y1={lineY} x2={pos.x + dim.x} y2={lineY}
                    stroke="rgb(139,92,246)" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.7} />
                  <text x={pos.x + dim.x / 2} y={lineY + 12} fill="rgb(139,92,246)" fontSize={9} fontWeight={500}
                    fontFamily="system-ui, sans-serif" textAnchor="middle" opacity={0.8}>
                    {endLabel}
                  </text>
                </g>
              );
            })()}
            {/* Delete icon */}
            {effectiveCanEdit && (
              <g className="opacity-0 group-hover:opacity-100 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); removeField(field.id); }}>
                <circle cx={pos.x + dim.x - 8} cy={pos.y - 10} r={8} fill="rgb(239,68,68)" />
                <text x={pos.x + dim.x - 8} y={pos.y - 6} fill="white" fontSize={12}
                  fontWeight={700} textAnchor="middle" fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>x</text>
              </g>
            )}
          </g>
        );
      })}

      {/* Render completed wizard anchors */}
      {anchorWizard && anchorWizard.completedAnchors.map((anchor) => {
        const ap = normalizedToPixel(anchor.region.x, anchor.region.y, pageWidth, pageHeight);
        const ad = normalizedToPixel(anchor.region.width, anchor.region.height, pageWidth, pageHeight);
        const isArea = anchor.role === 'area_top' || anchor.role === 'area_bottom';
        return (
          <g key={anchor.id}>
            <rect x={ap.x} y={ap.y} width={ad.x} height={ad.y}
              fill={isArea ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.2)'}
              stroke={isArea ? 'rgb(34,197,94)' : 'rgb(245,158,11)'}
              strokeWidth={2} strokeDasharray={isArea ? '6 3' : undefined} rx={2} />
            <text x={ap.x + 3} y={ap.y - 4} fill={isArea ? 'rgb(34,197,94)' : 'rgb(245,158,11)'}
              fontSize={9} fontWeight={600} fontFamily="system-ui, sans-serif">
              {anchor.role}: {anchor.expected_text}
            </text>
          </g>
        );
      })}

      {currentRect && (
        <rect x={currentRect.x} y={currentRect.y} width={currentRect.width} height={currentRect.height}
          fill={previewColor.fill} stroke={previewColor.stroke} strokeWidth={2} strokeDasharray="6 3" rx={2} />
      )}

      {/* Pointer tool: selection preview */}
      {pointerSelection && (() => {
        const r = pointerSelection.region;
        const pos = normalizedToPixel(r.x, r.y, pageWidth, pageHeight);
        const dim = normalizedToPixel(r.width, r.height, pageWidth, pageHeight);
        return (
          <rect x={pos.x} y={pos.y} width={dim.x} height={dim.y}
            fill={previewColor.fill} stroke={previewColor.stroke} strokeWidth={2} rx={2}
            pointerEvents="none" />
        );
      })()}
    </svg>
  );
}

/** Small SVG anchor icon rendered inline */
function AnchorIcon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path d="M6 2a2 2 0 100 4 2 2 0 000-4zM6 7v5M6 12c-3 0-4-2-4-3M6 12c3 0 4-2 4-3M6 7H4M6 7h2"
        stroke="white" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round"
        transform="scale(0.85)" />
    </g>
  );
}

/** Renders chain edit mode visualizations: search regions, scan directions */
function ChainEditOverlay({ field, pw, ph }: { field: Field; pw: number; ph: number }) {
  if (!field.chain || field.chain.length === 0) return null;

  const elements: React.ReactNode[] = [];

  for (const step of field.chain) {
    if (step.category === 'search' && step.type === 'vertical_slide' && field.anchor_region) {
      const tolerance = step.slide_tolerance ?? 0.3;
      const ar = field.anchor_region;
      const searchY = Math.max(0, ar.y - tolerance);
      const searchHeight = Math.min(1, ar.height + 2 * tolerance);
      const pos = normalizedToPixel(ar.x, searchY, pw, ph);
      const dim = normalizedToPixel(ar.width, searchHeight, pw, ph);
      elements.push(
        <g key={`chain-${step.id}`}>
          <rect x={pos.x} y={pos.y} width={dim.x} height={dim.y}
            fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.3)" strokeWidth={1} strokeDasharray="4 2" rx={3} />
          <text x={pos.x + 3} y={pos.y + 10} fill="rgba(245,158,11,0.6)" fontSize={8} fontFamily="system-ui, sans-serif">
            ±{(tolerance * 100).toFixed(0)}% slide
          </text>
        </g>
      );
    }

    if (step.category === 'value' && step.type === 'adjacent_scan' && field.anchor_region) {
      const ar = field.anchor_region;
      const direction = step.search_direction ?? 'right';
      const aCenter = regionCenter(ar, pw, ph);
      if (direction === 'right') {
        elements.push(
          <g key={`chain-${step.id}`}>
            <line x1={aCenter.cx + 20} y1={aCenter.cy} x2={aCenter.cx + 60} y2={aCenter.cy}
              stroke="rgba(59,130,246,0.5)" strokeWidth={1.5} strokeDasharray="3 2"
              markerEnd="url(#shift-arrow)" />
            <text x={aCenter.cx + 25} y={aCenter.cy - 5} fill="rgba(59,130,246,0.5)" fontSize={8} fontFamily="system-ui, sans-serif">
              scan →
            </text>
          </g>
        );
      } else {
        elements.push(
          <g key={`chain-${step.id}`}>
            <line x1={aCenter.cx} y1={aCenter.cy + 15} x2={aCenter.cx} y2={aCenter.cy + 50}
              stroke="rgba(59,130,246,0.5)" strokeWidth={1.5} strokeDasharray="3 2"
              markerEnd="url(#shift-arrow)" />
            <text x={aCenter.cx + 5} y={aCenter.cy + 30} fill="rgba(59,130,246,0.5)" fontSize={8} fontFamily="system-ui, sans-serif">
              scan ↓
            </text>
          </g>
        );
      }
    }

    if (step.category === 'search' && step.type === 'full_page_search') {
      elements.push(
        <g key={`chain-${step.id}`}>
          <rect x={2} y={2} width={pw - 4} height={ph - 4}
            fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth={1} strokeDasharray="8 4" rx={4} />
        </g>
      );
    }

    if (step.category === 'search' && step.type === 'region_search' && step.search_region) {
      const sr = step.search_region;
      const pos = normalizedToPixel(sr.x, sr.y, pw, ph);
      const dim = normalizedToPixel(sr.width, sr.height, pw, ph);
      elements.push(
        <g key={`chain-${step.id}`}>
          <rect x={pos.x} y={pos.y} width={dim.x} height={dim.y}
            fill="rgba(245,158,11,0.06)" stroke="rgba(245,158,11,0.4)" strokeWidth={1.5} strokeDasharray="6 3" rx={3} />
          <text x={pos.x + 3} y={pos.y + 10} fill="rgba(245,158,11,0.6)" fontSize={8} fontFamily="system-ui, sans-serif">
            search region
          </text>
        </g>
      );
    }
  }

  // Draw offset vector from anchor to value
  if (field.type === 'dynamic' && field.anchor_region) {
    const ac = regionCenter(field.anchor_region, pw, ph);
    const vc = regionCenter(field.value_region, pw, ph);
    elements.push(
      <g key="chain-offset-vector">
        <line x1={ac.cx} y1={ac.cy} x2={vc.cx} y2={vc.cy}
          stroke="rgba(99,102,241,0.4)" strokeWidth={1.5} strokeDasharray="4 3"
          markerEnd="url(#shift-arrow)" />
      </g>
    );
  }

  return <>{elements}</>;
}

/** Renders a field with ghost boxes and shift arrows when anchor has shifted */
function FieldOverlay({ field, pw, ph, currentPage, onRemove, result, onStartDrag, isEditing, onSelect, onUpdateLabel, valueDragOffset, anchorDragOffset, source, readOnly = false }: {
  field: Field; pw: number; ph: number; currentPage: number; onRemove: () => void; result: FieldResult | null;
  onStartDrag?: (fieldId: string, regionType: 'value' | 'anchor', e: React.MouseEvent) => void;
  isEditing?: boolean;
  onSelect?: () => void;
  onUpdateLabel?: (label: string) => void;
  valueDragOffset: { dx: number; dy: number };
  anchorDragOffset: { dx: number; dy: number };
  source?: 'a' | 'b';
  readOnly?: boolean;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(field.label);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const templateMode = useAppStore((s) => s.templateMode);
  const storeCanEdit = useAppStore((s) => s.canDrawFields);
  const canEdit = readOnly ? false : storeCanEdit;
  const setConnectDragFrom = useAppStore((s) => s.setConnectDragFrom);
  const setConnectDragMouse = useAppStore((s) => s.setConnectDragMouse);
  const isComparisonMode = source !== undefined && templateMode === 'comparison';
  const hasResult = result !== null;
  const isShifted = hasResult && (result.status === 'anchor_shifted' || result.status === 'anchor_relocated');
  const dx = result?.anchor_dx ?? 0;
  const dy = result?.anchor_dy ?? 0;

  const shiftX = dx * pw;
  const shiftY = dy * ph;

  // When adjacent scan found value at a specific position, use that instead of offset
  const hasFoundValue = hasResult && result.value_found_x != null && result.value_found_y != null;

  const valueOnPage = field.value_region.page === currentPage;
  const anchorOnPage = field.anchor_region?.page === currentPage;

  // Original template positions + drag offsets
  const vPosRaw = valueOnPage ? normalizedToPixel(field.value_region.x, field.value_region.y, pw, ph) : null;
  const vPos = vPosRaw ? { x: vPosRaw.x + valueDragOffset.dx, y: vPosRaw.y + valueDragOffset.dy } : null;
  const vDim = valueOnPage ? normalizedToPixel(field.value_region.width, field.value_region.height, pw, ph) : null;
  const aPosRaw = anchorOnPage && field.anchor_region ? normalizedToPixel(field.anchor_region.x, field.anchor_region.y, pw, ph) : null;
  const aPos = aPosRaw ? { x: aPosRaw.x + anchorDragOffset.dx, y: aPosRaw.y + anchorDragOffset.dy } : null;
  const aDim = anchorOnPage && field.anchor_region ? normalizedToPixel(field.anchor_region.width, field.anchor_region.height, pw, ph) : null;
  const isDraggingValue = valueDragOffset.dx !== 0 || valueDragOffset.dy !== 0;
  const isDraggingAnchor = anchorDragOffset.dx !== 0 || anchorDragOffset.dy !== 0;

  // Actual value position (from adjacent scan, intersection, or offset)
  let actualVx: number | null = null;
  let actualVy: number | null = null;
  let actualVw: number | null = null;
  if (vPos && vDim) {
    if (hasFoundValue) {
      // Value found at exact position (adjacent scan, intersection, etc.)
      const fp = normalizedToPixel(result.value_found_x!, result.value_found_y!, pw, ph);
      actualVx = fp.x;
      actualVy = fp.y;
      actualVw = result.value_found_width ? result.value_found_width * pw : vDim.x;
    } else if (isShifted) {
      // Offset-based shift
      actualVx = vPos.x + shiftX;
      actualVy = vPos.y + shiftY;
      actualVw = vDim.x;
    }
  }

  // Colors
  const resultColor = hasResult ? getResultColor(result.status) : null;
  const valueColor = resultColor ?? (field.type === 'static' ? COLORS.staticValue : COLORS.dynamicValue);
  const anchorBaseColor = hasResult && result.status === 'anchor_mismatch' ? COLORS.resultError : COLORS.dynamicAnchor;
  const shiftedColor = result?.status === 'anchor_shifted' ? COLORS.resultShifted : COLORS.resultRelocated;

  // Connecting line (only when not shifted)
  let lineCoords: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (field.type === 'dynamic' && field.anchor_region && valueOnPage && anchorOnPage && !isShifted) {
    const ac = regionCenter(field.anchor_region, pw, ph);
    const vc = regionCenter(field.value_region, pw, ph);
    lineCoords = { x1: ac.cx, y1: ac.cy, x2: vc.cx, y2: vc.cy };
  }

  const vHeight = vDim?.y ?? 16;

  const startLabelEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateLabel) return;
    if (!isEditing && onSelect) onSelect();
    setLabelDraft(field.label);
    setEditingLabel(true);
    setTimeout(() => labelInputRef.current?.focus(), 0);
  }, [isEditing, onSelect, onUpdateLabel, field.label]);

  const commitLabel = useCallback(() => {
    if (onUpdateLabel && labelDraft.trim() && labelDraft.trim() !== field.label) {
      onUpdateLabel(labelDraft.trim());
    }
    setEditingLabel(false);
  }, [onUpdateLabel, labelDraft, field.label]);

  return (
    <g className="group">
      {lineCoords && (
        <line x1={lineCoords.x1} y1={lineCoords.y1} x2={lineCoords.x2} y2={lineCoords.y2}
          stroke="rgb(156,163,175)" strokeWidth={1} strokeDasharray="4 3" />
      )}

      {isShifted && aPos && aDim && vPos && vDim && actualVx != null && actualVy != null ? (
        <>
          {/* ── GHOST: original positions ── */}
          <rect x={aPos.x} y={aPos.y} width={aDim.x} height={aDim.y}
            fill={COLORS.ghost.fill} stroke={COLORS.ghost.stroke} strokeWidth={1} strokeDasharray="4 2" rx={2} />
          <rect x={vPos.x} y={vPos.y} width={vDim.x} height={vDim.y}
            fill={COLORS.ghost.fill} stroke={COLORS.ghost.stroke} strokeWidth={1} strokeDasharray="4 2" rx={2} />
          <text x={vPos.x + 3} y={vPos.y - 3} fill="rgba(156,163,175,0.5)" fontSize={9}
            fontWeight={500} fontFamily="system-ui, sans-serif">{field.label} (original)</text>

          {/* ── SHIFT ARROWS ── */}
          {(Math.abs(shiftX) > 1 || Math.abs(shiftY) > 1) && (
            <line x1={aPos.x + aDim.x / 2} y1={aPos.y + aDim.y / 2}
              x2={aPos.x + aDim.x / 2 + shiftX} y2={aPos.y + aDim.y / 2 + shiftY}
              stroke="rgb(99,102,241)" strokeWidth={1.5} strokeDasharray="3 2" markerEnd="url(#shift-arrow)" />
          )}
          {/* Arrow from ghost value to actual value */}
          <line x1={vPos.x + vDim.x / 2} y1={vPos.y + vDim.y / 2}
            x2={actualVx + (actualVw ?? vDim.x) / 2} y2={actualVy + vHeight / 2}
            stroke="rgb(99,102,241)" strokeWidth={1.5} strokeDasharray="3 2" markerEnd="url(#shift-arrow)" />

          {/* ── NEW: anchor at shifted position ── */}
          <rect x={aPos.x + shiftX} y={aPos.y + shiftY} width={aDim.x} height={aDim.y}
            fill={shiftedColor.fill} stroke={shiftedColor.stroke} strokeWidth={2} rx={2} />
          <rect x={aPos.x + shiftX} y={aPos.y + shiftY - 18}
            width={Math.max(aDim.x, (field.expected_anchor_text ?? '').length * 7 + 20)} height={18}
            fill={shiftedColor.stroke} rx={2} />
          <AnchorIcon x={aPos.x + shiftX + 2} y={aPos.y + shiftY - 16} />
          <text x={aPos.x + shiftX + 15} y={aPos.y + shiftY - 4} fill="white" fontSize={10} fontWeight={600} fontFamily="system-ui, sans-serif">
            {field.expected_anchor_text}
          </text>

          {/* ── NEW: value at actual found position ── */}
          <rect x={actualVx} y={actualVy} width={actualVw ?? vDim.x} height={vHeight}
            fill={shiftedColor.fill} stroke={shiftedColor.stroke} strokeWidth={3} rx={2} />
          <rect x={actualVx} y={actualVy - 20}
            width={Math.max(actualVw ?? vDim.x, field.label.length * 8 + 36)} height={20}
            fill={shiftedColor.stroke} rx={2} />
          <text x={actualVx + 4} y={actualVy - 5} fill="white" fontSize={12} fontWeight={600} fontFamily="system-ui, sans-serif">
            {field.label}
          </text>
          <text x={actualVx + field.label.length * 8 + 12} y={actualVy - 5} fill="white" fontSize={12} fontWeight={700} fontFamily="system-ui, sans-serif">
            {result.status === 'anchor_shifted' ? '\u2713' : '\u26A0'}
          </text>

          {/* Connecting line: shifted anchor ↔ actual value */}
          <line x1={aPos.x + shiftX + aDim.x / 2} y1={aPos.y + shiftY + aDim.y / 2}
            x2={actualVx + (actualVw ?? vDim.x) / 2} y2={actualVy + vHeight / 2}
            stroke={shiftedColor.stroke} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />

          {/* Delete on hover */}
          <g className="opacity-0 group-hover:opacity-100 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            <circle cx={actualVx + (actualVw ?? vDim.x) - 8} cy={actualVy - 10} r={8} fill="rgb(239,68,68)" />
            <text x={actualVx + (actualVw ?? vDim.x) - 8} y={actualVy - 6} fill="white" fontSize={12}
              fontWeight={700} textAnchor="middle" fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>x</text>
          </g>
        </>
      ) : (
        <>
          {/* ── NORMAL RENDERING (no shift) ── */}
          {/* Legacy single anchor rendering (when no anchors array) */}
          {aPos && aDim && (!field.anchors || field.anchors.length === 0) && (
            <>
              <rect x={aPos.x} y={aPos.y} width={aDim.x} height={aDim.y}
                fill={hasResult && result.status === 'anchor_mismatch' ? COLORS.resultError.fill : hasResult ? (resultColor?.fill ?? anchorBaseColor.fill) : anchorBaseColor.fill}
                stroke={isDraggingAnchor ? 'rgb(99,102,241)' : hasResult && result.status === 'anchor_mismatch' ? COLORS.resultError.stroke : hasResult ? (resultColor?.stroke ?? anchorBaseColor.stroke) : anchorBaseColor.stroke}
                strokeWidth={isDraggingAnchor ? 3 : 2} strokeDasharray={isDraggingAnchor ? '4 2' : undefined} rx={2} />
              <rect x={aPos.x} y={aPos.y - 18}
                width={Math.max(aDim.x, (field.expected_anchor_text ?? '').length * 7 + 20)} height={18}
                fill={hasResult && result.status === 'anchor_mismatch' ? COLORS.resultError.stroke : anchorBaseColor.stroke} rx={2} />
              <AnchorIcon x={aPos.x + 2} y={aPos.y - 16} />
              <text x={aPos.x + 15} y={aPos.y - 4} fill="white" fontSize={10} fontWeight={600} fontFamily="system-ui, sans-serif">
                {field.expected_anchor_text}
              </text>
              {onStartDrag && (
                <rect x={aPos.x} y={aPos.y} width={aDim.x} height={aDim.y}
                  fill="transparent" style={{ cursor: 'move' }} rx={2}
                  onMouseDown={(e) => onStartDrag(field.id, 'anchor', e)} />
              )}
            </>
          )}

          {/* Area shading between area_top and area_bottom anchors */}
          {field.anchors && (() => {
            const areaTop = field.anchors.find(a => a.role === 'area_top' && a.region.page === currentPage);
            const areaBottom = field.anchors.find(a => a.role === 'area_bottom' && a.region.page === currentPage);
            if (!areaTop || !areaBottom) return null;
            // Use found positions if available, otherwise template positions
            const foundTop = hasResult && result.anchors_found?.['area_top'];
            const foundBottom = hasResult && result.anchors_found?.['area_bottom'];
            const topPos = foundTop
              ? normalizedToPixel(foundTop.x, foundTop.y, pw, ph)
              : normalizedToPixel(areaTop.region.x, areaTop.region.y, pw, ph);
            const topDim = foundTop
              ? normalizedToPixel(foundTop.width, foundTop.height, pw, ph)
              : normalizedToPixel(areaTop.region.width, areaTop.region.height, pw, ph);
            const bottomPos = foundBottom
              ? normalizedToPixel(foundBottom.x, foundBottom.y, pw, ph)
              : normalizedToPixel(areaBottom.region.x, areaBottom.region.y, pw, ph);
            // Use value box x-range for horizontal constraint, full width as fallback
            const vr = field.value_region;
            const vrPos = normalizedToPixel(vr.x, vr.y, pw, ph);
            const vrDim = normalizedToPixel(vr.width, vr.height, pw, ph);
            const areaX = vrPos.x;
            const areaRight = vrPos.x + vrDim.x;
            const areaY = topPos.y + topDim.y;
            const areaH = bottomPos.y - areaY;
            if (areaH <= 0) return null;
            return (
              <rect
                x={areaX} y={areaY} width={areaRight - areaX} height={areaH}
                fill="rgba(34,197,94,0.06)"
                stroke="rgba(34,197,94,0.25)"
                strokeWidth={1} strokeDasharray="8 4" rx={4}
              />
            );
          })()}

          {/* Multi-anchor rendering from field.anchors[] */}
          {field.anchors?.map((anchor) => {
            if (anchor.region.page !== currentPage) return null;
            const ap = normalizedToPixel(anchor.region.x, anchor.region.y, pw, ph);
            const ad = normalizedToPixel(anchor.region.width, anchor.region.height, pw, ph);
            const isArea = anchor.role === 'area_top' || anchor.role === 'area_bottom';
            const isSecondary = anchor.role === 'secondary';
            const anchorColor = isArea
              ? { fill: 'rgba(34,197,94,0.15)', stroke: 'rgb(34,197,94)', label: 'rgb(34,197,94)' }
              : isSecondary
                ? { fill: 'rgba(249,115,22,0.2)', stroke: 'rgb(249,115,22)', label: 'rgb(249,115,22)' }
                : { fill: 'rgba(245,158,11,0.2)', stroke: 'rgb(245,158,11)', label: 'rgb(245,158,11)' };
            const labelText = anchor.expected_text;

            // Check if backend returned a found position for this anchor
            const foundPos = hasResult && result.anchors_found?.[anchor.role];
            if (foundPos) {
              // Anchor was found at a different position — show ghost at original, anchor at found
              const fp = normalizedToPixel(foundPos.x, foundPos.y, pw, ph);
              const fd = normalizedToPixel(foundPos.width, foundPos.height, pw, ph);
              const foundLabelWidth = Math.max(fd.x, labelText.length * 6.5 + 24);
              const origLabelWidth = Math.max(ad.x, labelText.length * 6.5 + 24);
              return (
                <g key={anchor.id}>
                  {/* Ghost: original template position in gray */}
                  <rect x={ap.x} y={ap.y} width={ad.x} height={ad.y}
                    fill={COLORS.ghost.fill} stroke={COLORS.ghost.stroke}
                    strokeWidth={1} strokeDasharray="4 2" rx={2} />
                  <rect x={ap.x} y={ap.y - 16} width={origLabelWidth} height={16}
                    fill="rgba(156,163,175,0.5)" rx={2} />
                  <AnchorIcon x={ap.x + 1} y={ap.y - 14} />
                  <text x={ap.x + 14} y={ap.y - 3} fill="rgba(255,255,255,0.7)" fontSize={9} fontWeight={600} fontFamily="system-ui, sans-serif">
                    {labelText}
                  </text>
                  {/* Found position: anchor at where it was actually found */}
                  <rect x={fp.x} y={fp.y} width={fd.x} height={fd.y}
                    fill={anchorColor.fill} stroke={anchorColor.stroke}
                    strokeWidth={2} strokeDasharray={isArea ? '6 3' : undefined} rx={2} />
                  <rect x={fp.x} y={fp.y - 16} width={foundLabelWidth} height={16}
                    fill={anchorColor.stroke} rx={2} />
                  <AnchorIcon x={fp.x + 1} y={fp.y - 14} />
                  <text x={fp.x + 14} y={fp.y - 3} fill="white" fontSize={9} fontWeight={600} fontFamily="system-ui, sans-serif">
                    {labelText}
                  </text>
                  <text x={fp.x + foundLabelWidth - 3} y={fp.y - 3} fill="rgba(255,255,255,0.6)" fontSize={7} fontWeight={500}
                    fontFamily="system-ui, sans-serif" textAnchor="end">
                    {anchor.role}
                  </text>
                </g>
              );
            }

            // No found position — render at template position as before
            const labelWidth = Math.max(ad.x, labelText.length * 6.5 + 24);
            return (
              <g key={anchor.id}>
                <rect x={ap.x} y={ap.y} width={ad.x} height={ad.y}
                  fill={anchorColor.fill} stroke={anchorColor.stroke}
                  strokeWidth={2} strokeDasharray={isArea ? '6 3' : undefined} rx={2} />
                <rect x={ap.x} y={ap.y - 16} width={labelWidth} height={16}
                  fill={anchorColor.stroke} rx={2} />
                <AnchorIcon x={ap.x + 1} y={ap.y - 14} />
                <text x={ap.x + 14} y={ap.y - 3} fill="white" fontSize={9} fontWeight={600} fontFamily="system-ui, sans-serif">
                  {labelText}
                </text>
                <text x={ap.x + labelWidth - 3} y={ap.y - 3} fill="rgba(255,255,255,0.6)" fontSize={7} fontWeight={500}
                  fontFamily="system-ui, sans-serif" textAnchor="end">
                  {anchor.role}
                </text>
              </g>
            );
          })}

          {vPos && vDim && (() => {
            // When value was found at a different position, show ghost at original and render at found position
            const showFoundValue = hasFoundValue && actualVx != null && actualVy != null && !isShifted;
            const drawVx = showFoundValue ? actualVx! : vPos.x;
            const drawVy = showFoundValue ? actualVy! : vPos.y;
            const drawVw = showFoundValue ? (actualVw ?? vDim.x) : vDim.x;
            const drawVh = vDim.y;
            const labelBarWidth = Math.max(drawVw, field.label.length * 8 + (hasResult ? 36 : 16));
            return (
            <>
              {/* Ghost: original value position in gray (only when value was found elsewhere) */}
              {showFoundValue && (
                <>
                  <rect x={vPos.x} y={vPos.y} width={vDim.x} height={vDim.y}
                    fill={COLORS.ghost.fill} stroke={COLORS.ghost.stroke}
                    strokeWidth={1} strokeDasharray="4 2" rx={2} />
                  <text x={vPos.x + 3} y={vPos.y - 3} fill="rgba(156,163,175,0.5)" fontSize={9}
                    fontWeight={500} fontFamily="system-ui, sans-serif">{field.label} (original)</text>
                </>
              )}
              <rect data-field-value={field.id} x={drawVx} y={drawVy} width={drawVw} height={drawVh}
                fill={valueColor.fill}
                stroke={isDraggingValue ? 'rgb(99,102,241)' : isEditing ? 'rgb(99,102,241)' : valueColor.stroke}
                strokeWidth={isDraggingValue ? 3 : isEditing ? 3 : hasResult ? 3 : 2}
                strokeDasharray={isDraggingValue ? '4 2' : isEditing ? '6 3' : undefined} rx={2} />
              {/* Resolved extraction region (expanded area) */}
              {hasResult && result.resolved_region && result.resolved_region.page === currentPage && (() => {
                const rr = result.resolved_region;
                const rrPos = normalizedToPixel(rr.x, rr.y, pw, ph);
                const rrDim = normalizedToPixel(rr.width, rr.height, pw, ph);
                return (
                  <rect
                    x={rrPos.x} y={rrPos.y}
                    width={rrDim.x} height={rrDim.y}
                    fill="rgba(59,130,246,0.04)"
                    stroke="rgb(59,130,246)"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    rx={2}
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })()}
              {/* Label bar */}
              <rect x={drawVx} y={drawVy - 20}
                width={labelBarWidth} height={20}
                fill={isEditing ? 'rgb(99,102,241)' : valueColor.stroke} rx={2} />
              {/* Inline label editing */}
              {editingLabel ? (
                <foreignObject x={drawVx} y={drawVy - 20}
                  width={Math.max(labelBarWidth, 160)} height={20}>
                  <input
                    ref={labelInputRef}
                    value={labelDraft}
                    onChange={(e) => setLabelDraft((e.target as HTMLInputElement).value)}
                    onBlur={commitLabel}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitLabel();
                      if (e.key === 'Escape') setEditingLabel(false);
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      width: '100%', height: '100%', background: 'rgb(99,102,241)', color: 'white',
                      border: 'none', outline: 'none', padding: '0 4px', fontSize: '12px', fontWeight: 600,
                      fontFamily: 'system-ui, sans-serif', borderRadius: '2px',
                    }}
                  />
                </foreignObject>
              ) : (
                <text x={drawVx + 4} y={drawVy - 5} fill="white" fontSize={12} fontWeight={600} fontFamily="system-ui, sans-serif"
                  style={{ pointerEvents: 'none' }}>
                  {field.label}
                </text>
              )}
              {hasResult && !editingLabel && (
                <text x={drawVx + field.label.length * 8 + 12} y={drawVy - 5} fill="white" fontSize={12} fontWeight={700} fontFamily="system-ui, sans-serif">
                  {result.status === 'ok' || result.status === 'anchor_shifted' ? '\u2713' : result.status === 'empty' ? '\u2014' : '\u2717'}
                </text>
              )}
              {/* Hover edit icon (pencil) — enters edit mode + inline rename */}
              {onUpdateLabel && !editingLabel && (
                <g className="opacity-0 group-hover:opacity-100 cursor-pointer"
                  onClick={startLabelEdit}>
                  <circle cx={drawVx + labelBarWidth + 12} cy={drawVy - 10} r={9} fill="rgb(99,102,241)" />
                  <g transform={`translate(${drawVx + labelBarWidth + 5.5}, ${drawVy - 16.5})`}>
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="scale(0.54)" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="scale(0.54)" />
                  </g>
                </g>
              )}
              {/* Drag handle for value */}
              {onStartDrag && (
                <rect x={drawVx} y={drawVy} width={drawVw} height={drawVh}
                  fill="transparent" style={{ cursor: 'move' }} rx={2}
                  onMouseDown={(e) => onStartDrag(field.id, 'value', e)} />
              )}
              {/* Delete icon on hover */}
              <g className="opacity-0 group-hover:opacity-100 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                <circle cx={drawVx + drawVw - 8} cy={drawVy - 10} r={8} fill="rgb(239,68,68)" />
                <text x={drawVx + drawVw - 8} y={drawVy - 6} fill="white" fontSize={12}
                  fontWeight={700} textAnchor="middle" fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>x</text>
              </g>
              {/* Connection node for comparison mode — on the outer side edge */}
              {isComparisonMode && canEdit && (() => {
                const nodeX = source === 'a' ? drawVx + drawVw : drawVx;
                const nodeY = drawVy + drawVh / 2;
                return (
                  <g data-connect-node={field.id} style={{ cursor: 'crosshair' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setConnectDragFrom({ fieldId: field.id, source: source! });
                      setConnectDragMouse({ x: e.clientX, y: e.clientY });
                    }}>
                    {/* Outer ring */}
                    <circle cx={nodeX} cy={nodeY} r={7}
                      fill="white" stroke="rgb(139,92,246)" strokeWidth={2} />
                    {/* Inner dot */}
                    <circle cx={nodeX} cy={nodeY} r={3}
                      fill="rgb(139,92,246)" />
                  </g>
                );
              })()}
            </>
            );
          })()}
        </>
      )}
    </g>
  );
}
