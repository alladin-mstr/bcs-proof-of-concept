"""Formula evaluation engine for spreadsheet-style formulas.

Evaluates Excel-style formulas against a parsed grid dict of shape:
    {
        "headers": ["A", "B", "C"],
        "rows": [[10, 20, 30], [40, 50, 60]],
        "row_count": 2,
        "col_count": 3,
    }

Cell references use Excel notation: A1 = col 0, row 0 (first data row).
"""

import re
import math

# ---------------------------------------------------------------------------
# Column letter ↔ index helpers
# ---------------------------------------------------------------------------

def _col_letter_to_index(letter: str) -> int:
    """Convert a column letter (A, B, ..., Z, AA, AB, ...) to a 0-based index."""
    letter = letter.upper()
    result = 0
    for ch in letter:
        if not ch.isalpha():
            raise ValueError(f"Invalid column letter: {letter!r}")
        result = result * 26 + (ord(ch) - ord("A") + 1)
    return result - 1


def _index_to_col_letter(index: int) -> str:
    """Convert a 0-based column index to a column letter (A, B, ..., Z, AA, ...)."""
    if index < 0:
        raise ValueError(f"Column index must be >= 0, got {index}")
    result = ""
    n = index + 1
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        result = chr(ord("A") + remainder) + result
    return result


# ---------------------------------------------------------------------------
# Cell / range reference parsing
# ---------------------------------------------------------------------------

_CELL_REF_RE = re.compile(r"^([A-Za-z]+)(\d+)$")


def _parse_cell_ref(ref: str) -> tuple[int, int]:
    """Parse an Excel cell reference like 'A1' into (col, row) 0-based indices."""
    m = _CELL_REF_RE.match(ref.strip())
    if not m:
        raise ValueError(f"Invalid cell reference: {ref!r}")
    col = _col_letter_to_index(m.group(1))
    row = int(m.group(2)) - 1  # 1-based → 0-based
    if row < 0:
        raise ValueError(f"Row number must be >= 1 in reference {ref!r}")
    return col, row


def _parse_range_ref(ref: str) -> tuple[int, int, int, int]:
    """Parse a range reference like 'A1:B10' into (start_col, start_row, end_col, end_row)."""
    parts = ref.strip().split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid range reference: {ref!r}")
    start_col, start_row = _parse_cell_ref(parts[0])
    end_col, end_row = _parse_cell_ref(parts[1])
    return start_col, start_row, end_col, end_row


# ---------------------------------------------------------------------------
# Grid access helpers
# ---------------------------------------------------------------------------

def _get_cell_value(grid: dict, col: int, row: int):
    """Get the value at (col, row) from the grid. Raises ValueError on out-of-bounds."""
    rows = grid.get("rows", [])
    if row < 0 or row >= len(rows):
        raise ValueError(
            f"Row index {row} out of range (grid has {len(rows)} data rows)"
        )
    data_row = rows[row]
    if col < 0 or col >= len(data_row):
        raise ValueError(
            f"Column index {col} out of range (row has {len(data_row)} columns)"
        )
    return data_row[col]


def _get_range_values(
    grid: dict,
    start_col: int,
    start_row: int,
    end_col: int,
    end_row: int,
) -> list:
    """Return a flat list of all values in the specified rectangular range."""
    values = []
    for r in range(start_row, end_row + 1):
        for c in range(start_col, end_col + 1):
            try:
                values.append(_get_cell_value(grid, c, r))
            except ValueError:
                pass  # Skip out-of-bounds cells within a range
    return values


# ---------------------------------------------------------------------------
# Number helpers
# ---------------------------------------------------------------------------

def _to_number(val) -> float:
    """Convert a value to float, handling currency symbols and commas."""
    if isinstance(val, (int, float)):
        return float(val)
    if val is None:
        return 0.0
    s = str(val).strip()
    # Remove currency symbols and thousands separators
    for sym in ["$", "€", "£", "¥", "₹"]:
        s = s.replace(sym, "")
    s = s.replace(",", "").strip()
    # Handle accounting negatives like (1234)
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return float(s)
    except ValueError:
        raise ValueError(f"Cannot convert {val!r} to a number")


