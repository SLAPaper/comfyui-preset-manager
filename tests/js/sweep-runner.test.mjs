import test from "node:test";
import assert from "node:assert/strict";

import { runSweep } from "../../web/sweep-runner.js";

function combos(...params) {
    return params.map((item, index) => ({ params: item, label: `combo-${index}` }));
}

function noop() {}

test("runs every combination in order", async () => {
    const applied = [];
    const queued = [];
    const progress = [];

    const result = await runSweep({
        combos: combos({ cfg: 1 }, { cfg: 2 }),
        check: () => [],
        apply: params => applied.push(params),
        restore: noop,
        queue: async () => queued.push(applied.length),
        onProgress: (submitted, combo) => progress.push([submitted, combo.label]),
        isCancelled: () => false,
    });

    assert.deepEqual(applied, [{ cfg: 1 }, { cfg: 2 }]);
    assert.deepEqual(queued, [1, 2]);
    assert.deepEqual(progress, [[1, "combo-0"], [2, "combo-1"]]);
    assert.deepEqual(result, { submitted: 2, cancelled: false });
});

test("restores after every combination", async () => {
    const events = [];

    await runSweep({
        combos: combos({ cfg: 1 }, { cfg: 2 }),
        apply: params => events.push(`apply:${params.cfg}`),
        restore: () => events.push("restore"),
        queue: async (combo, index) => events.push(`queue:${index}`),
    });

    assert.deepEqual(events, [
        "apply:1", "queue:0", "restore",
        "apply:2", "queue:1", "restore",
    ]);
});

test("restores when queueing fails", async () => {
    const events = [];

    await assert.rejects(
        runSweep({
            combos: combos({ cfg: 1 }),
            apply: () => events.push("apply"),
            restore: () => events.push("restore"),
            queue: async () => {
                events.push("queue");
                throw new Error("queue failed");
            },
        }),
        /queue failed/
    );

    assert.deepEqual(events, ["apply", "queue", "restore"]);
});

test("passes the combination and its index to queue", async () => {
    const queued = [];

    await runSweep({
        combos: combos({ cfg: 1 }, { cfg: 2 }),
        apply: noop,
        restore: noop,
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
        restore: noop,
        queue: async () => {},
        isCancelled: () => cancelled,
    });

    assert.deepEqual(applied, [{ cfg: 1 }]);
    assert.deepEqual(result, { submitted: 1, cancelled: true });
});

test("rejects an invalid combination after restoring the previous one", async () => {
    let applied = 0;
    let restored = 0;

    await assert.rejects(
        runSweep({
            combos: combos({ cfg: 1 }, { missing: 2 }),
            check: params => ("missing" in params ? ["missing"] : []),
            apply: () => { applied++; },
            restore: () => { restored++; },
            queue: async () => {},
        }),
        /missing/
    );

    assert.equal(applied, 1);
    assert.equal(restored, 1);
});
