import { useState, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useAppStore } from '../store/appStore';
import { getPdfUrl } from '../api/client';
import BboxCanvas from './BboxCanvas';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const DEFAULT_ZOOM_INDEX = 2; // 1x

export default function PdfViewer() {
  const pdfId = useAppStore((s) => s.pdfId);
  const pageCount = useAppStore((s) => s.pageCount);
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [showMarkers, setShowMarkers] = useState(true);

  const zoom = ZOOM_LEVELS[zoomIndex];

  const zoomIn = () => setZoomIndex((i) => Math.min(i + 1, ZOOM_LEVELS.length - 1));
  const zoomOut = () => setZoomIndex((i) => Math.max(i - 1, 0));
  const resetZoom = () => setZoomIndex(DEFAULT_ZOOM_INDEX);

  const onRenderSuccess = useCallback(() => {
    if (containerRef.current) {
      const canvas = containerRef.current.querySelector('canvas');
      if (canvas) {
        setPageDims({ width: canvas.clientWidth, height: canvas.clientHeight });
      }
    }
  }, []);

  if (!pdfId) return null;

  const fileUrl = getPdfUrl(pdfId);

  return (
    <div className="flex flex-col items-center">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 bg-white rounded-lg shadow-sm border border-gray-200 px-2 py-1.5">
        {/* Page navigation */}
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs text-gray-600 font-medium min-w-[60px] text-center">
          {currentPage} / {pageCount}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
          disabled={currentPage >= pageCount}
          className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Zoom controls */}
        <button
          onClick={zoomOut}
          disabled={zoomIndex <= 0}
          className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={resetZoom}
          className="text-[10px] font-medium text-gray-600 hover:text-gray-800 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors min-w-[40px] text-center"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={zoomIn}
          disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
          className="p-1 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Toggle markers */}
        <button
          onClick={() => setShowMarkers(!showMarkers)}
          className={`p-1 rounded transition-colors ${
            showMarkers ? 'text-blue-600 hover:text-blue-800 bg-blue-50' : 'text-gray-400 hover:text-gray-600'
          }`}
          title={showMarkers ? 'Hide markers' : 'Show markers'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {showMarkers ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878l4.242 4.242M15.12 15.12L21 21" />
            )}
          </svg>
        </button>

      </div>

      {/* PDF + overlay */}
      <div
        ref={containerRef}
        className="relative inline-block shadow-lg rounded-lg overflow-hidden border border-gray-200"
        style={{ userSelect: 'none' }}
      >
        <Document file={fileUrl} loading={<div className="p-8 text-gray-400">Loading PDF...</div>}>
          <Page
            pageNumber={currentPage}
            scale={zoom}
            onRenderSuccess={onRenderSuccess}
            loading={<div className="p-8 text-gray-400">Loading page...</div>}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
        {pageDims && showMarkers && (
          <BboxCanvas pageWidth={pageDims.width} pageHeight={pageDims.height} />
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Click and drag on the page to draw a field region
      </p>
    </div>
  );
}
