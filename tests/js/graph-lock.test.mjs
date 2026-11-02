import test from "node:test";
import assert from "node:assert/strict";

import {
    acquireGraphLock,
    getGraphLockOwner,
    releaseGraphLock,
} from "../../web/graph-lock.js";

test("only one owner can hold the graph lock", () => {
    assert.equal(acquireGraphLock("sweep"), true);
    assert.equal(acquireGraphLock("preset"), false);
    assert.equal(getGraphLockOwner(), "sweep");

    releaseGraphLock("sweep");
    assert.equal(getGraphLockOwner(), null);
    assert.equal(acquireGraphLock("preset"), true);

    releaseGraphLock("preset");
});

test("a non-owner cannot release the lock", () => {
    assert.equal(acquireGraphLock("sweep"), true);
    releaseGraphLock("preset");
    assert.equal(getGraphLockOwner(), "sweep");

    releaseGraphLock("sweep");
    assert.equal(getGraphLockOwner(), null);
});
