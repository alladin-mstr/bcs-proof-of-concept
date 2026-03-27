import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { saveTestRun, listTestRuns } from '../api/client';
import type { FieldResult, TemplateRuleResult } from '../types';

// --- Icons ---

const CheckIcon = () => (
  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const FieldIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
  </svg>
);

const RulesIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
  </svg>
);

const ComputedIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
  </svg>
);

// --- Badges ---

function StatusBadge({ status }: { status: FieldResult['status'] }) {
  const styles: Record<string, string> = {
    ok: 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400',
    anchor_mismatch: 'bg-red-100 dark:bg-red-950/30 text-red-700',
    anchor_not_found: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700',
    anchor_shifted: 'bg-blue-100 dark:bg-blue-950/30 text-blue-700',
    anchor_relocated: 'bg-amber-100 dark:bg-amber-950/30 text-amber-700',
    empty: 'bg-muted text-muted-foreground',
    rule_failed: 'bg-red-100 dark:bg-red-950/30 text-red-700',
  };
  const labels: Record<string, string> = {
    ok: 'OK', anchor_mismatch: 'Mismatch', anchor_not_found: 'Not Found',
    anchor_shifted: 'Shifted', anchor_relocated: 'Relocated', empty: 'Empty', rule_failed: 'Failed',
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${styles[status] ?? ''}`}>
      {labels[status] ?? status}
    </span>
  );
}

function TypeBadge({ fieldType }: { fieldType: FieldResult['field_type'] }) {
  const map: Record<string, { letter: string; cls: string }> = {
    static: { letter: 'S', cls: 'bg-blue-100 dark:bg-blue-950/30 text-blue-700' },
    dynamic: { letter: 'D', cls: 'bg-amber-100 dark:bg-amber-950/30 text-amber-700' },
    table: { letter: 'T', cls: 'bg-violet-100 dark:bg-violet-950/30 text-violet-700' },
  };
  const { letter, cls } = map[fieldType] ?? map.static;
  return <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded ${cls}`}>{letter}</span>;
}

// --- Section wrapper ---

