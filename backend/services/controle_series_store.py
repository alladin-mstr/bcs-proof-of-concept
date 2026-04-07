import json
from datetime import datetime, timezone

from models.schemas import ControleSeries, ControleSeriesCreate
from services.storage_backend import get_storage


def save_controle_series(series_id: str, data: ControleSeriesCreate) -> ControleSeries:
    now = datetime.now(timezone.utc)
    series = ControleSeries(
        id=series_id,
        name=data.name,
        klantId=data.klantId,
        klantName=data.klantName,
        steps=data.steps,
        createdAt=now,
        updatedAt=now,
    )
    get_storage().save_controle_series(series_id, series.model_dump_json(indent=2))
    return series


def get_controle_series(series_id: str) -> ControleSeries | None:
    content = get_storage().get_controle_series(series_id)
    if content is None:
        return None
    return ControleSeries(**json.loads(content))


def list_controle_series() -> list[ControleSeries]:
    storage = get_storage()
    result: list[ControleSeries] = []
    for sid in storage.list_controle_series_ids():
        content = storage.get_controle_series(sid)
        if content is not None:
            result.append(ControleSeries(**json.loads(content)))
    return sorted(result, key=lambda s: s.createdAt, reverse=True)


def update_controle_series(series_id: str, data: ControleSeriesCreate) -> ControleSeries | None:
    storage = get_storage()
    existing_content = storage.get_controle_series(series_id)
    if existing_content is None:
        return None

    existing = json.loads(existing_content)
    series = ControleSeries(
        id=series_id,
        name=data.name,
        klantId=data.klantId,
        klantName=data.klantName,
        steps=data.steps,
        createdAt=existing.get("createdAt", datetime.now(timezone.utc).isoformat()),
        updatedAt=datetime.now(timezone.utc),
    )
    storage.save_controle_series(series_id, series.model_dump_json(indent=2))
    return series


def delete_controle_series(series_id: str) -> bool:
    return get_storage().delete_controle_series(series_id)
