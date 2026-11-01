/**
 * Graph matching for ComfyUI Preset Manager.
 *
 * This module is the only place that knows about match strategies. Callers
 * resolve a template once, then read, check, or apply parameter values.
 *
 * Nodes inside subgraphs are matched like top-level nodes. When an inner
 * widget is promoted to a subgraph input, the value lives on the subgraph
 * instance, so matching returns that host widget instead of the linked copy.
 */

function* walkNodes(graph, owner = null, path = [], visiting = new Set()) {
    if (!graph || visiting.has(graph)) return;
    visiting.add(graph);

    for (const node of graph.nodes || []) {
        yield { node, scope: graph, owner, path };
        if (node.subgraph?.nodes) {
            yield* walkNodes(node.subgraph, node, [...path, node.id], visiting);
        }
    }

    visiting.delete(graph);
}

function nodesOfType(graph, type, synonyms) {
    return [...walkNodes(graph)].filter(
        ({ node }) => (synonyms[node.type] || node.type) === type
    );
}

function getLink(scope, id) {
    if (id == null) return null;
    if (typeof scope.getLink === "function") return scope.getLink(id) ?? null;

    const links = scope.links;
    if (!links) return null;
    return (typeof links.get === "function" ? links.get(id) : links[id]) ?? null;
}

function findNode(scope, id) {
    if (typeof scope.getNodeById === "function") return scope.getNodeById(id) ?? null;
    return (scope.nodes || []).find(node => String(node.id) === String(id)) ?? null;
}

/**
 * Return the host widget when a node widget is promoted to a subgraph input.
 * The linked inner widget is ignored during execution, so it is not writable.
 */
function promotedWidget(scope, owner, node, widgetName) {
    if (!owner || !scope.inputs) return undefined;

    const input = (node.inputs || []).find(item => item.name === widgetName);
    if (!input || input.link == null) return undefined;

    const link = getLink(scope, input.link);
    if (!link) return undefined;

    const inputNodeId = scope.inputNode?.id;
    if (inputNodeId == null || String(link.origin_id) !== String(inputNodeId)) {
        return undefined;
    }

    const subgraphInput = scope.inputs.find(
        item => (item.linkIds || []).includes(input.link)
    );
    if (!subgraphInput) return undefined;

    const slot = (owner.inputs || []).find(item =>
        item._subgraphSlot === subgraphInput ||
        (item._subgraphSlot?.id != null &&
            item._subgraphSlot.id === subgraphInput.id)
    ) || (owner.inputs || []).find(item => item.name === subgraphInput.name);

    // An input connected from outside the subgraph is controlled by that link.
    if (!slot || slot.link != null) return null;

    return slot._widget ?? slot.widget ?? null;
}

function widgetFor(scope, owner, node, widgetName) {
    const host = promotedWidget(scope, owner, node, widgetName);
    if (host !== undefined) return host;
    return node.widgets?.find(item => item.name === widgetName) ?? null;
}

function followToWidget(scope, owner, nodeId, widgetName, maxDepth) {
    if (maxDepth <= 0) return null;

    const node = findNode(scope, nodeId);
    if (!node) return null;

    const widget = widgetFor(scope, owner, node, widgetName);
    if (widget) return { node, widgetName, widget };

    for (const input of node.inputs || []) {
        if (input.link == null) continue;
        const link = getLink(scope, input.link);
        if (!link) continue;
        const result = followToWidget(scope, owner, link.origin_id, widgetName, maxDepth - 1);
        if (result) return result;
    }

    return null;
}

function findMatch(graph, paramDef, synonyms) {
    const classType = paramDef.class_type || paramDef.target_class_type;
    const entries = nodesOfType(graph, classType, synonyms);

    if (paramDef.match_strategy === "output_connection") {
        if (entries.length !== 1) return null;

        const entry = entries[0];
        const target = entry.node;
        const input = (target.inputs || []).find(item => item.name === paramDef.target_input);

        if (input?.link != null) {
            const link = getLink(entry.scope, input.link);
            const source = link && findNode(entry.scope, link.origin_id);
            const widget = source && widgetFor(entry.scope, entry.owner, source, paramDef.widget);
            if (widget) {
                return { node: source, widgetName: paramDef.widget, widget, path: entry.path };
            }
        }

        const widget = widgetFor(entry.scope, entry.owner, target, paramDef.widget);
        return widget
            ? { node: target, widgetName: paramDef.widget, widget, path: entry.path }
            : null;
    }

    if (paramDef.match_strategy === "input_slot") {
        if (entries.length !== 1) return null;

        const entry = entries[0];
        const input = (entry.node.inputs || []).find(
            item => item.name === paramDef.input_name
        );
        if (input?.link == null) return null;

        const link = getLink(entry.scope, input.link);
        if (!link) return null;

        const result = followToWidget(
            entry.scope, entry.owner, link.origin_id, paramDef.widget, 5
        );
        return result ? { ...result, path: entry.path } : null;
    }

    if (paramDef.match_strategy === "unique_class") {
        if (entries.length !== 1) return null;

        const entry = entries[0];
        const widget = widgetFor(entry.scope, entry.owner, entry.node, paramDef.widget);
        return widget
            ? { node: entry.node, widgetName: paramDef.widget, widget, path: entry.path }
            : null;
    }

    if (paramDef.match_strategy === "title_keyword") {
        const keywords = (paramDef.title_keywords || []).map(keyword => keyword.toLowerCase());
        for (const entry of entries) {
            const title = String(entry.node.title || "").toLowerCase();
            if (!keywords.some(keyword => title.includes(keyword))) continue;
            const widget = widgetFor(entry.scope, entry.owner, entry.node, paramDef.widget);
            if (widget) {
                return { node: entry.node, widgetName: paramDef.widget, widget, path: entry.path };
            }
        }
    }

    return null;
}

function nodePath(path, nodeId) {
    return [...(path || []), nodeId].join(":");
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
        resolved[name] = match?.widget ? {
            nodeId: nodePath(match.path, match.node.id),
            nodeType: match.node.type,
            widgetName: match.widgetName,
            widget: match.widget,
            value: match.widget.value,
        } : null;
    }

    return resolved;
}

/**
 * Read all matched parameter values from the graph.
 */
export function readParams(graph, template) {
    const mapping = template?.node_mapping || {};
    return Object.entries(resolveParams(graph, template))
        .filter(([, match]) => match)
        .map(([name, match]) => ({
            name,
            nodeType: match.nodeType,
            nodeId: match.nodeId,
            value: match.value,
            defaultSelected: mapping[name]?.default_selected !== false,
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
