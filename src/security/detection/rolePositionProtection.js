import { AuditLogEvent } from 'discord.js';
import { getAuditExecutor } from '../../utils/getExecutor.js';
import { evaluateActorTrust } from '../../utils/securityPolicy.js';
import { coordinateIncident } from '../../utils/incidentCoordinator.js';

/**
 * Detect unauthorized role position elevation and hierarchy tampering.
 * @param {import('discord.js').Role} oldRole
 * @param {import('discord.js').Role} newRole
 * @returns {Promise<boolean>} Whether an incident was handled
 */
export async function checkRolePosition(oldRole, newRole) {
    if (!newRole?.guild) return false;
    const oldPos = oldRole.rawPosition ?? oldRole.position ?? 0;
    const newPos = newRole.rawPosition ?? newRole.position ?? 0;
    if (oldPos === newPos) return false;
    const guild = newRole.guild;
    const client = guild.client;

    const antinukeData = (typeof client?.getAntinukeData === 'function'
        ? await client.getAntinukeData(guild.id)
        : null) || {};

    if (!antinukeData.enabled) return false;
    const disabledEvents = antinukeData.disabledEvents || [];
    if (disabledEvents.includes('rolePositionProtection') || disabledEvents.includes('antiRoleUpdate')) {
        return false;
    }

    const botMember = guild.members?.me;
    const botHighestPos = botMember?.roles?.highest?.position ?? 0;

    // Check if role was elevated higher than old position or hoisted near bot position
    const isElevated = newRole.position > oldRole.position && newRole.position >= botHighestPos - 1;
    if (!isElevated) return false;

    // Resolve executor via audit logs
    const executor = await getAuditExecutor(
        guild,
        AuditLogEvent.RoleUpdate,
        newRole.id,
        client
    );
    const auditEntryId = executor?.auditEntryId || null;

    const trustResult = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'rolePositionProtection',
        executorId: executor?.id,
        targetId: newRole.id
    });

    if (trustResult.isExempt) return false;

    const incidentResult = coordinateIncident({
        guild,
        client,
        antinukeData,
        moduleKey: 'rolePositionProtection',
        actionType: AuditLogEvent.RoleUpdate,
        targetId: newRole.id,
        executorId: executor?.id,
        auditEntryId
    });

    if (incidentResult.decision === 'enforce') {
        try {
            await newRole.setPosition(oldRole.position);
        } catch (err) {
            client?.logger?.warn?.(`[RolePositionProtection] Failed to revert position on ${newRole.id}:`, err?.message);
        }
        return true;
    }

    return false;
}
