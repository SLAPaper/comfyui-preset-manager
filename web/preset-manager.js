/**
 * Preset Manager Extension for ComfyUI.
 * 
 * Registers the extension and adds a top bar button to open the preset dialog.
 */

import { app } from "../../scripts/app.js";
import { PresetDialog } from "./preset-dialog.js";

// Use new API to avoid deprecation warnings
const { ComfyButton } = window.comfyAPI.button;

// Create dialog instance
const dialog = new PresetDialog();

app.registerExtension({
    name: "PresetManager.UI",
    
    async setup() {
        // Create the Presets button
        const presetButton = new ComfyButton({
            icon: "bookmark",
            action: () => dialog.show(),
            tooltip: "Preset Manager",
            content: "Presets",
            classList: "comfyui-button comfyui-menu-mobile-collapse primary"
        });
        
        // Insert button before the settings group in the top bar
        if (app.menu && app.menu.settingsGroup) {
            app.menu.settingsGroup.element.before(presetButton.element);
        } else {
            // Fallback: append to menu container
            console.warn("[PresetManager] app.menu.settingsGroup not found, using fallback");
            document.querySelector(".comfyui-menu")?.appendChild(presetButton.element);
        }
        
        console.log("[PresetManager] Extension loaded successfully");
    }
});
