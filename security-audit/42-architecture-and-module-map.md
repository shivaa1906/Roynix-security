# 42 — Architecture Blueprint & Module Map

**Project:** Roynix Security  
**Target Architecture:** Modular, layered Discord Security Platform  
**Document Version:** 1.0.0  
**Status:** Approved for Implementation (Phases 1–8)

---

## 1. High-Level System Architecture

Roynix Security is structured around a non-blocking, event-driven pipeline designed for maximum resilience, sub-millisecond trust evaluation, and zero-loss audit attribution.

```mermaid
flowchart TD
    subgraph Discord Gateway
        GW[Discord Gateway Events]
    end

    subgraph Layer 1: Ingestion & Adapters
        GW -->|Guild / Audit Events| L1A[Event Handlers & Antinuke Adapters]
        GW -->|Message Events| L1B[Message & Content Security]
        GW -->|Voice Events| L1C[Voice & Stage Security]
        GW -->|Commands| L1D[Slash & Prefix Command Handlers]
    end

    subgraph Layer 2: Detection & Attribution
        L1A & L1B & L1C --> L2A[Detection Engine]
        L2A -->|Audit Query| L2B[AuditAttributionService<br>getExecutor]
        L2A -->|Sliding Windows| L2C[Sliding Rate Limiters & Velocity Trackers]
    end

    subgraph Layer 3: Trust & Policy
        L2A & L2B --> L3A[SecurityPolicyService<br>Unified Trust Hierarchy]
        L3A -->|Decision: Exempt| L3B[Audit Log / Pass-through]
        L3A -->|Decision: Enforce / Quarantine| L4A[IncidentCoordinator]
    end

    subgraph Layer 4: Response, Enforcement & Recovery
        L4A -->|Trips >= 2| L4B[CircuitBreaker & LockdownService]
        L4A -->|Punish| L4C[PunishmentService<br>punishExecutor]
        L4A -->|Restore| L4D[RecoveryService<br>blueprintManager]
        L4A -->|Quarantine| L4E[zeroTrustQuarantine]
    end

    subgraph Layer 5: Storage & Observability
        L4A & L4B & L4C & L4D --> L5A[FastDB / node:sqlite]
        L4A --> L5B[Forensic Evidence Vault & Timeline]
        L4A --> L5C[NotificationService / Webhooks]
        L5A --> L5D[Dashboard API / HealthService]
    end
```

---

## 2. Directory & Namespace Structure

To avoid disrupting existing imports and runtime paths while implementing the expanded catalog, the codebase organizes new capabilities cleanly into dedicated services that delegate to or wrap existing primitives:

