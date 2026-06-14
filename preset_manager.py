"""
Preset CRUD operations for ComfyUI Preset Manager.

Loads presets from bundled and user directories, storing user presets as YAML files.
Bundled presets serve as defaults; user presets override when sharing the same id.
"""

import os
import yaml
from pathlib import Path

PLUGIN_DIR = Path(__file__).parent
PRESETS_DIR = PLUGIN_DIR / "presets"  # Bundled presets


def get_user_presets_dir() -> Path:
    """
    Get user presets directory: {ComfyUI_base}/user/preset-manager/presets/
    Creates directory if it doesn't exist.
    """
    import folder_paths
    user_dir = Path(folder_paths.get_user_directory())
    presets_dir = user_dir / "preset-manager" / "presets"
    presets_dir.mkdir(parents=True, exist_ok=True)
    return presets_dir


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


def _scan_preset_dir(directory: Path, template_id: str) -> dict[str, dict]:
    """
    Scan a preset directory for a given template_id.
    Returns a dict mapping preset_id -> preset_data (with id injected).
    """
    result = {}
    template_dir = directory / template_id
    if not template_dir.is_dir():
        return result
    for f in template_dir.iterdir():
        if f.suffix in (".yaml", ".yml") and f.is_file():
            preset_id = f.stem
            data = _load_yaml_file(f)
            if data is not None:
                data["id"] = preset_id
                result[preset_id] = data
    return result


def load_presets(template_id: str) -> list[dict]:
    """
    Load all presets for a given template.
    Sources:
    1. Bundled presets/{template_id}/ directory
    2. User presets/{template_id}/ directory

    Returns: list of preset dicts with keys: id, name, description, workflow_template, params
    - id = filename without .yaml extension
    - Merges both sources, user presets override bundled if same id
    """
    # Bundled presets first
    presets = _scan_preset_dir(PRESETS_DIR, template_id)

    # User presets override bundled
    user_dir = get_user_presets_dir()
    user_presets = _scan_preset_dir(user_dir, template_id)
    presets.update(user_presets)

    return list(presets.values())


def get_preset(template_id: str, preset_id: str) -> dict | None:
    """Load a single preset. Returns None if not found."""
    # Check user directory first (higher priority)
    user_dir = get_user_presets_dir()
    for ext in (".yaml", ".yml"):
        user_file = user_dir / template_id / f"{preset_id}{ext}"
        if user_file.is_file():
            data = _load_yaml_file(user_file)
            if data is not None:
                data["id"] = preset_id
                return data

    # Fall back to bundled
    for ext in (".yaml", ".yml"):
        bundled_file = PRESETS_DIR / template_id / f"{preset_id}{ext}"
        if bundled_file.is_file():
            data = _load_yaml_file(bundled_file)
            if data is not None:
                data["id"] = preset_id
                return data

    return None


def save_preset(template_id: str, preset_id: str, preset_data: dict) -> bool:
    """
    Save a preset to user directory.
    preset_data must have: name, description, workflow_template, params
    Returns True on success.
    """
    user_dir = get_user_presets_dir()
    template_dir = user_dir / template_id
    template_dir.mkdir(parents=True, exist_ok=True)

    filepath = template_dir / f"{preset_id}.yaml"

    # Remove the injected 'id' key if present — it's derived from filename
    save_data = {k: v for k, v in preset_data.items() if k != "id"}

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            yaml.dump(save_data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
        print(f"[PresetManager] Saved preset: {template_id}/{preset_id}")
        return True
    except Exception as e:
        print(f"[PresetManager] Error saving preset {template_id}/{preset_id}: {e}")
        return False


def delete_preset(template_id: str, preset_id: str) -> bool:
    """Delete a preset from user directory. Returns True if deleted, False if not found."""
    user_dir = get_user_presets_dir()

    for ext in (".yaml", ".yml"):
        filepath = user_dir / template_id / f"{preset_id}{ext}"
        if filepath.is_file():
            try:
                filepath.unlink()
                print(f"[PresetManager] Deleted preset: {template_id}/{preset_id}")
                return True
            except Exception as e:
                print(f"[PresetManager] Error deleting preset {template_id}/{preset_id}: {e}")
                return False

    print(f"[PresetManager] Preset not found for deletion: {template_id}/{preset_id}")
    return False
