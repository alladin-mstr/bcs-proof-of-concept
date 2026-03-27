import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { listPdfs, deletePdf, uploadPdf, listTemplates, deleteTemplate as apiDeleteTemplate, type PdfInfo } from '@/api/client';
import PdfViewer, { ZOOM_LEVELS } from '@/components/PdfViewer';
import ComparisonCanvas from '@/components/ComparisonCanvas';
import TemplatePanel from '@/components/TemplatePanel';
import ExtractionResults from '@/components/ExtractionResults';
import RulesPanel from '@/components/rules/RulesPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

function TemplateBuilder() {
  const pdfId = useAppStore((s) => s.pdfId);
  const pdfFilename = useAppStore((s) => s.pdfFilename);
  const setPdf = useAppStore((s) => s.setPdf);
  const extractionResults = useAppStore((s) => s.extractionResults);
  const setExtractionResults = useAppStore((s) => s.setExtractionResults);
  const templateMode = useAppStore((s) => s.templateMode);

  const pageCount = useAppStore((s) => s.pageCount);
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const zoomIndex = useAppStore((s) => s.zoomIndex);
  const zoomIn = useAppStore((s) => s.zoomIn);
  const zoomOut = useAppStore((s) => s.zoomOut);
  const resetZoom = useAppStore((s) => s.resetZoom);
  const showMarkers = useAppStore((s) => s.showMarkers);
  const setShowMarkers = useAppStore((s) => s.setShowMarkers);

  const templates = useAppStore((s) => s.templates);
  const setTemplates = useAppStore((s) => s.setTemplates);
  const loadTemplate = useAppStore((s) => s.loadTemplate);
  const editTemplate = useAppStore((s) => s.editTemplate);
  const activeTemplateId = useAppStore((s) => s.activeTemplateId);

  const [showFiles, setShowFiles] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [pdfList, setPdfList] = useState<PdfInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pdfCollapsed, setPdfCollapsed] = useState(false);

  const rightPanelCollapsed = useAppStore((s) => s.rightPanelCollapsed);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);

  const handlePdfCollapse = () => setPdfCollapsed(true);
  const handlePdfExpand = () => setPdfCollapsed(false);

  const handleRightPanelCollapse = () => {
    if (!rightPanelCollapsed) toggleRightPanel();
  };

  const handleRightPanelExpand = () => {
    if (rightPanelCollapsed) toggleRightPanel();
  };

  useEffect(() => {
    listPdfs().then((pdfs) => {
      setPdfList(pdfs);
      if (pdfs.length > 0 && !pdfId) {
        setPdf(pdfs[0].pdf_id, pdfs[0].page_count, pdfs[0].filename);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showFiles) {
      listPdfs().then(setPdfList).catch(() => {});
    }
  }, [showFiles]);

  const handleDeleteTemplate = async (templateId: string) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await apiDeleteTemplate(templateId);
      const updated = await listTemplates();
      setTemplates(updated);
      if (activeTemplateId === templateId) {
        useAppStore.setState({ activeTemplateId: null, fields: [], extractionResults: null, pendingAnchor: null });
      }
    } catch {
      alert('Failed to delete template.');
    }
  };

  const handleEditTemplateFromHeader = (t: typeof templates[0]) => {
    editTemplate(t);
    setShowTemplates(false);
  };

  const handleTestTemplate = (t: typeof templates[0]) => {
    loadTemplate(t);
    setShowTemplates(false);
  };

  const showResults = extractionResults && extractionResults.length > 0;
  const noPdfs = loaded && pdfList.length === 0 && !pdfId;

  return (
    <div className="flex flex-col h-full max-h-[90vh] -mx-6 -mt-2">
      {/* Compact toolbar */}
      <header className="border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between px-3 py-4">
          {/* Left: filename */}
          <div className="flex items-center gap-2 min-w-0">
            {pdfId && pdfFilename ? (
              <span className="text-sm text-foreground/70 truncate max-w-[250px]" title={pdfFilename}>
                {pdfFilename}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">No PDF selected</span>
            )}
          </div>

          {/* Center: Page / Zoom / Markers toolbar */}
          {pdfId && templateMode !== 'comparison' && (
            <div className="flex items-center gap-1 bg-muted rounded-lg border border-border px-1.5 py-0.5">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-[11px] text-foreground/70 font-medium min-w-[40px] text-center">
                {currentPage} / {pageCount}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage >= pageCount}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <div className="w-px h-4 bg-border mx-0.5" />

              <button
                onClick={zoomOut}
                disabled={zoomIndex <= 0}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <button
                onClick={resetZoom}
                className="text-[10px] font-medium text-foreground/70 hover:text-foreground px-1 py-0.5 rounded hover:bg-muted transition-colors min-w-[36px] text-center"
              >
                {Math.round(ZOOM_LEVELS[zoomIndex] * 100)}%
              </button>
              <button
                onClick={zoomIn}
                disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>

              <div className="w-px h-4 bg-border mx-0.5" />

              <button
                onClick={() => setShowMarkers(!showMarkers)}
                className={`p-0.5 rounded transition-colors ${
                  showMarkers ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
                }`}
                title={showMarkers ? 'Hide markers' : 'Show markers'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showMarkers ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878l4.242 4.242M15.12 15.12L21 21" />
                  )}
                </svg>
              </button>
            </div>
          )}

          {/* Right: Templates + Files + Upload */}
          <div className="flex items-center gap-1.5 relative">
            <button
              onClick={() => { setShowTemplates(!showTemplates); setShowFiles(false); setTemplateSearch(''); }}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${
                showTemplates ? 'bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300' : 'text-foreground/70 bg-muted hover:bg-muted/80'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Templates
              {templates.length > 0 && (
                <span className="text-[10px] bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 rounded-full px-1.5 font-medium">{templates.length}</span>
              )}
            </button>
            <button
              onClick={() => { setShowFiles(!showFiles); setShowTemplates(false); }}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${
                showFiles ? 'bg-primary/10 text-primary' : 'text-foreground/70 bg-muted hover:bg-muted/80'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              Files
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="px-2.5 py-1 text-xs text-foreground/70 bg-muted rounded-lg hover:bg-muted/80 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Upload
            </button>

            {/* Templates dropdown */}
            {showTemplates && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => { setShowTemplates(false); setTemplateSearch(''); }} />
                <div className="absolute right-0 top-full mt-1 w-80 rounded-lg shadow-lg border border-border bg-popover z-50 py-1 max-h-80 overflow-y-auto">
                  <div className="px-3 py-1.5 border-b border-border space-y-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Templates</span>
                    {templates.length > 0 && (
                      <input
                        type="text"
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder="Search templates…"
                        className="w-full text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-400"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                  {templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No templates saved yet</p>
                  ) : (
                    templates.filter((t) => !templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase())).map((t) => (
                      <div
                        key={t.id}
                        onClick={() => handleTestTemplate(t)}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors group ${
                          t.id === activeTemplateId ? 'bg-violet-50 dark:bg-violet-950/20' : 'hover:bg-muted'
                        }`}
                      >
                        <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${t.id === activeTemplateId ? 'font-medium text-violet-700 dark:text-violet-300' : 'text-foreground'}`}>
                            {t.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {t.fields.length} field{t.fields.length !== 1 ? 's' : ''}
                            <span className={`ml-1.5 inline-flex items-center px-1.5 rounded-full text-[9px] font-semibold ${
                              t.mode === 'comparison'
                                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            }`}>
                              {t.mode === 'comparison' ? 'Comparison' : 'Single'}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditTemplateFromHeader(t); }}
                            className="text-[10px] text-emerald-600 hover:text-emerald-800 font-medium px-1"
                            title="Edit template"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id); }}
                            className="text-muted-foreground/50 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* Files dropdown */}
            {showFiles && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFiles(false)} />
                <div className="absolute right-0 top-full mt-1 w-80 rounded-lg shadow-lg border border-border bg-popover z-50 py-1 max-h-72 overflow-y-auto">
                  <div className="px-3 py-1.5 border-b border-border">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Uploaded Files</span>
                  </div>
                  {pdfList.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No files uploaded yet</p>
                  ) : (
                    pdfList.map((pdf) => (
                      <div
                        key={pdf.pdf_id}
                        onClick={() => { setPdf(pdf.pdf_id, pdf.page_count, pdf.filename); setShowFiles(false); }}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors group ${
                          pdf.pdf_id === pdfId ? 'bg-primary/5' : 'hover:bg-muted'
                        }`}
                      >
                        <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${pdf.pdf_id === pdfId ? 'font-medium text-primary' : 'text-foreground'}`}>
                            {pdf.filename}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{pdf.page_count} page{pdf.page_count !== 1 ? 's' : ''}</p>
                        </div>
                        {pdf.pdf_id === pdfId ? (
                          <span className="text-[10px] text-primary font-medium flex-shrink-0">Current</span>
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
                            className="text-muted-foreground/50 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
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
      <div className="flex flex-1 overflow-hidden h-full max-h-[90vh]">
        {pdfId && <TemplatePanel />}

        {/* PDF collapsed strip */}
        {pdfCollapsed && (
          <div className="flex flex-col border-r border-border bg-muted w-10 flex-shrink-0">
            <button
              onClick={handlePdfExpand}
              className="p-2 mt-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand PDF viewer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground [writing-mode:vertical-lr] rotate-180 tracking-wider uppercase font-medium">
                PDF Viewer
              </span>
            </div>
          </div>
        )}

        {/* PDF Viewer + Right Panel — resizable */}
        <ResizablePanelGroup direction="horizontal" className="flex-1 min-w-0">
          {!pdfCollapsed && (
            <>
              <ResizablePanel defaultSize={60} minSize={20}>
                <main className={`h-full ${templateMode === 'comparison' ? 'overflow-hidden' : 'overflow-y-auto'} min-w-0 bg-muted relative`}>
                  {/* Collapse button */}
                  <button
                    onClick={handlePdfCollapse}
                    className="absolute right-2 top-1 z-10 p-1.5 bg-background/80 backdrop-blur-sm border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors shadow-sm"
                    title="Collapse PDF viewer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  {pdfId && templateMode === 'comparison' ? (
                    <ComparisonCanvas />
                  ) : pdfId ? (
                    <PdfViewer />
                  ) : noPdfs ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <svg className="w-16 h-16 text-muted-foreground/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-foreground/70 font-medium mb-1">No PDFs uploaded yet</p>
                      <p className="text-muted-foreground text-sm mb-4">Upload a PDF to get started</p>
                      <button
                        onClick={() => setShowUpload(true)}
                        className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        Upload PDF
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground text-sm">Loading...</p>
                    </div>
                  )}
                </main>
              </ResizablePanel>
              {pdfId && !rightPanelCollapsed && <ResizableHandle withHandle />}
            </>
          )}

          {pdfId && !rightPanelCollapsed && (
            <ResizablePanel defaultSize={pdfCollapsed ? 100 : 40} minSize={15}>
              <RightPanel
                showResults={showResults}
                onCloseResults={() => setExtractionResults(null)}
                onCollapse={handleRightPanelCollapse}
              />
            </ResizablePanel>
          )}
        </ResizablePanelGroup>

        {/* Right panel collapsed strip */}
        {pdfId && rightPanelCollapsed && (
          <div className="flex flex-col border-l border-border bg-background w-10 flex-shrink-0">
            <button
              onClick={handleRightPanelExpand}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => { handleRightPanelExpand(); useAppStore.getState().setRightPanelTab("rules"); }}
              className={`p-2 transition-colors ${useAppStore.getState().rightPanelTab === 'rules' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title="Rules"
            >
              <RulesIcon />
            </button>
            {showResults && (
              <button
                onClick={() => { handleRightPanelExpand(); useAppStore.getState().setRightPanelTab("results"); }}
                className={`p-2 transition-colors ${useAppStore.getState().rightPanelTab === 'results' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title="Results"
              >
                <ResultsIcon />
              </button>
            )}
          </div>
        )}
      </div>

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

const RulesIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
  </svg>
);

const ResultsIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
  </svg>
);

function RightPanel({ showResults, onCloseResults, onCollapse }: {
  showResults: boolean;
  onCloseResults: () => void;
  onCollapse: () => void;
}) {
  const rightPanelTab = useAppStore((s) => s.rightPanelTab);
  const setRightPanelTab = useAppStore((s) => s.setRightPanelTab);

  // Auto-switch to results tab when results come in
  useEffect(() => {
    if (showResults) setRightPanelTab("results");
  }, [showResults, setRightPanelTab]);

  return (
    <div className="h-full border-l border-border bg-background flex flex-col overflow-hidden relative">
      {/* Collapse button */}
      <button
        onClick={onCollapse}
        className="absolute left-1 top-2 z-10 p-1 text-muted-foreground hover:text-foreground transition-colors"
        title="Collapse panel"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0 pl-6">
        <button
          onClick={() => setRightPanelTab("rules")}
          className={`flex items-center justify-center gap-1.5 flex-1 py-2 text-xs font-medium transition-colors ${
            rightPanelTab === 'rules'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <RulesIcon className="w-3.5 h-3.5" />
          Rules
        </button>
        <button
          onClick={() => setRightPanelTab("results")}
          className={`flex items-center justify-center gap-1.5 flex-1 py-2 text-xs font-medium transition-colors ${
            rightPanelTab === 'results'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ResultsIcon className="w-3.5 h-3.5" />
          Results
          {showResults && (
            <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] rounded-full bg-primary/10 text-primary">
              !
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {rightPanelTab === 'rules' ? (
          <RulesPanel />
        ) : showResults ? (
          <ExtractionResults onClose={onCloseResults} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-xs">Run a test to see results</p>
          </div>
        )}
      </div>
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
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto bg-popover" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">Upload PDFs</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted hover:border-muted-foreground/30 hover:bg-muted/80'
              }`}
            >
              <svg className="w-10 h-10 text-muted-foreground mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {isUploading ? (
                <p className="text-foreground/70 font-medium">Uploading...</p>
              ) : (
                <>
                  <p className="text-foreground font-medium mb-0.5">Drop PDFs here or click to browse</p>
                  <p className="text-muted-foreground text-sm">Select one or multiple PDF files</p>
                </>
              )}
              {error && <p className="text-destructive text-sm mt-2">{error}</p>}
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

export default TemplateBuilder;
