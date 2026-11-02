import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
    analyzeGraph,
    buildTemplate,
    describeMapping,
    isSafeTemplateId,
    listNodes,
} from "../../web/template-analyzer.js";
import { resolveParams } from "../../web/matcher.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Names each representative workflow should expose. Loader names are included
 * so an analyzer change cannot silently stop proposing model selection.
 */
const EXPECTED = {
    "anima-local": [
        "positive_prompt", "negative_prompt", "clip_name", "vae_name", "unet_name",
        "width", "height", "seed", "steps", "cfg", "sampler", "scheduler", "denoise",
    ],
    "chroma-template": [
        "positive_prompt", "negative_prompt", "clip_name", "vae_name", "unet_name",
        "width", "height", "seed", "steps", "cfg", "sampler", "scheduler", "denoise",
    ],
    // BasicGuider-based sampling has no positive/negative inputs, so this
    // workflow exposes only the size, sampler, and loader fields.
    "flux-local": [
        "width", "height", "seed", "steps", "cfg", "sampler", "scheduler",
        "denoise", "vae_name", "dual_clip_name1", "unet_name", "ckpt_name",
        "gguf_unet_advanced_name",
    ],
    "flux-schnell-template": [
        "positive_prompt", "negative_prompt", "width", "height", "seed", "steps",
        "cfg", "sampler", "scheduler", "denoise", "ckpt_name",
    ],
    "hidream-template": [
        "positive_prompt", "negative_prompt", "seed", "steps", "sampler",
        "scheduler", "denoise", "unet_name", "vae_name",
    ],
    "qwen-edit-local": [
        "positive_prompt", "negative_prompt", "unet_name", "clip_name", "vae_name",
        "seed", "steps", "cfg", "sampler", "scheduler", "denoise",
    ],
    "sdxl-local": [
        "positive_prompt", "negative_prompt", "ckpt_name", "dual_clip_name1",
        "width", "height", "seed", "steps", "cfg", "sampler", "scheduler", "denoise",
    ],
    "z-image-local": [
        "positive_prompt", "negative_prompt", "clip_name", "vae_name", "unet_name",
        "width", "height", "seed", "steps", "cfg", "sampler", "scheduler", "denoise",
    ],
};

const fixtures = readdirSync(join(FIXTURES, "analyzer"))
    .filter(name => name.endsWith(".json"))
    .map(name => readJson(join(FIXTURES, "analyzer", name)));

function byName(result) {
    return Object.fromEntries(result.candidates.map(candidate => [candidate.name, candidate]));
}

test("analyzer fixtures cover every representative workflow", () => {
    assert.deepEqual(
        fixtures.map(fixture => fixture.sample).sort(),
        Object.keys(EXPECTED).sort()
    );
});

for (const fixture of fixtures) {
    const expected = EXPECTED[fixture.sample];

    test(`${fixture.sample} exposes the expected parameters`, () => {
        const before = JSON.stringify(fixture.graph);
        const result = analyzeGraph(fixture.graph);

        assert.equal(JSON.stringify(fixture.graph), before, "analysis must not write the graph");
        assert.deepEqual(result.candidates.map(item => item.name).sort(), expected.slice().sort());

        // Ambiguous samples are asserted separately.
        if (fixture.sample === "sdxl-local") return;

        assert.deepEqual(result.summary, {
            total: expected.length,
            matched: expected.length,
            errors: 0,
        });
        for (const candidate of result.candidates) {
            assert.equal(candidate.status, "matched", `${candidate.name}: ${candidate.reason}`);
            assert.ok(candidate.spec, `${candidate.name} should produce a template spec`);
            assert.ok(candidate.nodeId, `${candidate.name} should report a node id`);
            assert.ok(candidate.widgetName, `${candidate.name} should report a widget`);
        }

        // Candidate values must agree with the mapping the matcher resolves.
        const resolved = resolveParams(fixture.graph, { node_mapping: result.node_mapping });
        for (const candidate of result.candidates) {
            assert.equal(candidate.nodeId, resolved[candidate.name].nodeId, candidate.name);
            assert.equal(candidate.value, resolved[candidate.name].value, candidate.name);
        }
    });
}

