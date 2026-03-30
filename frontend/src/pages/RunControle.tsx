import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getControle, uploadPdf, runControle } from "@/api/client";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Upload, Loader2, CheckCircle, XCircle, AlertTriangle,
  Play, ArrowLeft, RotateCcw,
} from "lucide-react";
import type { Controle, ExtractionResponse, TemplateRuleResult } from "@/types";

type RunPhase = "upload" | "running" | "results";

export default function RunControle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [controle, setControle] = useState<Controle | null>(null);
  const [phase, setPhase] = useState<RunPhase>("upload");
  const [fileUploads, setFileUploads] = useState<Record<string, { pdfId: string; filename: string }>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [results, setResults] = useState<ExtractionResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getControle(id)
      .then(setControle)
      .catch(() => {
        toast({ title: "Controle niet gevonden", variant: "destructive" });
        navigate("/controles");
      });
  }, [id, toast, navigate]);

  const handleUploadFile = useCallback(async (fileDefId: string, file: File) => {
    if (file.type !== "application/pdf") return;
    setUploading(fileDefId);
    try {
      const { pdf_id } = await uploadPdf(file);
      setFileUploads((prev) => ({ ...prev, [fileDefId]: { pdfId: pdf_id, filename: file.name } }));
    } catch {
      setError("Upload mislukt.");
    } finally {
      setUploading(null);
    }
  }, []);

  const allFilesUploaded = controle?.files.every((f) => fileUploads[f.id]) ?? false;
  const uploadedCount = controle?.files.filter((f) => fileUploads[f.id]).length ?? 0;

  const handleRun = useCallback(async () => {
    if (!controle || !allFilesUploaded) return;
    setPhase("running");
    setError(null);
    try {
      const files: Record<string, string> = {};
      for (const fileDef of controle.files) {
        files[fileDef.id] = fileUploads[fileDef.id].pdfId;
      }
      const res = await runControle(controle.id, files);
      setResults(res);
      setPhase("results");
    } catch {
      setError("Uitvoeren mislukt.");
      setPhase("upload");
    }
  }, [controle, fileUploads, allFilesUploaded]);

  if (!controle) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Laden...
      </div>
    );
  }

  const totalFields = results ? results.reduce((s, r) => s + r.results.length, 0) : 0;
  const totalPassed = results ? results.reduce((s, r) => s + r.results.filter((f) => f.status === "ok").length, 0) : 0;
  const totalFailed = totalFields - totalPassed;
  const allRuleResults: TemplateRuleResult[] = results?.flatMap((r) => r.template_rule_results) ?? [];
  const rulesPassed = allRuleResults.filter((r) => r.passed).length;
  const allComputedValues = results?.reduce((acc, r) => ({ ...acc, ...r.computed_values }), {} as Record<string, string>) ?? {};

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <HeaderAction>
        {phase === "results" && (
          <Button variant="outline" className="rounded-full" size="sm" onClick={() => { setPhase("upload"); setResults(null); setFileUploads({}); }}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Opnieuw uitvoeren
          </Button>
        )}
      </HeaderAction>

      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{controle.name}</h1>
        <p className="text-muted-foreground text-sm">
          {controle.files.length} bestand{controle.files.length !== 1 ? "en" : ""} · {controle.rules.length} regel{controle.rules.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ─── Upload phase ─── */}
      {phase === "upload" && (
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Bestanden uploaden</h2>
            <p className="text-sm text-muted-foreground">
              Upload een PDF voor elk bestand. {uploadedCount}/{controle.files.length} geüpload.
            </p>
          </div>

          <div className="space-y-3">
            {controle.files.map((fileDef) => {
              const upload = fileUploads[fileDef.id];
              const isUpl = uploading === fileDef.id;
              return (
                <div
                  key={fileDef.id}
                  className={`flex items-center gap-4 p-5 rounded-xl border-2 transition-colors ${
                    upload
                      ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10"
                      : "border-dashed border-border hover:border-primary/30"
                  }`}
                >
                  <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${
                    upload ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                  }`}>
                    {upload ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{fileDef.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fileDef.fields.length} veld{fileDef.fields.length !== 1 ? "en" : ""}
                      {upload && (
                        <span className="text-green-600 ml-2">{upload.filename}</span>
                      )}
                    </p>
                  </div>
                  {isUpl ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                  ) : !upload ? (
                    <Button
                      variant="outline"
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
                      <Upload className="h-4 w-4 mr-2" />
                      PDF uploaden
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
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
                      Wijzig
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            size="lg"
            className="w-full"
            disabled={!allFilesUploaded}
            onClick={handleRun}
          >
            <Play className="h-4 w-4 mr-2" />
            Controle uitvoeren
          </Button>
        </div>
      )}

      {/* ─── Running phase ─── */}
      {phase === "running" && (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <h2 className="text-lg font-semibold">Controle wordt uitgevoerd...</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Bestanden worden geanalyseerd en regels worden geëvalueerd.
          </p>
        </div>
      )}

      {/* ─── Results phase ─── */}
      {phase === "results" && results && (
        <div className="space-y-8">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="p-6 text-center">
                <p className="text-3xl font-bold text-green-600">{totalPassed}</p>
                <p className="text-sm text-muted-foreground mt-1">Velden OK</p>
              </CardContent>
            </Card>
            <Card className={totalFailed > 0 ? "border-red-200 dark:border-red-800" : "border-green-200 dark:border-green-800"}>
              <CardContent className="p-6 text-center">
                <p className={`text-3xl font-bold ${totalFailed > 0 ? "text-red-600" : "text-green-600"}`}>
                  {totalFailed}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Afwijkingen</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className={`text-3xl font-bold ${
                  allRuleResults.length === 0 ? "text-muted-foreground"
                  : rulesPassed === allRuleResults.length ? "text-green-600"
                  : "text-amber-600"
                }`}>
                  {allRuleResults.length > 0 ? `${rulesPassed}/${allRuleResults.length}` : "—"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Regels geslaagd</p>
              </CardContent>
            </Card>
          </div>

          {/* Rule results */}
          {allRuleResults.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Regelresultaten</h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Regel</TableHead>
                        <TableHead className="text-right">Resultaat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRuleResults.map((rr, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            {rr.passed ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{rr.rule_name}</TableCell>
                          <TableCell className="text-right">
                            {rr.computed_value ? (
                              <span className="font-mono">= {rr.computed_value}</span>
                            ) : rr.passed ? (
                              <span className="text-green-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-500 text-sm">{rr.message}</span>
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
          {Object.keys(allComputedValues).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Berekende waarden</h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Naam</TableHead>
                        <TableHead className="text-right">Waarde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(allComputedValues).map(([label, value]) => (
                        <TableRow key={label}>
                          <TableCell className="font-medium">{label}</TableCell>
                          <TableCell className="text-right font-mono">{value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Per-file field results */}
          {results.map((fr, fi) => {
            const fileDef = controle.files[fi];
            const passed = fr.results.filter((r) => r.status === "ok").length;
            return (
              <div key={fi} className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {fileDef?.label ?? `Bestand ${fi + 1}`}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {passed}/{fr.results.length} OK
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {fileUploads[fileDef?.id]?.filename}
                  </span>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Veld</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Waarde</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fr.results.map((r, ri) => (
                          <TableRow key={ri}>
                            <TableCell>
                              {r.status === "ok" ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : r.status === "empty" ? (
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{r.label}</TableCell>
                            <TableCell>
                              <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                r.field_type === "static" ? "bg-blue-100 text-blue-700" :
                                r.field_type === "dynamic" ? "bg-amber-100 text-amber-700" :
                                "bg-violet-100 text-violet-700"
                              }`}>
                                {r.field_type === "static" ? "S" : r.field_type === "dynamic" ? "D" : "T"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs font-medium ${
                                r.status === "ok" ? "text-green-600" :
                                r.status === "empty" ? "text-amber-600" :
                                "text-red-600"
                              }`}>
                                {r.status === "ok" ? "OK" : r.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {r.value || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            );
          })}

          {/* Bottom spacer */}
          <div className="pb-8" />
        </div>
      )}
    </div>
  );
}
