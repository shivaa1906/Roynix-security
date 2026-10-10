import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField, AuditLogEvent } from 'discord.js';
import { checkChannelOverwrites } from '../src/security/detection/channelOverwriteProtection.js';
import { checkRolePosition } from '../src/security/detection/rolePositionProtection.js';
import { checkRolePermissionEscalation } from '../src/security/detection/permissionEscalation.js';
import { trackAndCheckMassAction } from '../src/security/detection/massActionDetector.js';
import { checkInviteCreate } from '../src/security/detection/inviteProtection.js';
import { checkAutomodRuleChange } from '../src/security/detection/automodProtection.js';
import { trackMemberJoin, isJoinRaidActive, clearJoinRaid } from '../src/services/raidDetection/joinRaidDetector.js';
import { screenAccountAge } from '../src/services/verification/accountAgeScreening.js';
import { evaluateAltRisk } from '../src/services/threatScoring/altDetector.js';
import { sanitizeNickname } from '../src/security/detection/nicknameProtection.js';
import { checkMemberTimeout } from '../src/security/detection/timeoutProtection.js';
import { createMockGuild, createMockRole, createMockChannel, createMockMember, createMockClient } from './fixtures/mockDiscord.js';

test('Phase 2 [OVERWRITE-01]: checkChannelOverwrites reverts dangerous perm additions from untrusted users', async () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });
    let reverted = false;

    client.getAntinukeData = async () => ({
        enabled: true,
        action: 'ban',
        extraOwners: []
    });

    // Mock audit log
    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            ['entry-1', {
                id: 'entry-1',
                action: AuditLogEvent.ChannelOverwriteUpdate,
                targetId: 'chan-1',
                executorId: 'attacker-1',
                executor: { id: 'attacker-1', bot: false },
                createdTimestamp: Date.now()
            }]
        ])
    });

    const oldChannel = createMockChannel({ id: 'chan-1', guild });
    const newChannel = createMockChannel({ id: 'chan-1', guild });

    // Old channel has empty overwrite
    oldChannel.permissionOverwrites.cache.set('role-public', {
        id: 'role-public',
        allow: new PermissionsBitField(0n),
        deny: new PermissionsBitField(0n)
    });

    // New channel has Administrator added
    newChannel.permissionOverwrites.cache.set('role-public', {
        id: 'role-public',
        allow: new PermissionsBitField(PermissionFlagsBits.Administrator),
        deny: new PermissionsBitField(0n)
    });

    newChannel.permissionOverwrites.set = async () => {
        reverted = true;
    };

    const handled = await checkChannelOverwrites(oldChannel, newChannel);
    assert.equal(handled, true, 'Dangerous overwrite addition must be handled');
    assert.equal(reverted, true, 'Overwrite must be reverted');
});

test('Phase 2 [ROLE-POS-01]: checkRolePosition reverts unauthorized role elevation', async () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });
    let revertedPosition = null;

    client.getAntinukeData = async () => ({
        enabled: true,
        action: 'ban'
    });

    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            ['entry-2', {
                id: 'entry-2',
                action: AuditLogEvent.RoleUpdate,
                targetId: 'role-elevated',
                executorId: 'attacker-2',
                executor: { id: 'attacker-2', bot: false },
                createdTimestamp: Date.now()
            }]
        ])
    });

    const oldRole = createMockRole({ id: 'role-elevated', position: 5, guild });
    const newRole = createMockRole({ id: 'role-elevated', position: 99, guild });

    newRole.setPosition = async (pos) => {
        revertedPosition = pos;
        return newRole;
    };

    const handled = await checkRolePosition(oldRole, newRole);
    assert.equal(handled, true);
    assert.equal(revertedPosition, 5, 'Role must be repositioned back to 5');
});

test('Phase 2 [PERM-ESC-01]: checkRolePermissionEscalation reverts Administrator addition to role', async () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });
    let revertedPerms = null;

    client.getAntinukeData = async () => ({
        enabled: true,
        action: 'ban'
    });

    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            ['entry-3', {
                id: 'entry-3',
                action: AuditLogEvent.RoleUpdate,
                targetId: 'role-target',
                executorId: 'attacker-3',
                executor: { id: 'attacker-3', bot: false },
                createdTimestamp: Date.now()
            }]
        ])
    });

    const oldRole = createMockRole({ id: 'role-target', permissions: 0n, guild });
    const newRole = createMockRole({ id: 'role-target', permissions: PermissionFlagsBits.Administrator, guild });

    newRole.setPermissions = async (perms) => {
        revertedPerms = perms;
        return newRole;
    };

    const handled = await checkRolePermissionEscalation(oldRole, newRole);
    assert.equal(handled, true);
    assert.equal(BigInt(revertedPerms.bitfield), 0n, 'Permissions must be reverted back to 0n');
});

