"""
Tests for mapping_manager module.

Verifies workflow name → template ID mapping CRUD operations.
"""

import pytest
import yaml
from pathlib import Path


# === Tests for load_mapping() ===


def test_load_mapping_returns_dict(mapping_manager):
    """load_mapping() should return a dict."""
    result = mapping_manager.load_mapping()
    assert isinstance(result, dict)


def test_load_mapping_returns_empty_when_no_file(mapping_manager, temp_dir):
    """load_mapping() should return empty dict when mapping file doesn't exist."""
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: temp_dir / "nonexistent.yaml"
    
    try:
        result = mapping_manager.load_mapping()
        assert result == {}
    finally:
        mapping_manager.get_user_mapping_file = original_func


def test_load_mapping_loads_existing_file(mapping_manager, temp_dir):
    """load_mapping() should load data from existing YAML file."""
    # Create a mapping file with flat structure
    mapping_data = {
        "My SDXL Workflow": "sdxl-txt2img",
        "Qwen Test": "qwen-image"
    }
    mapping_file = temp_dir / "mapping.yaml"
    with open(mapping_file, "w", encoding="utf-8") as f:
        yaml.dump(mapping_data, f)
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        result = mapping_manager.load_mapping()
        assert result["My SDXL Workflow"] == "sdxl-txt2img"
        assert result["Qwen Test"] == "qwen-image"
    finally:
        mapping_manager.get_user_mapping_file = original_func


# === Tests for save_mapping() ===


def test_save_mapping_creates_file(mapping_manager, temp_dir):
    """save_mapping() should create a YAML file."""
    mapping_file = temp_dir / "mapping.yaml"
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        mapping_data = {"My Workflow": "sdxl-txt2img"}
        result = mapping_manager.save_mapping(mapping_data)
        assert result is True
        assert mapping_file.exists()
    finally:
        mapping_manager.get_user_mapping_file = original_func


def test_save_mapping_writes_valid_yaml(mapping_manager, temp_dir):
    """save_mapping() should write valid YAML content."""
    mapping_file = temp_dir / "mapping.yaml"
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        mapping_data = {"My Workflow": "sdxl-txt2img", "Test": "qwen-image"}
        mapping_manager.save_mapping(mapping_data)
        
        with open(mapping_file, "r", encoding="utf-8") as f:
            loaded = yaml.safe_load(f)
        
        assert loaded["My Workflow"] == "sdxl-txt2img"
        assert loaded["Test"] == "qwen-image"
    finally:
        mapping_manager.get_user_mapping_file = original_func


def test_save_mapping_creates_parent_dirs(mapping_manager, temp_dir):
    """save_mapping() should create parent directories if they don't exist."""
    mapping_file = temp_dir / "subdir" / "mapping.yaml"
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        mapping_data = {"My Workflow": "sdxl-txt2img"}
        result = mapping_manager.save_mapping(mapping_data)
        assert result is True
        assert mapping_file.exists()
    finally:
        mapping_manager.get_user_mapping_file = original_func


# === Tests for get_mapping_entry() ===


def test_get_mapping_entry_returns_template_id(mapping_manager, temp_dir):
    """get_mapping_entry() should return template ID for known workflow name."""
    mapping_file = temp_dir / "mapping.yaml"
    mapping_data = {"My SDXL Workflow": "sdxl-txt2img"}
    with open(mapping_file, "w", encoding="utf-8") as f:
        yaml.dump(mapping_data, f)
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        result = mapping_manager.get_mapping_entry("My SDXL Workflow")
        assert result == "sdxl-txt2img"
    finally:
        mapping_manager.get_user_mapping_file = original_func


def test_get_mapping_entry_returns_none_for_unknown(mapping_manager, temp_dir):
    """get_mapping_entry() should return None for unknown workflow name."""
    mapping_file = temp_dir / "mapping.yaml"
    mapping_data = {"My SDXL Workflow": "sdxl-txt2img"}
    with open(mapping_file, "w", encoding="utf-8") as f:
        yaml.dump(mapping_data, f)
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        result = mapping_manager.get_mapping_entry("Unknown Workflow")
        assert result is None
    finally:
        mapping_manager.get_user_mapping_file = original_func


# === Tests for set_mapping_entry() ===


def test_set_mapping_entry_adds_new_entry(mapping_manager, temp_dir):
    """set_mapping_entry() should add a new workflow→template mapping."""
    mapping_file = temp_dir / "mapping.yaml"
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        result = mapping_manager.set_mapping_entry("New Workflow", "sdxl-txt2img")
        assert result is True
        
        # Verify it was saved
        loaded = mapping_manager.load_mapping()
        assert loaded["New Workflow"] == "sdxl-txt2img"
    finally:
        mapping_manager.get_user_mapping_file = original_func


def test_set_mapping_entry_overwrites_existing(mapping_manager, temp_dir):
    """set_mapping_entry() should overwrite existing mapping for same workflow name."""
    mapping_file = temp_dir / "mapping.yaml"
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        # Set initial value
        mapping_manager.set_mapping_entry("My Workflow", "sdxl-txt2img")
        
        # Overwrite
        mapping_manager.set_mapping_entry("My Workflow", "qwen-image")
        
        # Verify overwritten
        loaded = mapping_manager.load_mapping()
        assert loaded["My Workflow"] == "qwen-image"
    finally:
        mapping_manager.get_user_mapping_file = original_func


def test_set_mapping_entry_preserves_other_entries(mapping_manager, temp_dir):
    """set_mapping_entry() should not affect other mapping entries."""
    mapping_file = temp_dir / "mapping.yaml"
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        # Set initial entries
        mapping_manager.set_mapping_entry("Workflow A", "template-a")
        mapping_manager.set_mapping_entry("Workflow B", "template-b")
        
        # Add new entry
        mapping_manager.set_mapping_entry("Workflow C", "template-c")
        
        # Verify all entries exist
        loaded = mapping_manager.load_mapping()
        assert loaded["Workflow A"] == "template-a"
        assert loaded["Workflow B"] == "template-b"
        assert loaded["Workflow C"] == "template-c"
    finally:
        mapping_manager.get_user_mapping_file = original_func


# === Tests for delete_mapping_entry() ===


def test_delete_mapping_entry_removes_entry(mapping_manager, temp_dir):
    """delete_mapping_entry() should remove the specified entry."""
    mapping_file = temp_dir / "mapping.yaml"
    mapping_data = {"My Workflow": "sdxl-txt2img", "Other": "qwen-image"}
    with open(mapping_file, "w", encoding="utf-8") as f:
        yaml.dump(mapping_data, f)
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        result = mapping_manager.delete_mapping_entry("My Workflow")
        assert result is True
        
        # Verify it was removed
        loaded = mapping_manager.load_mapping()
        assert "My Workflow" not in loaded
        assert "Other" in loaded
    finally:
        mapping_manager.get_user_mapping_file = original_func


def test_delete_mapping_entry_returns_false_for_missing(mapping_manager, temp_dir):
    """delete_mapping_entry() should return False for non-existent entry."""
    mapping_file = temp_dir / "mapping.yaml"
    
    original_func = mapping_manager.get_user_mapping_file
    mapping_manager.get_user_mapping_file = lambda: mapping_file
    
    try:
        result = mapping_manager.delete_mapping_entry("Nonexistent")
        assert result is False
    finally:
        mapping_manager.get_user_mapping_file = original_func
