/**
 * PresetEditorDialog for ComfyUI Preset Manager.
 * 
 * A dialog for creating and editing presets with:
 * - Form-based UI for preset metadata (name, description)
 * - Parameter selection with checkboxes grouped by node type
 * - Select all / deselect all per group
 * - Code editing mode for advanced users
 */

import { app } from "../../scripts/app.js";
import { getWorkflows, savePreset, getPresetDetail } from "./preset-api.js";

// Use new API to avoid deprecation warnings
const { $el, ComfyDialog } = window.comfyAPI.ui;

export class PresetEditorDialog extends ComfyDialog {
    constructor(onSave) {
        super();
        this.onSave = onSave; // Callback when preset is saved
        this.templateId = null;
        this.presetId = null; // null = create new, non-null = edit existing
        this.parameters = []; // { name, nodeType, nodeId, value, selected }
        this.mode = 'form'; // 'form' or 'code'
        
        this.element = $el("div.comfy-modal.comfy-preset-editor", { parent: document.body }, [
            $el("div.comfy-modal-content", [
                // Header
                $el("div.comfy-modal-header", [
                    this.titleEl = $el("h2", { textContent: "创建预设" }),
                    $el("button.comfy-btn", {
                        textContent: "✕",
                        onclick: () => this.close()
                    })
                ]),
                
                // Preset metadata
                $el("div.preset-editor-section", [
                    $el("label", { textContent: "名称:" }),
                    this.nameInput = $el("input.comfy-input", {
                        type: "text",
                        placeholder: "输入预设名称"
                    }),
                    $el("label", { textContent: "描述:" }),
                    this.descInput = $el("input.comfy-input", {
                        type: "text",
                        placeholder: "输入预设描述（可选）"
                    })
                ]),
                
                // Mode toggle
                $el("div.preset-editor-mode", [
                    $el("button.comfy-btn.mode-btn.active", {
                        textContent: "表单模式",
                        onclick: (e) => this.setMode('form', e)
                    }),
                    $el("button.comfy-btn.mode-btn", {
                        textContent: "代码模式",
                        onclick: (e) => this.setMode('code', e)
                    })
                ]),
                
                // Form mode: parameter list
                this.formContainer = $el("div.preset-editor-form", [
                    $el("label", { textContent: "要保存的参数:" }),
                    this.paramList = $el("div.preset-param-list")
                ]),
                
                // Code mode: JSON editor
                this.codeContainer = $el("div.preset-editor-code", { style: { display: "none" } }, [
                    $el("label", { textContent: "JSON 编辑器:" }),
                    this.codeEditor = $el("textarea.comfy-textarea", {
                        rows: 20,
                        placeholder: '{"params": {...}}'
                    })
                ]),
                
                // Actions
                $el("div.preset-editor-actions", [
                    this.saveBtn = $el("button.comfy-btn.primary", {
                        textContent: "保存",
                        onclick: () => this.onSaveClick()
                    }),
                    $el("button.comfy-btn", {
                        textContent: "取消",
                        onclick: () => this.close()
                    })
                ])
            ])
        ]);
        
        this.element.style.display = "none";
        this.addStyles();
    }
    
