"""
Preset CRUD for ComfyUI Preset Manager.

Bundled presets live in presets/{template_id}/. User presets live in
user/preset-manager/presets/{template_id}/ and override bundled presets by ID.
"""

from pathlib import Path

try:
    from .storage import load_yaml, require_safe_id, save_yaml, scan_yaml, user_dir
except ImportError:
    from storage import load_yaml, require_safe_id, save_yaml, scan_yaml, user_dir

PLUGIN_DIR = Path(__file__).parent
PRESETS_DIR = PLUGIN_DIR / "presets"


def get_user_presets_dir() -> Path:
    return user_dir("presets")


def _scan_preset_dir(directory: Path, template_id: str) -> dict[str, dict]:
    presets = scan_yaml(directory / template_id)
    for preset_id, data in presets.items():
        data["id"] = preset_id
    return presets


def load_presets(template_id: str) -> list[dict]:
    """Load bundled presets, then let user presets override them by ID."""
    require_safe_id(template_id)
    presets = _scan_preset_dir(PRESETS_DIR, template_id)
    presets.update(_scan_preset_dir(get_user_presets_dir(), template_id))
    return list(presets.values())


def _preset_file(directory: Path, template_id: str, preset_id: str) -> Path | None:
    for ext in (".yaml", ".yml"):
        filepath = directory / template_id / f"{preset_id}{ext}"
        if filepath.is_file():
            return filepath
    return None


def get_preset(template_id: str, preset_id: str) -> dict | None:
    """Load a single preset. User files take priority over bundled files."""
    require_safe_id(template_id, preset_id)

    for directory in (get_user_presets_dir(), PRESETS_DIR):
        filepath = _preset_file(directory, template_id, preset_id)
        if filepath is not None:
            data = load_yaml(filepath)
            if data is not None:
                data["id"] = preset_id
                return data

    return None


def save_preset(template_id: str, preset_id: str, preset_data: dict) -> bool:
    """Save a preset to the user directory. The ID comes from the filename."""
    require_safe_id(template_id, preset_id)

    filepath = get_user_presets_dir() / template_id / f"{preset_id}.yaml"
    save_data = {k: v for k, v in preset_data.items() if k != "id"}

    if save_yaml(filepath, save_data):
        print(f"[PresetManager] Saved preset: {template_id}/{preset_id}")
        return True
    return False


def delete_preset(template_id: str, preset_id: str) -> bool:
    """Delete a preset from the user directory. Bundled presets cannot be deleted."""
    require_safe_id(template_id, preset_id)

    filepath = _preset_file(get_user_presets_dir(), template_id, preset_id)
    if filepath is None:
        print(f"[PresetManager] Preset not found for deletion: {template_id}/{preset_id}")
        return False

    try:
        filepath.unlink()
    except OSError as e:
        print(f"[PresetManager] Error deleting preset {template_id}/{preset_id}: {e}")
        return False

    print(f"[PresetManager] Deleted preset: {template_id}/{preset_id}")
    return True
