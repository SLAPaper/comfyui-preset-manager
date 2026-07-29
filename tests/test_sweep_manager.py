"""
Tests for sweep_manager module.

Verifies sweep config CRUD and combination expansion.
"""

import pytest
import yaml
from pathlib import Path


# === Tests for expand() ===


def test_expand_single_param_axis(sweep_manager):
    """A single param axis should produce one combination per value."""
    sweep = {
        "axes": [
            {"type": "param", "param": "cfg", "values": [1.5, 3, 5.5]}
        ]
    }
    combos = sweep_manager.expand(sweep, presets={})

    assert len(combos) == 3
    assert combos[0]["params"] == {"cfg": 1.5}
    assert combos[1]["params"] == {"cfg": 3}
    assert combos[2]["params"] == {"cfg": 5.5}


def test_expand_cartesian_product(sweep_manager):
    """Multiple axes should produce the cartesian product."""
    sweep = {
        "axes": [
            {"type": "param", "param": "cfg", "values": [1, 2]},
            {"type": "param", "param": "steps", "values": [10, 20, 30]},
        ]
    }
    combos = sweep_manager.expand(sweep, presets={})

    assert len(combos) == 6


def test_expand_first_axis_is_outermost(sweep_manager):
    """axes[0] should be the outermost loop (varies slowest)."""
    sweep = {
        "axes": [
            {"type": "param", "param": "cfg", "values": [1, 2]},
            {"type": "param", "param": "steps", "values": [10, 20]},
        ]
    }
    combos = sweep_manager.expand(sweep, presets={})

    assert [c["params"] for c in combos] == [
        {"cfg": 1, "steps": 10},
        {"cfg": 1, "steps": 20},
        {"cfg": 2, "steps": 10},
        {"cfg": 2, "steps": 20},
    ]


def test_expand_resolves_preset_axis(sweep_manager):
    """A preset axis should be resolved into its params."""
    presets = {
        "anime": {"params": {"cfg": 7, "sampler": "euler"}},
        "real": {"params": {"cfg": 4, "sampler": "dpmpp_2m"}},
    }
    sweep = {
        "axes": [
            {"type": "preset", "values": ["anime", "real"]}
        ]
    }
    combos = sweep_manager.expand(sweep, presets=presets)

    assert len(combos) == 2
    assert combos[0]["params"] == {"cfg": 7, "sampler": "euler"}
    assert combos[1]["params"] == {"cfg": 4, "sampler": "dpmpp_2m"}


def test_expand_inner_axis_overrides_outer(sweep_manager):
    """Inner axis (later in list) should override outer axis on conflict."""
    presets = {"anime": {"params": {"cfg": 7, "sampler": "euler"}}}
    sweep = {
        "axes": [
            {"type": "preset", "values": ["anime"]},
            {"type": "param", "param": "cfg", "values": [2]},
        ]
    }
    combos = sweep_manager.expand(sweep, presets=presets)

    assert combos[0]["params"] == {"cfg": 2, "sampler": "euler"}


def test_expand_outer_param_overridden_by_inner_preset(sweep_manager):
    """The override rule is positional, not type-based: preset can override param."""
    presets = {"anime": {"params": {"cfg": 7}}}
    sweep = {
        "axes": [
            {"type": "param", "param": "cfg", "values": [2]},
            {"type": "preset", "values": ["anime"]},
        ]
    }
    combos = sweep_manager.expand(sweep, presets=presets)

    assert combos[0]["params"] == {"cfg": 7}


def test_expand_applies_base_preset_first(sweep_manager):
    """base_preset should be applied before all axes."""
    presets = {
        "_default": {"params": {"cfg": 5, "steps": 20, "sampler": "euler"}},
    }
    sweep = {
        "base_preset": "_default",
        "axes": [
            {"type": "param", "param": "cfg", "values": [1, 2]},
        ]
    }
    combos = sweep_manager.expand(sweep, presets=presets)

    assert combos[0]["params"] == {"cfg": 1, "steps": 20, "sampler": "euler"}
    assert combos[1]["params"] == {"cfg": 2, "steps": 20, "sampler": "euler"}


def test_expand_without_base_preset(sweep_manager):
    """base_preset is optional."""
    sweep = {"axes": [{"type": "param", "param": "cfg", "values": [1]}]}
    combos = sweep_manager.expand(sweep, presets={})

    assert combos[0]["params"] == {"cfg": 1}


def test_expand_generates_label(sweep_manager):
    """Each combination should carry a human-readable label."""
    presets = {"anime": {"params": {"cfg": 7}}}
    sweep = {
        "axes": [
            {"type": "param", "param": "cfg", "values": [3]},
            {"type": "preset", "values": ["anime"]},
        ]
    }
    combos = sweep_manager.expand(sweep, presets=presets)

    assert combos[0]["label"] == "cfg=3, preset=anime"


def test_expand_no_axes_returns_empty(sweep_manager):
    """A sweep with no axes has nothing to run."""
    combos = sweep_manager.expand({"axes": []}, presets={})
    assert combos == []


def test_expand_missing_preset_raises(sweep_manager):
    """Referencing an unknown preset should fail loudly, not silently skip."""
    sweep = {"axes": [{"type": "preset", "values": ["nonexistent"]}]}

    with pytest.raises(KeyError):
        sweep_manager.expand(sweep, presets={})


def test_expand_does_not_mutate_preset_params(sweep_manager):
    """Expansion must not mutate the caller's preset dicts."""
    presets = {"anime": {"params": {"cfg": 7}}}
    sweep = {
        "axes": [
            {"type": "preset", "values": ["anime"]},
            {"type": "param", "param": "cfg", "values": [1, 2]},
        ]
    }
    sweep_manager.expand(sweep, presets=presets)

    assert presets["anime"]["params"] == {"cfg": 7}