def _format_number(val: float) -> str:
    """Format a numeric result: integer if whole, otherwise up to 4 decimal places."""
    if val == int(val) and not math.isinf(val):
        return str(int(val))
    formatted = f"{val:.4f}".rstrip("0").rstrip(".")
    return formatted


# ---------------------------------------------------------------------------
# Safe arithmetic evaluator
# ---------------------------------------------------------------------------

_SAFE_EXPR_RE = re.compile(r"^[\d\s\.\+\-\*\/\(\)e]+$", re.IGNORECASE)


def _safe_eval(expr: str) -> float:
    """Safely evaluate a pure arithmetic expression (no function calls, no names).

    Only digits, operators (+, -, *, /), parentheses, dots, and scientific
    notation exponents are allowed.
    """
    expr = expr.strip()
    if not _SAFE_EXPR_RE.match(expr):
        raise ValueError(f"Unsafe arithmetic expression: {expr!r}")
    try:
        # pylint: disable=eval-used
        result = eval(expr, {"__builtins__": {}}, {})  # noqa: S307
    except ZeroDivisionError:
        raise ValueError("Division by zero")
    except Exception as exc:
        raise ValueError(f"Cannot evaluate arithmetic expression {expr!r}: {exc}") from exc
    return float(result)


# ---------------------------------------------------------------------------
# Argument splitting (respects nested parentheses)
# ---------------------------------------------------------------------------

def _split_args(args_str: str) -> list[str]:
    """Split a comma-separated argument string, respecting nested parentheses."""
    args: list[str] = []
    depth = 0
    current: list[str] = []
    for ch in args_str:
        if ch == "(":
            depth += 1
            current.append(ch)
        elif ch == ")":
            depth -= 1
            current.append(ch)
        elif ch == "," and depth == 0:
            args.append("".join(current).strip())
            current = []
        else:
            current.append(ch)
    last = "".join(current).strip()
    if last:
        args.append(last)
    return args


# ---------------------------------------------------------------------------
# Cell-reference substitution for arithmetic expressions
# ---------------------------------------------------------------------------

_CELL_REF_PATTERN = re.compile(r"\b([A-Za-z]+)(\d+)\b")


def _resolve_cell_refs_in_expr(expr: str, grid: dict) -> str:
    """Replace all cell references in an arithmetic expression with their numeric values."""

    def replace_ref(m: re.Match) -> str:
        col = _col_letter_to_index(m.group(1))
        row = int(m.group(2)) - 1
        val = _get_cell_value(grid, col, row)
        return str(_to_number(val))

    return _CELL_REF_PATTERN.sub(replace_ref, expr)


# ---------------------------------------------------------------------------
# Condition evaluation  (e.g. "A1>100", "B2<=A1")
# ---------------------------------------------------------------------------

_CONDITION_RE = re.compile(
    r"^(.+?)\s*(>=|<=|<>|!=|>|<|=)\s*(.+)$"
)


def _evaluate_condition(cond_str: str, grid: dict) -> bool:
    """Evaluate a simple comparison condition like 'A1>100' or 'B2<=A1'."""
    m = _CONDITION_RE.match(cond_str.strip())
    if not m:
        raise ValueError(f"Cannot parse condition: {cond_str!r}")

    left_expr, op, right_expr = m.group(1).strip(), m.group(2), m.group(3).strip()

    def _eval_side(side: str) -> float:
        # Replace cell references, then evaluate arithmetic
        resolved = _resolve_cell_refs_in_expr(side, grid)
        return _safe_eval(resolved)

    left_val = _eval_side(left_expr)
    right_val = _eval_side(right_expr)

    if op in (">",):
        return left_val > right_val
    if op in ("<",):
        return left_val < right_val
    if op in (">=",):
        return left_val >= right_val
    if op in ("<=",):
        return left_val <= right_val
    if op in ("=", "=="):
        return left_val == right_val
    if op in ("<>", "!="):
        return left_val != right_val
    raise ValueError(f"Unknown comparison operator: {op!r}")


