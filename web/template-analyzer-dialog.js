/**
 * Template editor built on the read-only analyzer.
 *
 * The dialog can analyze the current workflow, copy an existing template, or
 * add a mapping manually. Saving writes a complete user template and associates
 * it with the current workflow, so Presets and Sweeps can use it immediately.
 */

import { app } from "../../scripts/app.js";
import { getTemplateDetail, getWorkflows, saveTemplate } from "./client.js";
import {
    analyzeGraph,
    buildTemplate,
    describeMapping,
    listNodes,
} from "./template-analyzer.js";
import { injectStyles } from "./styles.js";

const { $el, ComfyDialog } = window.comfyAPI.ui;

const STRATEGY_LABELS = {
    unique_class: "唯一类",
    title_keyword: "标题",
    input_slot: "输入槽",
    output_connection: "上游连接",
};

const STRATEGIES = [
    ["unique_class", "唯一类"],
    ["title_keyword", "标题"],
    ["input_slot", "输入槽"],
    ["output_connection", "上游连接"],
];

export class TemplateAnalyzerDialog extends ComfyDialog {
    constructor() {
        super();

        this.templates = [];
        this.candidates = [];
        this.selected = new Set();
        this.synonyms = {};
        this.nodes = [];
        this.saving = false;

        this.statusEl = $el("div.template-analyzer-status");
        this.summaryEl = $el("div.template-analyzer-summary");
        this.listEl = $el("div.template-analyzer-list");

        this.idInput = $el("input.comfy-input", {
            type: "text",
            placeholder: "例如 qwen-image-custom",
        });
        this.nameInput = $el("input.comfy-input", {
            type: "text",
            placeholder: "模板名称",
        });
        this.descriptionInput = $el("input.comfy-input", {
            type: "text",
            placeholder: "说明（可选）",
        });
        this.sourceSelect = $el("select.comfy-select", {
            onchange: () => this.onSourceChange(),
        });

        this.saveButton = $el("button.comfy-btn.primary", {
            textContent: "保存模板",
            onclick: () => this.onSave(),
        });

        this.manualForm = this.createManualForm();
        this.manualVisible = false;

        this.element = $el("div.comfy-modal.comfy-template-analyzer.preset-manager-dialog", {
            parent: document.body
        }, [
            $el("div.comfy-modal-content", [
                $el("div.comfy-modal-header", [
                    $el("h2", { textContent: "模板编辑器" }),
                    $el("button.comfy-btn", {
                        textContent: "✕",
                        onclick: () => this.close()
                    })
                ]),
                $el("p.template-analyzer-note", {
                    textContent: "从当前 workflow 识别可保存的字段，或复制已有模板。勾选的参数会写入用户模板。"
                }),
                $el("div.template-analyzer-meta", [
                    this.metaField("模板 ID", this.idInput),
                    this.metaField("名称", this.nameInput),
                    this.metaField("说明", this.descriptionInput),
                    this.metaField("来源", this.sourceSelect),
                ]),
                this.summaryEl,
                this.listEl,
                this.manualForm,
                this.statusEl,
                $el("div.template-analyzer-actions", [
                    $el("button.comfy-btn", {
                        textContent: "重新分析",
                        onclick: () => this.onRefresh()
                    }),
                    $el("button.comfy-btn", {
                        textContent: "手动添加",
                        onclick: () => this.toggleManual()
                    }),
                    this.saveButton,
                    $el("button.comfy-btn", {
                        textContent: "关闭",
                        onclick: () => this.close()
                    })
                ])
            ])
        ]);

        this.element.style.display = "none";
        this.addStyles();
    }

    metaField(label, control) {
        return $el("label.template-analyzer-meta-field", [
            $el("span", { textContent: label }),
            control,
        ]);
    }

