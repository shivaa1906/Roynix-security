import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getSecurityTemplate, TEMPLATES } from '../src/services/policies/securityTemplates.js';
import { calculateExplainableScore } from '../src/services/threatScoring/explainableScorer.js';
import { recordModeratorAction, detectModeratorAnomaly } from '../src/services/threatScoring/anomalyDetector.js';
import { generateSecurityRecommendations } from '../src/services/reporting/recommendationEngine.js';
import { DashboardApiServer } from '../src/dashboard/dashboardApi.js';
import { createMockClient, createMockGuild } from './fixtures/mockDiscord.js';

test('Phase 7 [TEMPLATE-01]: getSecurityTemplate retrieves valid configuration profiles', () => {
    const maxDef = getSecurityTemplate('maximum-defense');
    assert.ok(maxDef);
    assert.equal(maxDef.config.action, 'ban');
    assert.equal(maxDef.config.thresholds.massBan.limit, 2);

    const devRel = getSecurityTemplate('developer_relaxed');
    assert.ok(devRel);
    assert.ok(devRel.config.disabledEvents.includes('antiBot'));
});

test('Phase 7 [SCORING-01]: calculateExplainableScore returns itemized factor breakdown', () => {
    const member = {
        user: {
            createdTimestamp: Date.now() - 3600000, // 1h old (+35)
            avatar: null // Default avatar (+15)
        }
    };

    const score = calculateExplainableScore(member, { recentViolations: 2, isHoisted: true });
    // 35 + 15 + 15 (hoist) + 30 (2 violations * 15) = 95
    assert.equal(score.totalScore, 95);
    assert.equal(score.tier, 'CRITICAL');
    assert.equal(score.factors.length, 4);
});

test('Phase 7 [ANOMALY-01]: detectModeratorAnomaly detects sudden moderation spikes', () => {
    const g = 'guild-anomaly-1';
    const mod = 'mod-fast-actor';

    // Baseline is 2 actions/hour
    const normalCheck = detectModeratorAnomaly(g, mod, 3);
    assert.equal(normalCheck.isAnomaly, false);

    // Sudden spike: 10 actions/hour (5x baseline >= 3x threshold and >= 6 count)
    const anomalyCheck = detectModeratorAnomaly(g, mod, 10);
    assert.equal(anomalyCheck.isAnomaly, true);
    assert.equal(anomalyCheck.ratio, 5.0);
});

test('Phase 7 [RECOMMEND-01]: generateSecurityRecommendations provides tailored suggestions', () => {
    const guild = { id: 'g-rec' };
    const incompleteConfig = {
        enabled: true,
        disabledEvents: ['antiBot'],
        protectRole: null
    };

    const recs = generateSecurityRecommendations(guild, incompleteConfig);
    assert.ok(recs.some(r => r.title.includes('AntiBot')));
    assert.ok(recs.some(r => r.title.includes('Protect Role')));
});

test('Phase 7 [DASHBOARD-API-01]: DashboardApiServer serves health, enforces token auth, and returns status', async () => {
    const client = createMockClient();
    const secret = 'super_secret_token_abc';
    client.getAntinukeData = async (gid) => ({ enabled: true, action: 'ban', disabledEvents: [] });

    const server = new DashboardApiServer({ client, apiSecret: secret, port: 0 });
    const port = await server.start();
    assert.ok(port > 0, 'Server must bind to ephemeral port');

    // 1. Test public /api/health
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, 'ok');

    // 2. Test unauthenticated request -> 401
    const unauthRes = await fetch(`http://127.0.0.1:${port}/api/guild/123/status`);
    assert.equal(unauthRes.status, 401);

    // 3. Test authenticated request with Bearer token -> 200
    const authRes = await fetch(`http://127.0.0.1:${port}/api/guild/123/status`, {
        headers: { 'Authorization': `Bearer ${secret}` }
    });
    assert.equal(authRes.status, 200);
    const authJson = await authRes.json();
    assert.equal(authJson.guildId, '123');
    assert.equal(authJson.enabled, true);

    await server.stop();
});
