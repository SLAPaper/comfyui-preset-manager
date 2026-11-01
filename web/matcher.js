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

function uniqueEntry(entries, classType) {
    if (entries.length === 1) return { entry: entries[0] };
    if (entries.length === 0) return { error: `未找到 ${classType} 节点` };
    return { error: `找到 ${entries.length} 个 ${classType} 节点，无法确定唯一节点` };
}

function missingWidget(node, widgetName) {
    return { error: `节点 #${node.id} 的 widget ${widgetName} 不可用` };
}

function findMatch(graph, paramDef, synonyms) {
    const classType = paramDef.class_type || paramDef.target_class_type;
    const entries = nodesOfType(graph, classType, synonyms);

    if (paramDef.match_strategy === "output_connection") {
        const { entry, error } = uniqueEntry(entries, classType);
        if (!entry) return { match: null, error };

        const target = entry.node;
        const input = (target.inputs || []).find(item => item.name === paramDef.target_input);

        if (input?.link != null) {
            const link = getLink(entry.scope, input.link);
            const source = link && findNode(entry.scope, link.origin_id);
            const widget = source && widgetFor(entry.scope, entry.owner, source, paramDef.widget);
            if (widget) {
                return {
                    match: { node: source, widgetName: paramDef.widget, widget, path: entry.path },
                    error: null,
                };
            }
        }

        const widget = widgetFor(entry.scope, entry.owner, target, paramDef.widget);
        return widget
            ? {
                match: { node: target, widgetName: paramDef.widget, widget, path: entry.path },
                error: null,
            }
            : { match: null, ...missingWidget(target, paramDef.widget) };
    }

    if (paramDef.match_strategy === "input_slot") {
        const { entry, error } = uniqueEntry(entries, classType);
        if (!entry) return { match: null, error };

        const input = (entry.node.inputs || []).find(
            item => item.name === paramDef.input_name
        );
        if (!input) {
            return {
                match: null,
                error: `节点 #${entry.node.id} 缺少输入 ${paramDef.input_name}`,
            };
        }
        if (input.link == null) {
            return { match: null, error: `输入 ${paramDef.input_name} 未连接` };
        }

        const link = getLink(entry.scope, input.link);
        if (!link) {
            return { match: null, error: `输入 ${paramDef.input_name} 的连线不存在` };
        }

        const result = followToWidget(
            entry.scope, entry.owner, link.origin_id, paramDef.widget, 5
        );
        return result
            ? { match: { ...result, path: entry.path }, error: null }
            : {
                match: null,
                error: `无法从 ${paramDef.input_name} 追溯到 widget ${paramDef.widget}`,
            };
    }

    if (paramDef.match_strategy === "unique_class") {
        const { entry, error } = uniqueEntry(entries, classType);
        if (!entry) return { match: null, error };

        const widget = widgetFor(entry.scope, entry.owner, entry.node, paramDef.widget);
        return widget
            ? {
                match: { node: entry.node, widgetName: paramDef.widget, widget, path: entry.path },
                error: null,
            }
            : { match: null, ...missingWidget(entry.node, paramDef.widget) };
    }

    if (paramDef.match_strategy === "title_keyword") {
        if (entries.length === 0) {
            return { match: null, error: `未找到 ${classType} 节点` };
        }

        const keywords = (paramDef.title_keywords || []).map(keyword => keyword.toLowerCase());
        const titled = entries.filter(({ node }) => {
            const title = String(node.title || "").toLowerCase();
            return keywords.some(keyword => title.includes(keyword));
        });

        if (titled.length === 0) {
            return {
                match: null,
                error: `没有标题包含 ${keywords.join(" / ")} 的 ${classType} 节点`,
            };
        }
        if (titled.length > 1) {
            return {
                match: null,
                error: `找到 ${titled.length} 个标题匹配 ${keywords.join(" / ")} 的 ${classType} 节点，无法确定唯一节点`,
            };
        }

        const entry = titled[0];
        const widget = widgetFor(entry.scope, entry.owner, entry.node, paramDef.widget);
        return widget
            ? {
                match: { node: entry.node, widgetName: paramDef.widget, widget, path: entry.path },
                error: null,
            }
            : { match: null, ...missingWidget(entry.node, paramDef.widget) };
    }

    return { match: null, error: `未知匹配策略: ${paramDef.match_strategy}` };
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
        const { match } = findMatch(graph, paramDef, synonyms);
        resolved[name] = match ? {
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
 * Explain why parameters cannot be matched, without changing any widget.
 * @param {Array<string>} [names] Limit the check to these parameter names.
 * @returns {Object<string, string>} {param: reason}
 */
export function explainParams(graph, template, names) {
    const synonyms = template?.synonyms || {};
    const wanted = names ? new Set(names) : null;
    const errors = {};

    for (const [name, paramDef] of Object.entries(template?.node_mapping || {})) {
        if (wanted && !wanted.has(name)) continue;
        const { match, error } = findMatch(graph, paramDef, synonyms);
        if (!match) errors[name] = error || "未匹配到节点";
    }

    return errors;
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
