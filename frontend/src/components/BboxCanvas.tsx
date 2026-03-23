import { useCallback, useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useBboxDrawing } from '../hooks/useBboxDrawing';
import { normalizedToPixel, pixelToNormalized } from '../utils/coords';
import { detectFormat } from '../api/client';
import type { Field, FieldResult, Region } from '../types';

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

interface Props { pageWidth: number; pageHeight: number; source?: "a" | "b" }

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

export default function BboxCanvas({ pageWidth, pageHeight, source }: Props) {
  const currentPage = useAppStore((s) => source === 'b' ? s.currentPageB : s.currentPage);
  const fields = useAppStore((s) => s.fields);
  const addField = useAppStore((s) => s.addField);
  const removeField = useAppStore((s) => s.removeField);
  const drawMode = useAppStore((s) => s.drawMode);
  const pendingAnchor = useAppStore((s) => s.pendingAnchor);
  const setPendingAnchor = useAppStore((s) => s.setPendingAnchor);
  const pdfId = useAppStore((s) => s.pdfId);
  const extractionResults = useAppStore((s) => s.extractionResults);
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

  // Drag state for moving existing boxes
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(null);
  const dragStartedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

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

  const currentPageFields = fields.filter(
    (f) => {
      const onPage = f.value_region.page === currentPage || (f.anchor_region && f.anchor_region.page === currentPage);
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
      if (!canEdit) return;
      const region = pixelRectToRegion(rect, currentPage, pageWidth, pageHeight);

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
    [canEdit, addField, currentPage, pageWidth, pageHeight, drawMode, pendingAnchor, setPendingAnchor, pdfId, drawingRegionForStepId, updateChainStep, setDrawingRegionForStepId, anchorWizard, completeAnchorWizardStep]
  );

  const { currentRect, handlers } = useBboxDrawing(onDrawComplete);

  const startDrag = useCallback((fieldId: string, regionType: 'value' | 'anchor', e: React.MouseEvent) => {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = svg.clientWidth / rect.width;
    const scaleY = svg.clientHeight / rect.height;
    const field = fields.find((f) => f.id === fieldId);
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
  }, [canEdit, fields]);

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
    handlers.onMouseMove(e);
  }, [drag, handlers]);

  const onSvgMouseUp = useCallback(() => {
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
  }, [drag, dragPreview, pageWidth, pageHeight, updateFieldRegion, handlers]);

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
    if (!drag && canEdit) handlers.onMouseDown(e);
  }, [drag, handlers, editingFieldId, setEditingFieldId, chainEditFieldId, setChainEditFieldId]);
  const previewColor = drawingRegionForStepId
    ? { fill: 'rgba(245,158,11,0.1)', stroke: 'rgb(245,158,11)' }
    : drawMode === 'dynamic' && !pendingAnchor
      ? { fill: 'rgba(245,158,11,0.15)', stroke: 'rgb(245,158,11)' }
      : { fill: 'rgba(59,130,246,0.15)', stroke: 'rgb(59,130,246)' };

  return (
    <svg ref={svgRef} className="absolute top-0 left-0 w-full h-full" style={{ cursor: drag ? 'grabbing' : canEdit ? 'crosshair' : 'default', zIndex: 10 }}
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

      {currentPageFields.map((field) => {
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
              onStartDrag={canEdit ? startDrag : undefined}
              isEditing={isFieldEditing}
              onSelect={canEdit ? () => setEditingFieldId(field.id) : undefined}
              onUpdateLabel={canEdit ? (label: string) => updateFieldLabel(field.id, label) : undefined}
              valueDragOffset={{ dx: valueDx, dy: valueDy }}
              anchorDragOffset={{ dx: anchorDx, dy: anchorDy }}
              source={source} />
          </g>
        );
      })}

      {/* Chain edit mode visualizations */}
      {chainEditFieldId && (() => {
        const editField = fields.find((f) => f.id === chainEditFieldId);
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
function FieldOverlay({ field, pw, ph, currentPage, onRemove, result, onStartDrag, isEditing, onSelect, onUpdateLabel, valueDragOffset, anchorDragOffset, source }: {
  field: Field; pw: number; ph: number; currentPage: number; onRemove: () => void; result: FieldResult | null;
  onStartDrag?: (fieldId: string, regionType: 'value' | 'anchor', e: React.MouseEvent) => void;
  isEditing?: boolean;
  onSelect?: () => void;
  onUpdateLabel?: (label: string) => void;
  valueDragOffset: { dx: number; dy: number };
  anchorDragOffset: { dx: number; dy: number };
  source?: 'a' | 'b';
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(field.label);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const templateMode = useAppStore((s) => s.templateMode);
  const canEdit = useAppStore((s) => s.canDrawFields);
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

  // Actual value position (from adjacent scan or offset)
  let actualVx: number | null = null;
  let actualVy: number | null = null;
  let actualVw: number | null = null;
  if (isShifted && vPos && vDim) {
    if (hasFoundValue) {
      // Adjacent scan found value at exact position
      const fp = normalizedToPixel(result.value_found_x!, result.value_found_y!, pw, ph);
      actualVx = fp.x;
      actualVy = fp.y;
      actualVw = result.value_found_width ? result.value_found_width * pw : vDim.x;
    } else {
      // Offset-based
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
            const topPos = normalizedToPixel(areaTop.region.x, areaTop.region.y, pw, ph);
            const topDim = normalizedToPixel(areaTop.region.width, areaTop.region.height, pw, ph);
            const bottomPos = normalizedToPixel(areaBottom.region.x, areaBottom.region.y, pw, ph);
            const bottomDim = normalizedToPixel(areaBottom.region.width, areaBottom.region.height, pw, ph);
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
            const labelBarWidth = Math.max(vDim.x, field.label.length * 8 + (hasResult ? 36 : 16));
            return (
            <>
              <rect data-field-value={field.id} x={vPos.x} y={vPos.y} width={vDim.x} height={vDim.y}
                fill={valueColor.fill}
                stroke={isDraggingValue ? 'rgb(99,102,241)' : isEditing ? 'rgb(99,102,241)' : valueColor.stroke}
                strokeWidth={isDraggingValue ? 3 : isEditing ? 3 : hasResult ? 3 : 2}
                strokeDasharray={isDraggingValue ? '4 2' : isEditing ? '6 3' : undefined} rx={2} />
              {/* Label bar */}
              <rect x={vPos.x} y={vPos.y - 20}
                width={labelBarWidth} height={20}
                fill={isEditing ? 'rgb(99,102,241)' : valueColor.stroke} rx={2} />
              {/* Inline label editing */}
              {editingLabel ? (
                <foreignObject x={vPos.x} y={vPos.y - 20}
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
                <text x={vPos.x + 4} y={vPos.y - 5} fill="white" fontSize={12} fontWeight={600} fontFamily="system-ui, sans-serif"
                  style={{ pointerEvents: 'none' }}>
                  {field.label}
                </text>
              )}
              {hasResult && !editingLabel && (
                <text x={vPos.x + field.label.length * 8 + 12} y={vPos.y - 5} fill="white" fontSize={12} fontWeight={700} fontFamily="system-ui, sans-serif">
                  {result.status === 'ok' || result.status === 'anchor_shifted' ? '\u2713' : result.status === 'empty' ? '\u2014' : '\u2717'}
                </text>
              )}
              {/* Hover edit icon (pencil) — enters edit mode + inline rename */}
              {onUpdateLabel && !editingLabel && (
                <g className="opacity-0 group-hover:opacity-100 cursor-pointer"
                  onClick={startLabelEdit}>
                  <circle cx={vPos.x + labelBarWidth + 12} cy={vPos.y - 10} r={9} fill="rgb(99,102,241)" />
                  <g transform={`translate(${vPos.x + labelBarWidth + 5.5}, ${vPos.y - 16.5})`}>
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="scale(0.54)" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="scale(0.54)" />
                  </g>
                </g>
              )}
              {/* Drag handle for value */}
              {onStartDrag && (
                <rect x={vPos.x} y={vPos.y} width={vDim.x} height={vDim.y}
                  fill="transparent" style={{ cursor: 'move' }} rx={2}
                  onMouseDown={(e) => onStartDrag(field.id, 'value', e)} />
              )}
              {/* Delete icon on hover */}
              <g className="opacity-0 group-hover:opacity-100 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                <circle cx={vPos.x + vDim.x - 8} cy={vPos.y - 10} r={8} fill="rgb(239,68,68)" />
                <text x={vPos.x + vDim.x - 8} y={vPos.y - 6} fill="white" fontSize={12}
                  fontWeight={700} textAnchor="middle" fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>x</text>
              </g>
              {/* Connection node for comparison mode — on the outer side edge */}
              {isComparisonMode && canEdit && (() => {
                const nodeX = source === 'a' ? vPos.x + vDim.x : vPos.x;
                const nodeY = vPos.y + vDim.y / 2;
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
