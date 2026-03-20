import re
from datetime import datetime, date
from models.schemas import Field, FieldResult, Rule, RuleResult, StepTrace
from services.pdf_service import (
    extract_text_from_region,
    extract_text_from_shifted_region,
    search_anchor_slide,
    search_anchor_fullpage,
    search_value_near_anchor,
    matches_format,
)
from services.chain_engine import execute_field_chain


def normalize_text(text: str) -> str:
    """Normalize text for comparison: lowercase, strip whitespace and punctuation."""
    return text.lower().strip().rstrip(":").strip()


def anchor_matches(expected: str, actual: str) -> bool:
    """Check if the actual anchor text matches the expected anchor."""
    norm_expected = normalize_text(expected)
    norm_actual = normalize_text(actual)
    if not norm_expected or not norm_actual:
        return False
    return norm_expected in norm_actual or norm_actual in norm_expected


def parse_currency(value: str) -> float | None:
    """Try to parse a currency string like '$1,234.56' into a float."""
    cleaned = value.replace(",", "").replace(" ", "")
    for symbol in ["$", "€", "£", "¥", "₹"]:
        cleaned = cleaned.replace(symbol, "")
    cleaned = cleaned.strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_date(value: str) -> date | None:
    """Try to parse a date string in various common formats."""
    formats = [
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m-%d-%Y",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%d %B %Y",
        "%d %b %Y",
        "%B %d %Y",
        "%b %d %Y",
    ]
    cleaned = value.strip().rstrip(".")
    for fmt in formats:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


OPERATOR_LABELS = {
    "less_than": "<",
    "greater_than": ">",
    "equals": "==",
    "not_equals": "!=",
    "less_or_equal": "<=",
    "greater_or_equal": ">=",
}


def compare_values(a: float, b: float, operator: str) -> bool:
    """Compare two numeric values with the given operator."""
    if operator == "less_than":
        return a < b
    if operator == "greater_than":
        return a > b
    if operator == "equals":
        return a == b
    if operator == "not_equals":
        return a != b
    if operator == "less_or_equal":
        return a <= b
    if operator == "greater_or_equal":
        return a >= b
    return False


