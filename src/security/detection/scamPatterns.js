/**
 * Scam Pattern Heuristic Detector
 */

const SCAM_PATTERNS = [
    /@everyone\s+.*\b(?:free|gift)\b.*\bnitro\b/i,
    /\b(?:free\s+nitro|nitro\s+free)\b.*\b(?:claim|get|drop)\b/i,
    /\bsteam\b.*\b(?:free\s+gift|wallet\s+gift|trade\s+offer)\b.*https?:\/\//i,
    /\b(?:test\s+my\s+game|playtest\s+my\s+game|beta\s+tester)\b.*(?:download|\.zip|\.rar)/i,
    /\b(?:airdrop|crypto\s+reward|eth\s+giveaway|btc\s+giveaway)\b.*https?:\/\//i
];

/**
 * Check if a message matches known scam patterns.
 * @param {string} content
 * @returns {{ isScam: boolean, matchedPattern: string | null }}
 */
export function checkScamPatterns(content) {
    if (!content || content.length < 10) {
        return { isScam: false, matchedPattern: null };
    }

    for (const pattern of SCAM_PATTERNS) {
        if (pattern.test(content)) {
            return { isScam: true, matchedPattern: pattern.toString() };
        }
    }

    return { isScam: false, matchedPattern: null };
}
