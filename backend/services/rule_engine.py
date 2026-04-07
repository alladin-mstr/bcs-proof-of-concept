"""Template-level rule evaluation engine.

Evaluates TemplateRule objects (validations + computations) after field extraction.
Supports cross-template field references via test runs or live extraction.
"""

import json
import re
from functools import reduce
from models.schemas import (
    TemplateRule, TemplateRuleResult, RuleOperand, ComputedField,
    Rule, FieldRef, ControleRunResult,
)
from services.storage_backend import get_storage


def _parse_numeric(value: str) -> float | None:
    """Parse a string to float, handling currency symbols and commas."""
    if not value:
        return None
    cleaned = value.replace(",", "").replace(" ", "")
    for symbol in ["$", "€", "£", "¥", "₹"]:
        cleaned = cleaned.replace(symbol, "")
    cleaned = cleaned.strip()
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    try:
        return float(cleaned)
    except ValueError:
        return None


def _format_result(value: float, datatype: str | None) -> str:
    """Format a numeric result back to string."""
    if datatype == "integer":
        return str(int(round(value)))
    if datatype == "currency":
        return f"${value:,.2f}"
    if value == int(value):
        return str(int(value))
    return f"{value:.4f}".rstrip("0").rstrip(".")


COMPARE_OPS = {
    "less_than": lambda a, b: a < b,
    "greater_than": lambda a, b: a > b,
    "equals": lambda a, b: a == b,
    "not_equals": lambda a, b: a != b,
    "less_or_equal": lambda a, b: a <= b,
    "greater_or_equal": lambda a, b: a >= b,
}

COMPARE_LABELS = {
    "less_than": "<",
    "greater_than": ">",
    "equals": "==",
    "not_equals": "!=",
    "less_or_equal": "<=",
    "greater_or_equal": ">=",
    "contains": "contains",
    "not_contains": "not contains",
    "starts_with": "starts with",
    "ends_with": "ends with",
    "in_array": "in",
    "not_in_array": "not in",
    "matches_regex": "matches",
    "is_empty": "is empty",
    "is_not_empty": "is not empty",
    "date_before": "before",
    "date_after": "after",
    "date_between": "between",
}


def _parse_date(value: str):
    """Try to parse a date string. Returns datetime.date or None."""
    from datetime import datetime
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y", "%d-%m-%Y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    # Try extraction service's parser as fallback
    try:
        from services.extraction_service import parse_date
        return parse_date(value)
    except Exception:
        return None


def _evaluate_string_operator(op: str, a_val: str, b_val: str | None) -> bool | None:
    """Evaluate string/array/regex/date operators. Returns bool or None if not applicable."""
    a = a_val.strip() if a_val else ""
    b = b_val.strip() if b_val else ""

    if op == "contains":
        return b.lower() in a.lower()
    if op == "not_contains":
        return b.lower() not in a.lower()
    if op == "starts_with":
        return a.lower().startswith(b.lower())
    if op == "ends_with":
        return a.lower().endswith(b.lower())
    if op == "in_array":
        # b is comma-separated list of values
        items = [x.strip().lower() for x in b.split(",")]
        return a.lower() in items
    if op == "not_in_array":
        items = [x.strip().lower() for x in b.split(",")]
        return a.lower() not in items
    if op == "matches_regex":
        try:
            return bool(re.search(b, a))
        except re.error:
            return False
    if op == "is_empty":
        return a == ""
    if op == "is_not_empty":
        return a != ""
    if op == "date_before":
        da, db = _parse_date(a), _parse_date(b)
        if da and db:
            return da < db
        return None
    if op == "date_after":
        da, db = _parse_date(a), _parse_date(b)
        if da and db:
            return da > db
        return None
    if op == "date_between":
        # b is "start,end" comma-separated
        parts = [x.strip() for x in b.split(",")]
        if len(parts) != 2:
            return None
        da = _parse_date(a)
        d_start, d_end = _parse_date(parts[0]), _parse_date(parts[1])
        if da and d_start and d_end:
            return d_start <= da <= d_end
        return None

    return None