    addStyles() {
        const style = document.createElement("style");
        style.textContent = `
            .comfy-preset-editor {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 10001;
                background: #1e1e2e;
                border: 1px solid #45475a;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                min-width: 500px;
                max-width: 650px;
                max-height: 85vh;
                overflow-y: auto;
            }
            
            .preset-editor-section {
                margin-bottom: 15px;
            }
            
            .preset-editor-section label {
                display: block;
                color: #a6adc8;
                margin-bottom: 5px;
                font-size: 14px;
            }
            
            .comfy-input {
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
            
            .comfy-textarea {
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
            
            .preset-editor-mode {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .mode-btn {
                flex: 1;
            }
            
            .mode-btn.active {
                background: #89b4fa;
                color: #1e1e2e;
            }
            
            .preset-param-list {
                background: #313244;
                border: 1px solid #45475a;
                border-radius: 4px;
                max-height: 300px;
                overflow-y: auto;
            }
            
            .param-group {
                border-bottom: 1px solid #45475a;
            }
            
            .param-group:last-child {
                border-bottom: none;
            }
            
            .param-group-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: #45475a;
                cursor: pointer;
            }
            
            .param-group-header:hover {
                background: #585b70;
            }
            
            .param-group-title {
                color: #cdd6f4;
                font-weight: bold;
                font-size: 13px;
            }
            
            .param-group-select-all {
                color: #89b4fa;
                font-size: 12px;
                cursor: pointer;
            }
            
            .param-group-select-all:hover {
                text-decoration: underline;
            }
            
            .param-item {
                display: flex;
                align-items: center;
                padding: 6px 12px 6px 24px;
                border-bottom: 1px solid #313244;
            }
            
            .param-item:last-child {
                border-bottom: none;
            }
            
            .param-item input[type="checkbox"] {
                margin-right: 8px;
            }
            
            .param-item-name {
                color: #cdd6f4;
                font-size: 13px;
                flex: 1;
            }
            
            .param-item-value {
                color: #a6adc8;
                font-size: 12px;
                font-family: monospace;
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .preset-editor-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 15px;
                padding-top: 10px;
                border-top: 1px solid #45475a;
            }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Show the dialog for creating a new preset.
     * @param {string} templateId - The template ID
     * @param {Array} parameters - Array of { name, nodeType, nodeId, value }
     */
    showForCreate(templateId, parameters) {
        this.templateId = templateId;
        this.presetId = null;
        this.parameters = parameters.map(p => ({ ...p, selected: true }));
        
        this.titleEl.textContent = "创建预设";
        this.nameInput.value = "";
        this.descInput.value = "";
        this.nameInput.disabled = false;
        
        this.renderParameterList();
        this.element.style.display = "flex";
    }
    
    /**
     * Show the dialog for editing an existing preset.
     * @param {string} templateId - The template ID
     * @param {string} presetId - The preset ID
     * @param {Object} presetData - The preset data
     * @param {Array} parameters - Array of { name, nodeType, nodeId, value }
     */
    showForEdit(templateId, presetId, presetData, parameters) {
        this.templateId = templateId;
        this.presetId = presetId;
        
        this.titleEl.textContent = "编辑预设";
        this.nameInput.value = presetData.name || presetId;
        this.descInput.value = presetData.description || "";
        this.nameInput.disabled = true; // Can't rename existing preset
        
        // Mark parameters that are in the preset as selected
        const presetParams = presetData.params || {};
        this.parameters = parameters.map(p => ({
            ...p,
            selected: p.name in presetParams,
            value: p.name in presetParams ? presetParams[p.name] : p.value
        }));
        
        this.renderParameterList();
        this.element.style.display = "flex";
    }
    
    /**
     * Render the parameter list grouped by node type.
     */
    renderParameterList() {
        this.paramList.innerHTML = "";
        
        // Group parameters by node type
        const groups = {};
        for (const param of this.parameters) {
            const key = param.nodeType || "unknown";
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(param);
        }
        
        // Render each group
        for (const [nodeType, params] of Object.entries(groups)) {
            const group = $el("div.param-group");
            
            // Group header with select all
            const allSelected = params.every(p => p.selected);
            const header = $el("div.param-group-header", [
                $el("span.param-group-title", { textContent: nodeType }),
                $el("span.param-group-select-all", {
                    textContent: allSelected ? "取消全选" : "全选",
                    onclick: (e) => {
                        e.stopPropagation();
                        const newState = !allSelected;
                        params.forEach(p => p.selected = newState);
                        this.renderParameterList();
                    }
                })
            ]);
            group.appendChild(header);
            
            // Parameter items
            for (const param of params) {
                const item = $el("div.param-item", [
                    $el("input", {
                        type: "checkbox",
                        checked: param.selected,
                        onchange: (e) => {
                            param.selected = e.target.checked;
                            this.updateSelectAllText(group, params);
                        }
                    }),
                    $el("span.param-item-name", { textContent: param.name }),
                    $el("span.param-item-value", {
                        textContent: this.formatValue(param.value),
                        title: String(param.value)
                    })
                ]);
                group.appendChild(item);
            }
            
            this.paramList.appendChild(group);
        }
    }
    
    /**
     * Update the "select all" text for a group.
     */
    updateSelectAllText(groupEl, params) {
        const allSelected = params.every(p => p.selected);
        const selectAllEl = groupEl.querySelector(".param-group-select-all");
        if (selectAllEl) {
            selectAllEl.textContent = allSelected ? "取消全选" : "全选";
        }
    }
    
    /**
     * Format a value for display.
     */
    formatValue(value) {
        if (typeof value === "string") {
            return value.length > 30 ? value.substring(0, 30) + "..." : value;
        }
        return String(value);
    }
    
    /**
     * Set the editor mode (form or code).
     */
    setMode(mode, evt) {
        // Sync data to code editor BEFORE switching mode
        // (getPresetData() reads from form when mode is 'form', from textarea when 'code')
        if (mode === "code") {
            const data = this.getPresetData();
            this.codeEditor.value = JSON.stringify(data, null, 2);
        }
        
        this.mode = mode;
        
        // Update button states
        const buttons = this.element.querySelectorAll(".mode-btn");
        buttons.forEach(btn => btn.classList.remove("active"));
        const target = evt?.target?.closest(".mode-btn") || evt?.target;
        if (target) target.classList.add("active");
        
        // Show/hide containers
        this.formContainer.style.display = mode === "form" ? "block" : "none";
        this.codeContainer.style.display = mode === "code" ? "block" : "none";
    }
    
    /**
     * Get the preset data from the current mode.
     */
    getPresetData() {
        if (this.mode === "code") {
            try {
                return JSON.parse(this.codeEditor.value);
            } catch (e) {
                alert("JSON 格式错误: " + e.message);
                return null;
            }
        }
        
        // Form mode
        const params = {};
        for (const param of this.parameters) {
            if (param.selected) {
                params[param.name] = param.value;
            }
        }
        
        return {
            id: this.presetId || this.generateId(this.nameInput.value),
            name: this.nameInput.value,
            description: this.descInput.value,
            workflow_template: this.templateId,
            params: params
        };
    }
    
    /**
     * Generate a preset ID from the name.
     */
    generateId(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "") || "unnamed";
    }
    
    /**
     * Handle save button click.
     */
    async onSaveClick() {
        const data = this.getPresetData();
        if (!data) return;
        
        // Validate
        if (!data.name || data.name.trim() === "") {
            alert("请输入预设名称");
            return;
        }
        
        if (Object.keys(data.params).length === 0) {
            alert("请至少选择一个参数");
            return;
        }
        
        // Save via API
        try {
            const result = await savePreset(data);
            if (result.status === "ok") {
                this.close();
                if (this.onSave) {
                    this.onSave(data);
                }
            } else {
                alert("保存失败: " + (result.error || "未知错误"));
            }
        } catch (e) {
            alert("保存失败: " + e.message);
        }
    }
    
    close() {
        this.element.style.display = "none";
    }
}