```
src/
├── antinuke/                   # Compatibility adapters (22 modules, 24 Discord events)
├── security/
│   ├── detection/             # Specialized detection engines (mass-action, overwrites, filters)
│   │   ├── channelOverwriteProtection.js
│   │   ├── permissionEscalation.js
│   │   ├── rolePositionProtection.js
│   │   ├── automodProtection.js
│   │   ├── inviteProtection.js
│   │   ├── integrationProtection.js
│   │   ├── scheduledEventProtection.js
│   │   ├── stageProtection.js
│   │   ├── massActionDetector.js
│   │   ├── nicknameProtection.js
│   │   ├── timeoutProtection.js
│   │   ├── messageSecurity.js
│   │   ├── phishingDetector.js
│   │   ├── linkProtection.js
│   │   ├── duplicateMessageDetector.js
│   │   ├── capsFilter.js
│   │   ├── emojiSpamFilter.js
│   │   ├── impersonationDetector.js
│   │   ├── nsfwEnforcer.js
│   │   ├── toxicityFilter.js
│   │   ├── attachmentScreening.js
│   │   ├── channelRateLimiter.js
│   │   └── voiceSecurity.js
│   ├── policies/              # Policy rules, templates, simulation
│   │   ├── policySimulator.js
│   │   └── securityTemplates.js
│   └── incidents/             # Evidence, timeline, playbooks
│       ├── evidenceVault.js
│       ├── incidentTimeline.js
│       ├── incidentWorkflow.js
│       ├── incidentReplay.js
│       └── playbookEngine.js
├── services/
│   ├── raidDetection/         # Join-raid, attack correlation
│   │   ├── joinRaidDetector.js
│   │   └── attackCorrelator.js
│   ├── threatScoring/         # Heuristics, risk scoring, anomaly detection
│   │   ├── altDetector.js
│   │   ├── joinScorer.js
│   │   ├── severityScorer.js
│   │   ├── explainableScorer.js
│   │   └── anomalyDetector.js
│   ├── lockdown/              # Scoped lockdowns, profiles, new-member gates
│   │   ├── lockdownProfiles.js
│   │   ├── voiceLockdown.js
│   │   └── newMemberRestriction.js
│   ├── verification/          # Member screening & verification
│   │   ├── accountAgeScreening.js
│   │   ├── verificationWorkflow.js
│   │   └── quarantineEvasion.js
│   ├── botTrust/              # Bot audits, trust registry, automation monitoring
│   │   ├── botApprovalWorkflow.js
│   │   ├── botTrustRegistry.js
│   │   ├── botRiskScorer.js
│   │   ├── botActivityLogger.js
│   │   ├── integrationReview.js
│   │   ├── suspiciousAutomation.js
│   │   ├── temporaryTrust.js
│   │   ├── botPolicyEngine.js
│   │   └── permissionDrift.js
│   ├── trust/                 # Temporary trust, least privilege, emergency break-glass
│   │   ├── temporaryTrustManager.js
│   │   ├── trustAuditLogger.js
│   │   ├── leastPrivilegeAuditor.js
│   │   ├── sensitiveActionConfirmation.js
│   │   ├── emergencyAccess.js
│   │   └── staffDriftMonitor.js
│   ├── recovery/              # Dry-run, conflict detection, retry queue, reporting
│   │   ├── recoveryDryRun.js
│   │   ├── conflictDetector.js
│   │   ├── recoveryQueue.js
│   │   └── recoveryReporter.js
│   ├── governance/            # Appeals, staff reviews, config transfer
│   │   ├── appealWorkflow.js
│   │   ├── staffActionReview.js
│   │   └── configTransfer.js
│   └── reporting/             # Analytics, exports, scheduled reports, multi-guild
│       ├── threatAnalytics.js
│       ├── attributionReporter.js
│       ├── memberSecurityProfile.js
│       ├── incidentExporter.js
│       ├── scheduledReports.js
│       ├── apiHealthMonitor.js
│       ├── multiGuildOverview.js
│       └── recommendationEngine.js
├── commands/                  # Slash and prefix command handlers
│   ├── slash/admin/           # Extended security commands (status, thresholds, simulate, etc.)
│   └── prefix/antinuke/       # Parity prefix commands
├── dashboard/                 # Authenticated Local REST Dashboard API
│   └── dashboardApi.js
└── utils/                     # Core utilities & database management
    ├── fastDb.js              # Native node:sqlite FastDB persistence
    ├── incidentCoordinator.js # Central incident coordinator
    ├── securityPolicy.js      # Central trust & authorization policy
    ├── punishExecutor.js      # Hierarchy-aware, managed-role safe punishment
    ├── getExecutor.js         # Exact target audit attribution engine
    ├── circuitBreaker.js      # Server lockdown & anti-cascade circuit breaker
    ├── blueprintManager.js    # Guild snapshot, channel & role reconstructor
    ├── migrationManager.js    # Schema migrations engine
    ├── backupService.js       # SQLite WAL checkpoint & backup manager
    ├── retentionService.js    # Expired data auto-pruning
    ├── featureFlagService.js  # Dynamic runtime feature flags
    ├── maintenanceMode.js     # Scheduled maintenance mode
    └── moduleDependencyValidator.js # Permission & intent validator
```

---

## 3. Shared Service Contracts

### 1. `SecurityPolicyService` (`src/utils/securityPolicy.js`)
- **Authority:** Single authoritative source for trust decisions.
- **Hierarchy:**
  1. `BOT_SELF` (exempt)
  2. `BOT_OWNER` (exempt)
  3. `GUILD_OWNER` (exempt)
  4. `EXTRA_OWNER` (exempt)
  5. `GLOBAL_WHITELIST` (exempt)
  6. `PER_MODULE_WHITELIST` (exempt)
  7. `TEMPORARY_TRUST` (exempt until expiry)
  8. `UNKNOWN_ACTOR` (cannot punish; conservative containment)
  9. `UNTRUSTED_ACTOR` (enforce policy)

### 2. `AuditAttributionService` (`src/utils/getExecutor.js`)
- **Authority:** Resolves audit log entries strictly by `(guildId, actionType, targetId, freshnessWindow)`.
- **Confidence Rating:**
  - `HIGH`: Exact target match + fresh timestamp (< 5s) + unambiguous actor.
  - `MEDIUM`: Exact target match + bounded retry (< 12s) + single matching entry.
  - `AMBIGUOUS`: Conflicting entries or multiple actors on same target within window (`returns null`).
  - `NONE`: No matching audit log entry found (`returns null`).

### 3. `IncidentCoordinator` (`src/utils/incidentCoordinator.js`)
- **Authority:** Deduplicates incidents, calculates dynamic severity, records timeline events, routes to `punishExecutor` and `blueprintManager`, trips `circuitBreaker`.
- **Contracts:**
  - Idempotent incident key (`incidentKey = `${guildId}:${moduleKey}:${auditEntryId || targetId}:${bucket}``).
  - Synchronizes containment actions before resource recovery.
  - Generates immutable forensic records in `evidenceVault`.

