import { useAppStore } from '../store/appStore';
import type { FieldResult } from '../types';

function StatusBadge({ status }: { status: FieldResult['status'] }) {
  switch (status) {
    case 'ok':
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">
          OK
        </span>
      );
    case 'anchor_mismatch':
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
          Anchor Mismatch
        </span>
      );
    case 'anchor_not_found':
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">
          Anchor Not Found
        </span>
      );
    case 'anchor_shifted':
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
          Anchor Shifted
        </span>
      );
    case 'anchor_relocated':
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
          Anchor Relocated
        </span>
      );
    case 'empty':
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-500">
          Empty
        </span>
      );
    case 'rule_failed':
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
          Rule Failed
        </span>
      );
  }
}

function TypeBadge({ fieldType }: { fieldType: FieldResult['field_type'] }) {
  if (fieldType === 'static') {
    return (
      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-700">S</span>
    );
  }
  return (
    <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-700">D</span>
  );
}

interface Props {
  onClose: () => void;
}

export default function ExtractionResults({ onClose }: Props) {
  const results = useAppStore((s) => s.extractionResults);
  const templateMode = useAppStore((s) => s.templateMode);

  if (!results || results.length === 0) return null;

  const passed = results.filter((r) => r.status === 'ok' || r.status === 'anchor_shifted').length;
  const needsReview = results.filter((r) => r.status !== 'ok' && r.status !== 'anchor_shifted').length;

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Test Results</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="text-green-600 font-medium">{passed} passed</span>
            {needsReview > 0 && (
              <span className="text-red-600 font-medium ml-2">{needsReview} failed</span>
            )}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title="Close results"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Review banner */}
      {needsReview > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          <p className="text-xs font-medium text-amber-800">
            {needsReview} field{needsReview > 1 ? 's' : ''} need{needsReview === 1 ? 's' : ''} human review
          </p>
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {results.map((r, i) => (
          <div
            key={i}
            className={`px-4 py-3 border-b border-gray-100 ${
              r.status === 'anchor_shifted' ? 'bg-blue-50/50' :
              r.status === 'anchor_relocated' ? 'bg-amber-50/50' :
              r.status !== 'ok' ? 'bg-red-50/50' : ''
            }`}
          >
            {/* Field header */}
            <div className="flex items-center gap-2 mb-1.5">
              <TypeBadge fieldType={r.field_type} />
              {templateMode === 'comparison' && (
                <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded ${
                  (r.source ?? 'a') === 'a' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                }`}>
                  {(r.source ?? 'a').toUpperCase()}
                </span>
              )}
              <span className="text-sm font-medium text-gray-800 flex-1 truncate">{r.label}</span>
              <StatusBadge status={r.status} />
            </div>

            {/* Value */}
            <div className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1 mb-1.5 truncate">
              {r.value || <span className="text-gray-400 italic">empty</span>}
            </div>

            {/* Anchor info for dynamic fields */}
            {r.field_type === 'dynamic' && (r.expected_anchor || r.actual_anchor) && (
              <div className="text-[11px] text-gray-500 mb-1.5 space-y-0.5">
                {r.expected_anchor && (
                  <div>
                    <span className="text-gray-400">Expected anchor:</span>{' '}
                    <span className="font-mono">{r.expected_anchor}</span>
                  </div>
                )}
                {r.actual_anchor !== undefined && (
                  <div>
                    <span className="text-gray-400">Actual anchor:</span>{' '}
                    <span className={`font-mono ${r.status === 'anchor_mismatch' ? 'text-red-600 font-semibold' : ''}`}>
                      {r.actual_anchor || <span className="italic">empty</span>}
                    </span>
                  </div>
                )}
                {r.anchor_shift && (
                  <div className="mt-0.5">
                    <span className={`text-[10px] italic ${
                      r.status === 'anchor_shifted' ? 'text-blue-600' : 'text-amber-600'
                    }`}>
                      {r.anchor_shift}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Rule results */}
            {r.rule_results.length > 0 && (
              <div className="space-y-0.5 mt-1">
                {r.rule_results.map((rr, j) => (
                  <div key={j} className="flex items-start gap-1.5 text-[11px]">
                    <span className={`mt-px flex-shrink-0 ${rr.passed ? 'text-green-600' : 'text-red-600'}`}>
                      {rr.passed ? '\u2713' : '\u2717'}
                    </span>
                    <span className={rr.passed ? 'text-gray-500' : 'text-red-600 font-medium'}>
                      {rr.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Chain step traces */}
            {r.step_traces && r.step_traces.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 font-medium mb-0.5">Chain Trace</p>
                <div className="space-y-0.5">
                  {r.step_traces.map((st, j) => (
                    <div key={j} className="flex items-start gap-1.5 text-[10px]">
                      <span className={`mt-px flex-shrink-0 ${st.resolved ? 'text-green-500' : 'text-gray-400'}`}>
                        {st.resolved ? '\u2713' : '\u2022'}
                      </span>
                      <span className={`${
                        st.category === 'search' ? 'text-amber-600' :
                        st.category === 'value' ? 'text-blue-600' :
                        st.resolved ? 'text-green-600' : 'text-red-500'
                      }`}>
                        <span className="font-medium">{st.step_type}</span>
                        <span className="text-gray-400 ml-1">{st.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
