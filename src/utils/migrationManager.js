import { FastDB } from './fastDb.js';

export const MIGRATIONS = [
    {
        version: 1,
        name: 'create_security_core_tables',
        up: (sqlite) => {
            sqlite.exec(`
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS security_incidents (
                    id TEXT PRIMARY KEY,
                    guild_id TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    module_key TEXT NOT NULL,
                    target_id TEXT,
                    actor_id TEXT,
                    severity TEXT NOT NULL,
                    attribution_confidence TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    action_taken TEXT,
                    recovery_status TEXT,
                    evidence_hash TEXT,
                    metadata TEXT
                );

                CREATE TABLE IF NOT EXISTS temporary_trust (
                    id TEXT PRIMARY KEY,
                    guild_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    module_key TEXT NOT NULL,
                    granted_by TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS bot_trust_registry (
                    id TEXT PRIMARY KEY,
                    guild_id TEXT NOT NULL,
                    bot_id TEXT NOT NULL,
                    allowed_permissions TEXT NOT NULL,
                    review_status TEXT NOT NULL,
                    granted_by TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER
                );

                CREATE TABLE IF NOT EXISTS security_feature_flags (
                    id TEXT PRIMARY KEY,
                    guild_id TEXT NOT NULL,
                    flag_key TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS security_evidence_vault (
                    id TEXT PRIMARY KEY,
                    incident_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    payload_hash TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );
            `);
        }
    },
    {
        version: 2,
        name: 'add_security_indexes',
        up: (sqlite) => {
            sqlite.exec(`
                CREATE INDEX IF NOT EXISTS idx_incidents_guild_time ON security_incidents (guild_id, timestamp);
                CREATE INDEX IF NOT EXISTS idx_temp_trust_guild_user ON temporary_trust (guild_id, user_id, expires_at);
                CREATE INDEX IF NOT EXISTS idx_bot_trust_guild_bot ON bot_trust_registry (guild_id, bot_id);
                CREATE INDEX IF NOT EXISTS idx_flags_guild ON security_feature_flags (guild_id, flag_key);
                CREATE INDEX IF NOT EXISTS idx_vault_incident ON security_evidence_vault (incident_id);
            `);
        }
    }
];

/**
 * Run pending database migrations against a FastDB instance.
 * @param {FastDB} fastDb
 * @returns {{ currentVersion: number, applied: string[] }}
 */
export function runMigrations(fastDb) {
    if (!fastDb || !fastDb.sqlite) {
        throw new Error('Valid FastDB instance with sqlite handle required for migrations');
    }

    const sqlite = fastDb.sqlite;

    // Ensure migrations table exists
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at INTEGER NOT NULL
        );
    `);

    // Get applied versions
    const stmt = sqlite.prepare('SELECT version FROM schema_migrations ORDER BY version ASC');
    const rows = stmt.all() || [];
    const appliedVersions = new Set(rows.map(r => r.version));

    const applied = [];
    let currentVersion = rows.length > 0 ? rows[rows.length - 1].version : 0;

    for (const migration of MIGRATIONS) {
        if (!appliedVersions.has(migration.version)) {
            migration.up(sqlite);
            const insertStmt = sqlite.prepare(
                'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
            );
            insertStmt.run(migration.version, migration.name, Date.now());
            applied.push(migration.name);
            currentVersion = migration.version;
        }
    }

    return { currentVersion, applied };
}
