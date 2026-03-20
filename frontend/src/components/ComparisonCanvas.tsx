import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useAppStore } from '../store/appStore';
import { getPdfUrl, listPdfs, type PdfInfo } from '../api/client';
import BboxCanvas from './BboxCanvas';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const DEFAULT_ZOOM_INDEX = 2;

function ComparisonPane({ source, collapsed, onToggle }: {
  source: 'a' | 'b';
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pdfId = useAppStore((s) => source === 'a' ? s.pdfId : s.pdfIdB);
  const pdfFilename = useAppStore((s) => source === 'a' ? s.pdfFilename : s.pdfFilenameB);
  const pageCount = useAppStore((s) => source === 'a' ? s.pageCount : s.pageCountB);
  const currentPage = useAppStore((s) => source === 'a' ? s.currentPage : s.currentPageB);
  const setPdf = useAppStore((s) => s.setPdf);
  const setPdfB = useAppStore((s) => s.setPdfB);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const setCurrentPageB = useAppStore((s) => s.setCurrentPageB);
  const setActiveSource = useAppStore((s) => s.setActiveSource);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [pdfList, setPdfList] = useState<PdfInfo[]>([]);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const spaceHeld = useRef(false);

  const zoom = ZOOM_LEVELS[zoomIndex];

  useEffect(() => {
    listPdfs().then(setPdfList).catch(() => {});
  }, []);

  // Space key listener for pan mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) spaceHeld.current = true; };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceHeld.current = false; setIsPanning(false); } };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  const onRenderSuccess = useCallback(() => {
    if (containerRef.current) {
      const canvas = containerRef.current.querySelector('canvas');
      if (canvas) {
        setPageDims({ width: canvas.clientWidth, height: canvas.clientHeight });
      }
    }
  }, []);

  const handleFileChange = (id: string) => {
    const pdf = pdfList.find((p) => p.pdf_id === id);
    if (!pdf) return;
    if (source === 'a') setPdf(pdf.pdf_id, pdf.page_count, pdf.filename);
    else setPdfB(pdf.pdf_id, pdf.page_count, pdf.filename);
  };

  const setPage = source === 'a' ? setCurrentPage : setCurrentPageB;

  const isA = source === 'a';
  const accent = isA
    ? { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-600', text: 'text-blue-600' }
    : { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-600', text: 'text-emerald-600' };

  const fileUrl = pdfId ? getPdfUrl(pdfId) : null;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-4 px-1 bg-gray-50 border-r border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={onToggle}>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded text-white ${accent.badge}`}>
          {source.toUpperCase()}
        </span>
        <svg className={`w-4 h-4 mt-2 ${accent.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isA ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          )}
        </svg>
        <span className="text-[10px] text-gray-400 mt-1 [writing-mode:vertical-rl]">
          {pdfFilename ?? 'No PDF'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0" onMouseDown={() => setActiveSource(source)}>
      {/* Toolbar */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${accent.bg} ${accent.border} flex-shrink-0`}>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded text-white ${accent.badge}`}>
          {source.toUpperCase()}
        </span>

        <select
          value={pdfId ?? ''}
          onChange={(e) => handleFileChange(e.target.value)}
          className="text-xs bg-white border border-gray-200 rounded px-2 py-1 max-w-[180px] truncate"
        >
          <option value="">Select PDF...</option>
          {pdfList.map((pdf) => (
            <option key={pdf.pdf_id} value={pdf.pdf_id}>{pdf.filename}</option>
          ))}
        </select>

        {pdfId && pageCount > 1 && (
          <>
            <div className="w-px h-4 bg-gray-300 mx-0.5" />
            <button onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}
              className="p-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-[10px] text-gray-600 font-medium">{currentPage}/{pageCount}</span>
            <button onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage >= pageCount}
              className="p-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        <div className="w-px h-4 bg-gray-300 mx-0.5" />

        {/* Zoom controls */}
        <button onClick={() => setZoomIndex((i) => Math.max(i - 1, 0))} disabled={zoomIndex <= 0}
          className="p-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button onClick={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
          className="text-[10px] font-medium text-gray-600 hover:text-gray-800 px-1 py-0.5 rounded hover:bg-white/60 min-w-[36px] text-center">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => setZoomIndex((i) => Math.min(i + 1, ZOOM_LEVELS.length - 1))} disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
          className="p-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <div className="flex-1" />

        {/* Collapse button */}
        <button onClick={onToggle}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded hover:bg-white/60"
          title={`Hide PDF ${source.toUpperCase()}`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isA ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            )}
          </svg>
        </button>
      </div>

      {/* PDF content — pannable via middle-click drag or Space+drag */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        style={{ cursor: isPanning ? 'grabbing' : undefined }}
        onMouseDown={(e) => {
          // Middle-click or Space held
          if (e.button === 1 || spaceHeld.current) {
            e.preventDefault();
            setIsPanning(true);
            panStart.current = { x: e.clientX, y: e.clientY, scrollLeft: scrollRef.current!.scrollLeft, scrollTop: scrollRef.current!.scrollTop };
          }
        }}
        onMouseMove={(e) => {
          if (!isPanning || !panStart.current) return;
          const dx = e.clientX - panStart.current.x;
          const dy = e.clientY - panStart.current.y;
          scrollRef.current!.scrollLeft = panStart.current.scrollLeft - dx;
          scrollRef.current!.scrollTop = panStart.current.scrollTop - dy;
        }}
        onMouseUp={() => { if (isPanning) setIsPanning(false); }}
        onMouseLeave={() => { if (isPanning) setIsPanning(false); }}
      >
        <div className="flex flex-col items-center p-4">
          {fileUrl ? (
            <div ref={containerRef} className="relative inline-block shadow-lg rounded-lg overflow-hidden border border-gray-200"
              style={{ userSelect: 'none' }}>
              <Document file={fileUrl} loading={<div className="p-8 text-gray-400 text-sm">Loading PDF...</div>}>
                <Page pageNumber={currentPage} scale={zoom} onRenderSuccess={onRenderSuccess}
                  loading={<div className="p-8 text-gray-400 text-sm">Loading page...</div>}
                  renderTextLayer={false} renderAnnotationLayer={false} />
              </Document>
              {pageDims && <BboxCanvas pageWidth={pageDims.width} pageHeight={pageDims.height} source={source} />}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              Select a PDF file above
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComparisonCanvas() {
  const [collapsedA, setCollapsedA] = useState(false);
  const [collapsedB, setCollapsedB] = useState(false);

  return (
    <div className="flex w-full h-full">
      <ComparisonPane source="a" collapsed={collapsedA} onToggle={() => setCollapsedA((v) => !v)} />
      <div className="w-px bg-gray-300 flex-shrink-0" />
      <ComparisonPane source="b" collapsed={collapsedB} onToggle={() => setCollapsedB((v) => !v)} />
    </div>
  );
}
