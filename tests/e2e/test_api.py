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
        assert mapping["denoise"]["class_type"] == "BasicScheduler"

    def test_flux_template_uses_output_connection(self, api_base):
        """Flux template should use output_connection for seed, width, height."""
        resp = httpx.get(f"{api_base}/preset-manager/template/flux-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["seed"]["match_strategy"] == "output_connection"
        assert mapping["seed"]["target_class_type"] == "RandomNoise"
        assert mapping["seed"]["target_input"] == "noise_seed"

        assert mapping["width"]["match_strategy"] == "output_connection"
        assert mapping["width"]["target_class_type"] == "ModelSamplingFlux"
        assert mapping["width"]["target_input"] == "width"

        assert mapping["height"]["match_strategy"] == "output_connection"
        assert mapping["height"]["target_class_type"] == "ModelSamplingFlux"
        assert mapping["height"]["target_input"] == "height"

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


@pytest.mark.e2e
class TestAnimaTemplate:
    """Test that Anima template works with input_slot strategy."""

    def test_workflows_include_anima(self, api_base):
        """GET /preset-manager/workflows should include anima-txt2img."""
        resp = httpx.get(f"{api_base}/preset-manager/workflows", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        ids = [t["id"] for t in data]
        assert "anima-txt2img" in ids

    def test_anima_template_uses_input_slot_for_prompts(self, api_base):
        """Anima template should use input_slot strategy for positive/negative prompts."""
        resp = httpx.get(f"{api_base}/preset-manager/template/anima-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["positive_prompt"]["match_strategy"] == "input_slot"
        assert mapping["positive_prompt"]["class_type"] == "KSampler"
        assert mapping["positive_prompt"]["input_name"] == "positive"
        assert mapping["positive_prompt"]["widget"] == "text"

        assert mapping["negative_prompt"]["match_strategy"] == "input_slot"
        assert mapping["negative_prompt"]["class_type"] == "KSampler"
        assert mapping["negative_prompt"]["input_name"] == "negative"

    def test_anima_template_uses_unique_class_for_sampler(self, api_base):
        """Anima template should use unique_class for sampler params."""
        resp = httpx.get(f"{api_base}/preset-manager/template/anima-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["steps"]["match_strategy"] == "unique_class"
        assert mapping["steps"]["class_type"] == "KSampler"
        assert mapping["cfg"]["match_strategy"] == "unique_class"
        assert mapping["sampler"]["match_strategy"] == "unique_class"
        assert mapping["scheduler"]["match_strategy"] == "unique_class"

    def test_anima_template_uses_empty_latent_image(self, api_base):
        """Anima template should use EmptyLatentImage for width/height."""
        resp = httpx.get(f"{api_base}/preset-manager/template/anima-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["width"]["class_type"] == "EmptyLatentImage"
        assert mapping["height"]["class_type"] == "EmptyLatentImage"

    def test_anima_has_presets(self, api_base):
        """GET /preset-manager/presets/anima-txt2img should return presets."""
        resp = httpx.get(f"{api_base}/preset-manager/presets/anima-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert any(p["id"] == "_default" for p in data)

    def test_anima_default_preset_values(self, api_base):
        """Anima default preset should have correct values."""
        resp = httpx.get(f"{api_base}/preset-manager/preset/anima-txt2img/_default", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        params = data["params"]
        assert params["width"] == 1024
        assert params["height"] == 1024
        assert params["steps"] == 35
        assert params["cfg"] == 5
        assert params["sampler"] == "euler_ancestral"
        assert params["scheduler"] == "bong_tangent"

    def test_anima_template_has_synonyms(self, api_base):
        """Anima template should have KSamplerAdvanced synonym."""
        resp = httpx.get(f"{api_base}/preset-manager/template/anima-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert "KSamplerAdvanced" in data["synonyms"]
        assert data["synonyms"]["KSamplerAdvanced"] == "KSampler"


@pytest.mark.e2e
class TestQwenImageEditTemplate:
    """Test that Qwen Image Edit template works with input_slot strategy (no width/height)."""

    def test_workflows_include_qwen_image_edit(self, api_base):
        """GET /preset-manager/workflows should include qwen-image-edit."""
        resp = httpx.get(f"{api_base}/preset-manager/workflows", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        ids = [t["id"] for t in data]
        assert "qwen-image-edit" in ids

    def test_qwen_image_edit_template_uses_input_slot(self, api_base):
        """Qwen Image Edit template should use input_slot for positive/negative prompts."""
        resp = httpx.get(f"{api_base}/preset-manager/template/qwen-image-edit", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["positive_prompt"]["match_strategy"] == "input_slot"
        assert mapping["positive_prompt"]["class_type"] == "KSampler"
        assert mapping["positive_prompt"]["input_name"] == "positive"
        assert mapping["positive_prompt"]["widget"] == "prompt"

        assert mapping["negative_prompt"]["match_strategy"] == "input_slot"
        assert mapping["negative_prompt"]["input_name"] == "negative"

    def test_qwen_image_edit_template_has_sampler_params(self, api_base):
        """Qwen Image Edit template should have steps/cfg/sampler/scheduler via unique_class."""
        resp = httpx.get(f"{api_base}/preset-manager/template/qwen-image-edit", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]

        assert mapping["steps"]["match_strategy"] == "unique_class"
        assert mapping["steps"]["class_type"] == "KSampler"
        assert mapping["cfg"]["match_strategy"] == "unique_class"
        assert mapping["sampler"]["match_strategy"] == "unique_class"
        assert mapping["scheduler"]["match_strategy"] == "unique_class"

    def test_qwen_image_edit_has_width_height(self, api_base):
        """Qwen Image Edit template should use input_slot for width/height via latent_image."""
        resp = httpx.get(f"{api_base}/preset-manager/template/qwen-image-edit", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]
        assert mapping["width"]["match_strategy"] == "input_slot"
        assert mapping["width"]["input_name"] == "latent_image"
        assert mapping["height"]["match_strategy"] == "input_slot"
        assert mapping["height"]["input_name"] == "latent_image"

    def test_qwen_image_edit_has_presets(self, api_base):
        """GET /preset-manager/presets/qwen-image-edit should return presets."""
        resp = httpx.get(f"{api_base}/preset-manager/presets/qwen-image-edit", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert any(p["id"] == "_default" for p in data)

    def test_qwen_image_edit_default_preset_values(self, api_base):
        """Qwen Image Edit default preset should have correct sampler values."""
        resp = httpx.get(f"{api_base}/preset-manager/preset/qwen-image-edit/_default", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        params = data["params"]
        assert params["steps"] == 20
        assert params["cfg"] == 2.5
        assert params["sampler"] == "euler"
        assert params["scheduler"] == "simple"
        assert params["width"] == 1328
        assert params["height"] == 1328
        assert "qwen_image_edit" in params["unet_name"]
        assert "qwen_2.5_vl_7b" in params["clip_name"]
        assert "qwen_image_vae" in params["vae_name"]

    def test_anima_template_has_loaders(self, api_base):
        """Anima template should declare unet_name/clip_name/vae_name fields."""
        resp = httpx.get(f"{api_base}/preset-manager/template/anima-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        mapping = data["node_mapping"]
        for name, class_type, widget in [
            ("unet_name", "UNETLoader", "unet_name"),
            ("clip_name", "CLIPLoader", "clip_name"),
            ("vae_name", "VAELoader", "vae_name"),
        ]:
            assert mapping[name]["match_strategy"] == "unique_class"
            assert mapping[name]["class_type"] == class_type
            assert mapping[name]["widget"] == widget

    def test_anima_default_preset_has_loaders(self, api_base):
        """Anima default preset should carry loader filenames."""
        resp = httpx.get(f"{api_base}/preset-manager/preset/anima-txt2img/_default", timeout=10)
        assert resp.status_code == 200

        params = resp.json()["params"]
        assert params["unet_name"].endswith(".safetensors")
        assert params["clip_name"].endswith(".safetensors")
        assert params["vae_name"].endswith(".safetensors")

    def test_flux_template_has_loaders(self, api_base):
        """Flux template should declare unet_name/clip_name/vae_name (no ckpt_name)."""
        resp = httpx.get(f"{api_base}/preset-manager/template/flux-txt2img", timeout=10)
        assert resp.status_code == 200
        mapping = resp.json()["node_mapping"]
        assert mapping["unet_name"]["class_type"] == "UNETLoader"
        assert mapping["clip_name"]["class_type"] == "CLIPLoader"
        assert mapping["vae_name"]["class_type"] == "VAELoader"
        # Workflows may have an unused CheckpointLoaderSimple — template shouldn't claim it
        assert "ckpt_name" not in mapping

    def test_sdxl_template_has_ckpt(self, api_base):
        """SDXL template should declare ckpt_name (CheckpointLoaderSimple)."""
        resp = httpx.get(f"{api_base}/preset-manager/template/sdxl-txt2img", timeout=10)
        assert resp.status_code == 200
        mapping = resp.json()["node_mapping"]
        assert mapping["ckpt_name"]["match_strategy"] == "unique_class"
        assert mapping["ckpt_name"]["class_type"] == "CheckpointLoaderSimple"
        assert "unet_name" not in mapping
        assert "clip_name" not in mapping

    def test_qwen_image_txt2img_template_has_loaders(self, api_base):
        """Qwen Image text-to-image template should declare unet/clip/vae loaders."""
        resp = httpx.get(f"{api_base}/preset-manager/template/qwen-image-txt2img", timeout=10)
        assert resp.status_code == 200
        mapping = resp.json()["node_mapping"]
        assert mapping["unet_name"]["class_type"] == "UNETLoader"
        assert mapping["clip_name"]["class_type"] == "CLIPLoader"
        assert mapping["vae_name"]["class_type"] == "VAELoader"


@pytest.mark.e2e
class TestSweepAPI:
    """Test sweep config CRUD and expansion endpoints."""

    TEMPLATE = "qwen-image-edit"
    SWEEP_ID = "_e2e_test_sweep"

    @pytest.fixture(autouse=True)
    def cleanup(self, api_base):
        """Remove the test sweep before and after each test."""
        url = f"{api_base}/preset-manager/sweep/{self.TEMPLATE}/{self.SWEEP_ID}"
        httpx.delete(url, timeout=10)
        yield
        httpx.delete(url, timeout=10)

    def test_sweeps_list_is_empty_initially(self, api_base):
        """GET /preset-manager/sweeps/<template> should not list a deleted sweep."""
        resp = httpx.get(f"{api_base}/preset-manager/sweeps/{self.TEMPLATE}", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert isinstance(data, list)
        assert not any(s["id"] == self.SWEEP_ID for s in data)

    def test_save_and_get_sweep(self, api_base):
        """POST then GET should round-trip a sweep config."""
        payload = {
            "workflow_template": self.TEMPLATE,
            "id": self.SWEEP_ID,
            "name": "E2E Test Sweep",
            "base_preset": "_default",
            "axes": [
                {"type": "param", "param": "cfg", "values": [1.5, 3]},
                {"type": "param", "param": "steps", "values": [10, 20]},
            ],
        }
        resp = httpx.post(f"{api_base}/preset-manager/sweep", json=payload, timeout=10)
        assert resp.status_code == 200

        resp = httpx.get(
            f"{api_base}/preset-manager/sweep/{self.TEMPLATE}/{self.SWEEP_ID}", timeout=10
        )
        assert resp.status_code == 200

        data = resp.json()
        assert data["name"] == "E2E Test Sweep"
        assert data["base_preset"] == "_default"
        assert len(data["axes"]) == 2

    def test_saved_sweep_appears_in_list(self, api_base):
        """A saved sweep should appear in the sweeps list."""
        payload = {
            "workflow_template": self.TEMPLATE,
            "id": self.SWEEP_ID,
            "name": "E2E Test Sweep",
            "axes": [],
        }
        httpx.post(f"{api_base}/preset-manager/sweep", json=payload, timeout=10)

        resp = httpx.get(f"{api_base}/preset-manager/sweeps/{self.TEMPLATE}", timeout=10)
        assert resp.status_code == 200
        assert any(s["id"] == self.SWEEP_ID for s in resp.json())

    def test_get_missing_sweep_returns_404(self, api_base):
        """GET on a nonexistent sweep should return 404."""
        resp = httpx.get(
            f"{api_base}/preset-manager/sweep/{self.TEMPLATE}/definitely_not_here", timeout=10
        )
        assert resp.status_code == 404

    def test_delete_sweep(self, api_base):
        """DELETE should remove a saved sweep."""
        payload = {
            "workflow_template": self.TEMPLATE,
            "id": self.SWEEP_ID,
            "name": "E2E Test Sweep",
            "axes": [],
        }
        httpx.post(f"{api_base}/preset-manager/sweep", json=payload, timeout=10)

        resp = httpx.delete(
            f"{api_base}/preset-manager/sweep/{self.TEMPLATE}/{self.SWEEP_ID}", timeout=10
        )
        assert resp.status_code == 200

        resp = httpx.get(
            f"{api_base}/preset-manager/sweep/{self.TEMPLATE}/{self.SWEEP_ID}", timeout=10
        )
        assert resp.status_code == 404

    def test_delete_missing_sweep_returns_404(self, api_base):
        """DELETE on a nonexistent sweep should return 404."""
        resp = httpx.delete(
            f"{api_base}/preset-manager/sweep/{self.TEMPLATE}/definitely_not_here", timeout=10
        )
        assert resp.status_code == 404

    def test_expand_returns_cartesian_product(self, api_base):
        """POST /preset-manager/sweep/expand should return all combinations."""
        payload = {
            "workflow_template": self.TEMPLATE,
            "sweep": {
                "axes": [
                    {"type": "param", "param": "cfg", "values": [1, 2]},
                    {"type": "param", "param": "steps", "values": [10, 20]},
                ]
            },
        }
        resp = httpx.post(f"{api_base}/preset-manager/sweep/expand", json=payload, timeout=10)
        assert resp.status_code == 200

        combos = resp.json()["combinations"]
        assert [c["params"] for c in combos] == [
            {"cfg": 1, "steps": 10},
            {"cfg": 1, "steps": 20},
            {"cfg": 2, "steps": 10},
            {"cfg": 2, "steps": 20},
        ]

    def test_expand_resolves_preset_axis(self, api_base):
        """expand should resolve a preset axis against real stored presets."""
        payload = {
            "workflow_template": self.TEMPLATE,
            "sweep": {"axes": [{"type": "preset", "values": ["_default"]}]},
        }
        resp = httpx.post(f"{api_base}/preset-manager/sweep/expand", json=payload, timeout=10)
        assert resp.status_code == 200

        combos = resp.json()["combinations"]
        assert len(combos) == 1
        assert combos[0]["params"]["steps"] == 20
        assert combos[0]["params"]["cfg"] == 2.5

    def test_expand_unknown_preset_returns_400(self, api_base):
        """expand should reject a sweep referencing an unknown preset."""
        payload = {
            "workflow_template": self.TEMPLATE,
            "sweep": {"axes": [{"type": "preset", "values": ["no_such_preset"]}]},
        }
        resp = httpx.post(f"{api_base}/preset-manager/sweep/expand", json=payload, timeout=10)
        assert resp.status_code == 400
