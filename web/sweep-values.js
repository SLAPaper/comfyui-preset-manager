/**
 * Pure helpers for sweep axis values and run counts.
 *
 * The axis editor owns the DOM; parsing and counting live here so they can be
 * tested without a browser.
 */

export function parseValues(text) {
    return String(text || "")
        .split(",")
        .map(value => value.trim())
        .filter(value => value.length > 0)
        .map(value => {
            const number = Number(value);
            return Number.isFinite(number) ? number : value;
        });
}

export function formatValues(values) {
    return (values || []).join(", ");
}

/**
 * Summarize a list of axes.
 * @returns {{counts: number[], total: number} | null} null when any axis is empty.
 */
export function summarizeAxes(axes) {
    const counts = (axes || []).map(axis => (axis.values || []).length);
    if (counts.length === 0 || counts.some(count => count === 0)) return null;

    return {
        counts,
        total: counts.reduce((left, right) => left * right, 1),
    };
}
