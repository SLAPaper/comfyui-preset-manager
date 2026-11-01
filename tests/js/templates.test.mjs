import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyParams, checkParams, resolveParams } from "../../web/matcher.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

const templates = readJson(join(FIXTURES, "templates.json"));
const graphFixtures = readdirSync(join(FIXTURES, "graphs"))
    .filter(name => name.endsWith(".json"))
    .map(name => readJson(join(FIXTURES, "graphs", name)));

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

function makeGraph(fixture) {
    return {
        nodes: fixture.nodes.map(makeNode),
        links: fixture.links || {},
    };
}

function appliedValue(value) {
    return typeof value === "number" ? value + 1 : `${value} (sweep)`;
}

test("graph fixtures cover every bundled template", () => {
    const covered = graphFixtures.map(fixture => fixture.template).sort();
    assert.deepEqual(covered, Object.keys(templates).sort());
});

for (const fixture of graphFixtures) {
    test(`real template ${fixture.template} resolves against its graph`, () => {
        const template = templates[fixture.template];
        assert.ok(template, `missing template ${fixture.template}`);

        assert.deepEqual(
            Object.keys(fixture.expected).sort(),
            Object.keys(template.node_mapping).sort(),
            "expected map must cover every template parameter"
        );

        const graph = makeGraph(fixture);
        const resolved = resolveParams(graph, template);

        for (const [name, expected] of Object.entries(fixture.expected)) {
            const match = resolved[name];
            if (expected === null) {
                assert.equal(match, null, `${name} should not match`);
                continue;
            }
            assert.ok(match, `${name} should match`);
            assert.equal(match.nodeId, expected.nodeId, `${name} node`);
            assert.equal(match.widgetName, expected.widgetName, `${name} widget`);
            assert.equal(match.value, expected.value, `${name} value`);
        }

        const params = {};
        for (const [name, expected] of Object.entries(fixture.expected)) {
            if (expected !== null) params[name] = appliedValue(expected.value);
        }

        assert.deepEqual(checkParams(graph, template, params), []);
        const result = applyParams(graph, template, params);
        assert.deepEqual(result.failed, []);
        assert.equal(result.applied, Object.keys(params).length);

        for (const [name, value] of Object.entries(params)) {
            assert.equal(resolved[name].widget.value, value, `${name} applied`);
        }
    });
}

test("subgraph widgets are written to the host instance", () => {
    const fixture = graphFixtures.find(item => item.template === "qwen-image-21");
    const graph = makeGraph(fixture);
    const template = templates["qwen-image-21"];
    const resolved = resolveParams(graph, template);

    const subgraph = graph.nodes[0].subgraph;
    const sampler = subgraph.nodes.find(node => node.type === "KSampler");
    const encoder = subgraph.nodes.find(node => node.type === "TextEncodeQwenImage21");

    applyParams(graph, template, { steps: 8, positive_prompt: "new prompt" });

    assert.equal(resolved.steps.widget.value, 8);
    assert.equal(sampler.widgets.find(widget => widget.name === "steps").value, 25);
    assert.equal(
        graph.nodes[0].inputs.find(input => input.name === "steps")._widget.value,
        8
    );

    assert.equal(resolved.positive_prompt.widget.value, "new prompt");
    assert.equal(encoder.widgets.find(widget => widget.name === "prompt").value, "");
});

test("subgraph inputs connected from outside are not writable", () => {
    const fixture = graphFixtures.find(item => item.template === "qwen-image-21");
    const graph = makeGraph(fixture);
    const slot = graph.nodes[0].inputs.find(input => input.name === "steps");
    slot.link = 99;

    assert.equal(resolveParams(graph, templates["qwen-image-21"]).steps, null);
});

test("checkParams still reports params the graph cannot match", () => {
    const fixture = graphFixtures.find(item => item.template === "flux-txt2img");
    const graph = makeGraph(fixture);

    assert.deepEqual(
        checkParams(graph, templates["flux-txt2img"], { steps: 12, no_such_param: 1 }),
        ["no_such_param"]
    );
});
