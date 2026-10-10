import { applyLockdownProfile } from '../lockdown/lockdownProfiles.js';
import { recordTimelineEvent } from './incidentTimeline.js';

export const DEFAULT_PLAYBOOKS = [
    {
        name: 'Mass Raid Containment',
        condition: (inc) => inc.severity === 'CRITICAL' || inc.isRaid,
        actions: ['lockdown_strict', 'record_timeline']
    },
    {
        name: 'High Severity Warning',
        condition: (inc) => inc.severity === 'HIGH',
        actions: ['record_timeline']
    }
];

/**
 * Execute automated incident playbooks against an active incident.
 * @param {import('discord.js').Guild} guild
 * @param {object} incident
 * @returns {Promise<{ executedPlaybooks: string[], actionsTaken: string[] }>}
 */
export async function executePlaybooks(guild, incident) {
    if (!guild || !incident) return { executedPlaybooks: [], actionsTaken: [] };

    const executedPlaybooks = [];
    const actionsTaken = [];

    for (const pb of DEFAULT_PLAYBOOKS) {
        if (pb.condition(incident)) {
            executedPlaybooks.push(pb.name);
            for (const action of pb.actions) {
                if (action === 'lockdown_strict') {
                    await applyLockdownProfile(guild, 'STRICT');
                    actionsTaken.push('applied_strict_lockdown');
                } else if (action === 'record_timeline') {
                    recordTimelineEvent(incident.incidentId || incident.id, {
                        type: 'playbook_execution',
                        details: `Playbook "${pb.name}" triggered action "${action}"`
                    });
                    actionsTaken.push('timeline_recorded');
                }
            }
        }
    }

    return { executedPlaybooks, actionsTaken };
}
