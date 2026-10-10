import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';

export function createMockClient({ id = '1370720264605925547', ownerIds = ['788970167907778562'] } = {}) {
    return {
        user: { id, tag: 'Roynix#0000', displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' },
        color: 0x2b2d31,
        isBotOwner: (userId) => ownerIds.includes(userId),
        antinukeDB: {
            cache: new Map(),
            get: async (k) => null,
            set: async (k, v) => null,
            delete: async (k) => null
        },
        guilds: {
            cache: new Map(),
            fetch: async (id) => null
        },
        on: () => {},
        removeListener: () => {}
    };
}

export function createMockRole({
    id = 'role-123',
    name = 'Member',
    position = 10,
    permissions = 0n,
    managed = false,
    editable = true,
    guild = null
} = {}) {
    const role = {
        id,
        name,
        position,
        permissions: new PermissionsBitField(permissions),
        managed,
        editable,
        guild,
        setPermissions: async (newPerms) => {
            role.permissions = new PermissionsBitField(newPerms);
            return role;
        },
        setPosition: async (newPos) => {
            role.position = newPos;
            return role;
        },
        delete: async () => true
    };
    return role;
}

export function createMockChannel({
    id = 'chan-123',
    name = 'general',
    type = 0,
    parentId = null,
    topic = '',
    nsfw = false,
    guild = null,
    permissionOverwrites = new Map()
} = {}) {
    const channel = {
        id,
        name,
        type,
        parentId,
        topic,
        nsfw,
        guild,
        permissionOverwrites: {
            cache: permissionOverwrites instanceof Map ? permissionOverwrites : new Map(),
            set: async (overwrites) => {
                channel.permissionOverwrites.cache = new Map(overwrites.map(o => [o.id, o]));
                return channel;
            },
            delete: async (id) => {
                channel.permissionOverwrites.cache.delete(id);
                return channel;
            }
        },
        setName: async (n) => { channel.name = n; return channel; },
        setTopic: async (t) => { channel.topic = t; return channel; },
        setNSFW: async (n) => { channel.nsfw = n; return channel; },
        delete: async () => true
    };
    return channel;
}

export function createMockMember({
    id = 'user-123',
    tag = 'User#0000',
    bot = false,
    guild = null,
    roles = [],
    communicationDisabledUntil = null
} = {}) {
    const rolesMap = new Map(roles.map(r => [r.id, r]));
    const member = {
        id,
        user: { id, tag, bot, createdTimestamp: Date.now() - 30 * 24 * 60 * 60 * 1000 },
        guild,
        roles: {
            cache: rolesMap,
            highest: roles.length > 0 ? roles.reduce((max, r) => r.position > max.position ? r : max, roles[0]) : { position: 0, id: '0' },
            remove: async (r) => {
                const rId = typeof r === 'string' ? r : r.id;
                rolesMap.delete(rId);
                return member;
            },
            add: async (r) => {
                const rObj = typeof r === 'string' ? { id: r, position: 1 } : r;
                rolesMap.set(rObj.id, rObj);
                return member;
            },
            set: async (rList) => {
                rolesMap.clear();
                for (const r of rList) {
                    const rObj = typeof r === 'string' ? { id: r, position: 1 } : r;
                    rolesMap.set(rObj.id, rObj);
                }
                return member;
            }
        },
        bannable: true,
        kickable: true,
        moderatable: true,
        permissions: new PermissionsBitField(PermissionFlagsBits.Administrator | PermissionFlagsBits.ViewAuditLog),
        communicationDisabledUntil,
        timeout: async (ms) => {
            member.communicationDisabledUntil = ms ? new Date(Date.now() + ms) : null;
            return member;
        },
        ban: async () => true,
        kick: async () => true
    };
    return member;
}

export function createMockGuild({
    id = 'guild-123',
    name = 'Test Guild',
    ownerId = 'owner-999',
    client = createMockClient()
} = {}) {
    const roles = new Map();
    const channels = new Map();
    const members = new Map();
    const bans = new Map();

    const guild = {
        id,
        name,
        ownerId,
        client,
        roles: {
            cache: roles,
            highest: { position: 100, id: 'highest-role' },
            create: async (data) => {
                const r = createMockRole({ id: `role-${Date.now()}`, ...data, guild });
                roles.set(r.id, r);
                return r;
            },
            fetch: async (id) => roles.get(id) || null
        },
        channels: {
            cache: channels,
            create: async (data) => {
                const c = createMockChannel({ id: `chan-${Date.now()}`, ...data, guild });
                channels.set(c.id, c);
                return c;
            },
            fetch: async (id) => channels.get(id) || null
        },
        members: {
            cache: members,
            fetch: async (id) => members.get(id) || null,
            ban: async (userId) => { bans.set(userId, true); return true; },
            kick: async (userId) => { members.delete(userId); return true; }
        },
        bans: {
            cache: bans,
            create: async (userId) => { bans.set(userId, true); return true; },
            remove: async (userId) => { bans.delete(userId); return true; }
        },
        fetchAuditLogs: async () => ({ entries: new Map() }),
        setName: async (n) => { guild.name = n; return guild; },
        setIcon: async () => guild
    };

    const botMember = createMockMember({ id: client.user.id, bot: true, guild });
    members.set(botMember.id, botMember);
    guild.members.me = botMember;

    return guild;
}
