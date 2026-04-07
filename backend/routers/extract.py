import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.schemas import (
    ExtractionRequest, ExtractionResponse, TestRequest,
    TemplateRule, ComputedField, ControleFile, FieldResult, TemplateRuleResult,
)
from services.extraction_service import extract_all_fields
from services.rule_engine import RuleEngine, collect_cross_template_refs, resolve_cross_template_values
from services.storage_backend import get_storage
from services.template_store import get_template

router = APIRouter(tags=["extract"])


@router.post("/extract", response_model=ExtractionResponse)
async def extract_data(request: ExtractionRequest):
    template = get_template(request.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found.")

    storage = get_storage()
    if not storage.pdf_exists(request.pdf_id):
        raise HTTPException(status_code=404, detail="PDF not found.")

    pdf_path_b = None
    if request.pdf_id_b:
        if not storage.pdf_exists(request.pdf_id_b):
            raise HTTPException(status_code=404, detail="PDF B not found.")

    with storage.pdf_temp_path(request.pdf_id) as pdf_path:
        if request.pdf_id_b:
            with storage.pdf_temp_path(request.pdf_id_b) as path_b:
                pdf_path_b = path_b
                results, rule_results, computed_values = extract_all_fields(
                    pdf_path, template.fields, pdf_path_b,
                    template_rules=template.rules,
                    computed_fields=template.computed_fields,
                    template_id=template.id,
                )
        else:
            results, rule_results, computed_values = extract_all_fields(
                pdf_path, template.fields, None,
                template_rules=template.rules,
                computed_fields=template.computed_fields,
                template_id=template.id,
            )

    needs_review = any(r.status not in ("ok",) for r in results)

    return ExtractionResponse(
        pdf_id=request.pdf_id,
        template_id=request.template_id,
        results=results,
        needs_review=needs_review,
        pdf_id_b=request.pdf_id_b,
        template_rule_results=rule_results,
        computed_values=computed_values,
    )


@router.post("/test", response_model=ExtractionResponse)
async def test_extraction(request: TestRequest):
    storage = get_storage()
    if not storage.pdf_exists(request.pdf_id):
        raise HTTPException(status_code=404, detail="PDF not found.")

    if request.pdf_id_b and not storage.pdf_exists(request.pdf_id_b):
        raise HTTPException(status_code=404, detail="PDF B not found.")

    with storage.pdf_temp_path(request.pdf_id) as pdf_path:
        if request.pdf_id_b:
            with storage.pdf_temp_path(request.pdf_id_b) as path_b:
                results, rule_results, computed_values = extract_all_fields(
                    pdf_path, request.fields, path_b,
                    template_rules=request.rules,
                    computed_fields=request.computed_fields,
                    template_id="test",
                )
        else:
            results, rule_results, computed_values = extract_all_fields(
                pdf_path, request.fields, None,
                template_rules=request.rules,
                computed_fields=request.computed_fields,
                template_id="test",
            )

    needs_review = any(r.status not in ("ok",) for r in results)

    return ExtractionResponse(
        pdf_id=request.pdf_id,
        template_id="test",
        results=results,
        needs_review=needs_review,
        pdf_id_b=request.pdf_id_b,
        template_rule_results=rule_results,
        computed_values=computed_values,
    )


class TestMixedRequest(BaseModel):
    """Request for preview with mixed PDF + spreadsheet files."""
    files: list[ControleFile]
    rules: list[TemplateRule] = []
    computed_fields: list[ComputedField] = []


class TestMixedResponse(BaseModel):
    file_results: list[dict]  # [{fileLabel, results: [FieldResult]}]
    template_rule_results: list[TemplateRuleResult] = []
    computed_values: dict[str, str] = {}


@router.post("/test-mixed")
async def test_mixed_extraction(request: TestMixedRequest):
    """Preview extraction for mixed PDF + spreadsheet files with rule evaluation."""
    storage = get_storage()
    all_extracted: dict[str, str] = {}
    all_table_values: dict[str, list[dict[str, str]]] = {}
    grid_data: dict[str, dict] = {}
    file_results: list[dict] = []

    for file_def in request.files:
        if file_def.fileType == "spreadsheet":
            # Load grid data
            ss_id = file_def.spreadsheetId
            grid = None
            if ss_id:
                grid_json = storage.get_spreadsheet_grid(ss_id)
                if grid_json:
                    grid = json.loads(grid_json)
                    grid_data[ss_id] = grid

            # Resolve spreadsheet field values
            results = []
            for field in file_def.fields:
                value = ""
                if grid and field.type == "cell" and field.cell_ref:
                    if field.cell_ref.row < grid["row_count"] and field.cell_ref.col < grid["col_count"]:
                        row_val = grid["rows"][field.cell_ref.row][field.cell_ref.col]
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

                all_extracted[field.label] = value
                results.append(FieldResult(
                    label=field.label,
                    field_type=field.type,
                    value=value,
                    status="ok" if value else "empty",
                    rule_results=[],
                    step_traces=[],
                ))

            file_results.append({"fileLabel": file_def.label, "results": [r.model_dump() for r in results]})

        elif file_def.fileType == "pdf" and file_def.pdfId:
            if not storage.pdf_exists(file_def.pdfId):
                continue
            with storage.pdf_temp_path(file_def.pdfId) as pdf_path:
                results, _, _ = extract_all_fields(
                    pdf_path, file_def.fields, None,
                    template_rules=[], computed_fields=[], template_id="test",
                )
            for r in results:
                all_extracted[r.label] = r.value
                if r.table_data:
                    all_table_values[r.label] = r.table_data
            file_results.append({"fileLabel": file_def.label, "results": [r.model_dump() for r in results]})

    # Run rules with all extracted values + grid data
    rule_results: list[TemplateRuleResult] = []
    computed_values: dict[str, str] = {}
    if request.rules:
        from services.translation_rules_store import get_translation_rules_dict
        engine = RuleEngine(
            current_template_id="test",
            extracted_values=all_extracted,
            table_values=all_table_values,
            grid_data=grid_data,
            translation_rules=get_translation_rules_dict(),
        )
        computed_values, rule_results = engine.evaluate_all(request.rules, request.computed_fields)

    return TestMixedResponse(
        file_results=file_results,
        template_rule_results=rule_results,
        computed_values=computed_values,
    )
