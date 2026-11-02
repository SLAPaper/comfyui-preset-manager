/**
 * SweepDialog for ComfyUI Preset Manager.
 *
 * Edits and runs parameter sweeps: each axis contributes a list of values,
 * and the sweep runs the cartesian product of all axes. axes[0] is the
 * outermost loop, and later axes override earlier ones on conflict.
 */

import { app } from "../../scripts/app.js";
import {
    getSweeps, getSweepDetail, saveSweep, deleteSweep, expandSweep,
    getPresets, getTemplateDetail
} from "./client.js";
import { loadTemplates } from "./template-store.js";
import {
    applyParams, captureParams, checkParams, explainParams, resolveParams, restoreParams
} from "./matcher.js";
import { acquireGraphLock, releaseGraphLock } from "./graph-lock.js";
import { SweepAxes } from "./sweep-axes.js";
import { runSweep } from "./sweep-runner.js";
import { applyPrefixes, capturePrefixes, restorePrefixes } from "./sweep-trace.js";
import { injectStyles } from "./styles.js";

const { $el } = window.comfyAPI.ui;

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
        this.templateLocked = false;
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
        this.traceToggle = $el("input", { type: "checkbox", checked: true });
        this.progress = $el("div.sweep-progress");

        this.saveButton = $el("button.comfy-btn", {
            textContent: "保存",
            onclick: () => this.onSave()
        });
        this.deleteButton = $el("button.comfy-btn.small", {
            textContent: "删除",
            onclick: () => this.onDelete()
        });
        this.addParamButton = $el("button.comfy-btn.small", {
            textContent: "+ 参数轴",
            onclick: () => this.axesEditor.addAxis("param")
        });
        this.addPresetButton = $el("button.comfy-btn.small", {
            textContent: "+ 预设轴",
            onclick: () => this.axesEditor.addAxis("preset")
        });
        this.runButton = $el("button.comfy-btn.primary", {
            textContent: "运行",
            disabled: true,
            onclick: () => this.onRun()
        });

        this.element = $el("div.comfy-modal.comfy-sweep-dialog.preset-manager-dialog", {
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
                    $el("div.sweep-row", [this.sweepSelect, this.deleteButton])
                ]),

                $el("div.sweep-section", [
                    $el("label", { textContent: "名称" }),
                    this.nameInput
                ]),

                $el("div.sweep-section", [
                    $el("div.sweep-row", [
                        $el("label", { textContent: "扫描轴（第一条为最外层循环）" }),
                        this.addParamButton,
                        this.addPresetButton
                    ]),
                    this.axisList
                ]),

                this.summary,
                $el("label.sweep-trace", {
                    title: "文件名格式：原名_001_参数=值；扫描结束后恢复原名"
                }, [
                    this.traceToggle,
                    $el("span", { textContent: "在输出文件名中记录组合" })
                ]),
                this.progress,

                $el("div.sweep-buttons", [
                    this.saveButton,
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

            .sweep-trace {
                display: flex;
                align-items: center;
                gap: 6px;
                color: #cdd6f4;
                font-size: 13px;
                cursor: pointer;
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
        this.element.style.display = "flex";
        if (this.running) return;

        this.currentSweepId = null;
        this.axesEditor.clear();
        this.cancelRequested = false;
        this.progress.textContent = "";
        this.progress.classList.remove("error");
        this.nameInput.value = "";

        this.templateLocked = !!templateId;
        this.templateSelect.disabled = this.templateLocked;
        this.templateId = templateId;
        this.clearTemplate();

        try {
            const workflows = await loadTemplates();
            this.templateSelect.innerHTML = "";
            this.templateSelect.appendChild($el("option", {
                value: "",
                textContent: "（请选择模板）",
                selected: !this.templateId
            }));
            for (const w of workflows) {
                this.templateSelect.appendChild($el("option", {
                    value: w.id,
                    textContent: w.name,
                    selected: w.id === this.templateId
                }));
            }

            // A stored binding that no longer exists is dropped, not replaced
            // with another template.
            if (this.templateId && !workflows.some(w => w.id === this.templateId)) {
                this.templateId = null;
                this.templateLocked = false;
                this.templateSelect.value = "";
                this.templateSelect.disabled = false;
            }

            if (!this.templateId) return;
            await this.loadTemplateData();
            this.axesEditor.render();
        } catch (error) {
            this.reportError(error, "加载失败");
        }
    }

    clearTemplate() {
        this.template = null;
        this.presets = [];
        this.sweeps = [];
        this.currentSweepId = null;
        this.axesEditor.setSources(null, []);
        this.axesEditor.clear();
        this.sweepSelect.innerHTML = "";
        this.sweepSelect.appendChild($el("option", { value: "", textContent: "（新建）" }));
        this.nameInput.value = "";
        this.progress.textContent = "";
        this.runButton.disabled = true;
    }

    setRunning(running) {
        this.running = running;
        this.templateSelect.disabled = running || this.templateLocked;
        this.sweepSelect.disabled = running;
        this.nameInput.disabled = running;
        this.traceToggle.disabled = running;
        this.saveButton.disabled = running;
        this.deleteButton.disabled = running;
        this.addParamButton.disabled = running;
        this.addPresetButton.disabled = running;
        this.axesEditor.setDisabled(running);
        this.runButton.textContent = running ? "取消" : "运行";
        this.runButton.disabled = running ? false : !this.templateId;
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
        this.runButton.disabled = false;
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
        if (this.running) return;

        this.templateId = this.templateSelect.value || null;
        this.currentSweepId = null;
        this.nameInput.value = "";
        if (!this.templateId) {
            this.clearTemplate();
            return;
        }

        this.template = null;
        this.runButton.disabled = true;
        this.axesEditor.setSources(null, []);
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
        if (this.running) return;

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
        if (this.running) return;
        if (!this.templateId) {
            alert("请先选择模板");
            return;
        }

        const name = this.nameInput.value.trim();
        if (!name) {
            alert("请填写扫描配置名称");
            return;
        }

        const sweepId = this.currentSweepId || name
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
            .replace(/^-+|-+$/g, "") || `sweep-${Date.now().toString(36)}`;

        const existing = this.sweeps.find(sweep => sweep.id === sweepId);
        if (!this.currentSweepId && existing
            && !confirm(`扫描配置「${existing.name}」已存在，覆盖？`)) {
            return;
        }

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
        if (this.running || !this.currentSweepId) return;
        if (!confirm(`删除扫描配置「${this.nameInput.value}」？`)) return;

        try {
            await deleteSweep(this.templateId, this.currentSweepId);
            await this.show(this.templateId);
        } catch (error) {
            this.reportError(error, "删除失败");
        }
    }

    async onRun() {
        if (this.running) {
            this.cancelRequested = true;
            this.progress.textContent = "正在取消…";
            return;
        }

        const templateId = this.templateId;
        const template = this.template;
        const graph = app.graph;
        if (!templateId || !template) {
            this.progress.classList.add("error");
            this.progress.textContent = "请先选择模板";
            return;
        }

        const sweep = this.collectSweep();
        const sweepKey = JSON.stringify(sweep);
        let combos;
        try {
            combos = await expandSweep(templateId, sweep);
        } catch (error) {
            this.progress.classList.add("error");
            this.progress.textContent = `展开失败: ${error.message}`;
            return;
        }

        if (this.templateId !== templateId || this.template !== template
            || JSON.stringify(this.collectSweep()) !== sweepKey) {
            this.progress.classList.add("error");
            this.progress.textContent = "配置已变更，请重新运行";
            return;
        }

        if (combos.length === 0) {
            this.progress.classList.add("error");
            this.progress.textContent = "没有可运行的组合";
            return;
        }

        // Validate every combination before queueing anything. Preset axes can
        // contribute different parameter sets, so the first combo is not enough.
        const resolved = resolveParams(graph, template);
        const invalid = combos
            .map((combo, index) => ({
                index,
                label: combo.label,
                failed: Object.keys(combo.params).filter(name => !resolved[name]),
            }))
            .filter(item => item.failed.length > 0);

        if (invalid.length > 0) {
            const first = invalid[0];
            const reasons = explainParams(graph, template, first.failed);
            const details = first.failed
                .map(name => `${name}（${reasons[name] || "未匹配"}）`)
                .join("; ");
            const more = invalid.length > 1 ? `；共 ${invalid.length} 个组合无法匹配` : "";
            this.progress.classList.add("error");
            this.progress.textContent =
                `组合 ${first.index + 1}（${first.label}）无法匹配: ${details}${more}`;
            return;
        }

        if (!confirm(`将向队列提交 ${combos.length} 次运行，确定继续？`)) return;

        if (!acquireGraphLock("sweep")) {
            this.progress.classList.add("error");
            this.progress.textContent = "另一个操作正在修改 workflow，请稍后再试";
            return;
        }

        this.progress.classList.remove("error");
        try {
            this.setRunning(true);
            this.cancelRequested = false;

            const tracePrefixes = this.traceToggle.checked
                ? capturePrefixes(graph)
                : [];
            const snapshot = captureParams(
                graph,
                template,
                new Set(combos.flatMap(combo => Object.keys(combo.params)))
            );

            const result = await runSweep({
                combos,
                check: (params) => checkParams(graph, template, params),
                apply: (params) => applyParams(graph, template, params),
                restore: () => {
                    restoreParams(graph, snapshot);
                    restorePrefixes(graph, tracePrefixes);
                },
                queue: (combo, index) => {
                    applyPrefixes(tracePrefixes, index, combo.label);
                    return app.queuePrompt(0, 1);
                },
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
            this.cancelRequested = false;
            this.setRunning(false);
            releaseGraphLock("sweep");
        }
    }
}