    createManualForm() {
        this.manualName = $el("input.comfy-input", {
            type: "text",
            placeholder: "参数名，例如 steps",
        });
        this.manualNode = $el("select.comfy-select", {
            onchange: () => this.onManualNodeChange(),
        });
        this.manualStrategy = $el("select.comfy-select", {
            onchange: () => this.updateManualFields(),
        }, STRATEGIES.map(([value, label]) => $el("option", { value, textContent: label })));
        this.manualWidget = $el("select.comfy-select");
        this.manualWidgetInput = $el("input.comfy-input", {
            type: "text",
            placeholder: "上游 widget 名称",
        });
        this.manualWidgetInput.setAttribute("list", "template-analyzer-widgets");
        this.manualInput = $el("select.comfy-select");
        this.manualTitle = $el("input.comfy-input", {
            type: "text",
            placeholder: "标题关键词，逗号分隔",
        });
        this.manualError = $el("div.template-analyzer-manual-error");
        this.manualError.style.display = "none";

        this.manualWidgetField = $el("label.template-analyzer-manual-field", [
            $el("span", { textContent: "Widget" }),
            this.manualWidget,
            this.manualWidgetInput,
        ]);
        this.manualInputField = $el("label.template-analyzer-manual-field", [
            $el("span.manual-input-label", { textContent: "输入" }),
            this.manualInput,
        ]);
        this.manualTitleField = $el("label.template-analyzer-manual-field", [
            $el("span", { textContent: "标题关键词" }),
            this.manualTitle,
        ]);

        this.widgetDatalist = $el("datalist", { id: "template-analyzer-widgets" });

        return $el("div.template-analyzer-manual", { style: { display: "none" } }, [
            $el("div.template-analyzer-manual-grid", [
                $el("label.template-analyzer-manual-field", [
                    $el("span", { textContent: "参数名" }),
                    this.manualName,
                ]),
                $el("label.template-analyzer-manual-field", [
                    $el("span.manual-node-label", { textContent: "节点" }),
                    this.manualNode,
                ]),
                $el("label.template-analyzer-manual-field", [
                    $el("span", { textContent: "匹配方式" }),
                    this.manualStrategy,
                ]),
                this.manualWidgetField,
                this.manualInputField,
                this.manualTitleField,
            ]),
            this.manualError,
            this.widgetDatalist,
            $el("div.template-analyzer-manual-actions", [
                $el("button.comfy-btn.small", {
                    textContent: "取消",
                    onclick: () => this.toggleManual(false),
                }),
                $el("button.comfy-btn.small.primary", {
                    textContent: "添加参数",
                    onclick: () => this.onManualAdd(),
                }),
            ]),
        ]);
    }

    addStyles() {
        injectStyles();
        if (document.getElementById("comfy-template-analyzer-styles")) return;

        const style = document.createElement("style");
        style.id = "comfy-template-analyzer-styles";
        style.textContent = `
            .comfy-template-analyzer {
                z-index: 10003;
                width: 820px;
                max-height: 88vh;
            }

            .comfy-template-analyzer .comfy-modal-content {
                width: 100%;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .comfy-template-analyzer h2 {
                margin: 0;
                color: #cdd6f4;
            }

            .template-analyzer-note {
                margin: 0;
                color: #a6adc8;
                font-size: 13px;
            }

            .template-analyzer-meta {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px 12px;
            }

            .template-analyzer-meta-field {
                display: flex;
                flex-direction: column;
                gap: 4px;
                color: #a6adc8;
                font-size: 12px;
            }

            .template-analyzer-meta-field .comfy-input,
            .template-analyzer-meta-field .comfy-select {
                margin-bottom: 0;
            }

            .template-analyzer-summary {
                color: #cdd6f4;
                font-size: 13px;
            }

            .template-analyzer-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
                max-height: 46vh;
                overflow-y: auto;
            }

            .template-analyzer-row {
                display: grid;
                grid-template-columns: 20px minmax(110px, 0.8fr) minmax(160px, 1.4fr) 70px 26px;
                gap: 8px;
                align-items: center;
                padding: 7px 9px;
                background: #313244;
                border: 1px solid #45475a;
                border-radius: 4px;
                font-size: 13px;
            }

            .template-analyzer-row.error {
                border-color: #f38ba8;
            }

            .template-analyzer-row input[type="checkbox"] {
                margin: 0;
            }

            .template-analyzer-name {
                color: #cdd6f4;
                font-weight: bold;
            }

            .template-analyzer-source {
                color: #a6adc8;
                font-family: monospace;
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .template-analyzer-strategy {
                color: #89b4fa;
                font-size: 12px;
                text-align: right;
            }

            .template-analyzer-value {
                grid-column: 2 / 6;
                color: #a6adc8;
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .template-analyzer-error {
                grid-column: 2 / 6;
                color: #f38ba8;
                font-size: 12px;
            }

            .template-analyzer-remove {
                padding: 0;
                width: 22px;
                height: 22px;
                background: transparent;
                border: none;
                color: #a6adc8;
                cursor: pointer;
                font-size: 14px;
            }

            .template-analyzer-remove:hover {
                color: #f38ba8;
            }

            .template-analyzer-empty {
                color: #a6adc8;
                font-size: 13px;
                padding: 12px;
                text-align: center;
            }

            .template-analyzer-manual {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 10px;
                background: #1e1e2e;
                border: 1px solid #45475a;
                border-radius: 4px;
            }

            .template-analyzer-manual-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px 12px;
            }

            .template-analyzer-manual-field {
                display: flex;
                flex-direction: column;
                gap: 4px;
                color: #a6adc8;
                font-size: 12px;
            }

            .template-analyzer-manual-field .comfy-input,
            .template-analyzer-manual-field .comfy-select {
                margin-bottom: 0;
            }

            .template-analyzer-manual-error {
                color: #f38ba8;
                font-size: 12px;
            }

            .template-analyzer-manual-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }

            .template-analyzer-status {
                min-height: 16px;
                font-size: 12px;
                color: #a6adc8;
            }

            .template-analyzer-status.success {
                color: #a6e3a1;
            }

            .template-analyzer-status.error {
                color: #f38ba8;
            }

            .template-analyzer-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                flex-wrap: wrap;
            }
        `;
        document.head.appendChild(style);
    }

