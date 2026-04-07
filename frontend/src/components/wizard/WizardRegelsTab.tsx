import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/store/appStore";
import RulesPanel from "@/components/rules/RulesPanel";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { testExtraction, testMixedExtraction } from "@/api/client";
import { Play, Loader2, CheckCircle, XCircle, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Controle, RuleNodeData, TemplateRule, ExtractionResponse } from "@/types";
import type { Node, Edge } from "@xyflow/react";

interface WizardRegelsTabProps {
  controle: Controle;
}

interface Operand {
  fileLabel?: string;
  fieldLabel: string;
  type: "field" | "literal" | "computed" | "rule_ref";
  ruleNum?: string; // e.g. "001" — set when type is "rule_ref"
}

interface RuleDescription {
  badge: string;
  operator: string; // symbol like −, +, =, etc.
  operands: Operand[];
  interpretation: string; // e.g. "aluminum minus 004"
}

const MATH_SYMBOLS: Record<string, string> = {
  add: "+", subtract: "−", multiply: "×", divide: "÷",
  modulo: "%", abs: "||", round: "≈", sum: "Σ", average: "x̄", min: "↓", max: "↑",
};

const MATH_VERBS: Record<string, string> = {
  add: "plus", subtract: "minus", multiply: "maal", divide: "gedeeld door",
  modulo: "modulo", abs: "absolute waarde van", round: "afgerond",
  sum: "som van", average: "gemiddelde van", min: "minimum van", max: "maximum van",
};

const COMPARE_SYMBOLS: Record<string, string> = {
  equals: "=", not_equals: "≠", greater_than: ">", less_than: "<",
  greater_or_equal: "≥", less_or_equal: "≤",
  contains: "⊃", not_contains: "⊅", starts_with: "▸", ends_with: "◂",
  matches_regex: "~", in_array: "∈", not_in_array: "∉",
  is_empty: "∅", is_not_empty: "≠∅",
  date_before: "<", date_after: ">", date_between: "↔",
};

const COMPARE_VERBS: Record<string, string> = {
  equals: "is gelijk aan", not_equals: "is niet gelijk aan",
  greater_than: "is groter dan", less_than: "is kleiner dan",
  greater_or_equal: "is groter of gelijk aan", less_or_equal: "is kleiner of gelijk aan",
  contains: "bevat", not_contains: "bevat niet",
  starts_with: "begint met", ends_with: "eindigt met",
  matches_regex: "voldoet aan regex", in_array: "is in lijst", not_in_array: "is niet in lijst",
  is_empty: "is leeg", is_not_empty: "is niet leeg",
  date_before: "is vóór", date_after: "is na", date_between: "is tussen",
};

const VALIDATE_VERBS: Record<string, string> = {
  not_empty: "is niet leeg", exact_match: "is exact gelijk",
  data_type: "is van type", range: "is binnen bereik",
  pattern: "voldoet aan patroon", one_of: "is een van",
};

function resolveOperand(nodeId: string, nodes: Node[], rules: TemplateRule[]): Operand {
  const n = nodes.find((nd) => nd.id === nodeId);
  if (!n) return { fieldLabel: "?", type: "computed" };
  const d = n.data as RuleNodeData;
  if (n.type === "field_input") {
    return { fileLabel: d.fieldRef?.file_label, fieldLabel: d.label, type: "field" };
  }
  if (n.type === "literal_input") {
    return { fieldLabel: d.literalValue ?? "", type: "literal" };
  }
  if (n.type === "table_column") {
    return { fileLabel: d.fieldRef?.file_label, fieldLabel: `${d.label} › ${d.tableColumnLabel}`, type: "field" };
  }
  // Check if this node is another rule — show as Rule reference
  const ruleIdx = rules.findIndex((r) => r.id === nodeId);
  if (ruleIdx !== -1) {
    return { fieldLabel: rules[ruleIdx].name, type: "rule_ref", ruleNum: String(ruleIdx + 1).padStart(3, "0") };
  }
  return { fieldLabel: d.label || n.type || "?", type: "computed" };
}

