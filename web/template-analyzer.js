/**
 * Read-only template analysis for the current workflow.
 *
 * The analyzer proposes parameters that look like the fields a preset or sweep
 * can control. It never writes widget values; every candidate is validated with
 * the matcher before being shown, so ambiguous structures are visible early.
 */

import { explainParams, resolveParams } from "./matcher.js";

const PROMPT_WIDGETS = {
    positive: ["text", "prompt", "positive_prompt"],
    negative: ["negative_prompt", "text", "prompt"],
};

const SAMPLER_WIDGETS = {
    sampler_name: { name: "sampler", pattern: /Sampler/ },
    scheduler: { name: "scheduler", pattern: /(Sampler|Scheduler)/ },
    steps: { name: "steps", pattern: /(Sampler|Scheduler)/ },
    cfg: { name: "cfg", pattern: /(Sampler|Guider|Guidance)/ },
    guidance: { name: "cfg", pattern: /Guidance/ },
    seed: { name: "seed", pattern: /(Sampler|Noise)/ },
    noise_seed: { name: "seed", pattern: /Noise/ },
    denoise: { name: "denoise", pattern: /(Sampler|Scheduler)/ },
};

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

function nodePath(path, nodeId) {
    return [...(path || []), nodeId].join(":");
}

/**
 * Every node in the graph, including nodes inside subgraphs, with the fields
 * the manual mapping form needs.
 */
export function listNodes(graph) {
    return [...walkNodes(graph)].map(entry => ({
        id: nodePath(entry.path, entry.node.id),
        type: entry.node.type,
        title: entry.node.title || "",
        widgets: (entry.node.widgets || []).map(widget => widget.name),
        inputs: (entry.node.inputs || []).map(input => input.name).filter(Boolean),
    }));
}

/**
 * Build preview candidates from an existing template mapping. The mapping is
 * validated against the current graph, so copied templates show stale fields.
 */
export function describeMapping(graph, mapping, synonyms = {}) {
    const candidates = [];

    for (const [name, spec] of Object.entries(mapping || {})) {
        const template = { node_mapping: { [name]: spec }, synonyms };
        const match = resolveParams(graph, template)[name];
        const reason = explainParams(graph, template, [name])[name];

        candidates.push({
            name,
            spec: { ...spec },
            strategy: spec.match_strategy,
            classType: spec.class_type,
            inputName: spec.input_name,
            titleKeywords: spec.title_keywords,
            targetClassType: spec.target_class_type,
            targetInput: spec.target_input,
            nodeType: match?.nodeType || spec.class_type || spec.target_class_type || "",
            nodeId: match?.nodeId || "",
            widgetName: match?.widgetName || spec.widget || "",
            value: match?.value,
            confidence: match ? "high" : "low",
            defaultSelected: spec.default_selected !== false,
            status: match ? "matched" : "error",
            reason: match ? null : (reason || "未匹配到节点"),
        });
    }

    return candidates;
}

export function isSafeTemplateId(value) {
    return typeof value === "string"
        && value.length > 0
        && value !== "."
        && value !== ".."
        && !value.startsWith("_")
        && !/[/\\:\x00]/.test(value);
}

/**
 * Build the payload sent to the template save route.
 * @param {{id: string, name: string, description?: string, candidates: Array, synonyms?: Object}} input
 */
export function buildTemplate({ id, name, description = "", candidates, synonyms = {} }) {
    const templateId = String(id || "").trim();
    const templateName = String(name || "").trim();
    if (!isSafeTemplateId(templateId)) {
        throw new Error("模板 ID 不能为空，且不能包含 / \\ : 或以 _ 开头");
    }
    if (!templateName) {
        throw new Error("模板名称不能为空");
    }

    const node_mapping = {};
    for (const candidate of candidates || []) {
        const paramName = String(candidate.name || "").trim();
        if (!paramName) {
            throw new Error("参数名不能为空");
        }
        if (node_mapping[paramName]) {
            throw new Error(`参数名重复：${paramName}`);
        }
        if (!candidate.spec) {
            throw new Error(`参数 ${paramName} 没有匹配规则`);
        }

        const spec = { ...candidate.spec };
        if (Array.isArray(spec.title_keywords)) {
            spec.title_keywords = [...spec.title_keywords];
        }
        if (candidate.defaultSelected === false) {
            spec.default_selected = false;
        }
        node_mapping[paramName] = spec;
    }

    if (Object.keys(node_mapping).length === 0) {
        throw new Error("至少选择一个参数");
    }

    const template = {
        id: templateId,
        name: templateName,
        node_mapping,
    };
    if (String(description || "").trim()) {
        template.description = String(description).trim();
    }
    if (Object.keys(synonyms || {}).length > 0) {
        template.synonyms = { ...synonyms };
    }
    return template;
}

