# Spreadsheet Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.xlsx` spreadsheet upload, cell/range field selection, formula evaluation, and new canvas nodes to the control creation wizard.

**Architecture:** Extend the existing wizard flow with a new file type discriminator (`"pdf" | "spreadsheet"`). Backend gets a new `spreadsheets` router for upload/parsing with `openpyxl`, and a `formula_engine` service using the `formulas` library. Frontend gets a `SpreadsheetViewer` component for cell selection, and two new canvas node types (`formula`, `cell_range`). The rule engine resolves new operand types against cached grid data.

**Tech Stack:** Python/FastAPI, openpyxl, formulas, React, TypeScript, @xyflow/react, Zustand, TailwindCSS

---

### Task 1: Backend — Add openpyxl dependency

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add openpyxl to dependencies**

In `backend/pyproject.toml`, add `openpyxl` to the dependencies list:

```toml
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "pdfplumber>=0.11.0",
    "python-multipart>=0.0.12",
    "pydantic>=2.0.0",
    "azure-storage-blob>=12.20.0",
    "azure-identity>=1.17.0",
    "openpyxl>=3.1.0",
    "formulas>=1.2.0",
]
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/alladin/Repositories/bcs/backend && pip install -e .`
Expected: Successfully installed openpyxl and formulas

- [ ] **Step 3: Verify imports**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "import openpyxl; import formulas; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml
git commit -m "feat: add openpyxl and formulas dependencies for spreadsheet support"
```

---

### Task 2: Backend — Extend data models for spreadsheet support

**Files:**
- Modify: `backend/models/schemas.py`

- [ ] **Step 1: Add spreadsheet-related models to schemas.py**

Add after the existing `ControleFile` class (around line 344):

```python
class SheetData(BaseModel):
    """Parsed spreadsheet grid data."""
    headers: list[str]
    rows: list[list]  # 2D grid (row-major, excludes header row)
    rowCount: int
    colCount: int


class SpreadsheetUploadResponse(BaseModel):
    """Response from spreadsheet upload."""
    spreadsheet_id: str
    filename: str
    headers: list[str]
    rows: list[list]
    row_count: int
    col_count: int
```

- [ ] **Step 2: Update ControleFile to support spreadsheet type**

Replace the existing `ControleFile` class:

```python
class ControleFile(BaseModel):
    """A single file definition within a Controle."""
    id: str
    label: str
    fileType: Literal["pdf", "spreadsheet"] = "pdf"
    # PDF-specific
    pdfId: str | None = None
    pdfFilename: str | None = None
    pageCount: int = 0
    # Spreadsheet-specific
    spreadsheetId: str | None = None
    spreadsheetFilename: str | None = None
    sheetData: SheetData | None = None
    # Shared
    fields: list[Field] = []
    extractionResults: list[FieldResult] | None = None
```

- [ ] **Step 3: Update RuleOperand to support formula and range_ref types**

Replace the existing `RuleOperand` class:

```python
class CellRange(BaseModel):
    """A cell range in a spreadsheet."""
    startCol: int
    startRow: int
    endCol: int
    endRow: int


class RuleOperand(BaseModel):
    """An operand in a rule expression."""
    type: Literal["field_ref", "literal", "computed_ref", "column_ref", "formula", "range_ref"]
    ref: FieldRef | None = None             # when type = "field_ref" or "column_ref"
    value: str | None = None                # when type = "literal"
    datatype: DataType | None = None        # when type = "literal"
    computed_id: str | None = None          # when type = "computed_ref"
    column_label: str | None = None         # when type = "column_ref"
    # Spreadsheet formula
    expression: str | None = None           # when type = "formula"
    spreadsheet_id: str | None = None       # when type = "formula" or "range_ref"
    # Cell range
    range: CellRange | None = None          # when type = "range_ref"
```

Note: `CellRange` must be defined before `RuleOperand` in the file.

- [ ] **Step 4: Update Field to support cell and cell_range types**

Replace the `Field` class's `type` field:

```python
class CellRef(BaseModel):
    """A single cell reference in a spreadsheet."""
    col: int
    row: int


class Field(BaseModel):
    """A labeled extraction field in a template."""
    id: str
    label: str
    type: Literal["static", "dynamic", "table", "cell", "cell_range"]
    anchor_mode: Literal["static", "single", "bracket", "area_value", "area_locator", "area_bracket"] = "static"
    anchors: list[Anchor] = []
    value_region: Region | None = None  # Make optional (not needed for spreadsheet fields)
    anchor_region: Region | None = None
    expected_anchor_text: str | None = None
    rules: list[Rule] = []
    value_format: DataType | None = None
    detected_datatype: DataType | None = None
    extraction_mode: ExtractionMode = "word"
    chain: list[ChainStep] = []
    source: Literal["a", "b"] = "a"
    table_config: TableConfig | None = None
    # Spreadsheet cell fields
    cell_ref: CellRef | None = None         # when type = "cell"
    range_ref: CellRange | None = None      # when type = "cell_range"
```

Note: `value_region` becomes optional (`Region | None = None`) since spreadsheet fields don't have PDF regions. `CellRef` must be defined before `Field`.

- [ ] **Step 5: Update FieldResult to support cell/cell_range types**

Update the `field_type` literal in `FieldResult`:

```python
class FieldResult(BaseModel):
    label: str
    field_type: Literal["static", "dynamic", "table", "cell", "cell_range"]
    # ... rest stays the same
```

- [ ] **Step 6: Verify backend still starts**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "from models.schemas import *; print('OK')"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add backend/models/schemas.py
git commit -m "feat: extend data models for spreadsheet file type, cell fields, formula/range operands"
```

---

### Task 3: Backend — Storage helpers for spreadsheets

**Files:**
- Modify: `backend/services/storage_backend.py`

- [ ] **Step 1: Add spreadsheet storage methods to StorageBackend ABC**

Add these abstract methods after the PDF methods in the `StorageBackend` class:

```python
    # -- Spreadsheets --

    @abstractmethod
    def upload_spreadsheet(self, spreadsheet_id: str, content: bytes) -> None: ...

    @abstractmethod
    def spreadsheet_exists(self, spreadsheet_id: str) -> bool: ...

    @abstractmethod
    def delete_spreadsheet(self, spreadsheet_id: str) -> None: ...

    @abstractmethod
    def save_spreadsheet_grid(self, spreadsheet_id: str, grid_json: str) -> None: ...

    @abstractmethod
    def get_spreadsheet_grid(self, spreadsheet_id: str) -> str | None: ...
```

- [ ] **Step 2: Implement in LocalStorage class**

Find the `LocalStorage` class in the same file and add implementations. The local storage stores files in `self.data_dir`. Add after the existing PDF implementations:

```python
    def upload_spreadsheet(self, spreadsheet_id: str, content: bytes) -> None:
        spreadsheets_dir = self.data_dir / "spreadsheets"
        spreadsheets_dir.mkdir(exist_ok=True)
        (spreadsheets_dir / f"{spreadsheet_id}.xlsx").write_bytes(content)

    def spreadsheet_exists(self, spreadsheet_id: str) -> bool:
        return (self.data_dir / "spreadsheets" / f"{spreadsheet_id}.xlsx").exists()

    def delete_spreadsheet(self, spreadsheet_id: str) -> None:
        path = self.data_dir / "spreadsheets" / f"{spreadsheet_id}.xlsx"
        if path.exists():
            path.unlink()
        grid_path = self.data_dir / "spreadsheets" / f"{spreadsheet_id}.grid.json"
        if grid_path.exists():
            grid_path.unlink()

    def save_spreadsheet_grid(self, spreadsheet_id: str, grid_json: str) -> None:
        spreadsheets_dir = self.data_dir / "spreadsheets"
        spreadsheets_dir.mkdir(exist_ok=True)
        (spreadsheets_dir / f"{spreadsheet_id}.grid.json").write_text(grid_json)

    def get_spreadsheet_grid(self, spreadsheet_id: str) -> str | None:
        path = self.data_dir / "spreadsheets" / f"{spreadsheet_id}.grid.json"
        if path.exists():
            return path.read_text()
        return None
```

