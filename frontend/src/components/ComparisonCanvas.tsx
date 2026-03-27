import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useAppStore } from "../store/appStore";
import { getPdfUrl, listPdfs, type PdfInfo } from "../api/client";
import BboxCanvas from "./BboxCanvas";
import type { Field, CompareOperator, RuleNodeData } from "../types";
import type { Node, Edge } from "@xyflow/react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const DEFAULT_ZOOM_INDEX = 2; // 100%

function ComparisonPane({
  source,
  collapsed,
  onToggle,
  zoomIndex,
  onZoomIndexChange,
  showLinkages,
  hasConnections,
  onToggleLinkages,
}: {
  source: "a" | "b";
  collapsed: boolean;
  onToggle: () => void;
  zoomIndex: number;
  onZoomIndexChange: (index: number) => void;
  showLinkages?: boolean;
  hasConnections?: boolean;
  onToggleLinkages?: () => void;
}) {
  const pdfId = useAppStore((s) => (source === "a" ? s.pdfId : s.pdfIdB));
  const pdfFilename = useAppStore((s) =>
    source === "a" ? s.pdfFilename : s.pdfFilenameB,
  );
  const pageCount = useAppStore((s) =>
    source === "a" ? s.pageCount : s.pageCountB,
  );
  const currentPage = useAppStore((s) =>
    source === "a" ? s.currentPage : s.currentPageB,
  );
  const setPdf = useAppStore((s) => s.setPdf);
  const setPdfB = useAppStore((s) => s.setPdfB);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const setCurrentPageB = useAppStore((s) => s.setCurrentPageB);
  const setActiveSource = useAppStore((s) => s.setActiveSource);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageDims, setPageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [pdfList, setPdfList] = useState<PdfInfo[]>([]);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const spaceHeld = useRef(false);

  const zoom = ZOOM_LEVELS[zoomIndex];

  useEffect(() => {
    listPdfs()
      .then(setPdfList)
      .catch(() => {});
  }, []);

  // Space key listener for pan mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) spaceHeld.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld.current = false;
        setIsPanning(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const onRenderSuccess = useCallback(() => {
    if (containerRef.current) {
      const canvas = containerRef.current.querySelector("canvas");
      if (canvas) {
        setPageDims({ width: canvas.clientWidth, height: canvas.clientHeight });
      }
    }
  }, []);

  const handleFileChange = (id: string) => {
    const pdf = pdfList.find((p) => p.pdf_id === id);
    if (!pdf) return;
    if (source === "a") setPdf(pdf.pdf_id, pdf.page_count, pdf.filename);
    else setPdfB(pdf.pdf_id, pdf.page_count, pdf.filename);
  };

  const setPage = source === "a" ? setCurrentPage : setCurrentPageB;

  const isA = source === "a";
  const accent = isA
    ? {
        bg: "bg-blue-50 dark:bg-blue-950/20",
        border: "border-blue-200 dark:border-blue-800",
        badge: "bg-blue-600",
        text: "text-blue-600",
      }
    : {
        bg: "bg-emerald-50 dark:bg-emerald-950/20",
        border: "border-emerald-200 dark:border-emerald-800",
        badge: "bg-emerald-600",
        text: "text-emerald-600",
      };

  const fileUrl = pdfId ? getPdfUrl(pdfId) : null;

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center py-4 px-1 bg-muted border-r border-border cursor-pointer hover:bg-muted/80 transition-colors"
        onClick={onToggle}
      >
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded text-white ${accent.badge}`}
        >
          {source.toUpperCase()}
        </span>
        <svg
          className={`w-4 h-4 mt-2 ${accent.text}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isA ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          )}
        </svg>
        <span className="text-[10px] text-muted-foreground mt-1 [writing-mode:vertical-rl]">
          {pdfFilename ?? "No PDF"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col flex-1 min-w-0"
      onMouseDown={() => setActiveSource(source)}
    >
      {/* Toolbar */}
      <div
        className={`flex items-center gap-2 px-3 py-2 border-b ${accent.bg} ${accent.border} flex-shrink-0`}
      >
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded text-white ${accent.badge}`}
        >
          {source.toUpperCase()}
        </span>

        <select
          value={pdfId ?? ""}
          onChange={(e) => handleFileChange(e.target.value)}
          className="text-xs bg-background border border-border rounded px-2 py-1 max-w-[180px] truncate"
        >
          <option value="">Select PDF...</option>
          {pdfList.map((pdf) => (
            <option key={pdf.pdf_id} value={pdf.pdf_id}>
              {pdf.filename}
            </option>
          ))}
        </select>

        {pdfId && pageCount > 1 && (
          <>
            <div className="w-px h-4 bg-border mx-0.5" />
            <button
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <span className="text-[10px] text-foreground/70 font-medium">
              {currentPage}/{pageCount}
            </span>
            <button
              onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
              disabled={currentPage >= pageCount}
              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </>
        )}

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Zoom controls */}
        <button
          onClick={() => onZoomIndexChange(Math.max(zoomIndex - 1, 0))}
          disabled={zoomIndex <= 0}
          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 12H4"
            />
          </svg>
        </button>
        <button
          onClick={() => onZoomIndexChange(DEFAULT_ZOOM_INDEX)}
          className="text-[10px] font-medium text-foreground/70 hover:text-foreground px-1 py-0.5 rounded hover:bg-background/60 min-w-[36px] text-center"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() =>
            onZoomIndexChange(Math.min(zoomIndex + 1, ZOOM_LEVELS.length - 1))
          }
          disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
          className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>

        <div className="flex-1" />

        {/* Linkages toggle — only in pane A toolbar */}
        {source === "a" && hasConnections && onToggleLinkages && (
          <button
            onClick={onToggleLinkages}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              showLinkages
                ? "bg-violet-100 text-violet-700 border border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700"
                : "bg-background text-muted-foreground border border-border hover:border-violet-200 hover:text-violet-600"
            }`}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101"
              />
            </svg>
            {showLinkages ? "Linkages" : "Linkages"}
          </button>
        )}

        {/* Collapse button */}
        <button
          onClick={onToggle}
          className="p-1 text-muted-foreground hover:text-foreground/70 transition-colors rounded hover:bg-background/60"
          title={`Hide PDF ${source.toUpperCase()}`}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isA ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            )}
          </svg>
        </button>
      </div>

      {/* PDF content — pannable via middle-click drag or Space+drag */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        style={{ cursor: isPanning ? "grabbing" : undefined }}
        onMouseDown={(e) => {
          // Middle-click or Space held
          if (e.button === 1 || spaceHeld.current) {
            e.preventDefault();
            setIsPanning(true);
            panStart.current = {
              x: e.clientX,
              y: e.clientY,
              scrollLeft: scrollRef.current!.scrollLeft,
              scrollTop: scrollRef.current!.scrollTop,
            };
          }
        }}
        onMouseMove={(e) => {
          if (!isPanning || !panStart.current) return;
          const dx = e.clientX - panStart.current.x;
          const dy = e.clientY - panStart.current.y;
          scrollRef.current!.scrollLeft = panStart.current.scrollLeft - dx;
          scrollRef.current!.scrollTop = panStart.current.scrollTop - dy;
        }}
        onMouseUp={() => {
          if (isPanning) setIsPanning(false);
        }}
        onMouseLeave={() => {
          if (isPanning) setIsPanning(false);
        }}
      >
        <div className="flex flex-col items-center p-4">
          {fileUrl ? (
            <div
              ref={containerRef}
              className="relative inline-block shadow-lg rounded-lg overflow-hidden border border-border"
              style={{ userSelect: "none" }}
            >
              <Document
                file={fileUrl}
                loading={
                  <div className="p-8 text-muted-foreground text-sm">
                    Loading PDF...
                  </div>
                }
              >
                <Page
                  pageNumber={currentPage}
                  scale={zoom}
                  onRenderSuccess={onRenderSuccess}
                  loading={
                    <div className="p-8 text-muted-foreground text-sm">
                      Loading page...
                    </div>
                  }
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
              {pageDims && (
                <BboxCanvas
                  pageWidth={pageDims.width}
                  pageHeight={pageDims.height}
                  source={source}
                />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Select a PDF file above
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Connection types & helpers ─── */

interface ConnectionLine {
  id: string;
  fieldAId: string;
  fieldBId: string;
  operator: CompareOperator;
  labelA: string;
  labelB: string;
}

const OP_LABELS: Record<string, string> = {
  equals: "equals",
  not_equals: "not equal",
  less_than: "less than",
  greater_than: "greater than",
  less_or_equal: "at most",
  greater_or_equal: "at least",
};

function deriveConnections(fields: Field[], ruleNodes: Node[], ruleEdges: Edge[]): ConnectionLine[] {
  const connections: ConnectionLine[] = [];

  const compNodes = ruleNodes.filter((n) => n.type === "comparison");
  for (const compNode of compNodes) {
    const data = compNode.data as RuleNodeData;
    const operator = (data.comparisonOperator ?? "equals") as CompareOperator;

    // Find the two field_input sources connected to handles 'a' and 'b'
    const edgeA = ruleEdges.find((e) => e.target === compNode.id && e.targetHandle === "a");
    const edgeB = ruleEdges.find((e) => e.target === compNode.id && e.targetHandle === "b");
    if (!edgeA || !edgeB) continue;

    const srcNodeA = ruleNodes.find((n) => n.id === edgeA.source);
    const srcNodeB = ruleNodes.find((n) => n.id === edgeB.source);
    if (!srcNodeA || !srcNodeB) continue;
    if (srcNodeA.type !== "field_input" || srcNodeB.type !== "field_input") continue;

    // Resolve field_input nodes to actual fields
    const dataA = srcNodeA.data as RuleNodeData;
    const dataB = srcNodeB.data as RuleNodeData;
    const fieldA = fields.find((f) => `field-${f.id}` === srcNodeA.id || f.label === dataA.label);
    const fieldB = fields.find((f) => `field-${f.id}` === srcNodeB.id || f.label === dataB.label);
    if (!fieldA || !fieldB) continue;

    // Only show if they're from different sources
    const srcA = fieldA.source ?? "a";
    const srcB = fieldB.source ?? "a";
    if (srcA === srcB) continue;

    const isFieldA = srcA === "a";
    connections.push({
      id: `rg-${compNode.id}`,
      fieldAId: isFieldA ? fieldA.id : fieldB.id,
      fieldBId: isFieldA ? fieldB.id : fieldA.id,
      operator,
      labelA: isFieldA ? fieldA.label : fieldB.label,
      labelB: isFieldA ? fieldB.label : fieldA.label,
    });
  }

  return connections;
}

/* ─── Connection overlay ─── */

function ConnectionOverlay({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const fields = useAppStore((s) => s.fields);
  const ruleNodes = useAppStore((s) => s.ruleNodes);
  const ruleEdges = useAppStore((s) => s.ruleEdges);
  const connectDragFrom = useAppStore((s) => s.connectDragFrom);
  const connectDragMouse = useAppStore((s) => s.connectDragMouse);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);

  const connections = deriveConnections(fields, ruleNodes, ruleEdges);

  const handleDeleteConnection = useCallback((conn: ConnectionLine) => {
    // Connection id is `rg-<compNodeId>`, extract the node id
    const compNodeId = conn.id.replace(/^rg-/, "");
    const state = useAppStore.getState();
    state.setRuleNodes(state.ruleNodes.filter((n) => n.id !== compNodeId));
    state.setRuleEdges(state.ruleEdges.filter((e) => e.target !== compNodeId && e.source !== compNodeId));
    setSelectedConnId(null);
  }, []);

  const measurePositions = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newPos: Record<string, { x: number; y: number }> = {};

    // Query the value rects — position at the outer side edge (right for A, left for B)
    const fieldEls =
      containerRef.current.querySelectorAll<SVGRectElement>(
        "[data-field-value]",
      );
    for (const el of fieldEls) {
      const fieldId = el.getAttribute("data-field-value");
      if (!fieldId) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const field = fields.find((f) => f.id === fieldId);
      const isSourceA = (field?.source ?? "a") === "a";
      newPos[fieldId] = {
        x: isSourceA
          ? rect.right - containerRect.left // right edge
          : rect.left - containerRect.left, // left edge
        y: rect.top + rect.height / 2 - containerRect.top,
      };
    }
    setPositions(newPos);
  }, [containerRef, fields]);

  useLayoutEffect(() => {
    measurePositions();
  }, [fields, measurePositions]);

  // Re-measure when DOM mutates (PDF canvas re-renders after zoom), scrolls, or resizes
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const onScroll = () => measurePositions();
    container.addEventListener("scroll", onScroll, true);

    // Observe resize of the root container
    const ro = new ResizeObserver(() => measurePositions());
    ro.observe(container);

    // MutationObserver catches PDF canvas being replaced after zoom/page change
    const mo = new MutationObserver(() => {
      // Defer slightly — the canvas element may exist but not be sized yet
      requestAnimationFrame(measurePositions);
    });
    mo.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["width", "height", "style"],
    });

    // Burst of rAF re-measurements to settle after mount (covers async PDF renders)
    let frame: number;
    let count = 0;
    const settle = () => {
      measurePositions();
      count++;
      if (count < 15) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);

    return () => {
      container.removeEventListener("scroll", onScroll, true);
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [containerRef, measurePositions]);

  const svgLines = connections
    .map((conn) => {
      const posA = positions[conn.fieldAId];
      const posB = positions[conn.fieldBId];
      if (!posA || !posB) return null;
      return { conn, x1: posA.x, y1: posA.y, x2: posB.x, y2: posB.y };
    })
    .filter(Boolean) as Array<{
    conn: ConnectionLine;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;

  // Compute drag preview line in container-relative coords
  let dragLine: { x1: number; y1: number; x2: number; y2: number } | null =
    null;
  if (connectDragFrom && connectDragMouse && containerRef.current) {
    const fromPos = positions[connectDragFrom.fieldId];
    if (fromPos) {
      const containerRect = containerRef.current.getBoundingClientRect();
      dragLine = {
        x1: fromPos.x,
        y1: fromPos.y,
        x2: connectDragMouse.x - containerRect.left,
        y2: connectDragMouse.y - containerRect.top,
      };
    }
  }

  if (svgLines.length === 0 && !dragLine) return null;

  return (
    <>
      {/* Click-away to deselect */}
      {selectedConnId && (
        <div
          className="absolute inset-0"
          style={{ zIndex: 19 }}
          onClick={() => setSelectedConnId(null)}
        />
      )}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 20, overflow: "visible", pointerEvents: "none" }}
      >
        <defs>
          <filter id="conn-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="1"
              stdDeviation="2"
              floodColor="rgba(139,92,246,0.3)"
            />
          </filter>
        </defs>
        {/* Drag preview line */}
        {dragLine && (
          <g>
            <line
              x1={dragLine.x1}
              y1={dragLine.y1}
              x2={dragLine.x2}
              y2={dragLine.y2}
              stroke="rgb(139,92,246)"
              strokeWidth={2}
              strokeDasharray="6 4"
              opacity={0.7}
            />
            <circle
              cx={dragLine.x1}
              cy={dragLine.y1}
              r={5}
              fill="rgb(139,92,246)"
              stroke="white"
              strokeWidth={2}
            />
            <circle
              cx={dragLine.x2}
              cy={dragLine.y2}
              r={4}
              fill="rgb(139,92,246)"
              opacity={0.5}
            />
          </g>
        )}
        {svgLines.map(({ conn, x1, y1, x2, y2 }) => {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const dx = Math.abs(x2 - x1);
          const cpX = dx * 0.35;
          const path = `M ${x1} ${y1} C ${x1 + cpX} ${y1}, ${x2 - cpX} ${y2}, ${x2} ${y2}`;
          const opLabel = OP_LABELS[conn.operator] ?? conn.operator;
          const badgeWidth = opLabel.length * 6.5 + 16;
          const isSelected = selectedConnId === conn.id;

          return (
            <g key={conn.id}>
              {/* Invisible wide hit area for clicking */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedConnId(isSelected ? null : conn.id);
                }}
              />
              {/* Glow line */}
              <path
                d={path}
                fill="none"
                stroke={isSelected ? "rgba(239,68,68,0.2)" : "rgba(139,92,246,0.15)"}
                strokeWidth={6}
              />
              {/* Visible line */}
              <path
                d={path}
                fill="none"
                stroke={isSelected ? "rgb(239,68,68)" : "rgb(139,92,246)"}
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              {/* Endpoint dots */}
              <circle
                cx={x1}
                cy={y1}
                r={4}
                fill={isSelected ? "rgb(239,68,68)" : "rgb(139,92,246)"}
                stroke="white"
                strokeWidth={2}
              />
              <circle
                cx={x2}
                cy={y2}
                r={4}
                fill={isSelected ? "rgb(239,68,68)" : "rgb(139,92,246)"}
                stroke="white"
                strokeWidth={2}
              />
              {/* Operator badge at midpoint */}
              <g filter="url(#conn-shadow)">
                <rect
                  x={midX - badgeWidth / 2}
                  y={midY - 9}
                  width={badgeWidth}
                  height={18}
                  rx={9}
                  fill={isSelected ? "rgb(239,68,68)" : "rgb(139,92,246)"}
                  style={{ pointerEvents: "fill", cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedConnId(isSelected ? null : conn.id);
                  }}
                />
                <text
                  x={midX}
                  y={midY + 3.5}
                  textAnchor="middle"
                  fill="white"
                  fontSize={9}
                  fontWeight={600}
                  fontFamily="system-ui, sans-serif"
                  style={{ pointerEvents: "none" }}
                >
                  {opLabel}
                </text>
              </g>
              {/* Delete button when selected */}
              {isSelected && (
                <g
                  style={{ pointerEvents: "fill", cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConnection(conn);
                  }}
                >
                  <circle
                    cx={midX + badgeWidth / 2 + 12}
                    cy={midY}
                    r={10}
                    fill="rgb(239,68,68)"
                    stroke="white"
                    strokeWidth={2}
                  />
                  <text
                    x={midX + badgeWidth / 2 + 12}
                    y={midY + 4}
                    textAnchor="middle"
                    fill="white"
                    fontSize={12}
                    fontWeight={700}
                    fontFamily="system-ui, sans-serif"
                    style={{ pointerEvents: "none" }}
                  >
                    ×
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </>
  );
}

/* ─── Main comparison canvas ─── */

const OP_OPTIONS: { value: CompareOperator; label: string }[] = [
  { value: "equals", label: "is equal to" },
  { value: "not_equals", label: "is not equal to" },
  { value: "less_than", label: "is less than" },
  { value: "greater_than", label: "is greater than" },
  { value: "less_or_equal", label: "is at most" },
  { value: "greater_or_equal", label: "is at least" },
];

export default function ComparisonCanvas() {
  const [collapsedA, setCollapsedA] = useState(false);
  const [collapsedB, setCollapsedB] = useState(false);
  const [zoomIndexA, setZoomIndexA] = useState(DEFAULT_ZOOM_INDEX);
  const [zoomIndexB, setZoomIndexB] = useState(DEFAULT_ZOOM_INDEX);
  const [showLinkages, setShowLinkages] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const fields = useAppStore((s) => s.fields);
  const pendingConnection = useAppStore((s) => s.pendingConnection);
  const setPendingConnection = useAppStore((s) => s.setPendingConnection);
  const connectDragFrom = useAppStore((s) => s.connectDragFrom);
  const ruleNodes = useAppStore((s) => s.ruleNodes);
  const ruleEdges = useAppStore((s) => s.ruleEdges);
  const hasConnections = deriveConnections(fields, ruleNodes, ruleEdges).length > 0;

  const handleToggleLinkages = () => {
    if (!showLinkages) {
      // Enable: reset both panes to 100%
      setZoomIndexA(DEFAULT_ZOOM_INDEX);
      setZoomIndexB(DEFAULT_ZOOM_INDEX);
      setShowLinkages(true);
    } else {
      setShowLinkages(false);
    }
  };

  const handleZoomA = (index: number) => {
    setZoomIndexA(index);
    // If zooming away from 100%, hide linkages
    if (index !== DEFAULT_ZOOM_INDEX) setShowLinkages(false);
  };

  const handleZoomB = (index: number) => {
    setZoomIndexB(index);
    if (index !== DEFAULT_ZOOM_INDEX) setShowLinkages(false);
  };

  // Global mouse handlers for connection drag
  useEffect(() => {
    if (!connectDragFrom) return;
    const onMove = (e: MouseEvent) => {
      useAppStore
        .getState()
        .setConnectDragMouse({ x: e.clientX, y: e.clientY });
    };
    const onUp = (e: MouseEvent) => {
      const state = useAppStore.getState();
      const dragFrom = state.connectDragFrom;
      if (!dragFrom) return;

      // Check if mouse is over a field from the opposite source
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      let targetFieldId: string | null = null;
      for (const el of els) {
        // Check for data-field-value attribute on SVG rects
        const fv = el.getAttribute("data-field-value");
        if (fv) {
          targetFieldId = fv;
          break;
        }
        // Also check parent <g> with data-field-id
        const parent = el.closest("[data-field-id]");
        if (parent) {
          const fid = parent.getAttribute("data-field-id");
          if (fid) {
            targetFieldId = fid;
            break;
          }
        }
      }

      if (targetFieldId && targetFieldId !== dragFrom.fieldId) {
        // Verify the target field is from the opposite source
        const targetField = state.fields.find((f) => f.id === targetFieldId);
        if (targetField && (targetField.source ?? "a") !== dragFrom.source) {
          state.setPendingConnection({
            fromId: dragFrom.fieldId,
            toId: targetFieldId,
          });
        }
      }

      state.setConnectDragFrom(null);
      state.setConnectDragMouse(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [connectDragFrom]);

  const confirmConnect = (operator: CompareOperator) => {
    if (!pendingConnection) return;
    const fromField = fields.find((f) => f.id === pendingConnection.fromId);
    const toField = fields.find((f) => f.id === pendingConnection.toId);
    if (!fromField || !toField) return;

    // Create comparison node + edges in the rule graph (source of truth)
    const state = useAppStore.getState();
    const fromNodeId = `field-${pendingConnection.fromId}`;
    const toNodeId = `field-${pendingConnection.toId}`;
    const isFromA = (fromField.source ?? "a") === "a";
    const compNodeId = crypto.randomUUID();

    const compNode: Node = {
      id: compNodeId,
      type: "comparison",
      position: { x: 450 + Math.random() * 100, y: 50 + Math.random() * 200 },
      data: {
        label: `${fromField.label} ${operator} ${toField.label}`,
        nodeType: "comparison",
        comparisonOperator: operator,
      } as RuleNodeData,
    };

    const newEdges: Edge[] = [
      {
        id: `e-${compNodeId}-a`,
        source: isFromA ? fromNodeId : toNodeId,
        target: compNodeId,
        targetHandle: "a",
        animated: true,
        style: { strokeWidth: 2 },
      },
      {
        id: `e-${compNodeId}-b`,
        source: isFromA ? toNodeId : fromNodeId,
        target: compNodeId,
        targetHandle: "b",
        animated: true,
        style: { strokeWidth: 2 },
      },
    ];

    state.setRuleNodes([...state.ruleNodes, compNode]);
    state.setRuleEdges([...state.ruleEdges, ...newEdges]);

    setPendingConnection(null);
  };

  return (
    <div ref={rootRef} className="relative flex w-full h-full">
      <ComparisonPane
        source="a"
        collapsed={collapsedA}
        onToggle={() => setCollapsedA((v) => !v)}
        zoomIndex={zoomIndexA}
        onZoomIndexChange={handleZoomA}
        showLinkages={showLinkages}
        hasConnections={hasConnections}
        onToggleLinkages={handleToggleLinkages}
      />
      <div className="w-px bg-border flex-shrink-0" />
      <ComparisonPane
        source="b"
        collapsed={collapsedB}
        onToggle={() => setCollapsedB((v) => !v)}
        zoomIndex={zoomIndexB}
        onZoomIndexChange={handleZoomB}
      />
      <ConnectionOverlay containerRef={rootRef} />

      {/* Operator picker popup after drag-to-connect on canvas */}
      {pendingConnection &&
        (() => {
          const fromField = fields.find(
            (f) => f.id === pendingConnection.fromId,
          );
          const toField = fields.find((f) => f.id === pendingConnection.toId);
          if (!fromField || !toField) return null;
          return (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setPendingConnection(null)}
              />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-popover rounded-xl shadow-2xl border border-violet-200 dark:border-violet-800 p-3 w-52">
                <p className="text-xs text-foreground mb-2 text-center">
                  <span className="font-semibold text-blue-700">
                    {fromField.label}
                  </span>
                  {" \u2194 "}
                  <span className="font-semibold text-emerald-700">
                    {toField.label}
                  </span>
                </p>
                <div className="space-y-1">
                  {OP_OPTIONS.map((op) => (
                    <button
                      key={op.value}
                      onClick={() => confirmConnect(op.value)}
                      className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/30 text-foreground hover:text-violet-700 transition-colors"
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setPendingConnection(null)}
                  className="w-full mt-2 text-[10px] text-muted-foreground hover:text-foreground/70 text-center"
                >
                  Cancel
                </button>
              </div>
            </>
          );
        })()}
    </div>
  );
}
