/**
 * Graph matching for ComfyUI Preset Manager.
 *
 * This module is the only place that knows about match strategies. Callers
 * resolve a template once, then read, check, or apply parameter values.
 *
 * Nodes inside subgraphs are matched like top-level nodes. When an inner
 * widget is promoted to a subgraph input, the value lives on the subgraph
 * instance, so matching returns that host widget instead of the linked copy.
 * A linked host input is resolved in the parent graph, including promotions
 * that continue through more than one subgraph level.
 */

function* walkNodes(graph, owner = null, path = [], parent = null, visiting = new Set()) {
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

function slotFor(owner, subgraphInput) {
    return (owner?.inputs || []).find(item =>
        item._subgraphSlot === subgraphInput ||
        (item._subgraphSlot?.id != null &&
            item._subgraphSlot.id === subgraphInput.id)
    ) || (owner?.inputs || []).find(item => item.name === subgraphInput.name) || null;
}

/**
 * Find the widget that owns a promoted subgraph input.
 *
 * A free slot stores the value on the subgraph instance. A linked slot is
 * controlled by its source in the parent graph, so continue there: the source
 * node may own the matching widget, or the parent input may be promoted again
 * and the value may live one level higher.
 */
function hostTarget(frame, subgraphInput, widgetName) {
    const slot = slotFor(frame.owner, subgraphInput);
    if (!slot) return null;

    if (slot.link == null) {
        const widget = slot._widget ?? slot.widget ?? null;
        return widget ? { widget } : null;
    }

    const external = { error: `子图输入 ${widgetName} 由外部连线控制` };
    const parent = frame.parent;
    if (!parent) return external;

    const link = getLink(parent.scope, slot.link);
    if (!link) return external;

    if (String(link.origin_id) === String(parent.scope.inputNode?.id)) {
        const parentInput = (parent.scope.inputs || []).find(item =>
            (item.linkIds || []).includes(slot.link)
        );
        if (!parentInput) return external;
        return hostTarget(parent, parentInput, widgetName) || external;
    }

    const source = findNode(parent.scope, link.origin_id);
    if (!source) return external;

    const target = nodeTarget(parent, source, widgetName);
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
        error: `由 ${source.type} #${source.id} 的输出控制，无法直接写入 widget ${widgetName}`,
    };
}

function primitiveWidget(node) {
    if (!/^Primitive/.test(node.type)) return null;
    const widgets = (node.widgets || []).filter(item => item.name !== "control_after_generate");
    return widgets.length === 1 ? widgets[0] : null;
}

/**
 * Resolve a node parameter to the widget that actually receives writes.
 * Returns {match}, {error}, or null when the node has no such widget.
 */
function nodeTarget(frame, node, widgetName) {
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
                    const host = hostTarget(frame, subgraphInput, widgetName);
                    if (host?.match) return host;
                    if (host?.error) return host;
                    if (host?.widget) {
                        return {
                            match: { node, widgetName, widget: host.widget, path: frame.path },
                        };
                    }
                    return null;
                }
            }
        }
    }

    const widget = node.widgets?.find(item => item.name === widgetName);
    return widget
        ? { match: { node, widgetName, widget, path: frame.path } }
        : null;
}

function followToWidget(frame, nodeId, widgetName, maxDepth) {
    if (maxDepth <= 0) return null;

    const node = findNode(frame.scope, nodeId);
    if (!node) return null;

    const target = nodeTarget(frame, node, widgetName);
    if (target) return target;

    for (const input of node.inputs || []) {
        if (input.link == null) continue;
        const link = getLink(frame.scope, input.link);
        if (!link) continue;
        const result = followToWidget(frame, link.origin_id, widgetName, maxDepth - 1);
        if (result) return result;
    }

    return null;
}

function uniqueEntry(entries, classType) {
    if (entries.length === 1) return { entry: entries[0] };
    if (entries.length === 0) return { error: `未找到 ${classType} 节点` };
    return { error: `找到 ${entries.length} 个 ${classType} 节点，无法确定唯一节点` };
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
            if (source) {
                const resolved = nodeTarget(entry, source, paramDef.widget);
                if (resolved?.match) return { match: resolved.match, error: null };
                if (resolved?.error) return { match: null, error: resolved.error };
            }
        }

        const resolved = nodeTarget(entry, target, paramDef.widget);
        return resolved?.match
            ? { match: resolved.match, error: null }
            : {
                match: null,
                error: resolved?.error ||
                    `节点 #${target.id} 的 widget ${paramDef.widget} 不可用`,
            };
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

        const resolved = followToWidget(entry, link.origin_id, paramDef.widget, 5);
        if (resolved?.match) return { match: resolved.match, error: null };
        if (resolved?.error) return { match: null, error: resolved.error };
        return {
            match: null,
            error: `无法从 ${paramDef.input_name} 追溯到 widget ${paramDef.widget}`,
        };
    }

    if (paramDef.match_strategy === "unique_class") {
        const { entry, error } = uniqueEntry(entries, classType);
        if (!entry) return { match: null, error };

        const resolved = nodeTarget(entry, entry.node, paramDef.widget);
        return resolved?.match
            ? { match: resolved.match, error: null }
            : {
                match: null,
                error: resolved?.error ||
                    `节点 #${entry.node.id} 的 widget ${paramDef.widget} 不可用`,
            };
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
        const resolved = nodeTarget(entry, entry.node, paramDef.widget);
        return resolved?.match
            ? { match: resolved.match, error: null }
            : {
                match: null,
                error: resolved?.error ||
                    `节点 #${entry.node.id} 的 widget ${paramDef.widget} 不可用`,
            };
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
