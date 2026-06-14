"""
Tests for workflow_parser module.

Verifies template discovery, loading, and parsing functionality.
"""

import pytest
import yaml
from pathlib import Path


# === Tests for load_templates() ===


def test_load_templates_returns_dict(workflow_parser):
    """load_templates() should return a dict mapping template_id to template_data."""
    result = workflow_parser.load_templates()
    assert isinstance(result, dict)


def test_load_templates_includes_bundled_templates(workflow_parser):
    """load_templates() should include templates from bundled workflows/ directory."""
    result = workflow_parser.load_templates()
    # We know sdxl-txt2img.yaml exists in workflows/
    assert "sdxl-txt2img" in result


def test_load_templates_template_has_required_keys(workflow_parser):
    """Each template should have name, description, node_mapping keys."""
    result = workflow_parser.load_templates()
    for template_id, template_data in result.items():
        assert "name" in template_data, f"Template {template_id} missing 'name'"
        assert "node_mapping" in template_data, f"Template {template_id} missing 'node_mapping'"


def test_load_templates_logs_template_count(workflow_parser, capsys):
    """load_templates() should log template loading with parameter count."""
    workflow_parser.load_templates()
    captured = capsys.readouterr()
    assert "[PresetManager] 加载模板:" in captured.out


# === Tests for get_template() ===


def test_get_template_returns_existing_template(workflow_parser):
    """get_template() should return template data for existing template."""
    result = workflow_parser.get_template("sdxl-txt2img")
    assert result is not None
    assert result["name"] == "SDXL Text to Image"


def test_get_template_returns_none_for_missing(workflow_parser):
    """get_template() should return None for non-existent template."""
    result = workflow_parser.get_template("non-existent-template")
    assert result is None


def test_get_template_includes_node_mapping(workflow_parser):
    """get_template() should return template with node_mapping dict."""
    result = workflow_parser.get_template("sdxl-txt2img")
    assert "node_mapping" in result
    assert isinstance(result["node_mapping"], dict)


def test_get_template_includes_synonyms(workflow_parser):
    """get_template() should return template with synonyms dict."""
    result = workflow_parser.get_template("sdxl-txt2img")
    assert "synonyms" in result
    assert isinstance(result["synonyms"], dict)


# === Tests for user directory override ===


def test_user_templates_override_bundled(workflow_parser, temp_dir):
    """User templates should override bundled templates with same ID."""
    # Create a user workflow template
    user_workflows_dir = temp_dir / "workflows"
    user_workflows_dir.mkdir()
    
    custom_template = {
        "name": "Custom SDXL",
        "description": "User customized template",
        "node_mapping": {}
    }
    
    with open(user_workflows_dir / "sdxl-txt2img.yaml", "w") as f:
        yaml.dump(custom_template, f)
    
    # Monkey-patch the user dir function
    original_func = workflow_parser._get_user_workflows_dir
    workflow_parser._get_user_workflows_dir = lambda: user_workflows_dir
    
    try:
        result = workflow_parser.get_template("sdxl-txt2img")
        assert result["name"] == "Custom SDXL"
    finally:
        workflow_parser._get_user_workflows_dir = original_func
