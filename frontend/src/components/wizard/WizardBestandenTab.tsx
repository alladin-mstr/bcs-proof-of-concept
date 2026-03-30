import { useState, useCallback } from "react";
import { uploadPdf } from "@/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, FileText, Loader2, ChevronRight, ArrowLeft, Check } from "lucide-react";
import { WizardFileTab } from "./WizardFileTab";
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
      const pdfFiles = fileList.filter((f) => f.type === "application/pdf");
      if (pdfFiles.length === 0) {
        setError("Alleen PDF-bestanden zijn toegestaan.");
        return;
      }
      setError(null);
      setIsUploading(true);
      try {
        for (const file of pdfFiles) {
          const { pdf_id, page_count } = await uploadPdf(file);
          const baseName = file.name.replace(/\.pdf$/i, "");
          const newFile: ControleFile = {
            id: crypto.randomUUID(),
            label: baseName,
            pdfId: pdf_id,
            pdfFilename: file.name,
            pageCount: page_count,
            fields: [],
            extractionResults: null,
          };
          onAddFile(newFile);
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
    return (
      <div className="flex flex-col h-full">
        {/* Back bar */}
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
          <WizardFileTab key={activeFileId} fileId={activeFileId} />
        </div>
      </div>
    );
  }

  // File list view
  const allHaveResults = files.every((f) => f.extractionResults !== null && f.extractionResults.length > 0);
  const canProceed = files.length > 0 && files.every((f) => f.pdfId !== null && f.label.trim().length > 0) && allHaveResults;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Bestanden</h2>
          <p className="text-muted-foreground">
            Upload PDF-bestanden, geef ze een label en klik om velden toe te voegen.
          </p>
        </div>

        {/* Upload zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          className={`
            flex flex-col items-center justify-center w-full max-w-lg mx-auto p-8
            border-2 border-dashed rounded-2xl cursor-pointer transition-colors
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
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-foreground font-medium text-sm">
                Sleep PDF-bestanden hierheen of klik om te uploaden
              </p>
              <p className="text-muted-foreground text-xs mt-1">Alleen PDF-bestanden</p>
            </>
          )}
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          <input
            id="wizard-pdf-input"
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="w-full max-w-lg mx-auto space-y-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-colors"
              >
                {/* File header */}
                <div className="flex items-center gap-3 px-5 py-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Input
                      value={file.label}
                      onChange={(e) => onUpdateLabel(file.id, e.target.value)}
                      placeholder="Label (bijv. loonstrook, factuur...)"
                      className="h-9 text-sm font-medium border-transparent bg-transparent px-0 hover:bg-muted/50 hover:px-2 focus:bg-background focus:px-2 focus:border-border transition-all"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5 truncate px-0">
                      {file.pdfFilename}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); onRemoveFile(file.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* File footer */}
                <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-t border-border">
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
                    onClick={() => onOpenFile(file.id)}
                  >
                    {file.fields.length > 0 ? "Velden bewerken" : "Velden toevoegen"}
                    <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </div>
              </div>
            ))}
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