class RuleEngine:
    """Evaluates template-level rules (validations + computations)."""

    def __init__(
        self,
        current_template_id: str,
        extracted_values: dict[str, str],
        cross_template_values: dict[str, dict[str, str]] | None = None,
        table_values: dict[str, list[dict[str, str]]] | None = None,
        cross_table_values: dict[str, dict[str, list[dict[str, str]]]] | None = None,
        series_context: dict[str, "ControleRunResult"] | None = None,
        grid_data: dict[str, dict] | None = None,
        translation_rules: dict[str, str] | None = None,
    ):
        self.current_template_id = current_template_id
        self.values = extracted_values
        self.computed: dict[str, str] = {}
        self.cross_values = cross_template_values or {}
        self.table_values = table_values or {}
        self.cross_table_values = cross_table_values or {}
        self.series_context = series_context or {}
        self.grid_data = grid_data or {}
        self.translation_rules = translation_rules or {}

    def resolve_operand(self, operand: RuleOperand) -> str | None:
        """Resolve an operand to its string value."""
        if operand.type == "literal":
            return operand.value

        if operand.type == "field_ref":
            ref = operand.ref
            if not ref:
                return None
            # Cross-template reference
            if ref.template_id and ref.template_id != self.current_template_id:
                # Check series_context first (data piped from earlier series steps)
                if ref.template_id in self.series_context:
                    run_result = self.series_context[ref.template_id]
                    for entry in run_result.entries:
                        if entry.label == ref.field_label or entry.label.endswith(f"→ {ref.field_label}"):
                            return entry.value
                # Fall back to stored cross-template values
                template_vals = self.cross_values.get(ref.template_id, {})
                return template_vals.get(ref.field_label)
            # Local field
            return self.values.get(ref.field_label)

        if operand.type == "computed_ref":
            return self.computed.get(operand.computed_id)

        if operand.type == "column_ref":
            # Column refs resolve to a comma-separated summary (for scalar contexts)
            col = self.resolve_column(operand)
            if col:
                return ", ".join(col[:5]) + (f" ... ({len(col)} total)" if len(col) > 5 else "")
            return None

        if operand.type == "formula":
            from services.formula_engine import evaluate
            ss_id = operand.spreadsheet_id
            if ss_id and ss_id in self.grid_data:
                try:
                    return evaluate(operand.expression or "", self.grid_data[ss_id])
                except Exception as e:
                    return f"Error: {e}"
            return None

        if operand.type == "range_ref":
            ss_id = operand.spreadsheet_id
            rng = operand.range
            if ss_id and rng and ss_id in self.grid_data:
                grid = self.grid_data[ss_id]
                values = []
                for r in range(rng.startRow, rng.endRow + 1):
                    for c in range(rng.startCol, rng.endCol + 1):
                        if r < grid["row_count"] and c < grid["col_count"]:
                            val = grid["rows"][r][c]
                            if val is not None:
                                values.append(str(val))
                return ", ".join(values[:5]) + (f" ... ({len(values)} total)" if len(values) > 5 else "")
            return None

        if operand.type == "global_value":
            from services.global_value_store import get_global_value_group
            if operand.global_group_id:
                group = get_global_value_group(operand.global_group_id)
                if group:
                    for gv in group.values:
                        if gv.id == operand.global_value_id:
                            return gv.value
            return None

        return None

    def resolve_column(self, operand: RuleOperand) -> list[str] | None:
        """Resolve a column_ref operand to a list of cell values."""
        if operand.type != "column_ref":
            return None
        ref = operand.ref
        if not ref:
            return None
        field_label = ref.field_label
        col = operand.column_label
        if not col:
            return None

        # Cross-template table lookup
        if ref.template_id and ref.template_id != self.current_template_id:
            tpl_tables = self.cross_table_values.get(ref.template_id, {})
            table_data = tpl_tables.get(field_label, [])
            return [row.get(col, "") for row in table_data] if table_data else None

        # Local table lookup
        table_data = self.table_values.get(field_label, [])
        return [row.get(col, "") for row in table_data]

    def resolve_range(self, operand: RuleOperand) -> list[str] | None:
        """Resolve a range_ref operand to a list of cell values."""
        if operand.type != "range_ref":
            return None
        ss_id = operand.spreadsheet_id
        rng = operand.range
        if not ss_id or not rng or ss_id not in self.grid_data:
            return None
        grid = self.grid_data[ss_id]
        values = []
        for r in range(rng.startRow, rng.endRow + 1):
            for c in range(rng.startCol, rng.endCol + 1):
                if r < grid["row_count"] and c < grid["col_count"]:
                    val = grid["rows"][r][c]
                    values.append(str(val) if val is not None else "")
        return values

    def _resolve_spreadsheet_column(self, operand: RuleOperand) -> list[str] | None:
        """Resolve a field_ref that references a spreadsheet column header to all values in that column."""
        if operand.type != "field_ref" or not operand.ref:
            return None
        field_label = operand.ref.field_label
        for grid in self.grid_data.values():
            if field_label in grid.get("headers", []):
                col_idx = grid["headers"].index(field_label)
                return [
                    str(row[col_idx]) if col_idx < len(row) and row[col_idx] is not None else ""
                    for row in grid["rows"]
                ]
        return None

    def evaluate_computation(self, rule: TemplateRule) -> str | None:
        """Evaluate a computation rule and return result as string."""
        comp = rule.computation
        if not comp:
            return None

        # Handle conditional (if/then/else)
        if comp.condition:
            cond = comp.condition
            a_val = self.resolve_operand(cond.operand_a)
            b_val = self.resolve_operand(cond.operand_b)
            passed = False
            if a_val is not None:
                # Try string/date/regex operators first
                str_result = _evaluate_string_operator(cond.operator, a_val, b_val)
                if str_result is not None:
                    passed = str_result
                elif b_val is not None:
                    # Fall back to numeric comparison
                    a_num = _parse_numeric(a_val)
                    b_num = _parse_numeric(b_val)
                    if a_num is not None and b_num is not None:
                        op_fn = COMPARE_OPS.get(cond.operator)
                        passed = bool(op_fn(a_num, b_num)) if op_fn else False
                    else:
                        # String equality fallback
                        if cond.operator == "equals":
                            passed = a_val.strip() == b_val.strip()
                        elif cond.operator == "not_equals":
                            passed = a_val.strip() != b_val.strip()
            if passed:
                return self.resolve_operand(cond.then_value) or ""
            else:
                return self.resolve_operand(cond.else_value) or ""

        # Handle aggregate operations (operate on column arrays)
        op = comp.operation
        if op in ("agg_sum", "agg_average", "agg_count", "agg_min", "agg_max"):
            col_values = None
            if comp.operands and comp.operands[0].type == "column_ref":
                col_values = self.resolve_column(comp.operands[0])
            elif comp.operands and comp.operands[0].type == "range_ref":
                col_values = self.resolve_range(comp.operands[0])
            elif comp.operands and comp.operands[0].type == "field_ref":
                # Spreadsheet column: resolve all values from grid by matching header name
                col_values = self._resolve_spreadsheet_column(comp.operands[0])
            if col_values is None:
                return None
            if op == "agg_count":
                result = float(len(col_values))
            else:
                nums = [n for v in col_values if (n := _parse_numeric(v)) is not None]
                if not nums:
                    return None
                if op == "agg_sum":
                    result = sum(nums)
                elif op == "agg_average":
                    result = sum(nums) / len(nums)
                elif op == "agg_min":
                    result = min(nums)
                elif op == "agg_max":
                    result = max(nums)
                else:
                    return None
            return _format_result(result, comp.output_datatype)

        # Handle row_filter operation
        if op == "row_filter":
            if not comp.operands:
                return None
            # First operand is the column_ref, second is the comparison threshold
            col_op = comp.operands[0]
            col_values = self.resolve_column(col_op) if col_op.type == "column_ref" else None
            if col_values is None:
                return None
            # Get the comparison operator and threshold from the condition
            if comp.condition:
                cond = comp.condition
                b_val = self.resolve_operand(cond.operand_b)
                mode = comp.row_filter_mode or "count"
                passing = 0
                for cell in col_values:
                    # Evaluate per-row
                    str_result = _evaluate_string_operator(cond.operator, cell, b_val)
                    if str_result is not None:
                        if str_result:
                            passing += 1
                    elif b_val is not None:
                        a_num = _parse_numeric(cell)
                        b_num = _parse_numeric(b_val)
                        if a_num is not None and b_num is not None:
                            op_fn = COMPARE_OPS.get(cond.operator)
                            if op_fn and op_fn(a_num, b_num):
                                passing += 1
                total = len(col_values)
                if mode == "count":
                    return str(passing)
                elif mode == "all_pass":
                    return "true" if passing == total else "false"
                elif mode == "any_pass":
                    return "true" if passing > 0 else "false"
            return None

        # Handle polaris_lookup operation
        if op == "polaris_lookup":
            pc = comp.polaris_config
            if not pc or not pc.spreadsheet_id or pc.spreadsheet_id not in self.grid_data:
                return None
            grid = self.grid_data[pc.spreadsheet_id]
            headers = grid.get("headers", [])
            if pc.key_column not in headers or pc.signal_column not in headers:
                return None
            key_idx = headers.index(pc.key_column)
            sig_idx = headers.index(pc.signal_column)
            # Group signals by key
            grouped: dict[str, list[dict[str, str]]] = {}
            for row in grid["rows"]:
                key_val = str(row[key_idx]) if key_idx < len(row) and row[key_idx] is not None else ""
                sig_val = str(row[sig_idx]) if sig_idx < len(row) and row[sig_idx] is not None else ""
                if not key_val or not sig_val:
                    continue
                translation = self.translation_rules.get(sig_val, "")
                if key_val not in grouped:
                    grouped[key_val] = []
                grouped[key_val].append({"code": sig_val, "translation": translation})
            return json.dumps(grouped, ensure_ascii=False)

        # Resolve operands
        raw_values = [self.resolve_operand(op) for op in comp.operands]
        nums = []
        for v in raw_values:
            if v is None:
                continue
            n = _parse_numeric(v)
            if n is not None:
                nums.append(n)

        if not nums:
            return None

        result: float | None = None

        if op == "add":
            result = sum(nums)
        elif op == "subtract":
            result = nums[0] - sum(nums[1:]) if len(nums) > 1 else nums[0]
        elif op == "multiply":
            result = reduce(lambda a, b: a * b, nums)
        elif op == "divide":
            if len(nums) >= 2 and nums[1] != 0:
                result = nums[0] / nums[1]
            else:
                return None
        elif op == "modulo":
            if len(nums) >= 2 and nums[1] != 0:
                result = nums[0] % nums[1]
            else:
                return None
        elif op == "abs":
            result = abs(nums[0])
        elif op == "round":
            decimals = int(nums[1]) if len(nums) > 1 else 0
            result = round(nums[0], decimals)
        elif op == "min":
            result = min(nums)
        elif op == "max":
            result = max(nums)
        elif op == "sum":
            result = sum(nums)
        elif op == "average":
            result = sum(nums) / len(nums) if nums else None

        if result is None:
            return None

        return _format_result(result, comp.output_datatype)

    def evaluate_validation(self, rule: TemplateRule) -> TemplateRuleResult:
        """Evaluate a validation rule."""
        val = rule.validation
        if not val:
            return TemplateRuleResult(
                rule_id=rule.id, rule_name=rule.name,
                passed=False, message="No validation config",
            )

        # Resolve the primary operand
        a_value = self.resolve_operand(val.operand_a)
        if a_value is None:
            return TemplateRuleResult(
                rule_id=rule.id, rule_name=rule.name,
                passed=False, message="Could not resolve field value",
            )

        rt = val.rule_type

        if rt == "not_empty":
            passed = bool(a_value.strip())
            return TemplateRuleResult(
                rule_id=rule.id, rule_name=rule.name,
                passed=passed, message="Value is present" if passed else "Value is empty",
            )

        if rt == "exact_match":
            expected = val.expected_value or ""
            passed = a_value.strip() == expected.strip()
            return TemplateRuleResult(
                rule_id=rule.id, rule_name=rule.name,
                passed=passed,
                message="Matches expected value" if passed else f"Expected '{expected}', got '{a_value.strip()}'",
            )

        if rt == "data_type":
            return self._validate_data_type(rule, a_value, val.data_type)

        if rt == "range":
            return self._validate_range(rule, a_value, val.min_value, val.max_value)

        if rt == "one_of":
            allowed = val.allowed_values or []
            stripped = a_value.strip()
            passed = stripped.lower() in [v.lower() for v in allowed]
            return TemplateRuleResult(
                rule_id=rule.id, rule_name=rule.name,
                passed=passed,
                message=f"'{stripped}' is in allowed values" if passed else f"'{stripped}' not in {allowed}",
            )

        if rt == "pattern":
            regex = val.regex or ""
            try:
                passed = bool(re.search(regex, a_value.strip()))
            except re.error as e:
                return TemplateRuleResult(
                    rule_id=rule.id, rule_name=rule.name,
                    passed=False, message=f"Invalid regex: {e}",
                )
            return TemplateRuleResult(
                rule_id=rule.id, rule_name=rule.name,
                passed=passed,
                message="Matches pattern" if passed else f"'{a_value.strip()}' doesn't match '{regex}'",
            )

        if rt in ("date_before", "date_after"):
            return self._validate_date(rule, a_value, rt, val.date_threshold)

        if rt == "compare_field":
            return self._validate_compare(rule, a_value, val)

        return TemplateRuleResult(
            rule_id=rule.id, rule_name=rule.name,
            passed=False, message=f"Unknown rule type: {rt}",
        )

    def _validate_data_type(self, rule, value, data_type):
        stripped = value.strip()
        if not data_type:
            return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=False, message="No data type configured")
        if data_type == "string":
            passed = bool(stripped)
        elif data_type == "number":
            passed = _parse_numeric(stripped) is not None
        elif data_type == "integer":
            n = _parse_numeric(stripped)
            passed = n is not None and n == int(n)
        elif data_type == "date":
            date_patterns = [
                r"\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}",
                r"\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}",
                r"[A-Za-z]+ \d{1,2},? \d{4}",
                r"\d{1,2} [A-Za-z]+ \d{4}",
            ]
            passed = any(re.search(p, stripped) for p in date_patterns)
        elif data_type == "currency":
            passed = _parse_numeric(stripped) is not None
        else:
            passed = False
        msg = f"Is a valid {data_type}" if passed else f"'{stripped}' is not a valid {data_type}"
        return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=passed, message=msg)

    def _validate_range(self, rule, value, min_val, max_val):
        parsed = _parse_numeric(value.strip())
        if parsed is None:
            return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=False, message=f"'{value.strip()}' is not a number")
        passed = True
        if min_val is not None and parsed < min_val:
            passed = False
        if max_val is not None and parsed > max_val:
            passed = False
        msg = f"Value {parsed} is {'within' if passed else 'outside'} range"
        return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=passed, message=msg)

    def _validate_date(self, rule, value, rule_type, threshold):
        from datetime import datetime
        if not threshold:
            return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=False, message="No threshold date configured")
        from services.extraction_service import parse_date
        parsed = parse_date(value.strip())
        if not parsed:
            return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=False, message=f"Cannot parse '{value.strip()}' as date")
        try:
            thresh = datetime.strptime(threshold, "%Y-%m-%d").date()
        except ValueError:
            return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=False, message=f"Invalid threshold: {threshold}")
        if rule_type == "date_before":
            passed = parsed < thresh
        else:
            passed = parsed > thresh
        return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=passed, message=f"Date {parsed} {'passes' if passed else 'fails'} {rule_type} {thresh}")

    def _validate_compare(self, rule, value, val):
        b_value = self.resolve_operand(val.operand_b) if val.operand_b else None
        op = val.operator
        if not op:
            return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=False, message="No operator configured")
        op_label = COMPARE_LABELS.get(op, op)

        # Try string/date/regex operators first
        str_result = _evaluate_string_operator(op, value, b_value)
        if str_result is not None:
            msg = f"'{value.strip()}' {op_label} '{b_value or ''}'" if str_result else f"'{value.strip()}' not {op_label} '{b_value or ''}'"
            return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=str_result, message=msg)

        # Unary operators that don't need operand_b
        if op in ("is_empty", "is_not_empty"):
            passed = (value.strip() == "") if op == "is_empty" else (value.strip() != "")
            msg = f"'{value.strip()}' {op_label}"
            return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=passed, message=msg)

        if b_value is None:
            return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=False, message="No comparison operand")

        # Numeric comparison
        a_num = _parse_numeric(value.strip())
        b_num = _parse_numeric(b_value.strip())
        if a_num is not None and b_num is not None:
            op_fn = COMPARE_OPS.get(op)
            passed = op_fn(a_num, b_num) if op_fn else False
            msg = f"{a_num} {op_label} {b_num}" if passed else f"{a_num} is not {op_label} {b_num}"
        else:
            # String equality fallback
            a_s, b_s = value.strip(), b_value.strip()
            if op in ("equals", "not_equals"):
                passed = (a_s == b_s) if op == "equals" else (a_s != b_s)
            else:
                passed = False
                msg = "Cannot compare non-numeric values with ordering operators"
                return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=passed, message=msg)
            msg = f"'{a_s}' {op_label} '{b_s}'" if passed else f"'{a_s}' is not {op_label} '{b_s}'"
        return TemplateRuleResult(rule_id=rule.id, rule_name=rule.name, passed=passed, message=msg)

    def _build_dependency_graph(self, rules: list[TemplateRule]) -> list[TemplateRule]:
        """Topological sort: computations ordered by computed_ref dependencies, then validations."""
        computations = [r for r in rules if r.type == "computation" and r.enabled]
        validations = [r for r in rules if r.type == "validation" and r.enabled]

        # Build dependency graph for computations
        comp_by_id = {r.id: r for r in computations}

        def _get_deps(rule: TemplateRule) -> set[str]:
            """Get computed_ref IDs this rule depends on."""
            deps: set[str] = set()
            if rule.computation:
                for op in rule.computation.operands:
                    if op.type == "computed_ref" and op.computed_id:
                        deps.add(op.computed_id)
                if rule.computation.condition:
                    for op in [rule.computation.condition.operand_a, rule.computation.condition.operand_b,
                               rule.computation.condition.then_value, rule.computation.condition.else_value]:
                        if op.type == "computed_ref" and op.computed_id:
                            deps.add(op.computed_id)
            if rule.validation:
                if rule.validation.operand_a.type == "computed_ref" and rule.validation.operand_a.computed_id:
                    deps.add(rule.validation.operand_a.computed_id)
                if rule.validation.operand_b and rule.validation.operand_b.type == "computed_ref" and rule.validation.operand_b.computed_id:
                    deps.add(rule.validation.operand_b.computed_id)
            return deps & comp_by_id.keys()

        # Kahn's algorithm for topological sort
        in_degree: dict[str, int] = {r.id: 0 for r in computations}
        dependents: dict[str, list[str]] = {r.id: [] for r in computations}
        for r in computations:
            for dep_id in _get_deps(r):
                in_degree[r.id] += 1
                dependents[dep_id].append(r.id)

        queue = [rid for rid, deg in in_degree.items() if deg == 0]
        sorted_comps: list[TemplateRule] = []
        while queue:
            rid = queue.pop(0)
            sorted_comps.append(comp_by_id[rid])
            for dep in dependents[rid]:
                in_degree[dep] -= 1
                if in_degree[dep] == 0:
                    queue.append(dep)

        # Add any remaining (cycle or unreachable) at the end
        seen = {r.id for r in sorted_comps}
        for r in computations:
            if r.id not in seen:
                sorted_comps.append(r)

        return sorted_comps + validations

    def evaluate_all(
        self,
        rules: list[TemplateRule],
        computed_fields: list[ComputedField] | None = None,
    ) -> tuple[dict[str, str], list[TemplateRuleResult]]:
        """Evaluate all rules in dependency order.

        Returns (computed_values, rule_results).
        """
        sorted_rules = self._build_dependency_graph(rules)
        computed_values: dict[str, str] = {}
        results: list[TemplateRuleResult] = []

        for rule in sorted_rules:
            if rule.type == "computation":
                val = self.evaluate_computation(rule)
                if val is not None:
                    # Use output label as key (for display), also store by id (for internal refs)
                    label = rule.computation.output_label if rule.computation else rule.name
                    computed_values[label] = val
                    self.computed[rule.id] = val
                    # Also add to values dict so validations can reference it by label
                    if rule.computation and rule.computation.output_label:
                        self.values[rule.computation.output_label] = val
                    results.append(TemplateRuleResult(
                        rule_id=rule.id, rule_name=rule.name,
                        passed=True, message=f"Computed: {val}",
                        computed_value=val,
                    ))
                else:
                    results.append(TemplateRuleResult(
                        rule_id=rule.id, rule_name=rule.name,
                        passed=False, message="Computation failed (missing or invalid operands)",
                    ))

            elif rule.type == "validation":
                result = self.evaluate_validation(rule)
                results.append(result)

        return computed_values, results


