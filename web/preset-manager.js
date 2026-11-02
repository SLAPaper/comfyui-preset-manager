/**
 * Preset Manager Extension for ComfyUI.
 *
 * Registers the extension and adds one top bar entry for presets, sweeps, and
 * template editing.
 */

import { app } from "../../scripts/app.js";
import { PresetDialog } from "./preset-dialog.js";
import { SweepDialog } from "./sweep-dialog.js";
import { TemplateAnalyzerDialog } from "./template-analyzer-dialog.js";

const { ComfyButton } = window.comfyAPI.button;

const sweepDialog = new SweepDialog();
const analyzerDialog = new TemplateAnalyzerDialog();
const presetDialog = new PresetDialog({
    onOpenTemplates: () => {
        presetDialog.close();
        analyzerDialog.show();
    },
    onOpenSweeps: () => {
        presetDialog.close();
        sweepDialog.show(pickMappedTemplateId());
    },
});

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

        if (app.menu && app.menu.settingsGroup) {
            app.menu.settingsGroup.element.before(presetButton.element);
        } else {
            const menu = document.querySelector(".comfyui-menu");
            menu?.appendChild(presetButton.element);
        }
    }
});