def validate_rule(rule: Rule, value: str, all_values: dict[str, str] | None = None) -> RuleResult:
    """Validate a single rule against an extracted value.

    all_values is a dict of field_label -> extracted_value, used for compare_field rules.
    """

    if rule.type == "not_empty":
        passed = bool(value.strip())
        return RuleResult(
            rule_type="not_empty",
            passed=passed,
            message="Value is present" if passed else "Value is empty",
        )

    if rule.type == "exact_match":
        if rule.expected_value is None:
            return RuleResult(rule_type="exact_match", passed=False, message="No expected value configured")
        passed = value.strip() == rule.expected_value.strip()
        return RuleResult(
            rule_type="exact_match",
            passed=passed,
            message="Matches expected value" if passed else f"Expected '{rule.expected_value}', got '{value.strip()}'",
        )

    if rule.type == "data_type":
        if not rule.data_type:
            return RuleResult(rule_type="data_type", passed=False, message="No data type configured")

        stripped = value.strip()
        if rule.data_type == "string":
            passed = bool(stripped)
            msg = "Is a string" if passed else "Empty string"
        elif rule.data_type == "number":
            try:
                float(stripped.replace(",", ""))
                passed = True
                msg = "Is a valid number"
            except ValueError:
                passed = False
                msg = f"'{stripped}' is not a valid number"
        elif rule.data_type == "integer":
            try:
                cleaned = stripped.replace(",", "")
                float_val = float(cleaned)
                passed = float_val == int(float_val)
                msg = "Is a valid integer" if passed else f"'{stripped}' is not an integer"
            except ValueError:
                passed = False
                msg = f"'{stripped}' is not a valid integer"
        elif rule.data_type == "date":
            date_patterns = [
                r"\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}",
                r"\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}",
                r"[A-Za-z]+ \d{1,2},? \d{4}",
                r"\d{1,2} [A-Za-z]+ \d{4}",
            ]
            passed = any(re.search(p, stripped) for p in date_patterns)
            msg = "Is a valid date" if passed else f"'{stripped}' doesn't look like a date"
        elif rule.data_type == "currency":
            parsed = parse_currency(stripped)
            passed = parsed is not None
            msg = "Is a valid currency amount" if passed else f"'{stripped}' is not a valid currency amount"
        else:
            passed = False
            msg = f"Unknown data type: {rule.data_type}"

        return RuleResult(rule_type="data_type", passed=passed, message=msg)

    if rule.type == "range":
        parsed = parse_currency(value.strip())
        if parsed is None:
            return RuleResult(
                rule_type="range",
                passed=False,
                message=f"'{value.strip()}' is not a number, cannot check range",
            )

        checks = []
        passed = True
        if rule.min_value is not None and parsed < rule.min_value:
            passed = False
            checks.append(f"below minimum {rule.min_value}")
        if rule.max_value is not None and parsed > rule.max_value:
            passed = False
            checks.append(f"above maximum {rule.max_value}")

        if passed:
            msg = f"Value {parsed} is within range"
            if rule.min_value is not None:
                msg += f" (min: {rule.min_value})"
            if rule.max_value is not None:
                msg += f" (max: {rule.max_value})"
        else:
            msg = f"Value {parsed} is {', '.join(checks)}"

        return RuleResult(rule_type="range", passed=passed, message=msg)

    if rule.type == "one_of":
        if not rule.allowed_values:
            return RuleResult(rule_type="one_of", passed=False, message="No allowed values configured")
        stripped = value.strip()
        passed = stripped.lower() in [v.lower() for v in rule.allowed_values]
        if passed:
            msg = f"'{stripped}' is in allowed values"
        else:
            msg = f"'{stripped}' not in allowed values: {rule.allowed_values}"
        return RuleResult(rule_type="one_of", passed=passed, message=msg)

    if rule.type == "pattern":
        if not rule.regex:
            return RuleResult(rule_type="pattern", passed=False, message="No regex pattern configured")
        try:
            passed = bool(re.search(rule.regex, value.strip()))
        except re.error as e:
            return RuleResult(rule_type="pattern", passed=False, message=f"Invalid regex: {e}")
        return RuleResult(
            rule_type="pattern",
            passed=passed,
            message="Matches pattern" if passed else f"'{value.strip()}' doesn't match pattern '{rule.regex}'",
        )

    if rule.type in ("date_before", "date_after"):
        if not rule.date_threshold:
            return RuleResult(rule_type=rule.type, passed=False, message="No threshold date configured")

        parsed_value = parse_date(value.strip())
        if parsed_value is None:
            return RuleResult(
                rule_type=rule.type,
                passed=False,
                message=f"Cannot parse '{value.strip()}' as a date",
            )

        try:
            threshold = datetime.strptime(rule.date_threshold, "%Y-%m-%d").date()
        except ValueError:
            return RuleResult(
                rule_type=rule.type,
                passed=False,
                message=f"Invalid threshold date format: '{rule.date_threshold}' (use YYYY-MM-DD)",
            )

        if rule.type == "date_before":
            passed = parsed_value < threshold
            msg = f"Date {parsed_value} is {'before' if passed else 'not before'} {threshold}"
        else:
            passed = parsed_value > threshold
            msg = f"Date {parsed_value} is {'after' if passed else 'not after'} {threshold}"

        return RuleResult(rule_type=rule.type, passed=passed, message=msg)

    if rule.type == "compare_field":
        if not rule.compare_field_label or not rule.compare_operator:
            return RuleResult(rule_type="compare_field", passed=False, message="No comparison field or operator configured")

        if all_values is None:
            return RuleResult(rule_type="compare_field", passed=False, message="Cross-field comparison not available")

        other_label = rule.compare_field_label
        if other_label not in all_values:
            return RuleResult(
                rule_type="compare_field",
                passed=False,
                message=f"Field '{other_label}' not found",
            )

        other_raw = all_values[other_label]
        this_num = parse_currency(value.strip())
        other_num = parse_currency(other_raw.strip())

        if this_num is None:
            return RuleResult(
                rule_type="compare_field",
                passed=False,
                message=f"Cannot parse '{value.strip()}' as a number for comparison",
            )
        if other_num is None:
            return RuleResult(
                rule_type="compare_field",
                passed=False,
                message=f"Cannot parse '{other_raw.strip()}' (from '{other_label}') as a number",
            )

        op_label = OPERATOR_LABELS.get(rule.compare_operator, rule.compare_operator)
        passed = compare_values(this_num, other_num, rule.compare_operator)
        if passed:
            msg = f"{this_num} {op_label} {other_num} ({other_label})"
        else:
            msg = f"{this_num} is not {op_label} {other_num} ({other_label})"

        return RuleResult(rule_type="compare_field", passed=passed, message=msg)

    return RuleResult(rule_type=rule.type, passed=False, message=f"Unknown rule type: {rule.type}")