    show() {
        this.element.style.display = "flex";
        this.setStatus("");
        this.candidates = [];
        this.selected.clear();
        this.synonyms = {};
        this.idInput.value = "";
        this.nameInput.value = "";
        this.descriptionInput.value = "";
        this.sourceSelect.value = "";
        this.toggleManual(false);
        this.loadTemplates().then(() => this.analyzeCurrent());
    }

    close() {
        this.element.style.display = "none";
    }

    setStatus(text, kind = "") {
        this.statusEl.textContent = text;
        this.statusEl.className = `template-analyzer-status ${kind}`;
    }

    async loadTemplates() {
        try {
            this.templates = await getWorkflows();
        } catch (error) {
            this.templates = [];
            this.setStatus(`加载模板列表失败：${error.message}`, "error");
        }

        const selected = this.sourceSelect.value;
        this.sourceSelect.replaceChildren(
            $el("option", { value: "", textContent: "当前 workflow" }),
            ...this.templates.map(template => $el("option", {
                value: template.id,
                textContent: `${template.name} (${template.id})${template.source === "bundled" ? " · 内置" : ""}`,
            }))
        );
        if (this.templates.some(template => template.id === selected)) {
            this.sourceSelect.value = selected;
        }
    }

    async onSourceChange() {
        const templateId = this.sourceSelect.value;
        if (!templateId) {
            this.analyzeCurrent();
            return;
        }

        try {
            await this.loadTemplate(templateId);
        } catch (error) {
            this.setStatus(`加载模板失败：${error.message}`, "error");
        }
    }

    async onRefresh() {
        if (this.sourceSelect.value) {
            try {
                await this.loadTemplate(this.sourceSelect.value, false);
            } catch (error) {
                this.setStatus(`加载模板失败：${error.message}`, "error");
            }
            return;
        }
        this.analyzeCurrent();
    }

    analyzeCurrent() {
        const result = analyzeGraph(app.graph);
        this.candidates = result.candidates.map(candidate => ({ ...candidate, manual: false }));
        this.synonyms = {};
        this.selected = new Set(
            this.candidates
                .filter(candidate => candidate.status === "matched" && candidate.defaultSelected)
                .map(candidate => candidate.name)
        );
        this.setStatus("");
        this.render();
    }

    async loadTemplate(templateId, suggest = true) {
        const template = await getTemplateDetail(templateId);
        this.candidates = describeMapping(
            app.graph,
            template.node_mapping,
            template.synonyms
        ).map(candidate => ({ ...candidate, manual: false }));
        this.synonyms = template.synonyms || {};
        this.selected = new Set(
            this.candidates
                .filter(candidate => candidate.status === "matched" && candidate.defaultSelected)
                .map(candidate => candidate.name)
        );

        if (suggest) {
            this.idInput.value = this.suggestTemplateId(templateId);
            this.nameInput.value = `${template.name || templateId} 副本`;
            this.descriptionInput.value = template.description || "";
        }

        this.setStatus(`已载入模板「${template.name || templateId}」的映射，可修改后另存。`);
        this.render();
    }

    suggestTemplateId(base) {
        const ids = new Set(this.templates.map(template => template.id));
        let candidate = `${base}-copy`;
        let index = 2;
        while (ids.has(candidate)) {
            candidate = `${base}-copy-${index++}`;
        }
        return candidate;
    }

