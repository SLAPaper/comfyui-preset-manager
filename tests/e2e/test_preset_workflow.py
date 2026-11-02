"""
E2E Playwright tests for Preset Manager UI workflow.
"""

import pytest
import httpx


async def open_presets(page):
    """Open the single Presets entry and return its dialog locator."""
    await page.locator("button", has_text="Presets").first.click()
    dialog = page.locator(".comfy-preset-manager")
    await dialog.wait_for(state="visible", timeout=5000)
    return dialog


async def open_sweeps(page):
    """Reach the sweep dialog through the Presets entry."""
    dialog = await open_presets(page)
    await dialog.locator("button", has_text="参数扫描").click()


async def open_templates(page):
    """Reach the template analyzer through the Presets entry."""
    dialog = await open_presets(page)
    await dialog.locator("button", has_text="模板").click()


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
    async def test_single_entry_opens_presets_templates_and_sweeps(self, page):
        """The top bar keeps one Presets entry that reaches templates and sweeps."""
        await page.wait_for_timeout(3000)
        await page.locator("button", has_text="Presets").first.wait_for(
            state="attached", timeout=5000
        )
        assert await page.locator("button", has_text="Sweeps").count() == 0

        await page.locator("button", has_text="Presets").first.click()
        dialog = page.locator(".comfy-preset-manager")
        await dialog.wait_for(state="visible", timeout=5000)

        await dialog.locator("button", has_text="参数扫描").click()
        sweep = page.locator(".comfy-sweep-dialog")
        await sweep.wait_for(state="visible", timeout=5000)
        await sweep.locator("button", has_text="关闭").click()
        await sweep.wait_for(state="hidden", timeout=5000)

        await page.locator("button", has_text="Presets").first.click()
        await dialog.wait_for(state="visible", timeout=5000)
        await dialog.locator("button", has_text="模板").click()
        await page.locator(".comfy-template-analyzer").wait_for(state="visible", timeout=5000)

    @pytest.mark.asyncio
    async def test_sweep_dialog_opens_and_lists_templates(self, page):
        """Opening the sweep dialog should display a template selector."""
        await page.wait_for_timeout(3000)
        await open_sweeps(page)

        dialog = page.locator(".comfy-sweep-dialog")
        await dialog.wait_for(state="visible", timeout=5000)
        assert await dialog.is_visible()

    @pytest.mark.asyncio
    async def test_sweep_dialog_usable_without_pre_selected_template(self, page):
        """When no template is pre-selected, the dialog should auto-pick one so
        the user can interact immediately (regression: previously addAxis threw
        because loadTemplateData was skipped when templateId was null)."""
        await page.wait_for_timeout(3000)
        await open_sweeps(page)

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
        await open_sweeps(page)

        dialog = page.locator(".comfy-sweep-dialog")
        await dialog.wait_for(state="visible", timeout=5000)

        toggle = dialog.locator(".sweep-trace input[type='checkbox']")
        assert await toggle.is_checked()

    @pytest.mark.asyncio
    async def test_sweep_dialog_adds_axis_and_shows_total(self, page):
        """Adding a param axis with two values should report 2 runs in the summary."""
        await page.wait_for_timeout(3000)
        await open_sweeps(page)

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
    async def test_editor_exports_and_imports_json(self, page):
        """JSON export/import is explicit; the form stays the source of truth."""
        await page.wait_for_timeout(3000)

        result = await page.evaluate("""async () => {
            const { PresetEditorDialog } = await import('/extensions/comfyui-preset-manager/preset-editor.js');
            const editor = new PresetEditorDialog();
            editor.showForCreate('sdxl-txt2img', [
                { name: 'steps', nodeType: 'KSampler', nodeId: '1', value: 20, defaultSelected: true },
                { name: 'cfg', nodeType: 'KSampler', nodeId: '1', value: 7, defaultSelected: true },
            ]);

            editor.nameInput.value = '同步测试';
            editor.descInput.value = 'from form';
            editor.parameters.find(item => item.name === 'cfg').selected = false;
            editor.exportJson();
            const exported = JSON.parse(editor.codeEditor.value);
            const exportedSnapshot = JSON.parse(JSON.stringify(exported));

            exported.name = '导入后';
            exported.description = 'from json';
            exported.id = 'ignored';
            exported.workflow_template = 'ignored';
            exported.params.steps = 33;
            exported.params.extra = 'custom';
            editor.codeEditor.value = JSON.stringify(exported);
            editor.importJson();

            const afterImport = {
                name: editor.nameInput.value,
                description: editor.descInput.value,
                params: editor.parameters.map(item => ({
                    name: item.name,
                    selected: item.selected,
                    value: item.value,
                    nodeType: item.nodeType,
                })),
            };
            const saved = editor.getPresetData();
            editor.close();
            return { exported: exportedSnapshot, afterImport, saved };
        }""")

        assert result["exported"]["params"] == {"steps": 20}
        assert result["exported"]["id"] == "同步测试"
        assert result["exported"]["workflow_template"] == "sdxl-txt2img"

        params = {item["name"]: item for item in result["afterImport"]["params"]}
        assert result["afterImport"]["name"] == "导入后"
        assert result["afterImport"]["description"] == "from json"
        assert params["steps"]["selected"] is True
        assert params["steps"]["value"] == 33
        assert params["cfg"]["selected"] is False
        assert params["extra"]["selected"] is True
        assert params["extra"]["nodeType"] == "自定义"

        assert result["saved"]["id"] == "导入后"
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

        await open_templates(page)
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

        await open_templates(page)
        dialog = page.locator(".comfy-template-analyzer")
        await dialog.wait_for(state="visible", timeout=5000)

        await dialog.locator(".template-analyzer-meta select").select_option("sdxl-txt2img")
        await page.wait_for_timeout(800)

        meta_inputs = dialog.locator(".template-analyzer-meta input")
        assert await meta_inputs.nth(0).input_value() == "sdxl-txt2img-copy"
        assert "副本" in await meta_inputs.nth(1).input_value()
        assert await dialog.locator(".template-analyzer-row").count() > 0
