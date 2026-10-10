import { AuditLogEvent } from 'discord.js';
import { getAuditExecutor } from '../../utils/getExecutor.js';
import { evaluateActorTrust } from '../../utils/securityPolicy.js';
import { coordinateIncident } from '../../utils/incidentCoordinator.js';

/**
 * Handle member communication timeout update.
 * @param {import('discord.js').GuildMember} oldMember
 * @param {import('discord.js').GuildMember} newMember
 * @returns {Promise<boolean>}
 */
export async function checkMemberTimeout(oldMember, newMember) {
    if (!newMember?.guild) return false;
    const guild = newMember.guild;
    const client = guild.client;

    const wasTimedOut = Boolean(oldMember.communicationDisabledUntil);
    const isTimedOut = Boolean(newMember.communicationDisabledUntil);

    if (wasTimedOut || !isTimedOut) return false; // Only check newly added timeouts

    const antinukeData = (typeof client?.getAntinukeData === 'function'
        ? await client.getAntinukeData(guild.id)
        : null) || {};

    if (!antinukeData.enabled) return false;
    const disabledEvents = antinukeData.disabledEvents || [];
    if (disabledEvents.includes('timeoutProtection')) return false;

    const executor = await getAuditExecutor(
        guild,
        AuditLogEvent.MemberUpdate,
        newMember.id,
        client
    );
    const auditEntryId = executor?.auditEntryId || null;

    const trustResult = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'timeoutProtection',
        executorId: executor?.id,
        targetId: newMember.id
    });

    if (trustResult.isExempt) return false;

    const incidentResult = coordinateIncident({
        guild,
        client,
        antinukeData,
        moduleKey: 'timeoutProtection',
        actionType: AuditLogEvent.MemberUpdate,
        targetId: newMember.id,
        executorId: executor?.id,
        auditEntryId
    });

    if (incidentResult.decision === 'enforce') {
        try {
            await newMember.timeout(null, 'Roynix Security: Revert unauthorized timeout');
        } catch (err) {
            client?.logger?.warn?.(`[TimeoutProtection] Failed to revert timeout on ${newMember.id}:`, err?.message);
        }
        return true;
    }

    return false;
}
