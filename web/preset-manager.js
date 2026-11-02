/**
 * Preset Manager Extension for ComfyUI.
 *
 * Registers the extension and adds top bar buttons for presets, sweeps, and
 * template analysis.
 */

import { app } from "../../scripts/app.js";
import { PresetDialog } from "./preset-dialog.js";
import { SweepDialog } from "./sweep-dialog.js";
import { TemplateAnalyzerDialog } from "./template-analyzer-dialog.js";

const { ComfyButton } = window.comfyAPI.button;

const presetDialog = new PresetDialog();
const sweepDialog = new SweepDialog();
const analyzerDialog = new TemplateAnalyzerDialog();

function pickMappedTemplateId() {
    return app.graph?.extra?.preset_template ?? null;
}

app.registerExtension({
    name: "PresetManager.UI",

    async setup() {
        const presetButton = new ComfyButton({
            icon: "bookmark",
            action: () => presetDialog.show(),
            tooltip: "Preset Manager",
            content: "Presets",
            classList: "comfyui-button comfyui-menu-mobile-collapse primary"
        });

        const sweepButton = new ComfyButton({
            icon: "settings",
            action: () => sweepDialog.show(pickMappedTemplateId()),
            tooltip: "Parameter Sweeps",
            content: "Sweeps",
            classList: "comfyui-button comfyui-menu-mobile-collapse primary"
        });

        const analyzerButton = new ComfyButton({
            icon: "search",
            action: () => analyzerDialog.show(),
            tooltip: "Analyze current workflow as a template",
            content: "Templates",
            classList: "comfyui-button comfyui-menu-mobile-collapse primary"
        });

        if (app.menu && app.menu.settingsGroup) {
            app.menu.settingsGroup.element.before(presetButton.element);
            app.menu.settingsGroup.element.before(sweepButton.element);
            app.menu.settingsGroup.element.before(analyzerButton.element);
        } else {
            const menu = document.querySelector(".comfyui-menu");
            menu?.appendChild(presetButton.element);
            menu?.appendChild(sweepButton.element);
            menu?.appendChild(analyzerButton.element);
        }
    }
});
