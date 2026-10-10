import { PermissionFlagsBits } from 'discord.js';

export const MODULE_REQUIRED_PERMISSIONS = Object.freeze({
    antiBan: [PermissionFlagsBits.BanMembers, PermissionFlagsBits.ViewAuditLog],
    antiKick: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.ViewAuditLog],
    antiBot: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.ViewAuditLog],
    antiChannelCreate: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewAuditLog],
    antiChannelDelete: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewAuditLog],
    antiChannelUpdate: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewAuditLog],
    antiRoleCreate: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewAuditLog],
    antiRoleDelete: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewAuditLog],
    antiRoleUpdate: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewAuditLog],
    antiWebhookUpdate: [PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ViewAuditLog],
    antiGuildUpdate: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ViewAuditLog],
    antiMemberUpdate: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ViewAuditLog],
    antiPing: [PermissionFlagsBits.ManageMessages]
});

/**
 * Validate that bot has required Discord permissions to operate a security module in a guild.
 * @param {import('discord.js').Guild} guild
 * @param {string} moduleKey
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateModuleDependencies(guild, moduleKey) {
    if (!guild?.members?.me) {
        return { valid: false, missing: ['Bot member unavailable'] };
    }

    const required = MODULE_REQUIRED_PERMISSIONS[moduleKey] || [PermissionFlagsBits.ViewAuditLog];
    const botPerms = guild.members.me.permissions;
    const missing = [];

    for (const perm of required) {
        if (!botPerms?.has?.(perm)) {
            // Find permission name
            const permName = Object.keys(PermissionFlagsBits).find(k => PermissionFlagsBits[k] === perm) || String(perm);
            missing.push(permName);
        }
    }

    return {
        valid: missing.length === 0,
        missing
    };
}
