# 55 — Private Sandbox Preflight Review

**Project:** Roynix Security Platform  
**Repository:** `/home/roy/Documents/projects/discord bots/SECURITY`  
**Date:** 2026-10-10  
**Phase:** Staging Safety Correction & Sandbox Preparation  
**Author:** Antigravity Autonomous Security Agent  
**Branch:** `remediation/phase-a-security-core`  
**Overall Verdict:** **BLOCKED** *(Safety correction applied: server hosting production bot rejected; fail-closed state active pending dedicated sandbox)*

---

## 1. Safety Correction Notice (2026-10-10)

During staging preparation, guild `1556668169156960367` (`NEXTGEN DEV'S`) was flagged because it also hosts the active production bot (`Roynix Security#6496`, ID: `1370720264605925547`). 

In strict adherence to the mandatory isolation rules (*"Never touch production Discord resources"* and *"Do not perform destructive tests against production resources"*):
1. **Immediate De-Registration:** All 38 staging slash commands that were temporarily registered in `1556668169156960367` were immediately purged via Discord REST (`PUT /commands` body: `[]`, remaining: `0`).
2. **Environment Fail-Closed Reset:** `STAGING_GUILD_ID` in `.env.staging` was reset to empty (`STAGING_GUILD_ID=`), putting the application into an enforced fail-closed state.
3. **Execution Blocked:** `npm run start:staging` will not be started, and no destructive tests will be executed until an isolated private sandbox guild is provisioned where the production bot is **NOT** installed.

---

## 2. Preflight Check Matrix (Items 1–10)

| Check # | Verification Task | Status | Sanitized Evidence & Findings |
| :---: | :--- | :---: | :--- |
| **1** | **Inspect Staging Configuration** | **PASS** | `.env.staging` inspected with all secrets redacted. Confirmed `.env.staging` is Git-ignored via `.gitignore:2:.env*`. Mode flags: `NODE_ENV=staging`, `STAGING_MODE=true`. `STAGING_GUILD_ID` cleared. |
| **2** | **Token Application & Separation** | **PASS** | Staging token decodes to `MM#8224` (`1370076340740554752`). Production token belongs to `Roynix Security#6496` (`1370720264605925547`). `stagingToken !== prodToken` verified `true`. Privileged intents verified over WebSocket. |
| **3** | **Sandbox Guild Isolation** | **BLOCKED** | Guild `1556668169156960367` rejected due to hosting the production bot. `STAGING_GUILD_ID` is cleared and failing closed until a dedicated server (where production bot is not present) is provisioned. |
| **4** | **Database Path Isolation** | **PASS** | [`src/base/Roynix.js#L110-L113`](file:///home/roy/Documents/projects/discord%20bots/SECURITY/src/base/Roynix.js#L110-L113) points database paths strictly to `database.staging/`. Production database `database/antinuke.db` is strictly unreferenced. |
| **5** | **Slash Command Route Isolation** | **PASS** | Staging slash commands on `1556668169156960367` purged to 0. Deployment code strictly enforces `applicationGuildCommands(clientId, process.env.STAGING_GUILD_ID)` and exits if `STAGING_GUILD_ID` is unset. |
| **6** | **Startup Guard Containment** | **PASS** | Code-level fail-closed guards tested: missing `STAGING_GUILD_ID` halts startup with code 1; actions against unauthorized guilds return `allowed: false` across all 6 mutation paths. |
| **7** | **Dashboard Secret & Scope Protection** | **PASS** | Verified in `STAGE-GUARD-08`: `DashboardApiServer` enforces minimum 16-character entropy on secrets, rejects default keys, and returns `403 Forbidden` on foreign guild tenant queries. |
| **8** | **Automated Tests & Syntax Checks** | **PASS** | 118 / 118 automated tests passed (`node --test tests/phase-*.test.js`). 0 syntax errors (`find src tests -name "*.js" -exec node --check {} +`). 0 git diff errors. |
| **9** | **Zero Premature Destructive Actions** | **PASS** | Staging bot process is NOT running; zero destructive tests executed. |
| **10** | **Sanitized Preflight Report Produced** | **PASS** | Documented in this file (`security-audit/55-private-sandbox-preflight.md`). |

---

## 3. Mandatory Safety Boundaries Enforced

1. **Production Isolation:**
   - Production token and production application `1370720264605925547` are completely segregated.
   - Production database `database/antinuke.db` is untouched.
   - Production guilds (`1316628433974988920`, `1528739497909555311`, `1556668169156960367`) are strictly protected from tests.
2. **Git Hygiene & Secret Redaction:**
   - `.env.staging` is Git-ignored by `.gitignore` pattern `.env*`.
   - Verified via `git check-ignore -v .env.staging`: `.gitignore:2:.env* .env.staging`.
   - Zero secrets committed to repository or output in logs.

---

## 4. Remaining Operator Steps to Unblock Staging

To proceed safely with the 14 staging test scenarios:

1. **Step 1: Create a New, Empty Private Discord Server**
   - In Discord, click **Add a Server** -> **Create My Own** (e.g. named `Roynix Staging Sandbox`).
   - Do **NOT** invite the production bot (`Roynix Security#6496`) to this server.
2. **Step 2: Invite the Staging Bot Only**
   - Authorize `MM#8224` into the new server using the verified least-privilege URL:
     ```
     https://discord.com/oauth2/authorize?client_id=1370076340740554752&permissions=1099914374326&scope=bot%20applications.commands
     ```
3. **Step 3: Provide the Server ID**
   - Copy the new server's Snowflake ID and share it.
4. **Step 4: Automated Verification & Execution**
   - We will verify that `MM#8224` is present in the server and the production bot is **NOT** present.
   - We will deploy the 38 slash commands to that specific server only.
   - We will launch `npm run start:staging` and execute the 14 approved staging scenarios.

---

## 5. Final Status

### **VERDICT: BLOCKED**

Live staging remains **BLOCKED** until a brand-new, isolated private server is provisioned and verified.
