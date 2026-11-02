import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LOADER_RULES, analyzeGraph } from "../../web/template-analyzer.js";

function parseLoaderRules(text) {
    const rules = {};
    let current = null;

    for (const line of text.split(/\r?\n/)) {
        const param = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
        if (param) {
            current = param[1];
            rules[current] = {};
            continue;
        }
        if (!current) continue;

        const field = line.match(/^    (class_type|widget|default_selected):\s*(.+)$/);
        if (!field) continue;

        const value = field[2].trim().replace(/^"|"$/g, "");
        rules[current][field[1]] = value === "false" ? false : value;
    }
    return rules;
}

const yamlRules = parseLoaderRules(readFileSync(
    new URL("../../workflows/_loaders.yaml", import.meta.url),
    "utf8"
));
const yamlMapping = Object.fromEntries(
    Object.entries(yamlRules).map(([name, rule]) => [
        name,
        { class_type: rule.class_type, widget: rule.widget },
    ])
);
const analyzerRules = Object.fromEntries(
    LOADER_RULES.map(rule => [
        rule.name,
        { class_type: rule.nodeType, widget: rule.widget },
    ])
);

test("analyzer loader rules match the shared loader mapping", () => {
    assert.deepEqual(analyzerRules, yamlMapping);
    for (const [name, rule] of Object.entries(yamlRules)) {
        assert.equal(rule.default_selected, false, `${name} must stay unchecked`);
    }
});

test("shared loaders are proposed and unchecked by default", () => {
    for (const rule of LOADER_RULES) {
        const result = analyzeGraph({
            nodes: [{
                id: 1,
                type: rule.nodeType,
                widgets: [{ name: rule.widget, value: "model.safetensors" }],
                inputs: [],
            }],
            links: {},
        });
        const candidate = result.candidates.find(item => item.name === rule.name);
        assert.ok(candidate, `${rule.name} was not proposed`);
        assert.equal(candidate.status, "matched");
        assert.equal(candidate.defaultSelected, false);
    }
});
