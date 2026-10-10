import { extractDomains } from './phishingDetector.js';

const DEFAULT_WHITELIST = new Set([
    'discord.com',
    'discord.gg',
    'discordapp.com',
    'youtube.com',
    'youtu.be',
    'tenor.com',
    'giphy.com',
    'github.com',
    'twitter.com',
    'x.com',
    'spotify.com'
]);

/**
 * Check if message contains unauthorized external links.
 * @param {string} content
 * @param {Set<string> | Array<string>} [customWhitelist]
 * @returns {{ hasUnauthorizedLink: boolean, blockedDomains: string[] }}
 */
export function checkUnauthorizedLinks(content, customWhitelist = []) {
    const domains = extractDomains(content);
    if (domains.length === 0) {
        return { hasUnauthorizedLink: false, blockedDomains: [] };
    }

    const whitelist = new Set([
        ...DEFAULT_WHITELIST,
        ...(Array.isArray(customWhitelist) ? customWhitelist : Array.from(customWhitelist))
    ]);

    const blocked = [];
    for (const d of domains) {
        // Strip subdomains for generic match (e.g. cdn.discordapp.com -> discordapp.com)
        const parts = d.split('.');
        const root = parts.slice(-2).join('.');

        if (!whitelist.has(d) && !whitelist.has(root)) {
            blocked.push(d);
        }
    }

    return {
        hasUnauthorizedLink: blocked.length > 0,
        blockedDomains: blocked
    };
}
