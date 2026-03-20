import { useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { useBboxDrawing } from '../hooks/useBboxDrawing';
import { normalizedToPixel, pixelToNormalized } from '../utils/coords';
import { detectFormat } from '../api/client';
import type { Field, FieldResult, Region } from '../types';

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

interface Props { pageWidth: number; pageHeight: number }

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

export default function BboxCanvas({ pageWidth, pageHeight }: Props) {
  const currentPage = useAppStore((s) => s.currentPage);
  const fields = useAppStore((s) => s.fields);
  const addField = useAppStore((s) => s.addField);
  const removeField = useAppStore((s) => s.removeField);
  const drawMode = useAppStore((s) => s.drawMode);
  const pendingAnchor = useAppStore((s) => s.pendingAnchor);
  const setPendingAnchor = useAppStore((s) => s.setPendingAnchor);
  const pdfId = useAppStore((s) => s.pdfId);
  const extractionResults = useAppStore((s) => s.extractionResults);
  const chainEditFieldId = useAppStore((s) => s.chainEditFieldId);
  const drawingRegionForStepId = useAppStore((s) => s.drawingRegionForStepId);
  const setDrawingRegionForStepId = useAppStore((s) => s.setDrawingRegionForStepId);
  const updateChainStep = useAppStore((s) => s.updateChainStep);

  const currentPageFields = fields.filter(
    (f) => f.value_region.page === currentPage || (f.anchor_region && f.anchor_region.page === currentPage)
  );

  const resultByLabel: Record<string, FieldResult> = {};
  if (extractionResults) for (const r of extractionResults) resultByLabel[r.label] = r;

  const onDrawComplete = useCallback(
    async (rect: { x: number; y: number; width: number; height: number }) => {
      const region = pixelRectToRegion(rect, currentPage, pageWidth, pageHeight);

      // If drawing a search region for a chain step, capture it there
      if (drawingRegionForStepId) {
        updateChainStep(drawingRegionForStepId.fieldId, drawingRegionForStepId.stepId, { search_region: region });
        setDrawingRegionForStepId(null);
        return;
      }

      if (drawMode === 'static') {
        const label = window.prompt('Enter a label for this field:');
        if (!label?.trim()) return;
        addField({ id: crypto.randomUUID(), label: label.trim(), type: 'static', value_region: region, rules: [], chain: [] });
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
    [addField, currentPage, pageWidth, pageHeight, drawMode, pendingAnchor, setPendingAnchor, pdfId, drawingRegionForStepId, updateChainStep, setDrawingRegionForStepId]
  );

  const { currentRect, handlers } = useBboxDrawing(onDrawComplete);
  const previewColor = drawingRegionForStepId
    ? { fill: 'rgba(245,158,11,0.1)', stroke: 'rgb(245,158,11)' }
    : drawMode === 'dynamic' && !pendingAnchor
      ? { fill: 'rgba(245,158,11,0.15)', stroke: 'rgb(245,158,11)' }
      : { fill: 'rgba(59,130,246,0.15)', stroke: 'rgb(59,130,246)' };

  return (
    <svg className="absolute top-0 left-0 w-full h-full" style={{ cursor: 'crosshair', zIndex: 10 }}
      onMouseDown={handlers.onMouseDown} onMouseMove={handlers.onMouseMove} onMouseUp={handlers.onMouseUp}>
      <defs>
        <style>{`
          @keyframes pulse-anchor { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          .pending-anchor-rect { animation: pulse-anchor 1.5s ease-in-out infinite; }
        `}</style>
        <marker id="shift-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(99,102,241)" />
        </marker>
      </defs>

      {currentPageFields.map((field) => (
        <g key={field.id} opacity={chainEditFieldId && field.id !== chainEditFieldId ? 0.15 : 1}
          style={{ transition: 'opacity 0.2s ease' }}>
          <FieldOverlay field={field} pw={pageWidth} ph={pageHeight}
            currentPage={currentPage} onRemove={() => removeField(field.id)} result={resultByLabel[field.label] ?? null} />
        </g>
      ))}

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
function FieldOverlay({ field, pw, ph, currentPage, onRemove, result }: {
  field: Field; pw: number; ph: number; currentPage: number; onRemove: () => void; result: FieldResult | null;
}) {
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

  // Original template positions
  const vPos = valueOnPage ? normalizedToPixel(field.value_region.x, field.value_region.y, pw, ph) : null;
  const vDim = valueOnPage ? normalizedToPixel(field.value_region.width, field.value_region.height, pw, ph) : null;
  const aPos = anchorOnPage && field.anchor_region ? normalizedToPixel(field.anchor_region.x, field.anchor_region.y, pw, ph) : null;
  const aDim = anchorOnPage && field.anchor_region ? normalizedToPixel(field.anchor_region.width, field.anchor_region.height, pw, ph) : null;

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
          {aPos && aDim && (
            <>
              <rect x={aPos.x} y={aPos.y} width={aDim.x} height={aDim.y}
                fill={hasResult && result.status === 'anchor_mismatch' ? COLORS.resultError.fill : hasResult ? (resultColor?.fill ?? anchorBaseColor.fill) : anchorBaseColor.fill}
                stroke={hasResult && result.status === 'anchor_mismatch' ? COLORS.resultError.stroke : hasResult ? (resultColor?.stroke ?? anchorBaseColor.stroke) : anchorBaseColor.stroke}
                strokeWidth={2} rx={2} />
              <rect x={aPos.x} y={aPos.y - 18}
                width={Math.max(aDim.x, (field.expected_anchor_text ?? '').length * 7 + 20)} height={18}
                fill={hasResult && result.status === 'anchor_mismatch' ? COLORS.resultError.stroke : anchorBaseColor.stroke} rx={2} />
              <AnchorIcon x={aPos.x + 2} y={aPos.y - 16} />
              <text x={aPos.x + 15} y={aPos.y - 4} fill="white" fontSize={10} fontWeight={600} fontFamily="system-ui, sans-serif">
                {field.expected_anchor_text}
              </text>
            </>
          )}

          {vPos && vDim && (
            <>
              <rect x={vPos.x} y={vPos.y} width={vDim.x} height={vDim.y}
                fill={valueColor.fill} stroke={valueColor.stroke} strokeWidth={hasResult ? 3 : 2} rx={2} />
              <rect x={vPos.x} y={vPos.y - 20}
                width={Math.max(vDim.x, field.label.length * 8 + (hasResult ? 36 : 16))} height={20}
                fill={valueColor.stroke} rx={2} />
              <text x={vPos.x + 4} y={vPos.y - 5} fill="white" fontSize={12} fontWeight={600} fontFamily="system-ui, sans-serif">
                {field.label}
              </text>
              {hasResult && (
                <text x={vPos.x + field.label.length * 8 + 12} y={vPos.y - 5} fill="white" fontSize={12} fontWeight={700} fontFamily="system-ui, sans-serif">
                  {result.status === 'ok' || result.status === 'anchor_shifted' ? '\u2713' : result.status === 'empty' ? '\u2014' : '\u2717'}
                </text>
              )}
              <g className="opacity-0 group-hover:opacity-100 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                <circle cx={vPos.x + vDim.x - 8} cy={vPos.y - 10} r={8} fill="rgb(239,68,68)" />
                <text x={vPos.x + vDim.x - 8} y={vPos.y - 6} fill="white" fontSize={12}
                  fontWeight={700} textAnchor="middle" fontFamily="system-ui, sans-serif" style={{ pointerEvents: 'none' }}>x</text>
              </g>
            </>
          )}
        </>
      )}
    </g>
  );
}
