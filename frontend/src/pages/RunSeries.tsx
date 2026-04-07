import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Play, Upload, Loader2, CheckCircle, XCircle, SkipForward,
  AlertTriangle, FileText, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeaderAction } from "@/context/HeaderActionContext";
import { useToast } from "@/hooks/use-toast";
import {
  getControleSeries,
  getControle,
  uploadPdf,
  runControleSeries,
} from "@/api/client";
import type {
  ControleSeries,
  Controle,
  ControleSeriesStep,
  ControleSeriesRun,
  SeriesStepResultStatus,
} from "@/types";

type Phase = "upload" | "running" | "results";

interface StepUploadState {
  step: ControleSeriesStep;
  controle: Controle | null;
  files: Record<string, { pdfId: string; filename: string }>;
}

export default function RunSeries() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [series, setSeries] = useState<ControleSeries | null>(null);
  const [stepStates, setStepStates] = useState<StepUploadState[]>([]);
  const [phase, setPhase] = useState<Phase>("upload");
  const [uploading, setUploading] = useState<string | null>(null);
  const [result, setResult] = useState<ControleSeriesRun | null>(null);
  const [expandedStep, setExpandedStep] = useState<number>(0);

  useEffect(() => {
    if (!id) return;
    getControleSeries(id).then(async (s) => {
      setSeries(s);
      const sorted = [...s.steps].sort((a, b) => a.order - b.order);
      const states: StepUploadState[] = [];
      for (const step of sorted) {
        let controle: Controle | null = null;
        try {
          controle = await getControle(step.controleId);
        } catch { /* skip */ }
        states.push({ step, controle, files: {} });
      }
      setStepStates(states);
    }).catch(() => {
      toast({ title: "Serie niet gevonden", variant: "destructive" });
      navigate("/controles");
    });
  }, [id, toast, navigate]);

  const handleUploadFile = useCallback(async (stepIdx: number, fileDefId: string, file: File) => {
    if (file.type !== "application/pdf") return;
    const key = `${stepIdx}_${fileDefId}`;
    setUploading(key);
    try {
      const { pdf_id } = await uploadPdf(file);
      setStepStates((prev) =>
        prev.map((s, i) =>
          i === stepIdx
            ? { ...s, files: { ...s.files, [fileDefId]: { pdfId: pdf_id, filename: file.name } } }
            : s,
        ),
      );
    } catch {
      toast({ title: "Upload mislukt", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }, [toast]);

  const allUploaded = stepStates.every(
    (s) => s.controle?.files.every((f) => s.files[f.id]) ?? false,
  );

  const handleRun = useCallback(async () => {
    if (!series || !allUploaded) return;
    setPhase("running");
    try {
      const files: Record<string, Record<string, string>> = {};
      for (const s of stepStates) {
        const stepFiles: Record<string, string> = {};
        for (const [fileId, upload] of Object.entries(s.files)) {
          stepFiles[fileId] = upload.pdfId;
        }
        files[s.step.id] = stepFiles;
      }
      const res = await runControleSeries(series.id, files);
      setResult(res);
      setPhase("results");
    } catch {
      toast({ title: "Uitvoeren mislukt", variant: "destructive" });
      setPhase("upload");
    }
  }, [series, stepStates, allUploaded, toast]);

  const stepStatusIcon = (status: SeriesStepResultStatus) => {
    switch (status) {
      case "passed": return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed": return <XCircle className="h-5 w-5 text-red-500" />;
      case "skipped": return <SkipForward className="h-5 w-5 text-muted-foreground" />;
      case "error": return <AlertTriangle className="h-5 w-5 text-red-500" />;
    }
  };

  const conditionLabels = {
    always: "Altijd",
    if_passed: "Als vorige geslaagd",
    if_failed: "Als vorige gefaald",
  };

  if (!series) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <HeaderAction>
        {phase === "results" && (
          <Button
            variant="outline"
            className="rounded-full"
            size="sm"
            onClick={() => {
              setPhase("upload");
              setResult(null);
              setStepStates((prev) => prev.map((s) => ({ ...s, files: {} })));
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Opnieuw uitvoeren
          </Button>
        )}
      </HeaderAction>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{series.name}</h1>
        <p className="text-sm text-muted-foreground">
          {series.klantName} · {series.steps.length} stap{series.steps.length !== 1 ? "pen" : ""}
        </p>
      </div>

      {/* Upload phase */}
      {phase === "upload" && (
        <div className="space-y-6">
          {stepStates.map((state, stepIdx) => {
            const isExpanded = expandedStep === stepIdx;
            const stepComplete = state.controle?.files.every((f) => state.files[f.id]) ?? false;
            return (
              <Card key={state.step.id} className={stepComplete ? "border-green-200 dark:border-green-800" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => setExpandedStep(isExpanded ? -1 : stepIdx)}
                  >
                    <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-6 w-6 flex items-center justify-center shrink-0">
                      {stepIdx + 1}
                    </span>
                    <span className="font-medium flex-1">{state.step.controleName}</span>
                    {stepIdx > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {conditionLabels[state.step.condition]}
                      </Badge>
                    )}
                    {stepComplete && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                  </div>
                  {isExpanded && state.controle && (
                    <div className="pl-9 space-y-2">
                      {state.controle.files.map((fileDef) => {
                        const upload = state.files[fileDef.id];
                        const isUpl = uploading === `${stepIdx}_${fileDef.id}`;
                        return (
                          <div
                            key={fileDef.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                              upload ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10" : "border-dashed"
                            }`}
                          >
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{fileDef.label}</p>
                              {upload && <p className="text-xs text-green-600">{upload.filename}</p>}
                            </div>
                            {isUpl ? (
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            ) : (
                              <Button
                                variant={upload ? "ghost" : "outline"}
                                size="sm"
                                onClick={() => {
                                  const input = document.createElement("input");
                                  input.type = "file";
                                  input.accept = "application/pdf";
                                  input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) handleUploadFile(stepIdx, fileDef.id, file);
                                  };
                                  input.click();
                                }}
                              >
                                {upload ? "Wijzig" : (
                                  <>
                                    <Upload className="h-3.5 w-3.5 mr-1" />
                                    PDF
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Button size="lg" className="w-full" disabled={!allUploaded} onClick={handleRun}>
            <Play className="h-4 w-4 mr-2" />
            Serie uitvoeren
          </Button>
        </div>
      )}

      {/* Running phase */}
      {phase === "running" && (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <h2 className="text-lg font-semibold">Serie wordt uitgevoerd...</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Stappen worden sequentieel verwerkt.
          </p>
        </div>
      )}

      {/* Results phase */}
      {phase === "results" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={
                result.status === "completed"
                  ? "text-success border-success/30 bg-success/10"
                  : "text-warning border-warning/30 bg-warning/10"
              }
            >
              {result.status === "completed" ? "Voltooid" : "Gestopt"}
            </Badge>
          </div>

          {result.stepResults.map((sr, idx) => (
            <Card key={sr.stepId}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full h-6 w-6 flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                {stepStatusIcon(sr.status)}
                <span className="font-medium flex-1">{sr.controleName}</span>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    sr.status === "passed" ? "text-success border-success/30 bg-success/10"
                    : sr.status === "failed" ? "text-destructive border-destructive/30 bg-destructive/10"
                    : sr.status === "skipped" ? "text-muted-foreground"
                    : "text-destructive border-destructive/30 bg-destructive/10"
                  }`}
                >
                  {sr.status === "passed" ? "Geslaagd" : sr.status === "failed" ? "Gefaald" : sr.status === "skipped" ? "Overgeslagen" : "Fout"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
