import { useState } from "react";
import { useAppStore } from "../store/appStore";
import type {
  Field,
  ChainStep,
  ChainStepCategory,
  CompareOperator,
} from "../types";

// Step type definitions with labels, descriptions, and tooltips
const SEARCH_STEPS = [
  {
    type: "exact_position",
    label: "Exact Position",
    desc: "Check anchor at template coordinates",
  },
  {
    type: "vertical_slide",
    label: "Vertical Slide",
    desc: "Search vertically ± tolerance",
  },
  {
    type: "full_page_search",
    label: "Full Page Search",
    desc: "Search entire page for anchor",
  },
  {
    type: "region_search",
    label: "Region Search",
    desc: "Search within a custom region",
  },
] as const;

const VALUE_STEPS = [
  {
    type: "offset_value",
    label: "Offset Value",
    desc: "Extract at anchor offset",
  },
  {
    type: "adjacent_scan",
    label: "Adjacent Scan",
    desc: "Scan near anchor for matching format",
  },
] as const;

const VALIDATE_STEPS = [
  { type: "not_empty", label: "Not Empty", desc: "Value must not be empty" },
  {
    type: "exact_match",
    label: "Exact Match",
    desc: "Value must equal expected",
  },
  { type: "data_type", label: "Data Type", desc: "Must be a specific type" },
  { type: "range", label: "Range", desc: "Numeric range check" },
  { type: "one_of", label: "One Of", desc: "Must be from a list" },
  { type: "pattern", label: "Pattern", desc: "Must match regex" },
  { type: "date_before", label: "Date Before", desc: "Date upper bound" },
  { type: "date_after", label: "Date After", desc: "Date lower bound" },
  {
    type: "compare_field",
    label: "Compare Field",
    desc: "Compare to another field",
  },
] as const;

const CATEGORY_COLORS: Record<
  ChainStepCategory,
  { bg: string; border: string; text: string; dot: string; line: string }
> = {
  search: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-400",
    line: "bg-amber-200",
  },
  value: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    dot: "bg-blue-400",
    line: "bg-blue-200",
  },
  validate: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
    dot: "bg-purple-400",
    line: "bg-purple-200",
  },
};

const CATEGORY_LABELS: Record<ChainStepCategory, string> = {
  search: "Find Anchor",
  value: "Land Value",
  validate: "Validate",
};

const OPERATOR_LABELS: Record<CompareOperator, string> = {
  less_than: "< less than",
  greater_than: "> greater than",
  equals: "== equals",
  not_equals: "!= not equals",
  less_or_equal: "<= less or equal",
  greater_or_equal: ">= greater or equal",
};

function getStepLabel(step: ChainStep): string {
  const allSteps = [...SEARCH_STEPS, ...VALUE_STEPS, ...VALIDATE_STEPS];
  return allSteps.find((s) => s.type === step.type)?.label ?? step.type;
}

function getStepTooltip(step: ChainStep): string | null {
  const allSteps = [...SEARCH_STEPS, ...VALUE_STEPS];
  return (allSteps as readonly { type: string; tooltip?: string }[]).find((s) => s.type === step.type)?.tooltip ?? null;
}

function getStepSummary(step: ChainStep): string | null {
  switch (step.type) {
    case "vertical_slide":
      return `±${((step.slide_tolerance ?? 0.3) * 100).toFixed(0)}%`;
    case "adjacent_scan":
      return step.search_direction ?? "right";
    case "exact_match":
      return step.expected_value ? `"${step.expected_value}"` : null;
    case "data_type":
      return step.data_type ?? null;
    case "range": {
      const parts: string[] = [];
      if (step.min_value !== undefined) parts.push(`≥${step.min_value}`);
      if (step.max_value !== undefined) parts.push(`≤${step.max_value}`);
      return parts.join(", ") || null;
    }
    case "one_of":
      return step.allowed_values
        ? `${step.allowed_values.length} values`
        : null;
    case "pattern":
      return step.regex ?? null;
    case "date_before":
    case "date_after":
      return step.date_threshold ?? null;
    case "compare_field":
      return step.compare_field_label ?? null;
    default:
      return null;
  }
}

