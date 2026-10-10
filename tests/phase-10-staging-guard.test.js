import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isStagingMode, getStagingGuildId, isStagingActionAllowed, validateStagingPrerequisites } from '../src/utils/stagingGuard.js';
import { incidentCoordinator } from '../src/utils/incidentCoordinator.js';
import { punishExecutor } from '../src/utils/punishExecutor.js';
import { runMigrations } from '../src/utils/migrationManager.js';
import { createDatabaseBackup } from '../src/utils/backupService.js';
import { DashboardApiServer } from '../src/dashboard/dashboardApi.js';
import { createMockClient, createMockGuild } from './fixtures/mockDiscord.js';

test('STAGE-GUARD-01: In production mode, staging guard allows all guilds', () => {
    const origEnv = process.env.NODE_ENV;
    const origStagingMode = process.env.STAGING_MODE;
    delete process.env.NODE_ENV;
    delete process.env.STAGING_MODE;

    try {
        assert.equal(isStagingMode(), false);
        const check = isStagingActionAllowed('guild-prod-123');
        assert.equal(check.allowed, true);
        assert.equal(check.reason, 'production_mode');
    } finally {
        process.env.NODE_ENV = origEnv;
        process.env.STAGING_MODE = origStagingMode;
    }
});

test('STAGE-GUARD-02: In staging mode, missing STAGING_GUILD_ID blocks all destructive actions', () => {
    const origEnv = process.env.NODE_ENV;
    const origStagingGuild = process.env.STAGING_GUILD_ID;
    process.env.NODE_ENV = 'staging';
    delete process.env.STAGING_GUILD_ID;

    try {
        assert.equal(isStagingMode(), true);
        const check = isStagingActionAllowed('guild-any');
        assert.equal(check.allowed, false);
        assert.ok(check.reason.includes('STAGING_GUILD_ID is not configured'));
    } finally {
        process.env.NODE_ENV = origEnv;
        process.env.STAGING_GUILD_ID = origStagingGuild;
    }
});

test('STAGE-GUARD-03: In staging mode, only the explicit STAGING_GUILD_ID is allowed', () => {
    const origEnv = process.env.NODE_ENV;
    const origStagingGuild = process.env.STAGING_GUILD_ID;
    process.env.NODE_ENV = 'staging';
    process.env.STAGING_GUILD_ID = 'staging-guild-777';

    try {
        // Authorized staging guild
        const allowedCheck = isStagingActionAllowed('staging-guild-777');
        assert.equal(allowedCheck.allowed, true);
        assert.equal(allowedCheck.reason, 'staging_guild_authorized');

        // Other / production guild must be blocked
        const blockedCheck = isStagingActionAllowed('production-guild-999');
        assert.equal(blockedCheck.allowed, false);
        assert.ok(blockedCheck.reason.includes('is not the authorized staging guild'));
    } finally {
        process.env.NODE_ENV = origEnv;
        process.env.STAGING_GUILD_ID = origStagingGuild;
    }
});

test('STAGE-GUARD-04: validateStagingPrerequisites reports missing staging credentials', () => {
    const origStagingToken = process.env.STAGING_DISCORD_TOKEN;
    const origStagingGuild = process.env.STAGING_GUILD_ID;
    delete process.env.STAGING_DISCORD_TOKEN;
    delete process.env.STAGING_GUILD_ID;

    try {
        const val = validateStagingPrerequisites();
        assert.equal(val.ready, false);
        assert.ok(val.missing.includes('STAGING_DISCORD_TOKEN'));
        assert.ok(val.missing.includes('STAGING_GUILD_ID'));
    } finally {
        process.env.STAGING_DISCORD_TOKEN = origStagingToken;
        process.env.STAGING_GUILD_ID = origStagingGuild;
    }
});

test('STAGE-GUARD-05: IncidentCoordinator and punishExecutor respect staging guard', async () => {
    const origEnv = process.env.NODE_ENV;
    const origStagingGuild = process.env.STAGING_GUILD_ID;
    process.env.NODE_ENV = 'staging';
    process.env.STAGING_GUILD_ID = 'allowed-sandbox-guild';

    try {
        const prodGuild = createMockGuild({ id: 'unauthorized-prod-guild' });
        const executor = { id: 'attacker-1' };

        // 1. IncidentCoordinator on unauthorized guild returns disabled
        const incident = incidentCoordinator.coordinateIncident({
            guild: prodGuild,
            actionType: 'channelDelete',
            moduleKey: 'antiChannelDelete',
            targetId: 'chan-1',
            executor,
            antinukeData: { enabled: true }
        });
        assert.equal(incident.decision, 'disabled');

        // 2. punishExecutor on unauthorized guild returns No Action
        const outcome = await punishExecutor(prodGuild, executor, 'ban');
        assert.equal(outcome, 'No Action');
    } finally {
        process.env.NODE_ENV = origEnv;
        process.env.STAGING_GUILD_ID = origStagingGuild;
    }
});

