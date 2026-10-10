export const TEMPLATES = Object.freeze({
    MAXIMUM_DEFENSE: {
        name: 'Maximum Defense',
        description: 'Hardened security configuration for large or targeted communities',
        config: {
            enabled: true,
            action: 'ban',
            disabledEvents: [],
            thresholds: {
                massBan: { limit: 2, windowMs: 10000 },
                massKick: { limit: 2, windowMs: 10000 },
                joinRaid: { limit: 5, windowMs: 10000 },
                messageSpam: { limit: 4, windowMs: 4000 }
            }
        }
    },
    COMMUNITY_BALANCED: {
        name: 'Community Balanced',
        description: 'Standard security settings balancing protection and false-positive tolerance',
        config: {
            enabled: true,
            action: 'strip',
            disabledEvents: ['antiEmojiCreate', 'antiStickerCreate'],
            thresholds: {
                massBan: { limit: 4, windowMs: 10000 },
                massKick: { limit: 4, windowMs: 10000 },
                joinRaid: { limit: 12, windowMs: 10000 },
                messageSpam: { limit: 6, windowMs: 4000 }
            }
        }
    },
    DEVELOPER_RELAXED: {
        name: 'Developer Relaxed',
        description: 'Permissive settings for development, testing, and staging servers',
        config: {
            enabled: true,
            action: 'strip',
            disabledEvents: ['antiBot', 'antiWebhookUpdate', 'antiChannelCreate'],
            thresholds: {
                massBan: { limit: 10, windowMs: 10000 },
                massKick: { limit: 10, windowMs: 10000 },
                joinRaid: { limit: 30, windowMs: 10000 },
                messageSpam: { limit: 10, windowMs: 4000 }
            }
        }
    }
});

export function getSecurityTemplate(templateName) {
    if (!templateName) return null;
    const key = templateName.toUpperCase().replace(/[\s-]/g, '_');
    return TEMPLATES[key] || null;
}
