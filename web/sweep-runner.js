/**
 * Sweep execution loop for ComfyUI Preset Manager.
 *
 * All graph and queue work is injected, so the ordering and cancellation
 * behavior can be tested without a ComfyUI instance.
 */

/**
 * @param {Object} options
 * @param {Array<{params: Object, label: string}>} options.combos
 * @param {(params: Object) => string[]} [options.check] Returns unmatched parameter names.
 * @param {(params: Object) => Object} options.apply
 * @param {(combo: Object, index: number) => Promise<void>} options.queue
 * @param {(submitted: number, combo: Object) => void} [options.onProgress]
 * @param {() => boolean} [options.isCancelled]
 * @returns {Promise<{submitted: number, cancelled: boolean}>}
 */
export async function runSweep({ combos, check, apply, queue, onProgress, isCancelled }) {
    let submitted = 0;

    for (const combo of combos) {
        if (isCancelled?.()) {
            return { submitted, cancelled: true };
        }

        const failed = check?.(combo.params) ?? [];
        if (failed.length > 0) {
            throw new Error(`参数无法匹配到节点: ${failed.join(", ")}`);
        }

        apply(combo.params);
        await queue(combo, submitted);
        submitted++;
        onProgress?.(submitted, combo);
    }

    return { submitted, cancelled: isCancelled?.() ?? false };
}
