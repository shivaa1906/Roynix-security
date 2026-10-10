import { PermissionFlagsBits } from 'discord.js';

export function calculateBotRisk(botMember) {
    if (!botMember || !botMember.user?.bot) {
        return { riskScore: 0, riskTier: 'LOW', details: [] };
    }

    let score = 0;
    const details = [];

    const perms = botMember.permissions;
    if (perms?.has?.(PermissionFlagsBits.Administrator)) {
        score += 50;
        details.push('Holds Administrator permission (+50)');
    }
    if (perms?.has?.(PermissionFlagsBits.ManageGuild)) {
        score += 20;
        details.push('Holds Manage Guild permission (+20)');
    }
    if (perms?.has?.(PermissionFlagsBits.ManageRoles)) {
        score += 20;
        details.push('Holds Manage Roles permission (+20)');
    }
    if (perms?.has?.(PermissionFlagsBits.BanMembers)) {
        score += 15;
        details.push('Holds Ban Members permission (+15)');
    }
    if (perms?.has?.(PermissionFlagsBits.ManageChannels)) {
        score += 15;
        details.push('Holds Manage Channels permission (+15)');
    }
    if (perms?.has?.(PermissionFlagsBits.ManageWebhooks)) {
        score += 15;
        details.push('Holds Manage Webhooks permission (+15)');
    }

    const cappedScore = Math.min(100, score);
    let riskTier = 'LOW';
    if (cappedScore >= 70) riskTier = 'CRITICAL';
    else if (cappedScore >= 40) riskTier = 'HIGH';
    else if (cappedScore >= 20) riskTier = 'MEDIUM';

    return {
        riskScore: cappedScore,
        riskTier,
        details
    };
}
