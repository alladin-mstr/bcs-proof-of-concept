"""Chain execution engine.

Interprets a list[ChainStep] as an ordered pipeline:
- "search" steps: if-else (first success wins, rest skipped)
- "value" steps: if-else (first success wins, rest skipped)
- "validate" steps: AND (all run, all must pass)
"""

from dataclasses import dataclass, field as dataclass_field
from models.schemas import ChainStep, StepTrace, Field, Region, Rule
from services.pdf_service import (
    extract_text_from_region,
    extract_text_from_shifted_region,
    search_anchor_slide,
    search_anchor_fullpage,
    search_value_near_anchor,
    matches_format,
)


def _normalize_text(text: str) -> str:
    return text.lower().strip().rstrip(":").strip()


def _anchor_matches(expected: str, actual: str) -> bool:
    norm_expected = _normalize_text(expected)
    norm_actual = _normalize_text(actual)
    if not norm_expected or not norm_actual:
        return False
    return norm_expected in norm_actual or norm_actual in norm_expected


def _validate_rule(rule: Rule, value: str, all_values: dict[str, str] | None = None):
    """Lazy import to avoid circular dependency."""
    from services.extraction_service import validate_rule
    return validate_rule(rule, value, all_values)


@dataclass
class ChainContext:
    """Mutable state passed through chain execution."""
    pdf_path: str
    field: Field
    # Anchor state
    anchor_found: bool = False
    anchor_text: str | None = None
    anchor_dx: float = 0.0
    anchor_dy: float = 0.0
    anchor_status: str = "anchor_not_found"
    anchor_shift_desc: str | None = None
    # For fullpage: where anchor was found
    found_anchor_x: float | None = None
    found_anchor_y: float | None = None
    # Value state
    value: str = ""
    value_found: bool = False
    value_found_x: float | None = None
    value_found_y: float | None = None
    value_found_width: float | None = None
    # Validation
    validation_passed: bool = True
    # Traces
    step_traces: list[StepTrace] = dataclass_field(default_factory=list)


def execute_chain(chain: list[ChainStep], ctx: ChainContext) -> ChainContext:
    """Execute a chain of steps against the context."""
    search_resolved = False
    value_resolved = False

    for step in chain:
        if step.category == "search":
            if search_resolved:
                ctx.step_traces.append(StepTrace(
                    step_id=step.id, step_type=step.type, category="search",
                    resolved=False, detail="Skipped (anchor already found)",
                ))
                continue
            resolved = _execute_search_step(step, ctx)
            if resolved:
                search_resolved = True

        elif step.category == "value":
            if value_resolved:
                ctx.step_traces.append(StepTrace(
                    step_id=step.id, step_type=step.type, category="value",
                    resolved=False, detail="Skipped (value already found)",
                ))
                continue
            resolved = _execute_value_step(step, ctx)
            if resolved:
                value_resolved = True

        elif step.category == "validate":
            _execute_validate_step(step, ctx)

    # If no search steps resolved but we have an anchor region, extract value at original position
    if not search_resolved and not value_resolved and ctx.field.anchor_region:
        ctx.value = extract_text_from_region(ctx.pdf_path, ctx.field.value_region)
        ctx.anchor_status = "anchor_not_found"
        actual = extract_text_from_region(ctx.pdf_path, ctx.field.anchor_region)
        ctx.anchor_text = actual or ""

    # If no value steps resolved but search did resolve, extract with offset
    if search_resolved and not value_resolved:
        ctx.value = extract_text_from_shifted_region(
            ctx.pdf_path, ctx.field.value_region, ctx.anchor_dx, ctx.anchor_dy
        )
        ctx.value_found = bool(ctx.value)

    return ctx


