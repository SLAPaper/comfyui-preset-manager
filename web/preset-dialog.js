/**
 * PresetDialog for ComfyUI Preset Manager.
 * 
 * A floating dialog that allows users to:
 * - Select workflow templates
 * - Browse and select presets
 * - Preview preset parameters
 * - Apply presets to the current workflow
 */

import { app } from "../../scripts/app.js";
import { getWorkflows, getPresets, getPresetDetail, applyPreset, getMapping, saveMapping, getCurrentWorkflowParams, getTemplateDetail, findNodeByTemplate } from "./preset-api.js";
import { PresetEditorDialog } from "./preset-editor.js";

// Use new API to avoid deprecation warnings
const { $el, ComfyDialog } = window.comfyAPI.ui;

export class PresetDialog extends ComfyDialog {
    constructor() {
        super();
        this.workflowTemplates = [];
        this.presets = [];
        this.selectedTemplate = null;
        this.selectedPreset = null;
        this.presetDetail = null;
        this.mapping = {};
        this.currentTemplate = null;
        
        // Initialize editor dialog
        this.editor = new PresetEditorDialog((data) => {
            // Refresh preset list after save
            this.onTemplateChange();
        });
        
        this.element = $el("div.comfy-modal.comfy-preset-manager", { parent: document.body }, [
            $el("div.comfy-modal-content", [
                // Header
                $el("div.comfy-modal-header", [
                    $el("h2", { textContent: "Preset Manager" }),
                    $el("button.comfy-btn", {
                        textContent: "✕",
                        onclick: () => this.close()
                    })
                ]),
                
                // Template selector
                $el("div.preset-section", [
                    $el("label", { textContent: "Workflow Template:" }),
                    $el("div.template-selector", [
                        this.templateSelect = $el("select.comfy-select", {
                            onchange: () => this.onTemplateChange()
                        }),
                        $el("span.auto-detect-badge", { textContent: "Auto" })
                    ])
                ]),
                
                // Preset list with create button
                $el("div.preset-section", [
                    $el("div.preset-list-header", [
                        $el("label", { textContent: "Presets:" }),
                        $el("button.comfy-btn.small", {
                            textContent: "+ 新建",
                            onclick: () => this.onCreatePreset()
                        })
                    ]),
                    this.presetList = $el("div.preset-list")
                ]),
                
                // Preset preview
                $el("div.preset-section", [
                    $el("label", { textContent: "Preview:" }),
                    this.presetPreview = $el("div.preset-preview", { textContent: "Select a preset to preview" })
                ]),
                
                // Actions
                $el("div.preset-actions", [
                    $el("button.comfy-btn.primary", {
                        textContent: "Apply Preset",
                        onclick: () => this.onApply()
                    })
                ])
            ])
        ]);
        
        // Style
        this.element.style.display = "none";
        this.addStyles();
    }
    
