import test from "node:test";
import assert from "node:assert/strict";

import { runSweep } from "../../web/sweep-runner.js";

function combos(...params) {
    return params.map((item, index) => ({ params: item, label: `combo-${index}` }));
}

test("runs every combination in order", async () => {
    const applied = [];
    const queued = [];
    const progress = [];

    const result = await runSweep({
        combos: combos({ cfg: 1 }, { cfg: 2 }),
        check: () => [],
        apply: params => applied.push(params),
        queue: async () => queued.push(applied.length),
        onProgress: (submitted, combo) => progress.push([submitted, combo.label]),
        isCancelled: () => false,
    });

    assert.deepEqual(applied, [{ cfg: 1 }, { cfg: 2 }]);
    assert.deepEqual(queued, [1, 2]);
    assert.deepEqual(progress, [[1, "combo-0"], [2, "combo-1"]]);
    assert.deepEqual(result, { submitted: 2, cancelled: false });
});

test("passes the combination and its index to queue", async () => {
    const queued = [];

    await runSweep({
        combos: combos({ cfg: 1 }, { cfg: 2 }),
        apply: () => {},
        queue: async (combo, index) => queued.push([combo.label, index]),
    });

    assert.deepEqual(queued, [["combo-0", 0], ["combo-1", 1]]);
});

test("stops before applying the next combination", async () => {
    let cancelled = false;
    const applied = [];

    const result = await runSweep({
        combos: combos({ cfg: 1 }, { cfg: 2 }, { cfg: 3 }),
        apply: params => {
            applied.push(params);
            cancelled = true;
        },
        queue: async () => {},
        isCancelled: () => cancelled,
    });

    assert.deepEqual(applied, [{ cfg: 1 }]);
    assert.deepEqual(result, { submitted: 1, cancelled: true });
});

test("rejects a combination before touching the graph", async () => {
    let applied = 0;

    await assert.rejects(
        runSweep({
            combos: combos({ cfg: 1 }, { missing: 2 }),
            check: params => ("missing" in params ? ["missing"] : []),
            apply: () => { applied++; },
            queue: async () => {},
        }),
        /missing/
    );

    assert.equal(applied, 1);
});
