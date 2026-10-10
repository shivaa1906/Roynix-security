/**
 * Phishing and Scam Domain Detector
 */

const BLOCKED_DOMAINS = new Set([
    'discorcl.com',
    'dlscord.com',
    'discord-nitro.click',
    'nitro-free.ru',
    'steamcornmunity.com',
    'steampowered-gift.com',
    'discordgift.site',
    'discord-app.net',
    'discocld.com',
    'discrod.com',
    'steamcommuny.com'
]);

const SUSPICIOUS_PATTERNS = [
    /dis[c|k|o|r|l]{3,8}\.(com|net|org|click|gift|xyz|ru|site|link)/i,
    /nitro-?[a-z0-9]*\.(click|gift|site|xyz|online)/i,
    /steam[a-z0-9-]*\.(gift|trade|link|store)/i
];

/**
 * Extract domains from a message content string.
 * @param {string} content
 * @returns {string[]}
 */
export function extractDomains(content) {
    if (!content) return [];
    const urlRegex = /(?:https?:\/\/)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\/[^\s]*)?/gi;
    const domains = [];
    let match;
    while ((match = urlRegex.exec(content)) !== null) {
        if (match[1]) {
            domains.push(match[1].toLowerCase());
        }
    }
    return domains;
}

/**
 * Check if message contains known phishing domains or typo-squatted variations.
 * @param {string} content
 * @returns {{ isPhishing: boolean, domain: string | null }}
 */
export function checkPhishing(content) {
    if (!content) return { isPhishing: false, domain: null };

    const domains = extractDomains(content);
    for (const d of domains) {
        // Direct blacklist match
        if (BLOCKED_DOMAINS.has(d)) {
            return { isPhishing: true, domain: d };
        }

        // Suspicious pattern match
        for (const pattern of SUSPICIOUS_PATTERNS) {
            if (pattern.test(d)) {
                return { isPhishing: true, domain: d };
            }
        }
    }

    return { isPhishing: false, domain: null };
}
