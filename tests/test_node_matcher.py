"""
Tests for node_matcher module.

Verifies node matching algorithms (unique_class, title_keyword) and preset application.
"""

import pytest
from copy import deepcopy


# === Tests for match_nodes() ===


def test_match_nodes_returns_dict(node_matcher, sample_workflow, sample_template):
    """match_nodes() should return a dict mapping param_name to MatchResult."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert isinstance(result, dict)


def test_match_nodes_matches_unique_class_sampler(node_matcher, sample_workflow, sample_template):
    """unique_class strategy should match KSampler for sampler parameter."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["sampler"] is not None
    assert result["sampler"].node_id == "3"
    assert result["sampler"].widget_name == "sampler_name"


def test_match_nodes_matches_unique_class_steps(node_matcher, sample_workflow, sample_template):
    """unique_class strategy should match KSampler for steps parameter."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["steps"] is not None
    assert result["steps"].node_id == "3"
    assert result["steps"].widget_name == "steps"


def test_match_nodes_matches_unique_class_dimensions(node_matcher, sample_workflow, sample_template):
    """unique_class strategy should match EmptyLatentImage for width/height."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["width"] is not None
    assert result["width"].node_id == "5"
    assert result["height"] is not None
    assert result["height"].node_id == "5"


def test_match_nodes_matches_title_keyword_positive(node_matcher, sample_workflow, sample_template):
    """title_keyword strategy should match CLIPTextEncode with 'positive' in title."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["positive_prompt"] is not None
    assert result["positive_prompt"].node_id == "6"
    assert result["positive_prompt"].widget_name == "text"


def test_match_nodes_matches_title_keyword_negative(node_matcher, sample_workflow, sample_template):
    """title_keyword strategy should match CLIPTextEncode with 'negative' in title."""
    result = node_matcher.match_nodes(sample_workflow, sample_template)
    assert result["negative_prompt"] is not None
    assert result["negative_prompt"].node_id == "7"
    assert result["negative_prompt"].widget_name == "text"


def test_match_nodes_returns_none_for_missing_node(node_matcher, sample_template):
    """match_nodes() should return None for parameters with no matching node."""
    # Workflow without CLIPTextEncode nodes
    workflow = {
        "3": {
            "class_type": "KSampler",
            "inputs": {"steps": 20},
            "_meta": {"title": "KSampler"}
        }
    }
    result = node_matcher.match_nodes(workflow, sample_template)
    assert result["positive_prompt"] is None
    assert result["negative_prompt"] is None


def test_match_nodes_logs_success(node_matcher, sample_workflow, sample_template, capsys):
    """match_nodes() should log successful matches."""
    node_matcher.match_nodes(sample_workflow, sample_template)
    captured = capsys.readouterr()
    assert "[PresetManager] 匹配" in captured.out


def test_match_nodes_logs_failure(node_matcher, sample_template, capsys):
    """match_nodes() should log warnings for failed non-optional matches."""
    workflow = {"3": {"class_type": "KSampler", "inputs": {}, "_meta": {}}}
    node_matcher.match_nodes(workflow, sample_template)
    captured = capsys.readouterr()
    assert "[WARN] 匹配失败" in captured.out


# === Tests for synonym handling ===


def test_match_nodes_handles_synonyms(node_matcher, sample_template):
    """match_nodes() should handle class_type synonyms (KSamplerAdvanced -> KSampler)."""
    workflow = {
        "3": {
            "class_type": "KSamplerAdvanced",  # Synonym for KSampler
            "inputs": {"sampler_name": "euler", "steps": 20},
            "_meta": {"title": "KSampler"}
        }
    }
    result = node_matcher.match_nodes(workflow, sample_template)
    assert result["sampler"] is not None
    assert result["sampler"].node_id == "3"


# === Tests for apply_preset() ===


def test_apply_preset_returns_modified_workflow(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should return a modified workflow dict."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert isinstance(result, dict)


def test_apply_preset_does_not_modify_original(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should NOT modify the original workflow."""
    original_steps = sample_workflow["3"]["inputs"]["steps"]
    node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert sample_workflow["3"]["inputs"]["steps"] == original_steps


def test_apply_preset_injects_positive_prompt(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject positive_prompt into matched CLIPTextEncode node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert result["6"]["inputs"]["text"] == "masterpiece, best quality, ultra detailed"


def test_apply_preset_injects_negative_prompt(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject negative_prompt into matched CLIPTextEncode node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert result["7"]["inputs"]["text"] == "worst quality, low quality, blurry"


def test_apply_preset_injects_sampler(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject sampler_name into KSampler node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    # The preset has sampler: "euler_ancestral", which maps to widget sampler_name
    assert result["3"]["inputs"]["sampler_name"] == sample_preset["params"]["sampler"]


def test_apply_preset_injects_steps(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject steps into KSampler node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert result["3"]["inputs"]["steps"] == 30


def test_apply_preset_injects_dimensions(node_matcher, sample_workflow, sample_template, sample_preset):
    """apply_preset() should inject width/height into EmptyLatentImage node."""
    result = node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    assert result["5"]["inputs"]["width"] == 1024
    assert result["5"]["inputs"]["height"] == 1024


def test_apply_preset_logs_injection_summary(node_matcher, sample_workflow, sample_template, sample_preset, capsys):
    """apply_preset() should log injection summary."""
    node_matcher.apply_preset(sample_workflow, sample_template, sample_preset["params"])
    captured = capsys.readouterr()
    assert "注入完成:" in captured.out


def test_apply_preset_handles_missing_params_gracefully(node_matcher, sample_workflow, sample_template):
    """apply_preset() should handle preset with missing params gracefully."""
    partial_params = {"steps": 30}  # Only inject steps
    result = node_matcher.apply_preset(sample_workflow, sample_template, partial_params)
    assert result["3"]["inputs"]["steps"] == 30
    # Other params should remain unchanged
    assert result["3"]["inputs"]["sampler_name"] == "euler"
