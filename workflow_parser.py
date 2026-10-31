"""
Workflow template discovery and parsing for ComfyUI Preset Manager.

Bundled templates live in workflows/. User templates live in
user/preset-manager/workflows/ and override bundled templates with the same ID.
"""

from pathlib import Path

try:
    from .storage import is_safe_id, load_yaml, scan_yaml, user_dir
except ImportError:
    from storage import is_safe_id, load_yaml, scan_yaml, user_dir

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

    return True


def _scan_workflow_dir(directory: Path) -> dict[str, dict]:
    templates = scan_yaml(directory)
    return {
        template_id: data
        for template_id, data in templates.items()
        if _is_valid_template(template_id, data)
    }


def load_templates() -> dict[str, dict]:
    """Load bundled templates, then let user templates override them by ID."""
    templates = _scan_workflow_dir(WORKFLOWS_DIR)
    templates.update(_scan_workflow_dir(_get_user_workflows_dir()))

    for template_id, data in templates.items():
        print(f"[PresetManager] 加载模板: {data.get('name', template_id)} ({len(data['node_mapping'])} 个参数定义)")

    return templates


def get_template(template_id: str) -> dict | None:
    """Load a single template by ID. Returns None when missing or invalid."""
    user_file = _find_file(_get_user_workflows_dir(), template_id)
    if user_file is not None:
        data = load_yaml(user_file)
        if data is not None and _is_valid_template(template_id, data):
            return data

    bundled_file = _find_file(WORKFLOWS_DIR, template_id)
    if bundled_file is not None:
        data = load_yaml(bundled_file)
        if data is not None and _is_valid_template(template_id, data):
            return data

    return None


def _find_file(directory: Path, template_id: str) -> Path | None:
    if not is_safe_id(template_id):
        return None
    for ext in (".yaml", ".yml"):
        filepath = directory / f"{template_id}{ext}"
        if filepath.is_file():
            return filepath
    return None
