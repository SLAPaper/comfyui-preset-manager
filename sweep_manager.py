"""
Sweep config CRUD and combination expansion for ComfyUI Preset Manager.

A sweep defines one or more axes of parameter values. Expanding a sweep produces
the cartesian product of those axes, with axes[0] as the outermost loop.
Later axes override earlier ones on key conflict.

Sweeps live only in the user directory; there are no bundled sweeps.
"""

import itertools
from pathlib import Path

import yaml
import folder_paths


def get_user_sweeps_dir() -> Path:
    """User sweeps directory: <user>/preset-manager/sweeps/"""
    user_dir = Path(folder_paths.get_user_directory())
    return user_dir / "preset-manager" / "sweeps"


def _axis_params(axis: dict, value, presets: dict) -> dict:
    """Resolve one axis value into the params it contributes."""
    if axis.get("type") == "preset":
        preset = presets.get(value)
        if preset is None:
            raise KeyError(f"预设不存在: {value}")
        return dict(preset.get("params", {}))
    return {axis["param"]: value}


def _axis_label(axis: dict, value) -> str:
    key = "preset" if axis.get("type") == "preset" else axis["param"]
    return f"{key}={value}"


def expand(sweep: dict, presets: dict) -> list[dict]:
    """
    Expand a sweep into its list of combinations.

    Args:
        sweep: Sweep config with an axes list
        presets: {preset_id: {params: {...}}} used to resolve preset axes

    Returns:
        [{"params": {...}, "label": "cfg=3, preset=anime"}, ...]

    Raises:
        KeyError: A preset axis references an unknown preset.
    """
    axes = sweep.get("axes", [])
    if not axes:
        return []

    combos = []
    for values in itertools.product(*(axis["values"] for axis in axes)):
        params = {}
        for axis, value in zip(axes, values):
            params.update(_axis_params(axis, value, presets))
        label = ", ".join(_axis_label(axis, value) for axis, value in zip(axes, values))
        combos.append({"params": params, "label": label})

    return combos


def load_sweeps(template_id: str) -> list[dict]:
    """List sweeps for a template as {id, name, description} summaries."""
    directory = get_user_sweeps_dir() / template_id
    if not directory.is_dir():
        return []

    sweeps = []
    for filepath in sorted(directory.glob("*.yaml")):
        data = yaml.safe_load(filepath.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            continue
        sweeps.append({
            "id": filepath.stem,
            "name": data.get("name", filepath.stem),
            "description": data.get("description", ""),
        })
    return sweeps


def get_sweep(template_id: str, sweep_id: str) -> dict | None:
    """Load a full sweep config, or None if it does not exist."""
    filepath = get_user_sweeps_dir() / template_id / f"{sweep_id}.yaml"
    if not filepath.is_file():
        return None
    return yaml.safe_load(filepath.read_text(encoding="utf-8"))


def save_sweep(template_id: str, sweep_id: str, data: dict) -> None:
    """Write a sweep config, overwriting any existing one."""
    directory = get_user_sweeps_dir() / template_id
    directory.mkdir(parents=True, exist_ok=True)
    filepath = directory / f"{sweep_id}.yaml"
    filepath.write_text(
        yaml.dump(data, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )


def delete_sweep(template_id: str, sweep_id: str) -> bool:
    """Delete a sweep config. Returns False if it did not exist."""
    filepath = get_user_sweeps_dir() / template_id / f"{sweep_id}.yaml"
    if not filepath.is_file():
        return False
    filepath.unlink()
    return True
