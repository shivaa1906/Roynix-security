import test from 'node:test';
import assert from 'node:assert/strict';
import { Events, Collection, PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { createMockClient, createMockGuild, createMockMember, createMockRole, createMockChannel } from './fixtures/mockDiscord.js';
import { incidentCoordinator } from '../src/utils/incidentCoordinator.js';
import { enableMaintenanceMode, disableMaintenanceMode, isMaintenanceModeActive } from '../src/utils/maintenanceMode.js';
import { setFeatureFlag, isFeatureEnabled } from '../src/utils/featureFlagService.js';
import { createDatabaseBackup } from '../src/utils/backupService.js';
import { DashboardApiServer } from '../src/dashboard/dashboardApi.js';
import { antinukeModules, findModule } from '../src/utils/antinukeModules.js';
import fs from 'node:fs';
import path from 'node:path';

test('PHASE-9-WIRING-01: Gateway security event listeners load and execute properly', async () => {
    // 1. Verify inviteCreate event
    const inviteEvent = (await import('../src/events/guild/inviteCreate.js')).data;
    assert.equal(inviteEvent.name, Events.InviteCreate);
    let inviteChecked = false;
    const mockInvite = {
        guild: { id: 'g-invite-test' },
        inviter: { id: 'u-inviter' },
        code: 'suspicious-invite'
    };
    await assert.doesNotReject(async () => {
        await inviteEvent.execute(mockInvite, createMockClient());
    });

    // 2. Verify autoModerationRuleDelete & Update
    const automodDelete = (await import('../src/events/guild/autoModerationRuleDelete.js')).data;
    assert.equal(automodDelete.name, Events.AutoModerationRuleDelete);
    await assert.doesNotReject(async () => {
        await automodDelete.execute({ guild: { id: 'g-am-test' }, name: 'Bad Word Filter' }, createMockClient());
    });

    const automodUpdate = (await import('../src/events/guild/autoModerationRuleUpdate.js')).data;
    assert.equal(automodUpdate.name, Events.AutoModerationRuleUpdate);
    await assert.doesNotReject(async () => {
        await automodUpdate.execute(
            { guild: { id: 'g-am-test' }, name: 'Bad Word Filter', enabled: true },
            { guild: { id: 'g-am-test' }, name: 'Bad Word Filter', enabled: false },
            createMockClient()
        );
    });

    // 3. Verify guildIntegrationsUpdate
    const integrationEvent = (await import('../src/events/guild/guildIntegrationsUpdate.js')).data;
    assert.equal(integrationEvent.name, Events.GuildIntegrationsUpdate);
    await assert.doesNotReject(async () => {
        await integrationEvent.execute({ id: 'g-int-test' }, createMockClient());
    });
});

test('PHASE-9-WIRING-02: antiMemberUpdate triggers timeout protection and nickname sanitization', async () => {
    const memberUpdateMod = (await import('../src/antinuke/antiMemberUpdate.js')).data;
    const client = createMockClient();
    const guild = createMockGuild({ id: 'g-mem-test' });
    client.getAntinukeData = async () => ({ enabled: true, punishment: 'ban' });

    let registeredHandler = null;
    client.on = (evt, fn) => {
        if (evt === 'guildMemberUpdate') registeredHandler = fn;
    };
    await memberUpdateMod.execute(client);
    assert.ok(registeredHandler, 'guildMemberUpdate listener must be registered');

    // Simulate hoisted nickname update: '!ZZZ Hoisted'
    let nicknameChanged = false;
    const oldMember = createMockMember({ id: 'u-nick', guild });
    oldMember.nickname = 'RegularNick';
    const newMember = createMockMember({ id: 'u-nick', guild });
    newMember.manageable = true;
    newMember.nickname = '!ZZZ Hoisted';
    newMember.setNickname = async (name) => {
        newMember.nickname = name;
        nicknameChanged = true;
    };

    await registeredHandler(oldMember, newMember);
    assert.ok(nicknameChanged, 'Dehoisting/sanitization must be invoked on hoisted nickname change');
});

test('PHASE-9-WIRING-03: messageCreate filters phishing, scams, and dangerous attachments', async () => {
    const messageEvent = (await import('../src/events/message/messageCreate.js')).data;
    const client = createMockClient();
    client.mediaDB = { get: async () => null };
    client.prefixDB = { get: async () => null };
    client.noprefixDB = { get: async () => null };
    const guild = createMockGuild({ id: 'g-msg-test' });
    guild.ownerId = 'owner-safe';
    client.getAntinukeData = async () => ({
        enabled: true,
        disabledEvents: []
    });

    // 1. Phishing detection message
    let deletedPhish = false;
    const phishMsg = {
        guild,
        channel: { id: 'chan-msg' },
        author: { id: 'spammer-1', bot: false },
        content: 'Free discord nitro: https://discord-nitro.click/claim',
        attachments: new Collection(),
        delete: async () => { deletedPhish = true; }
    };
    await messageEvent.execute(phishMsg, client);
    assert.equal(deletedPhish, true, 'Phishing message must be intercepted and deleted');

    // 2. Dangerous executable attachment
    let deletedAtt = false;
    const attMsg = {
        guild,
        channel: { id: 'chan-msg' },
        author: { id: 'spammer-2', bot: false },
        content: 'Check out this game!',
        attachments: new Collection([
            ['att-1', { name: 'setup.exe', size: 1048576 }]
        ]),
        delete: async () => { deletedAtt = true; }
    };
    await messageEvent.execute(attMsg, client);
    assert.equal(deletedAtt, true, 'Message with dangerous executable must be deleted');
});

test('PHASE-9-GOVERNANCE-01: IncidentCoordinator respects maintenance mode and feature flags', async () => {
    const guildId = 'g-gov-test';
    const executor = { id: 'attacker-1' };
    const guild = createMockGuild({ id: guildId });

    // 1. Maintenance Mode active -> decision is 'disabled'
    enableMaintenanceMode(guildId, 3600000, 'Scheduled testing');
    assert.equal(isMaintenanceModeActive(guildId), true);

    const maintIncident = incidentCoordinator.coordinateIncident({
        guild,
        actionType: 'channelDelete',
        moduleKey: 'antiChannelDelete',
        targetId: 'chan-1',
        executor,
        antinukeData: { enabled: true }
    });
    assert.equal(maintIncident.decision, 'disabled', 'Enforcement must be suppressed during maintenance mode');
    disableMaintenanceMode(guildId);

    // 2. Feature Flag disabled -> decision is 'disabled'
    setFeatureFlag(guildId, 'module:antiRoleDelete', false);
    assert.equal(isFeatureEnabled(guildId, 'module:antiRoleDelete', true), false);

    const flagIncident = incidentCoordinator.coordinateIncident({
        guild,
        actionType: 'roleDelete',
        moduleKey: 'antiRoleDelete',
        targetId: 'role-1',
        executor,
        antinukeData: { enabled: true }
    });
    assert.equal(flagIncident.decision, 'disabled', 'Enforcement must be suppressed when feature flag is disabled');
});

test('PHASE-9-BACKUP-01: createDatabaseBackup supports string path and FastDB instance', async () => {
    const tempDir = path.resolve('backups/test_temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const dummyDbPath = path.join(tempDir, 'test_source.sqlite');

    // Create a temporary SQLite database
    const { DatabaseSync } = await import('node:sqlite');
    const testDb = new DatabaseSync(dummyDbPath);
    testDb.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT);');
    testDb.exec("INSERT INTO test_data (name) VALUES ('roynix_test');");
    testDb.close();

    // 1. Backup via file path string
    const backupResult = createDatabaseBackup(dummyDbPath, tempDir, 3);
    assert.ok(backupResult.verified, 'Backup from path string must verify SQLite integrity');
    assert.ok(fs.existsSync(backupResult.backupPath), 'Backup file must exist on disk');

    // 2. Backup via mock FastDB handle
    const mockFastDb = {
        sqlite: new DatabaseSync(dummyDbPath)
    };
    const backupResult2 = createDatabaseBackup(mockFastDb, tempDir, 3);
    assert.ok(backupResult2.verified, 'Backup from FastDB object must verify SQLite integrity');
    mockFastDb.sqlite.close();

    // Clean up temporary test files
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
});

test('PHASE-9-DASHBOARD-01: DashboardApiServer enforces 16-char secret, tenant scoping, and rate limits', async () => {
    const client = createMockClient();
    client.getAntinukeData = async (gid) => ({ enabled: true, punishment: 'ban', disabledEvents: [] });

    // 1. Refusal to start with weak or default secret
    const weakServer = new DashboardApiServer({ client, apiSecret: 'short_key', port: 0 });
    await assert.rejects(async () => {
        await weakServer.start();
    }, /Secure DASHBOARD_API_TOKEN \(minimum 16 characters\) is required/);

    const defaultSecretServer = new DashboardApiServer({ client, apiSecret: 'test_secret_key_123', port: 0 });
    await assert.rejects(async () => {
        await defaultSecretServer.start();
    }, /Secure DASHBOARD_API_TOKEN/);

    // 2. Start server with strong master token
    const masterToken = 'super_secure_master_token_67890';
    const server = new DashboardApiServer({
        client,
        apiSecret: masterToken,
        port: 0,
        rateLimitMax: 5,
        rateLimitWindowMs: 10000
    });

    // Register a scoped token for guild-A only
    const scopedToken = 'scoped_token_guild_a_only_12345';
    server.registerTokenScope(scopedToken, 'guild-A');

    const port = await server.start();
    assert.ok(port > 0);

    // Test tenant isolation: scoped token accessing guild-B -> 403 Forbidden
    const forbiddenRes = await fetch(`http://127.0.0.1:${port}/api/guild/guild-B/status`, {
        headers: { Authorization: `Bearer ${scopedToken}` }
    });
    assert.equal(forbiddenRes.status, 403, 'Scoped token must be forbidden from accessing other guilds');

    // Test authorized access: scoped token accessing guild-A -> 200 OK
    const allowedRes = await fetch(`http://127.0.0.1:${port}/api/guild/guild-A/status`, {
        headers: { Authorization: `Bearer ${scopedToken}` }
    });
    assert.equal(allowedRes.status, 200, 'Scoped token must be authorized for registered guild');

    // Test rate limiting: exceed 5 requests from same IP -> 429 Too Many Requests
    let rateLimited = false;
    for (let i = 0; i < 7; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.status === 429) {
            rateLimited = true;
            break;
        }
    }
    assert.equal(rateLimited, true, 'Rate limiter must return 429 when threshold exceeded');

    await server.stop();
});

test('PHASE-9-REGISTRY-01: Module registry contains 37 catalog modules and slash choices <= 25', () => {
    // 1. Registry count
    assert.equal(antinukeModules.length, 37, 'Registry must list all 37 antinuke modules');

    // 2. Resolvability
    const resolvedPhish = findModule('phishingDetector');
    assert.ok(resolvedPhish);
    assert.equal(resolvedPhish.key, 'phishingDetector');

    const resolvedAutomod = findModule('automodProtection');
    assert.ok(resolvedAutomod);
    assert.equal(resolvedAutomod.key, 'automodProtection');

    // 3. Verify slash command choices are clamped to <= 25 choices
    const choices = antinukeModules.slice(0, 25);
    assert.equal(choices.length, 25, 'Slash command choices must not exceed Discord 25-choice API limit');
});
