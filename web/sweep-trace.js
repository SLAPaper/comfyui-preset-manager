/**
 * Filename tagging for sweep runs.
 *
 * Each submitted combination rewrites every filename_prefix widget so saved
 * outputs carry the combo index and label. Prefixes are restored when the
 * sweep ends.
 */

const UNSAFE = /[<>:"/\\|?*%,;\x00-\x1f]+/g;

export function sanitizeLabel(value) {
    return String(value)
        .replace(UNSAFE, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80) || "combo";
}

export function traceFilename(base, index, label) {
    const number = String(index + 1).padStart(3, "0");
    const tag = `${number}_${sanitizeLabel(label)}`;
    return base ? `${base}_${tag}` : tag;
}

function collectPrefixWidgets(graph, widgets) {
    for (const node of graph?.nodes || []) {
        for (const widget of node.widgets || []) {
            if (widget.name === "filename_prefix") widgets.push(widget);
        }
        if (node.subgraph) collectPrefixWidgets(node.subgraph, widgets);
    }
    return widgets;
}

/**
 * Snapshot every filename_prefix widget in the graph, including subgraphs.
 */
export function capturePrefixes(graph) {
    return collectPrefixWidgets(graph, []).map(widget => ({
        widget,
        value: widget.value,
    }));
}

/**
 * Point every captured prefix at the current combination.
 */
export function applyPrefixes(prefixes, index, label) {
    for (const { widget, value } of prefixes) {
        widget.value = traceFilename(value, index, label);
    }
}

/**
 * Put the original prefixes back and repaint the canvas.
 */
export function restorePrefixes(graph, prefixes) {
    for (const { widget, value } of prefixes) {
        widget.value = value;
    }
    graph.setDirtyCanvas?.(true, true);
}
