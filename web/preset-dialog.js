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
import { getWorkflows, getPresets, getPresetDetail, applyPreset, getMapping, saveMapping, getCurrentWorkflowParams } from "./preset-api.js";
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
        
        try {
            this.presets = await getPresets(templateId);
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
                    onclick: () => this.onPresetSelect(preset)
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
    onCreatePreset() {
        if (!this.selectedTemplate) {
            alert("请先选择一个 Workflow 模板");
            return;
        }
        
        // Get current workflow parameters
        const params = getCurrentWorkflowParams();
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
            const params = getCurrentWorkflowParams();
            this.editor.showForEdit(this.selectedTemplate, preset.id, presetData, params);
        } catch (error) {
            console.error("[PresetManager] Error loading preset for edit:", error);
            alert("加载预设失败: " + error.message);
        }
    }
    
    async onPresetSelect(preset) {
        this.selectedPreset = preset;
        
        // Update UI selection
        const items = this.presetList.querySelectorAll(".preset-item");
        items.forEach(item => item.classList.remove("selected"));
        event.target.classList.add("selected");
        
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
        
        for (const [key, value] of Object.entries(params)) {
            const matchResult = this.findNodeAndWidget(graph, key);
            
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
            
            const row = $el("div.preview-row", { className: statusClass }, [
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
            
            // Apply preset directly to current graph
            const graph = app.graph;
            let successCount = 0;
            let totalCount = 0;
            
            // For each parameter in preset, find the matching node and update it
            for (const [paramName, value] of Object.entries(params)) {
                totalCount++;
                console.log(`[PresetManager] Processing param: ${paramName} = ${value}`);
                
                // Find the node in current graph that matches this parameter
                const result = this.findNodeAndWidget(graph, paramName);
                if (result) {
                    const { node, widgetIndex } = result;
                    
                    // Update widgets_values array and widget object
                    if (node.widgets_values && widgetIndex < node.widgets_values.length) {
                        const oldValue = node.widgets_values[widgetIndex];
                        node.widgets_values[widgetIndex] = value;
                        
                        // Also update the widget object if it exists
                        const widgetName = this.getWidgetName(paramName);
                        console.log(`[PresetManager] Looking for widget: ${widgetName} in ${node.widgets?.length} widgets`);
                        if (node.widgets) {
                            for (let i = 0; i < node.widgets.length; i++) {
                                const w = node.widgets[i];
                                console.log(`[PresetManager] Widget ${i}: name=${w.name}, type=${w.type}, value=${w.value}`);
                            }
                            const widget = node.widgets.find(w => w.name === widgetName);
                            if (widget) {
                                console.log(`[PresetManager] Found widget: ${widget.name}, old value: ${widget.value}, new value: ${value}`);
                                widget.value = value;
                                console.log(`[PresetManager] Widget value after update: ${widget.value}`);
                            } else {
                                console.warn(`[PresetManager] Widget ${widgetName} not found!`);
                            }
                        }
                        
                        successCount++;
                        console.log(`[PresetManager] SUCCESS: Set ${paramName} = ${value} on node ${node.id} (was: ${oldValue})`);
                    } else {
                        console.warn(`[PresetManager] FAIL: widgets_values not found or index out of range for ${paramName}`);
                        console.warn(`[PresetManager] widgets_values:`, node.widgets_values);
                        console.warn(`[PresetManager] widgetIndex:`, widgetIndex);
                    }
                } else {
                    console.warn(`[PresetManager] FAIL: Node not found for param ${paramName}`);
                }
            }
            
            // Force graph refresh
            graph.setDirtyCanvas(true, true);
            // Also try to force node update
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
    
    /**
     * Find a node and widget index for the given parameter name.
     * Returns { node, widgetIndex } or null.
     */
    findNodeAndWidget(graph, paramName) {
        // Parameter to node type mapping
        const nodeTypeMap = {
            'positive_prompt': 'CLIPTextEncode',
            'negative_prompt': 'CLIPTextEncode',
            'sampler': 'KSampler',
            'scheduler': 'KSampler',
            'steps': 'KSampler',
            'cfg': 'KSampler',
            'width': 'EmptyLatentImage',
            'height': 'EmptyLatentImage'
        };
        
        // Parameter to widget index mapping (based on standard node structure)
        const widgetIndexMap = {
            'positive_prompt': 0,  // CLIPTextEncode: text is first widget
            'negative_prompt': 0,  // CLIPTextEncode: text is first widget
            'sampler': 4,          // KSampler: sampler_name is 5th widget (index 4)
            'scheduler': 5,        // KSampler: scheduler is 6th widget (index 5)
            'steps': 2,            // KSampler: steps is 3rd widget (index 2)
            'cfg': 3,              // KSampler: cfg is 4th widget (index 3)
            'width': 0,            // EmptyLatentImage: width is 1st widget (index 0)
            'height': 1            // EmptyLatentImage: height is 2nd widget (index 1)
        };
        
        const targetType = nodeTypeMap[paramName];
        if (!targetType) {
            console.log(`[PresetManager] No node type mapping for ${paramName}`);
            return null;
        }
        
        // Find all nodes of this type
        const nodes = graph.nodes.filter(n => n.type === targetType);
        console.log(`[PresetManager] Found ${nodes.length} nodes of type ${targetType} for ${paramName}`);
        
        if (nodes.length === 0) return null;
        
        let targetNode = nodes[0];
        
        // For CLIPTextEncode, need to disambiguate by connection or title
        if (targetType === 'CLIPTextEncode' && nodes.length > 1) {
            const titleKeywords = paramName === 'positive_prompt' 
                ? ['positive', '正向', '正面'] 
                : ['negative', '负向', '负面'];
            
            // First try: find by title keywords
            for (const node of nodes) {
                const title = (node.title || '').toLowerCase();
                console.log(`[PresetManager] Checking CLIPTextEncode node ${node.id} with title: "${node.title}"`);
                if (titleKeywords.some(kw => title.includes(kw))) {
                    targetNode = node;
                    console.log(`[PresetManager] Found by title keyword: node ${node.id}`);
                    break;
                }
            }
            
            // If title matching failed, try to find by connection to KSampler
            if (targetNode === nodes[0]) {
                console.log(`[PresetManager] Title matching failed, trying connection-based lookup...`);
                const ksampler = graph.nodes.find(n => n.type === 'KSampler');
                console.log(`[PresetManager] Found KSampler:`, ksampler ? ksampler.id : 'none');
                
                if (ksampler) {
                    const inputName = paramName === 'positive_prompt' ? 'positive' : 'negative';
                    console.log(`[PresetManager] Looking for input: ${inputName}`);
                    console.log(`[PresetManager] KSampler inputs:`, ksampler.inputs);
                    
                    const inputSlot = ksampler.inputs?.findIndex(i => i.name === inputName);
                    console.log(`[PresetManager] Input slot for ${inputName}: ${inputSlot}`);
                    
                    if (inputSlot >= 0) {
                        console.log(`[PresetManager] Graph links:`, graph.links);
                        
                        // Find which CLIPTextEncode connects to this input
                        for (const node of nodes) {
                            console.log(`[PresetManager] Checking node ${node.id} outputs:`, node.outputs);
                            if (node.outputs && node.outputs[0] && node.outputs[0].links) {
                                console.log(`[PresetManager] Node ${node.id} links:`, node.outputs[0].links);
                                for (const linkId of node.outputs[0].links) {
                                    const link = graph.links[linkId];
                                    console.log(`[PresetManager] Link ${linkId}:`, link);
                                    if (link && link.target_id === ksampler.id && link.target_slot === inputSlot) {
                                        targetNode = node;
                                        console.log(`[PresetManager] Found by connection: node ${node.id} -> KSampler.${inputName}`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        const widgetIndex = widgetIndexMap[paramName] || 0;
        console.log(`[PresetManager] Selected node ${targetNode.id} (${targetType}) for ${paramName}, widgetIndex=${widgetIndex}`);
        console.log(`[PresetManager] Node widgets_values:`, targetNode.widgets_values);
        
        return {
            node: targetNode,
            widgetIndex: widgetIndex
        };
    }
    
    /**
     * Get the actual widget name for a parameter.
     */
    getWidgetName(paramName) {
        const widgetNameMap = {
            'positive_prompt': 'text',
            'negative_prompt': 'text',
            'sampler': 'sampler_name',
            'scheduler': 'scheduler',
            'steps': 'steps',
            'cfg': 'cfg',
            'width': 'width',
            'height': 'height'
        };
        return widgetNameMap[paramName] || paramName;
    }
}