function widgetValue(node, name) {
    return node.widgets?.find(widget => widget.name === name) ?? null;
}

function findTextWidget(scope, nodeId, preferred, depth = 5) {
    if (depth <= 0) return null;
    const node = findNode(scope, nodeId);
    if (!node) return null;

    for (const name of preferred) {
        const widget = widgetValue(node, name);
        if (widget) return { node, widgetName: name, widget };
    }

    for (const input of node.inputs || []) {
        if (input.link == null) continue;
        const link = getLink(scope, input.link);
        if (!link) continue;
        const result = findTextWidget(scope, link.origin_id, preferred, depth - 1);
        if (result) return result;
    }

    return null;
}

function loaderName(nodeType, widgetName) {
    if (widgetName === "model_name" && nodeType === "NunchakuQwenImageDiTLoader") {
        return "nunchaku_model_name";
    }
    if (widgetName === "unet_name") {
        if (nodeType === "UnetLoaderGGUFAdvanced") return "gguf_unet_advanced_name";
        if (nodeType === "UnetLoaderGGUF") return "gguf_unet_name";
        if (nodeType === "UNETLoaderNF4") return "nf4_unet_name";
        if (nodeType === "UNETLoader") return "unet_name";
    }
    if (widgetName === "ckpt_name") {
        if (nodeType === "CheckpointLoaderGGUF") return "gguf_ckpt_name";
        if (nodeType === "CheckpointLoaderNF4") return "nf4_ckpt_name";
        if (nodeType === "CheckpointLoaderSimple") return "ckpt_name";
    }
    if (widgetName === "clip_name" && nodeType === "CLIPLoader") return "clip_name";
    if (widgetName === "clip_name1" && nodeType === "DualCLIPLoader") return "dual_clip_name1";
    if (widgetName === "vae_name" && nodeType === "VAELoader") return "vae_name";
    return null;
}

function proposal({ name, entry, widgetName, widget, strategy = null, priority = 1, extra = {} }) {
    return {
        name,
        entry,
        widgetName,
        widget,
        strategy,
        priority,
        ...extra,
    };
}

function proposalKey(item) {
    return `${item.name}:${nodePath(item.entry.path, item.entry.node.id)}:${item.widgetName}`;
}

function collectPromptProposals(entries, add) {
    for (const entry of entries) {
        if (entry.node.subgraph) continue;

        for (const side of ["positive", "negative"]) {
            const input = (entry.node.inputs || []).find(item => item.name === side);
            if (!input || input.link == null) continue;

            const link = getLink(entry.scope, input.link);
            const target = link && findTextWidget(
                entry.scope, link.origin_id, PROMPT_WIDGETS[side]
            );
            if (!target) continue;

            const classCount = entries.filter(other => other.node.type === entry.node.type).length;
            add(proposal({
                name: `${side}_prompt`,
                entry: {
                    ...entry,
                    node: target.node,
                },
                widgetName: target.widgetName,
                widget: target.widget,
                strategy: "input_slot",
                priority: classCount === 1 ? 3 : 1,
                extra: {
                    classType: entry.node.type,
                    inputName: side,
                    confidence: "high",
                },
            }));
        }
    }
}

