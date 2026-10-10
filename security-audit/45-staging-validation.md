# 45 — Staging Validation & Non-Destructive Verification Runbook

**Project:** Roynix Security Platform  
**Repository:** `/home/roy/Documents/projects/discord bots/SECURITY`  
**Purpose:** Pre-production staging test procedures, isolated verification protocols, and gate criteria.

---

## 1. Staging Environment Prerequisites

Before deploying the Roynix Security platform to a staging Discord guild or staging server instance, verify the following prerequisites:

### 1.1 Runtime & Dependencies
- **Node.js:** Node.js v20.x or v24.x (Tested on Node `v24.18.0` and `v24.21.0`).
- **Module System:** ECMAScript Modules (`"type": "module"` in `package.json`).
- **SQLite Engine:** `better-sqlite3` v9.x or later with WAL mode enabled.
- **Discord.js:** v14.16.x or later.

### 1.2 Required Gateway Intents
Ensure the staging bot application in the Discord Developer Portal has the following Privileged Gateway Intents enabled:
- `GatewayIntentBits.Guilds`
- `GatewayIntentBits.GuildMembers` (Privileged)
- `GatewayIntentBits.GuildModeration` (GuildBans)
- `GatewayIntentBits.GuildInvites`
- `GatewayIntentBits.GuildVoiceStates`
- `GatewayIntentBits.GuildMessages`
- `GatewayIntentBits.MessageContent` (Privileged)
- `GatewayIntentBits.GuildScheduledEvents`

### 1.3 Bot Role & Hierarchy Placement
- The bot's integrated role must be positioned **above all roles it is intended to protect or manage**.
- The bot must possess the following guild permissions:
  - `Administrator` (or explicitly: `ViewAuditLog`, `ManageGuild`, `ManageRoles`, `ManageChannels`, `BanMembers`, `KickMembers`, `ModerateMembers`, `ManageWebhooks`, `ManageMessages`).

---

## 2. Non-Destructive Staging Verification Procedures

All staging procedures are engineered to execute in dedicated staging sandboxes without mutating production data or performing destructive actions against real production guilds.

### 2.1 Procedure S-01: Automated Test Suite Gate
Execute the complete test suite against local mock harnesses:
```bash
node --test tests/phase-*.test.js
```
**Pass Criteria:**
- Total tests: 90 passed, 0 failed, 0 skipped.
- Total execution time under 5 seconds.
- Zero uncaught exceptions or rejection warnings.

### 2.2 Procedure S-02: SQLite Schema Migration Verification
Validate that SQLite migrations apply cleanly to a clean database file:
```bash
node -e "
import { runMigrations } from './src/utils/migrationManager.js';
import Database from 'better-sqlite3';
import fs from 'fs';

const dbPath = './test_staging_migrations.sqlite';
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db = new Database(dbPath);
const res = runMigrations(db);
console.log('Migration Result:', res);
db.close();
fs.unlinkSync(dbPath);
"
```
**Pass Criteria:**
- `applied: 2`, `currentVersion: 2`.
- Tables `security_migrations`, `quarantine_records`, `incident_evidence_vault`, `temporary_trust_grants`, `bot_trust_registry`, `incident_timeline` successfully created with valid indices.

### 2.3 Procedure S-03: Bot Dependency & Permission Validation
Verify that `validateModuleDependencies` flags missing permissions accurately:
```javascript
import { validateModuleDependencies } from './src/utils/moduleDependencyValidator.js';

// Verify required permissions for all catalog modules
const validation = validateModuleDependencies('antiChannelDelete', botPermissions);
// Returns { valid: true/false, missing: [...] }
```
**Pass Criteria:**
- Returns `valid: true` when required permissions are present.
- Returns explicit missing permissions array when permissions are missing (never silently fails).