# ---------------------------------------------------------------------------
# Built-in function evaluator
# ---------------------------------------------------------------------------

_FUNC_CALL_RE = re.compile(r"^([A-Z]+)\((.+)\)$", re.DOTALL)
_RANGE_REF_RE = re.compile(r"^[A-Za-z]+\d+:[A-Za-z]+\d+$")
_SINGLE_CELL_RE = re.compile(r"^[A-Za-z]+\d+$")


def _builtin_evaluate(expression: str, grid: dict) -> str:
    """Evaluate a formula using the built-in evaluator.

    Supports:
    - Functions: SUM, AVERAGE, COUNT, MIN, MAX, ABS, ROUND, IF
    - Basic arithmetic: +, -, *, /
    - Cell references: A1, B2
    - Range references: A1:A10
    """
    expr = expression.strip()
    if expr.startswith("="):
        expr = expr[1:].strip()

    return _eval_expr(expr, grid)


def _eval_expr(expr: str, grid: dict) -> str:
    """Recursively evaluate an expression (without leading '=')."""
    expr = expr.strip()

    # --- Function call ---
    m = _FUNC_CALL_RE.match(expr)
    if m:
        func_name = m.group(1).upper()
        args_str = m.group(2)
        return _eval_function(func_name, args_str, grid)

    # --- Range reference (A1:B2) — only valid inside functions, but handle gracefully ---
    if _RANGE_REF_RE.match(expr):
        raise ValueError(f"Range reference {expr!r} cannot be used outside a function")

    # --- Single cell reference (A1) ---
    if _SINGLE_CELL_RE.match(expr):
        col, row = _parse_cell_ref(expr)
        val = _get_cell_value(grid, col, row)
        return _format_number(_to_number(val))

    # --- Arithmetic expression (may contain cell refs) ---
    resolved = _resolve_cell_refs_in_expr(expr, grid)
    result = _safe_eval(resolved)
    return _format_number(result)


def _eval_function(func_name: str, args_str: str, grid: dict) -> str:
    """Evaluate a named function call with the given argument string."""
    args = _split_args(args_str)

    # --- IF(condition, then, else) ---
    if func_name == "IF":
        if len(args) < 2:
            raise ValueError("IF requires at least 2 arguments: IF(condition, then[, else])")
        condition_str = args[0]
        then_expr = args[1]
        else_expr = args[2] if len(args) > 2 else "0"
        result_condition = _evaluate_condition(condition_str, grid)
        return _eval_expr(then_expr if result_condition else else_expr, grid)

    # --- ABS(value) ---
    if func_name == "ABS":
        if len(args) != 1:
            raise ValueError("ABS requires exactly 1 argument")
        val = _to_number(_eval_expr(args[0], grid))
        return _format_number(abs(val))

    # --- ROUND(value, decimals) ---
    if func_name == "ROUND":
        if len(args) < 1:
            raise ValueError("ROUND requires at least 1 argument")
        val = _to_number(_eval_expr(args[0], grid))
        decimals = int(_to_number(_eval_expr(args[1], grid))) if len(args) > 1 else 0
        return _format_number(round(val, decimals))

    # --- Aggregate functions: SUM, AVERAGE, COUNT, MIN, MAX ---
    if func_name in ("SUM", "AVERAGE", "COUNT", "MIN", "MAX"):
        numbers: list[float] = []
        for arg in args:
            arg = arg.strip()
            if _RANGE_REF_RE.match(arg):
                start_col, start_row, end_col, end_row = _parse_range_ref(arg)
                raw_values = _get_range_values(grid, start_col, start_row, end_col, end_row)
                for v in raw_values:
                    try:
                        numbers.append(_to_number(v))
                    except ValueError:
                        pass  # Skip non-numeric values for aggregates
            elif _SINGLE_CELL_RE.match(arg):
                col, row = _parse_cell_ref(arg)
                val = _get_cell_value(grid, col, row)
                try:
                    numbers.append(_to_number(val))
                except ValueError:
                    pass
            else:
                # Evaluate as a sub-expression
                try:
                    numbers.append(_to_number(_eval_expr(arg, grid)))
                except ValueError:
                    pass

        if func_name == "COUNT":
            return _format_number(float(len(numbers)))

        if not numbers:
            raise ValueError(f"{func_name}: no numeric values found in arguments")

        if func_name == "SUM":
            return _format_number(sum(numbers))
        if func_name == "AVERAGE":
            return _format_number(sum(numbers) / len(numbers))
        if func_name == "MIN":
            return _format_number(min(numbers))
        if func_name == "MAX":
            return _format_number(max(numbers))

    raise ValueError(f"Unknown function: {func_name!r}")