def resolve_cross_template_values(
    field_refs: list[FieldRef],
    current_template_id: str,
) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, list[dict[str, str]]]]]:
    """Resolve cross-template field values from test runs and controle runs.

    Returns (scalar_values, table_values) where:
      scalar_values = {template_id: {field_label: value}}
      table_values  = {template_id: {field_label: [row_dicts]}}
    """
    from services.test_run_store import list_test_runs, get_test_run

    cross_values: dict[str, dict[str, str]] = {}
    cross_tables: dict[str, dict[str, list[dict[str, str]]]] = {}
    seen_templates: set[str] = set()

    def _extract_run(run, template_id: str):
        cross_values[template_id] = {e.label: e.value for e in run.entries}
        tables: dict[str, list[dict[str, str]]] = {}
        for e in run.entries:
            if e.table_data:
                tables[e.label] = e.table_data
        if tables:
            cross_tables[template_id] = tables
        seen_templates.add(template_id)

    def _try_controle_runs(template_id: str) -> bool:
        """Try to resolve from controle runs. Returns True if found."""
        import json
        storage = get_storage()
        for rid in storage.list_controle_run_ids():
            content = storage.get_controle_run(rid)
            if content is None:
                continue
            run_data = json.loads(content)
            if run_data.get("controleId") == template_id and run_data.get("entries"):
                _extract_run(
                    ControleRunResult(**run_data),
                    template_id,
                )
                return True
        return False

    for ref in field_refs:
        if not ref.template_id or ref.template_id == current_template_id:
            continue
        if ref.template_id in seen_templates:
            continue

        resolution = ref.resolution or "latest_run"

        if resolution == "specific_run" and ref.test_run_id:
            run = get_test_run(ref.test_run_id)
            if run:
                _extract_run(run, ref.template_id)
            else:
                # Test run not found — try controle runs
                _try_controle_runs(ref.template_id)

        elif resolution == "latest_run":
            runs = list_test_runs()
            template_runs = [
                r for r in runs
                if r.template_id == ref.template_id
            ]
            if template_runs:
                latest = max(template_runs, key=lambda r: r.created_at)
                run = get_test_run(latest.id)
                if run:
                    _extract_run(run, ref.template_id)

            # Also check controle runs if not resolved from test runs
            if ref.template_id not in seen_templates:
                _try_controle_runs(ref.template_id)

    return cross_values, cross_tables