- [ ] **Step 3: Implement in AzureStorage class (if present)**

If the file has an `AzureStorage` class, add equivalent implementations using blob storage. If not present, skip this step.

- [ ] **Step 4: Verify storage module loads**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "from services.storage_backend import get_storage; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/services/storage_backend.py
git commit -m "feat: add spreadsheet storage methods to storage backend"
```

---

### Task 4: Backend — Spreadsheet router (upload, retrieve, cell, range)

**Files:**
- Create: `backend/routers/spreadsheets.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create the spreadsheets router**

Create `backend/routers/spreadsheets.py`:

```python
import json
import uuid

from fastapi import APIRouter, HTTPException, UploadFile
from openpyxl import load_workbook
import io

from services.storage_backend import get_storage

router = APIRouter(prefix="/spreadsheets", tags=["spreadsheets"])


def _parse_xlsx(content: bytes) -> dict:
    """Parse an xlsx file and return first sheet as grid data."""
    wb = load_workbook(filename=io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        raise ValueError("No active sheet found")

    rows_raw = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows_raw:
        return {"headers": [], "rows": [], "row_count": 0, "col_count": 0}

    # First row = headers
    headers = [str(cell) if cell is not None else "" for cell in rows_raw[0]]
    col_count = len(headers)

    # Data rows
    rows = []
    for row in rows_raw[1:]:
        cells = []
        for cell in row:
            if cell is None:
                cells.append(None)
            elif isinstance(cell, (int, float)):
                cells.append(cell)
            elif isinstance(cell, bool):
                cells.append(cell)
            else:
                cells.append(str(cell))
        # Pad or trim to match header count
        cells = cells[:col_count] + [None] * max(0, col_count - len(cells))
        rows.append(cells)

    return {
        "headers": headers,
        "rows": rows,
        "row_count": len(rows),
        "col_count": col_count,
    }


@router.post("/upload")
async def upload_spreadsheet(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are accepted.")

    storage = get_storage()
    spreadsheet_id = str(uuid.uuid4())
    content = await file.read()

    try:
        grid = _parse_xlsx(content)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid spreadsheet: {exc}")

    storage.upload_spreadsheet(spreadsheet_id, content)
    storage.save_spreadsheet_grid(spreadsheet_id, json.dumps(grid))

    # Save to metadata
    metadata = storage.load_metadata()
    metadata[f"ss:{spreadsheet_id}"] = {
        "filename": file.filename,
        "row_count": grid["row_count"],
        "col_count": grid["col_count"],
    }
    storage.save_metadata(metadata)

    return {
        "spreadsheet_id": spreadsheet_id,
        "filename": file.filename,
        **grid,
    }


@router.get("/{spreadsheet_id}")
async def get_spreadsheet(spreadsheet_id: str):
    storage = get_storage()
    grid_json = storage.get_spreadsheet_grid(spreadsheet_id)
    if grid_json is None:
        raise HTTPException(status_code=404, detail="Spreadsheet not found.")
    grid = json.loads(grid_json)
    metadata = storage.load_metadata()
    meta = metadata.get(f"ss:{spreadsheet_id}", {})
    return {
        "spreadsheet_id": spreadsheet_id,
        "filename": meta.get("filename", "unknown.xlsx"),
        **grid,
    }


@router.get("/{spreadsheet_id}/cell")
async def get_cell(spreadsheet_id: str, col: int, row: int):
    storage = get_storage()
    grid_json = storage.get_spreadsheet_grid(spreadsheet_id)
    if grid_json is None:
        raise HTTPException(status_code=404, detail="Spreadsheet not found.")
    grid = json.loads(grid_json)
    if row < 0 or row >= grid["row_count"]:
        raise HTTPException(status_code=400, detail=f"Row {row} out of range (0-{grid['row_count']-1}).")
    if col < 0 or col >= grid["col_count"]:
        raise HTTPException(status_code=400, detail=f"Col {col} out of range (0-{grid['col_count']-1}).")
    return {"value": grid["rows"][row][col]}


@router.get("/{spreadsheet_id}/range")
async def get_range(spreadsheet_id: str, startCol: int, startRow: int, endCol: int, endRow: int):
    storage = get_storage()
    grid_json = storage.get_spreadsheet_grid(spreadsheet_id)
    if grid_json is None:
        raise HTTPException(status_code=404, detail="Spreadsheet not found.")
    grid = json.loads(grid_json)
    # Clamp to bounds
    sr = max(0, startRow)
    er = min(grid["row_count"], endRow + 1)
    sc = max(0, startCol)
    ec = min(grid["col_count"], endCol + 1)
    values = [row[sc:ec] for row in grid["rows"][sr:er]]
    return {"values": values}
```

- [ ] **Step 2: Register the router in main.py**

Add import and include in `backend/main.py`:

```python
from routers import extract, pdfs, templates, test_runs, controles, klanten, controle_series, spreadsheets
```

And add after the existing router includes:

```python
app.include_router(spreadsheets.router)
```

- [ ] **Step 3: Verify backend starts**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "from main import app; print('Routes:', [r.path for r in app.routes if hasattr(r, 'path')])" | head -5`
Expected: Output includes `/spreadsheets/upload`

- [ ] **Step 4: Commit**

```bash
git add backend/routers/spreadsheets.py backend/main.py
git commit -m "feat: add spreadsheet upload, retrieve, cell, and range API endpoints"
```

---

### Task 5: Backend — Formula engine service

**Files:**
- Create: `backend/services/formula_engine.py`

- [ ] **Step 1: Create the formula engine**

Create `backend/services/formula_engine.py`:

```python
"""Spreadsheet formula evaluation engine.

Evaluates Excel-style formulas against a cached grid using the `formulas` library.
Falls back to a minimal built-in evaluator for basic arithmetic and common functions.
"""

import re
import json
from typing import Any


def _col_letter_to_index(letter: str) -> int:
    """Convert column letter(s) to 0-based index. A=0, B=1, ..., Z=25, AA=26, etc."""
    result = 0
    for char in letter.upper():
        result = result * 26 + (ord(char) - ord('A') + 1)
    return result - 1


def _parse_cell_ref(ref: str) -> tuple[int, int]:
    """Parse a cell reference like 'A1' into (col, row) 0-based indices.
    Row in the ref is 1-based (A1 = col 0, row 0 in grid)."""
    match = re.match(r'^([A-Za-z]+)(\d+)$', ref)
    if not match:
        raise ValueError(f"Invalid cell reference: {ref}")
    col = _col_letter_to_index(match.group(1))
    row = int(match.group(2)) - 1  # Convert to 0-based (row 1 = header, row 2 = data row 0)
    return col, row


def _parse_range_ref(ref: str) -> tuple[int, int, int, int]:
    """Parse a range like 'A1:B10' into (startCol, startRow, endCol, endRow) 0-based."""
    parts = ref.split(':')
    if len(parts) != 2:
        raise ValueError(f"Invalid range reference: {ref}")
    sc, sr = _parse_cell_ref(parts[0])
    ec, er = _parse_cell_ref(parts[1])
    return sc, sr, ec, er


def _get_cell_value(grid: dict, col: int, row: int) -> Any:
    """Get a cell value from the grid. Row 0 = first data row (header excluded)."""
    if row < 0 or row >= grid["row_count"]:
        return None
    if col < 0 or col >= grid["col_count"]:
        return None
    return grid["rows"][row][col]


def _get_range_values(grid: dict, start_col: int, start_row: int, end_col: int, end_row: int) -> list:
    """Get a flat list of values from a range."""
    values = []
    for r in range(start_row, end_row + 1):
        for c in range(start_col, end_col + 1):
            val = _get_cell_value(grid, c, r)
            if val is not None:
                values.append(val)
    return values


