import { useState, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { getPdfUrl } from "@/api/client";
import BboxCanvas from "@/components/BboxCanvas";
import ExtractionResults from "@/components/ExtractionResults";
import ReadOnlySpreadsheetViewer from "@/components/ReadOnlySpreadsheetViewer";
import FileSidebar from "@/components/FileSidebar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Minus, Plus, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { FileGroup, FileEntry, TemplateRuleResult } from "@/types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

interface Props {
  fileGroups: FileGroup[];
  ruleResults: TemplateRuleResult[];
  computedValues: Record<string, string>;
  summary: {
    fieldsOk: number;
    failures: number;
    rulesPassed: number;
    rulesTotal: number;
  };
}

type RightTab = "resultaten" | "overzicht";

export default function RunResultViewer({ fileGroups, ruleResults, computedValues, summary }: Props) {
  const allFiles = fileGroups.flatMap((g) => g.files);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(allFiles[0]?.fileId ?? null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [zoomIndex, setZoomIndex] = useState(2); // 1.0x
  const [showMarkers, setShowMarkers] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("resultaten");
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedFile: FileEntry | null = allFiles.find((f) => f.fileId === selectedFileId) ?? null;

  const handleSelectFile = useCallback((fileId: string) => {
    setSelectedFileId(fileId);
    setCurrentPage(1);
    setNumPages(null);
    setPageDims(null);
  }, []);

  const zoom = ZOOM_LEVELS[zoomIndex];

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  const onRenderSuccess = useCallback(() => {
    if (containerRef.current) {
      const canvas = containerRef.current.querySelector("canvas");
      if (canvas) {
        setPageDims({ width: canvas.clientWidth, height: canvas.clientHeight });
      }
    }
  }, []);

  const handleFieldClick = useCallback((fieldIndex: number) => {
    if (!selectedFile) return;
    const result = selectedFile.results[fieldIndex];
    if (result?.resolved_region) {
      setCurrentPage(result.resolved_region.page);
    }
  }, [selectedFile]);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-8rem)] rounded-lg border border-border">
      {/* Left: File Sidebar */}
      <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
        <FileSidebar
          fileGroups={fileGroups}
          selectedFileId={selectedFileId}
          onSelectFile={handleSelectFile}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* Center: Document Viewer */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <div className="h-full flex flex-col bg-muted/20">
          {/* Toolbar */}
          {selectedFile && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background">
              <div className="flex items-center gap-1">
                {selectedFile.fileType === "pdf" && numPages && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground min-w-[4rem] text-center">
                      {currentPage} / {numPages}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage >= numPages} onClick={() => setCurrentPage((p) => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                {selectedFile.fileType === "pdf" && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoomIndex <= 0} onClick={() => setZoomIndex((z) => z - 1)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={zoomIndex >= ZOOM_LEVELS.length - 1} onClick={() => setZoomIndex((z) => z + 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowMarkers((s) => !s)}>
                      {showMarkers ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Document area */}
          <div className="flex-1 overflow-auto flex items-start justify-center p-4">
            {!selectedFile && (
              <div className="text-muted-foreground text-sm mt-16">Selecteer een bestand</div>
            )}

            {selectedFile?.fileType === "pdf" && (
              <div ref={containerRef} className="relative inline-block shadow-lg rounded-lg overflow-hidden border border-border">
                <Document
                  file={getPdfUrl(selectedFile.fileId)}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={<div className="p-8 text-muted-foreground">Loading PDF...</div>}
                >
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
                  <BboxCanvas
                    pageWidth={pageDims.width}
                    pageHeight={pageDims.height}
                    readOnly
                    resultsOverride={selectedFile.results}
                    currentPageOverride={currentPage}
                  />
                )}
              </div>
            )}

            {selectedFile?.fileType === "spreadsheet" && (
              <ReadOnlySpreadsheetViewer
                fileId={selectedFile.fileId}
                results={selectedFile.results}
                onFieldClick={handleFieldClick}
              />
            )}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* Right: Results Panel */}
      <ResizablePanel defaultSize={32} minSize={20} maxSize={45}>
        <div className="h-full flex flex-col bg-background">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setRightTab("resultaten")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                rightTab === "resultaten"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Resultaten
            </button>
            <button
              onClick={() => setRightTab("overzicht")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                rightTab === "overzicht"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Overzicht
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {rightTab === "resultaten" && selectedFile && (
              <ExtractionResults
                onClose={() => {}}
                embedded
                resultsOverride={selectedFile.results}
                templateRuleResultsOverride={selectedFile.ruleResults}
                computedValuesOverride={selectedFile.computedValues}
                onFieldClick={handleFieldClick}
              />
            )}

            {rightTab === "overzicht" && (
              <div className="p-4 space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-green-200 dark:border-green-800 p-3 text-center">
                    <p className="text-xl font-bold text-green-600">{summary.fieldsOk}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Velden OK</p>
                  </div>
                  <div className={`rounded-lg border p-3 text-center ${summary.failures > 0 ? "border-red-200 dark:border-red-800" : "border-green-200 dark:border-green-800"}`}>
                    <p className={`text-xl font-bold ${summary.failures > 0 ? "text-red-600" : "text-green-600"}`}>
                      {summary.failures}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Afwijkingen</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className={`text-xl font-bold ${
                      ruleResults.length === 0 ? "text-muted-foreground"
                      : summary.rulesPassed === summary.rulesTotal ? "text-green-600"
                      : "text-amber-600"
                    }`}>
                      {ruleResults.length > 0 ? `${summary.rulesPassed}/${summary.rulesTotal}` : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Regels geslaagd</p>
                  </div>
                </div>

                {/* Rule results table */}
                {ruleResults.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Regelresultaten</h4>
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8"></TableHead>
                              <TableHead className="text-xs">Regel</TableHead>
                              <TableHead className="text-xs text-right">Resultaat</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ruleResults.map((rr, i) => (
                              <TableRow key={i}>
                                <TableCell className="py-1.5">
                                  {rr.passed ? (
                                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  )}
                                </TableCell>
                                <TableCell className="text-xs font-medium py-1.5">{rr.rule_name}</TableCell>
                                <TableCell className="text-right py-1.5">
                                  {rr.computed_value ? (
                                    <span className="font-mono text-xs">= {rr.computed_value}</span>
                                  ) : rr.passed ? (
                                    <span className="text-green-600 text-xs font-medium">OK</span>
                                  ) : (
                                    <span className="text-red-500 text-[11px]">{rr.message}</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Computed values */}
                {Object.keys(computedValues).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Berekende waarden</h4>
                    <Card>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Naam</TableHead>
                              <TableHead className="text-xs text-right">Waarde</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(computedValues).map(([label, value]) => (
                              <TableRow key={label}>
                                <TableCell className="text-xs font-medium py-1.5">{label}</TableCell>
                                <TableCell className="text-right font-mono text-xs py-1.5">{value}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
