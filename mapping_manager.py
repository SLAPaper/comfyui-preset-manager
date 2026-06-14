"""
Mapping manager for ComfyUI Preset Manager.

Handles workflow name → template ID mapping persistence.
"""

import yaml
from pathlib import Path


def get_user_mapping_file() -> Path:
    """
    Get user mapping file path: {ComfyUI_base}/user/preset-manager/mapping.yaml
    """
    import folder_paths
    user_dir = Path(folder_paths.get_user_directory())
    return user_dir / "preset-manager" / "mapping.yaml"


def _load_yaml_file(filepath: Path) -> dict | None:
    """Load a single YAML file and return its contents, or None on error."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if isinstance(data, dict):
            return data
        return None
    except Exception:
        return None


def load_mapping() -> dict:
    """
    Load workflow name → template ID mapping from user file.
    
    Returns: dict mapping workflow_name -> template_id
    Returns empty dict if file doesn't exist.
    """
    mapping_file = get_user_mapping_file()
    if not mapping_file.is_file():
        return {}
    
    data = _load_yaml_file(mapping_file)
    if data is None:
        return {}
    
    return data


def save_mapping(mapping: dict) -> bool:
    """
    Save workflow name → template ID mapping to user file.
    
    Args:
        mapping: dict mapping workflow_name -> template_id
        
    Returns: True on success.
    """
    mapping_file = get_user_mapping_file()
    
    try:
        # Create parent directories if they don't exist
        mapping_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(mapping_file, "w", encoding="utf-8") as f:
            yaml.dump(mapping, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
        return True
    except Exception as e:
        print(f"[PresetManager] Error saving mapping: {e}")
        return False


def get_mapping_entry(workflow_name: str) -> str | None:
    """
    Get template ID for a specific workflow name.
    
    Returns: template_id or None if not found.
    """
    mapping = load_mapping()
    return mapping.get(workflow_name)


def set_mapping_entry(workflow_name: str, template_id: str) -> bool:
    """
    Set or update a workflow name → template ID mapping.
    
    Returns: True on success.
    """
    mapping = load_mapping()
    mapping[workflow_name] = template_id
    return save_mapping(mapping)


def delete_mapping_entry(workflow_name: str) -> bool:
    """
    Delete a workflow name → template ID mapping.
    
    Returns: True if deleted, False if not found.
    """
    mapping = load_mapping()
    if workflow_name not in mapping:
        return False
    
    del mapping[workflow_name]
    save_mapping(mapping)
    return True