test("sdxl-local reports ambiguous prompt and sampler candidates", () => {
    const fixture = fixtures.find(item => item.sample === "sdxl-local");
    const result = analyzeGraph(fixture.graph);
    const candidates = byName(result);

    assert.deepEqual(result.summary, { total: 12, matched: 4, errors: 8 });
    assert.deepEqual(
        Object.keys(result.node_mapping).sort(),
        ["ckpt_name", "dual_clip_name1", "height", "width"]
    );

    for (const name of ["positive_prompt", "negative_prompt"]) {
        assert.equal(candidates[name].status, "error");
        assert.match(candidates[name].reason, /无法确定唯一节点/);
    }
    for (const name of ["seed", "steps", "cfg", "sampler", "scheduler", "denoise"]) {
        assert.equal(candidates[name].status, "error");
        assert.match(candidates[name].reason, /找到 3 个候选项/);
    }
});

test("linked sizes use the upstream primitive", () => {
    const fixture = fixtures.find(item => item.sample === "flux-local");
    const result = analyzeGraph(fixture.graph);
    const candidates = byName(result);

    for (const name of ["width", "height"]) {
        assert.equal(candidates[name].strategy, "output_connection");
        assert.deepEqual(result.node_mapping[name], {
            match_strategy: "output_connection",
            target_class_type: "ModelSamplingFlux",
            target_input: name,
            widget: "value",
        });
        assert.equal(candidates[name].nodeType, "PrimitiveInt");
        assert.equal(candidates[name].widgetName, "value");
    }
});

test("guider and noise nodes map sampler parameters", () => {
    const fixture = fixtures.find(item => item.sample === "chroma-template");
    const candidates = byName(analyzeGraph(fixture.graph));

    assert.equal(candidates.cfg.nodeType, "CFGGuider");
    assert.equal(candidates.cfg.widgetName, "cfg");
    assert.equal(candidates.seed.nodeType, "RandomNoise");
    assert.equal(candidates.seed.widgetName, "noise_seed");
    assert.equal(candidates.steps.nodeType, "BasicScheduler");
});

test("model loaders are proposed but unchecked", () => {
    const fixture = fixtures.find(item => item.sample === "anima-local");
    const candidates = byName(analyzeGraph(fixture.graph));

    for (const name of ["unet_name", "clip_name", "vae_name"]) {
        assert.equal(candidates[name].defaultSelected, false, name);
    }
    for (const name of ["positive_prompt", "steps", "seed"]) {
        assert.equal(candidates[name].defaultSelected, true, name);
    }
});

test("qwen edit workflows use the encoder prompt widgets", () => {
    const fixture = fixtures.find(item => item.sample === "qwen-edit-local");
    const candidates = byName(analyzeGraph(fixture.graph));

    assert.equal(candidates.positive_prompt.nodeType, "TextEncodeQwenImageEdit");
    assert.equal(candidates.positive_prompt.widgetName, "prompt");
    assert.equal(candidates.negative_prompt.nodeType, "TextEncodeQwenImageEdit");
});

function makeSubgraph(sub) {
    const links = {};
    for (const [id, link] of Object.entries(sub.links || {})) {
        links[id] = { id: Number(id), ...link };
    }

    return {
        nodes: (sub.nodes || []).map(makeNode),
        links,
        inputs: (sub.inputs || []).map(input => {
            const widget = input.widget ? { ...input.widget } : undefined;
            return { ...input, widget };
        }),
        inputNode: sub.inputNode || { id: -10 },
    };
}

