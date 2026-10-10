# 49 — Isolated Discord Staging Test Plan

**Project:** Roynix Security Platform  
**Target:** Staging Verification Pre-Production Gate  
**Date:** 2026-10-10  
**Phase:** Phase 9 (Post-Integration Staging Validation)  
**Status:** **READY FOR EXECUTION**

---

## 1. Objectives & Scope

This test plan provides step-by-step validation procedures to execute within an isolated Discord test guild before authorizing full production deployment.

### Testing Rules
1. **Never use a production guild:** Conduct all tests exclusively in dedicated sandbox Discord servers.
2. **Never use production databases:** Use disposable SQLite copies located in `database.staging/`.
3. **Dedicated Staging Bot Account:** Use an independent staging bot application and token.
4. **Attribution Accuracy:** Verify that real Discord Audit Log events resolve real executors without guessing or misattribution.

---

## 2. Staging Environment Preparation

1. **Staging Environment Variables:**
   ```bash
   DISCORD_TOKEN="<staging_bot_token>"
   DASHBOARD_API_TOKEN="staging_master_secret_key_987654"
   NODE_ENV="staging"
   ```
2. **Database Baseline Copy:**
   ```bash
   mkdir -p database.staging
   cp database/*.sqlite database.staging/ 2>/dev/null || true
   ```
3. **Verify Guild Hierarchy:**
   - Roynix Bot role placed above moderator and test roles, but below Guild Owner.
   - Separate test roles: `Admin`, `Moderator`, `Untrusted`, and `@everyone`.

---

## 3. Staging Execution Matrix

### Test Group 1: Content & Message Security
| ID | Action | Expected Behavior | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **STG-MSG-01** | Non-whitelisted user posts `https://discord-nitro.click/free` | Message immediately deleted | Message deleted within 500ms; no bot crash |
| **STG-MSG-02** | Non-whitelisted user posts `.exe` or `.scr` attachment | Message deleted; author warned | Attachment purged from channel |
| **STG-MSG-03** | User bursts 7 messages within 1.5s | Excess messages purged; user rate-limited | Rate limit triggered |
| **STG-MSG-04** | Whitelisted user or Guild Owner posts test link | Message allowed without deletion | Message remains in channel |

### Test Group 2: Gateway Protection & Channel Security
| ID | Action | Expected Behavior | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **STG-GW-01** | Untrusted moderator generates an instant invite | Invite deleted or logged per config | Event logged; invite invalidated |
| **STG-GW-02** | Untrusted role modifies channel permission overwrite to grant `Administrator` | Overwrite reverted to previous state | Overwrite restored within 1s |
| **STG-GW-03** | Untrusted user creates/deletes an automod rule | Action reverted or executor disciplined | Rule restored or logged |

### Test Group 3: Member & Role Governance
| ID | Action | Expected Behavior | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **STG-MEM-01** | Member changes nickname to `!AAA Hoisted` | Nickname dehoisted to `Dehoisted-User` | Nickname sanitized automatically |
| **STG-MEM-02** | Untrusted user moves a role above their own hierarchy | Role position reverted | Role hierarchy maintained |
| **STG-MEM-03** | Untrusted user adds `ManageGuild` permission to a role | Permission stripped; executor disciplined | Permission bitfield reverted |

### Test Group 4: Maintenance Mode & Circuit Breaker
| ID | Action | Expected Behavior | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **STG-MAINT-01** | Enable maintenance mode on staging guild | Bot ignores test infractions gracefully | Decision returns `disabled` |
| **STG-MAINT-02** | Disable maintenance mode on staging guild | Bot resumes active protection | Enforcement triggers as expected |
| **STG-CB-01** | Rapid deletion of 3 test channels | Circuit breaker trips; scoped lockdown | @everyone send messages denied |

### Test Group 5: Dashboard API Security
| ID | Action | Expected Behavior | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **STG-DASH-01** | Query `GET /api/health` without auth | Returns 200 OK | Health check succeeds |
| **STG-DASH-02** | Query `GET /api/guild/:guildId/status` with wrong token | Returns 401 Unauthorized | Access rejected |
| **STG-DASH-03** | Query with token scoped to Guild A against Guild B | Returns 403 Forbidden | Guild isolation enforced |

---

## 4. Staging Exit Criteria

To advance from **STAGING-READY** to **PRODUCTION-READY**, all 14 staging test scenarios above must complete with 100% pass rate in the isolated Discord environment.