function Section({ title, icon, count, defaultOpen = true, variant = 'default', children }: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  variant?: 'default' | 'success' | 'error';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const borderColor = variant === 'success' ? 'border-emerald-200 dark:border-emerald-800'
    : variant === 'error' ? 'border-red-200 dark:border-red-800'
    : 'border-border';
  const headerBg = variant === 'success' ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
    : variant === 'error' ? 'bg-red-50/50 dark:bg-red-950/20'
    : 'bg-muted/30';

  return (
    <div className={`mx-3 mt-3 rounded-lg border ${borderColor} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-2 ${headerBg} transition-colors hover:bg-muted/50`}
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide flex-1 text-left">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] font-medium text-muted-foreground bg-background px-1.5 py-0.5 rounded-full">{count}</span>
        )}
        <svg className={`w-3 h-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-3 py-2">{children}</div>}
    </div>
  );
}

// --- Main component ---

interface Props { onClose: () => void; }

export default function ExtractionResults({ onClose }: Props) {
  const results = useAppStore((s) => s.extractionResults);
  const templateMode = useAppStore((s) => s.templateMode);
  const pdfId = useAppStore((s) => s.pdfId);
  const pdfFilename = useAppStore((s) => s.pdfFilename);
  const activeTemplateId = useAppStore((s) => s.activeTemplateId);
  const templates = useAppStore((s) => s.templates);
  const addSavedTestRun = useAppStore((s) => s.addSavedTestRun);
  const setSavedTestRuns = useAppStore((s) => s.setSavedTestRuns);
  const templateRuleResults = useAppStore((s) => s.templateRuleResults);
  const computedValues = useAppStore((s) => s.computedValues);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!results || results.length === 0) return null;

  const passed = results.filter((r) => r.status === 'ok' || r.status === 'anchor_shifted').length;
  const failed = results.length - passed;
  const rulesPassed = templateRuleResults.filter((r) => r.passed).length;
  const rulesFailed = templateRuleResults.length - rulesPassed;
  const activeTemplate = templates.find((t) => t.id === activeTemplateId);

  const handleSave = async () => {
    if (!pdfId || saving) return;
    setSaving(true);
    try {
      const run = await saveTestRun({
        pdf_id: pdfId,
        pdf_filename: pdfFilename || 'unknown',
        template_name: activeTemplate?.name,
        template_id: activeTemplateId || undefined,
        entries: [
          ...results.map((r) => ({
            label: r.label,
            value: r.value,
            status: r.status,
            ...(r.table_data ? { table_data: r.table_data } : {}),
          })),
          // Include computed values from rules (named outputs)
          ...Object.entries(computedValues)
            .filter(([label]) => !results.some((r) => r.label === label))
            .map(([label, value]) => ({
              label,
              value,
              status: 'computed',
            })),
        ],
      });
      addSavedTestRun(run);
      const allRuns = await listTestRuns();
      setSavedTestRuns(allRuns);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { alert('Failed to save test run'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Test Results</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
              <CheckIcon /> {passed} fields
            </span>
            {failed > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                <XIcon /> {failed} fields
              </span>
            )}
            {templateRuleResults.length > 0 && (
              <>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                  <CheckIcon /> {rulesPassed} rules
                </span>
                {rulesFailed > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                    <XIcon /> {rulesFailed} rules
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              saved ? 'bg-emerald-100 text-emerald-700' : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
            }`}
          >
            {saving ? '...' : saved ? 'Saved' : 'Save Run'}
          </button>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-4">

        {/* Section: Extracted Fields */}
        <Section title="Extracted Fields" icon={<FieldIcon />} count={results.length}>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-md border p-2.5 ${
                  r.status === 'ok' ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-950/10' :
                  r.status === 'anchor_shifted' ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-950/10' :
                  r.status === 'anchor_relocated' ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/10' :
                  'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <TypeBadge fieldType={r.field_type} />
                  {templateMode === 'comparison' && (
                    <span className={`inline-flex px-1 py-0.5 text-[9px] font-bold rounded ${
                      (r.source ?? 'a') === 'a' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                    }`}>{(r.source ?? 'a').toUpperCase()}</span>
                  )}
                  <span className="text-xs font-medium text-foreground flex-1 truncate">{r.label}</span>
                  {r.detected_datatype && (
                    <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded">{r.detected_datatype}</span>
                  )}
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-[11px] font-mono text-foreground/70 bg-background/60 rounded px-2 py-1 truncate">
                  {r.value || <span className="text-muted-foreground italic">empty</span>}
                </div>

                {/* Table data */}
                {r.field_type === 'table' && r.table_data && r.table_data.length > 0 && (
                  <div className="mt-1.5 overflow-x-auto">
                    <table className="w-full text-[10px] border border-border rounded">
                      <thead>
                        <tr className="bg-violet-50 dark:bg-violet-950/20">
                          {Object.keys(r.table_data[0]).map((col) => (
                            <th key={col} className="px-2 py-1 text-left font-semibold text-violet-700 dark:text-violet-300 border-b border-border">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {r.table_data.map((row, rowIdx) => (
                          <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-background' : 'bg-muted/50'}>
                            {Object.values(row).map((cell, cellIdx) => (
                              <td key={cellIdx} className="px-2 py-1 text-foreground/70 border-b border-border font-mono">{cell || '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Anchor info */}
                {r.field_type === 'dynamic' && r.anchor_shift && (
                  <div className="text-[10px] text-muted-foreground mt-1 italic">{r.anchor_shift}</div>
                )}

                {/* Legacy rule results */}
                {r.rule_results.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {r.rule_results.map((rr, j) => (
                      <div key={j} className="flex items-center gap-1 text-[10px]">
                        {rr.passed ? <CheckIcon /> : <XIcon />}
                        <span className={rr.passed ? 'text-muted-foreground' : 'text-red-600'}>{rr.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Chain traces (collapsed) */}
                {r.step_traces && r.step_traces.length > 0 && (
                  <ChainTraces traces={r.step_traces} />
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Section: Template Rules */}
        {templateRuleResults.length > 0 && (
          <Section
            title="Rules"
            icon={<RulesIcon />}
            count={templateRuleResults.length}
            variant={rulesFailed > 0 ? 'error' : 'success'}
          >
            <div className="space-y-1.5">
              {templateRuleResults.map((r) => (
                <div
                  key={r.rule_id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md ${
                    r.passed ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : 'bg-red-50/50 dark:bg-red-950/10'
                  }`}
                >
                  {r.passed ? <CheckIcon /> : <XIcon />}
                  <span className="text-[11px] font-medium text-foreground flex-1 truncate">{r.rule_name}</span>
                  {r.computed_value && (
                    <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                      = {r.computed_value}
                    </span>
                  )}
                  {!r.passed && !r.computed_value && (
                    <span className="text-[10px] text-red-500 truncate max-w-[160px]" title={r.message}>{r.message}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Section: Computed Values */}
        {Object.keys(computedValues).length > 0 && (
          <Section title="Computed Values" icon={<ComputedIcon />} count={Object.keys(computedValues).length} variant="success">
            <div className="space-y-1">
              {Object.entries(computedValues).map(([label, val]) => (
                <div key={label} className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-emerald-50/50 dark:bg-emerald-950/10">
                  <span className="text-[11px] font-medium text-foreground">{label}</span>
                  <span className="text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-300">{val}</span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// --- Chain traces sub-component ---

function ChainTraces({ traces }: { traces: FieldResult['step_traces'] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button onClick={() => setOpen(!open)} className="text-[9px] text-muted-foreground hover:text-foreground font-medium">
        {open ? '- Hide' : '+'} Chain trace ({traces.length})
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {traces.map((st, j) => (
            <div key={j} className="flex items-start gap-1 text-[10px]">
              <span className={`mt-0.5 flex-shrink-0 ${st.resolved ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                {st.resolved ? '\u2713' : '\u2022'}
              </span>
              <span className={
                st.category === 'search' ? 'text-amber-600' :
                st.category === 'value' ? 'text-blue-600' : 'text-muted-foreground'
              }>
                <span className="font-medium">{st.step_type}</span>
                <span className="text-muted-foreground ml-1">{st.detail}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