interface Props {
  field: Field;
}

export default function ChainEditor({ field }: Props) {
  const addChainStep = useAppStore((s) => s.addChainStep);
  const removeChainStep = useAppStore((s) => s.removeChainStep);
  const updateChainStep = useAppStore((s) => s.updateChainStep);
  const reorderChainSteps = useAppStore((s) => s.reorderChainSteps);
  const setChainEditFieldId = useAppStore((s) => s.setChainEditFieldId);
  const chainEditFieldId = useAppStore((s) => s.chainEditFieldId);
  const fields = useAppStore((s) => s.fields);
  const pdfId = useAppStore((s) => s.pdfId);

  const [addingAt, setAddingAt] = useState<number | null>(null); // index to insert after, -1 = start
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const isChainEditActive = chainEditFieldId === field.id;
  const chain = field.chain;
  const otherFields = fields.filter((f) => f.id !== field.id);

  // Group steps by category for visual sections
  const searchSteps = chain.filter((s) => s.category === "search");
  const valueSteps = chain.filter((s) => s.category === "value");
  const validateSteps = chain.filter((s) => s.category === "validate");

  const handleToggleChainEdit = () => {
    setChainEditFieldId(isChainEditActive ? null : field.id);
  };

  const getAvailableSteps = (): {
    category: ChainStepCategory;
    type: string;
    label: string;
    desc: string;
  }[] => {
    const available: {
      category: ChainStepCategory;
      type: string;
      label: string;
      desc: string;
    }[] = [];
    if (field.type === "dynamic") {
      SEARCH_STEPS.forEach((s) => available.push({ category: "search", ...s }));
      VALUE_STEPS.forEach((s) => available.push({ category: "value", ...s }));
    }
    VALIDATE_STEPS.forEach((s) =>
      available.push({ category: "validate", ...s }),
    );
    return available;
  };

  const handleAddStep = (category: ChainStepCategory, type: string) => {
    const step: ChainStep = {
      id: crypto.randomUUID(),
      category,
      type,
    };
    // Set defaults
    if (type === "vertical_slide") step.slide_tolerance = 0.3;
    if (type === "adjacent_scan") step.search_direction = "right";
    if (type === "data_type") step.data_type = "string";

    const insertAfter = addingAt !== null ? addingAt : undefined;
    addChainStep(field.id, step, insertAfter);
    setAddingAt(null);
    setExpandedStepId(step.id);
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragIdx !== null && dragIdx !== idx) {
      reorderChainSteps(field.id, dragIdx, idx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // Render a section header for a category group
  const renderCategoryHeader = (
    category: ChainStepCategory,
    steps: ChainStep[],
  ) => {
    if (steps.length === 0) return null;
    const colors = CATEGORY_COLORS[category];
    return (
      <div className={`flex items-center gap-1.5 px-1 py-0.5`}>
        <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
        <span
          className={`text-[9px] font-semibold uppercase tracking-wider ${colors.text}`}
        >
          {CATEGORY_LABELS[category]}
        </span>
        <span className="text-[9px] text-gray-400">
          {category === "search" || category === "value"
            ? "(first match wins)"
            : "(all must pass)"}
        </span>
      </div>
    );
  };

  // Render a single step card
  const renderStep = (step: ChainStep, globalIdx: number) => {
    const colors = CATEGORY_COLORS[step.category];
    const isExpanded = expandedStepId === step.id;
    const isDragging = dragIdx === globalIdx;
    const isDragOver = dragOverIdx === globalIdx;
    const summary = getStepSummary(step);

    return (
      <div key={step.id}>
        {/* Connector line above (except first) */}
        {globalIdx > 0 && (
          <div className="flex justify-center relative group/connector">
            <div className={`w-0.5 h-3 ${colors.line}`} />
            {/* Insert button on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAddingAt(globalIdx - 1);
              }}
              className="absolute top-0.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[8px] font-bold flex items-center justify-center opacity-0 group-hover/connector:opacity-100 transition-opacity hover:bg-blue-500 hover:text-white z-10"
              title="Insert step"
            >
              +
            </button>
          </div>
        )}

        {/* Step card */}
        <div
          className={`rounded-md border transition-all cursor-grab ${colors.bg} ${colors.border} ${
            isDragging ? "opacity-40" : ""
          } ${isDragOver ? "ring-2 ring-blue-400" : ""}`}
          draggable
          onDragStart={() => handleDragStart(globalIdx)}
          onDragOver={(e) => handleDragOver(e, globalIdx)}
          onDrop={() => handleDrop(globalIdx)}
          onDragEnd={handleDragEnd}
        >
          {/* Collapsed view */}
          <div
            className="flex items-center gap-1.5 px-2 py-1.5"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedStepId(isExpanded ? null : step.id);
            }}
          >
            {/* Drag handle */}
            <span
              className="text-[10px] text-gray-400 cursor-grab select-none"
              title="Drag to reorder"
            >
              ⠿
            </span>
            {/* Step number */}
            <span
              className={`text-[9px] font-bold ${colors.text} w-3 text-center`}
            >
              {globalIdx + 1}
            </span>
            {/* Step label */}
            <span className={`text-[11px] font-medium ${colors.text} flex-1`} title={getStepTooltip(step) ?? undefined}>
              {getStepLabel(step)}
            </span>
            {/* Inline summary */}
            {summary && !isExpanded && (
              <span className="text-[10px] text-gray-500 truncate max-w-[80px]">
                {summary}
              </span>
            )}
            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeChainStep(field.id, step.id);
              }}
              className="text-gray-400 hover:text-red-500 text-[10px] flex-shrink-0"
              title="Remove step"
            >
              ×
            </button>
          </div>

          {/* Expanded config */}
          {isExpanded && (
            <div
              className="px-2 pb-2 pt-0.5 border-t border-gray-100/50"
              onClick={(e) => e.stopPropagation()}
            >
              <StepConfig
                step={step}
                field={field}
                otherFields={otherFields}
                pdfId={pdfId}
                onUpdate={(updates) =>
                  updateChainStep(field.id, step.id, updates)
                }
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // Build ordered list with category headers
  const renderChain = () => {
    const elements: React.ReactNode[] = [];
    let globalIdx = 0;

    const categories: { cat: ChainStepCategory; steps: ChainStep[] }[] = [
      { cat: "search", steps: searchSteps },
      { cat: "value", steps: valueSteps },
      { cat: "validate", steps: validateSteps },
    ];

    for (const { cat, steps } of categories) {
      if (steps.length > 0) {
        elements.push(
          <div key={`header-${cat}`} className="mt-1 first:mt-0">
            {renderCategoryHeader(cat, steps)}
          </div>,
        );
        for (const step of steps) {
          elements.push(renderStep(step, globalIdx));
          globalIdx++;
        }
      }
    }

    return elements;
  };

  return (
    <div className="mt-1" data-chain-editor>
      {/* Chain toggle button */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleChainEdit();
          }}
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
            isChainEditActive
              ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300"
              : "bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"
          }`}
        >
          {isChainEditActive ? "● Chain Edit" : "○ Chain"}
        </button>
        <span className="text-[9px] text-gray-400">
          {chain.length} step{chain.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isChainEditActive && (
        <div className="space-y-0">
          {/* Chain steps */}
          {chain.length === 0 ? (
            <p className="text-[10px] text-gray-400 text-center py-2">
              No steps yet. Add a step to build the chain.
            </p>
          ) : (
            renderChain()
          )}

          {/* Add step dropdown */}
          {addingAt !== null ? (
            <AddStepDropdown
              availableSteps={getAvailableSteps()}
              onAdd={handleAddStep}
              onCancel={() => setAddingAt(null)}
            />
          ) : (
            <div className="flex justify-center mt-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingAt(chain.length - 1);
                }}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
              >
                <span className="text-sm leading-none">+</span> Add Step
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Dropdown for choosing a step type to add
function AddStepDropdown({
  availableSteps,
  onAdd,
  onCancel,
}: {
  availableSteps: {
    category: ChainStepCategory;
    type: string;
    label: string;
    desc: string;
  }[];
  onAdd: (category: ChainStepCategory, type: string) => void;
  onCancel: () => void;
}) {
  const [selectedCat, setSelectedCat] = useState<ChainStepCategory | null>(
    null,
  );

  const categories = [...new Set(availableSteps.map((s) => s.category))];
  const filtered = selectedCat
    ? availableSteps.filter((s) => s.category === selectedCat)
    : availableSteps;

  return (
    <div
      className="mt-1.5 bg-white rounded-lg border border-gray-200 shadow-sm p-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Category tabs */}
      <div className="flex gap-0.5 mb-1">
        {categories.map((cat) => {
          const colors = CATEGORY_COLORS[cat];
          return (
            <button
              key={cat}
              onClick={() => setSelectedCat(selectedCat === cat ? null : cat)}
              className={`text-[9px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                selectedCat === cat
                  ? `${colors.bg} ${colors.text} ${colors.border} border`
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>
      {/* Step options */}
      <div className="space-y-0.5 max-h-36 overflow-y-auto">
        {filtered.map((s) => {
          const colors = CATEGORY_COLORS[s.category];
          return (
            <button
              key={`${s.category}-${s.type}`}
              onClick={() => onAdd(s.category, s.type)}
              className={`w-full text-left px-2 py-1 rounded text-[10px] hover:${colors.bg} transition-colors flex items-center gap-1.5`}
            >
              <span
                className={`w-1 h-1 rounded-full ${colors.dot} flex-shrink-0`}
              />
              <span className="font-medium text-gray-700">{s.label}</span>
              <span className="text-gray-400 truncate flex-1">{s.desc}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onCancel}
        className="w-full text-[10px] text-gray-500 hover:text-gray-700 mt-1 py-0.5"
      >
        Cancel
      </button>
    </div>
  );
}

// Config editor for individual step types
function StepConfig({
  step,
  field,
  otherFields,
  pdfId,
  onUpdate,
}: {
  step: ChainStep;
  field: Field;
  otherFields: Field[];
  pdfId: string | null;
  onUpdate: (updates: Partial<ChainStep>) => void;
}) {
  const [loadingValue, setLoadingValue] = useState(false);

  switch (step.type) {
    case "exact_position":
      return (
        <p className="text-[10px] text-gray-500">
          Checks anchor text at the template-defined coordinates.
        </p>
      );

    case "vertical_slide":
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-gray-500 block">
            Tolerance (% of page height)
          </label>
          <input
            type="range"
            min={5}
            max={50}
            value={(step.slide_tolerance ?? 0.3) * 100}
            onChange={(e) =>
              onUpdate({ slide_tolerance: parseInt(e.target.value) / 100 })
            }
            className="w-full h-1 accent-amber-500"
          />
          <span className="text-[10px] text-gray-600 font-mono">
            ±{((step.slide_tolerance ?? 0.3) * 100).toFixed(0)}%
          </span>
        </div>
      );

    case "full_page_search":
      return (
        <p className="text-[10px] text-gray-500">
          Searches the entire page for the anchor text. Returns the closest
          match to the original position.
        </p>
      );

    case "region_search":
      return (
        <p className="text-[10px] text-gray-500">
          Draw a region on the PDF to define the search area.{" "}
          <em>(Coming soon)</em>
        </p>
      );

    case "offset_value":
      return (
        <p className="text-[10px] text-gray-500">
          Extracts value at the same offset from the found anchor as defined in
          the template.
        </p>
      );

    case "adjacent_scan":
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-gray-500 block">
            Scan direction
          </label>
          <div className="flex gap-1">
            {(["right", "below"] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => onUpdate({ search_direction: dir })}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  (step.search_direction ?? "right") === dir
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {dir === "right" ? "→ Right" : "↓ Below"}
              </button>
            ))}
          </div>
        </div>
      );

    case "not_empty":
      return (
        <p className="text-[10px] text-gray-500">Value must not be empty.</p>
      );

    case "exact_match":
      return (
        <div className="space-y-1">
          <div className="flex gap-1">
            <input
              type="text"
              value={step.expected_value ?? ""}
              onChange={(e) => onUpdate({ expected_value: e.target.value })}
              placeholder="Expected value..."
              className="flex-1 text-[11px] rounded border border-gray-200 px-1.5 py-0.5"
            />
            {pdfId && (
              <button
                onClick={async () => {
                  setLoadingValue(true);
                  try {
                    const { extractRegion } = await import("../api/client");
                    const text = await extractRegion(pdfId, field.value_region);
                    onUpdate({ expected_value: text });
                  } catch {
                    /* ignore */
                  }
                  setLoadingValue(false);
                }}
                disabled={loadingValue}
                className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-40 font-medium whitespace-nowrap"
              >
                {loadingValue ? "..." : "Use Current"}
              </button>
            )}
          </div>
        </div>
      );

    case "data_type":
      return (
        <select
          value={step.data_type ?? "string"}
          onChange={(e) =>
            onUpdate({ data_type: e.target.value as ChainStep["data_type"] })
          }
          className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-0.5 bg-white"
        >
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="integer">Integer</option>
          <option value="date">Date</option>
          <option value="currency">Currency</option>
        </select>
      );

    case "range":
      return (
        <div className="flex gap-1">
          <input
            type="number"
            value={step.min_value ?? ""}
            onChange={(e) =>
              onUpdate({
                min_value: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
            placeholder="Min"
            className="w-1/2 text-[11px] rounded border border-gray-200 px-1.5 py-0.5"
          />
          <input
            type="number"
            value={step.max_value ?? ""}
            onChange={(e) =>
              onUpdate({
                max_value: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
            placeholder="Max"
            className="w-1/2 text-[11px] rounded border border-gray-200 px-1.5 py-0.5"
          />
        </div>
      );

    case "one_of":
      return (
        <input
          type="text"
          value={(step.allowed_values ?? []).join(", ")}
          onChange={(e) =>
            onUpdate({
              allowed_values: e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            })
          }
          placeholder="Value1, Value2, ..."
          className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-0.5"
        />
      );

    case "pattern":
      return (
        <input
          type="text"
          value={step.regex ?? ""}
          onChange={(e) => onUpdate({ regex: e.target.value })}
          placeholder="^[A-Z]{3}-\d{4}$"
          className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-0.5 font-mono"
        />
      );

    case "date_before":
    case "date_after":
      return (
        <input
          type="date"
          value={step.date_threshold ?? ""}
          onChange={(e) => onUpdate({ date_threshold: e.target.value })}
          className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-0.5"
        />
      );

    case "compare_field":
      return (
        <div className="space-y-1">
          <select
            value={step.compare_operator ?? "less_than"}
            onChange={(e) =>
              onUpdate({ compare_operator: e.target.value as CompareOperator })
            }
            className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-0.5 bg-white"
          >
            {(
              Object.entries(OPERATOR_LABELS) as [CompareOperator, string][]
            ).map(([op, label]) => (
              <option key={op} value={op}>
                {label}
              </option>
            ))}
          </select>
          {otherFields.length > 0 ? (
            <select
              value={step.compare_field_label ?? ""}
              onChange={(e) =>
                onUpdate({ compare_field_label: e.target.value })
              }
              className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-0.5 bg-white"
            >
              <option value="">Select field...</option>
              {otherFields.map((f) => (
                <option key={f.id} value={f.label}>
                  {f.label}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[10px] text-gray-400 italic">No other fields</p>
          )}
        </div>
      );

    default:
      return (
        <p className="text-[10px] text-gray-400">
          No configuration for this step type.
        </p>
      );
  }
}
