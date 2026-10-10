# 50 — Production Deployment & Rollback Runbook

**Project:** Roynix Security Platform  
**Target:** Production Gateway Deployment  
**Date:** 2026-10-10  
**Phase:** Phase 9 (Deployment & Rollback Strategy)  
**Status:** **OPERATIONAL RUNBOOK**

---

## 1. Pre-Deployment Checklist

Before deploying this release to production:

- [ ] Isolated Discord staging tests from `security-audit/49-staging-test-plan.md` passed with 100% compliance.
- [ ] Complete automated test suite passed (`node --test tests/phase-*.test.js`).
- [ ] Database backup executed via `backupService.createDatabaseBackup()` prior to process replacement.
- [ ] Environment variable `DASHBOARD_API_TOKEN` is set to a secure, randomly generated string (>= 32 chars).
- [ ] Bot permissions in production Discord guilds verified: `Administrator` or explicit `ManageGuild`, `ManageRoles`, `ManageChannels`, `BanMembers`, `KickMembers`, `ViewAuditLog`.

---

## 2. Production Deployment Procedure

### Step 1: Pre-Deployment Database Snapshot
```bash
node -e "
import('./src/utils/backupService.js').then(({ createDatabaseBackup }) => {
    const res = createDatabaseBackup('./database/antinuke.sqlite', './backups/pre_deploy', 5);
    console.log('Pre-deployment backup created:', res.backupPath);
});
"
```

### Step 2: Validate Syntax and Clean Working Tree
```bash
find src tests -name "*.js" -exec node --check {} +
git diff --check
```

### Step 3: Rolling Shard Restart
Deploy using PM2 or Node systemd service manager with zero-downtime rolling restart:
```bash
# Example with PM2:
pm2 reload roynix-security --update-env
```
Or start via sharding manager:
```bash
node src/shard.js
```

### Step 4: Health Check Verification
1. Inspect startup logs:
   - Verify `[Migrations] Applied X schema migration(s)` completed without errors.
   - Verify all 22 AntiNuke modules and 9 gateway events loaded cleanly.
   - Verify Shard 0 and any additional shards emit `ClientReady`.
2. Query the Dashboard API health check:
   ```bash
   curl -I http://127.0.0.1:3000/api/health
   # Expected: HTTP/1.1 200 OK
   ```

---

## 3. Rollback Runbook

### Rollback Triggers
Initiate immediate rollback if any of the following occur within 15 minutes of deployment:
1. Fatal unhandled crash loops or Discord gateway reconnection failures.
2. Misattribution of legitimate Guild Owner or Whitelisted actions resulting in accidental bans.
3. Database corruption or unrecoverable schema migration exceptions.
4. Discord API 429 rate-limiting spam caused by unbounded event loops.

### Rollback Execution Steps

1. **Stop the Running Bot Instance Immediately:**
   ```bash
   pm2 stop roynix-security || killall node
   ```

2. **Restore SQLite Database from Pre-Deployment Backup:**
   ```bash
   # Identify latest backup in backups/pre_deploy/
   cp backups/pre_deploy/backup_<timestamp>.sqlite database/antinuke.sqlite
   ```

3. **Revert Working Branch to Last Stable Tag:**
   ```bash
   git checkout tags/v1.0.0-stable # Or previous stable commit SHA
   ```

4. **Verify Database Integrity:**
   ```bash
   node -e "
   import('node:sqlite').then(({ DatabaseSync }) => {
       const db = new DatabaseSync('./database/antinuke.sqlite');
       const row = db.prepare('PRAGMA integrity_check;').get();
       console.log('Database integrity:', Object.values(row)[0]);
   });
   "
   ```

5. **Restart Service:**
   ```bash
   pm2 start roynix-security
   ```

6. **Notify Administrators:**
   Alert team of rollback and archive incident logs in `security-audit/`.
