import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.schemas import Controle, ControleCreate, ControleRunResult, ExtractionResponse, TestRunEntry
from services.controle_store import (
    delete_controle,
    get_controle,
    list_controles,
    save_controle,
    update_controle,
)
from services.extraction_service import extract_all_fields
from services.storage_backend import get_storage

router = APIRouter(prefix="/controles", tags=["controles"])


@router.post("", response_model=Controle)
async def create_controle(data: ControleCreate):
    controle_id = str(uuid.uuid4())
    controle = save_controle(controle_id, data)
    return controle


@router.get("", response_model=list[Controle])
async def get_all_controles():
    return list_controles()


@router.get("/runs/all", response_model=list[ControleRunResult])
async def list_all_runs():
    storage = get_storage()
    runs: list[ControleRunResult] = []
    for rid in storage.list_controle_run_ids():
        content = storage.get_controle_run(rid)
        if content is not None:
            runs.append(ControleRunResult(**json.loads(content)))
    return sorted(runs, key=lambda r: r.runAt, reverse=True)


@router.get("/{controle_id}", response_model=Controle)
async def get_one_controle(controle_id: str):
    controle = get_controle(controle_id)
    if controle is None:
        raise HTTPException(status_code=404, detail="Controle not found.")
    return controle


@router.put("/{controle_id}", response_model=Controle)
async def update_one_controle(controle_id: str, data: ControleCreate):
    controle = update_controle(controle_id, data)
    if controle is None:
        raise HTTPException(status_code=404, detail="Controle not found.")
    return controle


@router.delete("/{controle_id}")
async def remove_controle(controle_id: str):
    deleted = delete_controle(controle_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Controle not found.")
    return {"detail": "Controle deleted."}


class RunControleRequest(BaseModel):
    files: dict[str, str]  # file_id -> pdf_id


@router.post("/{controle_id}/run", response_model=list[ExtractionResponse])
async def run_controle(controle_id: str, data: RunControleRequest):
    controle = get_controle(controle_id)
    if controle is None:
        raise HTTPException(status_code=404, detail="Controle not found.")
    if controle.status != "published":
        raise HTTPException(status_code=400, detail="Controle must be published to run.")

    storage = get_storage()
    responses: list[ExtractionResponse] = []

    # Collect all fields across files for combined rule evaluation
    all_fields = []
    for file_def in controle.files:
        all_fields.extend(file_def.fields)

    for file_def in controle.files:
        pdf_id = data.files.get(file_def.id)
        if not pdf_id:
            raise HTTPException(
                status_code=400,
                detail=f"Missing PDF for file '{file_def.label}' (id: {file_def.id}).",
            )
        if not storage.pdf_exists(pdf_id):
            raise HTTPException(status_code=404, detail=f"PDF {pdf_id} not found.")

        with storage.pdf_temp_path(pdf_id) as pdf_path:
            field_results, rule_results, computed_values = extract_all_fields(
                pdf_path=pdf_path,
                fields=file_def.fields,
                template_rules=controle.rules if file_def.id == controle.files[0].id else [],
                computed_fields=controle.computedFields if file_def.id == controle.files[0].id else [],
                template_id=controle_id,
            )

        responses.append(ExtractionResponse(
            pdf_id=pdf_id,
            template_id=controle_id,
            results=field_results,
            needs_review=any(r.status != "ok" for r in field_results),
            template_rule_results=rule_results,
            computed_values=computed_values,
        ))

    # Persist run result
    total_fields = sum(len(r.results) for r in responses)
    passed_fields = sum(len([f for f in r.results if f.status == "ok"]) for r in responses)
    all_rule_results = [rr for r in responses for rr in r.template_rule_results]
    rules_passed = len([rr for rr in all_rule_results if rr.passed])

    status = "success" if passed_fields == total_fields and rules_passed == len(all_rule_results) else "review" if passed_fields > 0 else "error"

    # Collect extracted field entries for reuse in rules
    entries: list[TestRunEntry] = []
    for i, r in enumerate(responses):
        file_label = controle.files[i].label if i < len(controle.files) else f"File {i+1}"
        prefix = f"{file_label} → " if len(controle.files) > 1 else ""
        for fr in r.results:
            entries.append(TestRunEntry(
                label=f"{prefix}{fr.label}",
                value=fr.value or "",
                status=fr.status,
                table_data=fr.table_data,
            ))
    for key, val in responses[0].computed_values.items() if responses else []:
        entries.append(TestRunEntry(label=key, value=str(val), status="computed"))

    run_result = ControleRunResult(
        id=str(uuid.uuid4()),
        controleId=controle_id,
        controleName=controle.name,
        klantId=controle.klantId,
        klantName=controle.klantName,
        status=status,
        totalFields=total_fields,
        passedFields=passed_fields,
        failedFields=total_fields - passed_fields,
        rulesPassed=rules_passed,
        rulesTotal=len(all_rule_results),
        fileResults=[
            {
                "fileLabel": controle.files[i].label if i < len(controle.files) else f"File {i+1}",
                "passed": len([f for f in r.results if f.status == "ok"]),
                "total": len(r.results),
            }
            for i, r in enumerate(responses)
        ],
        entries=entries,
        runAt=datetime.now(timezone.utc),
    )
    storage.save_controle_run(run_result.id, run_result.model_dump_json(indent=2))

    return responses