    render() {
        this.listEl.replaceChildren();

        const matched = this.candidates.filter(candidate => candidate.status === "matched").length;
        const errors = this.candidates.length - matched;
        this.summaryEl.textContent =
            `识别 ${this.candidates.length} 个候选：${matched} 个可用，${errors} 个需要调整；` +
            `已选 ${this.selected.size} 个。模型参数默认不勾选。`;
        this.saveButton.disabled = this.selected.size === 0 || this.saving;

        if (this.candidates.length === 0) {
            this.listEl.appendChild($el("div.template-analyzer-empty", {
                textContent: "没有识别到已知字段，可手动添加参数。"
            }));
            return;
        }

        for (const candidate of this.candidates) {
            const row = $el("div.template-analyzer-row", {
                className: `template-analyzer-row ${candidate.status === "error" ? "error" : ""}`
            }, [
                $el("input", {
                    type: "checkbox",
                    checked: this.selected.has(candidate.name),
                    disabled: candidate.status === "error" || !candidate.spec,
                    onchange: (event) => this.onToggle(candidate.name, event.target.checked),
                }),
                $el("span.template-analyzer-name", {
                    textContent: candidate.name + (candidate.manual ? "（手动）" : ""),
                }),
                $el("span.template-analyzer-source", {
                    textContent: this.sourceText(candidate),
                    title: this.sourceText(candidate),
                }),
                $el("span.template-analyzer-strategy", {
                    textContent: STRATEGY_LABELS[candidate.strategy] || "无"
                }),
                $el("button.template-analyzer-remove", {
                    textContent: "✕",
                    title: "移除参数",
                    onclick: () => this.onRemove(candidate.name),
                }),
            ]);

            if (candidate.status === "error") {
                row.appendChild($el("span.template-analyzer-error", {
                    textContent: candidate.reason || "未匹配到节点"
                }));
            } else {
                row.appendChild($el("span.template-analyzer-value", {
                    textContent: this.formatValue(candidate.value),
                    title: String(candidate.value ?? "")
                }));
            }

            this.listEl.appendChild(row);
        }
    }

    sourceText(candidate) {
        const nodeType = candidate.nodeType || candidate.classType || "?";
        const widget = candidate.widgetName || "?";
        const nodeId = candidate.nodeId ? ` · #${candidate.nodeId}` : "";
        return `${nodeType} · ${widget}${nodeId}`;
    }

    onToggle(name, checked) {
        if (checked) {
            this.selected.add(name);
        } else {
            this.selected.delete(name);
        }
        this.render();
    }

    onRemove(name) {
        this.candidates = this.candidates.filter(candidate => candidate.name !== name);
        this.selected.delete(name);
        this.render();
    }

    toggleManual(force) {
        this.manualVisible = force === undefined ? !this.manualVisible : force;
        this.manualForm.style.display = this.manualVisible ? "flex" : "none";
        if (!this.manualVisible) return;

        this.manualError.style.display = "none";
        this.populateManualNodes();
    }

    populateManualNodes() {
        this.nodes = listNodes(app.graph);
        this.manualNode.replaceChildren(
            ...this.nodes.map(node => $el("option", {
                value: node.id,
                textContent: `#${node.id} · ${node.type}${node.title ? ` · ${node.title}` : ""}`,
            }))
        );

        const widgetNames = [...new Set(this.nodes.flatMap(node => node.widgets))].sort();
        this.widgetDatalist.replaceChildren(
            ...widgetNames.map(name => $el("option", { value: name }))
        );

        if (this.nodes.length > 0) {
            this.onManualNodeChange();
        }
    }

    onManualNodeChange() {
        const node = this.nodes.find(item => item.id === this.manualNode.value);
        if (!node) return;

        this.manualWidget.replaceChildren(
            ...node.widgets.map(name => $el("option", { value: name, textContent: name }))
        );
        this.manualInput.replaceChildren(
            ...node.inputs.map(name => $el("option", { value: name, textContent: name }))
        );
        this.manualTitle.value = node.title;

        const sameType = this.nodes.filter(item => item.type === node.type).length;
        const sameTitle = node.title
            && this.nodes.filter(item =>
                item.type === node.type && item.title === node.title
            ).length === 1;

        this.manualStrategy.value =
            sameType === 1 ? "unique_class" : (sameTitle ? "title_keyword" : "unique_class");
        this.updateManualFields();
    }

