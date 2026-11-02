/**
 * PresetEditorDialog for ComfyUI Preset Manager.
 * 
 * A dialog for creating and editing presets with:
 * - Form-based UI for preset metadata (name, description)
 * - Parameter selection with checkboxes grouped by node type
 * - Select all / deselect all per group
 * - Explicit JSON import/export for bulk edits
 */

import { savePreset } from "./client.js";
import { injectStyles } from "./styles.js";

// Use new API to avoid deprecation warnings
const { $el, ComfyDialog } = window.comfyAPI.ui;

export class PresetEditorDialog extends ComfyDialog {
    constructor(onSave) {
        super();
        this.onSave = onSave; // Callback when preset is saved
        this.templateId = null;
        this.presetId = null; // null = create new, non-null = edit existing
        this.parameters = []; // { name, nodeType, nodeId, value, selected }
        
        this.element = $el("div.comfy-modal.comfy-preset-editor.preset-manager-dialog", { parent: document.body }, [
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
                
                this.noteEl = $el("div.preset-editor-note", { style: { display: "none" } }),

                // Form mode: parameter list
                $el("div.preset-editor-form", [
                    $el("label", { textContent: "要保存的参数:" }),
                    this.paramList = $el("div.preset-param-list")
                ]),

                // Optional bulk import/export. The form remains the source of truth.
                this.advancedContainer = $el("details.preset-editor-advanced", [
                    $el("summary", { textContent: "高级：导入/导出 JSON" }),
                    this.codeEditor = $el("textarea.comfy-textarea", {
                        rows: 12,
                        placeholder: '{"params": {...}}'
                    }),
                    $el("div.preset-editor-advanced-actions", [
                        $el("button.comfy-btn.small", {
                            textContent: "导出表单",
                            onclick: () => this.exportJson()
                        }),
                        $el("button.comfy-btn.small", {
                            textContent: "导入到表单",
                            onclick: () => this.importJson()
                        })
                    ])
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
        injectStyles();
        const style = document.createElement("style");
        style.textContent = `
            .comfy-preset-editor {
                z-index: 10001;
                width: 600px;
                max-height: 85vh;
                overflow-y: auto;
            }

            .comfy-preset-editor .comfy-modal-content {
                width: 100%;
                box-sizing: border-box;
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
            
            .preset-editor-advanced {
                margin-bottom: 15px;
                color: #a6adc8;
                font-size: 12px;
            }

            .preset-editor-advanced summary {
                cursor: pointer;
                margin-bottom: 8px;
            }

            .preset-editor-advanced .comfy-textarea {
                min-height: 160px;
            }

            .preset-editor-advanced-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 8px;
            }

            .preset-editor-note {
                margin-bottom: 15px;
                padding: 8px 10px;
                border-radius: 4px;
                background: #313244;
                color: #a6adc8;
                font-size: 12px;
                line-height: 1.5;
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
        this.parameters = parameters.map(p => ({ ...p, selected: p.defaultSelected !== false }));
        
        this.titleEl.textContent = "创建预设";
        this.nameInput.value = "";
        this.descInput.value = "";
        this.nameInput.disabled = false;
        this.noteEl.textContent = "";
        this.noteEl.style.display = "none";
        this.codeEditor.value = "";
        this.advancedContainer.open = false;

        this.renderParameterList();
        this.element.style.display = "flex";
    }
    
    /**
     * Show the dialog for editing an existing preset.
     * A bundled preset is edited as a new user copy so the built-in stays intact.
     * @param {string} templateId - The template ID
     * @param {string} presetId - The preset ID
     * @param {Object} presetData - The preset data
     * @param {Array} parameters - Array of { name, nodeType, nodeId, value }
     * @param {boolean} bundled - Whether the preset comes from the bundled layer
     */
    showForEdit(templateId, presetId, presetData, parameters, bundled = false) {
        this.templateId = templateId;
        this.presetId = bundled ? null : presetId;

        const sourceName = presetData.name || presetId;
        this.titleEl.textContent = bundled ? "复制内置预设" : "编辑预设";
        this.nameInput.value = bundled ? `${sourceName} 副本` : sourceName;
        this.descInput.value = presetData.description || "";
        this.nameInput.disabled = !bundled;
        this.noteEl.textContent = bundled
            ? "保存后创建用户预设，内置预设保持不变。"
            : "保存后覆盖当前用户预设。";
        this.noteEl.style.display = "block";
        this.codeEditor.value = "";
        this.advancedContainer.open = false;

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
     * Copy the current form state into the JSON box. This is an explicit
     * export, not a live two-way synchronization.
     */
    exportJson() {
        this.codeEditor.value = JSON.stringify(this.getPresetData(), null, 2);
        this.advancedContainer.open = true;
    }

    /**
     * Parse the JSON box and apply it to the form.
     */
    importJson() {
        const data = this.parseJson();
        if (!data) return;
        this.applyEditorData(data);
    }

    /**
     * Parse the JSON box and validate the fields the preset needs.
     */
    parseJson() {
        let data;
        try {
            data = JSON.parse(this.codeEditor.value);
        } catch (e) {
            alert("JSON 格式错误: " + e.message);
            return null;
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            alert("JSON 必须是对象");
            return null;
        }
        if (!data.params || typeof data.params !== "object" || Array.isArray(data.params)) {
            alert("params 必须是对象");
            return null;
        }
        return data;
    }

    /**
     * Copy parsed code-mode values back into the form controls.
     * Params that are not in the current graph stay visible as custom entries.
     */
    applyEditorData(data) {
        this.nameInput.value = typeof data.name === "string" ? data.name : "";
        this.descInput.value = typeof data.description === "string" ? data.description : "";

        const remaining = new Set(Object.keys(data.params));
        this.parameters = this.parameters.filter(param =>
            param.nodeType !== "自定义" || remaining.has(param.name)
        );

        for (const param of this.parameters) {
            if (remaining.has(param.name)) {
                param.selected = true;
                param.value = data.params[param.name];
                remaining.delete(param.name);
            } else {
                param.selected = false;
            }
        }

        for (const name of remaining) {
            this.parameters.push({
                name,
                nodeType: "自定义",
                nodeId: "",
                value: data.params[name],
                selected: true,
            });
        }

        this.renderParameterList();
    }
    
    /**
     * Get the preset data from the form.
     * The ID and template always come from the dialog, not from imported JSON.
     */
    getPresetData() {
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
