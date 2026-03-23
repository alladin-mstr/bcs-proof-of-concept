export interface Region {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CompareOperator = "less_than" | "greater_than" | "equals" | "not_equals" | "less_or_equal" | "greater_or_equal";

export interface Rule {
  type: "exact_match" | "data_type" | "range" | "one_of" | "pattern" | "not_empty" | "date_before" | "date_after" | "compare_field";
  expected_value?: string;
  data_type?: "string" | "number" | "integer" | "date" | "currency";
  min_value?: number;
  max_value?: number;
  allowed_values?: string[];
  regex?: string;
  date_threshold?: string;
  compare_field_label?: string;
  compare_operator?: CompareOperator;
}

// --- Chain step types ---

export type ChainStepCategory = "search" | "value" | "validate";

export type SearchStepType = "exact_position" | "vertical_slide" | "full_page_search" | "region_search" | "block_search" | "bracket_search" | "area_search";
export type ValueStepType = "offset_value" | "adjacent_scan" | "block_value" | "intersection_value" | "area_text_value";
export type ValidateStepType = "not_empty" | "exact_match" | "data_type" | "range" | "one_of" | "pattern" | "date_before" | "date_after" | "compare_field";

export interface ChainStep {
  id: string;
  category: ChainStepCategory;
  type: string;
  // Search config
  slide_tolerance?: number;
  search_region?: Region;
  // Block search/value config
  block_extract_mode?: "same_block" | "rest_of_block" | "next_block";
  // Value config
  search_direction?: string;
  // Validate config
  expected_value?: string;
  data_type?: "string" | "number" | "integer" | "date" | "currency";
  min_value?: number;
  max_value?: number;
  allowed_values?: string[];
  regex?: string;
  date_threshold?: string;
  compare_field_label?: string;
  compare_operator?: CompareOperator;
}

export interface StepTrace {
  step_id: string;
  step_type: string;
  category: string;
  resolved: boolean;
  detail: string;
  region?: Region;
}

export type AnchorRole = "primary" | "secondary" | "area_top" | "area_bottom";
export type AnchorMode = "static" | "single" | "bracket" | "area_value" | "area_locator" | "area_bracket";

export interface Anchor {
  id: string;
  role: AnchorRole;
  region: Region;
  expected_text: string;
}

export interface Field {
  id: string;
  label: string;
  type: "static" | "dynamic";
  anchor_mode: AnchorMode;
  anchors: Anchor[];
  value_region: Region;
  anchor_region?: Region;           // Legacy: single anchor
  expected_anchor_text?: string;    // Legacy: single anchor text
  rules: Rule[];
  value_format?: "currency" | "number" | "integer" | "date" | "string";
  chain: ChainStep[];
  source?: "a" | "b";
}

export interface Template {
  id: string;
  name: string;
  fields: Field[];
  created_at: string;
  mode?: "single" | "comparison";
}

export interface RuleResult {
  rule_type: string;
  passed: boolean;
  message: string;
}

export interface FieldResult {
  label: string;
  field_type: "static" | "dynamic";
  value: string;
  status: "ok" | "anchor_mismatch" | "anchor_not_found" | "anchor_shifted" | "anchor_relocated" | "empty" | "rule_failed";
  source?: "a" | "b";
  expected_anchor?: string;
  actual_anchor?: string;
  anchor_shift?: string;
  anchor_dx?: number;
  anchor_dy?: number;
  value_found_x?: number;
  value_found_y?: number;
  value_found_width?: number;
  // Found anchor positions: role → {x, y, text, width, height} (normalized)
  anchors_found?: Record<string, { x: number; y: number; text: string; width: number; height: number }>;
  rule_results: RuleResult[];
  step_traces: StepTrace[];
}

export interface ExtractionResponse {
  pdf_id: string;
  template_id: string;
  results: FieldResult[];
  needs_review: boolean;
  pdf_id_b?: string;
}

// Layout analysis types
export interface LayoutLine {
  text: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface LayoutBlock {
  id: string;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  lines: LayoutLine[];
}
