"""
Sweep config CRUD and combination expansion for ComfyUI Preset Manager.

A sweep defines one or more axes of parameter values. Expanding a sweep produces
the cartesian product of those axes, with axes[0] as the outermost loop.
Later axes override earlier ones on key conflict.

Sweeps live only in the user directory; there are no bundled sweeps.
"""

import itertools
from pathlib import Path

try:
    from .storage import (
        find_yaml_file, load_yaml, remove_alternate_yaml, require_safe_id, save_yaml,
        scan_yaml, user_dir,
    )
except ImportError:
    from storage import (
        find_yaml_file, load_yaml, remove_alternate_yaml, require_safe_id, save_yaml,
        scan_yaml, user_dir,
    )


def get_user_sweeps_dir() -> Path:
    return user_dir("sweeps")


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
    require_safe_id(template_id)
    sweeps = scan_yaml(get_user_sweeps_dir() / template_id)
    return [
        {
            "id": sweep_id,
            "name": data.get("name", sweep_id),
            "description": data.get("description", ""),
        }
        for sweep_id, data in sweeps.items()
    ]


def _sweep_save_path(template_id: str, sweep_id: str) -> Path:
    return get_user_sweeps_dir() / template_id / f"{sweep_id}.yaml"


def _find_sweep_file(template_id: str, sweep_id: str) -> Path | None:
    return find_yaml_file(get_user_sweeps_dir() / template_id, sweep_id)


def get_sweep(template_id: str, sweep_id: str) -> dict | None:
    """Load a full sweep config, or None if it does not exist."""
    require_safe_id(template_id, sweep_id)
    filepath = _find_sweep_file(template_id, sweep_id)
    if filepath is None:
        return None
    data = load_yaml(filepath)
    if data is None:
        return None
    data["id"] = sweep_id
    data["workflow_template"] = template_id
    return data


def save_sweep(template_id: str, sweep_id: str, data: dict) -> bool:
    """Write a sweep config, overwriting any existing one."""
    require_safe_id(template_id, sweep_id)
    save_data = {
        key: value
        for key, value in data.items()
        if key not in ("id", "workflow_template")
    }
    filepath = _sweep_save_path(template_id, sweep_id)
    if not save_yaml(filepath, save_data):
        return False
    remove_alternate_yaml(filepath)
    return True


def delete_sweep(template_id: str, sweep_id: str) -> bool:
    """Delete a sweep config. Returns False if it did not exist."""
    require_safe_id(template_id, sweep_id)
    filepath = _find_sweep_file(template_id, sweep_id)
    if filepath is None:
        return False
    filepath.unlink()
    return True
