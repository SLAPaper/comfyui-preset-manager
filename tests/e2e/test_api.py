"""
E2E tests for Preset Manager API endpoints.
"""

import pytest
import httpx

import pytest


@pytest.mark.e2e
class TestTemplateAPI:
    """Test template detail API endpoint."""

    def test_get_template_detail(self, api_base):
        """GET /preset-manager/template/sdxl-txt2img returns full template."""
        resp = httpx.get(f"{api_base}/preset-manager/template/sdxl-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert "node_mapping" in data
        assert "synonyms" in data
        assert "positive_prompt" in data["node_mapping"]

    def test_get_template_detail_404(self, api_base):
        """GET /preset-manager/template/non-existent returns 404."""
        resp = httpx.get(f"{api_base}/preset-manager/template/non-existent", timeout=10)
        assert resp.status_code == 404

    def test_get_workflows(self, api_base):
        """GET /preset-manager/workflows returns list of templates."""
        resp = httpx.get(f"{api_base}/preset-manager/workflows", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert any(t["id"] == "sdxl-txt2img" for t in data)

    def test_get_presets(self, api_base):
        """GET /preset-manager/presets/sdxl-txt2img returns preset list."""
        resp = httpx.get(f"{api_base}/preset-manager/presets/sdxl-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert any(p["id"] == "_default" for p in data)

    def test_get_preset_detail(self, api_base):
        """GET /preset-manager/preset/sdxl-txt2img/_default returns preset."""
        resp = httpx.get(f"{api_base}/preset-manager/preset/sdxl-txt2img/_default", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert "params" in data
        assert "positive_prompt" in data["params"]


@pytest.mark.e2e
class TestQwenImageTemplate:
    """Test that Qwen Image template works alongside SDXL."""

    def test_workflows_include_qwen_image(self, api_base):
        """GET /preset-manager/workflows should include qwen-image-txt2img."""
        resp = httpx.get(f"{api_base}/preset-manager/workflows", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        ids = [t["id"] for t in data]
        assert "qwen-image-txt2img" in ids

    def test_qwen_image_template_has_correct_mapping(self, api_base):
        """Qwen Image template should use EmptySD3LatentImage for width/height."""
        resp = httpx.get(f"{api_base}/preset-manager/template/qwen-image-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["width"]["class_type"] == "EmptySD3LatentImage"
        assert mapping["height"]["class_type"] == "EmptySD3LatentImage"
        assert mapping["steps"]["class_type"] == "KSampler"
        assert "Positive Prompt" in mapping["positive_prompt"]["title_keywords"]

    def test_qwen_image_has_presets(self, api_base):
        """GET /preset-manager/presets/qwen-image-txt2img should return presets."""
        resp = httpx.get(f"{api_base}/preset-manager/presets/qwen-image-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert any(p["id"] == "_default" for p in data)

    def test_qwen_image_default_preset_values(self, api_base):
        """Qwen Image default preset should have correct values."""
        resp = httpx.get(f"{api_base}/preset-manager/preset/qwen-image-txt2img/_default", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        params = data["params"]
        assert params["width"] == 1328
        assert params["height"] == 1328
        assert params["steps"] == 8
        assert params["cfg"] == 1.5


@pytest.mark.e2e
class TestFluxTemplate:
    """Test that Flux template works with different node architecture."""

    def test_workflows_include_flux(self, api_base):
        """GET /preset-manager/workflows should include flux-txt2img."""
        resp = httpx.get(f"{api_base}/preset-manager/workflows", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        ids = [t["id"] for t in data]
        assert "flux-txt2img" in ids

    def test_flux_template_uses_correct_nodes(self, api_base):
        """Flux template should use BasicScheduler/KSamplerSelect/FluxGuidance/RandomNoise."""
        resp = httpx.get(f"{api_base}/preset-manager/template/flux-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["steps"]["class_type"] == "BasicScheduler"
        assert mapping["sampler"]["class_type"] == "KSamplerSelect"
        assert mapping["cfg"]["class_type"] == "FluxGuidance"
        assert mapping["seed"]["class_type"] == "RandomNoise"
        assert mapping["denoise"]["class_type"] == "BasicScheduler"

    def test_flux_template_uses_title_keyword_for_size(self, api_base):
        """Flux template should use title_keyword for width/height on PrimitiveInt."""
        resp = httpx.get(f"{api_base}/preset-manager/template/flux-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["width"]["match_strategy"] == "title_keyword"
        assert mapping["width"]["class_type"] == "PrimitiveInt"
        assert "宽度" in mapping["width"]["title_keywords"]

        assert mapping["height"]["match_strategy"] == "title_keyword"
        assert mapping["height"]["class_type"] == "PrimitiveInt"
        assert "高度" in mapping["height"]["title_keywords"]

    def test_flux_template_negative_prompt_optional(self, api_base):
        """Flux template should mark negative_prompt as optional."""
        resp = httpx.get(f"{api_base}/preset-manager/template/flux-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["negative_prompt"]["optional"] is True

    def test_flux_has_presets(self, api_base):
        """GET /preset-manager/presets/flux-txt2img should return presets."""
        resp = httpx.get(f"{api_base}/preset-manager/presets/flux-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert any(p["id"] == "_default" for p in data)

    def test_flux_default_preset_values(self, api_base):
        """Flux default preset should have correct values."""
        resp = httpx.get(f"{api_base}/preset-manager/preset/flux-txt2img/_default", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        params = data["params"]
        assert params["steps"] == 20
        assert params["cfg"] == 3.5
        assert params["sampler"] == "euler"
        assert params["width"] == 768
        assert params["height"] == 1280
        assert params["denoise"] == 1.0
