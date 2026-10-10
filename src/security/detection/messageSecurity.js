/**
 * High-Performance Message Content Security Engine
 * Covers: Message Floods, Cross-Channel Duplicates, Caps Spam, Emoji Spam
 */

const userMessageTracker = new Map(); // guildId:userId -> Array<timestamps>
const channelMessageTracker = new Map(); // channelId -> Array<timestamps>
const userMessageHistory = new Map(); // guildId:userId -> Array<{ text: string, ts: number, channelId: string }>

const MAX_MAP_ENTRIES = 5000;

function pruneStale(now = Date.now()) {
    if (userMessageTracker.size > MAX_MAP_ENTRIES) userMessageTracker.clear();
    if (channelMessageTracker.size > MAX_MAP_ENTRIES) channelMessageTracker.clear();
    if (userMessageHistory.size > MAX_MAP_ENTRIES) userMessageHistory.clear();
}

/**
 * Check if a message exceeds per-user rate limits (anti-spam).
 * @param {string} guildId
 * @param {string} userId
 * @param {number} [maxMessages=5]
 * @param {number} [windowMs=4000]
 * @returns {{ isSpam: boolean, count: number }}
 */
export function checkUserMessageRate(guildId, userId, maxMessages = 5, windowMs = 4000) {
    if (!guildId || !userId) return { isSpam: false, count: 0 };
    pruneStale();

    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const timestamps = userMessageTracker.get(key) || [];
    const fresh = timestamps.filter(t => now - t <= windowMs);
    fresh.push(now);
    userMessageTracker.set(key, fresh);

    const count = fresh.length;
    return { isSpam: count >= maxMessages, count };
}

/**
 * Check if a channel exceeds flood limits (channel flood).
 * @param {string} channelId
 * @param {number} [maxMessages=15]
 * @param {number} [windowMs=3000]
 * @returns {{ isFlood: boolean, count: number }}
 */
export function checkChannelFlood(channelId, maxMessages = 15, windowMs = 3000) {
    if (!channelId) return { isFlood: false, count: 0 };
    pruneStale();

    const now = Date.now();
    const timestamps = channelMessageTracker.get(channelId) || [];
    const fresh = timestamps.filter(t => now - t <= windowMs);
    fresh.push(now);
    channelMessageTracker.set(channelId, fresh);

    const count = fresh.length;
    return { isFlood: count >= maxMessages, count };
}

/**
 * Detect cross-channel duplicate messages.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} channelId
 * @param {string} content
 * @param {number} [threshold=3]
 * @returns {{ isDuplicate: boolean, channels: string[] }}
 */
export function checkDuplicateMessages(guildId, userId, channelId, content, threshold = 3) {
    if (!guildId || !userId || !content || content.length < 5) {
        return { isDuplicate: false, channels: [] };
    }
    pruneStale();

    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const history = userMessageHistory.get(key) || [];
    const fresh = history.filter(h => now - h.ts <= 10000);

    const normalized = content.trim().toLowerCase();
    const matches = fresh.filter(h => h.text === normalized);

    fresh.push({ text: normalized, ts: now, channelId });
    userMessageHistory.set(key, fresh);

    const uniqueChannels = new Set(matches.map(m => m.channelId));
    uniqueChannels.add(channelId);

    const isDuplicate = matches.length + 1 >= threshold && uniqueChannels.size >= 2;
    return { isDuplicate, channels: Array.from(uniqueChannels) };
}

/**
 * Detect excessive capitalization.
 * @param {string} content
 * @param {number} [minChars=10]
 * @param {number} [ratioThreshold=0.7]
 * @returns {boolean}
 */
export function checkExcessiveCaps(content, minChars = 10, ratioThreshold = 0.7) {
    if (!content || content.length < minChars) return false;
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length < minChars) return false;

    const upperCount = (letters.match(/[A-Z]/g) || []).length;
    return (upperCount / letters.length) >= ratioThreshold;
}

/**
 * Count emojis in message text.
 * @param {string} content
 * @param {number} [maxAllowed=10]
 * @returns {{ isSpam: boolean, count: number }}
 */
export function checkEmojiSpam(content, maxAllowed = 10) {
    if (!content) return { isSpam: false, count: 0 };

    // Match custom Discord emojis: <:name:id> or <a:name:id>
    const customMatches = content.match(/<a?:[a-zA-Z0-9_]+:\d+>/g) || [];
    // Match unicode emojis
    const unicodeMatches = content.match(/\p{Extended_Pictographic}/gu) || [];

    const total = customMatches.length + unicodeMatches.length;
    return { isSpam: total > maxAllowed, count: total };
}
