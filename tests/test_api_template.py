"""
Tests for GET /preset-manager/template/{template_id} API endpoint.
"""

import pytest
import sys
import types
import importlib.util
from pathlib import Path

PLUGIN_DIR = Path(__file__).parent.parent

# Mock ComfyUI dependencies
aiohttp = types.ModuleType("aiohttp")
aiohttp.web = types.ModuleType("aiohttp.web")
sys.modules["aiohttp"] = aiohttp
sys.modules["aiohttp.web"] = aiohttp.web

server = types.ModuleType("server")
server.PromptServer = types.ModuleType("server.PromptServer")
server.PromptServer.instance = types.ModuleType("server.PromptServer.instance")
server.PromptServer.instance.routes = types.ModuleType("server.PromptServer.instance.routes")
sys.modules["server"] = server

folder_paths = types.ModuleType("folder_paths")
folder_paths.get_user_directory = lambda: "/tmp/test_user"
sys.modules["folder_paths"] = folder_paths


def _import_module(name, file_path):
    spec = importlib.util.spec_from_file_location(name, str(file_path))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def workflow_parser():
    return _import_module("workflow_parser", PLUGIN_DIR / "workflow_parser.py")


class TestGetTemplateDetail:
    """Tests for the template detail API endpoint logic."""

    def test_get_template_returns_node_mapping(self, workflow_parser):
        """get_template() should return template with node_mapping field."""
        template = workflow_parser.get_template("sdxl-txt2img")
        assert template is not None
        assert "node_mapping" in template
        assert isinstance(template["node_mapping"], dict)

    def test_get_template_node_mapping_has_params(self, workflow_parser):
        """node_mapping should contain expected parameter definitions."""
        template = workflow_parser.get_template("sdxl-txt2img")
        mapping = template["node_mapping"]

        assert "positive_prompt" in mapping
        assert "negative_prompt" in mapping
        assert "steps" in mapping
        assert "cfg" in mapping
        assert "sampler" in mapping
        assert "scheduler" in mapping
        assert "width" in mapping
        assert "height" in mapping

    def test_get_template_node_mapping_has_strategy(self, workflow_parser):
        """Each node_mapping entry should have match_strategy and class_type."""
        template = workflow_parser.get_template("sdxl-txt2img")
        mapping = template["node_mapping"]

        for param_name, param_def in mapping.items():
            assert "match_strategy" in param_def, f"{param_name} missing match_strategy"
            assert "class_type" in param_def, f"{param_name} missing class_type"
            assert "widget" in param_def, f"{param_name} missing widget"

    def test_get_template_returns_synonyms(self, workflow_parser):
        """get_template() should return template with synonyms field."""
        template = workflow_parser.get_template("sdxl-txt2img")
        assert "synonyms" in template
        assert isinstance(template["synonyms"], dict)

    def test_get_template_returns_none_for_missing(self, workflow_parser):
        """get_template() should return None for non-existent template."""
        template = workflow_parser.get_template("non-existent-template")
        assert template is None

    def test_get_template_serializable(self, workflow_parser):
        """Template should be JSON-serializable (required for API response)."""
        import json
        template = workflow_parser.get_template("sdxl-txt2img")
        # Should not raise
        json_str = json.dumps(template)
        assert len(json_str) > 0
