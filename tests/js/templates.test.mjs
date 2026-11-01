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

function makeGraph(fixture) {
    const nodes = fixture.nodes.map(node => ({
        id: node.id,
        type: node.type,
        title: node.title || "",
        widgets: Object.entries(node.widgets || {}).map(([name, value]) => ({ name, value })),
        inputs: Object.entries(node.inputs || {}).map(([name, link]) => ({ name, link })),
    }));
    return { nodes, links: fixture.links || {} };
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

test("checkParams still reports params the graph cannot match", () => {
    const fixture = graphFixtures.find(item => item.template === "flux-txt2img");
    const graph = makeGraph(fixture);

    assert.deepEqual(
        checkParams(graph, templates["flux-txt2img"], { steps: 12, no_such_param: 1 }),
        ["no_such_param"]
    );
});

test("optional parameters may stay unmatched", () => {
    const template = templates["flux-txt2img"];
    assert.equal(template.node_mapping.negative_prompt.optional, true);

    const fixture = graphFixtures.find(item => item.template === "flux-txt2img");
    const graph = makeGraph(fixture);
    assert.deepEqual(
        checkParams(graph, template, { steps: 12, scheduler: "simple" }),
        []
    );
});
