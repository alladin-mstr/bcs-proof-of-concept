import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderAction } from "@/context/HeaderActionContext";
import { getControleRunDetails, getControleSeriesRun, getControle } from "@/api/client";
import RunResultViewer from "@/components/RunResultViewer";
import type { ExtractionResponse, FileGroup, TemplateRuleResult, Controle } from "@/types";

export default function RunSeriesStepDetail() {
  const { seriesId, runId, stepId } = useParams<{ seriesId: string; runId: string; stepId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepName, setStepName] = useState("");
  const [fileGroups, setFileGroups] = useState<FileGroup[]>([]);
  const [ruleResults, setRuleResults] = useState<TemplateRuleResult[]>([]);
  const [computedValues, setComputedValues] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState({ fieldsOk: 0, failures: 0, rulesPassed: 0, rulesTotal: 0 });

  useEffect(() => {
    if (!runId || !stepId) return;

    const load = async () => {
      try {
        const seriesRun = await getControleSeriesRun(runId);
        const stepResult = seriesRun.stepResults.find((sr) => sr.stepId === stepId);
        if (!stepResult?.controleRunId) {
          setError("Stap niet gevonden of geen resultaten beschikbaar.");
          setLoading(false);
          return;
        }

        setStepName(stepResult.controleName);

        const details: ExtractionResponse[] = await getControleRunDetails(stepResult.controleRunId);

        let controle: Controle | null = null;
        try {
          controle = await getControle(stepResult.controleId);
        } catch { /* continue without labels */ }

        const allRules = details.flatMap((r) => r.template_rule_results);
        const allComputed = details.reduce((acc, r) => ({ ...acc, ...r.computed_values }), {} as Record<string, string>);

        const groups: FileGroup[] = [];
        if (controle) {
          // Track which details have been assigned to avoid duplicates
          const usedDetailIndices = new Set<number>();
          for (const fileDef of controle.files) {
            const fileDefDetails: ExtractionResponse[] = [];
            for (let i = 0; i < details.length; i++) {
              if (usedDetailIndices.has(i)) continue;
              // Match by checking if the detail has fields matching this file def's field labels
              const fileDefFieldLabels = new Set(fileDef.fields.map((f) => f.label));
              const detailFieldLabels = new Set(details[i].results.map((r) => r.label));
              const hasOverlap = [...fileDefFieldLabels].some((l) => detailFieldLabels.has(l));
              if (hasOverlap) {
                fileDefDetails.push(details[i]);
                usedDetailIndices.add(i);
              }
            }
            if (fileDefDetails.length > 0) {
              groups.push({
                label: fileDef.label,
                files: fileDefDetails.map((fr) => {
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
              });
            }
          }
        }

        if (groups.length === 0) {
          groups.push({
            label: "Bestanden",
            files: details.map((fr) => {
              const passed = fr.results.filter((r) => r.status === "ok").length;
              return {
                fileId: fr.pdf_id,
                filename: fr.source_filename || "Bestand",
                fileType: "pdf",
                results: fr.results,
                ruleResults: fr.template_rule_results,
                computedValues: fr.computed_values,
                passed,
                total: fr.results.length,
              };
            }),
          });
        }

        const totalFields = details.reduce((s, r) => s + r.results.length, 0);
        const totalPassed = details.reduce((s, r) => s + r.results.filter((f) => f.status === "ok").length, 0);
        const rulesPassed = allRules.filter((r) => r.passed).length;

        setFileGroups(groups);
        setRuleResults(allRules);
        setComputedValues(allComputed);
        setSummary({
          fieldsOk: totalPassed,
          failures: totalFields - totalPassed,
          rulesPassed,
          rulesTotal: allRules.length,
        });
      } catch {
        setError("Kon resultaten niet laden.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [runId, stepId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Laden...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center space-y-4">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Terug
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HeaderAction>
        <Button variant="outline" className="rounded-full" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Terug naar serie
        </Button>
      </HeaderAction>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{stepName}</h1>
        <p className="text-muted-foreground text-sm">Stapresultaten</p>
      </div>

      <RunResultViewer
        fileGroups={fileGroups}
        ruleResults={ruleResults}
        computedValues={computedValues}
        summary={summary}
      />
    </div>
  );
}
