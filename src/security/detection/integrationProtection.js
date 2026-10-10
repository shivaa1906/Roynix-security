import { AuditLogEvent } from 'discord.js';
import { getAuditExecutor } from '../../utils/getExecutor.js';
import { evaluateActorTrust } from '../../utils/securityPolicy.js';
import { coordinateIncident } from '../../utils/incidentCoordinator.js';

/**
 * Handle guild integrations update.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<boolean>}
 */
export async function checkIntegrationsUpdate(guild) {
    if (!guild?.id) return false;
    const client = guild.client;

    const antinukeData = (typeof client?.getAntinukeData === 'function'
        ? await client.getAntinukeData(guild.id)
        : null) || {};

    if (!antinukeData.enabled) return false;
    const disabledEvents = antinukeData.disabledEvents || [];
    if (disabledEvents.includes('integrationProtection')) return false;

    // Check recent integration changes in audit log
    const executor = await getAuditExecutor(
        guild,
        AuditLogEvent.IntegrationCreate,
        guild.id,
        client
    );
    const auditEntryId = executor?.auditEntryId || null;

    if (!executor) return false;

    const trustResult = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'integrationProtection',
        executorId: executor.id,
        targetId: guild.id
    });

    if (trustResult.isExempt) return false;

    const incidentResult = coordinateIncident({
        guild,
        client,
        antinukeData,
        moduleKey: 'integrationProtection',
        actionType: AuditLogEvent.IntegrationCreate,
        targetId: guild.id,
        executorId: executor.id,
        auditEntryId
    });

    return incidentResult.decision === 'enforce';
}