# ---------------------------------------------------------------------------
# formulas-library integration (best-effort)
# ---------------------------------------------------------------------------

def _try_formulas_library(expression: str, grid: dict) -> str | None:
    """Attempt to evaluate a formula using the `formulas` library.

    Returns the result string on success, or None if the library fails.
    """
    try:
        import formulas  # type: ignore

        # Build a flat Excel-style mapping: cell_address → value
        # We map headers as row 0 and data rows as rows 1..N
        cell_inputs: dict[str, object] = {}
        headers = grid.get("headers", [])
        rows = grid.get("rows", [])

        for c_idx, header in enumerate(headers):
            col_letter = _index_to_col_letter(c_idx)
            cell_inputs[f"{col_letter}1"] = header

        for r_idx, row in enumerate(rows):
            for c_idx, val in enumerate(row):
                col_letter = _index_to_col_letter(c_idx)
                # +2 because row 1 is headers; data starts at row 2
                cell_inputs[f"{col_letter}{r_idx + 2}"] = val

        # Build a flat inputs dict for the formula compiler
        # formulas expects: inputs = {cell_ref: value, ...}
        # and the formula itself to reference the correct row offsets.
        # Since our built-in evaluator uses row 1 = first data row (no header offset),
        # we need to shift cell references by +1 when passing to the library.
        shifted_expr = _shift_row_refs(expression)

        func = formulas.Formula(shifted_expr)
        result = func(**{k.upper(): v for k, v in cell_inputs.items()})

        if result is None:
            return None

        # formulas may return numpy arrays or scalars
        try:
            import numpy as np  # type: ignore
            if isinstance(result, np.ndarray):
                flat = result.flatten()
                if flat.size == 1:
                    result = flat[0]
                else:
                    return None  # Multi-cell result — not a scalar formula
        except ImportError:
            pass

        val = float(result)
        return _format_number(val)

    except Exception:
        return None


def _shift_row_refs(expression: str) -> str:
    """Shift all row numbers in cell references up by 1 (to account for the header row).

    E.g. '=SUM(A1:A2)' → '=SUM(A2:A3)' because our grid uses row 1 for headers.
    """

    def _shift(m: re.Match) -> str:
        col_part = m.group(1)
        row_num = int(m.group(2))
        return f"{col_part}{row_num + 1}"

    return _CELL_REF_PATTERN.sub(_shift, expression)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def evaluate(expression: str, grid: dict) -> str:
    """Evaluate a formula string against a grid and return the string result.

    Parameters
    ----------
    expression:
        An Excel-style formula string, e.g. ``"=SUM(A1:A10)"`` or ``"=A1+B1"``.
    grid:
        A parsed spreadsheet grid dict with keys:
        ``headers``, ``rows``, ``row_count``, ``col_count``.

    Returns
    -------
    str
        The computed result as a string.

    Raises
    ------
    ValueError
        If the expression references invalid cells, divides by zero, or cannot
        be evaluated.
    """
    if not expression or not expression.strip():
        raise ValueError("Empty expression")

    expr = expression.strip()
    if not expr.startswith("="):
        # Treat bare values as literals
        return expr

    # --- Attempt 1: formulas library (best-effort) ---
    lib_result = _try_formulas_library(expr, grid)
    if lib_result is not None:
        return lib_result

    # --- Attempt 2: built-in evaluator ---
    return _builtin_evaluate(expr, grid)
