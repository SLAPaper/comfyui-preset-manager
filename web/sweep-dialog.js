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
    getPresets, getTemplateDetail, getWorkflows
} from "./client.js";
import { applyParams, checkParams, resolveParams } from "./matcher.js";
import { SweepAxes } from "./sweep-axes.js";
import { runSweep } from "./sweep-runner.js";
import { injectStyles } from "./styles.js";

export class SweepDialog {
    constructor() {
        this.element = null;
        this.templateId = null;
        this.template = null;
        this.presets = [];
        this.sweeps = [];
        this.currentSweepId = null;
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
        this.axesEditor = new SweepAxes(this.axisList, this.summary);
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
                            onclick: () => this.axesEditor.addAxis("param")
                        }),
                        $el("button.comfy-btn.small", {
                            textContent: "+ 预设轴",
                            onclick: () => this.axesEditor.addAxis("preset")
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
        injectStyles();
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
        this.axesEditor.clear();
        this.cancelRequested = false;
        this.progress.textContent = "";
        this.progress.classList.remove("error");
        this.nameInput.value = "";

        this.templateSelect.disabled = !!templateId;
        this.templateId = templateId;
        this.element.style.display = "flex";

        try {
            const workflows = await getWorkflows();
            this.templateSelect.innerHTML = "";
            for (const w of workflows) {
                this.templateSelect.appendChild($el("option", {
                    value: w.id,
                    textContent: w.name,
                    selected: w.id === this.templateId
                }));
            }

            // Fall back to the first template when none is stored or the stored
            // template no longer exists, so the dialog stays usable.
            if (!workflows.some(w => w.id === this.templateId)) {
                this.templateId = workflows[0]?.id ?? null;
                this.templateSelect.disabled = !this.templateId;
                if (this.templateId) this.templateSelect.value = this.templateId;
            }

            if (!this.templateId) return;
            await this.loadTemplateData();
            this.axesEditor.render();
        } catch (error) {
            this.reportError(error, "加载失败");
        }
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
        this.axesEditor.setSources(template, presets);

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
        this.currentSweepId = null;
        this.nameInput.value = "";
        this.axesEditor.clear();
        try {
            await this.loadTemplateData();
            this.axesEditor.render();
        } catch (error) {
            this.reportError(error, "加载失败");
        }
    }

    close() {
        this.element.style.display = "none";
    }

    reportError(error, prefix) {
        this.progress.classList.add("error");
        this.progress.textContent = `${prefix}: ${error.message}`;
    }

    async onSweepSelect() {
        const sweepId = this.sweepSelect.value;
        if (!sweepId) {
            this.currentSweepId = null;
            this.nameInput.value = "";
            this.axesEditor.clear();
            return;
        }

        try {
            const sweep = await getSweepDetail(this.templateId, sweepId);
            this.currentSweepId = sweepId;
            this.nameInput.value = sweep.name || sweepId;
            this.axesEditor.setAxes(sweep.axes || []);
        } catch (error) {
            this.reportError(error, "加载扫描配置失败");
        }
    }

    collectSweep() {
        return { name: this.nameInput.value.trim(), axes: this.axesEditor.getAxes() };
    }

    async onSave() {
        const name = this.nameInput.value.trim();
        if (!name) {
            alert("请填写扫描配置名称");
            return;
        }

        const sweepId = this.currentSweepId || name
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
            .replace(/^-+|-+$/g, "") || `sweep-${Date.now().toString(36)}`;

        try {
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
        } catch (error) {
            this.reportError(error, "保存失败");
        }
    }

    async onDelete() {
        if (!this.currentSweepId) return;
        if (!confirm(`删除扫描配置「${this.nameInput.value}」？`)) return;

        try {
            await deleteSweep(this.templateId, this.currentSweepId);
            await this.show(this.templateId);
        } catch (error) {
            this.reportError(error, "删除失败");
        }
    }

    /**
     * Snapshot the widgets a set of params resolves to, so they can be restored.
     */
    snapshotWidgets(paramNames) {
        const resolved = resolveParams(app.graph, this.template);
        const snapshot = [];
        for (const name of paramNames) {
            const match = resolved[name];
            if (match) snapshot.push({ widget: match.widget, value: match.value });
        }
        return snapshot;
    }

    /**
     * Put widget values back and repaint the canvas.
     */
    restoreWidgets(snapshot) {
        for (const { widget, value } of snapshot) {
            widget.value = value;
        }
        app.graph.setDirtyCanvas(true, true);
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

        // Validate against the graph before queueing anything.
        const failed = checkParams(app.graph, this.template, combos[0].params);
        if (failed.length > 0) {
            this.progress.classList.add("error");
            this.progress.textContent = `参数无法匹配到节点: ${failed.join(", ")}`;
            return;
        }

        if (!confirm(`将向队列提交 ${combos.length} 次运行，确定继续？`)) return;

        const snapshot = this.snapshotWidgets(new Set(combos.flatMap(combo => Object.keys(combo.params))));
        this.running = true;
        this.cancelRequested = false;
        this.runButton.textContent = "取消";
        this.progress.classList.remove("error");

        try {
            const result = await runSweep({
                combos,
                check: (params) => checkParams(app.graph, this.template, params),
                apply: (params) => applyParams(app.graph, this.template, params),
                queue: () => app.queuePrompt(0, 1),
                isCancelled: () => this.cancelRequested,
                onProgress: (submitted, combo) => {
                    this.progress.textContent = `${submitted}/${combos.length} — ${combo.label}`;
                },
            });
            this.progress.textContent = result.cancelled
                ? `已取消（${result.submitted}/${combos.length}）`
                : `完成，已提交 ${result.submitted} 次运行`;
        } catch (error) {
            this.progress.classList.add("error");
            this.progress.textContent = `运行失败: ${error.message}`;
        } finally {
            this.restoreWidgets(snapshot);
            this.running = false;
            this.cancelRequested = false;
            this.runButton.textContent = "运行";
        }
    }
}
