/**
 * SweepDialog for ComfyUI Preset Manager.
 *
 * Edits and runs parameter sweeps: each axis contributes a list of values,
 * and the sweep runs the cartesian product of all axes. axes[0] is the
 * outermost loop, and later axes override earlier ones on conflict.
 */

import { app } from "../../scripts/app.js";
import { $el } from "../../scripts/ui.js";
import {
    getSweeps, getSweepDetail, saveSweep, deleteSweep, expandSweep,
    getPresets, getTemplateDetail, applyParamsToGraph, findNodeByTemplate,
    getWorkflows
} from "./preset-api.js";

/**
 * Parse a comma-separated value list, keeping numbers as numbers.
 */
function parseValues(text) {
    return text.split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => {
            const n = Number(s);
            return s !== "" && Number.isFinite(n) ? n : s;
        });
}

function formatValues(values) {
    return (values || []).join(", ");
}

export class SweepDialog {
    constructor() {
        this.element = null;
        this.templateId = null;
        this.template = null;
        this.presets = [];
        this.sweeps = [];
        this.currentSweepId = null;
        this.axes = [];
        this.running = false;
        this.cancelRequested = false;
        this.createDialog();
    }

    createDialog() {
        this.nameInput = $el("input.comfy-input", { type: "text", placeholder: "扫描配置名称" });
        this.templateSelect = $el("select.comfy-select", {
            onchange: () => this.onTemplateChange()
        });
        this.sweepSelect = $el("select.comfy-select", {
            onchange: () => this.onSweepSelect()
        });
        this.axisList = $el("div.sweep-axis-list");
        this.summary = $el("div.sweep-summary", { textContent: "尚未配置轴" });
        this.progress = $el("div.sweep-progress");

        this.runButton = $el("button.comfy-btn.primary", {
            textContent: "运行",
            onclick: () => this.onRun()
        });

        this.element = $el("div.comfy-modal.comfy-sweep-dialog", {
            style: { display: "none" }
        }, [
            $el("div.comfy-modal-content", [
                $el("h3", { textContent: "参数扫描" }),

                $el("div.sweep-section", [
                    $el("label", { textContent: "模板" }),
                    this.templateSelect
                ]),

                $el("div.sweep-section", [
                    $el("label", { textContent: "已保存的扫描配置" }),
                    $el("div.sweep-row", [
                        this.sweepSelect,
                        $el("button.comfy-btn.small", {
                            textContent: "删除",
                            onclick: () => this.onDelete()
                        })
                    ])
                ]),

                $el("div.sweep-section", [
                    $el("label", { textContent: "名称" }),
                    this.nameInput
                ]),

                $el("div.sweep-section", [
                    $el("div.sweep-row", [
                        $el("label", { textContent: "扫描轴（第一条为最外层循环）" }),
                        $el("button.comfy-btn.small", {
                            textContent: "+ 参数轴",
                            onclick: () => this.addAxis("param")
                        }),
                        $el("button.comfy-btn.small", {
                            textContent: "+ 预设轴",
                            onclick: () => this.addAxis("preset")
                        })
                    ]),
                    this.axisList
                ]),

                this.summary,
                this.progress,

                $el("div.sweep-buttons", [
                    $el("button.comfy-btn", {
                        textContent: "保存",
                        onclick: () => this.onSave()
                    }),
                    this.runButton,
                    $el("button.comfy-btn", {
                        textContent: "关闭",
                        onclick: () => this.close()
                    })
                ])
            ])
        ]);

        this.addStyles();
        document.body.appendChild(this.element);
    }

    addStyles() {
        if (document.getElementById("comfy-sweep-dialog-styles")) return;

        const style = document.createElement("style");
        style.id = "comfy-sweep-dialog-styles";
        style.textContent = `
            .comfy-sweep-dialog {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 1002;
                width: 640px;
                max-height: 80vh;
            }

            .comfy-sweep-dialog .comfy-modal-content {
                width: 100%;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 12px;
                max-height: 80vh;
                overflow-y: auto;
            }

            .comfy-sweep-dialog h3 {
                margin: 0;
                color: #cdd6f4;
            }

            .comfy-sweep-dialog label {
                display: block;
                color: #a6adc8;
                margin-bottom: 5px;
                font-size: 14px;
            }

            .sweep-row {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .sweep-row > label {
                flex: 1;
                margin-bottom: 0;
            }

            .sweep-axis {
                display: flex;
                gap: 6px;
                align-items: center;
                padding: 6px;
                margin-bottom: 6px;
                background: #1e1e2e;
                border: 1px solid #45475a;
                border-radius: 4px;
            }

            .sweep-axis-kind {
                color: #89b4fa;
                font-size: 12px;
                min-width: 42px;
            }

            .sweep-axis select,
            .sweep-axis input {
                flex: 1;
                min-width: 0;
                padding: 4px 6px;
                background: #313244;
                color: #cdd6f4;
                border: 1px solid #45475a;
                border-radius: 3px;
            }

            .sweep-axis input {
                flex: 2;
            }

            .sweep-axis-presets {
                display: flex;
                flex: 2;
                flex-wrap: wrap;
                gap: 4px 12px;
                align-items: center;
            }

            .sweep-axis-preset {
                display: flex;
                align-items: center;
                gap: 4px;
                color: #cdd6f4;
                font-size: 13px;
                cursor: pointer;
            }

            .sweep-summary {
                color: #a6adc8;
                font-size: 13px;
            }

            .sweep-progress {
                color: #a6e3a1;
                font-size: 13px;
                min-height: 18px;
            }

            .sweep-progress.error {
                color: #f38ba8;
            }

            .sweep-buttons {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
        `;
        document.head.appendChild(style);
    }

