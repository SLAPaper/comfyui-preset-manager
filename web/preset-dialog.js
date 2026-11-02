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
import { deletePreset, getPresets, getPresetDetail, getTemplateDetail } from "./client.js";
import { readParams, resolveParams, applyParams, explainParams } from "./matcher.js";
import { acquireGraphLock, releaseGraphLock } from "./graph-lock.js";
import { PresetEditorDialog } from "./preset-editor.js";
import { injectStyles } from "./styles.js";
import { loadTemplates } from "./template-store.js";

// Use new API to avoid deprecation warnings
const { $el, ComfyDialog } = window.comfyAPI.ui;

export class PresetDialog extends ComfyDialog {
    constructor({ onOpenTemplates, onOpenSweeps } = {}) {
        super();
        this.onOpenTemplates = onOpenTemplates;
        this.onOpenSweeps = onOpenSweeps;
        this.presets = [];
        this.selectedTemplate = null;
        this.selectedPreset = null;
        this.presetDetail = null;
        this.currentTemplate = null;
        this.listRequest = 0;
        this.detailRequest = 0;
        
        // Initialize editor dialog
        this.editor = new PresetEditorDialog((data) => {
            // Refresh preset list after save
            this.onTemplateChange();
        });
        
        this.element = $el("div.comfy-modal.comfy-preset-manager.preset-manager-dialog", { parent: document.body }, [
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
                    this.templateSelect = $el("select.comfy-select", {
                        onchange: () => this.onTemplateChange()
                    })
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
                    $el("button.comfy-btn", {
                        textContent: "模板",
                        onclick: () => this.onOpenTemplates?.()
                    }),
                    $el("button.comfy-btn", {
                        textContent: "参数扫描",
                        onclick: () => this.onOpenSweeps?.()
                    }),
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
        injectStyles();
        const style = document.createElement("style");
        style.textContent = `
            .comfy-preset-manager {
                z-index: 10000;
                min-width: 500px;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
            }
            
            .comfy-preset-manager .comfy-modal-content {
                padding: 20px;
                width: 100%;
                box-sizing: border-box;
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

            .comfy-preset-manager .comfy-select {
                width: 100%;
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
            
            .preset-item-actions {
                display: flex;
                gap: 6px;
                align-items: center;
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
        const request = ++this.listRequest;
        try {
            const templates = await loadTemplates({ refresh: true });
            if (request !== this.listRequest) return;

            // Populate template selector. A template must be chosen explicitly;
            // the first entry is only a placeholder, not an implicit binding.
            this.templateSelect.innerHTML = "";
            this.templateSelect.appendChild($el("option", {
                value: "",
                textContent: "（请选择模板）"
            }));
            for (const template of templates) {
                const option = $el("option", {
                    value: template.id,
                    textContent: template.name
                });
                this.templateSelect.appendChild(option);
            }
            
            await this.selectStoredTemplate();
            
        } catch (error) {
            if (request !== this.listRequest) return;
            console.error("[PresetManager] Error loading data:", error);
            this.presetPreview.textContent = `Error: ${error.message}`;
        }
    }
    
    async selectStoredTemplate() {
        const templateId = app.graph?.extra?.preset_template;
        const hasTemplate = Array.from(this.templateSelect.options)
            .some(option => option.value === templateId);
        if (templateId && hasTemplate) {
            this.templateSelect.value = templateId;
            await this.onTemplateChange();
            return;
        }

        this.templateSelect.value = "";
        this.showNoTemplate();
    }

    showNoTemplate() {
        this.detailRequest++;
        this.selectedTemplate = null;
        this.selectedPreset = null;
        this.presetDetail = null;
        this.currentTemplate = null;
        this.presets = [];
        this.presetList.innerHTML = "";
        this.presetList.appendChild($el("div.preset-item.empty", {
            textContent: "请选择 Workflow 模板"
        }));
        this.presetPreview.textContent = "选择模板后显示预设";
    }
    
    async onTemplateChange() {
        const request = ++this.listRequest;
        this.detailRequest++;
        const templateId = this.templateSelect.value;
        if (!templateId) {
            this.showNoTemplate();
            return;
        }

        this.selectedTemplate = templateId;
        this.selectedPreset = null;
        this.presetDetail = null;
        this.currentTemplate = null;
        
        try {
            const [presets, template] = await Promise.all([
                getPresets(templateId),
                getTemplateDetail(templateId)
            ]);
            if (request !== this.listRequest) return;
            this.presets = presets;
            this.currentTemplate = template;
            this.renderPresetList();
            this.presetPreview.textContent = "Select a preset to preview";
        } catch (error) {
            if (request !== this.listRequest) return;
            console.error("[PresetManager] Error loading presets:", error);
            this.presets = [];
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
            const actions = $el("div.preset-item-actions", [
                $el("button.comfy-btn.small", {
                    textContent: preset.source === "bundled" ? "复制" : "编辑",
                    onclick: (e) => {
                        e.stopPropagation();
                        this.onEditPreset(preset);
                    }
                })
            ]);
            if (preset.source !== "bundled") {
                actions.appendChild($el("button.comfy-btn.small.danger", {
                    textContent: "删除",
                    onclick: (e) => {
                        e.stopPropagation();
                        this.onDeletePreset(preset);
                    }
                }));
            }

            const item = $el("div.preset-item", [
                $el("span.preset-item-name", {
                    textContent: `${preset.name} (${preset.id})`,
                    onclick: (e) => this.onPresetSelect(preset, e)
                }),
                actions
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
        
        try {
            if (!this.currentTemplate) {
                this.currentTemplate = await getTemplateDetail(this.selectedTemplate);
            }
            const params = readParams(app.graph, this.currentTemplate);
            if (params.length === 0) {
                alert("当前 workflow 没有可保存的参数");
                return;
            }

            this.editor.showForCreate(this.selectedTemplate, params, this.presets);
        } catch (error) {
            alert("加载模板失败: " + error.message);
        }
    }
    
    /**
     * Handle edit preset button click.
     */
    async onEditPreset(preset) {
        try {
            const presetData = await getPresetDetail(this.selectedTemplate, preset.id);
            if (!this.currentTemplate) {
                this.currentTemplate = await getTemplateDetail(this.selectedTemplate);
            }
            const params = readParams(app.graph, this.currentTemplate);
            this.editor.showForEdit(
                this.selectedTemplate,
                preset.id,
                presetData,
                params,
                preset.source === "bundled",
                this.presets
            );
        } catch (error) {
            console.error("[PresetManager] Error loading preset for edit:", error);
            alert("加载预设失败: " + error.message);
        }
    }
    
    async onDeletePreset(preset) {
        if (!confirm(`删除预设「${preset.name}」？`)) return;

        try {
            await deletePreset(this.selectedTemplate, preset.id);
            this.selectedPreset = null;
            this.presetDetail = null;
            await this.onTemplateChange();
        } catch (error) {
            alert("删除预设失败: " + error.message);
        }
    }

    async onPresetSelect(preset, event) {
        const request = ++this.detailRequest;
        this.selectedPreset = preset;
        
        // Update UI selection
        const items = this.presetList.querySelectorAll(".preset-item");
        items.forEach(item => item.classList.remove("selected"));
        if (event?.target) {
            event.target.closest(".preset-item")?.classList.add("selected");
        }
        
        // Load and display preset detail
        try {
            const detail = await getPresetDetail(this.selectedTemplate, preset.id);
            if (request !== this.detailRequest) return;
            this.presetDetail = detail;
            this.renderPresetPreview();
        } catch (error) {
            if (request !== this.detailRequest) return;
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
        
        const resolved = this.currentTemplate ? resolveParams(app.graph, this.currentTemplate) : {};

        for (const [key, value] of Object.entries(params)) {
            const matchResult = resolved[key];

            let status, statusClass, nodeIdText;
            if (matchResult) {
                status = "✅";
                statusClass = "match-success";
                nodeIdText = `#${matchResult.nodeId}`;
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
        if (!acquireGraphLock("preset")) {
            alert("另一个操作正在修改 workflow，请稍后再试");
            return;
        }

        const templateId = this.selectedTemplate;
        const presetId = this.selectedPreset.id;
        try {
            // Load preset detail to get params
            const presetDetail = await getPresetDetail(templateId, presetId);
            const params = presetDetail.params || {};
            
            // Ensure template is loaded
            let template = this.currentTemplate;
            if (!template) {
                template = await getTemplateDetail(templateId);
            }
            const { applied, failed } = applyParams(app.graph, template, params);
            if (failed.length > 0) {
                const reasons = explainParams(app.graph, template, failed);
                const details = failed
                    .map(name => `${name}: ${reasons[name] || "未匹配到节点"}`)
                    .join("\n");
                alert(`已应用 ${applied} 个参数，以下参数未能应用：\n${details}`);
            }

            app.graph.extra = app.graph.extra || {};
            app.graph.extra.preset_template = templateId;

            this.close();
            
        } catch (error) {
            console.error("[PresetManager] Error applying preset:", error);
            alert(`Error applying preset: ${error.message}`);
        } finally {
            releaseGraphLock("preset");
        }
    }
    
}