function makeNode(node) {
    const converted = {
        id: node.id,
        type: node.type,
        title: node.title || "",
        widgets: Object.entries(node.widgets || {}).map(([name, value]) => ({ name, value })),
        inputs: Object.entries(node.inputs || {}).map(([name, link]) => ({ name, link })),
    };

    if (node.subgraph) {
        converted.subgraph = makeSubgraph(node.subgraph);
        converted.inputs = converted.subgraph.inputs.map(input => ({
            name: input.name,
            link: null,
            _subgraphSlot: input,
            _widget: input.widget,
        }));
        converted.widgets = converted.subgraph.inputs
            .filter(input => input.widget)
            .map(input => input.widget);
    }

    return converted;
}

test("subgraph workflows are analyzed through the inner nodes", () => {
    const fixture = readJson(join(FIXTURES, "graphs", "qwen-image-21.json"));
    const graph = { nodes: fixture.nodes.map(makeNode), links: fixture.links || {} };
    const result = analyzeGraph(graph);
    const candidates = byName(result);

    assert.deepEqual(result.summary, { total: 13, matched: 13, errors: 0 });
    assert.match(candidates.steps.nodeId, /^459:/);
    assert.equal(candidates.positive_prompt.nodeType, "TextEncodeQwenImage21");
    assert.deepEqual(result.node_mapping.positive_prompt, {
        match_strategy: "input_slot",
        class_type: "KSampler",
        input_name: "positive",
        widget: "prompt",
    });
});

test("analyzer reports the outer owner of an externally linked subgraph input", () => {
    const inner = {
        id: 456,
        type: "EmptyLatentImage",
        widgets: { width: 1024, height: 1024 },
        inputs: { width: 660 },
    };
    const instance = makeNode({
        id: 459,
        type: "Subgraph",
        inputs: {},
        subgraph: {
            nodes: [inner],
            links: { 660: { origin_id: -10, origin_slot: 0, target_id: 456, target_slot: 0 } },
            inputs: [{ name: "width", linkIds: [660], widget: { name: "width", value: 1024 } }],
            inputNode: { id: -10 },
        },
    });
    instance.inputs[0].link = 300;

    const graph = {
        nodes: [instance, makeNode({ id: 50, type: "PrimitiveInt", widgets: { value: 1024 } })],
        links: { 300: { origin_id: 50, origin_slot: 0 } },
    };

    const result = analyzeGraph(graph);
    const candidates = byName(result);

    assert.deepEqual(result.summary, { total: 2, matched: 2, errors: 0 });
    assert.equal(candidates.width.nodeType, "PrimitiveInt");
    assert.equal(candidates.width.nodeId, "50");
    assert.equal(candidates.width.widgetName, "value");
    assert.equal(candidates.width.value, 1024);
    assert.equal(candidates.height.nodeType, "EmptyLatentImage");
});

test("analyzer marks promoted inputs with missing host metadata as errors", () => {
    const inner = {
        id: 456,
        type: "CLIPTextEncode",
        title: "positive",
        widgets: { text: "inner prompt" },
        inputs: { text: 660 },
    };
    const instance = makeNode({
        id: 459,
        type: "MossImage",
        inputs: {},
        subgraph: {
            nodes: [inner],
            links: { 660: { origin_id: -10, origin_slot: 0, target_id: 456, target_slot: 0 } },
            inputs: [{ name: "text", linkIds: [660] }],
            inputNode: { id: -10 },
        },
    });
    // Deliberately drop the host metadata that makeNode normally adds.
    instance.inputs[0]._subgraphSlot = undefined;
    instance.inputs[0]._widget = undefined;

    const graph = { nodes: [instance], links: {} };
    const result = analyzeGraph(graph);
    const candidate = byName(result).positive_prompt;

    assert.equal(candidate.status, "error");
    assert.match(candidate.reason, /由外部连线控制/);
});

