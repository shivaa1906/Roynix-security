const moderatorBaselines = new Map(); // guildId:userId -> { hourlyAverage, history: Array<number> }

export function recordModeratorAction(guildId, userId) {
    if (!guildId || !userId) return;
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const record = moderatorBaselines.get(key) || { hourlyAverage: 2, history: [] };
    record.history.push(now);

    // Keep history within last 24h
    record.history = record.history.filter(t => now - t <= 86400000);
    record.hourlyAverage = Math.max(2, Math.ceil(record.history.length / 24));
    moderatorBaselines.set(key, record);
}

export function detectModeratorAnomaly(guildId, userId, recentActionsInLastHour) {
    if (!guildId || !userId) return { isAnomaly: false, ratio: 1 };
    const key = `${guildId}:${userId}`;
    const record = moderatorBaselines.get(key) || { hourlyAverage: 2 };

    const expected = record.hourlyAverage;
    const ratio = recentActionsInLastHour / expected;
    const isAnomaly = recentActionsInLastHour >= 6 && ratio >= 3.0;

    return {
        isAnomaly,
        ratio: Number(ratio.toFixed(2)),
        baselineHourly: expected,
        recentCount: recentActionsInLastHour
    };
}
