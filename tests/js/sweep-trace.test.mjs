import test from "node:test";
import assert from "node:assert/strict";

import {
    applyPrefixes,
    capturePrefixes,
    restorePrefixes,
    sanitizeLabel,
    traceFilename,
} from "../../web/sweep-trace.js";

function makeGraph() {
    const prefix = { name: "filename_prefix", value: "out/%date%" };
    const nested = { name: "filename_prefix", value: "nested" };
    const graph = {
        nodes: [
            { widgets: [prefix, { name: "seed", value: 1 }] },
            { widgets: [{ name: "steps", value: 20 }] },
            { subgraph: { nodes: [{ widgets: [nested] }] } },
        ],
        dirty: false,
        setDirtyCanvas() {
            this.dirty = true;
        },
    };
    return { graph, prefix, nested };
}

test("traceFilename adds index and sanitized label", () => {
    assert.equal(
        traceFilename("out/%date%", 0, "cfg=1, steps=20"),
        "out/%date%_001_cfg=1_steps=20"
    );
    assert.equal(traceFilename("", 11, "prompt=a/b:c"), "012_prompt=a_b_c");
});

test("sanitizeLabel removes filename and expansion syntax", () => {
    assert.equal(sanitizeLabel("  a/b:c*?%date%  "), "a_b_c_date");
    assert.equal(sanitizeLabel(""), "combo");
    assert.equal(sanitizeLabel("x".repeat(100)).length, 80);
});

test("capture, apply, and restore cover every filename_prefix widget", () => {
    const { graph, prefix, nested } = makeGraph();
    const prefixes = capturePrefixes(graph);

    assert.deepEqual(prefixes.map(item => item.value), ["out/%date%", "nested"]);

    applyPrefixes(prefixes, 2, "cfg=3");
    assert.equal(prefix.value, "out/%date%_003_cfg=3");
    assert.equal(nested.value, "nested_003_cfg=3");

    restorePrefixes(graph, prefixes);
    assert.equal(prefix.value, "out/%date%");
    assert.equal(nested.value, "nested");
    assert.equal(graph.dirty, true);
});
