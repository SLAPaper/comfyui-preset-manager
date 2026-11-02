"""
Workflow template discovery and parsing for ComfyUI Preset Manager.

Bundled templates live in workflows/. User templates live in
user/preset-manager/workflows/ and override bundled templates with the same ID.
"""

from pathlib import Path

try:
    from .storage import (
        find_yaml_file, is_safe_id, load_yaml, remove_alternate_yaml, require_safe_id,
        save_yaml, scan_yaml, user_dir,
    )
except ImportError:
    from storage import (
        find_yaml_file, is_safe_id, load_yaml, remove_alternate_yaml, require_safe_id,
        save_yaml, scan_yaml, user_dir,
    )

PLUGIN_DIR = Path(__file__).parent
WORKFLOWS_DIR = PLUGIN_DIR / "workflows"

MATCH_STRATEGIES = {"unique_class", "title_keyword", "output_connection", "input_slot"}


def _get_user_workflows_dir() -> Path:
    return user_dir("workflows")


def _is_valid_template(template_id: str, data: dict) -> bool:
    """Check the fields that every strategy needs before exposing a template."""
    node_mapping = data.get("node_mapping")
    if not isinstance(node_mapping, dict) or not node_mapping:
        print(f"[PresetManager] Warning: template {template_id} has no node_mapping")
        return False

    for param_name, spec in node_mapping.items():
        if not isinstance(param_name, str) or not param_name:
            print(f"[PresetManager] Warning: {template_id} has an invalid parameter name")
            return False
        if not isinstance(spec, dict):
            print(f"[PresetManager] Warning: {template_id}.{param_name} is not a mapping")
            return False

        strategy = spec.get("match_strategy")
        if strategy not in MATCH_STRATEGIES:
            print(f"[PresetManager] Warning: {template_id}.{param_name} has unknown strategy {strategy!r}")
            return False

        widget = spec.get("widget")
        if not isinstance(widget, str) or not widget:
            print(f"[PresetManager] Warning: {template_id}.{param_name} has no widget")
            return False

        if strategy in ("unique_class", "title_keyword") and not spec.get("class_type"):
            print(f"[PresetManager] Warning: {template_id}.{param_name} has no class_type")
            return False
        if strategy == "output_connection" and not (spec.get("target_class_type") and spec.get("target_input")):
            print(f"[PresetManager] Warning: {template_id}.{param_name} needs target_class_type and target_input")
            return False
        if strategy == "input_slot" and not (spec.get("class_type") and spec.get("input_name")):
            print(f"[PresetManager] Warning: {template_id}.{param_name} needs class_type and input_name")
            return False
        if strategy == "title_keyword" and not spec.get("title_keywords"):
            print(f"[PresetManager] Warning: {template_id}.{param_name} has no title_keywords")
            return False

    synonyms = data.get("synonyms")
    if synonyms is not None:
        if not isinstance(synonyms, dict) or not all(
            isinstance(source, str) and isinstance(target, str)
            for source, target in synonyms.items()
        ):
            print(f"[PresetManager] Warning: template {template_id} has invalid synonyms")
            return False

    return True


def _merge_include(template_id: str, data: dict) -> dict:
    """Merge the shared parameters named by a template's include field."""
    include = data.get("include")
    if include is None:
        return data

    shared = None
    if is_safe_id(include):
        include_file = _find_file(WORKFLOWS_DIR, include)
        if include_file is not None:
            shared = load_yaml(include_file)
    if shared is None:
        print(f"[PresetManager] Warning: template {template_id} includes missing {include!r}")
        return data

    merged = dict(data)
    merged["node_mapping"] = {
        **shared.get("node_mapping", {}),
        **data.get("node_mapping", {}),
    }
    merged.pop("include", None)
    return merged


def _load_template_file(template_id: str, path: Path) -> dict | None:
    data = load_yaml(path)
    if data is None:
        return None
    data = _merge_include(template_id, data)
    return data if _is_valid_template(template_id, data) else None


def _scan_workflow_dir(directory: Path) -> dict[str, dict]:
    templates = {}
    for template_id, data in scan_yaml(directory).items():
        if template_id.startswith("_"):
            continue
        data = _merge_include(template_id, data)
        if _is_valid_template(template_id, data):
            templates[template_id] = data
    return templates


def load_bundled_templates() -> dict[str, dict]:
    """Load bundled templates with shared includes resolved."""
    return _scan_workflow_dir(WORKFLOWS_DIR)


def load_templates() -> dict[str, dict]:
    """Load bundled templates, then let user templates override them by ID."""
    templates = load_bundled_templates()
    templates.update(_scan_workflow_dir(_get_user_workflows_dir()))
    return templates


def _load_template_from(directory: Path, template_id: str) -> dict | None:
    template_file = _find_file(directory, template_id)
    return (
        _load_template_file(template_id, template_file)
        if template_file is not None
        else None
    )


def get_template(template_id: str) -> dict | None:
    """Load a single template by ID. Returns None when missing or invalid."""
    if template_id.startswith("_"):
        return None

    return (
        _load_template_from(_get_user_workflows_dir(), template_id)
        or _load_template_from(WORKFLOWS_DIR, template_id)
    )


def _find_file(directory: Path, template_id: str) -> Path | None:
    if not is_safe_id(template_id):
        return None
    return find_yaml_file(directory, template_id)


def template_source(template_id: str) -> str | None:
    """Return the layer of the template that actually loads: user, bundled, or None."""
    if _load_template_from(_get_user_workflows_dir(), template_id) is not None:
        return "user"
    if _load_template_from(WORKFLOWS_DIR, template_id) is not None:
        return "bundled"
    return None


def save_template(template_id: str, data: dict) -> bool:
    """Save a complete template to the user directory.

    The caller sends the full node_mapping; saving never edits bundled files.
    """
    if template_id.startswith("_") or not is_safe_id(template_id):
        return False
    if not isinstance(data, dict):
        return False

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        return False
    description = data.get("description", "")
    if not isinstance(description, str):
        return False

    save_data = {
        key: value
        for key, value in data.items()
        if key not in ("id", "source", "include")
    }
    if not _is_valid_template(template_id, save_data):
        return False

    try:
        require_safe_id(template_id)
    except ValueError:
        return False

    filepath = _get_user_workflows_dir() / f"{template_id}.yaml"
    if save_yaml(filepath, save_data):
        remove_alternate_yaml(filepath)
        print(f"[PresetManager] Saved template: {template_id}")
        return True
    return False
