import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { simulateRecoveryDryRun } from '../src/services/recovery/recoveryDryRun.js';
import { vaultIncidentEvidence, verifyEvidenceIntegrity, getVaultedEvidence } from '../src/services/incidents/evidenceVault.js';
import { simulateSecurityPolicy } from '../src/services/policies/policySimulator.js';
import { grantTemporaryTrust, hasActiveTemporaryTrust, revokeTemporaryTrust } from '../src/services/trust/temporaryTrustManager.js';
import { auditLeastPrivilege } from '../src/services/trust/leastPrivilegeAuditor.js';
import { createMockClient, createMockGuild, createMockRole } from './fixtures/mockDiscord.js';

test('Phase 5 [DRY-RUN-01]: simulateRecoveryDryRun identifies missing resources without making API calls', () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });

    // Guild currently has no channels or extra roles
    const snapshot = {
        channels: [
            { id: 'chan-lost-1', name: 'general', type: 0 },
            { id: 'chan-lost-2', name: 'announcements', type: 0 }
        ],
        roles: [
            { id: 'role-lost-1', name: 'Moderator', position: 10, permissions: 8n }
        ]
    };

    const preview = simulateRecoveryDryRun(guild, snapshot);
    assert.equal(preview.totalPlanned, 3);
    assert.equal(preview.plannedChannels.length, 2);
    assert.equal(preview.plannedRoles.length, 1);
});

test('Phase 5 [VAULT-01]: vaultIncidentEvidence hashes and verifies tamper-evident payloads', () => {
    const incId = 'inc-vault-1';
    const payload = {
        targetId: 'chan-123',
        attackerId: 'user-bad',
        action: 'ChannelDelete',
        timestamp: 1700000000000
    };

    const { hash } = vaultIncidentEvidence(incId, payload);
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64, 'SHA-256 hash must be 64 hex characters');

    // Verification with exact same payload
    const checkValid = verifyEvidenceIntegrity(incId, payload);
    assert.equal(checkValid.valid, true);

    // Verification with tampered payload
    const tampered = { ...payload, attackerId: 'innocent-user' };
    const checkTampered = verifyEvidenceIntegrity(incId, tampered);
    assert.equal(checkTampered.valid, false, 'Tampered payload must fail integrity check');
});

test('Phase 5 [SIMULATOR-01]: simulateSecurityPolicy previews enforcement without modifying guild', () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });
    const antinukeData = {
        enabled: true,
        action: 'ban',
        whitelisted: {}
    };

    // Untrusted actor should predict enforce
    const simUntrusted = simulateSecurityPolicy({
        guild,
        antinukeData,
        moduleKey: 'antiChannelDelete',
        executorId: 'random-untrusted-actor'
    });
    assert.equal(simUntrusted.predictedDecision, 'enforce');
    assert.equal(simUntrusted.predictedPunishment, 'ban');
    assert.equal(simUntrusted.severity, 'HIGH');

    // Guild owner should predict exempt
    const simOwner = simulateSecurityPolicy({
        guild,
        antinukeData,
        moduleKey: 'antiChannelDelete',
        executorId: guild.ownerId
    });
    assert.equal(simOwner.predictedDecision, 'exempt');
    assert.equal(simOwner.predictedPunishment, 'none');
});

test('Phase 5 [TEMP-TRUST-01]: temporaryTrustManager manages duration-based trust', () => {
    const g = 'guild-temp-trust';
    const u = 'user-helper';

    grantTemporaryTrust(g, u, { durationMs: 10000, moduleKey: 'antiChannelCreate' });
    assert.equal(hasActiveTemporaryTrust(g, u, 'antiChannelCreate'), true);
    assert.equal(hasActiveTemporaryTrust(g, u, 'antiRoleCreate'), false); // Different module

    // Revoke
    revokeTemporaryTrust(g, u);
    assert.equal(hasActiveTemporaryTrust(g, u, 'antiChannelCreate'), false);
});

test('Phase 5 [LEAST-PRIV-01]: auditLeastPrivilege flags over-privileged roles with excessive members', () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });

    const dangerousRole = createMockRole({
        id: 'r-admin-mass',
        name: 'VIP Admin',
        permissions: PermissionFlagsBits.Administrator,
        guild
    });
    dangerousRole.members = new Map([
        ['m1', {}], ['m2', {}], ['m3', {}], ['m4', {}], ['m5', {}], ['m6', {}]
    ]); // 6 members > max 5

    guild.roles.cache.set(dangerousRole.id, dangerousRole);

    const audit = auditLeastPrivilege(guild, { maxAdminMembers: 5 });
    assert.equal(audit.compliant, false);
    assert.equal(audit.findings.length, 1);
    assert.ok(audit.findings[0].issue.includes('assigned to 6 members'));
});
