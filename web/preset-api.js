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
 * Get a workflow template with full node_mapping.
 * @param {string} templateId
 * @returns {Promise<{name: string, description: string, node_mapping: Object, synonyms: Object}>}
 */
export async function getTemplateDetail(templateId) {
    const response = await api.fetchApi(`${API_BASE}/template/${templateId}`);
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
 * Get the sweep list for a template.
 * @param {string} templateId
 * @returns {Promise<Array<{id: string, name: string, description: string}>>}
 */
export async function getSweeps(templateId) {
    const response = await api.fetchApi(`${API_BASE}/sweeps/${templateId}`);
    return await response.json();
}

/**
 * Get a single sweep config.
 * @param {string} templateId
 * @param {string} sweepId
 * @returns {Promise<Object>}
 */
export async function getSweepDetail(templateId, sweepId) {
    const response = await api.fetchApi(`${API_BASE}/sweep/${templateId}/${sweepId}`);
    return await response.json();
}

/**
 * Save a sweep config.
 * @param {Object} sweepData - Must include workflow_template and id
 * @returns {Promise<{status: string}>}
 */
export async function saveSweep(sweepData) {
    const response = await api.fetchApi(`${API_BASE}/sweep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sweepData)
    });
    return await response.json();
}

/**
 * Delete a sweep config.
 * @param {string} templateId
 * @param {string} sweepId
 * @returns {Promise<{status: string}>}
 */
export async function deleteSweep(templateId, sweepId) {
    const response = await api.fetchApi(`${API_BASE}/sweep/${templateId}/${sweepId}`, {
        method: "DELETE"
    });
    return await response.json();
}

/**
 * Expand a sweep config into its list of combinations.
 * @param {string} templateId
 * @param {Object} sweep - Sweep config with axes
 * @returns {Promise<Array<{params: Object, label: string}>>}
 */
export async function expandSweep(templateId, sweep) {
    const response = await api.fetchApi(`${API_BASE}/sweep/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_template: templateId, sweep })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "展开扫描配置失败");
    return data.combinations;
}

/**
 * Follow connection chain from nodeId to find a node that has the target widget.
 * Recursively follows inputs when intermediate nodes lack the widget.
 * @param {Object} graph - ComfyUI LiteGraph instance
 * @param {number} nodeId - Starting node ID
 * @param {string} widgetName - Widget name to find
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {{node: Object, widgetName: string} | null}
 */
function followToWidget(graph, nodeId, widgetName, maxDepth) {
    if (maxDepth <= 0) return null;

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return null;

    // Check if this node has the target widget
    const widget = node.widgets?.find(w => w.name === widgetName);
    if (widget) return { node, widgetName };

    // Follow inputs to find the widget source
    for (const inp of (node.inputs || [])) {
        if (inp.link != null) {
            const link = graph.links[inp.link];
            if (link) {
                const result = followToWidget(graph, link.origin_id, widgetName, maxDepth - 1);
                if (result) return result;
            }
        }
    }

    return null;
}

export function findNodeByTemplate(graph, paramDef, synonyms) {
    const classType = paramDef.class_type || paramDef.target_class_type;
    const effectiveType = synonyms[classType] || classType;

    if (paramDef.match_strategy === "output_connection") {
        const targetNodes = graph.nodes.filter(n => n.type === effectiveType);
        if (targetNodes.length !== 1) return null;

        const target = targetNodes[0];
        const input = target.inputs?.find(i => i.name === paramDef.target_input);

        if (input?.link != null) {
            const link = graph.links[input.link];
            if (link) {
                const sourceNode = graph.nodes.find(n => n.id === link.origin_id);
                if (sourceNode) {
                    return { node: sourceNode, widgetName: paramDef.widget };
                }
            }
        }

        // Fallback: use target node's own widget
        return { node: target, widgetName: paramDef.widget };
    }

    if (paramDef.match_strategy === "input_slot") {
        const hubNodes = graph.nodes.filter(n => n.type === effectiveType);
        if (hubNodes.length !== 1) return null;

        const hub = hubNodes[0];
        const input = hub.inputs?.find(i => i.name === paramDef.input_name);

        if (input?.link != null) {
            const link = graph.links[input.link];
            if (link) {
                // Follow connection chain to find node with the target widget
                return followToWidget(graph, link.origin_id, paramDef.widget, 5);
            }
        }

        // No fallback — input_slot requires a connection
        return null;
    }

    const nodes = graph.nodes.filter(n => n.type === effectiveType);
    if (nodes.length === 0) return null;

    if (paramDef.match_strategy === "unique_class") {
        if (nodes.length === 1) {
            return { node: nodes[0], widgetName: paramDef.widget };
        }
        return null;
    }

    if (paramDef.match_strategy === "title_keyword") {
        const keywords = (paramDef.title_keywords || []).map(kw => kw.toLowerCase());
        for (const node of nodes) {
            const title = (node.title || "").toLowerCase();
            if (keywords.some(kw => title.includes(kw))) {
                return { node, widgetName: paramDef.widget };
            }
        }
        return null;
    }

    return null;
}

/**
 * Apply a set of parameter values to the graph using a template's node_mapping.
 * @param {Object} graph - ComfyUI LiteGraph instance
 * @param {Object} template - Template with node_mapping and synonyms
 * @param {Object} params - {paramName: value}
 * @returns {{successCount: number, totalCount: number, failed: string[]}}
 */
export function applyParamsToGraph(graph, template, params) {
    const synonyms = template.synonyms || {};
    const failed = [];
    let successCount = 0;
    let totalCount = 0;

    for (const [paramName, value] of Object.entries(params)) {
        totalCount++;

        const paramDef = template.node_mapping[paramName];
        if (!paramDef) {
            console.warn(`[PresetManager] No mapping definition for ${paramName}`);
            failed.push(paramName);
            continue;
        }

        const result = findNodeByTemplate(graph, paramDef, synonyms);
        if (!result) {
            console.warn(`[PresetManager] Node not found for ${paramName}`);
            failed.push(paramName);
            continue;
        }

        const widget = result.node.widgets?.find(w => w.name === result.widgetName);
        if (!widget) {
            console.warn(`[PresetManager] Widget ${result.widgetName} not found on node ${result.node.id}`);
            failed.push(paramName);
            continue;
        }

        widget.value = value;
        successCount++;
    }

    graph.setDirtyCanvas(true, true);
    return { successCount, totalCount, failed };
}

/**
 * Get the current workflow parameters using a template's node_mapping.
 * @param {string} templateId - The template ID to use for parameter extraction
 * @returns {Promise<Array<{name: string, nodeType: string, nodeId: string, value: any}>>}
 */
export async function getCurrentWorkflowParams(templateId) {
    const template = await getTemplateDetail(templateId);
    const graph = app.graph;
    const params = [];
    const synonyms = template.synonyms || {};

    for (const [name, def] of Object.entries(template.node_mapping)) {
        const result = findNodeByTemplate(graph, def, synonyms);
        if (!result) continue;

        const widget = result.node.widgets?.find(w => w.name === def.widget);
        if (widget) {
            params.push({
                name,
                nodeType: result.node.type,
                nodeId: String(result.node.id),
                value: widget.value
            });
        }
    }

    return params;
}
