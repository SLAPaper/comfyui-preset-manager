/**
 * Preset Manager Extension for ComfyUI.
 *
 * Registers the extension and adds top bar buttons for presets and sweeps.
 */

import { app } from "../../scripts/app.js";
import { getMapping } from "./preset-api.js";
import { PresetDialog } from "./preset-dialog.js";
import { SweepDialog } from "./sweep-dialog.js";


// Use new API to avoid deprecation warnings
const { ComfyButton } = window.comfyAPI.button;

const presetDialog = new PresetDialog();
const sweepDialog = new SweepDialog();

async function pickMappedTemplateId() {
    // Resolve the template the current workflow was last associated with.
    const mapping = await getMapping();
    const workflowName = app.graph?.extra?.name;
    return workflowName ? mapping?.[workflowName] ?? null : null;
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
            action: async () => {
                // Pass the mapped template if known; the dialog shows a selector
                // either way, so the user is never blocked behind a setup step.
                sweepDialog.show(await pickMappedTemplateId());
            },
            tooltip: "Parameter Sweeps",
            content: "Sweeps",
            classList: "comfyui-button comfyui-menu-mobile-collapse primary"
        });

        if (app.menu && app.menu.settingsGroup) {
            app.menu.settingsGroup.element.before(presetButton.element);
            app.menu.settingsGroup.element.before(sweepButton.element);
        } else {
            console.warn("[PresetManager] app.menu.settingsGroup not found, using fallback");
            const menu = document.querySelector(".comfyui-menu");
            menu?.appendChild(presetButton.element);
            menu?.appendChild(sweepButton.element);
        }

        console.log("[PresetManager] Extension loaded successfully");
    }
});
