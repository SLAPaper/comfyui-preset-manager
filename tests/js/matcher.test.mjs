import test from "node:test";
import assert from "node:assert/strict";

import {
    applyParams,
    captureParams,
    checkParams,
    readParams,
    resolveParams,
    restoreParams,
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

test("matches the Flux template shape", () => {
    const graph = makeGraph(
        [
            makeNode(27, "PrimitiveInt", { value: 768 }),
            makeNode(28, "PrimitiveInt", { value: 1280 }),
            makeNode(25, "ModelSamplingFlux", {}, { width: 11, height: 12 }),
            makeNode(26, "RandomNoise", { noise_seed: 0 }),
            makeNode(24, "BasicScheduler", { steps: 20, scheduler: "simple", denoise: 1 }),
            makeNode(23, "KSamplerSelect", { sampler_name: "euler" }),
            makeNode(30, "FluxGuidance", { guidance: 3.5 }),
            makeNode(6, "CLIPTextEncode", { text: "a photo" }, {}, "positive"),
            makeNode(7, "CLIPTextEncode", { text: "blurry" }, {}, "negative"),
        ],
        { 11: { origin_id: 27 }, 12: { origin_id: 28 } }
    );
    const tpl = template({
        positive_prompt: {
            match_strategy: "title_keyword",
            class_type: "CLIPTextEncode",
            title_keywords: ["positive"],
            widget: "text",
        },
        width: {
            match_strategy: "output_connection",
            target_class_type: "ModelSamplingFlux",
            target_input: "width",
            widget: "value",
        },
        height: {
            match_strategy: "output_connection",
            target_class_type: "ModelSamplingFlux",
            target_input: "height",
            widget: "value",
        },
        seed: {
            match_strategy: "output_connection",
            target_class_type: "RandomNoise",
            target_input: "noise_seed",
            widget: "noise_seed",
        },
        steps: { match_strategy: "unique_class", class_type: "BasicScheduler", widget: "steps" },
        cfg: { match_strategy: "unique_class", class_type: "FluxGuidance", widget: "guidance" },
    });

    const resolved = resolveParams(graph, tpl);
    assert.equal(resolved.positive_prompt.nodeId, "6");
    assert.equal(resolved.width.nodeId, "27");
    assert.equal(resolved.width.value, 768);
    assert.equal(resolved.height.nodeId, "28");
    assert.equal(resolved.height.value, 1280);
    assert.equal(resolved.seed.nodeId, "26");
    assert.equal(resolved.steps.value, 20);
    assert.equal(resolved.cfg.value, 3.5);
});

test("matches the Qwen Image Edit multi-hop shape", () => {
    const graph = makeGraph(
        [
            makeNode(3, "KSampler", {
                steps: 20,
                cfg: 2.5,
                sampler_name: "euler",
                scheduler: "simple",
            }, { positive: 1, negative: 2, latent_image: 3 }),
            makeNode(40, "ReferenceLatent", {}, { conditioning: 4 }),
            makeNode(41, "FluxKontextMultiReferenceLatentMethod", {}, { conditioning: 5 }),
            makeNode(6, "CLIPTextEncode", { prompt: "edit this" }),
            makeNode(7, "CLIPTextEncode", { prompt: "blurry" }),
            makeNode(50, "EmptySD3LatentImage", { width: 1328, height: 1328 }),
        ],
        {
            1: { origin_id: 40 },
            4: { origin_id: 41 },
            5: { origin_id: 6 },
            2: { origin_id: 7 },
            3: { origin_id: 50 },
        }
    );
    const tpl = template({
        positive_prompt: {
            match_strategy: "input_slot",
            class_type: "KSampler",
            input_name: "positive",
            widget: "prompt",
        },
        negative_prompt: {
            match_strategy: "input_slot",
            class_type: "KSampler",
            input_name: "negative",
            widget: "prompt",
        },
        width: {
            match_strategy: "input_slot",
            class_type: "KSampler",
            input_name: "latent_image",
            widget: "width",
        },
        height: {
            match_strategy: "input_slot",
            class_type: "KSampler",
            input_name: "latent_image",
            widget: "height",
        },
        steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
    });

    const resolved = resolveParams(graph, tpl);
    assert.equal(resolved.positive_prompt.nodeId, "6");
    assert.equal(resolved.positive_prompt.value, "edit this");
    assert.equal(resolved.negative_prompt.nodeId, "7");
    assert.equal(resolved.width.nodeId, "50");
    assert.equal(resolved.width.value, 1328);
    assert.equal(resolved.steps.value, 20);
});

test("matches loader variants independently", () => {
    const graph = makeGraph([
        makeNode(10, "UNETLoader", { unet_name: "base.safetensors" }),
        makeNode(11, "UnetLoaderGGUF", { unet_name: "base.gguf" }),
        makeNode(12, "CLIPLoader", { clip_name: "clip.safetensors" }),
        makeNode(13, "DualCLIPLoader", { clip_name1: "clip1.safetensors", clip_name2: "clip2.safetensors" }),
        makeNode(14, "VAELoader", { vae_name: "vae.safetensors" }),
        makeNode(15, "CheckpointLoaderSimple", { ckpt_name: "model.safetensors" }),
    ]);
    const tpl = template({
        unet_name: { match_strategy: "unique_class", class_type: "UNETLoader", widget: "unet_name" },
        gguf_unet_name: { match_strategy: "unique_class", class_type: "UnetLoaderGGUF", widget: "unet_name" },
        clip_name: { match_strategy: "unique_class", class_type: "CLIPLoader", widget: "clip_name" },
        dual_clip_name1: { match_strategy: "unique_class", class_type: "DualCLIPLoader", widget: "clip_name1" },
        vae_name: { match_strategy: "unique_class", class_type: "VAELoader", widget: "vae_name" },
        ckpt_name: { match_strategy: "unique_class", class_type: "CheckpointLoaderSimple", widget: "ckpt_name" },
    });

    const resolved = resolveParams(graph, tpl);
    assert.equal(resolved.unet_name.value, "base.safetensors");
    assert.equal(resolved.gguf_unet_name.value, "base.gguf");
    assert.equal(resolved.clip_name.value, "clip.safetensors");
    assert.equal(resolved.dual_clip_name1.value, "clip1.safetensors");
    assert.equal(resolved.vae_name.value, "vae.safetensors");
    assert.equal(resolved.ckpt_name.value, "model.safetensors");
});

test("capture and restore round-trip the named params", () => {
    const graph = makeGraph([makeNode(3, "KSampler", { steps: 20, cfg: 7 })]);
    const tpl = template({
        steps: { match_strategy: "unique_class", class_type: "KSampler", widget: "steps" },
        cfg: { match_strategy: "unique_class", class_type: "KSampler", widget: "cfg" },
    });

    const snapshot = captureParams(graph, tpl, new Set(["steps", "missing"]));
    assert.deepEqual(snapshot.map(item => item.name), ["steps"]);

    applyParams(graph, tpl, { steps: 30 });
    graph.dirty = false;
    restoreParams(graph, snapshot);

    assert.equal(graph.nodes[0].widgets[0].value, 20);
    assert.equal(graph.dirty, true);
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
    assert.equal(params[0].defaultSelected, true);
});
