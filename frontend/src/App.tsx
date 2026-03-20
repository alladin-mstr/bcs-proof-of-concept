import { useState, useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { listPdfs, deletePdf, uploadPdf, type PdfInfo } from './api/client';
import PdfViewer from './components/PdfViewer';
import ComparisonCanvas from './components/ComparisonCanvas';
import TemplatePanel from './components/TemplatePanel';
import ExtractionResults from './components/ExtractionResults';

function App() {
  const pdfId = useAppStore((s) => s.pdfId);
  const pdfFilename = useAppStore((s) => s.pdfFilename);
  const setPdf = useAppStore((s) => s.setPdf);
  const extractionResults = useAppStore((s) => s.extractionResults);
  const setExtractionResults = useAppStore((s) => s.setExtractionResults);
  const templateMode = useAppStore((s) => s.templateMode);

  const [showFiles, setShowFiles] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [pdfList, setPdfList] = useState<PdfInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  // On mount, load PDF list and auto-select the first one
  useEffect(() => {
    listPdfs().then((pdfs) => {
      setPdfList(pdfs);
      if (pdfs.length > 0 && !pdfId) {
        setPdf(pdfs[0].pdf_id, pdfs[0].page_count, pdfs[0].filename);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh list when files dropdown opens
  useEffect(() => {
    if (showFiles) {
      listPdfs().then(setPdfList).catch(() => {});
    }
  }, [showFiles]);

  const showResults = extractionResults && extractionResults.length > 0;

  // If no PDFs exist at all, show upload prompt inline
  const noPdfs = loaded && pdfList.length === 0 && !pdfId;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <h1 className="text-lg font-semibold text-gray-900">PDF Data Extractor</h1>
            {pdfId && pdfFilename && (
              <span className="text-sm text-gray-400 truncate max-w-[250px]" title={pdfFilename}>
                — {pdfFilename}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setShowFiles(!showFiles)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
                showFiles ? 'bg-blue-100 text-blue-700' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              Files
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Upload
            </button>

            {/* Files dropdown */}
            {showFiles && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFiles(false)} />
                <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1 max-h-72 overflow-y-auto">
                  <div className="px-3 py-1.5 border-b border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Uploaded Files</span>
                  </div>
                  {pdfList.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No files uploaded yet</p>
                  ) : (
                    pdfList.map((pdf) => (
                      <div
                        key={pdf.pdf_id}
                        onClick={() => { setPdf(pdf.pdf_id, pdf.page_count, pdf.filename); setShowFiles(false); }}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors group ${
                          pdf.pdf_id === pdfId ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${pdf.pdf_id === pdfId ? 'font-medium text-blue-700' : 'text-gray-700'}`}>
                            {pdf.filename}
                          </p>
                          <p className="text-[11px] text-gray-400">{pdf.page_count} page{pdf.page_count !== 1 ? 's' : ''}</p>
                        </div>
                        {pdf.pdf_id === pdfId ? (
                          <span className="text-[10px] text-blue-500 font-medium flex-shrink-0">Current</span>
                        ) : (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!window.confirm(`Delete ${pdf.filename}?`)) return;
                              try {
                                await deletePdf(pdf.pdf_id);
                                setPdfList((prev) => prev.filter((p) => p.pdf_id !== pdf.pdf_id));
                              } catch { /* ignore */ }
                            }}
                            className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        {pdfId && <TemplatePanel />}

        {/* Main area */}
        <main className={`flex-1 ${templateMode === 'comparison' ? 'overflow-hidden' : 'overflow-y-auto p-6'} min-w-0`}>
          {pdfId && templateMode === 'comparison' ? (
            <ComparisonCanvas />
          ) : pdfId ? (
            <PdfViewer />
          ) : noPdfs ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-gray-500 font-medium mb-1">No PDFs uploaded yet</p>
              <p className="text-gray-400 text-sm mb-4">Upload a PDF to get started</p>
              <button
                onClick={() => setShowUpload(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Upload PDF
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-sm">Loading...</p>
            </div>
          )}
        </main>

        {/* Right panel — results */}
        {showResults && (
          <ExtractionResults onClose={() => setExtractionResults(null)} />
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={(pdf) => {
            setPdf(pdf.pdf_id, pdf.page_count, pdf.filename);
            setPdfList((prev) => [...prev, pdf]);
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}

function UploadModal({ onClose, onUploaded }: {
  onClose: () => void;
  onUploaded: (pdf: PdfInfo) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: File[]) => {
    const pdfFiles = files.filter((f) => f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      setError('Please select PDF files.');
      return;
    }
    setError(null);
    setIsUploading(true);
    for (const file of pdfFiles) {
      try {
        const result = await uploadPdf(file);
        // Call onUploaded for the last file (opens it)
        if (file === pdfFiles[pdfFiles.length - 1]) {
          onUploaded({ pdf_id: result.pdf_id, page_count: result.page_count, filename: result.filename });
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
    }
    setIsUploading(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Upload PDFs</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Drop zone */}
          <div className="p-6">
            <div
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                handleFiles(Array.from(e.dataTransfer.files));
              }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => document.getElementById('upload-modal-input')?.click()}
              className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
              }`}
            >
              <svg className="w-10 h-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {isUploading ? (
                <p className="text-gray-600 font-medium">Uploading...</p>
              ) : (
                <>
                  <p className="text-gray-700 font-medium mb-0.5">Drop PDFs here or click to browse</p>
                  <p className="text-gray-400 text-sm">Select one or multiple PDF files</p>
                </>
              )}
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              <input
                id="upload-modal-input"
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
