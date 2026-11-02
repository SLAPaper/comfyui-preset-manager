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

import { createGraphIndex, followToWidget, nodePath } from "./graph-index.js";

export function formatMatchError(error) {
    switch (error?.code) {
        case "not_found":
            return `未找到 ${error.classType} 节点`;
        case "ambiguous":
            return `找到 ${error.count} 个 ${error.classType} 节点，无法确定唯一节点`;
        case "missing_input":
            return `节点 #${error.nodeId} 缺少输入 ${error.inputName}`;
        case "unconnected_input":
            return `输入 ${error.inputName} 未连接`;
        case "missing_link":
            return `输入 ${error.inputName} 的连线不存在`;
        case "trace_failed":
            return `无法从 ${error.inputName} 追溯到 widget ${error.widgetName}`;
        case "no_title_match":
            return `没有标题包含 ${error.keywords.join(" / ")} 的 ${error.classType} 节点`;
        case "ambiguous_title":
            return `找到 ${error.count} 个标题匹配 ${error.keywords.join(" / ")} 的 ${error.classType} 节点，无法确定唯一节点`;
        case "external_link":
            return `子图输入 ${error.widgetName} 由外部连线控制`;
        case "computed_source":
            return `由 ${error.sourceType} #${error.sourceId} 的输出控制，无法直接写入 widget ${error.widgetName}`;
        case "missing_widget":
            return `节点 #${error.nodeId} 的 widget ${error.widgetName} 不可用`;
        case "unknown_strategy":
            return `未知匹配策略: ${error.strategy}`;
        default:
            return "未匹配到节点";
    }
}

function uniqueEntry(entries, classType) {
    if (entries.length === 1) return { entry: entries[0] };
    if (entries.length === 0) {
        return { error: { code: "not_found", classType } };
    }
    return { error: { code: "ambiguous", count: entries.length, classType } };
}

function findMatch(index, paramDef, synonyms) {
    const classType = paramDef.class_type || paramDef.target_class_type;
    const entries = index.entriesOfType(classType, synonyms);

    if (paramDef.match_strategy === "output_connection") {
        const { entry, error } = uniqueEntry(entries, classType);
        if (!entry) return { match: null, error };

        const target = entry.node;
        const input = (target.inputs || []).find(item => item.name === paramDef.target_input);

        if (input?.link != null) {
            const link = index.getLink(entry.scope, input.link);
            const source = link && index.findNode(entry.scope, link.origin_id);
            if (source) {
                const resolved = index.resolveTarget(entry, source, paramDef.widget);
                if (resolved?.match) return { match: resolved.match, error: null };
                if (resolved?.error) return { match: null, error: resolved.error };
            }
        }

        const resolved = index.resolveTarget(entry, target, paramDef.widget);
        return resolved?.match
            ? { match: resolved.match, error: null }
            : {
                match: null,
                error: resolved?.error || {
                    code: "missing_widget",
                    nodeId: target.id,
                    widgetName: paramDef.widget,
                },
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
                error: {
                    code: "missing_input",
                    nodeId: entry.node.id,
                    inputName: paramDef.input_name,
                },
            };
        }
        if (input.link == null) {
            return {
                match: null,
                error: { code: "unconnected_input", inputName: paramDef.input_name },
            };
        }

        const link = index.getLink(entry.scope, input.link);
        if (!link) {
            return {
                match: null,
                error: { code: "missing_link", inputName: paramDef.input_name },
            };
        }

        const resolved = followToWidget(index, entry, link.origin_id, paramDef.widget, 5);
        if (resolved?.match) return { match: resolved.match, error: null };
        if (resolved?.error) return { match: null, error: resolved.error };
        return {
            match: null,
            error: {
                code: "trace_failed",
                inputName: paramDef.input_name,
                widgetName: paramDef.widget,
            },
        };
    }

    if (paramDef.match_strategy === "unique_class") {
        const { entry, error } = uniqueEntry(entries, classType);
        if (!entry) return { match: null, error };

        const resolved = index.resolveTarget(entry, entry.node, paramDef.widget);
        return resolved?.match
            ? { match: resolved.match, error: null }
            : {
                match: null,
                error: resolved?.error || {
                    code: "missing_widget",
                    nodeId: entry.node.id,
                    widgetName: paramDef.widget,
                },
            };
    }

    if (paramDef.match_strategy === "title_keyword") {
        if (entries.length === 0) {
            return { match: null, error: { code: "not_found", classType } };
        }

        const keywords = (paramDef.title_keywords || []).map(keyword => keyword.toLowerCase());
        const titled = entries.filter(({ node }) => {
            const title = String(node.title || "").toLowerCase();
            return keywords.some(keyword => title.includes(keyword));
        });

        if (titled.length === 0) {
            return {
                match: null,
                error: { code: "no_title_match", keywords, classType },
            };
        }
        if (titled.length > 1) {
            return {
                match: null,
                error: {
                    code: "ambiguous_title",
                    count: titled.length,
                    keywords,
                    classType,
                },
            };
        }

        const entry = titled[0];
        const resolved = index.resolveTarget(entry, entry.node, paramDef.widget);
        return resolved?.match
            ? { match: resolved.match, error: null }
            : {
                match: null,
                error: resolved?.error || {
                    code: "missing_widget",
                    nodeId: entry.node.id,
                    widgetName: paramDef.widget,
                },
            };
    }

    return {
        match: null,
        error: { code: "unknown_strategy", strategy: paramDef.match_strategy },
    };
}

/**
 * Resolve every template parameter with one graph index.
 * @returns {{resolved: Object, errors: Object<string, Object>}}
 */
export function resolveTemplate(graph, template) {
    const synonyms = template?.synonyms || {};
    const index = createGraphIndex(graph);
    const resolved = {};
    const errors = {};

    for (const [name, paramDef] of Object.entries(template?.node_mapping || {})) {
        const { match, error } = findMatch(index, paramDef, synonyms);
        if (match) {
            resolved[name] = {
                nodeId: nodePath(match.path, match.node.id),
                nodeType: match.node.type,
                widgetName: match.widgetName,
                widget: match.widget,
                value: match.widget.value,
            };
        } else {
            resolved[name] = null;
            errors[name] = error || { code: "not_found", classType: "节点" };
        }
    }

    return { resolved, errors };
}

/**
 * Match every template parameter against the graph.
 * @returns {Object<string, {nodeId: string, nodeType: string, widgetName: string, widget: Object, value: any} | null>}
 */
export function resolveParams(graph, template) {
    return resolveTemplate(graph, template).resolved;
}

/**
 * Explain why parameters cannot be matched, without changing any widget.
 * @param {Array<string>} [names] Limit the check to these parameter names.
 * @returns {Object<string, string>} {param: reason}
 */
export function explainParams(graph, template, names) {
    const wanted = names ? new Set(names) : null;
    const { errors } = resolveTemplate(graph, template);
    const reasons = {};

    for (const [name, error] of Object.entries(errors)) {
        if (wanted && !wanted.has(name)) continue;
        reasons[name] = formatMatchError(error);
    }

    return reasons;
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