test("mapping descriptions validate against the current graph", () => {
    const fixture = fixtures.find(item => item.sample === "anima-local");
    const candidates = describeMapping(fixture.graph, {
        steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
        missing: { match_strategy: "unique_class", class_type: "NoSuchNode", widget: "x" },
        unet_name: { match_strategy: "unique_class", class_type: "UNETLoader", widget: "unet_name", default_selected: false },
    });

    const byKey = Object.fromEntries(candidates.map(item => [item.name, item]));
    assert.equal(byKey.steps.status, "matched");
    assert.equal(byKey.steps.value, 35);
    assert.equal(byKey.steps.defaultSelected, true);
    assert.equal(byKey.missing.status, "error");
    assert.match(byKey.missing.reason, /未找到 NoSuchNode/);
    assert.equal(byKey.unet_name.defaultSelected, false);
    assert.equal(byKey.unet_name.spec.default_selected, false);
});

test("buildTemplate keeps selected mappings and loader defaults", () => {
    const fixture = fixtures.find(item => item.sample === "anima-local");
    const candidates = describeMapping(fixture.graph, {
        steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
        unet_name: { match_strategy: "unique_class", class_type: "UNETLoader", widget: "unet_name", default_selected: false },
    });

    const template = buildTemplate({
        id: "anima-custom",
        name: "Anima Custom",
        description: "Saved from the analyzer",
        candidates,
        synonyms: { KSamplerAdvanced: "KSampler" },
    });

    assert.equal(template.id, "anima-custom");
    assert.deepEqual(Object.keys(template.node_mapping), ["steps", "unet_name"]);
    assert.equal(template.node_mapping.steps.default_selected, undefined);
    assert.equal(template.node_mapping.unet_name.default_selected, false);
    assert.deepEqual(template.synonyms, { KSamplerAdvanced: "KSampler" });
});

test("buildTemplate rejects invalid ids and empty selections", () => {
    const candidate = {
        name: "steps",
        spec: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
    };

    assert.equal(isSafeTemplateId("my-template"), true);
    assert.equal(isSafeTemplateId("a b"), true);
    assert.equal(isSafeTemplateId("_shared"), false);
    assert.equal(isSafeTemplateId("../escape"), false);
    assert.equal(isSafeTemplateId("a?b"), false);
    assert.equal(isSafeTemplateId("a*b"), false);
    assert.equal(isSafeTemplateId("a:b"), false);
    assert.equal(isSafeTemplateId(" a"), false);
    assert.equal(isSafeTemplateId("a."), false);
    assert.equal(isSafeTemplateId(".hidden"), false);
    assert.equal(isSafeTemplateId("CON"), false);
    assert.equal(isSafeTemplateId("con.txt"), false);
    assert.equal(isSafeTemplateId("console"), true);

    for (const id of ["", "_shared", "a/b"]) {
        assert.throws(() => buildTemplate({ id, name: "Name", candidates: [candidate] }), /模板 ID/);
    }
    assert.throws(
        () => buildTemplate({ id: "ok", name: "Name", candidates: [] }),
        /至少选择一个参数/
    );
    assert.throws(
        () => buildTemplate({ id: "ok", name: "Name", candidates: [candidate, candidate] }),
        /参数名重复/
    );
});

test("listNodes exposes nested nodes for manual mapping", () => {
    const fixture = readJson(join(FIXTURES, "graphs", "qwen-image-21.json"));
    const graph = { nodes: fixture.nodes.map(makeNode), links: fixture.links || {} };
    const nodes = listNodes(graph);

    const sampler = nodes.find(item => item.type === "KSampler");
    assert.equal(sampler.id, "459:458");
    assert.ok(sampler.widgets.includes("steps"));
    assert.ok(sampler.inputs.includes("positive"));
});

test("an empty graph produces no candidates", () => {
    assert.deepEqual(analyzeGraph({ nodes: [], links: {} }), {
        candidates: [],
        node_mapping: {},
        summary: { total: 0, matched: 0, errors: 0 },
    });
});
