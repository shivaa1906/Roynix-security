/**
 * Sliding-Window Join-Raid Velocity Detector
 */

const joinTracker = new Map(); // guildId -> Array<timestamps>
const raidActive = new Map();  // guildId -> boolean

export function trackMemberJoin(guildId, threshold = 10, windowMs = 10000) {
    if (!guildId) return { isRaid: false, count: 0, threshold };

    const now = Date.now();
    const timestamps = joinTracker.get(guildId) || [];
    const fresh = timestamps.filter(t => now - t <= windowMs);
    fresh.push(now);
    joinTracker.set(guildId, fresh);

    const count = fresh.length;
    const isRaid = count >= threshold;

    if (isRaid) {
        raidActive.set(guildId, true);
    }

    return { isRaid, count, threshold };
}

export function isJoinRaidActive(guildId) {
    return raidActive.get(guildId) === true;
}

export function clearJoinRaid(guildId) {
    joinTracker.delete(guildId);
    raidActive.delete(guildId);
}
