import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { calculateIncidentSeverity } from '../src/services/threatScoring/severityScorer.js';
import { registerBotTrust, getBotTrust, revokeBotTrust } from '../src/services/botTrust/botTrustRegistry.js';
import { calculateBotRisk } from '../src/services/botTrust/botRiskScorer.js';
import { applyLockdownProfile, restoreLockdownProfile } from '../src/services/lockdown/lockdownProfiles.js';
import { recordTimelineEvent, getIncidentTimeline } from '../src/services/incidents/incidentTimeline.js';
import { executePlaybooks } from '../src/services/incidents/playbookEngine.js';
import { createMockClient, createMockGuild, createMockRole } from './fixtures/mockDiscord.js';

test('Phase 4 [SEVERITY-01]: calculateIncidentSeverity evaluates dynamic severity levels', () => {
    assert.equal(calculateIncidentSeverity({ isRaid: true }), 'CRITICAL');
    assert.equal(calculateIncidentSeverity({ velocityCount: 3 }), 'CRITICAL');
    assert.equal(calculateIncidentSeverity({ hasAdminEscalation: true }), 'CRITICAL');
    assert.equal(calculateIncidentSeverity({ moduleKey: 'antiChannelDelete', velocityCount: 1 }), 'HIGH');
    assert.equal(calculateIncidentSeverity({ moduleKey: 'antiChannelCreate', velocityCount: 1 }), 'MEDIUM');
    assert.equal(calculateIncidentSeverity({ moduleKey: 'antiEmojiCreate' }), 'LOW');
});

test('Phase 4 [BOT-TRUST-01]: botTrustRegistry manages granular bot trust and expiration', () => {
    const g = 'guild-trust-1';
    const b = 'bot-music-1';

    // Register permanent trust
    registerBotTrust(g, b, { allowedPermissions: 1024n, reviewStatus: 'verified' });
    const t1 = getBotTrust(g, b);
    assert.ok(t1);
    assert.equal(t1.reviewStatus, 'verified');

    // Register temporary trust with past expiration
    registerBotTrust(g, 'bot-temp-expired', { expiresAt: Date.now() - 5000 });
    assert.equal(getBotTrust(g, 'bot-temp-expired'), null, 'Expired trust must return null');

    // Revoke trust
    revokeBotTrust(g, b);
    assert.equal(getBotTrust(g, b), null, 'Revoked trust must return null');
});

test('Phase 4 [BOT-RISK-01]: calculateBotRisk scores bot permissions accurately', () => {
    const highRiskBot = {
        user: { bot: true },
        permissions: new PermissionsBitField(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles)
    };
    const lowRiskBot = {
        user: { bot: true },
        permissions: new PermissionsBitField(PermissionFlagsBits.SendMessages)
    };

    const highRes = calculateBotRisk(highRiskBot);
    assert.equal(highRes.riskScore, 100);
    assert.equal(highRes.riskTier, 'CRITICAL');

    const lowRes = calculateBotRisk(lowRiskBot);
    assert.equal(lowRes.riskScore, 0);
    assert.equal(lowRes.riskTier, 'LOW');
});

test('Phase 4 [LOCKDOWN-01]: applyLockdownProfile and restoreLockdownProfile cycle safely', async () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });

    const initialPerms = PermissionFlagsBits.SendMessages | PermissionFlagsBits.AddReactions | PermissionFlagsBits.ViewChannel;
    guild.roles.everyone = createMockRole({ id: guild.id, permissions: initialPerms, guild });
    guild.verificationLevel = 1;

    // Apply strict lockdown
    const lockRes = await applyLockdownProfile(guild, 'STRICT');
    assert.equal(lockRes.applied, true);

    const lockedBits = BigInt(guild.roles.everyone.permissions.bitfield);
    assert.equal((lockedBits & BigInt(PermissionFlagsBits.SendMessages)) === 0n, true, 'SendMessages must be denied');

    // Restore lockdown
    const restoreRes = await restoreLockdownProfile(guild);
    assert.equal(restoreRes.restored, true);

    const restoredBits = BigInt(guild.roles.everyone.permissions.bitfield);
    assert.equal((restoredBits & BigInt(PermissionFlagsBits.SendMessages)) !== 0n, true, 'SendMessages must be restored');
});

test('Phase 4 [TIMELINE-01]: recordTimelineEvent preserves microsecond chronology', () => {
    const incId = 'inc-timeline-test-1';
    recordTimelineEvent(incId, { type: 'detection', details: 'Detected mass role delete' });
    recordTimelineEvent(incId, { type: 'containment', details: 'Attacker banned' });
    recordTimelineEvent(incId, { type: 'recovery', details: 'Role restored' });

    const timeline = getIncidentTimeline(incId);
    assert.equal(timeline.length, 3);
    assert.equal(timeline[0].type, 'detection');
    assert.equal(timeline[1].type, 'containment');
    assert.equal(timeline[2].type, 'recovery');
});

test('Phase 4 [PLAYBOOK-01]: executePlaybooks triggers containment actions on CRITICAL incident', async () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });
    guild.roles.everyone = createMockRole({ id: guild.id, permissions: PermissionFlagsBits.SendMessages, guild });

    const incident = {
        incidentId: 'inc-playbook-1',
        severity: 'CRITICAL',
        isRaid: true
    };

    const res = await executePlaybooks(guild, incident);
    assert.ok(res.executedPlaybooks.includes('Mass Raid Containment'));
    assert.ok(res.actionsTaken.includes('applied_strict_lockdown'));
});
