/**
 * Graph matching for ComfyUI Preset Manager.
 *
 * This module is the only place that knows about match strategies. Callers
 * resolve a template once, then read, check, or apply parameter values.
 */

function nodesOfType(graph, type, synonyms) {
    return (graph.nodes || []).filter(node => (synonyms[node.type] || node.type) === type);
}

function followToWidget(graph, nodeId, widgetName, maxDepth) {
    if (maxDepth <= 0) return null;

    const node = (graph.nodes || []).find(item => String(item.id) === String(nodeId));
    if (!node) return null;

    const widget = node.widgets?.find(item => item.name === widgetName);
    if (widget) return { node, widgetName };

    for (const input of node.inputs || []) {
        if (input.link == null) continue;
        const link = graph.links?.[input.link];
        if (!link) continue;
        const result = followToWidget(graph, link.origin_id, widgetName, maxDepth - 1);
        if (result) return result;
    }

    return null;
}

function findMatch(graph, paramDef, synonyms) {
    const classType = paramDef.class_type || paramDef.target_class_type;

    if (paramDef.match_strategy === "output_connection") {
        const targets = nodesOfType(graph, classType, synonyms);
        if (targets.length !== 1) return null;

        const target = targets[0];
        const input = (target.inputs || []).find(item => item.name === paramDef.target_input);
        if (input?.link != null) {
            const link = graph.links?.[input.link];
            if (link) {
                const source = (graph.nodes || []).find(item => String(item.id) === String(link.origin_id));
                if (source) return { node: source, widgetName: paramDef.widget };
            }
        }

        return { node: target, widgetName: paramDef.widget };
    }

    if (paramDef.match_strategy === "input_slot") {
        const hubs = nodesOfType(graph, classType, synonyms);
        if (hubs.length !== 1) return null;

        const input = (hubs[0].inputs || []).find(item => item.name === paramDef.input_name);
        if (input?.link == null) return null;

        const link = graph.links?.[input.link];
        if (!link) return null;

        return followToWidget(graph, link.origin_id, paramDef.widget, 5);
    }

    const nodes = nodesOfType(graph, classType, synonyms);

    if (paramDef.match_strategy === "unique_class") {
        return nodes.length === 1 ? { node: nodes[0], widgetName: paramDef.widget } : null;
    }

    if (paramDef.match_strategy === "title_keyword") {
        const keywords = (paramDef.title_keywords || []).map(keyword => keyword.toLowerCase());
        for (const node of nodes) {
            const title = String(node.title || "").toLowerCase();
            if (keywords.some(keyword => title.includes(keyword))) {
                return { node, widgetName: paramDef.widget };
            }
        }
    }

    return null;
}

/**
 * Match every template parameter against the graph.
 * @returns {Object<string, {nodeId: string, nodeType: string, widgetName: string, widget: Object, value: any} | null>}
 */
export function resolveParams(graph, template) {
    const synonyms = template?.synonyms || {};
    const resolved = {};

    for (const [name, paramDef] of Object.entries(template?.node_mapping || {})) {
        const match = findMatch(graph, paramDef, synonyms);
        const widget = match?.node?.widgets?.find(item => item.name === match.widgetName);
        resolved[name] = widget ? {
            nodeId: String(match.node.id),
            nodeType: match.node.type,
            widgetName: match.widgetName,
            widget,
            value: widget.value,
        } : null;
    }

    return resolved;
}

/**
 * Read all matched parameter values from the graph.
 */
export function readParams(graph, template) {
    return Object.entries(resolveParams(graph, template))
        .filter(([, match]) => match)
        .map(([name, match]) => ({
            name,
            nodeType: match.nodeType,
            nodeId: match.nodeId,
            value: match.value,
        }));
}

/**
 * Return the names in params that cannot be matched to a widget.
 */
export function checkParams(graph, template, params) {
    const resolved = resolveParams(graph, template);
    return Object.keys(params).filter(name => !resolved[name]);
}

/**
 * Apply parameter values to the graph.
 * @returns {{applied: number, failed: string[]}}
 */
export function applyParams(graph, template, params) {
    const resolved = resolveParams(graph, template);
    const failed = [];
    let applied = 0;

    for (const [name, value] of Object.entries(params)) {
        const match = resolved[name];
        if (!match) {
            failed.push(name);
            continue;
        }
        match.widget.value = value;
        applied++;
    }

    graph.setDirtyCanvas?.(true, true);
    return { applied, failed };
}

/**
 * Snapshot the current values of the named parameters so they can be restored.
 * Parameters that do not match the graph are skipped.
 */
export function captureParams(graph, template, names) {
    const resolved = resolveParams(graph, template);
    const snapshot = [];

    for (const name of names) {
        const match = resolved[name];
        if (match) snapshot.push({ name, widget: match.widget, value: match.value });
    }

    return snapshot;
}

/**
 * Put a snapshot taken by captureParams back onto the graph.
 */
export function restoreParams(graph, snapshot) {
    for (const { widget, value } of snapshot) {
        widget.value = value;
    }
    graph.setDirtyCanvas?.(true, true);
}