test('Phase 2 [MASS-ACT-01]: trackAndCheckMassAction detects rapid action burst', () => {
    const g = 'guild-mass';
    const actor = 'attacker-rapid';

    const r1 = trackAndCheckMassAction(g, 'massBan', actor, 3, 5000);
    assert.equal(r1.tripped, false);
    assert.equal(r1.count, 1);

    const r2 = trackAndCheckMassAction(g, 'massBan', actor, 3, 5000);
    assert.equal(r2.tripped, false);
    assert.equal(r2.count, 2);

    const r3 = trackAndCheckMassAction(g, 'massBan', actor, 3, 5000);
    assert.equal(r3.tripped, true);
    assert.equal(r3.count, 3);
});

test('Phase 2 [INVITE-01]: checkInviteCreate deletes unauthorized invite', async () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });
    let deleted = false;

    client.getAntinukeData = async () => ({
        enabled: true,
        action: 'ban'
    });

    const invite = {
        code: 'discord123',
        guild,
        inviter: { id: 'untrusted-user-1', bot: false },
        delete: async () => { deleted = true; }
    };

    const handled = await checkInviteCreate(invite);
    assert.equal(handled, true);
    assert.equal(deleted, true, 'Unauthorized invite must be deleted');
});

test('Phase 2 [AUTOMOD-01]: checkAutomodRuleChange catches rule deletion from untrusted user', async () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });

    client.getAntinukeData = async () => ({
        enabled: true,
        action: 'ban'
    });

    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            ['entry-automod', {
                id: 'entry-automod',
                action: 142, // AutoModerationRuleDelete
                targetId: 'rule-1',
                executorId: 'attacker-automod',
                executor: { id: 'attacker-automod', bot: false },
                createdTimestamp: Date.now()
            }]
        ])
    });

    const rule = {
        id: 'rule-1',
        name: 'Spam Filter',
        guild
    };

    const handled = await checkAutomodRuleChange(rule, 'delete');
    assert.equal(handled, true, 'Automod rule deletion should trigger incident coordination');
});

test('Phase 2 [RAID-JOIN-01]: trackMemberJoin and screenAccountAge enforce join protections', () => {
    clearJoinRaid('guild-raid-test');
    for (let i = 0; i < 9; i++) {
        const res = trackMemberJoin('guild-raid-test', 10, 5000);
        assert.equal(res.isRaid, false);
    }
    const res10 = trackMemberJoin('guild-raid-test', 10, 5000);
    assert.equal(res10.isRaid, true, '10th join within window must trip raid mode');
    assert.equal(isJoinRaidActive('guild-raid-test'), true);

    // Account age screening
    const youngMember = { user: { createdTimestamp: Date.now() - 3600000 } }; // 1 hour old
    const oldMember = { user: { createdTimestamp: Date.now() - 7 * 24 * 3600000 } }; // 7 days old

    assert.equal(screenAccountAge(youngMember, 1440).action, 'restrict');
    assert.equal(screenAccountAge(oldMember, 1440).action, 'allow');
});

test('Phase 2 [ALT-RISK-01]: evaluateAltRisk correctly scores multi-signal alt accounts', () => {
    const freshAlt = {
        user: {
            createdTimestamp: Date.now() - 3600000, // 1h old (+40)
            avatar: null, // default avatar (+20)
            username: 'user889412' // random digits (+15)
        }
    };

    const altResult = evaluateAltRisk(freshAlt, { isJoinRaid: true });
    assert.equal(altResult.riskScore, 100); // 40 + 20 + 15 + 25 = 100
    assert.equal(altResult.riskTier, 'CRITICAL');
    assert.equal(altResult.factors.length, 4);
});

test('Phase 2 [DEHOIST-01]: sanitizeNickname strips hoist characters from nickname', async () => {
    let newName = null;
    const member = {
        manageable: true,
        nickname: '! ! Z-Attacker',
        user: { username: 'attacker' },
        setNickname: async (n) => { newName = n; }
    };

    const res = await sanitizeNickname(member);
    assert.equal(res.dehoisted, true);
    assert.equal(newName, 'Z-Attacker');
});

test('Phase 2 [TIMEOUT-01]: checkMemberTimeout clears unauthorized timeout', async () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });
    let clearedTimeout = false;

    client.getAntinukeData = async () => ({
        enabled: true,
        action: 'ban'
    });

    guild.fetchAuditLogs = async () => ({
        entries: new Map([
            ['entry-timeout', {
                id: 'entry-timeout',
                action: AuditLogEvent.MemberUpdate,
                targetId: 'victim-1',
                executorId: 'rogue-mod-1',
                executor: { id: 'rogue-mod-1', bot: false },
                createdTimestamp: Date.now()
            }]
        ])
    });

    const oldMember = createMockMember({ id: 'victim-1', guild, communicationDisabledUntil: null });
    const newMember = createMockMember({ id: 'victim-1', guild, communicationDisabledUntil: new Date(Date.now() + 60000) });

    newMember.timeout = async (ms) => {
        if (ms === null) clearedTimeout = true;
    };

    const handled = await checkMemberTimeout(oldMember, newMember);
    assert.equal(handled, true);
    assert.equal(clearedTimeout, true, 'Timeout must be cleared');
});
