/**
 * Preset Manager Extension for ComfyUI.
 *
 * Registers the extension and adds top bar buttons for presets and sweeps.
 */

import { app } from "../../scripts/app.js";
import { PresetDialog } from "./preset-dialog.js";
import { SweepDialog } from "./sweep-dialog.js";

const { ComfyButton } = window.comfyAPI.button;

const presetDialog = new PresetDialog();
const sweepDialog = new SweepDialog();

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

        if (app.menu && app.menu.settingsGroup) {
            app.menu.settingsGroup.element.before(presetButton.element);
            app.menu.settingsGroup.element.before(sweepButton.element);
        } else {
            const menu = document.querySelector(".comfyui-menu");
            menu?.appendChild(presetButton.element);
            menu?.appendChild(sweepButton.element);
        }
    }
});