def validate_rules(rules: list[Rule], value: str, all_values: dict[str, str] | None = None) -> list[RuleResult]:
    """Validate all rules for a field."""
    return [validate_rule(rule, value, all_values) for rule in rules]


def resolve_dynamic_field(pdf_path: str, field: Field) -> dict:
    """Resolve a dynamic field using the anchor fallback chain.

    Returns dict with: value, status, expected_anchor, actual_anchor, anchor_shift, anchor_dx, anchor_dy
    """
    expected_anchor = field.expected_anchor_text

    if not field.anchor_region or not expected_anchor:
        value = extract_text_from_region(pdf_path, field.value_region)
        return {
            "value": value,
            "status": "ok" if value else "empty",
            "expected_anchor": expected_anchor,
            "actual_anchor": None,
            "anchor_shift": None,
            "anchor_dx": None,
            "anchor_dy": None,
        }

    # Step 1: Try exact position
    actual_anchor = extract_text_from_region(pdf_path, field.anchor_region)
    if actual_anchor and anchor_matches(expected_anchor, actual_anchor):
        value = extract_text_from_region(pdf_path, field.value_region)
        return {
            "value": value,
            "status": "ok" if value else "empty",
            "expected_anchor": expected_anchor,
            "actual_anchor": actual_anchor,
            "anchor_shift": None,
            "anchor_dx": None,
            "anchor_dy": None,
        }

    # Step 2: Slide search (vertical +/-30%)
    slide_result = search_anchor_slide(pdf_path, field.anchor_region, expected_anchor)
    if slide_result:
        dy = slide_result["dy"]
        dx = 0.0
        value = extract_text_from_shifted_region(pdf_path, field.value_region, dx, dy)
        shift_desc = f"Anchor shifted vertically by {dy:+.1%}"
        return {
            "value": value,
            "status": "anchor_shifted",
            "expected_anchor": expected_anchor,
            "actual_anchor": slide_result["actual_text"],
            "anchor_shift": shift_desc,
            "anchor_dx": dx,
            "anchor_dy": dy,
        }

    # Step 3: Full-page search
    fullpage_result = search_anchor_fullpage(
        pdf_path, field.anchor_region.page, expected_anchor, field.anchor_region
    )
    if fullpage_result:
        dx = fullpage_result["dx"]
        dy = fullpage_result["dy"]

        # First try offset-based extraction
        value = extract_text_from_shifted_region(pdf_path, field.value_region, dx, dy)

        # If empty or doesn't match expected format, try adjacent scan
        value_found_x = None
        value_found_y = None
        value_found_width = None
        if not value or (field.value_format and not matches_format(value, field.value_format)):
            adjacent_result = search_value_near_anchor(
                pdf_path,
                page_num=field.anchor_region.page,
                anchor_x=fullpage_result["found_x"],
                anchor_y=fullpage_result["found_y"],
                anchor_width=field.anchor_region.width,
                value_format=field.value_format,
            )
            if adjacent_result:
                value = adjacent_result["text"]
                value_found_x = adjacent_result["x"]
                value_found_y = adjacent_result["y"]
                value_found_width = adjacent_result["width"]
                shift_desc = f"Anchor relocated, value found adjacent (dx: {dx:+.1%}, dy: {dy:+.1%})"
            else:
                shift_desc = f"Anchor relocated (dx: {dx:+.1%}, dy: {dy:+.1%})"
        else:
            shift_desc = f"Anchor relocated (dx: {dx:+.1%}, dy: {dy:+.1%})"

        return {
            "value": value,
            "status": "anchor_relocated",
            "expected_anchor": expected_anchor,
            "actual_anchor": fullpage_result["actual_text"],
            "anchor_shift": shift_desc,
            "anchor_dx": dx,
            "anchor_dy": dy,
            "value_found_x": value_found_x,
            "value_found_y": value_found_y,
            "value_found_width": value_found_width,
        }

    # Step 4: Not found anywhere
    value = extract_text_from_region(pdf_path, field.value_region)
    return {
        "value": value,
        "status": "anchor_not_found",
        "expected_anchor": expected_anchor,
        "actual_anchor": actual_anchor or "",
        "anchor_shift": None,
        "anchor_dx": None,
        "anchor_dy": None,
    }


