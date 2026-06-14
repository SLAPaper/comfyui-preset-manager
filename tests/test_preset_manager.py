"""
Tests for preset_manager module.

Verifies preset CRUD operations (load, save, delete).
"""

import pytest
import yaml
from pathlib import Path


# === Tests for load_presets() ===


def test_load_presets_returns_list(preset_manager):
    """load_presets() should return a list of preset dicts."""
    result = preset_manager.load_presets("sdxl-txt2img")
    assert isinstance(result, list)


def test_load_presets_includes_bundled_presets(preset_manager):
    """load_presets() should include presets from bundled presets/ directory."""
    result = preset_manager.load_presets("sdxl-txt2img")
    # We know _default.yaml exists in presets/sdxl-txt2img/
    preset_ids = [p["id"] for p in result]
    assert "_default" in preset_ids


def test_load_presets_preset_has_required_keys(preset_manager):
    """Each preset should have id, name, workflow_template, params keys."""
    result = preset_manager.load_presets("sdxl-txt2img")
    for preset in result:
        assert "id" in preset, f"Preset missing 'id'"
        assert "name" in preset, f"Preset {preset.get('id')} missing 'name'"
        assert "workflow_template" in preset, f"Preset {preset.get('id')} missing 'workflow_template'"
        assert "params" in preset, f"Preset {preset.get('id')} missing 'params'"


def test_load_presets_returns_empty_for_missing_template(preset_manager):
    """load_presets() should return empty list for non-existent template."""
    result = preset_manager.load_presets("non-existent-template")
    assert result == []


# === Tests for get_preset() ===


def test_get_preset_returns_existing_preset(preset_manager):
    """get_preset() should return preset data for existing preset."""
    result = preset_manager.get_preset("sdxl-txt2img", "_default")
    assert result is not None
    assert result["name"] == "默认配置"


def test_get_preset_returns_none_for_missing(preset_manager):
    """get_preset() should return None for non-existent preset."""
    result = preset_manager.get_preset("sdxl-txt2img", "non-existent")
    assert result is None


def test_get_preset_includes_params(preset_manager):
    """get_preset() should return preset with params dict."""
    result = preset_manager.get_preset("sdxl-txt2img", "_default")
    assert "params" in result
    assert isinstance(result["params"], dict)


def test_get_preset_injects_id(preset_manager):
    """get_preset() should inject 'id' field from filename."""
    result = preset_manager.get_preset("sdxl-txt2img", "_default")
    assert result["id"] == "_default"


# === Tests for save_preset() ===


def test_save_preset_creates_file(preset_manager, temp_dir):
    """save_preset() should create a YAML file in user directory."""
    # Monkey-patch user dir
    original_func = preset_manager.get_user_presets_dir
    preset_manager.get_user_presets_dir = lambda: temp_dir
    
    try:
        preset_data = {
            "name": "Test Preset",
            "description": "A test preset",
            "workflow_template": "sdxl-txt2img",
            "params": {"steps": 30}
        }
        
        result = preset_manager.save_preset("sdxl-txt2img", "test-preset", preset_data)
        assert result is True
        
        # Verify file exists
        filepath = temp_dir / "sdxl-txt2img" / "test-preset.yaml"
        assert filepath.exists()
    finally:
        preset_manager.get_user_presets_dir = original_func


def test_save_preset_writes_valid_yaml(preset_manager, temp_dir):
    """save_preset() should write valid YAML content."""
    original_func = preset_manager.get_user_presets_dir
    preset_manager.get_user_presets_dir = lambda: temp_dir
    
    try:
        preset_data = {
            "name": "Test Preset",
            "description": "A test preset",
            "workflow_template": "sdxl-txt2img",
            "params": {"steps": 30, "cfg": 7.0}
        }
        
        preset_manager.save_preset("sdxl-txt2img", "test-preset", preset_data)
        
        # Read and parse YAML
        filepath = temp_dir / "sdxl-txt2img" / "test-preset.yaml"
        with open(filepath, "r") as f:
            loaded = yaml.safe_load(f)
        
        assert loaded["name"] == "Test Preset"
        assert loaded["params"]["steps"] == 30
    finally:
        preset_manager.get_user_presets_dir = original_func


