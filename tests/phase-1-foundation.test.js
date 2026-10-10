import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FastDB } from '../src/utils/fastDb.js';
import { runMigrations, MIGRATIONS } from '../src/utils/migrationManager.js';
import { evaluateActorTrust, isValidModuleKey, KNOWN_MODULE_KEYS } from '../src/utils/securityPolicy.js';

test('Phase 1 [MIGRATION-01]: runMigrations applies V1 and V2 sequentially and idempotently', () => {
    const tmpDir = path.join(process.cwd(), 'scratch_test_phase1_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'test_migrations.sqlite');

    try {
        const db = new FastDB({ filePath: dbPath });
        const res1 = runMigrations(db);
        assert.equal(res1.currentVersion, 2, 'Migration should advance to version 2');
        assert.equal(res1.applied.length, 2, 'Two migrations should be applied initially');

        // Re-running migrations should be an idempotent no-op
        const res2 = runMigrations(db);
        assert.equal(res2.currentVersion, 2, 'Current version remains 2');
        assert.equal(res2.applied.length, 0, 'No migrations applied on second run');

        // Verify tables exist
        const tables = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
        assert.ok(tables.includes('schema_migrations'), 'schema_migrations table must exist');
        assert.ok(tables.includes('security_incidents'), 'security_incidents table must exist');
        assert.ok(tables.includes('temporary_trust'), 'temporary_trust table must exist');
        assert.ok(tables.includes('bot_trust_registry'), 'bot_trust_registry table must exist');
        assert.ok(tables.includes('security_feature_flags'), 'security_feature_flags table must exist');
        assert.ok(tables.includes('security_evidence_vault'), 'security_evidence_vault table must exist');

        db.close();
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('Phase 1 [POLICY-01]: KNOWN_MODULE_KEYS contains catalog modules and temporary trust is evaluated', () => {
    assert.ok(isValidModuleKey('channelOverwriteProtection'), 'channelOverwriteProtection must be valid');
    assert.ok(isValidModuleKey('massBan'), 'massBan must be valid');
    assert.ok(isValidModuleKey('antiSpam'), 'antiSpam must be valid');
    assert.ok(isValidModuleKey('voiceSecurity'), 'voiceSecurity must be valid');

    // Test temporary trust evaluation
    const guild = { id: 'g1', ownerId: 'owner-1' };
    const antinukeData = {
        enabled: true,
        temporaryTrust: {
            'temp-user-1': {
                moduleKey: '*',
                expiresAt: Date.now() + 60000
            },
            'temp-user-expired': {
                moduleKey: '*',
                expiresAt: Date.now() - 1000
            },
            'temp-user-channel': {
                moduleKey: 'antiChannelDelete',
                expiresAt: Date.now() + 60000
            }
        }
    };

    // Valid global temporary trust
    const resValid = evaluateActorTrust({
        guild,
        antinukeData,
        executorId: 'temp-user-1',
        moduleKey: 'antiChannelDelete'
    });
    assert.equal(resValid.isExempt, true);
    assert.equal(resValid.reason, 'temporary_trust');

    // Expired temporary trust must NOT exempt
    const resExpired = evaluateActorTrust({
        guild,
        antinukeData,
        executorId: 'temp-user-expired',
        moduleKey: 'antiChannelDelete'
    });
    assert.equal(resExpired.isExempt, false);
    assert.equal(resExpired.trustState, 'untrusted');

    // Module-specific temporary trust
    const resMatchingModule = evaluateActorTrust({
        guild,
        antinukeData,
        executorId: 'temp-user-channel',
        moduleKey: 'antiChannelDelete'
    });
    assert.equal(resMatchingModule.isExempt, true);

    const resMismatchedModule = evaluateActorTrust({
        guild,
        antinukeData,
        executorId: 'temp-user-channel',
        moduleKey: 'antiRoleDelete'
    });
    assert.equal(resMismatchedModule.isExempt, false);
    assert.equal(resMismatchedModule.trustState, 'untrusted');
});
