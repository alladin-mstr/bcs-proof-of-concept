import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getControle, runControle } from "@/api/client";
import { HeaderAction } from "@/context/HeaderActionContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, RotateCcw } from "lucide-react";
import FileUploadManager from "@/components/FileUploadManager";
import type { SlotDefinition } from "@/components/FileUploadManager";
import RunResultViewer from "@/components/RunResultViewer";
import type { Controle, ExtractionResponse, TemplateRuleResult, UploadedFile } from "@/types";
import type { FileGroup } from "@/types";

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
    <div className={phase === "results" ? "space-y-4" : "max-w-4xl mx-auto space-y-8"}>
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

      {phase === "results" && results && (() => {
        const fileGroups: FileGroup[] = controle.files.map((fileDef) => {
          const assigned = assignments[fileDef.id] ?? [];
          const fileDefResults = results.filter((r) =>
            assigned.some((a) => a.id === r.pdf_id)
          );
          return {
            label: fileDef.label,
            files: fileDefResults.map((fr) => {
              const passed = fr.results.filter((r) => r.status === "ok").length;
              return {
                fileId: fr.pdf_id,
                filename: fr.source_filename || "Bestand",
                fileType: fileDef.fileType,
                results: fr.results,
                ruleResults: fr.template_rule_results,
                computedValues: fr.computed_values,
                passed,
                total: fr.results.length,
              };
            }),
          };
        });

        return (
          <RunResultViewer
            fileGroups={fileGroups}
            ruleResults={allRuleResults}
            computedValues={allComputedValues}
            summary={{
              fieldsOk: totalPassed,
              failures: totalFailed,
              rulesPassed,
              rulesTotal: allRuleResults.length,
            }}
          />
        );
      })()}
    </div>
  );
}
