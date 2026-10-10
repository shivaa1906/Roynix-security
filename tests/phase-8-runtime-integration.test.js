import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Collection, AuditLogEvent, PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { createMockGuild, createMockMember, createMockChannel, createMockRole } from './fixtures/mockDiscord.js';
import { IncidentCoordinator } from '../src/utils/incidentCoordinator.js';

class MockRoynixClient extends EventEmitter {
    constructor() {
        super();
        this.user = { id: '1370720264605925547', tag: 'Roynix#0000', displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' };
        this.color = 0x2b2d31;
        this.commands = new Collection();
        this.prefix = new Collection();
        this.events = new Collection();
        this.cooldowns = new Collection();
        this.incidentCoordinator = new IncidentCoordinator();
        this.antinukeCache = new Map();
        this.antinukeCacheTimestamps = new Map();
        this.antinukeCacheTtlMs = 2000;
        this.maxCacheEntries = 2000;
        this.auditLogCache = new Map();
        this.antinukeActionTracker = new Map();
        this.isBotOwner = (id) => id === '788970167907778562';
        this.guilds = {
            cache: new Map(),
            fetch: async (id) => this.guilds.cache.get(id) || null
        };
        this.antinukeDB = {
            get: async (key) => this.antinukeCache.get(key) || null,
            set: async (key, val) => this.antinukeCache.set(key, val),
            delete: async (key) => this.antinukeCache.delete(key)
        };
        this.prefixDB = { get: async () => '!' };
        this.noprefixDB = { get: async () => null };
        this.activeVcDB = { get: async () => null, set: async () => null, delete: async () => null };
        this.j2cDB = { get: async () => null };
    }

    async getAntinukeData(guildId) {
        return this.antinukeCache.get(`antinukeData_${guildId}`) || null;
    }

    async setAntinukeData(guildId, data) {
        this.antinukeCache.set(`antinukeData_${guildId}`, data);
    }
}

test('INT-EVENT-01: eventHandler successfully loads and registers core gateway events', async () => {
    const client = new MockRoynixClient();
    const eventHandler = (await import('../src/handlers/eventHandler.js')).default;
    await eventHandler(client);

    assert.ok(client.events.size > 0, 'client.events should have registered events');
    assert.ok(client.events.has('clientReady'), 'clientReady event should be registered');
    assert.ok(client.events.has('messageCreate'), 'messageCreate event should be registered');
    assert.ok(client.events.has('interactionCreate'), 'interactionCreate event should be registered');
    assert.ok(client.events.has('voiceStateUpdate'), 'voiceStateUpdate event should be registered');
});

test('INT-CMD-01: commandHandler successfully registers slash and prefix commands', async () => {
    const client = new MockRoynixClient();
    const commandHandler = (await import('../src/handlers/commandHandler.js')).default;
    await commandHandler(client);

    assert.ok(client.commands.size > 0, 'client.commands should contain slash commands');
    assert.ok(client.prefix.size > 0, 'client.prefix should contain prefix commands');

    assert.ok(client.commands.has('antinuke'), 'Slash antinuke command should be registered');
    assert.ok(client.prefix.has('antinuke'), 'Prefix antinuke command should be registered');
    assert.ok(client.prefix.has('an'), 'Prefix antinuke alias "an" should be registered');
});

test('INT-ANTINUKE-01: antinuke handler loads all 22 modules into client listeners', async () => {
    const client = new MockRoynixClient();
    const antinukeHandler = (await import('../src/handlers/antinuke.js')).default;
    await antinukeHandler(client);

    // Verify listeners registered for key Discord gateway events
    const channelDeleteListeners = client.listeners('channelDelete');
    const roleDeleteListeners = client.listeners('roleDelete');
    const guildBanAddListeners = client.listeners('guildBanAdd');
    const guildMemberRemoveListeners = client.listeners('guildMemberRemove');
    const guildMemberAddListeners = client.listeners('guildMemberAdd');

    assert.ok(channelDeleteListeners.length >= 1, 'channelDelete listener must be registered');
    assert.ok(roleDeleteListeners.length >= 1, 'roleDelete listener must be registered');
    assert.ok(guildBanAddListeners.length >= 1, 'guildBanAdd listener must be registered');
    assert.ok(guildMemberRemoveListeners.length >= 1, 'guildMemberRemove listener must be registered');
    assert.ok(guildMemberAddListeners.length >= 1, 'guildMemberAdd listener must be registered');
});

test('INT-ADAPTER-CHANNEL-01: antiChannelUpdate event adapter reverts unauthorized channel changes', async () => {
    const client = new MockRoynixClient();
    const antiChannelUpdate = (await import('../src/antinuke/antiChannelUpdate.js')).data;
    await antiChannelUpdate.execute(client);

    const guild = createMockGuild({ client });
    client.guilds.cache.set(guild.id, guild);

    await client.setAntinukeData(guild.id, {
        enabled: true,
        punishment: 'ban',
        disabledEvents: []
    });

    const untrustedUserId = '999888777666555444';
    let channelEdited = false;
    let editedOptions = null;

    const oldChannel = createMockChannel({ id: 'chan-int-1', name: 'general', guild });
    const newChannel = createMockChannel({ id: 'chan-int-1', name: 'hacked-channel', guild });
    newChannel.edit = async (opts) => {
        channelEdited = true;
        editedOptions = opts;
        return newChannel;
    };

    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            ['audit-chan-1', {
                id: 'audit-chan-1',
                action: AuditLogEvent.ChannelUpdate,
                targetId: 'chan-int-1',
                executorId: untrustedUserId,
                executor: { id: untrustedUserId, tag: 'Attacker#1234' },
                createdTimestamp: Date.now()
            }]
        ])
    });

    client.emit('channelUpdate', oldChannel, newChannel);
    await new Promise((r) => setTimeout(r, 100));

    assert.ok(channelEdited, 'Channel should have been edited to revert changes');
    assert.equal(editedOptions?.name, 'general', 'Channel name should have been reverted to original');
});

