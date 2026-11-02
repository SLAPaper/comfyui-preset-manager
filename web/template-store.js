/**
 * Shared template list cache.
 *
 * The top-level Presets dialog refreshes it, while Sweeps and the template
 * editor reuse it so opening several dialogs does not repeat the same request.
 */

import { getWorkflows } from "./client.js";

let cached = null;

export function loadTemplates({ refresh = false } = {}) {
    if (refresh) cached = null;
    if (!cached) {
        cached = getWorkflows().catch(error => {
            cached = null;
            throw error;
        });
    }
    return cached;
}

export function invalidateTemplates() {
    cached = null;
}
