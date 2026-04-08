import json
from datetime import datetime, timezone

from models.schemas import GlobalValueGroup, GlobalValueGroupCreate
from services.storage_backend import get_storage


def save_global_value_group(group_id: str, data: GlobalValueGroupCreate) -> GlobalValueGroup:
    now = datetime.now(timezone.utc).isoformat()
    audit_entry = {
        "timestamp": now,
        "action": "created",
        "details": {"mode": data.mode},
    }
    group = GlobalValueGroup(
        id=group_id,
        name=data.name,
        version=1,
        values=data.values,
        createdAt=now,
        updatedAt=now,
        mode=data.mode,
        auditLog=[audit_entry],
    )
    get_storage().save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group


def get_global_value_group(group_id: str) -> GlobalValueGroup | None:
    content = get_storage().get_global_value_group(group_id)
    if content is None:
        return None
    return GlobalValueGroup(**json.loads(content))


def list_global_value_groups() -> list[GlobalValueGroup]:
    storage = get_storage()
    groups: list[GlobalValueGroup] = []
    for gid in storage.list_global_value_group_ids():
        content = storage.get_global_value_group(gid)
        if content is not None:
            groups.append(GlobalValueGroup(**json.loads(content)))
    return sorted(groups, key=lambda g: g.createdAt, reverse=True)


def _values_changed(old_values: list, new_values: list) -> bool:
    """Check if values have changed (added, removed, or modified)."""
    if len(old_values) != len(new_values):
        return True
    old_map = {v["id"]: v for v in old_values}
    for nv in new_values:
        ov = old_map.get(nv["id"])
        if ov is None:
            return True
        if ov["name"] != nv["name"] or ov["dataType"] != nv["dataType"] or ov["value"] != nv["value"]:
            return True
    return False


def update_global_value_group(group_id: str, data: GlobalValueGroupCreate) -> GlobalValueGroup | None:
    storage = get_storage()
    existing_content = storage.get_global_value_group(group_id)
    if existing_content is None:
        return None
    existing = json.loads(existing_content)
    old_version = existing.get("version", 1)
    new_values_dicts = [v.model_dump() for v in data.values]
    old_values_dicts = existing.get("values", [])
    version = old_version + 1 if _values_changed(old_values_dicts, new_values_dicts) else old_version
    group = GlobalValueGroup(
        id=group_id,
        name=data.name,
        version=version,
        values=data.values,
        createdAt=existing.get("createdAt", datetime.now(timezone.utc).isoformat()),
        updatedAt=datetime.now(timezone.utc).isoformat(),
        mode=existing.get("mode", "manual"),
        templateId=existing.get("templateId"),
        auditLog=existing.get("auditLog", []),
    )
    storage.save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group


def delete_global_value_group(group_id: str) -> bool:
    return get_storage().delete_global_value_group(group_id)


def append_audit_entry(group_id: str, action: str, details: dict) -> GlobalValueGroup | None:
    storage = get_storage()
    content = storage.get_global_value_group(group_id)
    if content is None:
        return None
    data = json.loads(content)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "details": details,
    }
    data.setdefault("auditLog", []).append(entry)
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    group = GlobalValueGroup(**data)
    storage.save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group


def confirm_extracted_values(group_id: str, new_values: list, filename: str) -> GlobalValueGroup | None:
    storage = get_storage()
    content = storage.get_global_value_group(group_id)
    if content is None:
        return None
    data = json.loads(content)
    old_values = data.get("values", [])
    old_map = {v["id"]: v["value"] for v in old_values}
    new_map = {v["id"]: v["value"] for v in new_values}
    changed_fields = [v["name"] for v in new_values if old_map.get(v["id"]) != v["value"]]
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": "values_confirmed",
        "details": {
            "filename": filename,
            "previousValues": old_values,
            "newValues": new_values,
            "changedFields": changed_fields,
        },
    }
    data["values"] = new_values
    data["version"] = data.get("version", 1) + 1
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    data.setdefault("auditLog", []).append(entry)
    group = GlobalValueGroup(**data)
    storage.save_global_value_group(group_id, group.model_dump_json(indent=2))
    return group
