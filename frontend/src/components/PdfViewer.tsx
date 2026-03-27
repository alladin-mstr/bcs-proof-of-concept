import { useState, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useAppStore } from '../store/appStore';
import { getPdfUrl } from '../api/client';
import BboxCanvas from './BboxCanvas';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

export default function PdfViewer() {
  const pdfId = useAppStore((s) => s.pdfId);
  const currentPage = useAppStore((s) => s.currentPage);
  const zoomIndex = useAppStore((s) => s.zoomIndex);
  const showMarkers = useAppStore((s) => s.showMarkers);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);

  const zoom = ZOOM_LEVELS[zoomIndex];

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
      {/* PDF + overlay */}
      <div
        ref={containerRef}
        className="relative inline-block shadow-lg rounded-lg overflow-hidden border border-border"
        style={{ userSelect: 'none' }}
      >
        <Document file={fileUrl} loading={<div className="p-8 text-muted-foreground">Loading PDF...</div>}>
          <Page
            pageNumber={currentPage}
            scale={zoom}
            onRenderSuccess={onRenderSuccess}
            loading={<div className="p-8 text-muted-foreground">Loading page...</div>}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
        {pageDims && showMarkers && (
          <BboxCanvas pageWidth={pageDims.width} pageHeight={pageDims.height} />
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Click and drag on the page to draw a field region
      </p>
    </div>
  );
}