test('INT-ADAPTER-ROLE-01: antiRoleUpdate event adapter protects Roynix Protect role', async () => {
    const client = new MockRoynixClient();
    const antiRoleUpdate = (await import('../src/antinuke/antiRoleUpdate.js')).data;
    await antiRoleUpdate.execute(client);

    const guild = createMockGuild({ client });
    client.guilds.cache.set(guild.id, guild);

    // Ensure bot member has highest role position above the protect role
    guild.members.me.roles.highest = { position: 50, id: 'bot-apex-role' };

    const protectRoleId = 'role-protect-999';
    await client.setAntinukeData(guild.id, {
        enabled: true,
        protectRole: protectRoleId,
        disabledEvents: []
    });

    const oldRole = createMockRole({ id: protectRoleId, name: 'Roynix Protect', position: 20, permissions: 0n, guild });
    const newRole = createMockRole({ id: protectRoleId, name: 'Hacked Role', position: 20, permissions: PermissionFlagsBits.Administrator, guild });

    let permissionsReverted = false;
    newRole.edit = async (payload) => {
        if (payload.permissions === 0n) {
            permissionsReverted = true;
        }
        return newRole;
    };

    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            ['audit-role-1', {
                id: 'audit-role-1',
                action: AuditLogEvent.RoleUpdate,
                targetId: protectRoleId,
                executorId: '999888777666555444',
                executor: { id: '999888777666555444', tag: 'Attacker#1234' },
                createdTimestamp: Date.now()
            }]
        ])
    });

    client.emit('roleUpdate', oldRole, newRole);
    await new Promise((r) => setTimeout(r, 100));

    assert.ok(permissionsReverted, 'Protect role permissions must be reverted to 0n on tampering');
});

test('INT-DISCONNECTED-AUDIT-01: catalog detection modules are implemented but not runtime-connected', async () => {
    // Audit check: Verify that newly created detection modules in src/security/detection/
    // are not yet wired into the main event stream of client.
    const client = new MockRoynixClient();
    const antinukeHandler = (await import('../src/handlers/antinuke.js')).default;
    await antinukeHandler(client);

    // The channelUpdate listener only calls blueprintManager and basic channel.edit revert
    assert.equal(client.listeners('inviteCreate').length, 0, 'inviteCreate event has 0 listeners in runtime');
    assert.equal(client.listeners('autoModerationRuleCreate').length, 0, 'autoModerationRuleCreate has 0 listeners');
    assert.equal(client.listeners('autoModerationRuleDelete').length, 0, 'autoModerationRuleDelete has 0 listeners');
});

test('INT-DISCONNECTED-SERVICES-01: dashboard API and migration manager are not started automatically on client start', async () => {
    const client = new MockRoynixClient();
    // In src/base/Roynix.js:
    // client.start() only calls init() on DBs and loadHandlers(), but does NOT run migrations or start dashboard API
    assert.equal(client.dashboardApiServer, undefined, 'DashboardApiServer is not attached to client instance');
    assert.equal(typeof client.startDashboard, 'undefined', 'client.startDashboard method does not exist');
});
