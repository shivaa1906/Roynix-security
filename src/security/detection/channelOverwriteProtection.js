import { AuditLogEvent, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { getAuditExecutor } from '../../utils/getExecutor.js';
import { evaluateActorTrust } from '../../utils/securityPolicy.js';
import { coordinateIncident } from '../../utils/incidentCoordinator.js';

const DANGEROUS_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.MentionEveryone
];

/**
 * Detect unauthorized permission overwrite escalation on channels.
 * @param {import('discord.js').GuildChannel} oldChannel
 * @param {import('discord.js').GuildChannel} newChannel
 * @returns {Promise<boolean>} Whether an incident was handled
 */
export async function checkChannelOverwrites(oldChannel, newChannel) {
    if (!newChannel?.guild || !oldChannel?.permissionOverwrites) return false;
    const guild = newChannel.guild;
    const client = guild.client;

    const antinukeData = (typeof client?.getAntinukeData === 'function'
        ? await client.getAntinukeData(guild.id)
        : null) || {};

    if (!antinukeData.enabled) return false;
    const disabledEvents = antinukeData.disabledEvents || [];
    if (disabledEvents.includes('channelOverwriteProtection') || disabledEvents.includes('antiChannelUpdate')) {
        return false;
    }

    // Inspect newly added or modified overwrites
    const oldOverwrites = oldChannel.permissionOverwrites.cache;
    const newOverwrites = newChannel.permissionOverwrites.cache;

    let hasEscalation = false;
    let targetOverwriteId = null;

    for (const [id, newOverwrite] of newOverwrites.entries()) {
        const oldOverwrite = oldOverwrites.get(id);
        const oldAllow = oldOverwrite ? BigInt(oldOverwrite.allow.bitfield) : 0n;
        const newAllow = BigInt(newOverwrite.allow.bitfield);

        for (const perm of DANGEROUS_PERMS) {
            const permBig = BigInt(perm);
            if ((newAllow & permBig) !== 0n && (oldAllow & permBig) === 0n) {
                // Dangerous permission was added to overwrite
                hasEscalation = true;
                targetOverwriteId = id;
                break;
            }
        }
        if (hasEscalation) break;
    }

    if (!hasEscalation) return false;

    // Resolve executor via audit logs
    const executor = await getAuditExecutor(
        guild,
        AuditLogEvent.ChannelOverwriteUpdate,
        newChannel.id,
        client
    );
    const auditEntryId = executor?.auditEntryId || null;

    const trustResult = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'channelOverwriteProtection',
        executorId: executor?.id,
        targetId: newChannel.id
    });

    if (trustResult.isExempt) return false;

    // Coordinate incident and revert overwrite
    const incidentResult = coordinateIncident({
        guild,
        client,
        antinukeData,
        moduleKey: 'channelOverwriteProtection',
        actionType: AuditLogEvent.ChannelOverwriteUpdate,
        targetId: newChannel.id,
        executorId: executor?.id,
        auditEntryId
    });

    if (incidentResult.decision === 'enforce') {
        // Revert overwrite to previous state
        try {
            if (oldOverwrites.size > 0) {
                await newChannel.permissionOverwrites.set(oldOverwrites.values());
            } else if (targetOverwriteId) {
                await newChannel.permissionOverwrites.delete(targetOverwriteId);
            }
        } catch (err) {
            client?.logger?.warn?.(`[ChannelOverwriteProtection] Failed to revert overwrite on ${newChannel.id}:`, err?.message);
        }
        return true;
    }

    return false;
}
