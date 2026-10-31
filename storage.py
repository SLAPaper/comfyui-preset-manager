"""
Shared YAML storage for ComfyUI Preset Manager.

Owns path safety, atomic writes, and user-directory lookup. Domain modules
decide which layers and fields they need.
"""

import os
import tempfile
from pathlib import Path

import yaml


def is_safe_id(value) -> bool:
    """IDs become file and folder names, so they must not contain path syntax."""
    return (
        isinstance(value, str)
        and value not in ("", ".", "..")
        and "/" not in value
        and "\\" not in value
        and ":" not in value
        and "\x00" not in value
    )


def require_safe_id(*values) -> None:
    """Raise ValueError for an ID that could escape its storage directory."""
    for value in values:
        if not is_safe_id(value):
            raise ValueError(f"Invalid id: {value!r}")


def user_dir(*parts: str) -> Path:
    """Return a directory under user/preset-manager/, creating it if needed."""
    import folder_paths

    path = Path(folder_paths.get_user_directory()) / "preset-manager"
    for part in parts:
        path = path / part
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_yaml(path: Path) -> dict | None:
    """Load a YAML mapping, or return None when the file is missing or invalid."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except FileNotFoundError:
        return None
    except Exception as e:
        print(f"[PresetManager] Error loading {path}: {e}")
        return None
    if not isinstance(data, dict):
        print(f"[PresetManager] Warning: {path} did not contain a valid dict")
        return None
    return data


def save_yaml(path: Path, data: dict) -> bool:
    """Write a YAML mapping atomically. Returns True on success."""
    tmp_path = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
        os.replace(tmp_path, path)
        return True
    except Exception as e:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        print(f"[PresetManager] Error saving {path}: {e}")
        return False


def scan_yaml(directory: Path) -> dict[str, dict]:
    """Load every YAML file in a directory, keyed by filename stem."""
    result = {}
    if not directory.is_dir():
        return result
    for filepath in sorted(directory.iterdir()):
        if filepath.suffix in (".yaml", ".yml") and filepath.is_file():
            data = load_yaml(filepath)
            if data is not None:
                result[filepath.stem] = data
    return result
