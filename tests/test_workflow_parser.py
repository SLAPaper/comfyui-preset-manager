"""
Tests for workflow_parser module.

Verifies template discovery, loading, and parsing functionality.
"""

import yaml


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


def test_shared_include_is_merged_and_not_a_template(workflow_parser):
    """The shared loader file is merged into templates and skipped by discovery."""
    result = workflow_parser.load_templates()
    assert "_loaders" not in result

    for template_id, template_data in result.items():
        node_mapping = template_data["node_mapping"]
        assert "unet_name" in node_mapping, f"Template {template_id} missing shared loaders"
        assert "include" not in template_data


def test_shared_loader_params_are_not_selected_by_default(workflow_parser):
    """Model files stay unchecked in the preset editor; other params stay checked."""
    template = workflow_parser.get_template("sdxl-txt2img")
    assert template["node_mapping"]["ckpt_name"]["default_selected"] is False
    assert "default_selected" not in template["node_mapping"]["steps"]


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


def test_get_template_hides_shared_fragment(workflow_parser):
    """Shared include files are not addressable as templates."""
    assert workflow_parser.get_template("_loaders") is None


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
        "node_mapping": {
            "steps": {
                "match_strategy": "unique_class",
                "class_type": "KSampler",
                "widget": "steps",
            }
        },
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


def test_invalid_user_template_does_not_claim_bundled_source(workflow_parser, temp_dir):
    """A broken user file falls back to the bundled template and source."""
    with open(temp_dir / "sdxl-txt2img.yaml", "w") as f:
        yaml.dump({"node_mapping": {}}, f)

    original_func = workflow_parser._get_user_workflows_dir
    workflow_parser._get_user_workflows_dir = lambda: temp_dir
    try:
        assert workflow_parser.get_template("sdxl-txt2img")["name"] == "SDXL Text to Image"
        assert workflow_parser.template_source("sdxl-txt2img") == "bundled"
    finally:
        workflow_parser._get_user_workflows_dir = original_func


def test_user_template_can_use_yml_extension(workflow_parser, temp_dir):
    with open(temp_dir / "custom.yml", "w") as f:
        yaml.dump(_custom_template(), f)

    original_func = workflow_parser._get_user_workflows_dir
    workflow_parser._get_user_workflows_dir = lambda: temp_dir
    try:
        assert workflow_parser.get_template("custom")["name"] == "Custom workflow"
        assert workflow_parser.template_source("custom") == "user"
    finally:
        workflow_parser._get_user_workflows_dir = original_func


# === Tests for save_template() ===


def _custom_template():
    return {
        "name": "Custom workflow",
        "description": "Saved from the analyzer",
        "node_mapping": {
            "steps": {
                "match_strategy": "unique_class",
                "class_type": "KSampler",
                "widget": "steps",
            }
        },
        "synonyms": {"KSamplerAdvanced": "KSampler"},
    }


def test_save_template_round_trips_through_get_template(workflow_parser, temp_dir):
    original_func = workflow_parser._get_user_workflows_dir
    workflow_parser._get_user_workflows_dir = lambda: temp_dir

    try:
        assert workflow_parser.save_template("custom-flow", _custom_template())
        assert (temp_dir / "custom-flow.yaml").is_file()

        result = workflow_parser.get_template("custom-flow")
        assert result["name"] == "Custom workflow"
        assert result["node_mapping"]["steps"]["widget"] == "steps"
        assert result["synonyms"] == {"KSamplerAdvanced": "KSampler"}
        assert "id" not in result
    finally:
        workflow_parser._get_user_workflows_dir = original_func


def test_save_template_reports_user_source(workflow_parser, temp_dir):
    original_func = workflow_parser._get_user_workflows_dir
    workflow_parser._get_user_workflows_dir = lambda: temp_dir

    try:
        assert workflow_parser.template_source("sdxl-txt2img") == "bundled"
        assert workflow_parser.save_template("sdxl-txt2img", _custom_template())
        assert workflow_parser.template_source("sdxl-txt2img") == "user"
    finally:
        workflow_parser._get_user_workflows_dir = original_func


def test_delete_template_removes_only_user_files(workflow_parser, temp_dir):
    original_func = workflow_parser._get_user_workflows_dir
    workflow_parser._get_user_workflows_dir = lambda: temp_dir
    try:
        assert workflow_parser.save_template("custom-flow", _custom_template())
        assert workflow_parser.delete_template("custom-flow") is True
        assert workflow_parser.get_template("custom-flow") is None
        assert workflow_parser.template_source("custom-flow") is None

        assert workflow_parser.delete_template("sdxl-txt2img") is False
        assert workflow_parser.get_template("sdxl-txt2img") is not None
        assert workflow_parser.delete_template("_loaders") is False
        assert workflow_parser.delete_template("../escape") is False
    finally:
        workflow_parser._get_user_workflows_dir = original_func


def test_delete_template_removes_both_extensions(workflow_parser, temp_dir):
    with open(temp_dir / "legacy.yaml", "w") as f:
        yaml.dump(_custom_template(), f)
    with open(temp_dir / "legacy.yml", "w") as f:
        yaml.dump(_custom_template(), f)

    original_func = workflow_parser._get_user_workflows_dir
    workflow_parser._get_user_workflows_dir = lambda: temp_dir
    try:
        assert workflow_parser.delete_template("legacy") is True
        assert not (temp_dir / "legacy.yaml").exists()
        assert not (temp_dir / "legacy.yml").exists()
    finally:
        workflow_parser._get_user_workflows_dir = original_func


def test_save_template_rejects_invalid_ids_and_data(workflow_parser, temp_dir):
    original_func = workflow_parser._get_user_workflows_dir
    workflow_parser._get_user_workflows_dir = lambda: temp_dir

    try:
        assert not workflow_parser.save_template("_shared", _custom_template())
        assert not workflow_parser.save_template("../escape", _custom_template())
        assert not workflow_parser.save_template("custom-flow", {"node_mapping": {}})
        assert not workflow_parser.save_template("custom-flow", {
            "name": "",
            "node_mapping": _custom_template()["node_mapping"],
        })

        broken = _custom_template()
        broken["node_mapping"]["steps"]["match_strategy"] = "unknown"
        assert not workflow_parser.save_template("custom-flow", broken)
    finally:
        workflow_parser._get_user_workflows_dir = original_func
