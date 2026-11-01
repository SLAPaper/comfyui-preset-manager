"""
E2E tests for Preset Manager API endpoints.

Template content is covered by tests/fixtures/templates.json and the JS
matcher tests; these cases only verify the HTTP integration.
"""

import httpx
import pytest


@pytest.mark.e2e
class TestTemplateAPI:
    """Template and preset listing endpoints."""

    def test_get_template_detail(self, api_base):
        """GET /preset-manager/template/sdxl-txt2img returns full template."""
        resp = httpx.get(f"{api_base}/preset-manager/template/sdxl-txt2img", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert "node_mapping" in data
        assert "synonyms" in data

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