    addStyles() {
        const style = document.createElement("style");
        style.textContent = `
            .comfy-preset-manager {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 10000;
                background: #1e1e2e;
                border: 1px solid #45475a;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                min-width: 500px;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
            }
            
            .comfy-modal-content {
                padding: 20px;
            }
            
            .comfy-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                border-bottom: 1px solid #45475a;
                padding-bottom: 10px;
            }
            
            .comfy-modal-header h2 {
                margin: 0;
                color: #cdd6f4;
                font-size: 18px;
            }
            
            .preset-section {
                margin-bottom: 15px;
            }
            
            .preset-section label {
                display: block;
                color: #a6adc8;
                margin-bottom: 5px;
                font-size: 14px;
            }
            
            .preset-list-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 5px;
            }
            
            .preset-list-header label {
                margin-bottom: 0;
            }
            
            .comfy-btn.small {
                padding: 4px 10px;
                font-size: 12px;
            }
            
            .template-selector {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .comfy-select {
                flex: 1;
                padding: 8px;
                background: #313244;
                border: 1px solid #45475a;
                border-radius: 4px;
                color: #cdd6f4;
                font-size: 14px;
            }
            
            .auto-detect-badge {
                background: #89b4fa;
                color: #1e1e2e;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
            }
            
            .preset-list {
                background: #313244;
                border: 1px solid #45475a;
                border-radius: 4px;
                max-height: 200px;
                overflow-y: auto;
            }
            
            .preset-item {
                padding: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #45475a;
                color: #cdd6f4;
            }
            
            .preset-item.empty {
                display: block;
                color: #a6adc8;
                font-style: italic;
            }
            
            .preset-item:hover {
                background: #45475a;
            }
            
            .preset-item.selected {
                background: #89b4fa;
                color: #1e1e2e;
            }
            
            .preset-item-name {
                cursor: pointer;
                flex: 1;
            }
            
            .preset-item:last-child {
                border-bottom: none;
            }
            
            .preset-preview {
                background: #313244;
                border: 1px solid #45475a;
                border-radius: 4px;
                padding: 10px;
                color: #cdd6f4;
                font-size: 13px;
                max-height: 200px;
                overflow-y: auto;
            }
            
            .preview-row {
                display: flex;
                align-items: center;
                padding: 4px 0;
                border-bottom: 1px solid #45475a;
                gap: 8px;
            }
            
            .preview-row:last-child {
                border-bottom: none;
            }
            
            .preview-status {
                width: 20px;
                text-align: center;
            }
            
            .preview-key {
                font-weight: bold;
                min-width: 120px;
            }
            
            .preview-value {
                flex: 1;
                font-family: monospace;
                color: #a6adc8;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .preview-node {
                color: #89b4fa;
                font-size: 12px;
                min-width: 60px;
                text-align: right;
            }
            
            .match-success .preview-key {
                color: #a6e3a1;
            }
            
            .match-fail .preview-key {
                color: #f38ba8;
            }
            
            .preset-actions {
                display: flex;
                justify-content: flex-end;
                margin-top: 20px;
                padding-top: 10px;
                border-top: 1px solid #45475a;
            }
            
            .comfy-btn {
                padding: 8px 16px;
                background: #45475a;
                border: none;
                border-radius: 4px;
                color: #cdd6f4;
                cursor: pointer;
                font-size: 14px;
            }
            
            .comfy-btn:hover {
                background: #585b70;
            }
            
            .comfy-btn.primary {
                background: #89b4fa;
                color: #1e1e2e;
            }
            
            .comfy-btn.primary:hover {
                background: #74c7ec;
            }
            
            .comfy-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }
    
    async show() {
        this.element.style.display = "flex";
        await this.loadData();
    }
    
    close() {
        this.element.style.display = "none";
    }
    
    async loadData() {
        try {
            // Load templates and mapping in parallel
            const [templates, mapping] = await Promise.all([
                getWorkflows(),
                getMapping()
            ]);
            
            this.workflowTemplates = templates;
            this.mapping = mapping;
            
            // Populate template selector
            this.templateSelect.innerHTML = "";
            for (const template of templates) {
                const option = $el("option", {
                    value: template.id,
                    textContent: template.name
                });
                this.templateSelect.appendChild(option);
            }
            
            // Auto-detect template
            await this.autoDetectTemplate();
            
        } catch (error) {
            console.error("[PresetManager] Error loading data:", error);
            this.presetPreview.textContent = `Error: ${error.message}`;
        }
    }
    
    async autoDetectTemplate() {
        // Get current workflow name from app
        const workflowName = this.getCurrentWorkflowName();
        
        if (workflowName && this.mapping[workflowName]) {
            const templateId = this.mapping[workflowName];
            // Find and select the template
            const option = this.templateSelect.querySelector(`option[value="${templateId}"]`);
            if (option) {
                this.templateSelect.value = templateId;
                await this.onTemplateChange();
                return;
            }
        }
        
        // If no auto-detection, select first template
        if (this.workflowTemplates.length > 0) {
            this.templateSelect.value = this.workflowTemplates[0].id;
            await this.onTemplateChange();
        }
    }
    
    getCurrentWorkflowName() {
        // Try to get workflow name from graph metadata
        const graph = app.graph;
        if (graph && graph.extra && graph.extra.name) {
            return graph.extra.name;
        }
        
        // Try to get from document title
        const title = document.title;
        if (title && title !== "ComfyUI") {
            return title.replace(" - ComfyUI", "").trim();
        }
        
        return null;
    }
    
    async onTemplateChange() {
        const templateId = this.templateSelect.value;
        this.selectedTemplate = templateId;
        this.selectedPreset = null;
        this.presetDetail = null;
        this.currentTemplate = null;
        
        try {
            const [presets, template] = await Promise.all([
                getPresets(templateId),
                getTemplateDetail(templateId)
            ]);
            this.presets = presets;
            this.currentTemplate = template;
            this.renderPresetList();
            this.presetPreview.textContent = "Select a preset to preview";
        } catch (error) {
            console.error("[PresetManager] Error loading presets:", error);
            this.presetList.innerHTML = `<div class="preset-item">Error loading presets</div>`;
        }
    }
    
    renderPresetList() {
        this.presetList.innerHTML = "";
        
        if (this.presets.length === 0) {
            this.presetList.innerHTML = `<div class="preset-item empty">No presets found. Click "+ 新建" to create one.</div>`;
            return;
        }
        
        for (const preset of this.presets) {
            const item = $el("div.preset-item", [
                $el("span.preset-item-name", {
                    textContent: `${preset.name} (${preset.id})`,
                    onclick: (e) => this.onPresetSelect(preset, e)
                }),
                $el("button.comfy-btn.small", {
                    textContent: "编辑",
                    onclick: (e) => {
                        e.stopPropagation();
                        this.onEditPreset(preset);
                    }
                })
            ]);
            this.presetList.appendChild(item);
        }
    }
    
    /**
     * Handle create new preset button click.
     */
    async onCreatePreset() {
        if (!this.selectedTemplate) {
            alert("请先选择一个 Workflow 模板");
            return;
        }
        
        // Get current workflow parameters using template
        const params = await getCurrentWorkflowParams(this.selectedTemplate);
        if (params.length === 0) {
            alert("当前 workflow 没有可保存的参数");
            return;
        }
        
        this.editor.showForCreate(this.selectedTemplate, params);
    }
    
    /**
     * Handle edit preset button click.
     */
    async onEditPreset(preset) {
        try {
            const presetData = await getPresetDetail(this.selectedTemplate, preset.id);
            const params = await getCurrentWorkflowParams(this.selectedTemplate);
            this.editor.showForEdit(this.selectedTemplate, preset.id, presetData, params);
        } catch (error) {
            console.error("[PresetManager] Error loading preset for edit:", error);
            alert("加载预设失败: " + error.message);
        }
    }
    
    async onPresetSelect(preset, event) {
        this.selectedPreset = preset;
        
        // Update UI selection
        const items = this.presetList.querySelectorAll(".preset-item");
        items.forEach(item => item.classList.remove("selected"));
        if (event?.target) {
            event.target.closest(".preset-item")?.classList.add("selected");
        }
        
        // Load and display preset detail
        try {
            this.presetDetail = await getPresetDetail(this.selectedTemplate, preset.id);
            this.renderPresetPreview();
        } catch (error) {
            console.error("[PresetManager] Error loading preset detail:", error);
            this.presetPreview.textContent = `Error: ${error.message}`;
        }
    }
    
    renderPresetPreview() {
        if (!this.presetDetail) {
            this.presetPreview.textContent = "No preset selected";
            return;
        }
        
        const params = this.presetDetail.params || {};
        this.presetPreview.innerHTML = "";
        
        const graph = app.graph;
        const template = this.currentTemplate;
        const synonyms = template?.synonyms || {};
        
        for (const [key, value] of Object.entries(params)) {
            const paramDef = template?.node_mapping?.[key];
            const matchResult = paramDef ? findNodeByTemplate(graph, paramDef, synonyms) : null;
            
            let status, statusClass, nodeIdText;
            if (matchResult) {
                status = "✅";
                statusClass = "match-success";
                nodeIdText = `#${matchResult.node.id}`;
            } else {
                status = "❌";
                statusClass = "match-fail";
                nodeIdText = "未匹配";
            }
            
