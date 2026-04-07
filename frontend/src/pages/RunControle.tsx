import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getControle, runControle } from "@/api/client";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Loader2, CheckCircle, XCircle, AlertTriangle,
  Play, RotateCcw, ChevronDown,
} from "lucide-react";
import FileUploadManager from "@/components/FileUploadManager";
import type { SlotDefinition } from "@/components/FileUploadManager";
import type { Controle, ExtractionResponse, TemplateRuleResult, UploadedFile } from "@/types";

type RunPhase = "upload" | "running" | "results";

export default function RunControle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [controle, setControle] = useState<Controle | null>(null);
  const [phase, setPhase] = useState<RunPhase>("upload");
  const [assignments, setAssignments] = useState<Record<string, UploadedFile[]>>({});
  const [pool, setPool] = useState<UploadedFile[]>([]);
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

  const allSlotsAssigned = controle?.files.every((f) => {
    const assigned = assignments[f.id];
    return assigned && assigned.length > 0;
  }) ?? false;

  const handleRun = useCallback(async () => {
    if (!controle || !allSlotsAssigned) return;
    setPhase("running");
    setError(null);
    try {
      const files: Record<string, string[]> = {};
      const filenames: Record<string, string> = {};
      for (const fileDef of controle.files) {
        const assigned = assignments[fileDef.id] ?? [];
        files[fileDef.id] = assigned.map((f) => f.id);
        for (const f of assigned) {
          filenames[f.id] = f.filename;
        }
      }
      const res = await runControle(controle.id, files, filenames);
      setResults(res);
      setPhase("results");
    } catch {
      setError("Uitvoeren mislukt.");
      setPhase("upload");
    }
  }, [controle, assignments, allSlotsAssigned]);

  if (!controle) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Laden...
      </div>
    );
  }

  const slots: SlotDefinition[] = controle.files.map((f) => ({
    key: f.id,
    label: f.label,
    fileType: f.fileType,
  }));

  const totalFields = results ? results.reduce((s, r) => s + r.results.length, 0) : 0;
  const totalPassed = results ? results.reduce((s, r) => s + r.results.filter((f) => f.status === "ok").length, 0) : 0;
  const totalFailed = totalFields - totalPassed;
  const allRuleResults: TemplateRuleResult[] = results?.flatMap((r) => r.template_rule_results) ?? [];
  const rulesPassed = allRuleResults.filter((r) => r.passed).length;
  const allComputedValues = results?.reduce((acc, r) => ({ ...acc, ...r.computed_values }), {} as Record<string, string>) ?? {};

  const resultsByFileDef: Map<string, ExtractionResponse[]> = new Map();
  if (results) {
    for (const fileDef of controle.files) {
      const assigned = assignments[fileDef.id] ?? [];
      const fileDefResults = results.filter((r) =>
        assigned.some((a) => a.id === r.pdf_id)
      );
      resultsByFileDef.set(fileDef.id, fileDefResults);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <HeaderAction>
        {phase === "results" && (
          <Button variant="outline" className="rounded-full" size="sm" onClick={() => { setPhase("upload"); setResults(null); setAssignments({}); setPool([]); }}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Opnieuw uitvoeren
          </Button>
        )}
      </HeaderAction>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{controle.name}</h1>
        <p className="text-muted-foreground text-sm">
          {controle.files.length} bestand{controle.files.length !== 1 ? "en" : ""} · {controle.rules.length} regel{controle.rules.length !== 1 ? "s" : ""}
        </p>
      </div>

      {phase === "upload" && (
        <div className="space-y-6">
          <FileUploadManager
            slots={slots}
            onAssignmentsChange={setAssignments}
            onPoolChange={setPool}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            size="lg"
            className="w-full"
            disabled={!allSlotsAssigned}
            onClick={handleRun}
          >
            <Play className="h-4 w-4 mr-2" />
            Controle uitvoeren
          </Button>
        </div>
      )}

      {phase === "running" && (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <h2 className="text-lg font-semibold">Controle wordt uitgevoerd...</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Bestanden worden geanalyseerd en regels worden geëvalueerd.
          </p>
        </div>
      )}

      {phase === "results" && results && (
        <div className="space-y-8">
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

          {controle.files.map((fileDef) => {
            const fileDefResults = resultsByFileDef.get(fileDef.id) ?? [];
            if (fileDefResults.length === 0) return null;
            return (
              <div key={fileDef.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {fileDef.label}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {fileDefResults.length} bestand{fileDefResults.length !== 1 ? "en" : ""}
                  </span>
                </div>

                {fileDefResults.map((fr, fi) => {
                  const passed = fr.results.filter((r) => r.status === "ok").length;
                  return (
                    <Collapsible key={fi} defaultOpen={fileDefResults.length <= 3}>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                        <span className="text-sm font-medium flex-1">
                          {fr.source_filename || `Bestand ${fi + 1}`}
                        </span>
                        <span className={`text-xs font-medium ${passed === fr.results.length ? "text-green-600" : "text-amber-600"}`}>
                          {passed}/{fr.results.length} OK
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Card className="mt-1">
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
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            );
          })}

          <div className="pb-8" />
        </div>
      )}
    </div>
  );
}
