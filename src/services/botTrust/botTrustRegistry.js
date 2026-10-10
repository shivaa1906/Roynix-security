/**
 * Granular Bot Trust Registry & Policy Store
 */

const botTrustStore = new Map(); // guildId:botId -> TrustRecord

/**
 * Register or update trust permissions for a bot in a guild.
 * @param {string} guildId
 * @param {string} botId
 * @param {object} options
 * @param {bigint | string} [options.allowedPermissions=0n]
 * @param {string} [options.reviewStatus='approved']
 * @param {number | null} [options.expiresAt=null]
 * @param {string} [options.grantedBy='system']
 * @returns {object}
 */
export function registerBotTrust(guildId, botId, {
    allowedPermissions = 0n,
    reviewStatus = 'approved',
    expiresAt = null,
    grantedBy = 'system'
} = {}) {
    if (!guildId || !botId) throw new Error('guildId and botId required');

    const key = `${guildId}:${botId}`;
    const record = {
        guildId,
        botId,
        allowedPermissions: typeof allowedPermissions === 'bigint' ? allowedPermissions.toString() : String(allowedPermissions),
        reviewStatus,
        expiresAt,
        grantedBy,
        createdAt: Date.now()
    };

    botTrustStore.set(key, record);
    return record;
}

/**
 * Get the trust record for a bot in a guild.
 * @param {string} guildId
 * @param {string} botId
 * @returns {object | null}
 */
export function getBotTrust(guildId, botId) {
    if (!guildId || !botId) return null;
    const key = `${guildId}:${botId}`;
    const record = botTrustStore.get(key);
    if (!record) return null;

    // Check expiration
    if (record.expiresAt && Date.now() > record.expiresAt) {
        botTrustStore.delete(key);
        return null;
    }

    return record;
}

/**
 * Revoke trust for a bot.
 * @param {string} guildId
 * @param {string} botId
 * @returns {boolean}
 */
export function revokeBotTrust(guildId, botId) {
    return botTrustStore.delete(`${guildId}:${botId}`);
}