    async show(templateId) {
        this.currentSweepId = null;
        this.axes = [];
        this.cancelRequested = false;
        this.progress.textContent = "";
        this.progress.classList.remove("error");
        this.nameInput.value = "";

        this.templateSelect.disabled = !!templateId;
        this.templateId = templateId;
        this.element.style.display = "flex";

        const workflows = await getWorkflows();
        this.templateSelect.innerHTML = "";
        for (const w of workflows) {
            this.templateSelect.appendChild($el("option", {
                value: w.id,
                textContent: w.name,
                selected: w.id === this.templateId
            }));
        }

        // If no template was pre-selected (e.g. workflow not mapped yet), fall
        // back to the first template so the dialog is immediately usable.
        if (!this.templateId && workflows.length > 0) {
            this.templateId = workflows[0].id;
            this.templateSelect.value = this.templateId;
        }

        await this.loadTemplateData();
        this.renderAxes();
    }

    async loadTemplateData() {
        const [template, presets, sweeps] = await Promise.all([
            getTemplateDetail(this.templateId),
            getPresets(this.templateId),
            getSweeps(this.templateId)
        ]);
        this.template = template;
        this.presets = presets;
        this.sweeps = sweeps;

        this.sweepSelect.innerHTML = "";
        this.sweepSelect.appendChild($el("option", { value: "", textContent: "（新建）" }));
        for (const sweep of sweeps) {
            this.sweepSelect.appendChild(
                $el("option", { value: sweep.id, textContent: sweep.name })
            );
        }
    }

    async onTemplateChange() {
        this.templateId = this.templateSelect.value;
        await this.loadTemplateData();
        this.renderAxes();
    }

    close() {
        this.element.style.display = "none";
    }

    async onSweepSelect() {
        const sweepId = this.sweepSelect.value;
        if (!sweepId) {
            this.currentSweepId = null;
            this.nameInput.value = "";
            this.basePresetSelect.value = "";
            this.axes = [];
            this.renderAxes();
            return;
        }

        const sweep = await getSweepDetail(this.templateId, sweepId);
        this.currentSweepId = sweepId;
        this.nameInput.value = sweep.name || sweepId;
        this.axes = (sweep.axes || []).map(a => ({ ...a }));
        this.renderAxes();
    }

    addAxis(type) {
        const axis = type === "preset"
            ? { type: "preset", values: [] }
            : { type: "param", param: Object.keys(this.template.node_mapping)[0] || "", values: [] };
        this.axes.push(axis);
        this.renderAxes();
    }

    moveAxis(index, delta) {
        const target = index + delta;
        if (target < 0 || target >= this.axes.length) return;
        [this.axes[index], this.axes[target]] = [this.axes[target], this.axes[index]];
        this.renderAxes();
    }

    renderAxes() {
        this.axisList.innerHTML = "";

        for (const [index, axis] of this.axes.entries()) {
            const controls = [
                $el("span.sweep-axis-kind", {
                    textContent: axis.type === "preset" ? "预设" : "参数"
                })
            ];

            if (axis.type === "param") {
                const select = $el("select", {
                    onchange: (e) => { axis.param = e.target.value; }
                });
                for (const name of Object.keys(this.template.node_mapping)) {
                    select.appendChild($el("option", {
                        value: name,
                        textContent: name,
                        selected: name === axis.param
                    }));
                }
                controls.push(select);
                controls.push($el("input", {
                    type: "text",
                    placeholder: "值，逗号分隔",
                    value: formatValues(axis.values),
                    oninput: (e) => {
                        axis.values = parseValues(e.target.value);
                        this.updateSummary();
                    }
                }));
            } else {
                const checkboxRow = $el("div.sweep-axis-presets");
                for (const preset of this.presets) {
                    const cb = $el("input", {
                        type: "checkbox",
                        value: preset.id,
                        checked: axis.values.includes(preset.id),
                        onchange: (e) => {
                            if (e.target.checked) {
                                axis.values.push(preset.id);
                            } else {
                                axis.values = axis.values.filter(v => v !== preset.id);
                            }
                            this.updateSummary();
                        }
                    });
                    checkboxRow.appendChild($el("label.sweep-axis-preset", [
                        cb,
                        $el("span", { textContent: preset.name })
                    ]));
                }
                controls.push(checkboxRow);
            }

            controls.push($el("button.comfy-btn.small", {
                textContent: "↑",
                onclick: () => this.moveAxis(index, -1)
            }));
            controls.push($el("button.comfy-btn.small", {
                textContent: "↓",
                onclick: () => this.moveAxis(index, 1)
            }));
            controls.push($el("button.comfy-btn.small", {
                textContent: "✕",
                onclick: () => {
                    this.axes.splice(index, 1);
                    this.renderAxes();
                }
            }));

            this.axisList.appendChild($el("div.sweep-axis", controls));
        }

        this.updateSummary();
    }

