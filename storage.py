"""
Shared YAML storage for ComfyUI Preset Manager.

Owns path safety, atomic writes, and user-directory lookup. Domain modules
decide which layers and fields they need.
"""

import os
import tempfile
from pathlib import Path

import yaml

INVALID_ID_CHARS = frozenset('/\\:*?"<>|\x00')
WINDOWS_RESERVED_NAMES = frozenset({
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
})


def is_safe_id(value) -> bool:
    """IDs become file names, so reject path syntax and platform traps."""
    if not isinstance(value, str) or value in ("", ".", ".."):
        return False
    if value != value.strip() or value.startswith(".") or value.endswith("."):
        return False
    if any(ch in INVALID_ID_CHARS or ord(ch) < 32 or ord(ch) == 127 for ch in value):
        return False
    return value.split(".", 1)[0].upper() not in WINDOWS_RESERVED_NAMES


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


def find_yaml_file(directory: Path, stem: str) -> Path | None:
    """Find a YAML file by stem, preferring .yaml over .yml."""
    for ext in (".yaml", ".yml"):
        filepath = directory / f"{stem}{ext}"
        if filepath.is_file():
            return filepath
    return None


def remove_alternate_yaml(path: Path) -> None:
    """Remove the other extension after a .yaml write so the old file cannot resurface."""
    for ext in (".yaml", ".yml"):
        alternate = path.with_suffix(ext)
        if alternate == path or not alternate.is_file():
            continue
        try:
            alternate.unlink()
        except OSError as e:
            print(f"[PresetManager] Error removing {alternate}: {e}")


def scan_yaml(directory: Path) -> dict[str, dict]:
    """Load every YAML file in a directory, keyed by filename stem.
    When both extensions exist, .yaml is the effective file.
    """
    result = {}
    if not directory.is_dir():
        return result

    paths = {}
    for filepath in sorted(directory.iterdir()):
        if filepath.suffix not in (".yaml", ".yml") or not filepath.is_file():
            continue
        previous = paths.get(filepath.stem)
        if previous is None or filepath.suffix == ".yaml":
            paths[filepath.stem] = filepath

    for stem in sorted(paths):
        data = load_yaml(paths[stem])
        if data is not None:
            result[stem] = data
    return result
