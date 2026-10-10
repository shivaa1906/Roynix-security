/**
 * Incident Dynamic Severity Scoring Engine
 * Computes: LOW, MEDIUM, HIGH, CRITICAL
 */

export function calculateIncidentSeverity({
    moduleKey,
    actionType,
    isRaid = false,
    velocityCount = 1,
    hasAdminEscalation = false,
    confidence = 'HIGH'
} = {}) {
    // 1. Automatic CRITICAL triggers
    if (isRaid || velocityCount >= 3 || hasAdminEscalation) {
        return 'CRITICAL';
    }

    // 2. Module-specific severity rules
    switch (moduleKey) {
        case 'antiBan':
        case 'massBan':
        case 'antiKick':
        case 'massKick':
        case 'antiChannelDelete':
        case 'antiRoleDelete':
        case 'circuitBreaker':
            return velocityCount >= 2 ? 'CRITICAL' : 'HIGH';

        case 'antiBot':
        case 'antiWebhookUpdate':
        case 'antiPing':
        case 'channelOverwriteProtection':
        case 'rolePositionProtection':
        case 'permissionEscalation':
            return 'HIGH';

        case 'antiChannelCreate':
        case 'antiRoleCreate':
        case 'antiGuildUpdate':
        case 'antiMemberUpdate':
        case 'voiceSecurity':
        case 'timeoutProtection':
        case 'inviteProtection':
            return 'MEDIUM';

        case 'antiEmojiCreate':
        case 'antiEmojiDelete':
        case 'antiEmojiUpdate':
        case 'antiStickerCreate':
        case 'antiStickerDelete':
        case 'antiStickerUpdate':
        case 'antiSpam':
            return 'LOW';

        default:
            return 'MEDIUM';
    }
}