def extract_all_fields(pdf_path: str, fields: list[Field]) -> list[FieldResult]:
    """Extract all fields from a PDF using two-pass approach.

    Pass 1: Extract raw values and check anchors for all fields.
            If field has a chain, use chain engine; otherwise use legacy logic.
    Pass 2: Validate rules (which may reference other fields' values).
    """
    # --- Pass 1: Extract values and check anchors ---
    extracted: list[dict] = []
    all_values: dict[str, str] = {}

    for field in fields:
        if field.chain:
            # Use chain engine (pass 1 - no cross-field values yet)
            resolved = execute_field_chain(pdf_path, field)
            all_values[field.label] = resolved["value"]
            extracted.append({
                "field": field,
                "value": resolved["value"],
                "base_status": resolved["status"],
                "expected_anchor": resolved["expected_anchor"],
                "actual_anchor": resolved["actual_anchor"],
                "anchor_shift": resolved["anchor_shift"],
                "anchor_dx": resolved["anchor_dx"],
                "anchor_dy": resolved["anchor_dy"],
                "value_found_x": resolved.get("value_found_x"),
                "value_found_y": resolved.get("value_found_y"),
                "value_found_width": resolved.get("value_found_width"),
                "step_traces": resolved.get("step_traces", []),
                "uses_chain": True,
            })
        elif field.type == "static":
            value = extract_text_from_region(pdf_path, field.value_region)
            all_values[field.label] = value
            extracted.append({
                "field": field,
                "value": value,
                "base_status": "ok" if value else "empty",
                "expected_anchor": None,
                "actual_anchor": None,
                "anchor_shift": None,
                "anchor_dx": None,
                "anchor_dy": None,
                "value_found_x": None,
                "value_found_y": None,
                "value_found_width": None,
                "step_traces": [],
                "uses_chain": False,
            })
        else:
            resolved = resolve_dynamic_field(pdf_path, field)
            all_values[field.label] = resolved["value"]
            extracted.append({
                "field": field,
                "value": resolved["value"],
                "base_status": resolved["status"],
                "expected_anchor": resolved["expected_anchor"],
                "actual_anchor": resolved["actual_anchor"],
                "anchor_shift": resolved["anchor_shift"],
                "anchor_dx": resolved["anchor_dx"],
                "anchor_dy": resolved["anchor_dy"],
                "value_found_x": resolved.get("value_found_x"),
                "value_found_y": resolved.get("value_found_y"),
                "value_found_width": resolved.get("value_found_width"),
                "step_traces": [],
                "uses_chain": False,
            })

    # --- Pass 2: Validate rules / cross-field chain validation ---
    results: list[FieldResult] = []
    for entry in extracted:
        field: Field = entry["field"]
        value: str = entry["value"]
        base_status: str = entry["base_status"]
        step_traces: list[StepTrace] = entry["step_traces"]

        rule_results: list[RuleResult] = []

        if entry["uses_chain"]:
            # Re-run cross-field validate steps with all_values now available
            has_compare = any(
                s.category == "validate" and s.type == "compare_field"
                for s in field.chain
            )
            if has_compare:
                # Re-execute the full chain with all_values
                resolved = execute_field_chain(pdf_path, field, all_values)
                value = resolved["value"]
                base_status = resolved["status"]
                step_traces = resolved.get("step_traces", [])
        else:
            # Legacy rules validation
            if field.rules and base_status in ("ok", "anchor_shifted", "anchor_relocated"):
                rule_results = validate_rules(field.rules, value, all_values)
                if any(not r.passed for r in rule_results):
                    base_status = "rule_failed"

        results.append(FieldResult(
            label=field.label,
            field_type=field.type,
            value=value,
            status=base_status,
            expected_anchor=entry["expected_anchor"],
            actual_anchor=entry["actual_anchor"],
            anchor_shift=entry["anchor_shift"],
            anchor_dx=entry["anchor_dx"],
            anchor_dy=entry["anchor_dy"],
            value_found_x=entry["value_found_x"],
            value_found_y=entry["value_found_y"],
            value_found_width=entry["value_found_width"],
            rule_results=rule_results,
            step_traces=step_traces,
        ))

    return results