function collectTitlePromptProposals(entries, add) {
    const textEntries = entries.filter(entry =>
        entry.node.widgets?.some(widget =>
            ["text", "prompt", "positive_prompt", "negative_prompt"].includes(widget.name)
        )
    );

    for (const entry of textEntries) {
        const title = String(entry.node.title || "").trim();
        if (!title) continue;

        const lower = title.toLowerCase();
        const side = lower.includes("positive") || title.includes("正向")
            ? "positive"
            : lower.includes("negative") || title.includes("负向")
                ? "negative"
                : null;
        if (!side) continue;

        const widget = PROMPT_WIDGETS[side]
            .map(name => widgetValue(entry.node, name))
            .find(Boolean);
        if (!widget) continue;

        const sameTitle = textEntries.filter(other =>
            other.node.type === entry.node.type &&
            String(other.node.title || "").trim().toLowerCase() === lower
        ).length;

        add(proposal({
            name: `${side}_prompt`,
            entry,
            widgetName: widget.name,
            widget,
            strategy: sameTitle === 1 ? "title_keyword" : null,
            priority: 2,
            extra: {
                classType: entry.node.type,
                titleKeywords: [title],
                confidence: "medium",
                error: sameTitle === 1
                    ? null
                    : `找到 ${sameTitle} 个同名标题的 ${entry.node.type} 节点`,
            },
        }));
    }
}

function collectSamplerProposals(entries, add) {
    for (const entry of entries) {
        if (entry.node.subgraph) continue;

        for (const widget of entry.node.widgets || []) {
            const rule = SAMPLER_WIDGETS[widget.name];
            if (rule && rule.pattern.test(entry.node.type)) {
                add(proposal({
                    name: rule.name,
                    entry,
                    widgetName: widget.name,
                    widget,
                    priority: 2,
                    extra: { classType: entry.node.type, confidence: "high" },
                }));
                continue;
            }

            if ((widget.name === "width" || widget.name === "height") &&
                /Latent/.test(entry.node.type)) {
                add(proposal({
                    name: widget.name,
                    entry,
                    widgetName: widget.name,
                    widget,
                    priority: 1,
                    extra: { classType: entry.node.type, confidence: "medium" },
                }));
                continue;
            }

            const loader = loaderName(entry.node.type, widget.name);
            if (loader) {
                add(proposal({
                    name: loader,
                    entry,
                    widgetName: widget.name,
                    widget,
                    priority: 2,
                    extra: {
                        classType: entry.node.type,
                        confidence: "high",
                        defaultSelected: false,
                    },
                }));
            }
        }
    }
}

function collectLinkedSizes(entries, add) {
    for (const entry of entries) {
        if (entry.node.subgraph || !/ModelSampling/.test(entry.node.type)) continue;

        for (const inputName of ["width", "height"]) {
            const input = (entry.node.inputs || []).find(item => item.name === inputName);
            if (!input || input.link == null) continue;

            const link = getLink(entry.scope, input.link);
            const source = link && findNode(entry.scope, link.origin_id);
            const widget = source?.widgets?.find(item => typeof item.value === "number");
            if (!source || !widget) continue;

            add(proposal({
                name: inputName,
                entry: { ...entry, node: source },
                widgetName: widget.name,
                widget,
                strategy: "output_connection",
                priority: 3,
                extra: {
                    classType: entry.node.type,
                    targetClassType: entry.node.type,
                    targetInput: inputName,
                    confidence: "high",
                },
            }));
        }
    }
}

function chooseProposal(proposals) {
    const sorted = [...proposals].sort((a, b) => b.priority - a.priority);
    const best = sorted[0];
    const tied = sorted.filter(item =>
        item.priority === best.priority &&
        nodePath(item.entry.path, item.entry.node.id) !== nodePath(best.entry.path, best.entry.node.id)
    );

    if (tied.length === 0) return best;

    return {
        ...best,
        strategy: null,
        error: `找到 ${tied.length + 1} 个候选项，无法确定唯一节点`,
    };
}

