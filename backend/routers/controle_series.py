import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.schemas import (
    ControleSeries,
    ControleSeriesCreate,
    ControleSeriesRun,
    ControleSeriesStepResult,
    ControleRunResult,
    ExtractionResponse,
    TestRunEntry,
)
from services.controle_series_store import (
    delete_controle_series,
    get_controle_series,
    list_controle_series,
    save_controle_series,
    update_controle_series,
)
from services.controle_store import get_controle
from services.storage_backend import get_storage
from services.extraction_service import extract_all_fields

router = APIRouter(prefix="/controle-series", tags=["controle-series"])


# ── CRUD ─────────────────────────────────────────────────────────────

@router.post("", response_model=ControleSeries)
async def create_series(data: ControleSeriesCreate):
    series_id = str(uuid.uuid4())
    series = save_controle_series(series_id, data)
    return series


@router.get("", response_model=list[ControleSeries])
async def list_series(klantId: str | None = Query(None)):
    all_series = list_controle_series()
    if klantId:
        return [s for s in all_series if s.klantId == klantId]
    return all_series


# ── Run results (must come before /{series_id} to avoid path conflict) ──

@router.get("/runs/all", response_model=list[ControleSeriesRun])
async def list_all_series_runs():
    storage = get_storage()
    runs: list[ControleSeriesRun] = []
    for rid in storage.list_controle_series_run_ids():
        content = storage.get_controle_series_run(rid)
        if content is not None:
            runs.append(ControleSeriesRun(**json.loads(content)))
    return sorted(runs, key=lambda r: r.runAt, reverse=True)


