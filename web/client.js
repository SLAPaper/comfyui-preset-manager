/**
 * HTTP client for ComfyUI Preset Manager.
 *
 * All functions throw on a non-2xx response so callers can report failures.
 */

import { api } from "../../scripts/api.js";

const API_BASE = "/preset-manager";

async function request(path, options, fallbackError) {
    const response = await api.fetchApi(`${API_BASE}${path}`, options);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || fallbackError);
    }
    return data;
}

export function getWorkflows() {
    return request("/workflows", undefined, "加载模板失败");
}

export function getTemplateDetail(templateId) {
    return request(`/template/${encodeURIComponent(templateId)}`, undefined, "加载模板详情失败");
}

export function saveTemplate(templateData) {
    return request("/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateData),
    }, "保存模板失败");
}

export function deleteTemplate(templateId) {
    return request(
        `/template/${encodeURIComponent(templateId)}`,
        { method: "DELETE" },
        "删除模板失败"
    );
}

export function getPresets(templateId) {
    return request(`/presets/${encodeURIComponent(templateId)}`, undefined, "加载预设失败");
}

export function getPresetDetail(templateId, presetId) {
    return request(
        `/preset/${encodeURIComponent(templateId)}/${encodeURIComponent(presetId)}`,
        undefined,
        "加载预设失败"
    );
}

export function savePreset(presetData) {
    return request("/preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(presetData),
    }, "保存预设失败");
}

export function deletePreset(templateId, presetId) {
    return request(
        `/preset/${encodeURIComponent(templateId)}/${encodeURIComponent(presetId)}`,
        { method: "DELETE" },
        "删除预设失败"
    );
}

export function getSweeps(templateId) {
    return request(`/sweeps/${encodeURIComponent(templateId)}`, undefined, "加载扫描配置失败");
}

export function getSweepDetail(templateId, sweepId) {
    return request(
        `/sweep/${encodeURIComponent(templateId)}/${encodeURIComponent(sweepId)}`,
        undefined,
        "加载扫描配置失败"
    );
}

export function saveSweep(sweepData) {
    return request("/sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sweepData),
    }, "保存扫描配置失败");
}

export function deleteSweep(templateId, sweepId) {
    return request(
        `/sweep/${encodeURIComponent(templateId)}/${encodeURIComponent(sweepId)}`,
        { method: "DELETE" },
        "删除扫描配置失败"
    );
}

export function expandSweep(templateId, sweep) {
    return request("/sweep/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_template: templateId, sweep }),
    }, "展开扫描配置失败").then(data => data.combinations);
}
