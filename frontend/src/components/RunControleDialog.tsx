import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { uploadPdf, runControle } from "@/api/client";
import { FileText, Upload, Loader2, CheckCircle, XCircle } from "lucide-react";
import type { Controle, ExtractionResponse } from "@/types";

interface RunControleDialogProps {
  controle: Controle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RunControleDialog({ controle, open, onOpenChange }: RunControleDialogProps) {
  const [fileUploads, setFileUploads] = useState<Record<string, { pdfId: string; filename: string } | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ExtractionResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUploadFile = useCallback(
    async (fileDefId: string, file: File) => {
      if (file.type !== "application/pdf") return;
      setUploading(fileDefId);
      try {
        const { pdf_id } = await uploadPdf(file);
        setFileUploads((prev) => ({
          ...prev,
          [fileDefId]: { pdfId: pdf_id, filename: file.name },
        }));
      } catch {
        setError("Upload mislukt.");
      } finally {
        setUploading(null);
      }
    },
    [],
  );

  const allFilesUploaded = controle.files.every((f) => fileUploads[f.id] != null);

  const handleRun = useCallback(async () => {
    if (!allFilesUploaded) return;
    setRunning(true);
    setError(null);
    try {
      const files: Record<string, string> = {};
      for (const fileDef of controle.files) {
        const upload = fileUploads[fileDef.id];
        if (upload) files[fileDef.id] = upload.pdfId;
      }
      const res = await runControle(controle.id, files);
      setResults(res);
    } catch {
      setError("Uitvoeren mislukt.");
    } finally {
      setRunning(false);
    }
  }, [controle, fileUploads, allFilesUploaded]);

  const totalPassed = results
    ? results.flatMap((r) => r.results).filter((r) => r.status === "ok").length
    : 0;
  const totalFailed = results
    ? results.flatMap((r) => r.results).filter((r) => r.status !== "ok").length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Controle uitvoeren: {controle.name}</DialogTitle>
          <DialogDescription>
            Upload bestanden die overeenkomen met de labels van deze controle.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4 py-2">
            {controle.files.map((fileDef) => {
              const upload = fileUploads[fileDef.id];
              const isUploading = uploading === fileDef.id;
              return (
                <div
                  key={fileDef.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{fileDef.label}</p>
                    {upload ? (
                      <p className="text-xs text-green-600 truncate">{upload.filename}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nog niet geupload</p>
                    )}
                  </div>
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : upload ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "application/pdf";
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) handleUploadFile(fileDef.id, file);
                        };
                        input.click();
                      }}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      Upload
                    </Button>
                  )}
                </div>
              );
            })}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              className="w-full"
              disabled={!allFilesUploaded || running}
              onClick={handleRun}
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Bezig met uitvoeren...
                </>
              ) : (
                "Uitvoeren"
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex gap-4">
              <div className="flex-1 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-center">
                <CheckCircle className="h-6 w-6 text-green-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{totalPassed}</p>
                <p className="text-xs text-green-600 dark:text-green-500">Geslaagd</p>
              </div>
              <div className="flex-1 p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-center">
                <XCircle className="h-6 w-6 text-red-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{totalFailed}</p>
                <p className="text-xs text-red-600 dark:text-red-500">Afwijkingen</p>
              </div>
            </div>

            {results.flatMap((r) => r.template_rule_results).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Regelresultaten</h4>
                {results.flatMap((r) => r.template_rule_results).map((rr, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 p-2 rounded text-sm ${
                      rr.passed
                        ? "bg-green-50 dark:bg-green-950/20"
                        : "bg-red-50 dark:bg-red-950/20"
                    }`}
                  >
                    {rr.passed ? (
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                    <span className="font-medium">{rr.rule_name}</span>
                    <span className="text-muted-foreground ml-auto text-xs">{rr.message}</span>
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Sluiten
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
