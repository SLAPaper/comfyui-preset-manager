/**
 * API wrapper for ComfyUI Preset Manager.
 * 
 * Wraps backend API calls for workflows, presets, and mappings.
 */

import { api } from "../../scripts/api.js";

const API_BASE = "/preset-manager";

/**
 * Get all workflow templates.
 * @returns {Promise<Array<{id: string, name: string, description: string}>>}
 */
export async function getWorkflows() {
    const response = await api.fetchApi(`${API_BASE}/workflows`);
    return await response.json();
}

/**
 * Get all presets for a template.
 * @param {string} templateId
 * @returns {Promise<Array<{id: string, name: string, description: string}>>}
 */
export async function getPresets(templateId) {
    const response = await api.fetchApi(`${API_BASE}/presets/${templateId}`);
    return await response.json();
}

/**
 * Get a single preset detail.
 * @param {string} templateId
 * @param {string} presetId
 * @returns {Promise<Object>}
 */
export async function getPresetDetail(templateId, presetId) {
    const response = await api.fetchApi(`${API_BASE}/preset/${templateId}/${presetId}`);
    return await response.json();
}

/**
 * Apply a preset to a workflow.
 * @param {string} templateId
 * @param {string} presetId
 * @param {Object} currentWorkflow - Current workflow JSON
 * @returns {Promise<{status: string, workflow: Object}>}
 */
export async function applyPreset(templateId, presetId, currentWorkflow) {
    const response = await api.fetchApi(`${API_BASE}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            workflow: templateId,
            preset: presetId,
            current_workflow: currentWorkflow
        })
    });
    return await response.json();
}

/**
 * Get all workflow name → template ID mappings.
 * @returns {Promise<Object>} Mapping of workflow_name -> template_id
 */
export async function getMapping() {
    const response = await api.fetchApi(`${API_BASE}/mapping`);
    return await response.json();
}

/**
 * Save a workflow name → template ID mapping.
 * @param {string} workflowName
 * @param {string} templateId
 * @returns {Promise<{status: string}>}
 */
export async function saveMapping(workflowName, templateId) {
    const response = await api.fetchApi(`${API_BASE}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            workflow_name: workflowName,
            template_id: templateId
        })
    });
    return await response.json();
}

/**
 * Save a preset.
 * @param {Object} presetData - The preset data to save
 * @returns {Promise<{status: string}>}
 */
export async function savePreset(presetData) {
    const response = await api.fetchApi(`${API_BASE}/preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(presetData)
    });
    return await response.json();
}

/**
 * Get the current workflow parameters grouped by node type.
 * @returns {Array<{name: string, nodeType: string, nodeId: string, value: any}>}
 */
export function getCurrentWorkflowParams() {
    const graph = app.graph;
    const params = [];
    
    // Parameter definitions (same as in preset-dialog.js)
    const paramDefs = [
        { name: "positive_prompt", nodeType: "CLIPTextEncode", widgetName: "text", matchBy: "connection-positive" },
        { name: "negative_prompt", nodeType: "CLIPTextEncode", widgetName: "text", matchBy: "connection-negative" },
        { name: "steps", nodeType: "KSampler", widgetName: "steps", matchBy: "unique" },
        { name: "cfg", nodeType: "KSampler", widgetName: "cfg", matchBy: "unique" },
        { name: "sampler", nodeType: "KSampler", widgetName: "sampler_name", matchBy: "unique" },
        { name: "scheduler", nodeType: "KSampler", widgetName: "scheduler", matchBy: "unique" },
        { name: "width", nodeType: "EmptyLatentImage", widgetName: "width", matchBy: "unique" },
        { name: "height", nodeType: "EmptyLatentImage", widgetName: "height", matchBy: "unique" }
    ];
    
    // Find nodes and extract values
    for (const def of paramDefs) {
        const nodes = graph.nodes.filter(n => n.type === def.nodeType);
        if (nodes.length === 0) continue;
        
        let targetNode = nodes[0];
        let widgetValue = null;
        
        // For CLIPTextEncode, find by connection
        if (def.matchBy === "connection-positive" || def.matchBy === "connection-negative") {
            const ksampler = graph.nodes.find(n => n.type === "KSampler");
            if (ksampler) {
                const inputName = def.matchBy === "connection-positive" ? "positive" : "negative";
                const inputSlot = ksampler.inputs?.findIndex(i => i.name === inputName);
                
                if (inputSlot >= 0) {
                    for (const node of nodes) {
                        if (node.outputs && node.outputs[0] && node.outputs[0].links) {
                            for (const linkId of node.outputs[0].links) {
                                const link = graph.links[linkId];
                                if (link && link.target_id === ksampler.id && link.target_slot === inputSlot) {
                                    targetNode = node;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Find widget value
        const widget = targetNode.widgets?.find(w => w.name === def.widgetName);
        if (widget) {
            widgetValue = widget.value;
        } else if (targetNode.widgets_values) {
            // Fallback to widgets_values
            const widgetIndex = targetNode.widgets?.findIndex(w => w.name === def.widgetName) || 0;
            if (widgetIndex < targetNode.widgets_values.length) {
                widgetValue = targetNode.widgets_values[widgetIndex];
            }
        }
        
        if (widgetValue !== null) {
            params.push({
                name: def.name,
                nodeType: def.nodeType,
                nodeId: String(targetNode.id),
                value: widgetValue
            });
        }
    }
    
    return params;
}
