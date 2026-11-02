/**
 * Exclusive access to graph mutation.
 *
 * A sweep writes widgets for the whole run. Preset application must not write
 * the same graph while that is happening, and neither operation may start while
 * the other is in progress.
 */

let owner = null;

export function acquireGraphLock(name) {
    if (owner) return false;
    owner = name;
    return true;
}

export function releaseGraphLock(name) {
    if (owner === name) owner = null;
}

export function getGraphLockOwner() {
    return owner;
}
