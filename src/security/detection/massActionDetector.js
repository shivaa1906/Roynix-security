/**
 * Bounded Sliding-Window Mass Action Velocity Detector
 * Prevents rapid nuking attempts across bans, kicks, role deletions, and channel deletions.
 */

const tracker = new Map(); // key -> Array<timestamps>
const MAX_TRACKER_SIZE = 5000;
const CLEANUP_INTERVAL_MS = 60000;

let lastCleanup = Date.now();

function cleanupStale() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;

    for (const [key, timestamps] of tracker.entries()) {
        const fresh = timestamps.filter(t => now - t < 30000);
        if (fresh.length === 0) {
            tracker.delete(key);
        } else {
            tracker.set(key, fresh);
        }
    }

    if (tracker.size > MAX_TRACKER_SIZE) {
        tracker.clear();
    }
}

/**
 * Record an action and evaluate whether it exceeds the mass action threshold.
 * @param {string} guildId
 * @param {string} actionType e.g. 'massBan', 'massKick', 'massChannelDelete', 'massRoleDelete'
 * @param {string} executorId
 * @param {number} [threshold=3] Number of actions
 * @param {number} [windowMs=10000] Time window in ms
 * @returns {{ tripped: boolean, count: number, threshold: number }}
 */
export function trackAndCheckMassAction(guildId, actionType, executorId, threshold = 3, windowMs = 10000) {
    if (!guildId || !actionType || !executorId) {
        return { tripped: false, count: 0, threshold };
    }

    cleanupStale();

    const key = `${guildId}:${actionType}:${executorId}`;
    const now = Date.now();
    const timestamps = tracker.get(key) || [];
    const freshTimestamps = timestamps.filter(t => now - t <= windowMs);
    freshTimestamps.push(now);
    tracker.set(key, freshTimestamps);

    const count = freshTimestamps.length;
    const tripped = count >= threshold;

    return { tripped, count, threshold };
}

/**
 * Clear tracking for an executor upon sanction completion.
 * @param {string} guildId
 * @param {string} actionType
 * @param {string} executorId
 */
export function resetMassActionTracker(guildId, actionType, executorId) {
    tracker.delete(`${guildId}:${actionType}:${executorId}`);
}