    updateManualFields() {
        const strategy = this.manualStrategy.value;
        const slot = strategy === "input_slot" || strategy === "output_connection";

        this.manualWidget.style.display = slot ? "none" : "";
        this.manualWidgetInput.style.display = slot ? "" : "none";
        this.manualInputField.style.display = slot ? "" : "none";
        this.manualTitleField.style.display = strategy === "title_keyword" ? "" : "none";

        this.manualInputField.querySelector(".manual-input-label").textContent =
            strategy === "input_slot" ? "枢纽输入" : "目标输入";
        this.manualForm.querySelector(".manual-node-label").textContent =
            strategy === "input_slot" ? "枢纽节点" : strategy === "output_connection" ? "目标节点" : "节点";
    }

    onManualAdd() {
        const node = this.nodes.find(item => item.id === this.manualNode.value);
        const name = this.manualName.value.trim();
        const strategy = this.manualStrategy.value;
        const widget = strategy === "input_slot" || strategy === "output_connection"
            ? this.manualWidgetInput.value.trim()
            : this.manualWidget.value;

        this.manualError.style.display = "none";

        const fail = (message) => {
            this.manualError.textContent = message;
            this.manualError.style.display = "";
        };

        if (!node) return fail("请选择节点");
        if (!name) return fail("参数名不能为空");
        if (this.candidates.some(candidate => candidate.name === name)) {
            return fail(`参数名已存在：${name}`);
        }
        if (!widget) return fail("Widget 不能为空");

        let spec;
        if (strategy === "unique_class") {
            spec = { match_strategy: strategy, class_type: node.type, widget };
        } else if (strategy === "title_keyword") {
            const keywords = this.manualTitle.value
                .split(/[,，]/)
                .map(item => item.trim())
                .filter(Boolean);
            if (keywords.length === 0) return fail("标题关键词不能为空");
            spec = { match_strategy: strategy, class_type: node.type, title_keywords: keywords, widget };
        } else if (strategy === "input_slot") {
            const inputName = this.manualInput.value;
            if (!inputName) return fail("请选择枢纽输入");
            spec = {
                match_strategy: strategy,
                class_type: node.type,
                input_name: inputName,
                widget,
            };
        } else if (strategy === "output_connection") {
            const targetInput = this.manualInput.value;
            if (!targetInput) return fail("请选择目标输入");
            spec = {
                match_strategy: strategy,
                target_class_type: node.type,
                target_input: targetInput,
                widget,
            };
        } else {
            return fail("未知匹配方式");
        }

        const candidate = describeMapping(app.graph, { [name]: spec })[0];
        candidate.manual = true;
        candidate.defaultSelected = true;
        this.candidates.push(candidate);
        if (candidate.status === "matched") {
            this.selected.add(name);
        }
        this.render();

        if (candidate.status === "error") {
            fail(candidate.reason || "该规则当前无法匹配，请调整后再保存");
        } else {
            this.manualError.style.display = "none";
            this.manualName.value = "";
            this.setStatus(`已添加参数：${name}`, "success");
        }
    }

    async onSave() {
        if (this.saving) return;

        const selectedCandidates = this.candidates.filter(candidate =>
            this.selected.has(candidate.name) &&
            candidate.status === "matched" &&
            candidate.spec
        );

        let payload;
        try {
            payload = buildTemplate({
                id: this.idInput.value,
                name: this.nameInput.value,
                description: this.descriptionInput.value,
                candidates: selectedCandidates,
                synonyms: this.synonyms,
            });
        } catch (error) {
            this.setStatus(error.message, "error");
            return;
        }

        const existing = this.templates.find(template => template.id === payload.id);
        if (existing?.source === "bundled") {
            this.setStatus(`模板 ID 与内置模板「${existing.name}」相同，请换一个 ID。`, "error");
            return;
        }
        if (existing && !confirm(`覆盖用户模板「${existing.name}」？`)) {
            return;
        }

        this.saving = true;
        this.saveButton.disabled = true;
        this.setStatus("正在保存…");
        try {
            await saveTemplate(payload);
            app.graph.extra = app.graph.extra || {};
            app.graph.extra.preset_template = payload.id;
            app.graph.setDirtyCanvas?.(true, true);

            await this.loadTemplates();
            this.setStatus(
                `已保存模板「${payload.name}」(${payload.id})。可在 Presets 和 Sweeps 中使用。`,
                "success"
            );
        } catch (error) {
            this.setStatus(`保存模板失败：${error.message}`, "error");
        } finally {
            this.saving = false;
            this.saveButton.disabled = this.selected.size === 0;
        }
    }

    formatValue(value) {
        if (value === null || value === undefined) return "（空）";
        const text = String(value);
        return text.length > 100 ? text.slice(0, 100) + "…" : text;
    }
}
