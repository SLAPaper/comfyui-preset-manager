import test from "node:test";
import assert from "node:assert/strict";

import { formatValues, parseValues, summarizeAxes } from "../../web/sweep-values.js";

test("parseValues splits, trims, and drops empty entries", () => {
    assert.deepEqual(parseValues("3, 5"), [3, 5]);
    assert.deepEqual(parseValues(" euler, 20 ,normal "), ["euler", 20, "normal"]);
    assert.deepEqual(parseValues(""), []);
    assert.deepEqual(parseValues(" , ,, "), []);
});

test("parseValues keeps numbers as numbers", () => {
    assert.deepEqual(parseValues("0.5, -1, 1e3"), [0.5, -1, 1000]);
    assert.deepEqual(parseValues("steps, 1"), ["steps", 1]);
});

test("formatValues joins with comma and space", () => {
    assert.equal(formatValues([3, 5]), "3, 5");
    assert.equal(formatValues(["euler", "normal"]), "euler, normal");
    assert.equal(formatValues(null), "");
});

test("summarizeAxes reports counts and total runs", () => {
    assert.deepEqual(
        summarizeAxes([{ values: [3, 5] }, { values: ["a", "b", "c"] }]),
        { counts: [2, 3], total: 6 }
    );
    assert.deepEqual(summarizeAxes([{ values: [1] }]), { counts: [1], total: 1 });
});

test("summarizeAxes returns null until every axis has values", () => {
    assert.equal(summarizeAxes([]), null);
    assert.equal(summarizeAxes([{ values: [] }]), null);
    assert.equal(summarizeAxes([{ values: [3] }, {}]), null);
});
