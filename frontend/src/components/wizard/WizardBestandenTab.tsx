import { useState, useCallback } from "react";
import { uploadPdf, uploadSpreadsheet } from "@/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, FileText, Loader2, ChevronRight, ArrowLeft, Check, Sheet } from "lucide-react";
import { WizardFileTab } from "./WizardFileTab";
import { SpreadsheetViewer } from "@/components/SpreadsheetViewer";
import type { ControleFile } from "@/types";

interface WizardBestandenTabProps {
  files: ControleFile[];
  onAddFile: (file: ControleFile) => void;
  onRemoveFile: (fileId: string) => void;
  onUpdateLabel: (fileId: string, label: string) => void;
  onNext: () => void;
  /** Controlled: which file is currently open in the PDF viewer */
  activeFileId: string | null;
  onOpenFile: (fileId: string) => void;
  onCloseFile: () => void;
}

export function WizardBestandenTab({
  files,
  onAddFile,
  onRemoveFile,
  onUpdateLabel,
  onNext,
  activeFileId,
  onOpenFile,
  onCloseFile,
}: WizardBestandenTabProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (fileList: File[]) => {
      const validFiles = fileList.filter(
        (f) => f.type === "application/pdf" ||
               f.name.toLowerCase().endsWith(".xlsx") ||
               f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      if (validFiles.length === 0) {
        setError("Alleen PDF- of Excel-bestanden (.xlsx) zijn toegestaan.");
        return;
      }
      setError(null);
      setIsUploading(true);
      try {
        for (const file of validFiles) {
          const isSpreadsheet = file.name.toLowerCase().endsWith(".xlsx") ||
            file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

          if (isSpreadsheet) {
            const res = await uploadSpreadsheet(file);
            const baseName = file.name.replace(/\.xlsx$/i, "");
            const newFile: ControleFile = {
              id: crypto.randomUUID(),
              label: baseName,
              fileType: "spreadsheet",
              pdfId: null,
              pdfFilename: null,
              pageCount: 0,
              spreadsheetId: res.spreadsheet_id,
              spreadsheetFilename: file.name,
              sheetData: {
                headers: res.headers,
                rows: res.rows,
                rowCount: res.row_count,
                colCount: res.col_count,
              },
              fields: [],
              extractionResults: null,
            };
            onAddFile(newFile);
          } else {
            const { pdf_id, page_count } = await uploadPdf(file);
            const baseName = file.name.replace(/\.pdf$/i, "");
            const newFile: ControleFile = {
              id: crypto.randomUUID(),
              label: baseName,
              fileType: "pdf",
              pdfId: pdf_id,
              pdfFilename: file.name,
              pageCount: page_count,
              spreadsheetId: null,
              spreadsheetFilename: null,
              sheetData: null,
              fields: [],
              extractionResults: null,
            };
            onAddFile(newFile);
          }
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Upload mislukt. Draait de backend?";
        setError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [onAddFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFiles(Array.from(e.dataTransfer.files));
    },
    [handleFiles],
  );

  // If viewing a file, show the template builder with a back bar
  if (activeFileId) {
    const activeFile = files.find((f) => f.id === activeFileId);
    const isSpreadsheet = activeFile?.fileType === "spreadsheet";
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onCloseFile} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Bestanden
          </Button>
          <span className="text-sm font-medium text-foreground">
            {activeFile?.label || "Bestand"}
          </span>
          <span className="text-xs text-muted-foreground">
            {activeFile?.fields.length ?? 0} veld{(activeFile?.fields.length ?? 0) !== 1 ? "en" : ""}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          {isSpreadsheet ? (
            <SpreadsheetViewer key={activeFileId} fileId={activeFileId} />
          ) : (
            <WizardFileTab key={activeFileId} fileId={activeFileId} />
          )}
        </div>
      </div>
    );
  }

  // File list view
  const allHaveResults = files.every((f) => {
    if (f.fileType === "spreadsheet") return true;
    return f.extractionResults !== null && f.extractionResults.length > 0;
  });
  const canProceed = files.length > 0 && files.every((f) => {
    if (f.fileType === "spreadsheet") {
      return f.spreadsheetId !== null && f.label.trim().length > 0;
    }
    return f.pdfId !== null && f.label.trim().length > 0;
  }) && allHaveResults;

  const dropzone = (
    <div
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      className={`
        flex flex-col items-center justify-center cursor-pointer transition-colors
        border-2 border-dashed rounded-2xl
        ${files.length > 0
          ? "w-56 h-56 p-4"
          : "w-full max-w-lg p-8"
        }
        ${isDragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-border bg-muted hover:border-muted-foreground/50"}
      `}
      onClick={() => document.getElementById("wizard-pdf-input")?.click()}
    >
      {isUploading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Uploaden...</span>
        </div>
      ) : (
        <>
          <Upload className={`text-muted-foreground mb-2 ${files.length > 0 ? "h-6 w-6" : "h-8 w-8"}`} />
          <p className="text-foreground font-medium text-sm text-center">
            {files.length > 0 ? "Meer uploaden" : "Sleep bestanden hierheen of klik om te uploaden"}
          </p>
          <p className="text-muted-foreground text-xs mt-1">PDF of Excel (.xlsx)</p>
        </>
      )}
      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
      <input
        id="wizard-pdf-input"
        type="file"
        accept="application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {files.length === 0 ? (
          <>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Bestanden</h2>
            <p className="text-muted-foreground">
              Upload PDF-bestanden, geef ze een label en klik om velden toe te voegen.
            </p>
          </div>
          {/* Centered dropzone when no files */}
          <div className="flex flex-1 items-center justify-center min-h-[300px]">
            {dropzone}
          </div>
          </>
        ) : (
          /* Cards grid with dropzone as last card */
          <div className="flex flex-wrap gap-4">
            {files.map((file) => (
              <div
                key={file.id}
                className="w-56 rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors flex flex-col"
              >
                {/* Card body */}
                <div className="flex-1 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {file.fileType === "spreadsheet" ? (
                        <Sheet className="h-5 w-5 text-primary" />
                      ) : (
                        <FileText className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onRemoveFile(file.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="min-w-0">
                    <Input
                      value={file.label}
                      onChange={(e) => onUpdateLabel(file.id, e.target.value)}
                      placeholder="Label..."
                      className="h-8 text-sm font-medium border-transparent bg-transparent px-0 hover:bg-muted/50 hover:px-2 focus:bg-background focus:px-2 focus:border-border transition-all"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {file.fileType === "spreadsheet" ? file.spreadsheetFilename : file.pdfFilename}
                    </p>
                  </div>
                </div>

                {/* Card footer */}
                <div className="px-4 py-3 bg-muted/30 border-t border-border space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {file.fields.length > 0 ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-foreground font-medium">{file.fields.length} veld{file.fields.length !== 1 ? "en" : ""}</span>
                      </>
                    ) : (
                      <span>Nog geen velden</span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => onOpenFile(file.id)}
                  >
                    {file.fields.length > 0 ? "Bewerken" : "Velden toevoegen"}
                    <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </div>
              </div>
            ))}
            {dropzone}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {files.length > 0 && !allHaveResults && (
            <span className="text-amber-600">
              Voer een preview-extractie uit voor alle bestanden om verder te gaan
            </span>
          )}
        </div>
        <Button onClick={onNext} disabled={!canProceed}>
          Volgende
        </Button>
      </div>
    </div>
  );
}