function describeRule(rule: TemplateRule, nodes: Node[], edges: Edge[], allRules: TemplateRule[] = []): RuleDescription {
  const fallback: RuleDescription = { badge: rule.type, operator: "", operands: [], interpretation: rule.name };
  const actionNode = nodes.find((n) => n.id === rule.id);
  if (!actionNode) return fallback;

  const data = actionNode.data as RuleNodeData;
  const incoming = edges.filter((e) => e.target === actionNode.id);

  const aEdge = incoming.find((e) => e.targetHandle === "a");
  const bEdge = incoming.find((e) => e.targetHandle === "b");
  const otherEdges = incoming.filter((e) => e.targetHandle !== "a" && e.targetHandle !== "b");

  const operands: Operand[] = [];
  if (aEdge) operands.push(resolveOperand(aEdge.source, nodes, allRules));
  if (bEdge) operands.push(resolveOperand(bEdge.source, nodes, allRules));
  for (const e of otherEdges) operands.push(resolveOperand(e.source, nodes, allRules));
  if (!aEdge && !bEdge) {
    for (const e of incoming) operands.push(resolveOperand(e.source, nodes, allRules));
  }

  const names = operands.map((o) => o.type === "rule_ref" ? `Rule ${o.ruleNum}` : o.fieldLabel);

  if (actionNode.type === "math_operation") {
    const op = data.mathOperation ?? "math";
    const verb = MATH_VERBS[op] ?? op;
    const interp = operands.length === 2
      ? `${names[0]} ${verb} ${names[1]}`
      : `${verb} ${names.join(", ")}`;
    return { badge: op, operator: MATH_SYMBOLS[op] ?? "", operands, interpretation: interp };
  }

  if (actionNode.type === "comparison") {
    const op = data.comparisonOperator ?? "compare";
    const verb = COMPARE_VERBS[op] ?? op;
    const interp = operands.length === 2
      ? `${names[0]} ${verb} ${names[1]}`
      : operands.length === 1
        ? `${names[0]} ${verb}`
        : `${verb} ${names.join(", ")}`;
    return { badge: op, operator: COMPARE_SYMBOLS[op] ?? "", operands, interpretation: interp };
  }

  if (actionNode.type === "validation") {
    const op = data.validationRuleType ?? "validate";
    const verb = VALIDATE_VERBS[op] ?? op;
    const interp = operands.length >= 1 ? `${names[0]} ${verb}` : verb;
    return { badge: op, operator: "✓", operands, interpretation: interp };
  }

  if (actionNode.type === "table_aggregate") {
    const op = data.aggregateOperation ?? "aggregate";
    return { badge: op, operator: "Σ", operands, interpretation: `${op} van ${names.join(", ")}` };
  }

  if (actionNode.type === "condition") {
    return { badge: "condition", operator: "?", operands, interpretation: "als … dan … anders …" };
  }

  return { badge: actionNode.type ?? rule.type, operator: "", operands, interpretation: names.join(", ") || rule.name };
}

interface FilePreviewResult {
  fileLabel: string;
  response: ExtractionResponse;
}