### 4. `PunishmentService` (`src/utils/punishExecutor.js`)
- **Authority:** Executes sanctions with complete hierarchy safety and truthful reporting.
- **Modes:** `ban`, `kick`, `strip`, `quarantine`.
- **Managed-Role Safety:** Never attempts `roles.remove` or `roles.set([])` on `role.managed === true`; zeroes permissions via `role.setPermissions(0n)` instead.
- **Hierarchy Fallback:** If `ban` or `kick` fails due to role hierarchy, automatically strips removable non-managed roles and applies 28-day timeout.

### 5. `RecoveryService` (`src/utils/blueprintManager.js`)
- **Authority:** Reconstructs deleted/modified channels, categories, permission overwrites, and roles from valid snapshots.
- **Safeguards:**
  - Snapshot anti-poisoning: Blocks snapshot overwrites if > 30% of guild resources are lost.
  - Idempotent reconstruction: Deduplicates channel/role recreation across concurrent events.
  - Hierarchical creation: Always recreates parent category before restoring child channels.

---

## 4. Standard Event Processing Pipeline

```
[Discord Event Ingestion]
        │
        ▼
[Event Context Validation] ──(Invalid / Missing Guild)──► Drop silently
        │
        ▼
[Target & Action Resolution] (targetId, actionType)
        │
        ▼
[Audit Attribution Query] (bounded retries, coalesced cache)
        │
        ├─► Confirmed Actor (Confidence: HIGH/MEDIUM)
        └─► Unresolved Actor (Confidence: NONE/AMBIGUOUS)
        │
        ▼
[SecurityPolicy Evaluation]
        │
        ├─► Trusted (Owner, Extra-Owner, Whitelist) ──► Log exempt & Stop
        │
        ▼
[IncidentCoordinator Registration]
        │
        ├─► Duplicate Incident Key ──► Suppress re-execution & Stop
        │
        ▼
[Dynamic Severity & Correlation] (LOW, MEDIUM, HIGH, CRITICAL)
        │
        ▼
[Circuit Breaker Evaluation] ──(>= 2 distinct untrusted bursts)──► Trip Server Lockdown
        │
        ▼
[Enforcement Execution] (punishExecutor: ban/kick/strip/timeout)
        │
        ▼
[Resource Recovery] (blueprintManager: restore channel/role/perms)
        │
        ▼
[Audit Logging & Forensic Recording] (Evidence Vault, Webhook Alert)
```

---

## 5. Storage Schema & Persistence Strategy

All persistent data resides in FastDB (`json.sqlite` / dedicated tables) backed by Node.js built-in `node:sqlite` in WAL mode:

### Key Tables & Stores:
1. `antinukeData_${guildId}` (Existing legacy compatible key)
   - `enabled`: boolean
   - `disabledEvents`: string[]
   - `action`: `'ban'` | `'kick'` | `'strip'`
   - `whitelist`: string[]
   - `extraOwners`: string[]
   - `protectRole`: string
   - `logsChannel`: string
2. `security_incidents`
   - `id`: string (UUID)
   - `guild_id`: string
   - `timestamp`: integer
   - `module_key`: string
   - `target_id`: string
   - `actor_id`: string
   - `severity`: string
   - `attribution_confidence`: string
   - `action_taken`: string
   - `recovery_status`: string
   - `evidence_hash`: string
3. `bot_trust_registry`
   - `guild_id`: string
   - `bot_id`: string
   - `allowed_permissions`: string (BitField)
   - `review_status`: string
   - `expires_at`: integer (null for permanent)
4. `temporary_trust`
   - `guild_id`: string
   - `user_id`: string
   - `module_key`: string (or `'*'` for global)
   - `granted_by`: string
   - `expires_at`: integer
5. `security_feature_flags`
   - `guild_id`: string
   - `flag_key`: string
   - `enabled`: integer
6. `schema_migrations`
   - `version`: integer
   - `name`: string
   - `applied_at`: integer

---

## 6. Compatibility & Safety Verification

1. **Zero Breaking Changes:** Existing `/antinuke` and `!antinuke` command handlers, database keys, and configuration structure remain 100% operational.
2. **Deterministic Fallbacks:** When Discord API denies permissions or an intent is missing, the module reports a clear degradation message rather than throwing unhandled exceptions.
3. **Secret Redaction:** Bot tokens, authorization headers, and webhook URLs are stripped from all logs and reports.
4. **All 46 Regression Tests:** Must pass at every phase transition.