function buildSpec(candidate) {
    if (!candidate.strategy) return null;
    if (candidate.strategy === "input_slot") {
        return {
            match_strategy: "input_slot",
            class_type: candidate.classType,
            input_name: candidate.inputName,
            widget: candidate.widgetName,
        };
    }
    if (candidate.strategy === "output_connection") {
        return {
            match_strategy: "output_connection",
            target_class_type: candidate.targetClassType,
            target_input: candidate.targetInput,
            widget: candidate.widgetName,
        };
    }
    if (candidate.strategy === "title_keyword") {
        return {
            match_strategy: "title_keyword",
            class_type: candidate.classType,
            title_keywords: candidate.titleKeywords,
            widget: candidate.widgetName,
        };
    }
    return {
        match_strategy: "unique_class",
        class_type: candidate.classType,
        widget: candidate.widgetName,
    };
}

function finalizeCandidate(item, entries) {
    let strategy = item.strategy;
    let error = item.error || null;
    let titleKeywords = item.titleKeywords;

    if (!strategy && !error) {
        const sameClass = entries.filter(entry => entry.node.type === item.entry.node.type);
        if (sameClass.length === 1) {
            strategy = "unique_class";
        } else {
            const title = String(item.entry.node.title || "").trim();
            const sameTitle = sameClass.filter(entry =>
                String(entry.node.title || "").trim().toLowerCase() === title.toLowerCase()
            ).length;
            if (title && sameTitle === 1) {
                strategy = "title_keyword";
                titleKeywords = [title];
            } else {
                error = `找到 ${sameClass.length} 个 ${item.entry.node.type} 节点，且无法用标题区分`;
            }
        }
    }

    const candidate = {
        name: item.name,
        nodeType: item.entry.node.type,
        nodeId: nodePath(item.entry.path, item.entry.node.id),
        widgetName: item.widgetName,
        value: item.widget.value,
        strategy,
        classType: item.classType,
        inputName: item.inputName,
        titleKeywords,
        targetClassType: item.targetClassType,
        targetInput: item.targetInput,
        confidence: error ? "low" : (item.confidence || "medium"),
        defaultSelected: item.defaultSelected !== false,
        status: error ? "error" : "pending",
        reason: error,
    };
    candidate.spec = buildSpec(candidate);
    return candidate;
}

/**
 * Analyze a graph and return candidate parameters plus a template mapping.
 * Nothing is written to the graph.
 *
 * @param {Object} graph
 * @returns {{candidates: Array, node_mapping: Object, summary: Object}}
 */
export function analyzeGraph(graph) {
    const entries = [...walkNodes(graph)];
    const proposals = new Map();

    const add = (item) => {
        const key = proposalKey(item);
        if (!proposals.has(key)) proposals.set(key, item);
    };

    collectPromptProposals(entries, add);
    collectTitlePromptProposals(entries, add);
    collectLinkedSizes(entries, add);
    collectSamplerProposals(entries, add);

    const byName = new Map();
    for (const item of proposals.values()) {
        const list = byName.get(item.name) || [];
        list.push(item);
        byName.set(item.name, list);
    }

    const candidates = [];
    for (const [name, list] of byName) {
        const candidate = finalizeCandidate(chooseProposal(list), entries);
        candidate.name = name;
        candidates.push(candidate);
    }

    const node_mapping = {};
    for (const candidate of candidates) {
        if (candidate.spec) node_mapping[candidate.name] = candidate.spec;
    }

    const resolved = resolveParams(graph, { node_mapping });
    const reasons = explainParams(graph, { node_mapping });

    for (const candidate of candidates) {
        const match = resolved[candidate.name];
        if (candidate.reason) {
            candidate.status = "error";
            continue;
        }
        if (match) {
            candidate.status = "matched";
            candidate.nodeType = match.nodeType;
            candidate.nodeId = match.nodeId;
            candidate.widgetName = match.widgetName;
            candidate.value = match.value;
        } else {
            candidate.status = "error";
            candidate.reason = reasons[candidate.name] || "未匹配到节点";
            candidate.confidence = "low";
        }
    }

    return {
        candidates,
        node_mapping,
        summary: {
            total: candidates.length,
            matched: candidates.filter(item => item.status === "matched").length,
            errors: candidates.filter(item => item.status === "error").length,
        },
    };
}
