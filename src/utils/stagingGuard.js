/**
 * Staging Safety Guard
 * 
 * Enforces staging isolation in code:
 * 1. Blocks destructive security enforcement on non-staging guilds when running in staging mode.
 * 2. Validates that genuine staging credentials and dedicated sandbox guilds exist.
 * 3. Prevents accidental execution against production guilds or production tokens.
 * 4. Fails closed on any error, exception, or configuration ambiguity.
 */

/**
 * Check whether staging mode is active.
 * Detects NODE_ENV === 'staging' or STAGING_MODE === 'true'.
 * If conflicting settings exist (e.g. NODE_ENV === 'production' but STAGING_MODE === 'true'),
 * it fails closed by treating staging mode as active (so no production actions can inadvertently run).
 * @returns {boolean}
 */
export function isStagingMode() {
    try {
        const nodeEnv = process.env.NODE_ENV ? String(process.env.NODE_ENV).toLowerCase().trim() : '';
        const stagingMode = process.env.STAGING_MODE ? String(process.env.STAGING_MODE).toLowerCase().trim() : '';

        return nodeEnv === 'staging' || stagingMode === 'true' || stagingMode === '1';
    } catch {
        // Fail-closed: assume staging mode on evaluation error
        return true;
    }
}

/**
 * Get the authorized staging guild ID.
 * @returns {string | null}
 */
export function getStagingGuildId() {
    try {
        return process.env.STAGING_GUILD_ID ? String(process.env.STAGING_GUILD_ID).trim() : null;
    } catch {
        return null;
    }
}

/**
 * Verify whether an action is permitted on the specified guild ID.
 * In staging mode, destructive/punitive actions are STRICTLY restricted to the authorized staging guild.
 * Fails closed on any exception.
 * @param {string} guildId
 * @returns {{ allowed: boolean, reason: string }}
 */
export function isStagingActionAllowed(guildId) {
    try {
        if (!isStagingMode()) {
            return { allowed: true, reason: 'production_mode' };
        }

        const stagingGuildId = getStagingGuildId();
        if (!stagingGuildId) {
            return {
                allowed: false,
                reason: 'staging_guard_blocked: STAGING_GUILD_ID is not configured in staging mode'
            };
        }

        const normalizedGuildId = guildId ? String(guildId).trim() : '';
        if (!normalizedGuildId || normalizedGuildId !== stagingGuildId) {
            return {
                allowed: false,
                reason: `staging_guard_blocked: Guild ${normalizedGuildId || 'unknown'} is not the authorized staging guild (${stagingGuildId})`
            };
        }

        return {
            allowed: true,
            reason: 'staging_guild_authorized'
        };
    } catch (err) {
        // Fail closed on error: never authorize on exception
        return {
            allowed: false,
            reason: `staging_guard_exception_fail_closed: ${err?.message || 'unknown error'}`
        };
    }
}

/**
 * Validates that all prerequisites for live staging execution are present and safe.
 * Compares secrets safely without exposing or logging token values.
 * @returns {{ ready: boolean, missing: string[], errors: string[] }}
 */
export function validateStagingPrerequisites() {
    const missing = [];
    const errors = [];

    try {
        const stagingToken = process.env.STAGING_DISCORD_TOKEN ? String(process.env.STAGING_DISCORD_TOKEN).trim() : '';
        const stagingGuildId = process.env.STAGING_GUILD_ID ? String(process.env.STAGING_GUILD_ID).trim() : '';
        const prodToken = process.env.TOKEN ? String(process.env.TOKEN).trim() : '';

        if (!stagingToken) {
            missing.push('STAGING_DISCORD_TOKEN');
        }

        if (!stagingGuildId) {
            missing.push('STAGING_GUILD_ID');
        }

        // Safety check: Staging token must not be identical to production token
        // Compared safely by string equality check without printing secret values
        if (stagingToken && prodToken && stagingToken === prodToken) {
            errors.push('STAGING_DISCORD_TOKEN must not be identical to production TOKEN');
        }

        const dashboardSecret = process.env.DASHBOARD_API_TOKEN ? String(process.env.DASHBOARD_API_TOKEN).trim() : '';
        if (!dashboardSecret || dashboardSecret.length < 16 || dashboardSecret === 'test_secret_key_123') {
            missing.push('DASHBOARD_API_TOKEN (minimum 16 chars, non-default)');
        }
    } catch (err) {
        errors.push(`Validation exception: ${err?.message || 'unknown'}`);
    }

    return {
        ready: missing.length === 0 && errors.length === 0,
        missing,
        errors
    };
}
