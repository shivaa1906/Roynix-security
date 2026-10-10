import { AuditLogEvent } from 'discord.js';
import { getAuditExecutor } from '../../utils/getExecutor.js';
import { evaluateActorTrust } from '../../utils/securityPolicy.js';
import { coordinateIncident } from '../../utils/incidentCoordinator.js';

/**
 * Handle AutoMod rule deletion or tampering.
 * @param {import('discord.js').AutoModerationRule} rule
 * @param {'delete' | 'update'} action
 * @param {import('discord.js').AutoModerationRule} [newRule]
 * @returns {Promise<boolean>}
 */
export async function checkAutomodRuleChange(rule, action = 'delete', newRule = null) {
    if (!rule?.guild) return false;
    const guild = rule.guild;
    const client = guild.client;

    const antinukeData = (typeof client?.getAntinukeData === 'function'
        ? await client.getAntinukeData(guild.id)
        : null) || {};

    if (!antinukeData.enabled) return false;
    const disabledEvents = antinukeData.disabledEvents || [];
    if (disabledEvents.includes('automodProtection')) return false;

    // Check if updated rule was disabled
    if (action === 'update' && newRule && newRule.enabled !== false && rule.enabled === true) {
        return false;
    }

    const auditAction = action === 'delete'
        ? (AuditLogEvent.AutoModerationRuleDelete ?? 142)
        : (AuditLogEvent.AutoModerationRuleUpdate ?? 141);

    const executor = await getAuditExecutor(
        guild,
        auditAction,
        rule.id,
        client
    );
    const auditEntryId = executor?.auditEntryId || null;

    const trustResult = evaluateActorTrust({
        guild,
        client,
        antinukeData,
        moduleKey: 'automodProtection',
        executorId: executor?.id,
        targetId: rule.id
    });

    if (trustResult.isExempt) return false;

    const incidentResult = coordinateIncident({
        guild,
        client,
        antinukeData,
        moduleKey: 'automodProtection',
        actionType: auditAction,
        targetId: rule.id,
        executorId: executor?.id,
        auditEntryId
    });

    if (incidentResult.decision === 'enforce') {
        if (action === 'update' && newRule) {
            try {
                await newRule.setEnabled(true);
            } catch (err) {
                client?.logger?.warn?.(`[AutomodProtection] Failed to re-enable rule ${rule.id}:`, err?.message);
            }
        }
        return true;
    }

    return false;
}
