"""
E2E Playwright tests for Preset Manager UI workflow.
"""

import pytest
import httpx


@pytest.mark.e2e
class TestPresetWorkflow:
    """Test the full preset selection and application workflow."""

    @pytest.mark.asyncio
    async def test_preset_dialog_opens(self, page):
        """Clicking the Presets button opens the preset dialog."""
        # Wait for ComfyUI to fully load
        await page.wait_for_timeout(3000)

        # Find and click the Presets button
        presets_btn = page.locator("button", has_text="Presets")
        await presets_btn.click()

        # Verify the dialog is visible
        dialog = page.locator(".comfy-preset-manager")
        await dialog.wait_for(state="visible", timeout=5000)
        assert await dialog.is_visible()

    @pytest.mark.asyncio
    async def test_template_selector_has_options(self, page):
        """The template selector should have at least one option."""
        await page.wait_for_timeout(3000)

        # Open dialog
        presets_btn = page.locator("button", has_text="Presets")
        await presets_btn.click()
        dialog = page.locator(".comfy-preset-manager")
        await dialog.wait_for(state="visible", timeout=5000)

        # Check template selector has options
        select = dialog.locator("select.comfy-select")
        options = select.locator("option")
        count = await options.count()
        assert count > 0

    @pytest.mark.asyncio
    async def test_preset_list_populated(self, page):
        """After selecting a template, the preset list should be populated."""
        await page.wait_for_timeout(3000)

        # Open dialog
        presets_btn = page.locator("button", has_text="Presets")
        await presets_btn.click()
        dialog = page.locator(".comfy-preset-manager")
        await dialog.wait_for(state="visible", timeout=5000)

        # Wait for preset list to load
        await page.wait_for_timeout(1000)

        # Check that preset items exist
        items = dialog.locator(".preset-item:not(.empty)")
        count = await items.count()
        assert count > 0, "Preset list should have at least one item"

    @pytest.mark.asyncio
    async def test_preset_preview_shows_params(self, page):
        """Clicking a preset should show its parameters in the preview."""
        # Collect console messages
        console_msgs = []
        page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text}"))

        await page.wait_for_timeout(3000)

        # Open dialog
        presets_btn = page.locator("button", has_text="Presets")
        await presets_btn.click()
        dialog = page.locator(".comfy-preset-manager")
        await dialog.wait_for(state="visible", timeout=5000)

        # Wait for presets to load and click the first one
        await page.wait_for_timeout(1000)
        first_item = dialog.locator(".preset-item:not(.empty) .preset-item-name").first
        await first_item.click()

        # Wait for preview to populate (API call may take time)
        await page.wait_for_timeout(2000)

        # Debug: check what's in the preview element
        preview_html = await dialog.locator(".preset-preview").inner_html()

        # Check preview has rows
        rows = dialog.locator(".preview-row")
        count = await rows.count()

        # Print debug info on failure
        if count == 0:
            print(f"\n--- DEBUG ---")
            print(f"Preview HTML: {preview_html[:800].encode('ascii', 'replace').decode()}")
            print(f"Console messages: {[m.encode('ascii', 'replace').decode() for m in console_msgs[-10:]]}")
            print(f"--- END DEBUG ---")

        assert count > 0, "Preview should show parameter rows"

    @pytest.mark.asyncio
    async def test_full_preset_apply_workflow(self, page):
        """Full workflow: open dialog, select preset, apply, verify dialog closes."""
        await page.wait_for_timeout(3000)

        # Open dialog
        presets_btn = page.locator("button", has_text="Presets")
        await presets_btn.click()
        dialog = page.locator(".comfy-preset-manager")
        await dialog.wait_for(state="visible", timeout=5000)

        # Wait for presets to load and click the first one
        await page.wait_for_timeout(1000)
        first_item = dialog.locator(".preset-item:not(.empty) .preset-item-name").first
        await first_item.click()

        # Wait for preview
        await page.wait_for_timeout(500)

        # Click Apply
        apply_btn = dialog.locator("button", has_text="Apply Preset")
        await apply_btn.click()

        # Verify dialog closes
        await dialog.wait_for(state="hidden", timeout=5000)
        assert not await dialog.is_visible(), "Dialog should close after applying preset"
