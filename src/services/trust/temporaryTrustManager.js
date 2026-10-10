const tempTrustStore = new Map(); // guildId:userId -> record

/**
 * Grant temporary trust/whitelist entry to a user.
 * @param {string} guildId
 * @param {string} userId
 * @param {object} options
 * @param {number} [options.durationMs=3600000] Default 1 hour
 * @param {string} [options.moduleKey='*']
 * @param {string} [options.grantedBy='system']
 * @returns {object}
 */
export function grantTemporaryTrust(guildId, userId, {
    durationMs = 3600000,
    moduleKey = '*',
    grantedBy = 'system'
} = {}) {
    if (!guildId || !userId) throw new Error('guildId and userId required');

    const expiresAt = Date.now() + durationMs;
    const record = {
        guildId,
        userId,
        moduleKey,
        grantedBy,
        grantedAt: Date.now(),
        expiresAt
    };

    tempTrustStore.set(`${guildId}:${userId}`, record);
    return record;
}

/**
 * Check if a user has active temporary trust.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} [moduleKey='*']
 * @returns {boolean}
 */
export function hasActiveTemporaryTrust(guildId, userId, moduleKey = '*') {
    const key = `${guildId}:${userId}`;
    const record = tempTrustStore.get(key);
    if (!record) return false;

    if (Date.now() > record.expiresAt) {
        tempTrustStore.delete(key);
        return false;
    }

    if (record.moduleKey === '*' || record.moduleKey === moduleKey) {
        return true;
    }

    return false;
}

/**
 * Revoke temporary trust.
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean}
 */
export function revokeTemporaryTrust(guildId, userId) {
    return tempTrustStore.delete(`${guildId}:${userId}`);
}