def _execute_search_step(step: ChainStep, ctx: ChainContext) -> bool:
    """Execute one search step. Returns True if anchor was found."""
    f = ctx.field
    if not f.anchor_region or not f.expected_anchor_text:
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="search",
            resolved=False, detail="No anchor region or text configured",
        ))
        return False

    if step.type == "exact_position":
        actual = extract_text_from_region(ctx.pdf_path, f.anchor_region)
        if actual and _anchor_matches(f.expected_anchor_text, actual):
            ctx.anchor_found = True
            ctx.anchor_text = actual
            ctx.anchor_dx = 0.0
            ctx.anchor_dy = 0.0
            ctx.anchor_status = "ok"
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=True, detail=f"Anchor found at exact position: \"{actual}\"",
                region=f.anchor_region,
            ))
            return True
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="search",
            resolved=False, detail=f"Anchor not at expected position (got: \"{actual or ''}\")",
            region=f.anchor_region,
        ))
        return False

    if step.type == "vertical_slide":
        tolerance = step.slide_tolerance if step.slide_tolerance is not None else 0.3
        result = search_anchor_slide(ctx.pdf_path, f.anchor_region, f.expected_anchor_text, tolerance)
        if result:
            ctx.anchor_found = True
            ctx.anchor_text = result["actual_text"]
            ctx.anchor_dx = 0.0
            ctx.anchor_dy = result["dy"]
            ctx.anchor_status = "anchor_shifted"
            ctx.anchor_shift_desc = f"Anchor shifted vertically by {result['dy']:+.1%}"
            # Build search region for visualization
            search_region = Region(
                page=f.anchor_region.page,
                x=f.anchor_region.x,
                y=max(0.0, f.anchor_region.y - tolerance),
                width=f.anchor_region.width,
                height=min(1.0, f.anchor_region.height + 2 * tolerance),
            )
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=True, detail=f"Anchor found via vertical slide (dy: {result['dy']:+.1%})",
                region=search_region,
            ))
            return True
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="search",
            resolved=False, detail=f"Anchor not found in vertical slide (±{tolerance:.0%})",
        ))
        return False

    if step.type == "full_page_search":
        result = search_anchor_fullpage(
            ctx.pdf_path, f.anchor_region.page, f.expected_anchor_text, f.anchor_region
        )
        if result:
            ctx.anchor_found = True
            ctx.anchor_text = result["actual_text"]
            ctx.anchor_dx = result["dx"]
            ctx.anchor_dy = result["dy"]
            ctx.found_anchor_x = result["found_x"]
            ctx.found_anchor_y = result["found_y"]
            ctx.anchor_status = "anchor_relocated"
            ctx.anchor_shift_desc = f"Anchor relocated (dx: {result['dx']:+.1%}, dy: {result['dy']:+.1%})"
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=True, detail=f"Anchor found via full page search at ({result['found_x']:.2f}, {result['found_y']:.2f})",
            ))
            return True
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="search",
            resolved=False, detail="Anchor not found on page",
        ))
        return False

    if step.type == "region_search":
        # Search within a user-defined region
        if not step.search_region:
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=False, detail="No search region configured",
            ))
            return False
        # Use the search region as an expanded anchor region for slide search
        temp_region = Region(
            page=step.search_region.page,
            x=step.search_region.x,
            y=step.search_region.y,
            width=step.search_region.width,
            height=step.search_region.height,
        )
        result = search_anchor_slide(ctx.pdf_path, temp_region, f.expected_anchor_text, 0.0)
        if result:
            ctx.anchor_found = True
            ctx.anchor_text = result["actual_text"]
            ctx.anchor_dx = temp_region.x - f.anchor_region.x
            ctx.anchor_dy = result["dy"] + (temp_region.y - f.anchor_region.y)
            ctx.anchor_status = "anchor_relocated"
            ctx.anchor_shift_desc = f"Anchor found in custom region"
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=True, detail=f"Anchor found in custom region: \"{result['actual_text']}\"",
                region=step.search_region,
            ))
            return True
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="search",
            resolved=False, detail="Anchor not found in custom region",
            region=step.search_region,
        ))
        return False

    ctx.step_traces.append(StepTrace(
        step_id=step.id, step_type=step.type, category="search",
        resolved=False, detail=f"Unknown search step type: {step.type}",
    ))
    return False


def _execute_value_step(step: ChainStep, ctx: ChainContext) -> bool:
    """Execute one value landing step. Returns True if value was found."""
    f = ctx.field

    if step.type == "offset_value":
        value = extract_text_from_shifted_region(
            ctx.pdf_path, f.value_region, ctx.anchor_dx, ctx.anchor_dy
        )
        if value:
            ctx.value = value
            ctx.value_found = True
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=True, detail=f"Value found at offset: \"{value}\"",
            ))
            return True
        # Check format mismatch
        if f.value_format and value and not matches_format(value, f.value_format):
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=False, detail=f"Value at offset doesn't match format {f.value_format}",
            ))
            return False
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="value",
            resolved=False, detail="No value at offset position",
        ))
        return False

    if step.type == "adjacent_scan":
        if not ctx.anchor_found:
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=False, detail="Cannot scan adjacent - no anchor found",
            ))
            return False
        direction = step.search_direction or "right"
        anchor_x = ctx.found_anchor_x if ctx.found_anchor_x is not None else (
            f.anchor_region.x + ctx.anchor_dx if f.anchor_region else 0
        )
        anchor_y = ctx.found_anchor_y if ctx.found_anchor_y is not None else (
            f.anchor_region.y + ctx.anchor_dy if f.anchor_region else 0
        )
        anchor_width = f.anchor_region.width if f.anchor_region else 0.1
        result = search_value_near_anchor(
            ctx.pdf_path,
            page_num=f.anchor_region.page if f.anchor_region else 1,
            anchor_x=anchor_x,
            anchor_y=anchor_y,
            anchor_width=anchor_width,
            value_format=f.value_format,
            search_direction=direction,
        )
        if result:
            ctx.value = result["text"]
            ctx.value_found = True
            ctx.value_found_x = result["x"]
            ctx.value_found_y = result["y"]
            ctx.value_found_width = result["width"]
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=True, detail=f"Value found {direction} of anchor: \"{result['text']}\"",
            ))
            return True
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="value",
            resolved=False, detail=f"No matching value found {direction} of anchor",
        ))
        return False

    ctx.step_traces.append(StepTrace(
        step_id=step.id, step_type=step.type, category="value",
        resolved=False, detail=f"Unknown value step type: {step.type}",
    ))
    return False


