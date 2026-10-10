/**
 * Threat Analytics & Trend Aggregator
 */

export function aggregateThreatMetrics(incidents = [], windowMs = 86400000) {
    const now = Date.now();
    const recent = incidents.filter(i => now - (i.timestamp || i.createdAt || now) <= windowMs);

    const byModule = {};
    const bySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    const actorCounts = {};

    for (const inc of recent) {
        const mod = inc.moduleKey || 'unknown';
        byModule[mod] = (byModule[mod] || 0) + 1;

        const sev = inc.severity || 'MEDIUM';
        if (bySeverity[sev] !== undefined) {
            bySeverity[sev]++;
        }

        const actor = inc.actorId || inc.executorId;
        if (actor) {
            actorCounts[actor] = (actorCounts[actor] || 0) + 1;
        }
    }

    const topActors = Object.entries(actorCounts)
        .map(([actorId, count]) => ({ actorId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        totalIncidents: recent.length,
        byModule,
        bySeverity,
        topActors,
        windowMs
    };
}