def test_save_preset_strips_id_field(preset_manager, temp_dir):
    """save_preset() should strip 'id' field before saving (derived from filename)."""
    original_func = preset_manager.get_user_presets_dir
    preset_manager.get_user_presets_dir = lambda: temp_dir
    
    try:
        preset_data = {
            "id": "should-be-stripped",
            "name": "Test Preset",
            "workflow_template": "sdxl-txt2img",
            "params": {}
        }
        
        preset_manager.save_preset("sdxl-txt2img", "test-preset", preset_data)
        
        # Read YAML - should not have 'id' key
        filepath = temp_dir / "sdxl-txt2img" / "test-preset.yaml"
        with open(filepath, "r") as f:
            loaded = yaml.safe_load(f)
        
        assert "id" not in loaded
    finally:
        preset_manager.get_user_presets_dir = original_func


def test_save_preset_overwrites_existing(preset_manager, temp_dir):
    """save_preset() should overwrite existing preset with same ID."""
    original_func = preset_manager.get_user_presets_dir
    preset_manager.get_user_presets_dir = lambda: temp_dir
    
    try:
        # Save first version
        preset_manager.save_preset("sdxl-txt2img", "test", {"name": "V1", "params": {}})
        
        # Save second version
        preset_manager.save_preset("sdxl-txt2img", "test", {"name": "V2", "params": {}})
        
        # Should have V2
        result = preset_manager.get_preset("sdxl-txt2img", "test")
        # Note: get_preset checks user dir first, so we need to patch that too
        # For now, just verify the file content
        filepath = temp_dir / "sdxl-txt2img" / "test.yaml"
        with open(filepath, "r") as f:
            loaded = yaml.safe_load(f)
        assert loaded["name"] == "V2"
    finally:
        preset_manager.get_user_presets_dir = original_func


# === Tests for delete_preset() ===


def test_delete_preset_removes_file(preset_manager, temp_dir):
    """delete_preset() should remove the preset file."""
    original_func = preset_manager.get_user_presets_dir
    preset_manager.get_user_presets_dir = lambda: temp_dir
    
    try:
        # Create a preset first
        preset_dir = temp_dir / "sdxl-txt2img"
        preset_dir.mkdir(parents=True)
        filepath = preset_dir / "to-delete.yaml"
        with open(filepath, "w") as f:
            yaml.dump({"name": "Delete Me"}, f)
        
        # Delete it
        result = preset_manager.delete_preset("sdxl-txt2img", "to-delete")
        assert result is True
        assert not filepath.exists()
    finally:
        preset_manager.get_user_presets_dir = original_func


def test_delete_preset_returns_false_for_missing(preset_manager, temp_dir):
    """delete_preset() should return False for non-existent preset."""
    original_func = preset_manager.get_user_presets_dir
    preset_manager.get_user_presets_dir = lambda: temp_dir
    
    try:
        result = preset_manager.delete_preset("sdxl-txt2img", "non-existent")
        assert result is False
    finally:
        preset_manager.get_user_presets_dir = original_func


def test_delete_preset_logs_deletion(preset_manager, temp_dir, capsys):
    """delete_preset() should log deletion."""
    original_func = preset_manager.get_user_presets_dir
    preset_manager.get_user_presets_dir = lambda: temp_dir
    
    try:
        # Create a preset
        preset_dir = temp_dir / "sdxl-txt2img"
        preset_dir.mkdir(parents=True)
        with open(preset_dir / "to-delete.yaml", "w") as f:
            yaml.dump({"name": "Delete Me"}, f)
        
        preset_manager.delete_preset("sdxl-txt2img", "to-delete")
        captured = capsys.readouterr()
        assert "Deleted preset" in captured.out
    finally:
        preset_manager.get_user_presets_dir = original_func
