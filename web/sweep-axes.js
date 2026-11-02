/**
 * Axis editor for parameter sweeps.
 *
 * Owns the axis list DOM and the run-count summary. The sweep dialog reads
 * axes through getAxes() and does not touch individual axis widgets.
 */

import { formatValues, parseValues, summarizeAxes } from "./sweep-values.js";

const { $el } = window.comfyAPI.ui;

export class SweepAxes {
    constructor(container, summary) {
        this.container = container;
        this.summary = summary;
        this.template = null;
        this.presets = [];
        this.axes = [];
        this.disabled = false;
    }

    setDisabled(disabled) {
        this.disabled = disabled;
        this.render();
    }

    setSources(template, presets) {
        this.template = template;
        this.presets = presets || [];
    }

    setAxes(axes) {
        this.axes = (axes || []).map(axis => ({
            ...axis,
            values: [...(axis.values || [])],
        }));
        this.render();
    }

    getAxes() {
        return this.axes;
    }

    clear() {
        this.axes = [];
        this.render();
    }

    addAxis(type) {
        if (this.disabled || !this.template) return;

        this.axes.push(type === "preset"
            ? { type: "preset", values: [] }
            : {
                type: "param",
                param: Object.keys(this.template.node_mapping)[0] || "",
                values: [],
            });
        this.render();
    }

    render() {
        this.container.replaceChildren();
        const paramNames = Object.keys(this.template?.node_mapping || {});

        for (const [index, axis] of this.axes.entries()) {
            const controls = [
                $el("span.sweep-axis-kind", {
                    textContent: axis.type === "preset" ? "预设" : "参数"
                })
            ];

            if (axis.type === "param") {
                const select = $el("select", {
                    disabled: this.disabled,
                    onchange: (event) => { axis.param = event.target.value; }
                });
                for (const name of paramNames) {
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
                    disabled: this.disabled,
                    oninput: (event) => {
                        axis.values = parseValues(event.target.value);
                        this.updateSummary();
                    }
                }));
            } else {
                const checkboxRow = $el("div.sweep-axis-presets");
                for (const preset of this.presets) {
                    const checkbox = $el("input", {
                        type: "checkbox",
                        value: preset.id,
                        checked: axis.values.includes(preset.id),
                        disabled: this.disabled,
                        onchange: (event) => {
                            if (event.target.checked) {
                                axis.values.push(preset.id);
                            } else {
                                axis.values = axis.values.filter(value => value !== preset.id);
                            }
                            this.updateSummary();
                        }
                    });
                    checkboxRow.appendChild($el("label.sweep-axis-preset", [
                        checkbox,
                        $el("span", { textContent: preset.name })
                    ]));
                }
                controls.push(checkboxRow);
            }

            controls.push($el("button.comfy-btn.small", {
                textContent: "↑",
                disabled: this.disabled,
                onclick: () => this.moveAxis(index, -1)
            }));
            controls.push($el("button.comfy-btn.small", {
                textContent: "↓",
                disabled: this.disabled,
                onclick: () => this.moveAxis(index, 1)
            }));
            controls.push($el("button.comfy-btn.small", {
                textContent: "✕",
                disabled: this.disabled,
                onclick: () => {
                    this.axes.splice(index, 1);
                    this.render();
                }
            }));

            this.container.appendChild($el("div.sweep-axis", controls));
        }

        this.updateSummary();
    }

    moveAxis(index, delta) {
        const target = index + delta;
        if (target < 0 || target >= this.axes.length) return;
        [this.axes[index], this.axes[target]] = [this.axes[target], this.axes[index]];
        this.render();
    }

    updateSummary() {
        const summary = summarizeAxes(this.axes);
        this.summary.textContent = summary
            ? `${summary.counts.join(" × ")} = ${summary.total} 次运行`
            : "尚未配置轴";
    }
}
