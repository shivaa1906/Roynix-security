/**
 * Microsecond Incident Timeline & Event Sequence Tracker
 */

const timelineStore = new Map(); // incidentId -> Array<EventRecord>
const MAX_INCIDENTS = 500;

export function recordTimelineEvent(incidentId, {
    type = 'action',
    actorId = null,
    targetId = null,
    details = '',
    outcome = null,
    timestamp = Date.now()
} = {}) {
    if (!incidentId) return;

    if (timelineStore.size > MAX_INCIDENTS) {
        const oldest = timelineStore.keys().next().value;
        if (oldest) timelineStore.delete(oldest);
    }

    const events = timelineStore.get(incidentId) || [];
    events.push({
        type,
        actorId,
        targetId,
        details,
        outcome,
        timestamp
    });

    timelineStore.set(incidentId, events);
}

export function getIncidentTimeline(incidentId) {
    if (!incidentId) return [];
    const events = timelineStore.get(incidentId) || [];
    return events.slice().sort((a, b) => a.timestamp - b.timestamp);
}
