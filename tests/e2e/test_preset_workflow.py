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

        # Options are filled asynchronously after the template list request
        option = dialog.locator("select.comfy-select option").first
        await option.wait_for(state="attached", timeout=10000)
        assert await dialog.locator("select.comfy-select option").count() > 0

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

    @pytest.mark.asyncio
    async def test_apply_params_writes_values_into_graph(self, page):
        """applyParamsToGraph should write values onto the matched widgets."""
        await page.wait_for_timeout(3000)

        result = await page.evaluate("""async () => {
            const api = await import('/extensions/comfyui-preset-manager/preset-api.js');
            const { app } = await import('/scripts/app.js');

            const template = await api.getTemplateDetail('sdxl-txt2img');
            const outcome = api.applyParamsToGraph(app.graph, template, {
                steps: 33,
                cfg: 6.5,
            });

            const ks = app.graph.nodes.find(n => n.type === 'KSampler');
            return {
                outcome,
                steps: ks?.widgets?.find(w => w.name === 'steps')?.value,
                cfg: ks?.widgets?.find(w => w.name === 'cfg')?.value,
            };
        }""")

        assert result["outcome"]["failed"] == []
        assert result["outcome"]["successCount"] == 2
        assert result["steps"] == 33
        assert result["cfg"] == 6.5

    @pytest.mark.asyncio
    async def test_sweep_button_is_visible(self, page):
        """The Sweeps top bar button should exist alongside Presets."""
        await page.wait_for_timeout(3000)
        sweeps_btn = page.locator("button", has_text="Sweeps")
        await sweeps_btn.first.wait_for(state="attached", timeout=5000)

    @pytest.mark.asyncio
    async def test_sweep_dialog_opens_and_lists_templates(self, page):
        """Opening the sweep dialog should display a template selector."""
        await page.wait_for_timeout(3000)
        sweeps_btn = page.locator("button", has_text="Sweeps").first
        await sweeps_btn.click()

        dialog = page.locator(".comfy-sweep-dialog")
        await dialog.wait_for(state="visible", timeout=5000)
        assert await dialog.is_visible()

    @pytest.mark.asyncio
    async def test_sweep_dialog_adds_axis_and_shows_total(self, page):
        """Adding a param axis with two values should report 2 runs in the summary."""
        await page.wait_for_timeout(3000)
        sweeps_btn = page.locator("button", has_text="Sweeps").first
        await sweeps_btn.click()

        dialog = page.locator(".comfy-sweep-dialog")
        await dialog.wait_for(state="visible", timeout=5000)

        # Pick the first available template so the axes area becomes interactive
        template_options = dialog.locator("select.comfy-select").first.locator("option")
        await template_options.first.wait_for(state="attached", timeout=5000)
        first_value = await template_options.first.get_attribute("value")
        await dialog.locator("select.comfy-select").first.select_option(first_value)
        await dialog.locator("button", has_text="+ 参数轴").click()

        value_input = dialog.locator(".sweep-axis input").first
        await value_input.wait_for(state="visible", timeout=5000)
        await value_input.fill("3, 5")

        summary_text = await dialog.locator(".sweep-summary").text_content()
        assert "2 次运行" in summary_text

    @pytest.mark.asyncio
    async def test_apply_params_reports_unmatched_params(self, page):
        """Params with no mapping should be reported in failed, not silently dropped."""
        await page.wait_for_timeout(3000)

        result = await page.evaluate("""async () => {
            const api = await import('/extensions/comfyui-preset-manager/preset-api.js');
            const { app } = await import('/scripts/app.js');

            const template = await api.getTemplateDetail('sdxl-txt2img');
            return api.applyParamsToGraph(app.graph, template, {
                steps: 12,
                no_such_param: 1,
            });
        }""")

        assert result["failed"] == ["no_such_param"]
        assert result["successCount"] == 1
        assert result["totalCount"] == 2

    @pytest.mark.asyncio
    async def test_editor_width_consistent_between_modes(self, page):
        """Editor dialog width should not change when switching between form and code mode."""
        await page.wait_for_timeout(3000)

        # Open Preset Manager dialog
        presets_btn = page.locator("button", has_text="Presets")
        await presets_btn.click()
        dialog = page.locator(".comfy-preset-manager")
        await dialog.wait_for(state="visible", timeout=5000)

        # Click + 新建 to open editor
        create_btn = dialog.locator("button", has_text="+ 新建")
        await create_btn.click()
        editor = page.locator(".comfy-preset-editor")
        await editor.wait_for(state="visible", timeout=5000)

        # Measure content width in form mode
        form_content_width = await page.evaluate(
            "document.querySelector('.comfy-preset-editor .comfy-modal-content').getBoundingClientRect().width"
        )

        # Switch to code mode
        code_btn = editor.locator("button", has_text="代码模式")
        await code_btn.click()
        await page.wait_for_timeout(500)

        # Measure content width in code mode
        code_content_width = await page.evaluate(
            "document.querySelector('.comfy-preset-editor .comfy-modal-content').getBoundingClientRect().width"
        )

        # Content width should be consistent between modes (allow 2px tolerance for sub-pixel rounding)
        assert abs(form_content_width - code_content_width) <= 2, (
            f"Editor content width changed between modes: "
            f"form={form_content_width}px, code={code_content_width}px"
        )
