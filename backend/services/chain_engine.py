"""Chain execution engine.

Interprets a list[ChainStep] as an ordered pipeline:
- "search" steps: if-else (first success wins, rest skipped)
- "value" steps: if-else (first success wins, rest skipped)

Validation is now handled by the template-level rule engine (rule_engine.py).
"""

from dataclasses import dataclass, field as dataclass_field
from models.schemas import ChainStep, StepTrace, Field, Region, Rule
from services.pdf_service import (
    extract_text_from_region,
    extract_text_from_shifted_region,
    search_anchor_slide,
    search_anchor_fullpage,
    search_anchor_word_position,
    search_anchor_in_region,
    search_value_near_anchor,
    matches_format,
    find_anchor_in_blocks,
    extract_block_text,
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
    # For block search: which block contains the anchor
    found_block_id: str | None = None
    # Multi-anchor state: role → {x, y, text, width, height}
    anchors_found: dict = dataclass_field(default_factory=dict)
    # Area bounding region computed from area_top + area_bottom anchors
    area_bbox: dict | None = None
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
            # Legacy validate steps are now skipped — handled by rule_engine
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="validate",
                resolved=False, detail="Skipped (validation moved to Rules panel)",
            ))

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

    # Bracket and area search use field.anchors, not legacy anchor_region
    if step.type in ("bracket_search", "area_search"):
        pass  # Skip legacy guard — these steps read from f.anchors
    elif not f.anchor_region or not f.expected_anchor_text:
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

    if step.type == "block_search":
        # Search for anchor text within layout blocks (pdfminer text grouping)
        result = find_anchor_in_blocks(
            ctx.pdf_path,
            f.anchor_region.page,
            f.expected_anchor_text,
            original_x=f.anchor_region.x,
            original_y=f.anchor_region.y,
        )
        if result:
            ctx.anchor_found = True
            ctx.anchor_text = result["block_text"]
            ctx.anchor_dx = result["dx"]
            ctx.anchor_dy = result["dy"]
            ctx.found_anchor_x = result["found_x"]
            ctx.found_anchor_y = result["found_y"]
            ctx.found_block_id = result["block_id"]
            ctx.anchor_status = "anchor_shifted" if (abs(result["dx"]) < 0.01 and abs(result["dy"]) < 0.05) else "anchor_relocated"
            candidates = result["candidates_found"]
            ctx.anchor_shift_desc = f"Anchor found in block {result['block_id']}" + (
                f" ({candidates} candidates, picked nearest)" if candidates > 1 else ""
            )
            bbox = result["block_bbox"]
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=True,
                detail=f"Anchor found in block {result['block_id']}: \"{result['block_text'][:50]}\"" + (
                    f" ({candidates} candidates)" if candidates > 1 else ""
                ),
                region=Region(
                    page=f.anchor_region.page,
                    x=bbox["x"], y=bbox["y"],
                    width=bbox["width"], height=bbox["height"],
                ),
            ))
            return True
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="search",
            resolved=False, detail="Anchor not found in any layout block",
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

    if step.type == "bracket_search":
        # Find two anchors (primary=column, secondary=row) and store positions
        anchors = {a.role: a for a in f.anchors} if f.anchors else {}
        primary = anchors.get("primary")
        secondary = anchors.get("secondary")
        if not primary or not secondary:
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=False, detail="Bracket search requires primary and secondary anchors",
            ))
            return False
        page_num = primary.region.page
        # Use word-level positioning for precise column/row intersection
        # Primary = column anchor (prefer same x), Secondary = row anchor (prefer same y)
        r1 = search_anchor_word_position(ctx.pdf_path, page_num, primary.expected_text, primary.region.x, primary.region.y, prefer_axis="x")
        r2 = search_anchor_word_position(ctx.pdf_path, page_num, secondary.expected_text, secondary.region.x, secondary.region.y, prefer_axis="y")
        if not r1 or not r2:
            missing = []
            if not r1:
                missing.append(f"primary (\"{primary.expected_text}\")")
            if not r2:
                missing.append(f"secondary (\"{secondary.expected_text}\")")
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=False, detail=f"Bracket anchor not found: {', '.join(missing)}",
            ))
            return False
        ctx.anchors_found["primary"] = {
            "x": r1["found_x"], "y": r1["found_y"],
            "text": r1["actual_text"],
            "width": r1.get("width", primary.region.width),
            "height": r1.get("height", primary.region.height),
        }
        ctx.anchors_found["secondary"] = {
            "x": r2["found_x"], "y": r2["found_y"],
            "text": r2["actual_text"],
            "width": r2.get("width", secondary.region.width),
            "height": r2.get("height", secondary.region.height),
        }
        ctx.anchor_found = True
        ctx.anchor_text = f"{r1['actual_text']} × {r2['actual_text']}"
        ctx.anchor_dx = 0.0
        ctx.anchor_dy = 0.0
        ctx.anchor_status = "ok"
        ctx.anchor_shift_desc = f"Bracket: \"{r1['actual_text']}\" × \"{r2['actual_text']}\""
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="search",
            resolved=True,
            detail=f"Bracket found: \"{r1['actual_text']}\" at ({r1['found_x']:.2f},{r1['found_y']:.2f}) × \"{r2['actual_text']}\" at ({r2['found_x']:.2f},{r2['found_y']:.2f})",
        ))
        return True

    if step.type == "area_search":
        # Find area_top and area_bottom anchors, compute bounding area,
        # then optionally find primary/secondary inside the area
        anchors = {a.role: a for a in f.anchors} if f.anchors else {}
        area_top = anchors.get("area_top")
        area_bottom = anchors.get("area_bottom")
        if not area_top or not area_bottom:
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=False, detail="Area search requires area_top and area_bottom anchors",
            ))
            return False
        page_num = area_top.region.page
        rt = search_anchor_fullpage(ctx.pdf_path, page_num, area_top.expected_text, area_top.region)
        rb = search_anchor_fullpage(ctx.pdf_path, page_num, area_bottom.expected_text, area_bottom.region)
        if not rt or not rb:
            missing = []
            if not rt:
                missing.append(f"area_top (\"{area_top.expected_text}\")")
            if not rb:
                missing.append(f"area_bottom (\"{area_bottom.expected_text}\")")
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="search",
                resolved=False, detail=f"Area anchor not found: {', '.join(missing)}",
            ))
            return False
        # Store area anchor positions
        ctx.anchors_found["area_top"] = {
            "x": rt["found_x"], "y": rt["found_y"],
            "text": rt["actual_text"],
            "width": area_top.region.width, "height": area_top.region.height,
        }
        ctx.anchors_found["area_bottom"] = {
            "x": rb["found_x"], "y": rb["found_y"],
            "text": rb["actual_text"],
            "width": area_bottom.region.width, "height": area_bottom.region.height,
        }
        # Compute area bounding box (top's bottom edge → bottom's top edge, full width)
        area_y = rt["found_y"] + area_top.region.height
        area_h = rb["found_y"] - area_y
        if area_h <= 0:
            area_h = 0.01
        ctx.area_bbox = {"x": 0.0, "y": area_y, "width": 1.0, "height": area_h}
        area_region = Region(page=page_num, x=0.0, y=area_y, width=1.0, height=area_h)

        # If field has primary/secondary anchors, find them inside the area (word-level)
        primary = anchors.get("primary")
        secondary = anchors.get("secondary")
        if primary:
            rp = search_anchor_word_position(
                ctx.pdf_path, page_num, primary.expected_text,
                primary.region.x, primary.region.y,
                constrain_region=area_region,
                prefer_axis="x",  # Column anchor: prefer same x
            )
            if rp:
                ctx.anchors_found["primary"] = {
                    "x": rp["found_x"], "y": rp["found_y"],
                    "text": rp["actual_text"],
                    "width": rp.get("width", primary.region.width),
                    "height": rp.get("height", primary.region.height),
                }
        if secondary:
            rs = search_anchor_word_position(
                ctx.pdf_path, page_num, secondary.expected_text,
                secondary.region.x, secondary.region.y,
                constrain_region=area_region,
                prefer_axis="y",  # Row anchor: prefer same y
            )
            if rs:
                ctx.anchors_found["secondary"] = {
                    "x": rs["found_x"], "y": rs["found_y"],
                    "text": rs["actual_text"],
                    "width": rs.get("width", secondary.region.width),
                    "height": rs.get("height", secondary.region.height),
                }

        ctx.anchor_found = True
        ctx.anchor_text = f"Area: {rt['actual_text']} → {rb['actual_text']}"
        ctx.anchor_dx = 0.0
        ctx.anchor_dy = 0.0
        ctx.anchor_status = "ok"
        ctx.anchor_shift_desc = f"Area bounded by \"{rt['actual_text']}\" and \"{rb['actual_text']}\""
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="search",
            resolved=True,
            detail=f"Area found: \"{rt['actual_text']}\" to \"{rb['actual_text']}\"" + (
                f", primary \"{ctx.anchors_found['primary']['text']}\"" if "primary" in ctx.anchors_found else ""
            ) + (
                f", secondary \"{ctx.anchors_found['secondary']['text']}\"" if "secondary" in ctx.anchors_found else ""
            ),
            region=area_region,
        ))
        return True

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

    if step.type == "block_value":
        if not ctx.found_block_id:
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=False, detail="Cannot extract block value - no block found (add block_search before this step)",
            ))
            return False
        extract_mode = step.block_extract_mode or "same_block"
        result = extract_block_text(
            ctx.pdf_path,
            page_num=f.anchor_region.page if f.anchor_region else 1,
            block_id=ctx.found_block_id,
            extract_mode=extract_mode,
            anchor_text=f.expected_anchor_text,
        )
        if result and result["text"]:
            ctx.value = result["text"]
            ctx.value_found = True
            bbox = result["bbox"]
            ctx.value_found_x = bbox["x"]
            ctx.value_found_y = bbox["y"]
            ctx.value_found_width = bbox["width"]
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=True, detail=f"Value from block ({extract_mode}): \"{result['text'][:50]}\"",
                region=Region(
                    page=f.anchor_region.page if f.anchor_region else 1,
                    x=bbox["x"], y=bbox["y"],
                    width=bbox["width"], height=bbox["height"],
                ),
            ))
            return True
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="value",
            resolved=False, detail=f"No value found in block ({extract_mode})",
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

    if step.type == "intersection_value":
        # Extract value at the intersection of primary (column) and secondary (row)
        primary = ctx.anchors_found.get("primary")
        secondary = ctx.anchors_found.get("secondary")
        if not primary or not secondary:
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=False, detail="Intersection requires both primary and secondary anchors found",
            ))
            return False
        # Value x comes from primary (column header center), y from secondary (row label)
        val_x = primary["x"]
        val_y = secondary["y"]
        val_w = primary["width"]
        val_h = secondary["height"]
        # Build extraction region at the intersection
        intersection_region = Region(
            page=f.value_region.page if f.value_region else 1,
            x=max(0.0, val_x),
            y=max(0.0, val_y),
            width=min(val_w, 1.0 - val_x),
            height=min(val_h, 1.0 - val_y),
        )
        value = extract_text_from_region(ctx.pdf_path, intersection_region)
        if value:
            ctx.value = value
            ctx.value_found = True
            ctx.value_found_x = val_x
            ctx.value_found_y = val_y
            ctx.value_found_width = val_w
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=True,
                detail=f"Value at intersection ({val_x:.2f},{val_y:.2f}): \"{value}\"",
                region=intersection_region,
            ))
            return True
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="value",
            resolved=False, detail=f"No text at intersection ({val_x:.2f},{val_y:.2f})",
            region=intersection_region,
        ))
        return False

    if step.type == "area_text_value":
        # Extract ALL text between area_top and area_bottom anchors
        area_top = ctx.anchors_found.get("area_top")
        area_bottom = ctx.anchors_found.get("area_bottom")
        if not area_top or not area_bottom:
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=False, detail="Area text value requires area_top and area_bottom anchors found",
            ))
            return False
        # Region between the two area anchors
        top_y = area_top["y"] + area_top["height"]
        bottom_y = area_bottom["y"]
        if bottom_y <= top_y:
            bottom_y = top_y + 0.01
        # Use the value box's x-range as horizontal constraint (the user drew it
        # around the target column), falling back to anchor x-range
        if f.value_region:
            area_x = f.value_region.x
            area_right = f.value_region.x + f.value_region.width
        else:
            area_x = min(area_top["x"], area_bottom["x"])
            area_right = max(
                area_top["x"] + area_top["width"],
                area_bottom["x"] + area_bottom["width"],
            )
        between_region = Region(
            page=f.value_region.page if f.value_region else 1,
            x=area_x,
            y=top_y,
            width=min(area_right - area_x, 1.0),
            height=bottom_y - top_y,
        )
        value = extract_text_from_region(ctx.pdf_path, between_region)
        if value:
            ctx.value = value
            ctx.value_found = True
            ctx.value_found_x = between_region.x
            ctx.value_found_y = between_region.y
            ctx.value_found_width = between_region.width
            ctx.step_traces.append(StepTrace(
                step_id=step.id, step_type=step.type, category="value",
                resolved=True,
                detail=f"Area text ({len(value)} chars): \"{value[:50]}{'...' if len(value) > 50 else ''}\"",
                region=between_region,
            ))
            return True
        ctx.step_traces.append(StepTrace(
            step_id=step.id, step_type=step.type, category="value",
            resolved=False, detail="No text found between area anchors",
            region=between_region,
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
        "empty": "empty",
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
        compare_test_run_id=step.compare_test_run_id,
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

    # Separate steps by category (validate steps are now handled by rule_engine)
    search_steps = [s for s in field.chain if s.category == "search"]
    value_steps = [s for s in field.chain if s.category == "value"]

    # For static fields, just extract the value
    if field.type == "static":
        ctx.value = extract_text_from_region(pdf_path, field.value_region)
        status = "ok" if ctx.value else "empty"

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

    # Dynamic fields: run search → value chain
    ordered_chain = search_steps + value_steps
    execute_chain(ordered_chain, ctx)

    # Determine final status (no validation here — handled by rule_engine)
    status = ctx.anchor_status
    if not ctx.value:
        status = "empty" if not ctx.anchor_found else status

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
        "anchors_found": ctx.anchors_found if ctx.anchors_found else {},
        "step_traces": ctx.step_traces,
    }
