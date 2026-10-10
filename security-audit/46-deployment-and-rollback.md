# 46 — Production Deployment Checklist & Instant Rollback Runbook

**Project:** Roynix Security Platform  
**Repository:** `/home/roy/Documents/projects/discord bots/SECURITY`  
**Target Architecture:** Node.js v20/v24 ES Modules, Discord.js v14, Sharded Cluster (`src/shard.js`), SQLite / FastDB.

---

## 1. Production Deployment Checklist

Follow this checklist strictly prior to rolling out the upgraded security platform to production.

### Phase 1: Pre-Deployment Verification
- [ ] **Automated Regression Suite Pass:**
  ```bash
  node --test tests/phase-*.test.js
  ```
  *Requirement:* Exactly 90 passed, 0 failed.
- [ ] **Syntax & Lint Integrity Check:**
  ```bash
  find src tests -name "*.js" -exec node --check {} +
  ```
  *Requirement:* Exit code 0, no syntax errors.
- [ ] **Git Working Tree Verification:**
  ```bash
  git status --porcelain
  ```
  *Requirement:* Confirm no unexpected modified files outside the planned release.
- [ ] **Environment Variable Verification:**
  Confirm required environment variables are set in production `.env`:
  - `TOKEN`: Bot Discord application token.
  - `OWNER_IDS`: Comma-separated list of primary bot owners.
  - `DASHBOARD_API_PORT`: Optional port for dashboard service (default: 3000).
  - `DASHBOARD_API_TOKEN`: Cryptographic bearer token for API authorization.

---

### Phase 2: Database Snapshot & Backup
Prior to starting the application with updated code, generate a verified backup of the SQLite database:
```bash
node -e "
import { createDatabaseBackup } from './src/utils/backupService.js';
const backupPath = createDatabaseBackup('./database.sqlite', './backups');
console.log('Production backup created at:', backupPath);
"
```
*Requirement:* Backup file verified via `PRAGMA integrity_check` before proceeding.

---

### Phase 3: Additive Database Migrations
Run schema migrations using the built-in versioned migration manager:
```bash
node -e "
import Database from 'better-sqlite3';
import { runMigrations } from './src/utils/migrationManager.js';

const db = new Database('./database.sqlite');
const res = runMigrations(db);
console.log('Applied migrations:', res);
db.close();
"
```
*Requirement:* Migrations V1 & V2 applied without schema conflict. All existing tables (`antinukeData_*`, `extraowners`, `whitelist`) remain intact.

---

### Phase 4: Application Startup & Cluster Initialization
Launch the sharded application manager:
```bash
node src/shard.js
```
Monitor the shard spawning log:
- Confirm all shards successfully initialize, connect to gateway, and report `[READY]`.
- Verify database connections open in WAL mode (`journal_mode = WAL`).
- Verify `Roynix.initAntinukeCache()` populates the memory cache for active guilds.

---

### Phase 5: Post-Deployment Smoke Verification
- [ ] Execute `/antinuke config` in a monitoring server to verify configuration display.
- [ ] Trigger an authorized test action (e.g., trusted role update) to verify no false-positive triggers.
- [ ] Query `/health` on the Dashboard API endpoint:
  ```bash
  curl -H "Authorization: Bearer <DASHBOARD_API_TOKEN>" http://localhost:3000/health
  ```
  *Requirement:* HTTP 200 OK `{"status": "healthy"}`.

---

## 2. Emergency Controls & Feature Flags

If an unexpected behavior or Discord API anomaly occurs in production, use these granular controls before considering a full rollback:

### 2.1 Dynamic Module Kill-Switch
To instantly disable a specific module globally or for a specific guild without restarting:
```javascript
import { featureFlagService } from './src/utils/featureFlagService.js';

// Disable a module globally in memory and persistent storage
featureFlagService.setGlobalFlag('module:antiChannelDelete', false);

// Or disable for a specific guild experiencing false positives
featureFlagService.setGuildFlag('guild-id-here', 'module:antiPing', false);
```

### 2.2 Maintenance Mode Activation
To pause all security enforcement actions temporarily while keeping the bot online:
```javascript
import { maintenanceMode } from './src/utils/maintenanceMode.js';

// Enable maintenance mode for 30 minutes
maintenanceMode.enable(30 * 60 * 1000, 'Investigating Discord API event anomaly');
```
*Effect:* Security event listeners log events but bypass enforcement actions until deactivated or expired.

---

## 3. Instant Rollback Runbook

If critical failure occurs (e.g., persistent crash loop, unresolvable attribution failure, or database corruption), execute the instant rollback protocol:

### Step 1: Immediate Process Termination
Terminate all running shard processes immediately:
```bash
# Graceful stop attempt
pkill -SIGINT -f "node src/shard.js" || pkill -9 -f "node src/shard.js"
```

### Step 2: Restore Database Backup
Restore the verified pre-deployment SQLite database backup:
```bash
# Locate latest pre-deployment backup in ./backups/
LATEST_BACKUP=$(ls -t backups/database-backup-*.sqlite | head -n 1)

# Move corrupted/active db aside and restore snapshot
mv database.sqlite database.corrupted.sqlite
cp "$LATEST_BACKUP" database.sqlite

# Remove stale WAL/SHM temporary journal files
rm -f database.sqlite-wal database.sqlite-shm
```

### Step 3: Git Revision Rollback
Revert application code to the prior stable production commit:
```bash
git checkout <PREVIOUS_STABLE_COMMIT_HASH>
```

### Step 4: Restart Prior Production Version
Start the previous stable bot process:
```bash
node src/shard.js
```

### Step 5: Post-Rollback State Verification
1. Inspect bot logs: confirm clean gateway reconnect and shard readiness.
2. Confirm SQLite database opens cleanly and `antinukeData` records are accessible.
3. Validate in Discord that commands (`/antinuke`, `!antinuke`) respond normally.
4. Notify platform administrators and begin root-cause analysis on `database.corrupted.sqlite`.
