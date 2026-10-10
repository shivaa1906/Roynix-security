import { AuditLogEvent } from 'discord.js';
import { getAuditExecutor } from '../../utils/getExecutor.js';
import { evaluateActorTrust } from '../../utils/securityPolicy.js';
import { coordinateIncident } from '../../utils/incidentCoordinator.js';

const voiceHopTracker = new Map(); // guildId:userId -> Array<timestamps>
const MAX_HOP_TRACKER = 2000;

/**
 * Handle voice state changes for voice channel flooding, mass disconnects, and moves.
 * @param {import('discord.js').VoiceState} oldState
 * @param {import('discord.js').VoiceState} newState
 * @returns {Promise<{ actionTaken: string | null }>}
 */
export async function checkVoiceState(oldState, newState) {
    const member = newState.member || oldState.member;
    const guild = newState.guild || oldState.guild;
    if (!guild || !member) return { actionTaken: null };

    const client = guild.client;
    const antinukeData = (typeof client?.getAntinukeData === 'function'
        ? await client.getAntinukeData(guild.id)
        : null) || {};

    if (!antinukeData.enabled) return { actionTaken: null };
    const disabledEvents = antinukeData.disabledEvents || [];
    if (disabledEvents.includes('voiceSecurity')) return { actionTaken: null };

    const userId = member.id;
    const now = Date.now();

    // 1. Voice Channel Hopping / Join Flood Detection
    const channelChanged = oldState.channelId !== newState.channelId;
    if (channelChanged && newState.channelId !== null) {
        if (voiceHopTracker.size > MAX_HOP_TRACKER) voiceHopTracker.clear();

        const hopKey = `${guild.id}:${userId}`;
        const hops = voiceHopTracker.get(hopKey) || [];
        const freshHops = hops.filter(t => now - t <= 5000);
        freshHops.push(now);
        voiceHopTracker.set(hopKey, freshHops);

        if (freshHops.length >= 5) {
            // Rapid hopping detected (> 5 hops in 5s)
            const trustResult = evaluateActorTrust({
                guild,
                client,
                antinukeData,
                moduleKey: 'voiceSecurity',
                executorId: userId,
                targetId: newState.channelId
            });

            if (!trustResult.isExempt) {
                try {
                    await member.voice.disconnect('Roynix Security: Voice join-flood / rapid hopping');
                    voiceHopTracker.delete(hopKey);
                    return { actionTaken: 'disconnected_for_hopping' };
                } catch {
                    return { actionTaken: null };
                }
            }
        }
    }

    // 2. Moderator Voice Disconnect Abuse
    if (oldState.channelId && !newState.channelId) {
        const executor = await getAuditExecutor(
            guild,
            AuditLogEvent.MemberDisconnect ?? 27,
            userId,
            client
        );

        if (executor && executor.id !== userId) {
            const trustResult = evaluateActorTrust({
                guild,
                client,
                antinukeData,
                moduleKey: 'voiceSecurity',
                executorId: executor.id,
                targetId: userId
            });

            if (!trustResult.isExempt) {
                coordinateIncident({
                    guild,
                    client,
                    antinukeData,
                    moduleKey: 'voiceSecurity',
                    actionType: AuditLogEvent.MemberDisconnect ?? 27,
                    targetId: userId,
                    executorId: executor.id,
                    auditEntryId: executor.auditEntryId || null
                });
                return { actionTaken: 'disconnect_abuse_reported' };
            }
        }
    }

    return { actionTaken: null };
}