# === Tests for load_sweeps() ===


def test_load_sweeps_returns_list(sweep_manager, temp_dir):
    """load_sweeps() should return a list of sweep summaries."""
    sweep_dir = temp_dir / "sdxl-txt2img"
    sweep_dir.mkdir(parents=True)
    (sweep_dir / "cfg-scan.yaml").write_text(
        yaml.dump({"name": "CFG Scan", "axes": []}), encoding="utf-8"
    )

    original = sweep_manager.get_user_sweeps_dir
    sweep_manager.get_user_sweeps_dir = lambda: temp_dir
    try:
        sweeps = sweep_manager.load_sweeps("sdxl-txt2img")
    finally:
        sweep_manager.get_user_sweeps_dir = original

    assert len(sweeps) == 1
    assert sweeps[0]["id"] == "cfg-scan"
    assert sweeps[0]["name"] == "CFG Scan"


def test_load_sweeps_empty_when_no_dir(sweep_manager, temp_dir):
    """load_sweeps() should return empty list for unknown template."""
    original = sweep_manager.get_user_sweeps_dir
    sweep_manager.get_user_sweeps_dir = lambda: temp_dir
    try:
        sweeps = sweep_manager.load_sweeps("nonexistent")
    finally:
        sweep_manager.get_user_sweeps_dir = original

    assert sweeps == []


# === Tests for get_sweep() ===


def test_get_sweep_returns_full_config(sweep_manager, temp_dir):
    """get_sweep() should return the complete sweep config."""
    sweep_dir = temp_dir / "sdxl-txt2img"
    sweep_dir.mkdir(parents=True)
    data = {
        "name": "CFG Scan",
        "base_preset": "_default",
        "axes": [{"type": "param", "param": "cfg", "values": [1, 2]}],
    }
    (sweep_dir / "cfg-scan.yaml").write_text(yaml.dump(data), encoding="utf-8")

    original = sweep_manager.get_user_sweeps_dir
    sweep_manager.get_user_sweeps_dir = lambda: temp_dir
    try:
        sweep = sweep_manager.get_sweep("sdxl-txt2img", "cfg-scan")
    finally:
        sweep_manager.get_user_sweeps_dir = original

    assert sweep["name"] == "CFG Scan"
    assert sweep["base_preset"] == "_default"
    assert len(sweep["axes"]) == 1


def test_get_sweep_returns_none_when_missing(sweep_manager, temp_dir):
    """get_sweep() should return None for a nonexistent sweep."""
    original = sweep_manager.get_user_sweeps_dir
    sweep_manager.get_user_sweeps_dir = lambda: temp_dir
    try:
        result = sweep_manager.get_sweep("sdxl-txt2img", "nope")
    finally:
        sweep_manager.get_user_sweeps_dir = original

    assert result is None


# === Tests for save_sweep() ===


def test_save_sweep_creates_file(sweep_manager, temp_dir):
    """save_sweep() should write a YAML file."""
    original = sweep_manager.get_user_sweeps_dir
    sweep_manager.get_user_sweeps_dir = lambda: temp_dir
    try:
        sweep_manager.save_sweep("sdxl-txt2img", "my-scan", {
            "name": "My Scan",
            "axes": [{"type": "param", "param": "cfg", "values": [1, 2]}],
        })
    finally:
        sweep_manager.get_user_sweeps_dir = original

    saved = temp_dir / "sdxl-txt2img" / "my-scan.yaml"
    assert saved.exists()
    data = yaml.safe_load(saved.read_text(encoding="utf-8"))
    assert data["name"] == "My Scan"


def test_save_sweep_overwrites_existing(sweep_manager, temp_dir):
    """save_sweep() should overwrite an existing sweep."""
    original = sweep_manager.get_user_sweeps_dir
    sweep_manager.get_user_sweeps_dir = lambda: temp_dir
    try:
        sweep_manager.save_sweep("sdxl-txt2img", "s", {"name": "First", "axes": []})
        sweep_manager.save_sweep("sdxl-txt2img", "s", {"name": "Second", "axes": []})
        sweep = sweep_manager.get_sweep("sdxl-txt2img", "s")
    finally:
        sweep_manager.get_user_sweeps_dir = original

    assert sweep["name"] == "Second"


# === Tests for delete_sweep() ===


def test_delete_sweep_removes_file(sweep_manager, temp_dir):
    """delete_sweep() should remove the YAML file."""
    original = sweep_manager.get_user_sweeps_dir
    sweep_manager.get_user_sweeps_dir = lambda: temp_dir
    try:
        sweep_manager.save_sweep("sdxl-txt2img", "tmp", {"name": "Temp", "axes": []})
        result = sweep_manager.delete_sweep("sdxl-txt2img", "tmp")
    finally:
        sweep_manager.get_user_sweeps_dir = original

    assert result is True
    assert not (temp_dir / "sdxl-txt2img" / "tmp.yaml").exists()


def test_delete_sweep_returns_false_when_missing(sweep_manager, temp_dir):
    """delete_sweep() should return False for a nonexistent sweep."""
    original = sweep_manager.get_user_sweeps_dir
    sweep_manager.get_user_sweeps_dir = lambda: temp_dir
    try:
        result = sweep_manager.delete_sweep("sdxl-txt2img", "nope")
    finally:
        sweep_manager.get_user_sweeps_dir = original

    assert result is False
