import { PermissionFlagsBits } from 'discord.js';

export function auditLeastPrivilege(guild, { maxAdminMembers = 5 } = {}) {
    if (!guild?.roles?.cache) return { findings: [], compliant: true };

    const findings = [];
    for (const role of guild.roles.cache.values()) {
        if (role.name === '@everyone' || role.managed) continue;

        const perms = role.permissions;
        const isAdmin = perms.has(PermissionFlagsBits.Administrator);
        const isDangerous = isAdmin || perms.has(PermissionFlagsBits.ManageGuild) || perms.has(PermissionFlagsBits.ManageRoles);

        if (isAdmin && role.members?.size > maxAdminMembers) {
            findings.push({
                roleId: role.id,
                roleName: role.name,
                issue: `Role has Administrator permission and is assigned to ${role.members.size} members`,
                recommendation: 'Split administrative duties into granular moderator roles'
            });
        } else if (isDangerous && role.mentionable) {
            findings.push({
                roleId: role.id,
                roleName: role.name,
                issue: 'Privileged role is mentionable by anyone in the server',
                recommendation: 'Disable role mentionability in server settings'
            });
        }
    }

    return {
        findings,
        compliant: findings.length === 0
    };
}
