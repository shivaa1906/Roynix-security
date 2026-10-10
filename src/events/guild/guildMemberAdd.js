import { Events } from "discord.js";
import { handleWelcome } from '../../functions/handleWelcome.js';
import { trackMemberJoin } from '../../services/raidDetection/joinRaidDetector.js';
import { screenAccountAge } from '../../services/verification/accountAgeScreening.js';
import { evaluateAltRisk } from '../../services/threatScoring/altDetector.js';
import { sanitizeNickname } from '../../security/detection/nicknameProtection.js';
import { circuitBreaker } from '../../utils/circuitBreaker.js';

export const data = {
    name: Events.GuildMemberAdd,
    once: false,
    /**
     * @param {import('discord.js').GuildMember} member 
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(member, client) {
        const guild = member.guild;
        if (!guild) return;

        // 1. Join-Raid Velocity Tracking
        try {
            const raidCheck = trackMemberJoin(guild.id, 10, 10000);
            if (raidCheck.isRaid) {
                circuitBreaker.recordIncident(guild, client, 'Join Raid Wave', member.user, {
                    incidentKey: `join_raid_${guild.id}_${Date.now()}`,
                    moduleKey: 'joinRaid'
                }).catch(() => null);
            }

            // 2. Account Age Screening & Alt Account Heuristics
            if (!member.user.bot) {
                const ageResult = screenAccountAge(member, 1440);
                const altResult = evaluateAltRisk(member, { isJoinRaid: raidCheck.isRaid });

                // If high risk, log or tag
                if (altResult.riskTier === 'CRITICAL' || ageResult.isNewAccount) {
                    client?.logger?.info?.(`[MemberScreening] New/Alt account joined ${guild.id}: ${member.id} (Risk: ${altResult.riskTier})`);
                }

                // 3. Nickname Dehoisting & Sanitization
                await sanitizeNickname(member).catch(() => null);
            }
        } catch (err) {
            client?.logger?.warn?.(`[GuildMemberAdd] Security check error: ${err?.message}`);
        }

        // Welcome handler
        handleWelcome(guild, member, client);
    }
};