export function WizardRegelsTab({ controle }: WizardRegelsTabProps) {
  const loadAllFieldsForRules = useAppStore((s) => s.loadAllFieldsForRules);
  const saveRulesToWizard = useAppStore((s) => s.saveRulesToWizard);
  const templateRules = useAppStore((s) => s.templateRules);
  const computedFields = useAppStore((s) => s.computedFields);
  const ruleNodes = useAppStore((s) => s.ruleNodes);
  const ruleEdges = useAppStore((s) => s.ruleEdges);

  const [running, setRunning] = useState(false);
  const [previewResults, setPreviewResults] = useState<FilePreviewResult[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [tab, setTab] = useState<"regels" | "resultaten">("regels");

  useEffect(() => {
    loadAllFieldsForRules();
  }, [loadAllFieldsForRules, controle.files]);

  useEffect(() => {
    return () => {
      saveRulesToWizard();
    };
  }, [saveRulesToWizard]);

  const handlePreviewRun = useCallback(async () => {
    const filesWithData = controle.files.filter((f) =>
      (f.fileType === "pdf" && f.pdfId && f.fields.length > 0) ||
      (f.fileType === "spreadsheet" && f.spreadsheetId)
    );
    if (filesWithData.length === 0) return;

    const hasSpreadsheet = filesWithData.some((f) => f.fileType === "spreadsheet");

    setRunning(true);
    setPreviewError(null);
    try {
      if (hasSpreadsheet) {
        // Use mixed endpoint that handles both PDF + spreadsheet
        const mixed = await testMixedExtraction(filesWithData, templateRules, computedFields);
        const fileResults: FilePreviewResult[] = mixed.file_results.map((fr, i) => ({
          fileLabel: fr.fileLabel,
          response: {
            pdf_id: filesWithData[i]?.pdfId || filesWithData[i]?.spreadsheetId || "",
            template_id: "test",
            results: fr.results,
            needs_review: fr.results.some((r) => r.status !== "ok"),
            template_rule_results: i === 0 ? mixed.template_rule_results : [],
            computed_values: i === 0 ? mixed.computed_values : {},
          },
        }));
        setPreviewResults(fileResults);
      } else {
        // PDF-only: use existing flow
        const fileResults: FilePreviewResult[] = [];
        const pdfFiles = filesWithData.filter((f) => f.fileType === "pdf");
        for (const file of pdfFiles) {
          const response = await testExtraction(file.pdfId!, file.fields);
          fileResults.push({ fileLabel: file.label, response });
        }
        const allFields = pdfFiles.flatMap((f) => f.fields);
        const rulesResponse = await testExtraction(
          pdfFiles[0].pdfId!,
          allFields,
          undefined,
          templateRules,
          computedFields,
        );
        if (fileResults.length > 0) {
          fileResults[0].response = {
            ...fileResults[0].response,
            template_rule_results: rulesResponse.template_rule_results,
            computed_values: rulesResponse.computed_values,
          };
        }
        setPreviewResults(fileResults);
      }
      setTab("resultaten");
    } catch {
      setPreviewError("Preview mislukt. Controleer of de backend draait.");
    } finally {
      setRunning(false);
    }
  }, [controle.files, templateRules, computedFields]);

  const totalPassed = previewResults
    ? previewResults.reduce((sum, r) => sum + r.response.results.filter((f) => f.status === "ok").length, 0)
    : 0;
  const totalFailed = previewResults
    ? previewResults.reduce((sum, r) => sum + r.response.results.filter((f) => f.status !== "ok").length, 0)
    : 0;
  const ruleResults = previewResults?.flatMap((r) => r.response.template_rule_results) ?? [];
  const rulesPassed = ruleResults.filter((r) => r.passed).length;
  const rulesFailed = ruleResults.length - rulesPassed;

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={65} minSize={30}>
        <RulesPanel />
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel defaultSize={35} minSize={20}>
        <div className="h-full border-l border-border bg-background flex flex-col overflow-hidden">
          {/* Tab header */}
          <div className="flex items-center border-b border-border flex-shrink-0">
            <button
              onClick={() => setTab("regels")}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === "regels"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Overzicht ({templateRules.length})
            </button>
            <button
              onClick={() => setTab("resultaten")}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === "resultaten"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Preview resultaten
              {previewResults && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] rounded-full bg-primary/10 text-primary">
                  !
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {tab === "regels" ? (
              /* --- Rules overview --- */
              templateRules.length === 0 ? (
                <div className="flex items-center justify-center h-full px-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Verbind velden met bewerkingen op het canvas om regels te maken.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">#</th>
                        <th className="px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Operatie</th>
                        <th className="px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Velden</th>
                        <th className="px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Samenvatting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templateRules.map((rule, i) => {
                        const desc = describeRule(rule, ruleNodes, ruleEdges, templateRules);
                        const ruleNum = String(i + 1).padStart(3, "0");
                        return (
                          <tr key={rule.id} className="border-b border-border/50 align-top hover:bg-muted/30 transition-colors">
                            {/* # */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-foreground text-background font-mono whitespace-nowrap">
                                  Rule {ruleNum}
                                </span>
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    rule.enabled ? "bg-green-500" : "bg-gray-300"
                                  }`}
                                />
                              </div>
                            </td>
                            {/* Operatie */}
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                                  rule.type === "validation"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                                }`}
                              >
                                {desc.badge}
                              </span>
                            </td>
                            {/* Velden */}
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                {desc.operands.map((op, oi) => (
                                  <div key={oi} className="flex items-center gap-1.5">
                                    {op.type === "rule_ref" ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-foreground text-background font-mono whitespace-nowrap">
                                        Rule {op.ruleNum}
                                      </span>
                                    ) : op.type === "field" ? (
                                      <div className="flex items-center gap-1 min-w-0">
                                        {op.fileLabel && (
                                          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-primary/10 text-[8px] font-semibold text-primary shrink-0">
                                            <FileText className="w-2 h-2" />
                                            {op.fileLabel}
                                          </span>
                                        )}
                                        <span className="font-medium text-foreground truncate">
                                          {op.fieldLabel}
                                        </span>
                                      </div>
                                    ) : op.type === "literal" ? (
                                      <span className="font-mono text-amber-700 dark:text-amber-400">&quot;{op.fieldLabel}&quot;</span>
                                    ) : (
                                      <span className="font-mono text-muted-foreground truncate">{op.fieldLabel}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                            {/* Samenvatting */}
                            <td className="px-4 py-3">
                              <p className="text-muted-foreground italic leading-relaxed">
                                {desc.interpretation}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* --- Preview results --- */
              !previewResults ? (
                <div className="flex items-center justify-center h-full px-6 text-center">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Voer een preview uit om de regels te testen op de voorbeeldbestanden.
                    </p>
                    {previewError && (
                      <p className="text-sm text-destructive">{previewError}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-5 space-y-6">
                  {/* Summary cards */}
                  <div className="flex gap-3">
                    <div className="flex-1 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-center">
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400">{totalPassed}</p>
                      <p className="text-[11px] text-green-600 dark:text-green-500 mt-0.5">Velden OK</p>
                    </div>
                    {totalFailed > 0 ? (
                      <div className="flex-1 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-center">
                        <p className="text-2xl font-bold text-red-700 dark:text-red-400">{totalFailed}</p>
                        <p className="text-[11px] text-red-600 dark:text-red-500 mt-0.5">Afwijkingen</p>
                      </div>
                    ) : (
                      <div className="flex-1 p-4 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-center">
                        <p className="text-2xl font-bold text-green-700 dark:text-green-400">0</p>
                        <p className="text-[11px] text-green-600 dark:text-green-500 mt-0.5">Afwijkingen</p>
                      </div>
                    )}
                  </div>

                  {/* Rule results with overview context */}
                  {ruleResults.length > 0 && (() => {
                    const ruleMap = new Map(templateRules.map((r) => [r.id, r]));
                    const isValidation = (rr: typeof ruleResults[0]) => ruleMap.get(rr.rule_id)?.type === "validation";
                    // Detect incomplete/misconfigured rules vs actual failures
                    const INCOMPLETE_PATTERNS = [
                      "no comparison operand", "could not resolve",
                      "no operand", "not connected",
                    ];
                    const isIncomplete = (msg?: string) =>
                      !!msg && INCOMPLETE_PATTERNS.some((p) => msg.toLowerCase().includes(p));

                    const validations = ruleResults.filter(isValidation);
                    const computations = ruleResults.filter((rr) => !isValidation(rr));
                    const valIncomplete = validations.filter((r) => !r.passed && isIncomplete(r.message)).length;
                    const valPassed = validations.filter((r) => r.passed).length;

                    const allResultRows = [
                      ...validations.map((rr) => ({ ...rr, _isComp: false })),
                      ...computations.map((rr) => ({ ...rr, _isComp: true })),
                    ];

                    return (
                      <div className="space-y-5">
                        {/* Summary labels */}
                        {validations.length > 0 && (
                          <p className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                            Validaties: {valPassed}/{validations.length - valIncomplete} geslaagd{valIncomplete > 0 ? ` · ${valIncomplete} incompleet` : ""}
                            {computations.length > 0 && <span className="text-muted-foreground font-normal"> · {computations.length} berekening{computations.length !== 1 ? "en" : ""}</span>}
                          </p>
                        )}

                        {/* Results table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border text-left">
                                <th className="px-3 py-2 font-semibold text-muted-foreground w-8"></th>
                                <th className="px-3 py-2 font-semibold text-muted-foreground">#</th>
                                <th className="px-3 py-2 font-semibold text-muted-foreground">Operatie</th>
                                <th className="px-3 py-2 font-semibold text-muted-foreground">Velden</th>
                                <th className="px-3 py-2 font-semibold text-muted-foreground text-right">Resultaat</th>
                              </tr>
                            </thead>
                            <tbody>
                              {allResultRows.map((rr, idx) => {
                                const ruleDef = ruleMap.get(rr.rule_id);
                                const desc = ruleDef ? describeRule(ruleDef, ruleNodes, ruleEdges, templateRules) : null;
                                const ruleIdx = ruleDef ? templateRules.indexOf(ruleDef) : idx;
                                const ruleNum = String(ruleIdx + 1).padStart(3, "0");
                                const incomplete = !rr.passed && isIncomplete(rr.message);

                                const rowBg = rr._isComp
                                  ? ""
                                  : rr.passed
                                    ? "bg-green-50/50 dark:bg-green-950/10"
                                    : incomplete
                                      ? "bg-blue-50/50 dark:bg-blue-950/10"
                                      : "bg-red-50/50 dark:bg-red-950/10";

                                return (
                                  <tr key={rr.rule_id + idx} className={`border-b border-border/50 align-top ${rowBg}`}>
                                    {/* Status icon */}
                                    <td className="px-3 py-2.5">
                                      {rr._isComp ? (
                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-violet-100 dark:bg-violet-900/30 text-[9px] font-bold text-violet-700 dark:text-violet-400">=</span>
                                      ) : rr.passed ? (
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                      ) : incomplete ? (
                                        <AlertTriangle className="h-4 w-4 text-blue-500" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                      )}
                                    </td>
                                    {/* # */}
                                    <td className="px-3 py-2.5">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-foreground text-background font-mono whitespace-nowrap">
                                        Rule {ruleNum}
                                      </span>
                                    </td>
                                    {/* Operatie */}
                                    <td className="px-3 py-2.5">
                                      {desc && (
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                                          rr._isComp
                                            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                        }`}>
                                          {desc.badge}
                                        </span>
                                      )}
                                    </td>
                                    {/* Velden */}
                                    <td className="px-3 py-2.5">
                                      {desc && (
                                        <div className="flex flex-col gap-0.5">
                                          {desc.operands.map((op, oi) => (
                                            <div key={oi} className="flex items-center gap-1">
                                              {op.type === "rule_ref" ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-foreground text-background font-mono whitespace-nowrap">
                                                  Rule {op.ruleNum}
                                                </span>
                                              ) : op.type === "field" ? (
                                                <div className="flex items-center gap-1 min-w-0">
                                                  {op.fileLabel && (
                                                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-primary/10 text-[8px] font-semibold text-primary shrink-0">
                                                      <FileText className="w-2 h-2" />
                                                      {op.fileLabel}
                                                    </span>
                                                  )}
                                                  <span className="font-medium text-foreground truncate">{op.fieldLabel}</span>
                                                </div>
                                              ) : op.type === "literal" ? (
                                                <span className="font-mono text-amber-700 dark:text-amber-400">&quot;{op.fieldLabel}&quot;</span>
                                              ) : (
                                                <span className="font-mono text-muted-foreground truncate">{op.fieldLabel}</span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                    {/* Resultaat */}
                                    <td className="px-3 py-2.5 text-right max-w-[400px]">
                                      {rr.computed_value ? (
                                        (() => {
                                          // Try to render polaris lookup results as grouped table
                                          try {
                                            const obj = JSON.parse(rr.computed_value);
                                            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                                              const firstVal = Object.values(obj)[0];
                                              if (Array.isArray(firstVal) && firstVal.length > 0 && 'code' in (firstVal as any)[0]) {
                                                const entries = Object.entries(obj) as [string, {code: string; translation: string}[]][];
                                                return (
                                                  <div className="text-left max-h-[300px] overflow-y-auto">
                                                    <table className="w-full text-[11px] border-collapse">
                                                      <thead>
                                                        <tr className="border-b border-violet-200 dark:border-violet-800">
                                                          <th className="px-2 py-1 text-left font-semibold text-violet-600 dark:text-violet-400 w-24">Medewerker</th>
                                                          <th className="px-2 py-1 text-left font-semibold text-violet-600 dark:text-violet-400">Signalen</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {entries.map(([key, signals]) => (
                                                          <tr key={key} className="border-b border-border/30 align-top">
                                                            <td className="px-2 py-1.5 font-mono font-medium text-foreground whitespace-nowrap">{key}</td>
                                                            <td className="px-2 py-1.5">
                                                              <div className="flex flex-col gap-0.5">
                                                                {signals.map((sig, si) => (
                                                                  <div key={si} className="flex items-start gap-1.5">
                                                                    <code className="bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 px-1 rounded text-[10px] font-bold shrink-0 mt-px">{sig.code}</code>
                                                                    <span className="text-muted-foreground text-[10px] leading-tight">{sig.translation || <em className="text-amber-500">geen vertaling</em>}</span>
                                                                  </div>
                                                                ))}
                                                              </div>
                                                            </td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                    <div className="text-[10px] text-violet-500 mt-1 font-medium">{entries.length} medewerkers · {entries.reduce((sum, [, s]) => sum + s.length, 0)} signalen</div>
                                                  </div>
                                                );
                                              }
                                            }
                                          } catch { /* not polaris JSON, fall through */ }
                                          return <span className="font-mono font-medium text-foreground">= {rr.computed_value}</span>;
                                        })()
                                      ) : rr.passed ? (
                                        <span className="text-green-600 font-medium">OK</span>
                                      ) : (
                                        <span className={`${incomplete ? "text-blue-500" : "text-red-500"} break-words`}>
                                          {rr.message || "Mislukt"}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Per-file field results */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="px-3 py-2 font-semibold text-muted-foreground w-8"></th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">Bestand</th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground">Veld</th>
                          <th className="px-3 py-2 font-semibold text-muted-foreground text-right">Waarde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewResults.flatMap((fr) =>
                          fr.response.results.map((r, ri) => (
                            <tr key={`${fr.fileLabel}-${ri}`} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="px-3 py-2">
                                {r.status === "ok" ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-primary/10 text-[8px] font-semibold text-primary">
                                  <FileText className="w-2 h-2" />
                                  {fr.fileLabel}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-medium text-foreground">{r.label}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{r.value || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              )
            )}
          </div>

          {/* Bottom: Preview run button */}
          <div className="p-3 border-t border-border flex-shrink-0">
            <Button
              className="w-full"
              onClick={handlePreviewRun}
              disabled={running || controle.files.every((f) => {
                if (f.fileType === "spreadsheet") return !f.spreadsheetId;
                return !f.pdfId || f.fields.length === 0;
              })}
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Preview uitvoeren...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Preview uitvoeren
                </>
              )}
            </Button>
            {previewError && (
              <p className="text-xs text-destructive mt-1.5 text-center">{previewError}</p>
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
