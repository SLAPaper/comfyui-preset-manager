/**
 * Graph traversal and write-target resolution.
 *
 * This module owns the details of subgraph scopes: which entry a node belongs
 * to, how links are looked up, where a promoted widget lives, and how an
 * externally linked input is followed into the parent graph. Matching strategies
 * in matcher.js only consume the targets this module returns.
 */

export function* walkNodes(graph, owner = null, path = [], parent = null, visiting = new Set()) {
    if (!graph || visiting.has(graph)) return;
    visiting.add(graph);

    for (const node of graph.nodes || []) {
        const entry = { node, scope: graph, owner, path, parent };
        yield entry;
        if (node.subgraph?.nodes) {
            yield* walkNodes(node.subgraph, node, [...path, node.id], entry, visiting);
        }
    }

    visiting.delete(graph);
}

export function nodePath(path, nodeId) {
    return [...(path || []), nodeId].join(":");
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

function slotFor(owner, subgraphInput) {
    return (owner?.inputs || []).find(item =>
        item._subgraphSlot === subgraphInput ||
        (item._subgraphSlot?.id != null &&
            item._subgraphSlot.id === subgraphInput.id)
    ) || (owner?.inputs || []).find(item => item.name === subgraphInput.name) || null;
}

function primitiveWidget(node) {
    if (!/^Primitive/.test(node.type)) return null;
    const widgets = (node.widgets || []).filter(item => item.name !== "control_after_generate");
    return widgets.length === 1 ? widgets[0] : null;
}

function hostTarget(index, frame, subgraphInput, widgetName) {
    const slot = slotFor(frame.owner, subgraphInput);
    if (!slot) return null;

    if (slot.link == null) {
        const widget = slot._widget ?? slot.widget ?? null;
        return widget ? { widget } : null;
    }

    const external = {
        error: { code: "external_link", widgetName },
    };
    const parent = frame.parent;
    if (!parent) return external;

    const link = getLink(parent.scope, slot.link);
    if (!link) return external;

    if (String(link.origin_id) === String(parent.scope.inputNode?.id)) {
        const parentInput = (parent.scope.inputs || []).find(item =>
            (item.linkIds || []).includes(slot.link)
        );
        if (!parentInput) return external;
        return hostTarget(index, parent, parentInput, widgetName) || external;
    }

    const source = findNode(parent.scope, link.origin_id);
    if (!source) return external;

    const target = nodeTarget(index, parent, source, widgetName);
    if (target?.match) return target;

    // Primitive nodes such as PrimitiveInt expose a single `value` widget that
    // feeds the promoted input, even when the inner widget has another name.
    const widget = primitiveWidget(source);
    if (widget) {
        return {
            match: { node: source, widgetName: widget.name, widget, path: parent.path },
        };
    }

    return {
        error: {
            code: "computed_source",
            sourceType: source.type,
            sourceId: source.id,
            widgetName,
        },
    };
}

/**
 * Resolve a node parameter to the widget that actually receives writes.
 * Returns {match}, {error}, or null when the node has no such widget.
 */
function nodeTarget(index, frame, node, widgetName) {
    if (!frame) return null;

    if (frame.owner && frame.scope.inputs) {
        const input = (node.inputs || []).find(item => item.name === widgetName);
        if (input?.link != null) {
            const link = getLink(frame.scope, input.link);
            if (link && String(link.origin_id) === String(frame.scope.inputNode?.id)) {
                const subgraphInput = frame.scope.inputs.find(item =>
                    (item.linkIds || []).includes(input.link)
                );
                if (subgraphInput) {
                    const host = hostTarget(index, frame, subgraphInput, widgetName);
                    if (host?.match) return host;
                    if (host?.error) return host;
                    if (host?.widget) {
                        return {
                            match: { node, widgetName, widget: host.widget, path: frame.path },
                        };
                    }
                }
                return { error: { code: "external_link", widgetName } };
            }
        }
    }

    const widget = node.widgets?.find(item => item.name === widgetName);
    return widget
        ? { match: { node, widgetName, widget, path: frame.path } }
        : null;
}

/**
 * Build a reusable view of a graph. Callers should create one index per
 * resolution pass so node and link lookups are not repeated per parameter.
 */
export function createGraphIndex(graph) {
    const entries = [...walkNodes(graph)];
    const byType = new Map();

    for (const entry of entries) {
        const list = byType.get(entry.node.type) || [];
        list.push(entry);
        byType.set(entry.node.type, list);
    }

    const index = {
        graph,
        entries,

        entriesOfType(type, synonyms = {}) {
            if (Object.keys(synonyms).length === 0) {
                return byType.get(type) || [];
            }
            return entries.filter(entry =>
                (synonyms[entry.node.type] || entry.node.type) === type
            );
        },

        resolveTarget(entry, node, widgetName) {
            return nodeTarget(index, entry, node, widgetName);
        },

        findNode(scope, id) {
            return findNode(scope, id);
        },

        getLink(scope, id) {
            return getLink(scope, id);
        },

        nodePath(path, nodeId) {
            return nodePath(path, nodeId);
        },

        listNodes() {
            return entries.map(entry => ({
                id: nodePath(entry.path, entry.node.id),
                type: entry.node.type,
                title: entry.node.title || "",
                widgets: (entry.node.widgets || []).map(widget => widget.name),
                inputs: (entry.node.inputs || []).map(input => input.name).filter(Boolean),
            }));
        },
    };

    return index;
}

export function followToWidget(index, entry, nodeId, widgetName, maxDepth) {
    if (maxDepth <= 0) return null;

    const node = findNode(entry.scope, nodeId);
    if (!node) return null;

    const target = index.resolveTarget(entry, node, widgetName);
    if (target) return target;

    for (const input of node.inputs || []) {
        if (input.link == null) continue;
        const link = getLink(entry.scope, input.link);
        if (!link) continue;
        const result = followToWidget(index, entry, link.origin_id, widgetName, maxDepth - 1);
        if (result) return result;
    }

    return null;
}

export { getLink, findNode };
