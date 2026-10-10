import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { FastDB } from '../src/utils/fastDb.js';
import { aggregateThreatMetrics } from '../src/services/reporting/threatAnalytics.js';
import { exportIncidentsToJSON, exportIncidentsToMarkdown } from '../src/services/reporting/incidentExporter.js';
import { createDatabaseBackup } from '../src/utils/backupService.js';
import { isFeatureEnabled, setFeatureFlag, clearFeatureFlags } from '../src/utils/featureFlagService.js';
import { enableMaintenanceMode, isMaintenanceModeActive, disableMaintenanceMode } from '../src/utils/maintenanceMode.js';
import { validateModuleDependencies } from '../src/utils/moduleDependencyValidator.js';
import { createMockClient, createMockGuild, createMockRole } from './fixtures/mockDiscord.js';

test('Phase 6 [ANALYTICS-01]: aggregateThreatMetrics computes module and severity distributions', () => {
    const incidents = [
        { moduleKey: 'antiChannelDelete', severity: 'HIGH', actorId: 'attacker-1', timestamp: Date.now() - 1000 },
        { moduleKey: 'antiChannelDelete', severity: 'HIGH', actorId: 'attacker-1', timestamp: Date.now() - 2000 },
        { moduleKey: 'antiRoleDelete', severity: 'CRITICAL', actorId: 'attacker-2', timestamp: Date.now() - 3000 },
        { moduleKey: 'antiSpam', severity: 'LOW', actorId: 'spammer-1', timestamp: Date.now() - 4000 }
    ];

    const metrics = aggregateThreatMetrics(incidents, 86400000);
    assert.equal(metrics.totalIncidents, 4);
    assert.equal(metrics.byModule.antiChannelDelete, 2);
    assert.equal(metrics.bySeverity.HIGH, 2);
    assert.equal(metrics.bySeverity.CRITICAL, 1);
    assert.equal(metrics.topActors[0].actorId, 'attacker-1');
    assert.equal(metrics.topActors[0].count, 2);
});

test('Phase 6 [EXPORT-01]: exportIncidentsToJSON and exportIncidentsToMarkdown generate sanitized reports', () => {
    const incidents = [
        {
            incidentId: 'inc-exp-1',
            guildId: 'guild-1',
            moduleKey: 'antiBan',
            actorId: 'bad-mod',
            severity: 'HIGH',
            actionTaken: 'Banned',
            createdAt: Date.now()
        }
    ];

    const jsonOut = exportIncidentsToJSON(incidents);
    const parsed = JSON.parse(jsonOut);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].moduleKey, 'antiBan');

    const mdOut = exportIncidentsToMarkdown(incidents);
    assert.ok(mdOut.includes('| antiBan | HIGH |'));
});

test('Phase 6 [BACKUP-01]: createDatabaseBackup creates verified SQLite backup and prunes old ones', () => {
    const tmpDir = path.join(process.cwd(), 'scratch_test_backup_' + Date.now());
    const backupsDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'source.sqlite');

    try {
        const db = new FastDB({ filePath: dbPath });
        db.set('test_key', { data: 'test_value' });
        db.flushSync();

        const res = createDatabaseBackup(db, backupsDir, 2);
        assert.ok(fs.existsSync(res.backupPath));
        assert.equal(res.verified, true);

        // Create 2 more backups to trigger pruning (retention limit 2)
        createDatabaseBackup(db, backupsDir, 2);
        createDatabaseBackup(db, backupsDir, 2);

        const remaining = fs.readdirSync(backupsDir).filter(f => f.endsWith('.sqlite'));
        assert.equal(remaining.length, 2, 'Must retain maximum 2 backups');

        db.close();
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Phase 6 [FLAGS-01]: featureFlagService manages dynamic flags per guild and globally', () => {
    clearFeatureFlags();
    assert.equal(isFeatureEnabled('g1', 'experimentalShield', false), false);

    setFeatureFlag('g1', 'experimentalShield', true);
    assert.equal(isFeatureEnabled('g1', 'experimentalShield', false), true);
    assert.equal(isFeatureEnabled('g2', 'experimentalShield', false), false); // Guild isolation

    // Global flag fallback
    setFeatureFlag('*', 'globalRateLimit', true);
    assert.equal(isFeatureEnabled('g3', 'globalRateLimit', false), true);
});

test('Phase 6 [MAINTENANCE-01]: maintenanceMode enables, checks active state, and expires', () => {
    const g = 'guild-maint-1';
    enableMaintenanceMode(g, 10000, 'Upgrading roles');
    assert.equal(isMaintenanceModeActive(g), true);

    disableMaintenanceMode(g);
    assert.equal(isMaintenanceModeActive(g), false);
});

test('Phase 6 [DEPENDENCY-01]: validateModuleDependencies validates required bot permissions', () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });

    // Bot with all permissions
    guild.members.me.permissions = new PermissionsBitField(
        PermissionFlagsBits.Administrator | PermissionFlagsBits.BanMembers | PermissionFlagsBits.ViewAuditLog
    );
    const validRes = validateModuleDependencies(guild, 'antiBan');
    assert.equal(validRes.valid, true);

    // Bot missing BanMembers
    guild.members.me.permissions = new PermissionsBitField(
        PermissionFlagsBits.ViewAuditLog
    );
    const invalidRes = validateModuleDependencies(guild, 'antiBan');
    assert.equal(invalidRes.valid, false);
    assert.ok(invalidRes.missing.includes('BanMembers'));
});
