import { AuditLogEvent, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { getAuditExecutor } from '../../utils/getExecutor.js';
import { evaluateActorTrust } from '../../utils/securityPolicy.js';
import { coordinateIncident } from '../../utils/incidentCoordinator.js';

export const ESCALATION_PERMISSIONS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ManageWebhooks
];

/**
 * Check if a role update introduced dangerous permission escalation.
 * @param {import('discord.js').Role} oldRole
 * @param {import('discord.js').Role} newRole
 * @returns {Promise<boolean>}
 */
export async function checkRolePermissionEscalation(oldRole, newRole) {
    if (!newRole?.guild || oldRole.permissions.bitfield === newRole.permissions.bitfield) return false;
    const guild = newRole.guild;
    const client = guild.client;

    const oldBits = BigInt(oldRole.permissions.bitfield);
    const newBits = BigInt(newRole.permissions.bitfield);

    let escalated = false;
    for (const perm of ESCALATION_PERMISSIONS) {
        const permBig = BigInt(perm);
        if ((newBits & permBig) !== 0n && (oldBits & permBig) === 0n) {
            escalated = true;
            break;
        }
    }

    if (!escalated) return false;

    const antinukeData = (typeof client?.getAntinukeData === 'function'
        ? await client.getAntinukeData(guild.id)
        : null) || {};

    if (!antinukeData.enabled) return false;
    const disabledEvents = antinukeData.disabledEvents || [];
    if (disabledEvents.includes('permissionEscalation') || disabledEvents.includes('antiRoleUpdate')) {
        return false;
    }

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
        moduleKey: 'permissionEscalation',
        executorId: executor?.id,
        targetId: newRole.id
    });

    if (trustResult.isExempt) return false;

    const incidentResult = coordinateIncident({
        guild,
        client,
        antinukeData,
        moduleKey: 'permissionEscalation',
        actionType: AuditLogEvent.RoleUpdate,
        targetId: newRole.id,
        executorId: executor?.id,
        auditEntryId
    });

    if (incidentResult.decision === 'enforce') {
        try {
            await newRole.setPermissions(oldRole.permissions);
        } catch (err) {
            client?.logger?.warn?.(`[PermissionEscalation] Failed to revert permissions on role ${newRole.id}:`, err?.message);
        }
        return true;
    }

    return false;
}
