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
        """applyParams should write values onto the matched widgets."""
        await page.wait_for_timeout(3000)

        result = await page.evaluate("""async () => {
            const client = await import('/extensions/comfyui-preset-manager/client.js');
            const matcher = await import('/extensions/comfyui-preset-manager/matcher.js');
            const { app } = await import('/scripts/app.js');

            const template = await client.getTemplateDetail('sdxl-txt2img');
            const outcome = matcher.applyParams(app.graph, template, {
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
        assert result["outcome"]["applied"] == 2
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
    async def test_sweep_dialog_usable_without_pre_selected_template(self, page):
        """When no template is pre-selected, the dialog should auto-pick one so
        the user can interact immediately (regression: previously addAxis threw
        because loadTemplateData was skipped when templateId was null)."""
        await page.wait_for_timeout(3000)
        await page.locator("button", has_text="Sweeps").first.click()

        dialog = page.locator(".comfy-sweep-dialog")
        await dialog.wait_for(state="visible", timeout=5000)

        # Wait for the template list to fill (no template pre-selected)
        template_options = dialog.locator("select.comfy-select").first.locator("option")
        await template_options.first.wait_for(state="attached", timeout=5000)

        # The auto-pick must trigger loadTemplateData — sweepSelect gets a placeholder
        sweep_options = dialog.locator("select.comfy-select").nth(1).locator("option")
        await sweep_options.first.wait_for(state="attached", timeout=5000)

        # Now + 参数轴 should work (previously threw because template was null)
        await dialog.locator("button", has_text="+ 参数轴").click()
        await page.locator(".sweep-axis input").first.wait_for(state="visible", timeout=2000)
        assert await dialog.locator(".sweep-axis").count() == 1

    @pytest.mark.asyncio
    async def test_sweep_dialog_offers_filename_trace(self, page):
        """Sweeps tag output filenames by default so results stay traceable."""
        await page.wait_for_timeout(3000)
        await page.locator("button", has_text="Sweeps").first.click()

        dialog = page.locator(".comfy-sweep-dialog")
        await dialog.wait_for(state="visible", timeout=5000)

        toggle = dialog.locator(".sweep-trace input[type='checkbox']")
        assert await toggle.is_checked()

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
            const client = await import('/extensions/comfyui-preset-manager/client.js');
            const matcher = await import('/extensions/comfyui-preset-manager/matcher.js');
            const { app } = await import('/scripts/app.js');

            const template = await client.getTemplateDetail('sdxl-txt2img');
            return matcher.applyParams(app.graph, template, {
                steps: 12,
                no_such_param: 1,
            });
        }""")

        assert result["failed"] == ["no_such_param"]
        assert result["applied"] == 1

    @pytest.mark.asyncio
    async def test_editor_unchecks_model_params_by_default(self, page):
        """Loader params start unchecked; sampling params start checked."""
        await page.wait_for_timeout(3000)

        rows = await page.evaluate("""async () => {
            const client = await import('/extensions/comfyui-preset-manager/client.js');
            const matcher = await import('/extensions/comfyui-preset-manager/matcher.js');
            const { PresetEditorDialog } = await import('/extensions/comfyui-preset-manager/preset-editor.js');

            const template = await client.getTemplateDetail('sdxl-txt2img');
            const graph = {
                nodes: [
                    {
                        id: 1,
                        type: 'CheckpointLoaderSimple',
                        widgets: [{ name: 'ckpt_name', value: 'sdxl.safetensors' }],
                        inputs: [],
                    },
                    {
                        id: 2,
                        type: 'KSampler',
                        widgets: [{ name: 'steps', value: 20 }],
                        inputs: [],
                    },
                ],
                links: {},
            };

            const editor = new PresetEditorDialog();
            editor.showForCreate('sdxl-txt2img', matcher.readParams(graph, template));
            const result = [...editor.element.querySelectorAll('.param-item')].map(item => ({
                name: item.querySelector('.param-item-name').textContent,
                checked: item.querySelector('input').checked,
            }));
            editor.close();
            return result;
        }""")

        by_name = {row["name"]: row["checked"] for row in rows}
        assert by_name["ckpt_name"] is False
        assert by_name["steps"] is True

    @pytest.mark.asyncio
    async def test_editor_syncs_form_and_code(self, page):
        """Switching modes must carry name, selected params, and custom params."""
        await page.wait_for_timeout(3000)

        result = await page.evaluate("""async () => {
            const { PresetEditorDialog } = await import('/extensions/comfyui-preset-manager/preset-editor.js');
            const editor = new PresetEditorDialog();
            editor.showForCreate('sdxl-txt2img', [
                { name: 'steps', nodeType: 'KSampler', nodeId: '1', value: 20, defaultSelected: true },
                { name: 'cfg', nodeType: 'KSampler', nodeId: '1', value: 7, defaultSelected: true },
            ]);

            editor.setMode('code');
            const data = JSON.parse(editor.codeEditor.value);
            data.name = '同步测试';
            data.description = 'from code';
            data.id = 'ignored';
            data.params.steps = 33;
            delete data.params.cfg;
            data.params.extra = 'custom';
            editor.codeEditor.value = JSON.stringify(data);
            editor.setMode('form');

            const afterCodeToForm = {
                name: editor.nameInput.value,
                description: editor.descInput.value,
                params: editor.parameters.map(item => ({
                    name: item.name,
                    selected: item.selected,
                    value: item.value,
                    nodeType: item.nodeType,
                })),
            };

            const steps = editor.parameters.find(item => item.name === 'steps');
            steps.value = 44;
            editor.setMode('code');
            const regenerated = JSON.parse(editor.codeEditor.value);
            const saved = editor.getPresetData();
            editor.close();
            return { afterCodeToForm, regenerated, saved };
        }""")

        params = {item["name"]: item for item in result["afterCodeToForm"]["params"]}
        assert result["afterCodeToForm"]["name"] == "同步测试"
        assert result["afterCodeToForm"]["description"] == "from code"
        assert params["steps"]["selected"] is True
        assert params["steps"]["value"] == 33
        assert params["cfg"]["selected"] is False
        assert params["extra"]["selected"] is True
        assert params["extra"]["nodeType"] == "自定义"

        assert result["regenerated"]["params"]["steps"] == 44
        assert result["regenerated"]["params"]["extra"] == "custom"
        assert "cfg" not in result["regenerated"]["params"]
        assert result["saved"]["id"] == "同步测试"
        assert result["saved"]["workflow_template"] == "sdxl-txt2img"

    @pytest.mark.asyncio
    async def test_bundled_preset_opens_as_copy(self, page):
        """Editing a bundled preset starts a user copy; user presets edit in place."""
        await page.wait_for_timeout(3000)

        result = await page.evaluate("""async () => {
            const { PresetEditorDialog } = await import('/extensions/comfyui-preset-manager/preset-editor.js');
            const params = [
                { name: 'steps', nodeType: 'KSampler', nodeId: '1', value: 20, defaultSelected: true },
            ];
            const editor = new PresetEditorDialog();

            editor.showForEdit(
                'sdxl-txt2img', '_default',
                { name: '默认配置', params: { steps: 25 } },
                params, true
            );
            const copy = {
                title: editor.titleEl.textContent,
                name: editor.nameInput.value,
                disabled: editor.nameInput.disabled,
                note: editor.noteEl.textContent,
                presetId: editor.presetId,
            };

            editor.showForEdit(
                'sdxl-txt2img', 'mine',
                { name: '我的配置', params: { steps: 25 } },
                params, false
            );
            const edit = {
                title: editor.titleEl.textContent,
                name: editor.nameInput.value,
                disabled: editor.nameInput.disabled,
                note: editor.noteEl.textContent,
                presetId: editor.presetId,
            };

            editor.close();
            return { copy, edit };
        }""")

        assert result["copy"]["title"] == "复制内置预设"
        assert result["copy"]["name"] == "默认配置 副本"
        assert result["copy"]["disabled"] is False
        assert result["copy"]["presetId"] is None
        assert "内置预设保持不变" in result["copy"]["note"]

        assert result["edit"]["title"] == "编辑预设"
        assert result["edit"]["name"] == "我的配置"
        assert result["edit"]["disabled"] is True
        assert result["edit"]["presetId"] == "mine"
        assert "覆盖当前用户预设" in result["edit"]["note"]

    @pytest.mark.asyncio
    async def test_editor_width_consistent_between_modes(self, page):
        """Editor dialog width should not change when switching between form and code mode."""
        await page.wait_for_timeout(3000)

        # The fresh E2E profile starts with an empty canvas. Add a real KSampler
        # so + 新建 has current graph params to read.
        await page.evaluate("""() => {
            const app = window.comfyAPI.app.app;
            app.graph.clear();
            const node = window.LiteGraph.createNode('KSampler');
            node.id = 1;
            app.graph.add(node);
        }""")

        # Open Preset Manager dialog
        presets_btn = page.locator("button", has_text="Presets")
        await presets_btn.click()
        dialog = page.locator(".comfy-preset-manager")
        await dialog.wait_for(state="visible", timeout=5000)

        # Wait for the template list before creating a preset; + 新建 needs a
        # selected template to read the current graph params.
        await dialog.locator("select.comfy-select option").first.wait_for(
            state="attached", timeout=10000
        )

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

    @pytest.mark.asyncio
    async def test_template_analyzer_saves_manual_mapping(self, page, api_base):
        """Analyzer save closes the loop: manual param -> user template -> API."""
        await page.wait_for_timeout(3000)

        await page.evaluate("""() => {
            const app = window.comfyAPI.app.app;
            app.graph.clear();
            const node = window.LiteGraph.createNode('KSampler');
            node.id = 1;
            app.graph.add(node);
        }""")

        await page.locator(
            'button[aria-label="Analyze current workflow as a template"]'
        ).click()
        dialog = page.locator(".comfy-template-analyzer")
        await dialog.wait_for(state="visible", timeout=5000)

        meta_inputs = dialog.locator(".template-analyzer-meta input")
        await meta_inputs.nth(0).fill("e2e-ui-template")
        await meta_inputs.nth(1).fill("E2E Analyzer Template")

        await dialog.locator("button", has_text="手动添加").click()
        manual = dialog.locator(".template-analyzer-manual")
        await manual.wait_for(state="visible", timeout=3000)
        await manual.locator("input").first.fill("manual_seed")
        await manual.locator("select").nth(0).select_option("1")
        await manual.locator("button", has_text="添加参数").click()

        await dialog.locator("button", has_text="保存模板").click()
        await page.wait_for_timeout(800)

        status = await dialog.locator(".template-analyzer-status").text_content()
        assert "已保存模板" in status

        resp = httpx.get(f"{api_base}/preset-manager/template/e2e-ui-template", timeout=10)
        assert resp.status_code == 200
        template = resp.json()
        assert template["node_mapping"]["manual_seed"] == {
            "match_strategy": "unique_class",
            "class_type": "KSampler",
            "widget": "seed",
        }

        resp = httpx.get(f"{api_base}/preset-manager/workflows", timeout=10)
        listed = {item["id"]: item for item in resp.json()}
        assert listed["e2e-ui-template"]["source"] == "user"

    @pytest.mark.asyncio
    async def test_template_analyzer_copies_existing_template(self, page):
        """Selecting an existing template loads its mapping under a copy ID."""
        await page.wait_for_timeout(3000)

        await page.evaluate("""() => {
            const app = window.comfyAPI.app.app;
            app.graph.clear();
            const node = window.LiteGraph.createNode('KSampler');
            node.id = 1;
            app.graph.add(node);
        }""")

        await page.locator(
            'button[aria-label="Analyze current workflow as a template"]'
        ).click()
        dialog = page.locator(".comfy-template-analyzer")
        await dialog.wait_for(state="visible", timeout=5000)

        await dialog.locator(".template-analyzer-meta select").select_option("sdxl-txt2img")
        await page.wait_for_timeout(800)

        meta_inputs = dialog.locator(".template-analyzer-meta input")
        assert await meta_inputs.nth(0).input_value() == "sdxl-txt2img-copy"
        assert "副本" in await meta_inputs.nth(1).input_value()
        assert await dialog.locator(".template-analyzer-row").count() > 0
