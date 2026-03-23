from pydantic import BaseModel
from datetime import datetime
from typing import Literal


class Region(BaseModel):
    """A rectangular region on a PDF page, in normalized 0-1 coordinates."""
    page: int       # 1-indexed page number
    x: float
    y: float
    width: float
    height: float


class Rule(BaseModel):
    """A validation rule for a field's extracted value."""
    type: Literal["exact_match", "data_type", "range", "one_of", "pattern", "not_empty", "date_before", "date_after", "compare_field"]
    # exact_match: value must equal this exactly
    expected_value: str | None = None
    # data_type: value must parse as this type
    data_type: Literal["string", "number", "integer", "date", "currency"] | None = None
    # range: numeric value must be within bounds
    min_value: float | None = None
    max_value: float | None = None
    # one_of: value must be one of these
    allowed_values: list[str] | None = None
    # pattern: value must match this regex
    regex: str | None = None
    # date_before / date_after: date must be before/after this date (ISO format YYYY-MM-DD)
    date_threshold: str | None = None
    # compare_field: compare this field's value against another field
    compare_field_label: str | None = None
    compare_operator: Literal["less_than", "greater_than", "equals", "not_equals", "less_or_equal", "greater_or_equal"] | None = None


class RuleResult(BaseModel):
    """Result of validating a single rule."""
    rule_type: str
    passed: bool
    message: str


# --- Chain step system ---

class LayoutLine(BaseModel):
    """A single line within a layout block."""
    text: str


class LayoutBlock(BaseModel):
    """A text block detected by pdfminer's layout analysis."""
    id: str
    text: str
    bbox: dict  # { x, y, width, height } normalized 0-1
    lines: list[LayoutLine] = []


class ChainStep(BaseModel):
    """One step in a configurable chain pipeline."""
    id: str
    category: Literal["search", "value", "validate"]
    type: str  # Step type within category
    # Search step config
    slide_tolerance: float | None = None        # vertical_slide: default 0.3
    search_region: Region | None = None         # region_search: custom search area
    # Block search/value config
    block_extract_mode: Literal["same_block", "rest_of_block", "next_block"] | None = None
    # Value step config
    search_direction: str | None = None         # adjacent_scan: "right" or "below"
    # Validate step config (mirrors Rule fields)
    expected_value: str | None = None
    data_type: Literal["string", "number", "integer", "date", "currency"] | None = None
    min_value: float | None = None
    max_value: float | None = None
    allowed_values: list[str] | None = None
    regex: str | None = None
    date_threshold: str | None = None
    compare_field_label: str | None = None
    compare_operator: Literal["less_than", "greater_than", "equals", "not_equals", "less_or_equal", "greater_or_equal"] | None = None


class StepTrace(BaseModel):
    """Trace of a single chain step execution."""
    step_id: str
    step_type: str
    category: str
    resolved: bool
    detail: str
    region: Region | None = None


class Anchor(BaseModel):
    """A named anchor point used to locate a field's value."""
    id: str
    role: Literal["primary", "secondary", "area_top", "area_bottom"]
    region: Region
    expected_text: str


class Field(BaseModel):
    """A labeled extraction field in a template."""
    id: str
    label: str
    type: Literal["static", "dynamic"]
    # Anchor tier: static (no anchors), single (1), bracket (2 intersection),
    # area_value (2 area boundaries = value between), area_locator (2 area + 1 locator),
    # area_bracket (2 area + 2 bracket intersection inside area)
    anchor_mode: Literal["static", "single", "bracket", "area_value", "area_locator", "area_bracket"] = "static"
    # Structured anchors list (new system)
    anchors: list[Anchor] = []
    # Static fields: just a value_region
    # Dynamic fields: anchor_region + value_region + expected_anchor_text
    value_region: Region
    anchor_region: Region | None = None         # Legacy: single anchor region
    expected_anchor_text: str | None = None      # Legacy: single anchor text
    rules: list[Rule] = []
    # Auto-detected format of the value from the template PDF
    # Used to find the right value when anchor is relocated
    value_format: Literal["currency", "number", "integer", "date", "string"] | None = None
    # Configurable chain pipeline (replaces hardcoded logic when non-empty)
    chain: list[ChainStep] = []
    # Comparison mode: which PDF this field belongs to
    source: Literal["a", "b"] = "a"


class DetectFormatRequest(BaseModel):
    pdf_id: str
    region: Region


class TemplateCreate(BaseModel):
    name: str
    fields: list[Field]
    mode: Literal["single", "comparison"] = "single"


class Template(BaseModel):
    id: str
    name: str
    fields: list[Field]
    created_at: datetime
    mode: Literal["single", "comparison"] = "single"


class TestRequest(BaseModel):
    pdf_id: str
    fields: list[Field]
    pdf_id_b: str | None = None


class ExtractionRequest(BaseModel):
    pdf_id: str
    template_id: str
    pdf_id_b: str | None = None


class FieldResult(BaseModel):
    label: str
    field_type: Literal["static", "dynamic"]
    value: str
    status: Literal["ok", "anchor_mismatch", "anchor_not_found", "anchor_shifted", "anchor_relocated", "empty", "rule_failed"]
    source: Literal["a", "b"] = "a"
    # For dynamic fields:
    expected_anchor: str | None = None
    actual_anchor: str | None = None
    anchor_shift: str | None = None  # Human-readable description of how anchor was found
    anchor_dx: float | None = None   # Normalized horizontal shift applied
    anchor_dy: float | None = None   # Normalized vertical shift applied
    # When value was found via adjacent scan (not offset), these are the actual normalized coords
    value_found_x: float | None = None
    value_found_y: float | None = None
    value_found_width: float | None = None
    # Found anchor positions: role → {x, y, text, width, height} (normalized)
    anchors_found: dict[str, dict] = {}
    rule_results: list[RuleResult] = []
    step_traces: list[StepTrace] = []


class ExtractionResponse(BaseModel):
    pdf_id: str
    template_id: str
    results: list[FieldResult]
    needs_review: bool   # True if any field has non-ok status
    pdf_id_b: str | None = None
