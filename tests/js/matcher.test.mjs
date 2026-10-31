import test from "node:test";
import assert from "node:assert/strict";

import {
    applyParams,
    checkParams,
    readParams,
    resolveParams,
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

function makeGraph(nodes, links = {}) {
    return {
        nodes,
        links,
        dirty: false,
        setDirtyCanvas() {
            this.dirty = true;
        },
    };
}

function template(nodeMapping, synonyms = {}) {
    return { node_mapping: nodeMapping, synonyms };
}

test("unique_class resolves a single node", () => {
    const graph = makeGraph([makeNode(3, "KSampler", { steps: 20 })]);
    const tpl = template({
        steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
    });

    const resolved = resolveParams(graph, tpl);
    assert.equal(resolved.steps.nodeId, "3");
    assert.equal(resolved.steps.value, 20);
});

test("unique_class refuses ambiguous nodes", () => {
    const graph = makeGraph([
        makeNode(1, "KSampler", { steps: 20 }),
        makeNode(2, "KSampler", { steps: 30 }),
    ]);
    const tpl = template({
        steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
    });

    assert.equal(resolveParams(graph, tpl).steps, null);
});

test("title_keyword distinguishes prompt nodes", () => {
    const graph = makeGraph([
        makeNode(6, "CLIPTextEncode", { text: "old positive" }, {}, "CLIPTextEncode (positive)"),
        makeNode(7, "CLIPTextEncode", { text: "old negative" }, {}, "CLIPTextEncode (negative)"),
    ]);
    const tpl = template({
        positive_prompt: {
            match_strategy: "title_keyword",
            class_type: "CLIPTextEncode",
            title_keywords: ["positive", "正向"],
            widget: "text",
        },
    });

    assert.equal(resolveParams(graph, tpl).positive_prompt.nodeId, "6");
});

test("output_connection follows a linked input", () => {
    const graph = makeGraph(
        [
            makeNode(10, "PrimitiveInt", { value: 768 }),
            makeNode(20, "ModelSamplingFlux", {}, { width: 1 }),
        ],
        { 1: { origin_id: 10, origin_slot: 0 } }
    );
    const tpl = template({
        width: {
            match_strategy: "output_connection",
            target_class_type: "ModelSamplingFlux",
            target_input: "width",
            widget: "value",
        },
    });

    const resolved = resolveParams(graph, tpl).width;
    assert.equal(resolved.nodeId, "10");
    assert.equal(resolved.value, 768);
});

test("output_connection falls back to the target widget", () => {
    const graph = makeGraph([makeNode(30, "RandomNoise", { noise_seed: 42 })]);
    const tpl = template({
        seed: {
            match_strategy: "output_connection",
            target_class_type: "RandomNoise",
            target_input: "noise_seed",
            widget: "noise_seed",
        },
    });

    assert.equal(resolveParams(graph, tpl).seed.nodeId, "30");
});

test("input_slot follows intermediate nodes to the widget", () => {
    const graph = makeGraph(
        [
            makeNode(3, "KSampler", {}, { positive: 1 }),
            makeNode(4, "ReferenceLatent", {}, { conditioning: 2 }),
            makeNode(5, "CLIPTextEncode", { text: "prompt" }),
        ],
        {
            1: { origin_id: 4, origin_slot: 0 },
            2: { origin_id: 5, origin_slot: 0 },
        }
    );
    const tpl = template({
        positive_prompt: {
            match_strategy: "input_slot",
            class_type: "KSampler",
            input_name: "positive",
            widget: "text",
        },
    });

    const resolved = resolveParams(graph, tpl).positive_prompt;
    assert.equal(resolved.nodeId, "5");
    assert.equal(resolved.value, "prompt");
});

test("synonyms map derived node types", () => {
    const graph = makeGraph([makeNode(8, "KSamplerAdvanced", { steps: 12 })]);
    const tpl = template(
        { steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" } },
        { KSamplerAdvanced: "KSampler" }
    );

    assert.equal(resolveParams(graph, tpl).steps.value, 12);
});

test("check, apply, and read use the same resolution", () => {
    const graph = makeGraph([makeNode(3, "KSampler", { steps: 20, cfg: 7 })]);
    const tpl = template({
        steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
        cfg: { match_strategy: "unique_class", class_type: "KSampler", widget: "cfg" },
    });

    assert.deepEqual(checkParams(graph, tpl, { steps: 30, missing: 1 }), ["missing"]);

    const result = applyParams(graph, tpl, { steps: 30, missing: 1 });
    assert.equal(result.applied, 1);
    assert.deepEqual(result.failed, ["missing"]);
    assert.equal(graph.nodes[0].widgets[0].value, 30);
    assert.equal(graph.dirty, true);

    const params = readParams(graph, tpl);
    assert.deepEqual(params.map(item => item.name), ["steps", "cfg"]);
    assert.equal(params[0].value, 30);
});
