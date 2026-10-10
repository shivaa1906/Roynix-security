import { evaluateActorTrust } from '../../utils/securityPolicy.js';
import { calculateIncidentSeverity } from '../threatScoring/severityScorer.js';

/**
 * Simulate security policy outcome for an action without applying changes.
 * @param {object} params
 * @param {import('discord.js').Guild} params.guild
 * @param {object} params.antinukeData
 * @param {string} params.moduleKey
 * @param {string} params.executorId
 * @param {string} [params.targetId]
 * @returns {object}
 */
export function simulateSecurityPolicy({
    guild,
    antinukeData = null,
    moduleKey,
    executorId,
    targetId = null
} = {}) {
    if (!guild || !moduleKey || !executorId) {
        return {
            predictedDecision: 'unknown',
            reason: 'missing_parameters',
            trustState: 'unknown',
            severity: 'LOW',
            predictedPunishment: 'none'
        };
    }

    const trustResult = evaluateActorTrust({
        guild,
        antinukeData,
        moduleKey,
        executorId,
        targetId
    });

    const severity = calculateIncidentSeverity({
        moduleKey,
        velocityCount: 1,
        isRaid: false
    });

    const predictedDecision = trustResult.isExempt ? 'exempt' : 'enforce';
    const predictedPunishment = trustResult.isExempt ? 'none' : (antinukeData?.action || 'ban');

    return {
        predictedDecision,
        trustState: trustResult.trustState,
        reason: trustResult.reason,
        severity,
        predictedPunishment,
        moduleKey,
        executorId,
        targetId
    };
}
