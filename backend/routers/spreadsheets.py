import io
import json
import uuid

import openpyxl
from fastapi import APIRouter, HTTPException, UploadFile

from services.storage_backend import get_storage

router = APIRouter(prefix="/spreadsheets", tags=["spreadsheets"])


def _parse_spreadsheet(content: bytes) -> dict:
    """Parse an .xlsx file and return a grid dict with headers and rows."""
    wb = openpyxl.load_workbook(filename=io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)

    # First row = headers
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return {"headers": [], "rows": []}

    headers = [str(h) if h is not None else "" for h in header_row]
    col_count = len(headers)

    rows = []
    for raw_row in rows_iter:
        cells = list(raw_row)
        # Pad or trim to match header count
        if len(cells) < col_count:
            cells = cells + [None] * (col_count - len(cells))
        else:
            cells = cells[:col_count]

        # Preserve types: int, float, bool, str, None
        processed = []
        for cell in cells:
            if cell is None:
                processed.append(None)
            elif isinstance(cell, bool):
                processed.append(cell)
            elif isinstance(cell, int):
                processed.append(cell)
            elif isinstance(cell, float):
                processed.append(cell)
            else:
                processed.append(str(cell))
        rows.append(processed)

    wb.close()

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

    # Store raw file
    storage.upload_spreadsheet(spreadsheet_id, content)

    # Parse and cache grid
    try:
        grid = _parse_spreadsheet(content)
    except Exception as exc:
        storage.delete_spreadsheet(spreadsheet_id)
        raise HTTPException(status_code=400, detail=f"Invalid spreadsheet file: {exc}")

    grid_json = json.dumps(grid)
    storage.save_spreadsheet_grid(spreadsheet_id, grid_json)

    # Save metadata with ss: prefix to namespace from PDFs
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
        "headers": grid["headers"],
        "rows": grid["rows"],
        "row_count": grid["row_count"],
        "col_count": grid["col_count"],
    }


@router.get("/{spreadsheet_id}")
async def get_spreadsheet(spreadsheet_id: str):
    storage = get_storage()
    if not storage.spreadsheet_exists(spreadsheet_id):
        raise HTTPException(status_code=404, detail="Spreadsheet not found.")

    grid_json = storage.get_spreadsheet_grid(spreadsheet_id)
    if grid_json is None:
        raise HTTPException(status_code=404, detail="Spreadsheet grid not found.")

    grid = json.loads(grid_json)

    metadata = storage.load_metadata()
    meta = metadata.get(f"ss:{spreadsheet_id}", {})

    return {
        "spreadsheet_id": spreadsheet_id,
        "filename": meta.get("filename", f"{spreadsheet_id}.xlsx"),
        "headers": grid.get("headers", []),
        "rows": grid.get("rows", []),
        "row_count": grid.get("row_count", 0),
        "col_count": grid.get("col_count", 0),
    }


@router.get("/{spreadsheet_id}/cell")
async def get_cell(spreadsheet_id: str, col: int, row: int):
    """Return a single cell value. col and row are 0-based indices."""
    storage = get_storage()
    if not storage.spreadsheet_exists(spreadsheet_id):
        raise HTTPException(status_code=404, detail="Spreadsheet not found.")

    grid_json = storage.get_spreadsheet_grid(spreadsheet_id)
    if grid_json is None:
        raise HTTPException(status_code=404, detail="Spreadsheet grid not found.")

    grid = json.loads(grid_json)
    rows = grid.get("rows", [])
    headers = grid.get("headers", [])

    if row < 0 or row >= len(rows):
        raise HTTPException(status_code=400, detail=f"Row index {row} out of range (0-{len(rows) - 1}).")
    if col < 0 or col >= len(headers):
        raise HTTPException(status_code=400, detail=f"Col index {col} out of range (0-{len(headers) - 1}).")

    value = rows[row][col]
    return {"col": col, "row": row, "value": value}


@router.get("/{spreadsheet_id}/range")
async def get_range(spreadsheet_id: str, startCol: int, startRow: int, endCol: int, endRow: int):
    """Return a sub-grid of values. All indices are 0-based and inclusive."""
    storage = get_storage()
    if not storage.spreadsheet_exists(spreadsheet_id):
        raise HTTPException(status_code=404, detail="Spreadsheet not found.")

    grid_json = storage.get_spreadsheet_grid(spreadsheet_id)
    if grid_json is None:
        raise HTTPException(status_code=404, detail="Spreadsheet grid not found.")

    grid = json.loads(grid_json)
    rows = grid.get("rows", [])
    headers = grid.get("headers", [])

    row_count = len(rows)
    col_count = len(headers)

    # Clamp to valid bounds
    startRow = max(0, startRow)
    startCol = max(0, startCol)
    endRow = min(endRow, row_count - 1)
    endCol = min(endCol, col_count - 1)

    if startRow > endRow or startCol > endCol:
        return {"startCol": startCol, "startRow": startRow, "endCol": endCol, "endRow": endRow, "values": []}

    values = [
        row[startCol:endCol + 1]
        for row in rows[startRow:endRow + 1]
    ]

    return {
        "startCol": startCol,
        "startRow": startRow,
        "endCol": endCol,
        "endRow": endRow,
        "values": values,
    }
