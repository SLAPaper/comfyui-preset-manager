import test from "node:test";
import assert from "node:assert/strict";

import { createGraphIndex } from "../../web/graph-index.js";
import {
    explainParams,
    formatMatchError,
    resolveTemplate,
} from "../../web/matcher.js";

function makeNode(id, type, widgets = {}, inputs = {}, title = "") {
    return {
        id,
        type,
        title,
        widgets: Object.entries(widgets).map(([name, value]) => ({ name, value })),
        inputs: Object.entries(inputs).map(([name, link]) => ({ name, link })),
    };
}

function template(nodeMapping, synonyms = {}) {
    return { node_mapping: nodeMapping, synonyms };
}

test("graph index groups entries by type and exposes nested node paths", () => {
    const inner = makeNode(20, "KSampler", { steps: 20 });
    const subgraph = {
        nodes: [inner],
        links: {},
        inputs: [],
        inputNode: { id: -10 },
    };
    const instance = {
        id: 10,
        type: "Subgraph",
        title: "",
        widgets: [],
        inputs: [],
        subgraph,
    };
    const index = createGraphIndex({ nodes: [instance], links: {} });

    assert.equal(index.entriesOfType("KSampler").length, 1);
    assert.equal(index.entriesOfType("KSampler")[0].node, inner);
    assert.deepEqual(
        index.listNodes().map(node => node.id),
        ["10", "10:20"]
    );
});

test("resolveTemplate returns matches and typed errors in one pass", () => {
    const graph = {
        nodes: [
            makeNode(3, "KSampler", { steps: 20 }),
            makeNode(4, "KSampler", { steps: 30 }),
        ],
        links: {},
    };
    const tpl = template({
        steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
        missing: { match_strategy: "unique_class", class_type: "NoSuchNode", widget: "x" },
    });

    const { resolved, errors } = resolveTemplate(graph, tpl);
    assert.equal(resolved.steps, null);
    assert.equal(errors.steps.code, "ambiguous");
    assert.equal(errors.missing.code, "not_found");
    assert.equal(formatMatchError(errors.steps), "找到 2 个 KSampler 节点，无法确定唯一节点");
    assert.deepEqual(explainParams(graph, tpl), {
        steps: "找到 2 个 KSampler 节点，无法确定唯一节点",
        missing: "未找到 NoSuchNode 节点",
    });
});

test("resolveTemplate applies synonyms without losing the raw type index", () => {
    const graph = {
        nodes: [makeNode(7, "KSamplerAdvanced", { steps: 12 })],
        links: {},
    };
    const tpl = template({
        steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
    }, { KSamplerAdvanced: "KSampler" });

    const { resolved, errors } = resolveTemplate(graph, tpl);
    assert.deepEqual(errors, {});
    assert.equal(resolved.steps.value, 12);
    assert.equal(resolved.steps.nodeType, "KSamplerAdvanced");
});
