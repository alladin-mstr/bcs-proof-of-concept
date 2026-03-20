import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { extractRegion } from '../api/client';
import type { Rule, Field, CompareOperator } from '../types';

const OPERATOR_LABELS: Record<CompareOperator, string> = {
  less_than: '< less than',
  greater_than: '> greater than',
  equals: '== equals',
  not_equals: '!= not equals',
  less_or_equal: '<= less or equal',
  greater_or_equal: '>= greater or equal',
};

const OPERATOR_SHORT: Record<CompareOperator, string> = {
  less_than: '<',
  greater_than: '>',
  equals: '==',
  not_equals: '!=',
  less_or_equal: '<=',
  greater_or_equal: '>=',
};

interface Props {
  field: Field;
}

export default function RulesEditor({ field }: Props) {
  const addRule = useAppStore((s) => s.addRule);
  const removeRule = useAppStore((s) => s.removeRule);
  const pdfId = useAppStore((s) => s.pdfId);
  const fields = useAppStore((s) => s.fields);
  const [adding, setAdding] = useState(false);
  const [ruleType, setRuleType] = useState<Rule['type']>('not_empty');
  const [loadingValue, setLoadingValue] = useState(false);

  // Form state for the different rule types
  const [exactValue, setExactValue] = useState('');
  const [dataType, setDataType] = useState<'string' | 'number' | 'integer' | 'date' | 'currency'>('string');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [allowedValues, setAllowedValues] = useState('');
  const [regexPattern, setRegexPattern] = useState('');
  const [dateThreshold, setDateThreshold] = useState('');
  const [compareFieldLabel, setCompareFieldLabel] = useState('');
  const [compareOperator, setCompareOperator] = useState<CompareOperator>('less_than');

  // Other fields available for comparison (exclude self)
  const otherFields = fields.filter((f) => f.id !== field.id);

  const handleAutoPopulate = async () => {
    if (!pdfId) return;
    setLoadingValue(true);
    try {
      const text = await extractRegion(pdfId, field.value_region);
      setExactValue(text);
    } catch {
      alert('Failed to extract value from PDF');
    } finally {
      setLoadingValue(false);
    }
  };

  const handleAdd = () => {
    let rule: Rule;

    switch (ruleType) {
      case 'not_empty':
        rule = { type: 'not_empty' };
        break;
      case 'exact_match':
        if (!exactValue.trim()) return;
        rule = { type: 'exact_match', expected_value: exactValue.trim() };
        break;
      case 'data_type':
        rule = { type: 'data_type', data_type: dataType };
        break;
      case 'range':
        rule = {
          type: 'range',
          min_value: minValue ? parseFloat(minValue) : undefined,
          max_value: maxValue ? parseFloat(maxValue) : undefined,
        };
        if (rule.min_value === undefined && rule.max_value === undefined) return;
        break;
      case 'one_of':
        if (!allowedValues.trim()) return;
        rule = {
          type: 'one_of',
          allowed_values: allowedValues.split(',').map((v) => v.trim()).filter(Boolean),
        };
        break;
      case 'pattern':
        if (!regexPattern.trim()) return;
        rule = { type: 'pattern', regex: regexPattern.trim() };
        break;
      case 'date_before':
      case 'date_after':
        if (!dateThreshold) return;
        rule = { type: ruleType, date_threshold: dateThreshold };
        break;
      case 'compare_field':
        if (!compareFieldLabel) return;
        rule = {
          type: 'compare_field',
          compare_field_label: compareFieldLabel,
          compare_operator: compareOperator,
        };
        break;
      default:
        return;
    }

    addRule(field.id, rule);
    setAdding(false);
    resetForm();
  };

  const resetForm = () => {
    setExactValue('');
    setMinValue('');
    setMaxValue('');
    setAllowedValues('');
    setRegexPattern('');
    setDateThreshold('');
    setCompareFieldLabel('');
    setCompareOperator('less_than');
  };

  const getRuleDescription = (rule: Rule): string => {
    switch (rule.type) {
      case 'not_empty':
        return 'Must not be empty';
      case 'exact_match':
        return `Must equal "${rule.expected_value}"`;
      case 'data_type':
        return `Must be ${rule.data_type}`;
      case 'range': {
        const parts: string[] = [];
        if (rule.min_value !== undefined) parts.push(`min: ${rule.min_value}`);
        if (rule.max_value !== undefined) parts.push(`max: ${rule.max_value}`);
        return `Range: ${parts.join(', ')}`;
      }
      case 'one_of':
        return `One of: ${(rule.allowed_values ?? []).join(', ')}`;
      case 'pattern':
        return `Matches: ${rule.regex}`;
      case 'date_before':
        return `Before ${rule.date_threshold}`;
      case 'date_after':
        return `After ${rule.date_threshold}`;
      case 'compare_field': {
        const op = rule.compare_operator ? OPERATOR_SHORT[rule.compare_operator] : '?';
        return `${op} ${rule.compare_field_label}`;
      }
      default:
        return rule.type;
    }
  };

  return (
    <div className="mt-1.5">
      {/* Existing rules */}
      {field.rules.length > 0 && (
        <div className="space-y-1 mb-1.5">
          {field.rules.map((rule, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between bg-gray-50 rounded px-2 py-1"
            >
              <span className="text-[10px] text-gray-600 truncate flex-1">
                {getRuleDescription(rule)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeRule(field.id, idx);
                }}
                className="ml-1 text-gray-400 hover:text-red-500 text-[10px] flex-shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add rule */}
      {!adding ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
          }}
          className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
        >
          + Add Rule
        </button>
      ) : (
        <div className="bg-gray-50 rounded-lg p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          {/* Rule type selector */}
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as Rule['type'])}
            className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-1 bg-white"
          >
            <option value="not_empty">Not Empty</option>
            <option value="exact_match">Exact Match</option>
            <option value="data_type">Data Type</option>
            <option value="range">Range</option>
            <option value="one_of">One Of</option>
            <option value="pattern">Regex Pattern</option>
            <option value="date_before">Date Before</option>
            <option value="date_after">Date After</option>
            <option value="compare_field">Compare to Field</option>
          </select>

          {/* Conditional inputs based on rule type */}
          {ruleType === 'exact_match' && (
            <div className="space-y-1">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={exactValue}
                  onChange={(e) => setExactValue(e.target.value)}
                  placeholder="Expected value..."
                  className="flex-1 text-[11px] rounded border border-gray-200 px-1.5 py-1"
                />
                <button
                  onClick={handleAutoPopulate}
                  disabled={!pdfId || loadingValue}
                  className="text-[10px] px-1.5 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-40 font-medium whitespace-nowrap"
                  title="Extract the current value from this field's region in the PDF"
                >
                  {loadingValue ? '...' : 'Use Current'}
                </button>
              </div>
              {exactValue && (
                <p className="text-[10px] text-gray-500 truncate">
                  Value: &quot;{exactValue}&quot;
                </p>
              )}
            </div>
          )}

          {ruleType === 'data_type' && (
            <select
              value={dataType}
              onChange={(e) => setDataType(e.target.value as typeof dataType)}
              className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-1 bg-white"
            >
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="integer">Integer</option>
              <option value="date">Date</option>
              <option value="currency">Currency</option>
            </select>
          )}

          {ruleType === 'range' && (
            <div className="flex gap-1.5">
              <input
                type="number"
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                placeholder="Min"
                className="w-1/2 text-[11px] rounded border border-gray-200 px-1.5 py-1"
              />
              <input
                type="number"
                value={maxValue}
                onChange={(e) => setMaxValue(e.target.value)}
                placeholder="Max"
                className="w-1/2 text-[11px] rounded border border-gray-200 px-1.5 py-1"
              />
            </div>
          )}

          {ruleType === 'one_of' && (
            <input
              type="text"
              value={allowedValues}
              onChange={(e) => setAllowedValues(e.target.value)}
              placeholder="Value1, Value2, Value3..."
              className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-1"
            />
          )}

          {ruleType === 'pattern' && (
            <input
              type="text"
              value={regexPattern}
              onChange={(e) => setRegexPattern(e.target.value)}
              placeholder="^[A-Z]{3}-\d{4}$"
              className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-1 font-mono"
            />
          )}

          {(ruleType === 'date_before' || ruleType === 'date_after') && (
            <input
              type="date"
              value={dateThreshold}
              onChange={(e) => setDateThreshold(e.target.value)}
              className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-1"
            />
          )}

          {ruleType === 'compare_field' && (
            <div className="space-y-1.5">
              {/* Operator */}
              <select
                value={compareOperator}
                onChange={(e) => setCompareOperator(e.target.value as CompareOperator)}
                className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-1 bg-white"
              >
                {(Object.entries(OPERATOR_LABELS) as [CompareOperator, string][]).map(([op, label]) => (
                  <option key={op} value={op}>{label}</option>
                ))}
              </select>
              {/* Target field */}
              {otherFields.length > 0 ? (
                <select
                  value={compareFieldLabel}
                  onChange={(e) => setCompareFieldLabel(e.target.value)}
                  className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-1 bg-white"
                >
                  <option value="">Select field...</option>
                  {otherFields.map((f) => (
                    <option key={f.id} value={f.label}>{f.label}</option>
                  ))}
                </select>
              ) : (
                <p className="text-[10px] text-gray-400 italic">No other fields to compare against</p>
              )}
              {compareFieldLabel && (
                <p className="text-[10px] text-gray-500">
                  This field {OPERATOR_LABELS[compareOperator].split(' ').slice(1).join(' ')} <strong>{compareFieldLabel}</strong>
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={handleAdd}
              className="flex-1 text-[10px] font-medium py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); resetForm(); }}
              className="flex-1 text-[10px] font-medium py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