def collect_cross_template_refs(rules: list[TemplateRule]) -> list[FieldRef]:
    """Extract all cross-template FieldRefs from a list of rules."""
    refs: list[FieldRef] = []

    def _check_operand(op: RuleOperand | None):
        if op and op.type in ("field_ref", "column_ref") and op.ref and op.ref.template_id:
            refs.append(op.ref)

    for rule in rules:
        if rule.validation:
            _check_operand(rule.validation.operand_a)
            _check_operand(rule.validation.operand_b)
        if rule.computation:
            for op in rule.computation.operands:
                _check_operand(op)
            if rule.computation.condition:
                _check_operand(rule.computation.condition.operand_a)
                _check_operand(rule.computation.condition.operand_b)
                _check_operand(rule.computation.condition.then_value)
                _check_operand(rule.computation.condition.else_value)

    return refs


def detect_datatype(value: str) -> str:
    """Auto-detect the datatype of an extracted value."""
    if not value or not value.strip():
        return "string"

    stripped = value.strip()

    # Currency: starts with currency symbol or has currency-like format
    currency_patterns = [r"^[\$€£¥₹]", r"^\d{1,3}(,\d{3})*\.\d{2}$"]
    for p in currency_patterns:
        if re.search(p, stripped):
            return "currency"

    # Date patterns
    date_patterns = [
        r"^\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}$",
        r"^\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}$",
        r"^[A-Za-z]+ \d{1,2},? \d{4}$",
        r"^\d{1,2} [A-Za-z]+ \d{4}$",
        r"^[A-Za-z]{3} \d{2}, \d{4}$",
    ]
    for p in date_patterns:
        if re.search(p, stripped):
            return "date"

    # Integer
    cleaned = stripped.replace(",", "").replace(" ", "")
    try:
        float_val = float(cleaned)
        if float_val == int(float_val) and "." not in cleaned:
            return "integer"
        return "number"
    except ValueError:
        pass

    return "string"
