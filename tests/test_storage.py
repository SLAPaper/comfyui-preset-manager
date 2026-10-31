"""
Tests for the storage module and ID validation at the storage interface.
"""

import pytest
import yaml


def test_is_safe_id_accepts_normal_ids(storage):
    for value in ("_default", "sdxl-txt2img", "测试扫描", "sweep-1", "a.b"):
        assert storage.is_safe_id(value)


def test_is_safe_id_rejects_path_syntax(storage):
    for value in ("", ".", "..", "a/b", "a\\b", "C:evil", "a\x00b", None, 3):
        assert not storage.is_safe_id(value)


def test_require_safe_id_raises(storage):
    with pytest.raises(ValueError):
        storage.require_safe_id("sdxl-txt2img", "../evil")


def test_save_and_load_yaml_round_trip(storage, temp_dir):
    path = temp_dir / "nested" / "item.yaml"
    data = {"name": "测试", "params": {"steps": 30}}

    assert storage.save_yaml(path, data) is True
    assert storage.load_yaml(path) == data
    assert list(path.parent.glob("*.tmp")) == []


def test_load_yaml_returns_none_for_missing_file(storage, temp_dir):
    assert storage.load_yaml(temp_dir / "missing.yaml") is None


def test_load_yaml_returns_none_for_non_mapping(storage, temp_dir):
    path = temp_dir / "list.yaml"
    path.write_text("- a\n- b\n", encoding="utf-8")
    assert storage.load_yaml(path) is None


def test_scan_yaml_keys_by_stem(storage, temp_dir):
    (temp_dir / "one.yaml").write_text(yaml.safe_dump({"name": "one"}), encoding="utf-8")
    (temp_dir / "two.yml").write_text(yaml.safe_dump({"name": "two"}), encoding="utf-8")
    (temp_dir / "notes.txt").write_text("ignored", encoding="utf-8")

    assert storage.scan_yaml(temp_dir) == {"one": {"name": "one"}, "two": {"name": "two"}}


def test_preset_manager_rejects_unsafe_ids(preset_manager):
    with pytest.raises(ValueError):
        preset_manager.load_presets("../outside")
    with pytest.raises(ValueError):
        preset_manager.save_preset("sdxl-txt2img", "..", {})


def test_sweep_manager_rejects_unsafe_ids(sweep_manager):
    with pytest.raises(ValueError):
        sweep_manager.get_sweep("sdxl-txt2img", "../outside")
    with pytest.raises(ValueError):
        sweep_manager.save_sweep("sdxl-txt2img", "..", {})