    updateSummary() {
        const counts = this.axes.map(a => (a.values || []).length);
        if (counts.length === 0 || counts.some(c => c === 0)) {
            this.summary.textContent = "尚未配置轴";
            return;
        }
        const total = counts.reduce((a, b) => a * b, 1);
        this.summary.textContent = `${counts.join(" × ")} = ${total} 次运行`;
    }

    collectSweep() {
        return { name: this.nameInput.value.trim(), axes: this.axes };
    }

    async onSave() {
        const name = this.nameInput.value.trim();
        if (!name) {
            alert("请填写扫描配置名称");
            return;
        }

        const sweepId = this.currentSweepId || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        await saveSweep({
            workflow_template: this.templateId,
            id: sweepId,
            ...this.collectSweep()
        });

        this.currentSweepId = sweepId;
        this.sweeps = await getSweeps(this.templateId);
        this.sweepSelect.innerHTML = "";
        this.sweepSelect.appendChild($el("option", { value: "", textContent: "（新建）" }));
        for (const sweep of this.sweeps) {
            this.sweepSelect.appendChild($el("option", {
                value: sweep.id,
                textContent: sweep.name,
                selected: sweep.id === sweepId
            }));
        }
        this.progress.classList.remove("error");
        this.progress.textContent = "已保存";
    }

    async onDelete() {
        if (!this.currentSweepId) return;
        if (!confirm(`删除扫描配置「${this.nameInput.value}」？`)) return;

        await deleteSweep(this.templateId, this.currentSweepId);
        await this.show(this.templateId);
    }

    /**
     * Snapshot the widgets a set of params resolves to, so they can be restored.
     */
    snapshotWidgets(paramNames) {
        const snapshot = [];
        for (const name of paramNames) {
            const paramDef = this.template.node_mapping[name];
            if (!paramDef) continue;
            const result = findNodeByTemplate(app.graph, paramDef, this.template.synonyms || {});
            if (!result) continue;
            const widget = result.node.widgets?.find(w => w.name === result.widgetName);
            if (widget) snapshot.push({ widget, value: widget.value });
        }
        return snapshot;
    }

    async onRun() {
        if (this.running) {
            this.cancelRequested = true;
            this.progress.textContent = "正在取消…";
            return;
        }

        let combos;
        try {
            combos = await expandSweep(this.templateId, this.collectSweep());
        } catch (error) {
            this.progress.classList.add("error");
            this.progress.textContent = `展开失败: ${error.message}`;
            return;
        }

        if (combos.length === 0) {
            this.progress.classList.add("error");
            this.progress.textContent = "没有可运行的组合";
            return;
        }

        // Validate against the graph before queueing anything
        const probe = applyParamsToGraph(app.graph, this.template, combos[0].params);
        if (probe.failed.length > 0) {
            this.progress.classList.add("error");
            this.progress.textContent = `参数无法匹配到节点: ${probe.failed.join(", ")}`;
            return;
        }

        if (!confirm(`将向队列提交 ${combos.length} 次运行，确定继续？`)) return;

        const snapshot = this.snapshotWidgets(Object.keys(combos[0].params));
        this.running = true;
        this.cancelRequested = false;
        this.runButton.textContent = "取消";
        this.progress.classList.remove("error");

        try {
            for (const [index, combo] of combos.entries()) {
                if (this.cancelRequested) break;
                applyParamsToGraph(app.graph, this.template, combo.params);
                await app.queuePrompt(0, 1);
                this.progress.textContent = `${index + 1}/${combos.length} — ${combo.label}`;
            }
            this.progress.textContent = this.cancelRequested
                ? `已取消（${this.progress.textContent}）`
                : `完成，已提交 ${combos.length} 次运行`;
        } catch (error) {
            this.progress.classList.add("error");
            this.progress.textContent = `运行失败: ${error.message}`;
        } finally {
            for (const { widget, value } of snapshot) {
                widget.value = value;
            }
            app.graph.setDirtyCanvas(true, true);
            this.running = false;
            this.cancelRequested = false;
            this.runButton.textContent = "运行";
        }
    }
}