@router.get("/runs/{run_id}", response_model=ControleSeriesRun)
async def get_series_run(run_id: str):
    storage = get_storage()
    content = storage.get_controle_series_run(run_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Series run not found.")
    return ControleSeriesRun(**json.loads(content))


# ── Single series CRUD ───────────────────────────────────────────────

@router.get("/{series_id}", response_model=ControleSeries)
async def get_one_series(series_id: str):
    series = get_controle_series(series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Controle series not found.")
    return series


@router.put("/{series_id}", response_model=ControleSeries)
async def update_one_series(series_id: str, data: ControleSeriesCreate):
    series = update_controle_series(series_id, data)
    if series is None:
        raise HTTPException(status_code=404, detail="Controle series not found.")
    return series


@router.delete("/{series_id}")
async def remove_series(series_id: str):
    deleted = delete_controle_series(series_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Controle series not found.")
    return {"detail": "Controle series deleted."}


# ── Run series ───────────────────────────────────────────────────────

class RunSeriesRequest(BaseModel):
    files: dict[str, dict[str, list[str] | str]]  # step_id -> { file_id -> [pdf_id, ...] or pdf_id }
    filenames: dict[str, str] = {}  # pdf_id -> filename (optional)


@router.post("/{series_id}/run", response_model=ControleSeriesRun)
async def run_series(series_id: str, data: RunSeriesRequest):
    series = get_controle_series(series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Controle series not found.")

    if not series.steps:
        raise HTTPException(status_code=400, detail="Series has no steps.")

    storage = get_storage()
    sorted_steps = sorted(series.steps, key=lambda s: s.order)
    step_results: list[ControleSeriesStepResult] = []
    series_context: dict[str, ControleRunResult] = {}
    final_status: str = "completed"

    for step in sorted_steps:
        # ── Evaluate condition against previous step's result ──
        if step.condition != "always" and step_results:
            prev = step_results[-1]
            if step.condition == "if_passed" and prev.status != "passed":
                step_results.append(ControleSeriesStepResult(
                    stepId=step.id,
                    controleId=step.controleId,
                    controleName=step.controleName,
                    status="skipped",
                ))
                final_status = "stopped"
                break
            if step.condition == "if_failed" and prev.status != "failed":
                step_results.append(ControleSeriesStepResult(
                    stepId=step.id,
                    controleId=step.controleId,
                    controleName=step.controleName,
                    status="skipped",
                ))
                final_status = "stopped"
                break

        # ── Load the controle ──
        controle = get_controle(step.controleId)
        if controle is None:
            step_results.append(ControleSeriesStepResult(
                stepId=step.id,
                controleId=step.controleId,
                controleName=step.controleName,
                status="error",
            ))
            continue

        if controle.status != "published":
            step_results.append(ControleSeriesStepResult(
                stepId=step.id,
                controleId=step.controleId,
                controleName=step.controleName,
                status="error",
            ))
            continue

        # ── Run the controle (reuse logic from controles router) ──
        step_files_raw = data.files.get(step.id, {})
        step_files: dict[str, list[str]] = {}
        for key, val in step_files_raw.items():
            if isinstance(val, str):
                step_files[key] = [val]
            else:
                step_files[key] = val
        responses: list[ExtractionResponse] = []

        try:
            for file_def in controle.files:
                is_first_file_def = file_def.id == controle.files[0].id
                pdf_ids = step_files.get(file_def.id, [])
                if not pdf_ids:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Missing PDF for file '{file_def.label}' (id: {file_def.id}) in step '{step.controleName}'.",
                    )

                for pdf_id in pdf_ids:
                    if not storage.pdf_exists(pdf_id):
                        raise HTTPException(status_code=404, detail=f"PDF {pdf_id} not found.")

                    pdf_filename = data.filenames.get(pdf_id, pdf_id)

                    with storage.pdf_temp_path(pdf_id) as pdf_path:
                        field_results, rule_results, computed_values = extract_all_fields(
                            pdf_path=pdf_path,
                            fields=file_def.fields,
                            template_rules=controle.rules if is_first_file_def else [],
                            computed_fields=controle.computedFields if is_first_file_def else [],
                            template_id=step.controleId,
                            series_context=series_context,
                        )

                    responses.append(ExtractionResponse(
                        pdf_id=pdf_id,
                        template_id=step.controleId,
                        results=field_results,
                        needs_review=any(r.status != "ok" for r in field_results),
                        template_rule_results=rule_results,
                        computed_values=computed_values,
                        source_filename=pdf_filename,
                    ))

            # ── Build and persist ControleRunResult ──
            total_fields = sum(len(r.results) for r in responses)
            passed_fields = sum(len([f for f in r.results if f.status == "ok"]) for r in responses)
            all_rule_results = [rr for r in responses for rr in r.template_rule_results]
            rules_passed = len([rr for rr in all_rule_results if rr.passed])

            run_status = (
                "success"
                if passed_fields == total_fields and rules_passed == len(all_rule_results)
                else "review" if passed_fields > 0
                else "error"
            )

            # Collect entries for reuse in series_context
            entries: list[TestRunEntry] = []
            for r in responses:
                prefix = f"{r.source_filename} → " if r.source_filename and len(responses) > 1 else ""
                for fr in r.results:
                    entries.append(TestRunEntry(
                        label=f"{prefix}{fr.label}",
                        value=fr.value or "",
                        status=fr.status,
                        table_data=fr.table_data,
                    ))
            for key, val in (responses[0].computed_values.items() if responses else []):
                entries.append(TestRunEntry(label=key, value=str(val), status="computed"))

            run_result = ControleRunResult(
                id=str(uuid.uuid4()),
                controleId=step.controleId,
                controleName=step.controleName,
                klantId=controle.klantId,
                klantName=controle.klantName,
                status=run_status,
                totalFields=total_fields,
                passedFields=passed_fields,
                failedFields=total_fields - passed_fields,
                rulesPassed=rules_passed,
                rulesTotal=len(all_rule_results),
                fileResults=[
                    {
                        "fileLabel": r.source_filename or f"File {i+1}",
                        "passed": len([f for f in r.results if f.status == "ok"]),
                        "total": len(r.results),
                    }
                    for i, r in enumerate(responses)
                ],
                entries=entries,
                runAt=datetime.now(timezone.utc),
            )
            storage.save_controle_run(run_result.id, run_result.model_dump_json(indent=2))

            # Add to series_context for data piping to subsequent steps
            series_context[step.controleId] = run_result

            step_status = "passed" if run_status == "success" else "failed"
            step_results.append(ControleSeriesStepResult(
                stepId=step.id,
                controleId=step.controleId,
                controleName=step.controleName,
                status=step_status,
                controleRunId=run_result.id,
            ))

        except HTTPException:
            raise
        except Exception:
            step_results.append(ControleSeriesStepResult(
                stepId=step.id,
                controleId=step.controleId,
                controleName=step.controleName,
                status="error",
            ))

    # ── Persist and return the series run ──
    series_run = ControleSeriesRun(
        id=str(uuid.uuid4()),
        seriesId=series_id,
        seriesName=series.name,
        klantId=series.klantId,
        klantName=series.klantName,
        status=final_status,
        stepResults=step_results,
        runAt=datetime.now(timezone.utc),
    )
    storage.save_controle_series_run(series_run.id, series_run.model_dump_json(indent=2))

    return series_run