def _to_number(val: Any) -> float | None:
    """Try to convert a value to a number."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        cleaned = val.replace(",", "").replace(" ", "")
        for sym in ("$", "€", "£", "¥", "₹"):
            cleaned = cleaned.replace(sym, "")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def evaluate(expression: str, grid: dict) -> str:
    """Evaluate a spreadsheet formula against grid data.

    Args:
        expression: Formula string (e.g. "=SUM(A1:A10)", "=A1*B1")
        grid: Parsed grid dict with keys: headers, rows, row_count, col_count

    Returns:
        String result of the formula evaluation.

    Raises:
        ValueError: If the formula is invalid or cannot be evaluated.
    """
    expr = expression.strip()
    if expr.startswith("="):
        expr = expr[1:]

    # Try using the `formulas` library first
    try:
        return _evaluate_with_formulas(expression, grid)
    except Exception:
        pass

    # Fallback: built-in evaluator for common patterns
    return _evaluate_builtin(expr, grid)


def _evaluate_with_formulas(expression: str, grid: dict) -> str:
    """Evaluate using the formulas library by building a minimal Excel model."""
    import formulas

    expr = expression.strip()
    if not expr.startswith("="):
        expr = "=" + expr

    # Build an Excel model: create a single-sheet workbook in memory
    # Map our grid data to Excel cell references
    xl_model = formulas.ExcelModel().loads(expr).finish()
    
    # Inject cell values into the model's inputs
    inputs = {}
    for r_idx, row in enumerate(grid["rows"]):
        for c_idx, val in enumerate(row):
            if val is not None:
                col_letter = _index_to_col_letter(c_idx)
                cell_ref = f"'{col_letter}{r_idx + 1}'"
                inputs[cell_ref] = val

    result = xl_model.calculate(inputs=inputs)
    
    # Extract the result
    for key, val in result.items():
        if hasattr(val, 'value'):
            val = val.value[0][0] if hasattr(val.value, '__getitem__') else val.value
        if isinstance(val, (int, float)):
            if val == int(val):
                return str(int(val))
            return f"{val:.4f}".rstrip("0").rstrip(".")
        return str(val)
    
    raise ValueError("No result from formulas library")


def _index_to_col_letter(index: int) -> str:
    """Convert 0-based column index to Excel letter. 0=A, 1=B, ..., 25=Z, 26=AA."""
    result = ""
    while True:
        result = chr(ord('A') + index % 26) + result
        index = index // 26 - 1
        if index < 0:
            break
    return result


def _evaluate_builtin(expr: str, grid: dict) -> str:
    """Built-in evaluator for common formulas: SUM, AVERAGE, COUNT, MIN, MAX, IF, ABS, ROUND, basic arithmetic."""

    # Match function calls like SUM(A1:A10)
    func_match = re.match(r'^(\w+)\((.+)\)$', expr, re.IGNORECASE)
    if func_match:
        func_name = func_match.group(1).upper()
        args_str = func_match.group(2)

        if func_name in ("SUM", "AVERAGE", "COUNT", "MIN", "MAX"):
            values = _resolve_args_to_numbers(args_str, grid)
            if not values:
                raise ValueError(f"{func_name}: no numeric values found")
            if func_name == "SUM":
                result = sum(values)
            elif func_name == "AVERAGE":
                result = sum(values) / len(values)
            elif func_name == "COUNT":
                result = float(len(values))
            elif func_name == "MIN":
                result = min(values)
            elif func_name == "MAX":
                result = max(values)
            else:
                raise ValueError(f"Unknown function: {func_name}")
            return _format_number(result)

        if func_name == "ABS":
            val = _resolve_single_value(args_str, grid)
            return _format_number(abs(val))

        if func_name == "ROUND":
            parts = _split_args(args_str)
            val = _resolve_single_value(parts[0], grid)
            decimals = int(float(_resolve_single_value(parts[1], grid))) if len(parts) > 1 else 0
            return _format_number(round(val, decimals))

        if func_name == "IF":
            parts = _split_args(args_str)
            if len(parts) != 3:
                raise ValueError("IF requires 3 arguments: IF(condition, then, else)")
            cond_result = _evaluate_condition(parts[0].strip(), grid)
            if cond_result:
                return _resolve_single_value_str(parts[1].strip(), grid)
            else:
                return _resolve_single_value_str(parts[2].strip(), grid)

        raise ValueError(f"Unsupported function: {func_name}")

    # Basic arithmetic: try to resolve cell references and evaluate
    resolved = _resolve_cell_refs_in_expr(expr, grid)
    try:
        # Safe eval of arithmetic only
        result = _safe_eval(resolved)
        return _format_number(result)
    except Exception as e:
        raise ValueError(f"Cannot evaluate expression '{expr}': {e}")


def _split_args(args_str: str) -> list[str]:
    """Split function arguments, respecting nested parentheses."""
    parts = []
    depth = 0
    current = ""
    for ch in args_str:
        if ch == '(' :
            depth += 1
            current += ch
        elif ch == ')':
            depth -= 1
            current += ch
        elif ch == ',' and depth == 0:
            parts.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        parts.append(current.strip())
    return parts


def _resolve_args_to_numbers(args_str: str, grid: dict) -> list[float]:
    """Resolve comma-separated args (cell refs, ranges, literals) to a flat list of numbers."""
    nums = []
    for arg in _split_args(args_str):
        arg = arg.strip()
        if ':' in arg:
            # Range reference
            sc, sr, ec, er = _parse_range_ref(arg)
            for val in _get_range_values(grid, sc, sr, ec, er):
                n = _to_number(val)
                if n is not None:
                    nums.append(n)
        else:
            # Single cell or literal
            n = _resolve_single_value(arg, grid)
            nums.append(n)
    return nums


def _resolve_single_value(ref: str, grid: dict) -> float:
    """Resolve a single cell reference or literal to a number."""
    ref = ref.strip().strip('"').strip("'")
    # Try as literal number
    n = _to_number(ref)
    if n is not None:
        return n
    # Try as cell reference
    try:
        col, row = _parse_cell_ref(ref)
        val = _get_cell_value(grid, col, row)
        n = _to_number(val)
        if n is not None:
            return n
    except ValueError:
        pass
    raise ValueError(f"Cannot resolve '{ref}' to a number")


def _resolve_single_value_str(ref: str, grid: dict) -> str:
    """Resolve a single cell reference or literal to a string."""
    ref = ref.strip().strip('"').strip("'")
    # Try as cell reference
    try:
        col, row = _parse_cell_ref(ref)
        val = _get_cell_value(grid, col, row)
        return str(val) if val is not None else ""
    except ValueError:
        pass
    # Return as literal
    return ref


def _evaluate_condition(cond_str: str, grid: dict) -> bool:
    """Evaluate a simple condition like 'A1>100'."""
    for op_str, op_fn in [(">=", lambda a, b: a >= b), ("<=", lambda a, b: a <= b),
                           ("!=", lambda a, b: a != b), ("<>", lambda a, b: a != b),
                           (">", lambda a, b: a > b), ("<", lambda a, b: a < b),
                           ("=", lambda a, b: a == b)]:
        if op_str in cond_str:
            parts = cond_str.split(op_str, 1)
            a = _resolve_single_value(parts[0].strip(), grid)
            b = _resolve_single_value(parts[1].strip(), grid)
            return op_fn(a, b)
    raise ValueError(f"Cannot parse condition: {cond_str}")


def _resolve_cell_refs_in_expr(expr: str, grid: dict) -> str:
    """Replace cell references like A1, B2 with their numeric values in an expression."""
    def replacer(match):
        ref = match.group(0)
        try:
            col, row = _parse_cell_ref(ref)
            val = _get_cell_value(grid, col, row)
            n = _to_number(val)
            if n is not None:
                return str(n)
        except ValueError:
            pass
        return ref
    return re.sub(r'[A-Za-z]+\d+', replacer, expr)


def _safe_eval(expr: str) -> float:
    """Safely evaluate an arithmetic expression (numbers and +-*/() only)."""
    # Whitelist: digits, decimal points, operators, parens, whitespace
    if not re.match(r'^[\d\.\+\-\*/\(\)\s]+$', expr):
        raise ValueError(f"Unsafe expression: {expr}")
    return float(eval(expr))  # noqa: S307 — safe because of regex whitelist above


def _format_number(val: float) -> str:
    """Format a numeric result."""
    if val == int(val):
        return str(int(val))
    return f"{val:.4f}".rstrip("0").rstrip(".")
```

- [ ] **Step 2: Verify the engine loads and basic evaluation works**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "
from services.formula_engine import evaluate
grid = {'headers': ['A', 'B'], 'rows': [[10, 20], [30, 40]], 'row_count': 2, 'col_count': 2}
print(evaluate('=SUM(A1:A2)', grid))
print(evaluate('=A1+B1', grid))
print(evaluate('=IF(A1>20, A1, B1)', grid))
"`

Expected:
```
40
30
20
```

- [ ] **Step 3: Commit**

```bash
git add backend/services/formula_engine.py
git commit -m "feat: add formula evaluation engine for spreadsheet formulas"
```

---

### Task 6: Backend — Rule engine integration for spreadsheet operands

**Files:**
- Modify: `backend/services/rule_engine.py`

- [ ] **Step 1: Add grid_data parameter to RuleEngine.__init__**

Update the `__init__` method to accept and store grid data:

```python
    def __init__(
        self,
        current_template_id: str,
        extracted_values: dict[str, str],
        cross_template_values: dict[str, dict[str, str]] | None = None,
        table_values: dict[str, list[dict[str, str]]] | None = None,
        cross_table_values: dict[str, dict[str, list[dict[str, str]]]] | None = None,
        series_context: dict[str, "ControleRunResult"] | None = None,
        grid_data: dict[str, dict] | None = None,  # spreadsheet_id -> parsed grid
    ):
        self.current_template_id = current_template_id
        self.values = extracted_values
        self.computed: dict[str, str] = {}
        self.cross_values = cross_template_values or {}
        self.table_values = table_values or {}
        self.cross_table_values = cross_table_values or {}
        self.series_context = series_context or {}
        self.grid_data = grid_data or {}
```

- [ ] **Step 2: Update resolve_operand to handle formula and range_ref**

Add these cases to the end of the `resolve_operand` method, before the final `return None`:

```python
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
```

- [ ] **Step 3: Add resolve_range method for range_ref operands**

Add this method after `resolve_column`:

```python
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
```

- [ ] **Step 4: Update evaluate_computation to handle range_ref operands for aggregates**

In `evaluate_computation`, update the aggregate section (around `if op in ("agg_sum", ...)`) to also check for `range_ref`:

```python
        if op in ("agg_sum", "agg_average", "agg_count", "agg_min", "agg_max"):
            col_values = None
            if comp.operands and comp.operands[0].type == "column_ref":
                col_values = self.resolve_column(comp.operands[0])
            elif comp.operands and comp.operands[0].type == "range_ref":
                col_values = self.resolve_range(comp.operands[0])
            if col_values is None:
                return None
            # ... rest of aggregate logic stays the same
```

- [ ] **Step 5: Verify rule engine still loads**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "from services.rule_engine import RuleEngine; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/services/rule_engine.py
git commit -m "feat: add formula and range_ref operand resolution to rule engine"
```

---

### Task 7: Backend — Update controle execution to load spreadsheet grids

**Files:**
- Modify: `backend/routers/controles.py`

- [ ] **Step 1: Update run_controle to load grid data and handle spreadsheet files**

Update the `run_controle` endpoint. After loading the controle, load grid data for any spreadsheet files. For spreadsheet files, skip PDF extraction and instead resolve fields directly from the grid.

Add at the top of the function, after the controle is loaded:

```python
    import json as _json

    # Load spreadsheet grid data for any spreadsheet files
    grid_data: dict[str, dict] = {}
    for file_def in controle.files:
        if file_def.fileType == "spreadsheet" and file_def.spreadsheetId:
            grid_json = storage.get_spreadsheet_grid(file_def.spreadsheetId)
            if grid_json:
                grid_data[file_def.spreadsheetId] = _json.loads(grid_json)
```

Update the loop to handle spreadsheet files differently — for spreadsheet files, resolve field values directly from the grid instead of calling `extract_all_fields`:

```python
    for file_def in controle.files:
        if file_def.fileType == "spreadsheet":
            # Resolve spreadsheet fields directly from grid
            ss_id = file_def.spreadsheetId
            grid = grid_data.get(ss_id) if ss_id else None
            field_results = []
            extracted_values: dict[str, str] = {}

            for field in file_def.fields:
                value = ""
                if grid and field.type == "cell" and field.cell_ref:
                    row_val = grid["rows"][field.cell_ref.row][field.cell_ref.col] if field.cell_ref.row < grid["row_count"] and field.cell_ref.col < grid["col_count"] else None
                    value = str(row_val) if row_val is not None else ""
                elif grid and field.type == "cell_range" and field.range_ref:
                    values = []
                    for r in range(field.range_ref.startRow, field.range_ref.endRow + 1):
                        for c in range(field.range_ref.startCol, field.range_ref.endCol + 1):
                            if r < grid["row_count"] and c < grid["col_count"]:
                                val = grid["rows"][r][c]
                                if val is not None:
                                    values.append(str(val))
                    value = ", ".join(values)

                extracted_values[field.label] = value
                from models.schemas import FieldResult as FR, RuleResult
                field_results.append(FR(
                    label=field.label,
                    field_type=field.type,
                    value=value,
                    status="ok" if value else "empty",
                    rule_results=[],
                    step_traces=[],
                ))

            # Run rules for first file
            rule_results = []
            computed_values: dict[str, str] = {}
            if file_def.id == controle.files[0].id and controle.rules:
                from services.rule_engine import RuleEngine
                engine = RuleEngine(
                    current_template_id=controle_id,
                    extracted_values=extracted_values,
                    grid_data=grid_data,
                )
                computed_values, rule_results = engine.evaluate_all(
                    controle.rules, controle.computedFields
                )

            responses.append(ExtractionResponse(
                pdf_id=ss_id or "",
                template_id=controle_id,
                results=field_results,
                needs_review=any(r.status != "ok" for r in field_results),
                template_rule_results=rule_results,
                computed_values=computed_values,
            ))
            continue

        # Existing PDF handling
        pdf_id = data.files.get(file_def.id)
        # ... rest of existing PDF logic
```

- [ ] **Step 2: Update RunControleRequest to accept optional spreadsheet mapping**

The existing `RunControleRequest` maps `file_id -> pdf_id`. For spreadsheet files, no runtime file mapping is needed (data is already stored). Make the files dict values optional or just skip validation for spreadsheet files. Update the PDF lookup:

```python
        # Existing PDF handling (after the spreadsheet `continue`)
        pdf_id = data.files.get(file_def.id)
        if not pdf_id:
            raise HTTPException(
                status_code=400,
                detail=f"Missing PDF for file '{file_def.label}' (id: {file_def.id}).",
            )
```

This already works because spreadsheet files are handled before reaching this code via the `continue` statement.

- [ ] **Step 3: Verify backend starts**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -c "from routers.controles import router; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/routers/controles.py
git commit -m "feat: handle spreadsheet files in controle execution with grid-based field resolution"
```

---

### Task 8: Frontend — Extend TypeScript types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add SheetData, CellRef, and CellRange types**

Add after the existing `ControleFile` interface (around line 309):

```typescript
export interface SheetData {
  headers: string[];
  rows: CellValue[][];
  rowCount: number;
  colCount: number;
}

export type CellValue = string | number | boolean | null;

export interface CellRef {
  col: number;
  row: number;
}

export interface CellRange {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}
```

- [ ] **Step 2: Update ControleFile interface**

Replace the existing `ControleFile` interface:

```typescript
export interface ControleFile {
  id: string;
  label: string;
  fileType: "pdf" | "spreadsheet";
  // PDF-specific
  pdfId: string | null;
  pdfFilename: string | null;
  pageCount: number;
  // Spreadsheet-specific
  spreadsheetId: string | null;
  spreadsheetFilename: string | null;
  sheetData: SheetData | null;
  // Shared
  fields: Field[];
  extractionResults: FieldResult[] | null;
}
```

- [ ] **Step 3: Update Field interface type union**

Update the `type` field and add cell_ref/range_ref to the `Field` interface:

```typescript
export interface Field {
  id: string;
  label: string;
  type: "static" | "dynamic" | "table" | "cell" | "cell_range";
  // ... existing fields ...
  // Spreadsheet cell fields
  cell_ref?: CellRef;
  range_ref?: CellRange;
}
```

- [ ] **Step 4: Update FieldResult field_type**

```typescript
export interface FieldResult {
  label: string;
  field_type: "static" | "dynamic" | "table" | "cell" | "cell_range";
  // ... rest stays the same
}
```

- [ ] **Step 5: Update RuleOperand union**

Add formula and range_ref to the `RuleOperand` type:

```typescript
export type RuleOperand =
  | { type: "field_ref"; ref: FieldRef }
  | { type: "literal"; value: string; datatype?: DataType }
  | { type: "computed_ref"; computed_id: string }
  | { type: "column_ref"; ref: FieldRef; column_label: string }
  | { type: "formula"; expression: string; spreadsheet_id: string }
  | { type: "range_ref"; spreadsheet_id: string; range: CellRange };
```

- [ ] **Step 6: Update RuleNodeType and RuleNodeData**

Add the new node types:

```typescript
export type RuleNodeType = "field_input" | "literal_input" | "math_operation" | "comparison" | "validation" | "condition" | "table_column" | "table_aggregate" | "table_row_filter" | "formula" | "cell_range";
```

Add to `RuleNodeData`:

```typescript
export interface RuleNodeData {
  // ... existing fields ...
  // Spreadsheet formula node
  formulaExpression?: string;
  spreadsheetId?: string;
  // Cell range node
  rangeExpression?: string;  // e.g. "B2:B50"
  cellRange?: CellRange;
}
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: Errors related to usage of old ControleFile shape (no `fileType`), which we'll fix in subsequent tasks. The types file itself should be valid.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add spreadsheet types — SheetData, CellRef, CellRange, formula/range operands, new node types"
```

---

### Task 9: Frontend — API client for spreadsheet endpoints

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add spreadsheet API functions**

Add after the existing `getPageWords` function:

```typescript
// --- Spreadsheets ---

export interface SpreadsheetUploadResponse {
  spreadsheet_id: string;
  filename: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
  row_count: number;
  col_count: number;
}

export async function uploadSpreadsheet(
  file: File,
): Promise<SpreadsheetUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/spreadsheets/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function getSpreadsheet(
  spreadsheetId: string,
): Promise<SpreadsheetUploadResponse> {
  const response = await api.get(`/spreadsheets/${spreadsheetId}`);
  return response.data;
}

export async function getSpreadsheetCell(
  spreadsheetId: string,
  col: number,
  row: number,
): Promise<{ value: string | number | boolean | null }> {
  const response = await api.get(`/spreadsheets/${spreadsheetId}/cell`, {
    params: { col, row },
  });
  return response.data;
}

export async function getSpreadsheetRange(
  spreadsheetId: string,
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
): Promise<{ values: (string | number | boolean | null)[][] }> {
  const response = await api.get(`/spreadsheets/${spreadsheetId}/range`, {
    params: { startCol, startRow, endCol, endRow },
  });
  return response.data;
}
```

- [ ] **Step 2: Update imports in client.ts**

Add `SheetData` to the import from types if needed by other parts later. For now the API functions are self-contained with inline types.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add spreadsheet upload, retrieve, cell, and range API client functions"
```

---

### Task 10: Frontend — Update Zustand store for spreadsheet files

**Files:**
- Modify: `frontend/src/store/appStore.ts`

- [ ] **Step 1: Update ControleFile creation in addWizardFile**

The `addWizardFile` action already accepts a `ControleFile` and stores it. Since we updated the `ControleFile` type to include `fileType`, `spreadsheetId`, `spreadsheetFilename`, and `sheetData`, no changes needed to the action itself — callers will pass the new shape.

- [ ] **Step 2: Update loadFileIntoStore to handle spreadsheet files**

The current `loadFileIntoStore` sets `pdfId`, `pdfFilename`, `pageCount`. For spreadsheet files, these PDF-specific fields don't apply. Update the method:

```typescript
  loadFileIntoStore: (fileId) =>
    set((state) => {
      if (!state.wizardControle) return {};
      const file = state.wizardControle.files.find((f) => f.id === fileId);
      if (!file) return {};
      return {
        wizardActiveFileId: fileId,
        pdfId: file.fileType === "pdf" ? file.pdfId : null,
        pdfFilename: file.fileType === "pdf" ? file.pdfFilename : null,
        pageCount: file.fileType === "pdf" ? file.pageCount : 0,
        currentPage: 1,
        fields: file.fields,
        extractionResults: file.extractionResults,
        editingFieldId: null,
        chainEditFieldId: null,
        drawingRegionForStepId: null,
        pendingAnchor: null,
        templateMode: "single" as const,
      };
    }),
```

- [ ] **Step 3: Update canProceed check — extraction not needed for spreadsheets**

This is handled in the `WizardBestandenTab` component (Task 11), not the store. No store changes needed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/appStore.ts
git commit -m "feat: update store loadFileIntoStore to handle spreadsheet file type"
```

---

### Task 11: Frontend — Update WizardBestandenTab for spreadsheet upload

**Files:**
- Modify: `frontend/src/components/wizard/WizardBestandenTab.tsx`

- [ ] **Step 1: Update imports**

Add the spreadsheet upload function and icon:

```typescript
import { uploadPdf, uploadSpreadsheet } from "@/api/client";
import { Trash2, Upload, FileText, Loader2, ChevronRight, ArrowLeft, Check, Sheet } from "lucide-react";
```

Note: `Sheet` icon from lucide. If not available, use `Table2` or `FileSpreadsheet`.

- [ ] **Step 2: Update handleFiles to accept both PDF and XLSX**

Replace the `handleFiles` callback:

```typescript
  const handleFiles = useCallback(
    async (fileList: File[]) => {
      const validFiles = fileList.filter(
        (f) => f.type === "application/pdf" ||
               f.name.toLowerCase().endsWith(".xlsx") ||
               f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      if (validFiles.length === 0) {
        setError("Alleen PDF- of Excel-bestanden (.xlsx) zijn toegestaan.");
        return;
      }
      setError(null);
      setIsUploading(true);
      try {
        for (const file of validFiles) {
          const isSpreadsheet = file.name.toLowerCase().endsWith(".xlsx") ||
            file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

          if (isSpreadsheet) {
            const res = await uploadSpreadsheet(file);
            const baseName = file.name.replace(/\.xlsx$/i, "");
            const newFile: ControleFile = {
              id: crypto.randomUUID(),
              label: baseName,
              fileType: "spreadsheet",
              pdfId: null,
              pdfFilename: null,
              pageCount: 0,
              spreadsheetId: res.spreadsheet_id,
              spreadsheetFilename: file.name,
              sheetData: {
                headers: res.headers,
                rows: res.rows,
                rowCount: res.row_count,
                colCount: res.col_count,
              },
              fields: [],
              extractionResults: null,
            };
            onAddFile(newFile);
          } else {
            const { pdf_id, page_count } = await uploadPdf(file);
            const baseName = file.name.replace(/\.pdf$/i, "");
            const newFile: ControleFile = {
              id: crypto.randomUUID(),
              label: baseName,
              fileType: "pdf",
              pdfId: pdf_id,
              pdfFilename: file.name,
              pageCount: page_count,
              spreadsheetId: null,
              spreadsheetFilename: null,
              sheetData: null,
              fields: [],
              extractionResults: null,
            };
            onAddFile(newFile);
          }
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Upload mislukt. Draait de backend?";
        setError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [onAddFile],
  );
```

- [ ] **Step 3: Update canProceed logic to skip extraction check for spreadsheets**

Replace the `canProceed` logic:

```typescript
  const allHaveResults = files.every((f) => {
    if (f.fileType === "spreadsheet") return true; // No extraction needed
    return f.extractionResults !== null && f.extractionResults.length > 0;
  });
  const canProceed = files.length > 0 && files.every((f) => {
    if (f.fileType === "spreadsheet") {
      return f.spreadsheetId !== null && f.label.trim().length > 0;
    }
    return f.pdfId !== null && f.label.trim().length > 0;
  }) && allHaveResults;
```

- [ ] **Step 4: Update dropzone text and file input accept**

Update the dropzone label and file input:

Change `"Alleen PDF-bestanden"` to `"PDF of Excel (.xlsx)"`.
Change `"Sleep PDF-bestanden hierheen of klik om te uploaden"` to `"Sleep bestanden hierheen of klik om te uploaden"`.
Update the file input `accept` attribute:

```tsx
      <input
        id="wizard-pdf-input"
        type="file"
        accept="application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
      />
```

- [ ] **Step 5: Update file card to show spreadsheet icon and info**

In the file card, update the icon and filename display based on `fileType`:

```tsx
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {file.fileType === "spreadsheet" ? (
                        <Sheet className="h-5 w-5 text-primary" />
                      ) : (
                        <FileText className="h-5 w-5 text-primary" />
                      )}
                    </div>
```

And for the filename:

```tsx
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {file.fileType === "spreadsheet" ? file.spreadsheetFilename : file.pdfFilename}
                    </p>
```

- [ ] **Step 6: Route "Bewerken" to SpreadsheetViewer for spreadsheet files**

In the `activeFileId` section, conditionally render the SpreadsheetViewer instead of WizardFileTab. Import at the top:

```typescript
import { SpreadsheetViewer } from "@/components/SpreadsheetViewer";
```

Replace the viewer section (when `activeFileId` is set):

```tsx
  if (activeFileId) {
    const activeFile = files.find((f) => f.id === activeFileId);
    const isSpreadsheet = activeFile?.fileType === "spreadsheet";
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onCloseFile} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Bestanden
          </Button>
          <span className="text-sm font-medium text-foreground">
            {activeFile?.label || "Bestand"}
          </span>
          <span className="text-xs text-muted-foreground">
            {activeFile?.fields.length ?? 0} veld{(activeFile?.fields.length ?? 0) !== 1 ? "en" : ""}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          {isSpreadsheet ? (
            <SpreadsheetViewer key={activeFileId} fileId={activeFileId} />
          ) : (
            <WizardFileTab key={activeFileId} fileId={activeFileId} />
          )}
        </div>
      </div>
    );
  }
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/wizard/WizardBestandenTab.tsx
git commit -m "feat: update Bestanden tab to accept xlsx uploads and route to SpreadsheetViewer"
```

---

### Task 12: Frontend — SpreadsheetViewer component

**Files:**
- Create: `frontend/src/components/SpreadsheetViewer.tsx`

- [ ] **Step 1: Create the SpreadsheetViewer component**

Create `frontend/src/components/SpreadsheetViewer.tsx`:

```tsx
import { useState, useCallback, useRef } from "react";
import { useAppStore } from "@/store/appStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Check } from "lucide-react";
import type { Field, CellRef, CellRange } from "@/types";

interface SpreadsheetViewerProps {
  fileId: string;
}

export function SpreadsheetViewer({ fileId }: SpreadsheetViewerProps) {
  const wizardControle = useAppStore((s) => s.wizardControle);
  const file = wizardControle?.files.find((f) => f.id === fileId);
  const fields = useAppStore((s) => s.fields);
  const addField = useAppStore((s) => s.addField);
  const removeField = useAppStore((s) => s.removeField);
  const updateFieldLabel = useAppStore((s) => s.updateFieldLabel);

  const [dragStart, setDragStart] = useState<{ col: number; row: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ col: number; row: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  if (!file || !file.sheetData) {
    return <div className="p-6 text-muted-foreground">Geen spreadsheet data beschikbaar.</div>;
  }

  const { headers, rows } = file.sheetData;

  const isCellSelected = useCallback(
    (col: number, row: number) => {
      return fields.some((f) => {
        if (f.type === "cell" && f.cell_ref) {
          return f.cell_ref.col === col && f.cell_ref.row === row;
        }
        if (f.type === "cell_range" && f.range_ref) {
          const r = f.range_ref;
          return col >= r.startCol && col <= r.endCol && row >= r.startRow && row <= r.endRow;
        }
        return false;
      });
    },
    [fields],
  );

  const isInDragSelection = useCallback(
    (col: number, row: number) => {
      if (!isDragging || !dragStart || !dragEnd) return false;
      const minCol = Math.min(dragStart.col, dragEnd.col);
      const maxCol = Math.max(dragStart.col, dragEnd.col);
      const minRow = Math.min(dragStart.row, dragEnd.row);
      const maxRow = Math.max(dragStart.row, dragEnd.row);
      return col >= minCol && col <= maxCol && row >= minRow && row <= maxRow;
    },
    [isDragging, dragStart, dragEnd],
  );

  const handleMouseDown = useCallback((col: number, row: number) => {
    setDragStart({ col, row });
    setDragEnd({ col, row });
    setIsDragging(true);
  }, []);

  const handleMouseEnter = useCallback(
    (col: number, row: number) => {
      if (isDragging) {
        setDragEnd({ col, row });
      }
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false);
      return;
    }

    const minCol = Math.min(dragStart.col, dragEnd.col);
    const maxCol = Math.max(dragStart.col, dragEnd.col);
    const minRow = Math.min(dragStart.row, dragEnd.row);
    const maxRow = Math.max(dragStart.row, dragEnd.row);

    const isSingleCell = minCol === maxCol && minRow === maxRow;

    if (isSingleCell) {
      // Toggle single cell selection
      const existing = fields.find(
        (f) => f.type === "cell" && f.cell_ref?.col === minCol && f.cell_ref?.row === minRow,
      );
      if (existing) {
        removeField(existing.id);
      } else {
        const header = headers[minCol] || `Col${minCol}`;
        const newField: Field = {
          id: crypto.randomUUID(),
          label: `${header}_R${minRow + 1}`,
          type: "cell",
          anchor_mode: "static",
          anchors: [],
          value_region: { page: 1, x: 0, y: 0, width: 0, height: 0 },
          rules: [],
          chain: [],
          cell_ref: { col: minCol, row: minRow },
        };
        addField(newField);
      }
    } else {
      // Create range selection
      const startHeader = headers[minCol] || `Col${minCol}`;
      const endHeader = headers[maxCol] || `Col${maxCol}`;
      const rangeLabel = minCol === maxCol
        ? `${startHeader}_R${minRow + 1}:R${maxRow + 1}`
        : `${startHeader}:${endHeader}_R${minRow + 1}:R${maxRow + 1}`;
      const newField: Field = {
        id: crypto.randomUUID(),
        label: rangeLabel,
        type: "cell_range",
        anchor_mode: "static",
        anchors: [],
        value_region: { page: 1, x: 0, y: 0, width: 0, height: 0 },
        rules: [],
        chain: [],
        range_ref: {
          startCol: minCol,
          startRow: minRow,
          endCol: maxCol,
          endRow: maxRow,
        },
      };
      addField(newField);
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, fields, headers, addField, removeField]);

  return (
    <div className="flex h-full">
      {/* Spreadsheet grid */}
      <div
        className="flex-1 overflow-auto p-4"
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (isDragging) handleMouseUp();
        }}
      >
        <table
          ref={tableRef}
          className="border-collapse text-sm w-full select-none"
        >
          <thead>
            <tr>
              <th className="sticky top-0 z-10 bg-muted border border-border px-2 py-1.5 text-left text-xs font-medium text-muted-foreground w-10">
                #
              </th>
              {headers.map((header, colIdx) => (
                <th
                  key={colIdx}
                  className="sticky top-0 z-10 bg-muted border border-border px-3 py-1.5 text-left text-xs font-semibold text-foreground min-w-[100px]"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-muted/30">
                <td className="border border-border px-2 py-1 text-xs text-muted-foreground text-center bg-muted/50">
                  {rowIdx + 1}
                </td>
                {row.map((cell, colIdx) => {
                  const selected = isCellSelected(colIdx, rowIdx);
                  const inDrag = isInDragSelection(colIdx, rowIdx);
                  return (
                    <td
                      key={colIdx}
                      className={`border border-border px-3 py-1 text-xs cursor-pointer transition-colors ${
                        selected
                          ? "bg-primary/20 border-primary/50"
                          : inDrag
                            ? "bg-blue-100 dark:bg-blue-900/30"
                            : "hover:bg-muted/50"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleMouseDown(colIdx, rowIdx);
                      }}
                      onMouseEnter={() => handleMouseEnter(colIdx, rowIdx)}
                    >
                      {cell !== null && cell !== undefined ? String(cell) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected fields panel */}
      <div className="w-64 border-l border-border bg-card overflow-y-auto p-3 space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Geselecteerde velden ({fields.length})
        </h3>
        {fields.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Klik op een cel of sleep over meerdere cellen om velden te selecteren.
          </p>
        )}
        {fields.map((field) => (
          <div
            key={field.id}
            className="flex items-center gap-2 p-2 rounded-md border border-border bg-background"
          >
            <div className="flex-1 min-w-0">
              <Input
                value={field.label}
                onChange={(e) => updateFieldLabel(field.id, e.target.value)}
                className="h-6 text-xs border-transparent bg-transparent px-0 hover:bg-muted/50 hover:px-1 focus:bg-background focus:px-1 focus:border-border transition-all"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {field.type === "cell" && field.cell_ref
                  ? `Cel (${field.cell_ref.col}, ${field.cell_ref.row})`
                  : field.type === "cell_range" && field.range_ref
                    ? `Bereik (${field.range_ref.startCol},${field.range_ref.startRow}):(${field.range_ref.endCol},${field.range_ref.endRow})`
                    : field.type}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => removeField(field.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit 2>&1 | grep SpreadsheetViewer`
Expected: No errors specific to SpreadsheetViewer

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SpreadsheetViewer.tsx
git commit -m "feat: add SpreadsheetViewer with cell/range selection and fields panel"
```

---

### Task 13: Frontend — New canvas nodes (FormulaNode, CellRangeNode)

**Files:**
- Modify: `frontend/src/components/rules/RuleNodes.tsx`

- [ ] **Step 1: Add FormulaNode component**

Add before the `nodeTypes` export:

```tsx
/* ── Formula Node (Spreadsheet) ── */

export const FormulaNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.formulaExpression || '');

  const commit = useCallback(() => {
    const val = draft.trim();
    setEditing(false);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, formulaExpression: val } } : n
      )
    );
  }, [id, draft, setNodes]);

  return (
    <div className="px-2.5 py-1.5 rounded-md border shadow-sm max-w-[220px] border-green-400 bg-green-50 dark:bg-green-950/50">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-green-600 dark:text-green-400 leading-none mb-0.5">
        Formula
      </div>
      <Handle type="target" position={Position.Left} className={`${HANDLE} !bg-green-500`} />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(data.formulaExpression || ''); setEditing(false); }
          }}
          placeholder="=SUM(A1:A10)"
          className="text-xs bg-transparent border-b border-green-400/30 outline-none w-full font-mono"
        />
      ) : (
        <div
          className="text-xs font-mono text-foreground truncate cursor-text hover:opacity-70"
          onDoubleClick={() => { setDraft(data.formulaExpression || ''); setEditing(true); }}
          title="Double-click to edit formula"
        >
          {data.formulaExpression || <span className="opacity-40 italic">formula...</span>}
        </div>
      )}
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-green-600/70 dark:text-green-400/70" />
      {data.lastValue !== undefined && (
        <div className="text-[10px] text-muted-foreground truncate" title={data.lastValue}>= {data.lastValue}</div>
      )}
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-green-500`} />
    </div>
  );
});
FormulaNode.displayName = 'FormulaNode';
```

- [ ] **Step 2: Add CellRangeNode component**

Add before the `nodeTypes` export:

```tsx
/* ── Cell Range Node (Spreadsheet) ── */

export const CellRangeNode = memo(({ id, data }: NodeProps & { data: RuleNodeData }) => {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.rangeExpression || '');

  const commit = useCallback(() => {
    const val = draft.trim();
    setEditing(false);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, rangeExpression: val } } : n
      )
    );
  }, [id, draft, setNodes]);

  return (
    <div className="px-2.5 py-1.5 rounded-md border shadow-sm max-w-[180px] border-green-400 bg-green-50 dark:bg-green-950/50">
      <div className="text-[8px] uppercase tracking-wider font-semibold text-green-600 dark:text-green-400 leading-none mb-0.5">
        Cell Range
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(data.rangeExpression || ''); setEditing(false); }
          }}
          placeholder="B2:B50"
          className="text-xs bg-transparent border-b border-green-400/30 outline-none w-full font-mono"
        />
      ) : (
        <div
          className="text-xs font-mono text-foreground truncate cursor-text hover:opacity-70"
          onDoubleClick={() => { setDraft(data.rangeExpression || ''); setEditing(true); }}
          title="Double-click to edit range"
        >
          {data.rangeExpression || <span className="opacity-40 italic">range...</span>}
        </div>
      )}
      <EditableName id={id} name={data.outputLabel} textClass="text-[9px] text-green-600/70 dark:text-green-400/70" />
      <Handle type="source" position={Position.Right} className={`${HANDLE} !bg-green-500`} />
    </div>
  );
});
CellRangeNode.displayName = 'CellRangeNode';
```

- [ ] **Step 3: Register new nodes in nodeTypes**

Update the `nodeTypes` export:

```typescript
export const nodeTypes = {
  field_input: FieldInputNode,
  literal_input: LiteralInputNode,
  math_operation: MathOperationNode,
  comparison: ComparisonNode,
  validation: ValidationNode,
  condition: ConditionNode,
  table_column: TableColumnNode,
  table_aggregate: TableAggregateNode,
  table_row_filter: TableRowFilterNode,
  formula: FormulaNode,
  cell_range: CellRangeNode,
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/rules/RuleNodes.tsx
git commit -m "feat: add FormulaNode and CellRangeNode canvas node components"
```

---

### Task 14: Frontend — Update RulesPanel (menu, auto-import, connection rules)

**Files:**
- Modify: `frontend/src/components/rules/RulesPanel.tsx`

- [ ] **Step 1: Add Spreadsheet category to NODE_MENU_ITEMS**

Add after the Table entries in `NODE_MENU_ITEMS`:

```typescript
  // Spreadsheet
  { type: 'formula', label: 'Formula', category: 'Spreadsheet', icon: <Sigma className={ICN} />, defaults: { formulaExpression: '' } },
  { type: 'cell_range', label: 'Cell Range', category: 'Spreadsheet', icon: <BarChart3 className={ICN} />, defaults: { rangeExpression: '' } },
```

- [ ] **Step 2: Add Spreadsheet to CATEGORIES and CATEGORY_COLORS**

```typescript
const CATEGORIES = ['Input', 'Math', 'Logic', 'Validate', 'Conditionals', 'Table', 'Spreadsheet'];

const CATEGORY_COLORS: Record<string, string> = {
  Input: 'text-slate-600 dark:text-slate-400',
  Math: 'text-blue-600 dark:text-blue-400',
  Logic: 'text-amber-600 dark:text-amber-400',
  Validate: 'text-purple-600 dark:text-purple-400',
  Conditionals: 'text-orange-600 dark:text-orange-400',
  Table: 'text-teal-600 dark:text-teal-400',
  Spreadsheet: 'text-green-600 dark:text-green-400',
};
```

- [ ] **Step 3: Auto-import spreadsheet columns as field_input nodes**

In the `fieldNodes` useMemo (around line 151), the existing logic already creates field_input nodes from all fields loaded by `loadAllFieldsForRules`. Spreadsheet columns auto-import happens in `loadAllFieldsForRules` — the Regels tab already calls this. But we also need to create field_input nodes for spreadsheet *column headers* when entering Regels.

Add a new `useEffect` after the field sync effect to auto-create column field_input nodes for spreadsheet files:

```typescript
  // Auto-import spreadsheet column headers as field_input nodes
  const wizardControle = useAppStore((s) => s.wizardControle);
  const spreadsheetColumnsImported = useRef(false);

  useEffect(() => {
    if (spreadsheetColumnsImported.current || !wizardControle) return;
    const ssFiles = wizardControle.files.filter((f) => f.fileType === "spreadsheet" && f.sheetData);
    if (ssFiles.length === 0) return;

    const existingFieldIds = new Set(ruleNodes.filter(n => n.id.startsWith('field-')).map(n => n.id));
    const newNodes: typeof ruleNodes = [];

    for (const file of ssFiles) {
      if (!file.sheetData) continue;
      file.sheetData.headers.forEach((header, colIdx) => {
        const nodeId = `field-ss-${file.id}-col-${colIdx}`;
        if (existingFieldIds.has(nodeId)) return;
        newNodes.push({
          id: nodeId,
          type: 'field_input' as const,
          position: { x: 0, y: (existingFieldIds.size + newNodes.length) * 80 },
          data: {
            label: header,
            nodeType: 'field_input' as const,
            fieldRef: {
              field_label: header,
              file_id: file.id,
              file_label: file.label,
            },
            literalDatatype: 'string',
            fieldType: 'cell_range',  // Represents full column
          } as RuleNodeData,
        });
      });
    }

    if (newNodes.length > 0) {
      setRuleNodes([...ruleNodes, ...newNodes]);
      spreadsheetColumnsImported.current = true;
    }
  }, [wizardControle, ruleNodes, setRuleNodes]);
```

- [ ] **Step 4: Update isValidConnection for new node types**

Add connection rules for formula and cell_range nodes in `isValidConnection`:

```typescript
      // Formula node output can connect to math, comparison, validation, condition
      // (no restrictions needed — it outputs a value like any other computation)

      // Cell range output can connect to aggregate nodes, table nodes, or formula
      if (src?.type === 'cell_range') {
        return tgt?.type === 'table_aggregate' || tgt?.type === 'math_operation' || tgt?.type === 'formula';
      }

      return true;
```

- [ ] **Step 5: Conditionally show Spreadsheet category only when spreadsheet files exist**

In the add menu rendering, filter the Spreadsheet category to only show when the control has a spreadsheet file. Update the categories list used for rendering:

```typescript
  const visibleCategories = useMemo(() => {
    const hasSpreadsheet = wizardControle?.files.some((f) => f.fileType === "spreadsheet");
    if (hasSpreadsheet) return CATEGORIES;
    return CATEGORIES.filter((c) => c !== 'Spreadsheet');
  }, [wizardControle]);
```

Then use `visibleCategories` instead of `CATEGORIES` where the menu tabs are rendered.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/rules/RulesPanel.tsx
git commit -m "feat: add Spreadsheet category to rules canvas with auto-import and connection rules"
```

---

### Task 15: Frontend — Update serializeGraph for new node types

**Files:**
- Modify: `frontend/src/components/rules/serializeGraph.ts`

- [ ] **Step 1: Update operandFromNode to handle formula and cell_range nodes**

In the `operandFromNode` function, add cases for the new node types:

```typescript
  if (node.type === 'formula') {
    return { type: 'computed_ref' as const, computed_id: node.id };
  }
  if (node.type === 'cell_range') {
    return { type: 'computed_ref' as const, computed_id: node.id };
  }
```

Add these before the final `return null`.

- [ ] **Step 2: Add serialization for formula nodes in serializeGraph**

Add in the main `for (const node of nodes)` loop:

```typescript
    if (node.type === 'formula') {
      const name = getNodeName(data, `formula(${(data.formulaExpression || '').slice(0, 20)})`);
      const spreadsheetId = data.spreadsheetId || '';

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: 'add' as MathOperation,  // placeholder — formula eval overrides
          operands: [{
            type: 'formula' as const,
            expression: data.formulaExpression || '',
            spreadsheet_id: spreadsheetId,
          } as unknown as RuleOperand],
          output_label: name,
          output_datatype: data.outputDatatype,
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
        datatype: data.outputDatatype,
      });
    }

    if (node.type === 'cell_range') {
      const name = getNodeName(data, `range(${data.rangeExpression || '?'})`);
      const spreadsheetId = data.spreadsheetId || '';

      // Parse range expression like "B2:B50" to CellRange
      // For now, store as a computation with range_ref operand
      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: 'sum' as MathOperation,  // default aggregate
          operands: [{
            type: 'range_ref' as const,
            spreadsheet_id: spreadsheetId,
            range: data.cellRange || { startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
          } as unknown as RuleOperand],
          output_label: name,
          output_datatype: data.outputDatatype,
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
        datatype: data.outputDatatype,
      });
    }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/rules/serializeGraph.ts
git commit -m "feat: serialize formula and cell_range nodes to rule operands"
```

---

### Task 16: Fix compilation errors and verify end-to-end

**Files:**
- Various (fix TypeScript errors from ControleFile shape changes)

- [ ] **Step 1: Run TypeScript compiler and identify all errors**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit 2>&1 | head -50`
Review the errors. Common issues will be:
- Places that create `ControleFile` without the new required fields (`fileType`, `spreadsheetId`, etc.)
- Code referencing `f.pdfId` without checking `fileType`

- [ ] **Step 2: Fix each error**

For each file creating a `ControleFile`, add the new default fields:

```typescript
// Default for PDF files (existing code that creates ControleFile):
{
  fileType: "pdf",
  spreadsheetId: null,
  spreadsheetFilename: null,
  sheetData: null,
  // ... existing fields
}
```

Check files like:
- `appStore.ts` (initWizard when loading existing controles — existing data won't have `fileType`, so default to `"pdf"`)
- Any other component that creates `ControleFile` objects

For existing controles loaded from backend that don't have `fileType`, add a migration in `initWizard`:

```typescript
  initWizard: (controle, name, klantId, klantName) => {
    if (controle) {
      // Migrate old ControleFile objects that lack fileType
      const migratedFiles = controle.files.map((f) => ({
        ...f,
        fileType: f.fileType || "pdf" as const,
        spreadsheetId: f.spreadsheetId ?? null,
        spreadsheetFilename: f.spreadsheetFilename ?? null,
        sheetData: f.sheetData ?? null,
      }));
      set({
        wizardControle: { ...controle, files: migratedFiles },
        // ... rest stays the same
      });
```

- [ ] **Step 3: Verify TypeScript compiles clean**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify frontend builds**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Verify backend starts**

Run: `cd /Users/alladin/Repositories/bcs/backend && timeout 5 python -m uvicorn main:app --host 0.0.0.0 --port 8099 2>&1 || true`
Expected: Server starts without import errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: resolve TypeScript compilation errors from spreadsheet type changes"
```

---

### Task 17: Manual smoke test

- [ ] **Step 1: Start backend**

Run: `cd /Users/alladin/Repositories/bcs/backend && python -m uvicorn main:app --reload --port 8000`

- [ ] **Step 2: Start frontend**

Run: `cd /Users/alladin/Repositories/bcs/frontend && npm run dev`

- [ ] **Step 3: Test spreadsheet upload**

1. Navigate to Controles → New
2. In the Bestanden tab, upload a `.xlsx` file
3. Verify the file card shows with a spreadsheet icon
4. Click "Bewerken" → verify SpreadsheetViewer opens
5. Click cells → verify fields appear in the side panel
6. Drag to select a range → verify range field is created
7. Go back to Bestanden → verify "Volgende" button is enabled

- [ ] **Step 4: Test rules canvas**

1. Navigate to the Regels tab
2. Verify spreadsheet column headers auto-appear as field_input nodes
3. Add a Formula node from the Spreadsheet category
4. Double-click to enter a formula like `=SUM(A1:A10)`
5. Add a Cell Range node, enter a range
6. Wire nodes together
7. Save as draft, then publish and run

- [ ] **Step 5: Test that PDF flow still works**

1. Create a new controle with a PDF file
2. Verify the existing PDF workflow is unchanged
3. Fields, extraction, rules all work as before