def _execute_validate_step(step: ChainStep, ctx: ChainContext) -> None:
    """Execute one validation step. Updates ctx.validation_passed."""
    # Map chain step to a Rule for reuse of existing validation logic
    rule_type_map = {
        "not_empty": "not_empty",
        "exact_match": "exact_match",
        "data_type": "data_type",
        "range": "range",
        "one_of": "one_of",
        "pattern": "pattern",
        "date_before": "date_before",
        "date_after": "date_after",
        "compare_field": "compare_field",
    }

    rule_type = rule_type_map.get(step.type)
    if not rule_type:
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="validate",
            resolved=False, detail=f"Unknown validate step type: {step.type}",
        ))
        ctx.validation_passed = False
        return

    rule = Rule(
        type=rule_type,
        expected_value=step.expected_value,
        data_type=step.data_type,
        min_value=step.min_value,
        max_value=step.max_value,
        allowed_values=step.allowed_values,
        regex=step.regex,
        date_threshold=step.date_threshold,
        compare_field_label=step.compare_field_label,
        compare_operator=step.compare_operator,
    )

    # Note: all_values will be injected by the caller for cross-field validation
    result = _validate_rule(rule, ctx.value)
    passed = result.passed

    ctx.step_traces.append(StepTrace(
        step_id=step.id, step_type=step.type, category="validate",
        resolved=passed, detail=result.message,
    ))

    if not passed:
        ctx.validation_passed = False


def execute_field_chain(pdf_path: str, field: Field, all_values: dict[str, str] | None = None) -> dict:
    """Execute a field's chain and return extraction result dict.

    Compatible with the return format of resolve_dynamic_field.
    """
    ctx = ChainContext(pdf_path=pdf_path, field=field)

    # Separate steps by category
    search_steps = [s for s in field.chain if s.category == "search"]
    value_steps = [s for s in field.chain if s.category == "value"]
    validate_steps = [s for s in field.chain if s.category == "validate"]

    # For static fields, just extract the value and run validation
    if field.type == "static":
        ctx.value = extract_text_from_region(pdf_path, field.value_region)
        # Run validation steps
        for step in validate_steps:
            # Inject all_values for cross-field comparison
            if step.type == "compare_field" and all_values:
                rule = Rule(
                    type="compare_field",
                    compare_field_label=step.compare_field_label,
                    compare_operator=step.compare_operator,
                )
                result = _validate_rule(rule, ctx.value, all_values)
                ctx.step_traces.append(StepTrace(
                    step_id=step.id, step_type=step.type, category="validate",
                    resolved=result.passed, detail=result.message,
                ))
                if not result.passed:
                    ctx.validation_passed = False
            else:
                _execute_validate_step(step, ctx)

        status = "ok" if ctx.value else "empty"
        if not ctx.validation_passed:
            status = "rule_failed"

        return {
            "value": ctx.value,
            "status": status,
            "expected_anchor": None,
            "actual_anchor": None,
            "anchor_shift": None,
            "anchor_dx": None,
            "anchor_dy": None,
            "value_found_x": None,
            "value_found_y": None,
            "value_found_width": None,
            "step_traces": ctx.step_traces,
        }

    # Dynamic fields: run search → value → validate chain
    ordered_chain = search_steps + value_steps
    execute_chain(ordered_chain, ctx)

    # Run validation steps with all_values context
    for step in validate_steps:
        if step.type == "compare_field" and all_values:
            rule = Rule(
                type="compare_field",
                compare_field_label=step.compare_field_label,
                compare_operator=step.compare_operator,
            )
            result = _validate_rule(rule, ctx.value, all_values)
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="validate",
                resolved=result.passed, detail=result.message,
            ))
            if not result.passed:
                ctx.validation_passed = False
        else:
            _execute_validate_step(step, ctx)

    # Determine final status
    status = ctx.anchor_status
    if not ctx.value:
        status = "empty" if not ctx.anchor_found else status
    if not ctx.validation_passed and status in ("ok", "anchor_shifted", "anchor_relocated"):
        status = "rule_failed"

    return {
        "value": ctx.value,
        "status": status,
        "expected_anchor": field.expected_anchor_text,
        "actual_anchor": ctx.anchor_text,
        "anchor_shift": ctx.anchor_shift_desc,
        "anchor_dx": ctx.anchor_dx if ctx.anchor_found else None,
        "anchor_dy": ctx.anchor_dy if ctx.anchor_found else None,
        "value_found_x": ctx.value_found_x,
        "value_found_y": ctx.value_found_y,
        "value_found_width": ctx.value_found_width,
        "step_traces": ctx.step_traces,
    }