### 2.4 Procedure S-04: Non-Destructive Recovery Simulation (Dry-Run)
Verify snapshot recovery simulation without making Discord API calls:
```javascript
import { simulateRecoveryDryRun } from './src/services/recovery/recoveryDryRun.js';

const dryRunResult = simulateRecoveryDryRun(stagingGuild, snapshotData);
console.log(dryRunResult.summary);
// Pass Criteria: Itemizes missing channels and roles with action='CREATE' without executing guild mutations
```

### 2.5 Procedure S-05: Security Policy Pre-Enforcement Simulation
Verify that security policy evaluation can be simulated in non-enforcing mode:
```javascript
import { simulateSecurityPolicy } from './src/services/policies/policySimulator.js';

const simResult = simulateSecurityPolicy(stagingGuild, antinukeConfig, {
  moduleKey: 'antiChannelDelete',
  actorId: '123456789012345678',
  actionType: 'channel_delete'
});
// Pass Criteria: Accurately predicts 'enforce' vs 'exempt' based on configuration
```

### 2.6 Procedure S-06: Cryptographic Evidence Integrity Check
Validate SHA-256 evidence vault storage and tamper detection:
```javascript
import { vaultIncidentEvidence, verifyEvidenceIntegrity } from './src/services/incidents/evidenceVault.js';

const record = vaultIncidentEvidence(db, {
  guildId: 'staging-guild-1',
  incidentId: 'inc-001',
  moduleKey: 'antiRoleDelete',
  actorId: 'untrusted-user',
  payload: { roleId: '111', roleName: 'Admins' }
});

const verified = verifyEvidenceIntegrity(db, 'inc-001');
// Pass Criteria: verified.valid === true; any modification to payload causes verified.valid === false
```

### 2.7 Procedure S-07: Dashboard API Authentication & Health Check
Verify dashboard REST API startup, health check endpoint, and token isolation:
```javascript
import { DashboardApiServer } from './src/dashboard/dashboardApi.js';

const api = new DashboardApiServer({ port: 3042, token: 'staging-secret-token' });
await api.start();
// GET http://localhost:3042/health -> 200 OK { status: 'healthy' }
// GET http://localhost:3042/api/guilds/123/status without token -> 401 Unauthorized
await api.stop();
```

---

## 3. Staging Attack Scenarios (Sandbox Guild)

When executing live tests in a designated Discord sandbox server:

| Scenario ID | Attack Type | Expected System Behavior | Verification Check |
| :--- | :--- | :--- | :--- |
| **STG-SCEN-01** | Rapid Channel Deletions (3 channels in 5s) | Mass action detector triggers; Circuit breaker activates scoped lockdown; channels queued for recovery | Pre-lockdown permissions saved; channels recreated from blueprint |
| **STG-SCEN-02** | Rogue Role Elevation (Admin perm added) | Permission escalation detector intercepts `roleUpdate`; Administrator bitfield revoked immediately | `role.permissions` restored; untrusted modifier stripped/banned |
| **STG-SCEN-03** | Unauthorized Invite Creation | `inviteCreate` event triggers; invite instantly deleted via REST; executor logged | Invite URL invalid; warning logged in incident channel |
| **STG-SCEN-04** | Phishing / Token Grabber Link in Chat | Content security filter detects domain / regex; message deleted immediately; member timed out | Message removed; incident timeline record created |
| **STG-SCEN-05** | Unauthorized Bot Addition | `antiBot` detects addition; resolves inviter; untrusted bot immediately kicked/banned | Bot removed; inviter punished according to policy |
| **STG-SCEN-06** | Protection-Role Deletion | `antiRoleDelete` triggers; protect role recreated immediately; database ID refreshed | Roynix Protect role reappears at apex; zero downtime |

---

## 4. Promotion Criteria (Staging to Production)

A staging release may be promoted to production only if:
1. All 90 automated regression tests in `tests/phase-*.test.js` pass with exit code `0`.
2. Syntax check `node --check` passes on all `.js` files in `src/` and `tests/`.
3. Database backup completed and verified via `createDatabaseBackup`.
4. Feature flags initialized with new modules disabled by default or set to shadow mode.
5. All rollback procedures in `46-deployment-and-rollback.md` are documented and tested.
