/**
 * Shared styles for the Preset Manager dialogs.
 *
 * ComfyUI already defines some of these classes, but the plugin's rules are
 * darker. Every rule is scoped to `.preset-manager-dialog` so the plugin does
 * not restyle other ComfyUI dialogs that use the same class names.
 */

let injected = false;

export function injectStyles() {
    if (injected || document.getElementById("preset-manager-shared-styles")) return;

    const style = document.createElement("style");
    style.id = "preset-manager-shared-styles";
    style.textContent = `
        .preset-manager-dialog {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1e1e2e;
            border: 1px solid #45475a;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }

        .preset-manager-dialog .comfy-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            border-bottom: 1px solid #45475a;
            padding-bottom: 10px;
        }

        .preset-manager-dialog .comfy-modal-header h2 {
            margin: 0;
            color: #cdd6f4;
            font-size: 18px;
        }

        .preset-manager-dialog .comfy-btn {
            padding: 8px 16px;
            background: #45475a;
            border: none;
            border-radius: 4px;
            color: #cdd6f4;
            cursor: pointer;
            font-size: 14px;
        }

        .preset-manager-dialog .comfy-btn:hover {
            background: #585b70;
        }

        .preset-manager-dialog .comfy-btn.primary {
            background: #89b4fa;
            color: #1e1e2e;
        }

        .preset-manager-dialog .comfy-btn.primary:hover {
            background: #74c7ec;
        }

        .preset-manager-dialog .comfy-btn.danger {
            background: #f38ba8;
            color: #1e1e2e;
        }

        .preset-manager-dialog .comfy-btn.danger:hover {
            background: #eba0ac;
        }

        .preset-manager-dialog .comfy-btn.small {
            padding: 4px 10px;
            font-size: 12px;
        }

        .preset-manager-dialog .comfy-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .preset-manager-dialog .comfy-select {
            flex: 1;
            padding: 8px;
            background: #313244;
            border: 1px solid #45475a;
            border-radius: 4px;
            color: #cdd6f4;
            font-size: 14px;
        }

        .preset-manager-dialog .comfy-input {
            width: 100%;
            padding: 8px;
            background: #313244;
            border: 1px solid #45475a;
            border-radius: 4px;
            color: #cdd6f4;
            font-size: 14px;
            margin-bottom: 10px;
            box-sizing: border-box;
        }

        .preset-manager-dialog .comfy-textarea {
            width: 100%;
            padding: 8px;
            background: #313244;
            border: 1px solid #45475a;
            border-radius: 4px;
            color: #cdd6f4;
            font-family: monospace;
            font-size: 13px;
            resize: vertical;
            box-sizing: border-box;
        }
    `;
    document.head.appendChild(style);
    injected = true;
}
