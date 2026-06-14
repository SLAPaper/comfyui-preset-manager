"""
Workflow template discovery and parsing for ComfyUI Preset Manager.

Discovers and loads YAML workflow templates from bundled and user directories.
Bundled templates serve as defaults; user templates override when sharing the same id.
"""

import os
import yaml
from pathlib import Path

PLUGIN_DIR = Path(__file__).parent
WORKFLOWS_DIR = PLUGIN_DIR / "workflows"


def _get_user_workflows_dir() -> Path:
    """
    Get user workflows directory: {ComfyUI_base}/user/preset-manager/workflows/
    Creates directory if it doesn't exist.
    """
    import folder_paths
    user_dir = Path(folder_paths.get_user_directory())
    workflows_dir = user_dir / "preset-manager" / "workflows"
    workflows_dir.mkdir(parents=True, exist_ok=True)
    return workflows_dir


def _load_yaml_file(filepath: Path) -> dict | None:
    """Load a single YAML file and return its contents, or None on error."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if isinstance(data, dict):
            return data
        print(f"[PresetManager] Warning: {filepath} did not contain a valid dict")
        return None
    except Exception as e:
        print(f"[PresetManager] Error loading {filepath}: {e}")
        return None


def _scan_workflow_dir(directory: Path) -> dict[str, dict]:
    """
    Scan a workflow directory for YAML templates.
    Returns a dict mapping template_id -> template_data.
    """
    result = {}
    if not directory.is_dir():
        return result
    for f in directory.iterdir():
        if f.suffix in (".yaml", ".yml") and f.is_file():
            template_id = f.stem
            data = _load_yaml_file(f)
            if data is not None:
                result[template_id] = data
    return result


def load_templates() -> dict[str, dict]:
    """
    Discover and load all workflow templates from:
    1. Bundled workflows/ directory (PLUGIN_DIR/workflows/)
    2. User workflows/ directory (user/preset-manager/workflows/)

    Returns: {template_id: template_data}
    - template_id = filename without .yaml extension
    - template_data = parsed YAML dict with keys: name, description, version, node_mapping, synonyms
    """
    # Bundled templates first
    templates = _scan_workflow_dir(WORKFLOWS_DIR)

    # User templates override bundled
    user_dir = _get_user_workflows_dir()
    user_templates = _scan_workflow_dir(user_dir)
    templates.update(user_templates)

    # Log loaded templates
    for template_id, template_data in templates.items():
        name = template_data.get("name", template_id)
        node_mapping = template_data.get("node_mapping", {})
        print(f"[PresetManager] 加载模板: {name} ({len(node_mapping)} 个参数定义)")

    return templates


def get_template(template_id: str) -> dict | None:
    """Load a single template by ID. Returns None if not found."""
    # Check user directory first (higher priority)
    user_dir = _get_user_workflows_dir()
    for ext in (".yaml", ".yml"):
        user_file = user_dir / f"{template_id}{ext}"
        if user_file.is_file():
            data = _load_yaml_file(user_file)
            if data is not None:
                return data

    # Fall back to bundled
    for ext in (".yaml", ".yml"):
        bundled_file = WORKFLOWS_DIR / f"{template_id}{ext}"
        if bundled_file.is_file():
            data = _load_yaml_file(bundled_file)
            if data is not None:
                return data

    return None