            const row = $el("div", { className: `preview-row ${statusClass}` }, [
                $el("span.preview-status", { textContent: status }),
                $el("span.preview-key", { textContent: key }),
                $el("span.preview-value", { textContent: JSON.stringify(value) }),
                $el("span.preview-node", { textContent: nodeIdText })
            ]);
            this.presetPreview.appendChild(row);
        }
        
        if (Object.keys(params).length === 0) {
            this.presetPreview.textContent = "No parameters";
        }
    }
    
    async onApply() {
        if (!this.selectedTemplate || !this.selectedPreset) {
            alert("Please select a template and preset first");
            return;
        }
        
        try {
            // Load preset detail to get params
            const presetDetail = await getPresetDetail(this.selectedTemplate, this.selectedPreset.id);
            const params = presetDetail.params || {};
            
            // Ensure template is loaded
            if (!this.currentTemplate) {
                this.currentTemplate = await getTemplateDetail(this.selectedTemplate);
            }
            const template = this.currentTemplate;
            const synonyms = template.synonyms || {};
            
            // Apply preset directly to current graph
            const graph = app.graph;
            let successCount = 0;
            let totalCount = 0;
            
            // For each parameter in preset, find the matching node and update it
            for (const [paramName, value] of Object.entries(params)) {
                totalCount++;
                
                const paramDef = template.node_mapping[paramName];
                if (!paramDef) {
                    console.warn(`[PresetManager] No mapping definition for ${paramName}`);
                    continue;
                }
                
                const result = findNodeByTemplate(graph, paramDef, synonyms);
                if (result) {
                    const { node, widgetName } = result;
                    const widget = node.widgets?.find(w => w.name === widgetName);
                    if (widget) {
                        widget.value = value;
                        successCount++;
                        console.log(`[PresetManager] Set ${paramName} = ${value} on node ${node.id}`);
                    } else {
                        console.warn(`[PresetManager] Widget ${widgetName} not found on node ${node.id}`);
                    }
                } else {
                    console.warn(`[PresetManager] Node not found for ${paramName}`);
                }
            }
            
            // Force graph refresh
            graph.setDirtyCanvas(true, true);
            for (const node of graph.nodes) {
                if (node.setDirtyCanvas) {
                    node.setDirtyCanvas(true, true);
                }
            }
            
            console.log(`[PresetManager] Applied ${successCount}/${totalCount} parameters`);
            
            // Save mapping for future auto-detection
            const workflowName = this.getCurrentWorkflowName();
            if (workflowName) {
                await saveMapping(workflowName, this.selectedTemplate);
            }
            
            // Close dialog
            this.close();
            
        } catch (error) {
            console.error("[PresetManager] Error applying preset:", error);
            alert(`Error applying preset: ${error.message}`);
        }
    }
    
}
