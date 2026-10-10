import { AuditLogEvent } from 'discord.js';
import { getExecutor } from '../../utils/getExecutor.js';
import { evaluateActorTrust } from '../../utils/securityPolicy.js';
import { coordinateIncident } from '../../utils/incidentCoordinator.js';

/**
 * Handle newly created invite in guild.
 * @param {import('discord.js').Invite} invite
 * @returns {Promise<boolean>}
 */
export async function checkInviteCreate(invite) {
    if (!invite?.guild) return false;
    const guild = invite.guild;
    const client = guild.client;

    const antinukeData = (typeof client?.getAntinukeData === 'function'
        ? await client.getAntinukeData(guild.id)
        : null) || {};

    if (!antinukeData.enabled) return false;
    const disabledEvents = antinukeData.disabledEvents || [];
    if (disabledEvents.includes('inviteProtection')) return false;

    const inviterId = invite.inviter?.id || null;

    // Check inviter trust
    const trustResult = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'inviteProtection',
        executorId: inviterId,
        targetId: invite.code
    });

    if (trustResult.isExempt) return false;

    // Coordinate incident
    const incidentResult = coordinateIncident({
        guild,
        client,
        antinukeData,
        moduleKey: 'inviteProtection',
        actionType: AuditLogEvent.InviteCreate,
        targetId: invite.code,
        executorId: inviterId
    });

    if (incidentResult.decision === 'enforce') {
        try {
            await invite.delete('Roynix Security: Unauthorized invite creation');
        } catch (err) {
            client?.logger?.warn?.(`[InviteProtection] Failed to delete unauthorized invite ${invite.code}:`, err?.message);
        }
        return true;
    }

    return false;
}
