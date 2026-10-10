const flagStore = new Map(); // guildId:flagKey -> boolean

export function isFeatureEnabled(guildId, flagKey, defaultValue = false) {
    if (!flagKey) return defaultValue;
    const key = `${guildId || '*'}:${flagKey}`;
    if (flagStore.has(key)) return flagStore.get(key);

    // Check global fallback
    const globalKey = `*:${flagKey}`;
    if (flagStore.has(globalKey)) return flagStore.get(globalKey);

    return defaultValue;
}

export function setFeatureFlag(guildId, flagKey, enabled) {
    if (!flagKey) throw new Error('flagKey required');
    const key = `${guildId || '*'}:${flagKey}`;
    flagStore.set(key, Boolean(enabled));
    return { key, enabled: Boolean(enabled) };
}

export function clearFeatureFlags(guildId = null) {
    if (!guildId) {
        flagStore.clear();
        return;
    }
    for (const k of flagStore.keys()) {
        if (k.startsWith(`${guildId}:`)) flagStore.delete(k);
    }
}
