import { useAppStore } from './store/appStore';
import PdfUploader from './components/PdfUploader';
import PdfViewer from './components/PdfViewer';
import TemplatePanel from './components/TemplatePanel';
import ExtractionResults from './components/ExtractionResults';

function App() {
  const pdfId = useAppStore((s) => s.pdfId);
  const clearPdf = useAppStore((s) => s.clearPdf);
  const extractionResults = useAppStore((s) => s.extractionResults);
  const setExtractionResults = useAppStore((s) => s.setExtractionResults);

  const showResults = extractionResults && extractionResults.length > 0;

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
          </div>
          {pdfId && (
            <button
              onClick={clearPdf}
              className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Upload New PDF
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        {pdfId && <TemplatePanel />}

        {/* Main area */}
        <main className="flex-1 overflow-y-auto p-6">
          {!pdfId ? (
            <PdfUploader />
          ) : (
            <PdfViewer />
          )}
        </main>

        {/* Right panel — results */}
        {showResults && (
          <ExtractionResults onClose={() => setExtractionResults(null)} />
        )}
      </div>
    </div>
  );
}

export default App;