test('STAGE-GUARD-06: Database migration idempotency on disposable data', () => {
    const tempDir = path.resolve('backups/test_temp_stage');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const dummyDbPath = path.join(tempDir, 'disposable_migration.sqlite');
    if (fs.existsSync(dummyDbPath)) fs.unlinkSync(dummyDbPath);

    try {
        const dummyDb = { sqlite: new DatabaseSync(dummyDbPath) };
        const initial = runMigrations(dummyDb);
        assert.ok(initial.applied.length > 0, 'First run must apply migrations');

        // Second run must apply 0 migrations (idempotent)
        const second = runMigrations(dummyDb);
        assert.equal(second.applied.length, 0, 'Second run must apply 0 migrations');
        dummyDb.sqlite.close();
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('STAGE-GUARD-07: Backup and restore integrity on disposable data', () => {
    const tempDir = path.resolve('backups/test_temp_stage_bk');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const sourceDbPath = path.join(tempDir, 'source.sqlite');

    try {
        const sourceDb = new DatabaseSync(sourceDbPath);
        sourceDb.exec('CREATE TABLE sample (id INT PRIMARY KEY, val TEXT);');
        sourceDb.exec("INSERT INTO sample (id, val) VALUES (1, 'staging_test');");
        sourceDb.close();

        // Perform backup
        const backupRes = createDatabaseBackup(sourceDbPath, tempDir, 2);
        assert.ok(backupRes.verified, 'Backup must verify SQLite integrity');
        assert.ok(fs.existsSync(backupRes.backupPath));

        // Restore verification
        const restoreTestDb = new DatabaseSync(backupRes.backupPath);
        const row = restoreTestDb.prepare('SELECT val FROM sample WHERE id = 1;').get();
        assert.equal(row.val, 'staging_test');
        restoreTestDb.close();
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('STAGE-GUARD-08: Dashboard API rejects weak secrets and isolates guild tenants', async () => {
    const client = createMockClient();
    client.getAntinukeData = async (gid) => ({ enabled: true, punishment: 'ban', disabledEvents: [] });

    // Refusal with hardcoded secret
    const weakServer = new DashboardApiServer({ client, apiSecret: 'test_secret_key_123', port: 0 });
    await assert.rejects(async () => {
        await weakServer.start();
    }, /Secure DASHBOARD_API_TOKEN/);

    // Ephemeral server with strong secret
    const masterSecret = 'strong_test_secret_for_stage_123';
    const server = new DashboardApiServer({ client, apiSecret: masterSecret, port: 0 });
    server.registerTokenScope('token_guild_x', 'guild-x');
    const port = await server.start();

    try {
        // Cross-guild access check
        const res = await fetch(`http://127.0.0.1:${port}/api/guild/guild-y/status`, {
            headers: { Authorization: 'Bearer token_guild_x' }
        });
        assert.equal(res.status, 403, 'Cross-guild access must be 403');
    } finally {
        await server.stop();
    }
});

test('STAGE-GUARD-09: CircuitBreaker, quarantineGuildBots, and lockdownProfiles honor staging guard', async () => {
    const origEnv = process.env.NODE_ENV;
    const origStagingGuild = process.env.STAGING_GUILD_ID;
    process.env.NODE_ENV = 'staging';
    process.env.STAGING_GUILD_ID = 'authorized-staging-guild';

    try {
        const prodGuild = createMockGuild({ id: 'unauthorized-prod-guild' });
        const { circuitBreaker } = await import('../src/utils/circuitBreaker.js');
        const { quarantineGuildBots } = await import('../src/antinuke/zeroTrustQuarantine.js');
        const { applyLockdownProfile } = await import('../src/services/lockdown/lockdownProfiles.js');

        // 1. CircuitBreaker tripBreaker returns false on unauthorized guild
        const cbResult = await circuitBreaker.tripBreaker(prodGuild, createMockClient(), {}, 'Test Raid', { id: 'u-1' });
        assert.equal(cbResult, false, 'tripBreaker must return false on unauthorized guild in staging');

        // 2. quarantineGuildBots returns 0 on unauthorized guild
        const qCount = await quarantineGuildBots(prodGuild, createMockClient());
        assert.equal(qCount, 0, 'quarantineGuildBots must return 0 on unauthorized guild in staging');

        // 3. applyLockdownProfile returns applied: false on unauthorized guild
        const lockRes = await applyLockdownProfile(prodGuild, 'STRICT');
        assert.equal(lockRes.applied, false, 'applyLockdownProfile must not apply on unauthorized guild in staging');
    } finally {
        process.env.NODE_ENV = origEnv;
        process.env.STAGING_GUILD_ID = origStagingGuild;
    }
});

test('STAGE-GUARD-10: BlueprintManager restoreChannelHierarchical and restoreRole honor staging guard', async () => {
    const origEnv = process.env.NODE_ENV;
    const origStagingGuild = process.env.STAGING_GUILD_ID;
    process.env.NODE_ENV = 'staging';
    process.env.STAGING_GUILD_ID = 'authorized-staging-guild';

    try {
        const prodGuild = createMockGuild({ id: 'unauthorized-prod-guild' });
        const { blueprintManager } = await import('../src/utils/blueprintManager.js');

        // 1. restoreChannelHierarchical returns false on unauthorized guild
        const chanRestored = await blueprintManager.restoreChannelHierarchical(prodGuild, { id: 'c-fake', type: 0 });
        assert.equal(chanRestored, false, 'restoreChannelHierarchical must return false on unauthorized guild');

        // 2. restoreRole returns false on unauthorized guild
        const roleRestored = await blueprintManager.restoreRole(prodGuild, { id: 'r-fake' });
        assert.equal(roleRestored, false, 'restoreRole must return false on unauthorized guild');
    } finally {
        process.env.NODE_ENV = origEnv;
        process.env.STAGING_GUILD_ID = origStagingGuild;
    }
});

test('STAGE-GUARD-11: Conflicting environment settings fail closed to staging mode', () => {
    const origEnv = process.env.NODE_ENV;
    const origStagingMode = process.env.STAGING_MODE;

    try {
        // Conflicting: NODE_ENV says production, but STAGING_MODE says true
        process.env.NODE_ENV = 'production';
        process.env.STAGING_MODE = 'true';
        assert.equal(isStagingMode(), true, 'Must fail-closed and treat mode as staging when STAGING_MODE is true');

        // Conflicting: NODE_ENV says staging, STAGING_MODE says false
        process.env.NODE_ENV = 'staging';
        process.env.STAGING_MODE = 'false';
        assert.equal(isStagingMode(), true, 'Must fail-closed and treat mode as staging when NODE_ENV is staging');
    } finally {
        process.env.NODE_ENV = origEnv;
        process.env.STAGING_MODE = origStagingMode;
    }
});

test('STAGE-GUARD-12: Roynix.start() rejects startup when staging prerequisites are missing', async () => {
    const origEnv = process.env.NODE_ENV;
    const origStagingToken = process.env.STAGING_DISCORD_TOKEN;
    const origStagingGuild = process.env.STAGING_GUILD_ID;

    process.env.NODE_ENV = 'staging';
    delete process.env.STAGING_DISCORD_TOKEN;
    delete process.env.STAGING_GUILD_ID;

    try {
        const { Roynix } = await import('../src/base/Roynix.js');
        const client = new Roynix();
        await assert.rejects(async () => {
            await client.start();
        }, /Staging startup aborted/i);
    } finally {
        process.env.NODE_ENV = origEnv;
        process.env.STAGING_DISCORD_TOKEN = origStagingToken;
        process.env.STAGING_GUILD_ID = origStagingGuild;
    }
});

test('STAGE-GUARD-13: incidentCoordinator.executeRecovery and executePunishment fail-closed on unauthorized guilds in staging mode', async () => {
    const origEnv = process.env.NODE_ENV;
    const origStagingGuild = process.env.STAGING_GUILD_ID;
    process.env.NODE_ENV = 'staging';
    process.env.STAGING_GUILD_ID = 'staging-guild-777';

    try {
        let recoveryExecuted = false;
        const fakeIncident = {
            guildId: 'production-guild-999',
            decision: 'enforce',
            recovery: { status: 'idle', attempts: 0, result: null }
        };

        const res = await incidentCoordinator.executeRecovery(fakeIncident, async () => {
            recoveryExecuted = true;
            return true;
        });

        assert.equal(res, false, 'Recovery must return false when guild is not authorized staging guild');
        assert.equal(recoveryExecuted, false, 'Recovery function must never be invoked for unauthorized guild');

        let punishExecuted = false;
        const punishRes = await incidentCoordinator.executePunishment({
            guildId: 'production-guild-999',
            executorId: 'user-untrusted-1',
            executeFn: async () => {
                punishExecuted = true;
                return 'Banned';
            }
        });

        assert.equal(punishRes, 'No Action', 'Punishment must return No Action for unauthorized guild');
        assert.equal(punishExecuted, false, 'Punishment function must never be executed for unauthorized guild');
    } finally {
        process.env.NODE_ENV = origEnv;
        process.env.STAGING_GUILD_ID = origStagingGuild;
    }
});

test('STAGE-GUARD-14: Minimum staging permissions bitfield matches planned 14 tests without Administrator', async () => {
    const { PermissionFlagsBits } = await import('discord.js');
    const requiredBits = [
        'ViewAuditLog',
        'ManageGuild',
        'ManageRoles',
        'ManageChannels',
        'KickMembers',
        'BanMembers',
        'ModerateMembers',
        'ManageNicknames',
        'ViewChannel',
        'SendMessages',
        'EmbedLinks',
        'ManageMessages',
        'ReadMessageHistory'
    ];
    let bitfield = 0n;
    for (const p of requiredBits) {
        bitfield |= PermissionFlagsBits[p];
    }
    assert.equal(bitfield.toString(), '1099914374326');
    assert.equal((bitfield & PermissionFlagsBits.Administrator), 0n, 'Administrator bit must NOT be included in minimum permission set');
});
