import { PermissionFlagsBits } from 'discord.js';

/**
 * Resolve an executor object even when uncached in big servers
 * @param {import('discord.js').Guild} guild 
 * @param {any} entry 
 */
function resolveEntryExecutor(guild, entry) {
    if (!entry) return null;
    if (entry.executor) return entry.executor;
    const execId = entry.executorId || entry.user_id;
    if (!execId) return null;
    return guild.client?.users?.cache?.get(execId) || { id: execId, tag: `User#${String(execId).slice(-4)}` };
}

/**
 * Ultra-low latency Audit Log Executor resolver
 * 1. Checks in-memory Gateway WebSocket cache (0ms)
 * 2. Parallel race between Gateway event arrival and coalesced REST batch fetch (limit: 20)
 * 3. Automatically hydrates auditLogCache from batch REST responses so mass-nuke bursts resolve in 0ms
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').AuditLogEvent} type 
 * @param {string} [targetId] 
 * @param {import('../base/Roynix.js').Roynix} [client]
 * @returns {Promise<import('discord.js').User | null>}
 */
async function getAuditExecutor(guild, type, targetId, client) {
    try {
        if (!guild || !type) return null;

        const now = Date.now();
        const botClient = client || guild.client;

        // 1. Instant in-memory cache check (0ms!)
        if (botClient?.auditLogCache) {
            if (targetId) {
                const cached = botClient.auditLogCache.get(`${guild.id}_${type}_${targetId}`);
                if (cached && now - cached.createdTimestamp < 10000 && cached.executor) {
                    return cached.executor;
                }
            }
            const cachedGeneral = botClient.auditLogCache.get(`${guild.id}_${type}_any`);
            if (cachedGeneral && now - cachedGeneral.createdTimestamp < 8000 && cachedGeneral.executor) {
                return cachedGeneral.executor;
            }
        }

        // 2. Parallel Race: WebSocket Gateway packet arrival vs Coalesced Batch REST audit fetch
        if (botClient) {
            const eventName = `auditLog_${guild.id}_${type}`;

            const wsPromise = new Promise((resolve) => {
                const onEntry = (data) => {
                    if (!targetId || data.targetId === targetId || data.targetId === 'any') {
                        botClient.removeListener(eventName, onEntry);
                        resolve(data.executor);
                    }
                };
                botClient.on(eventName, onEntry);
                setTimeout(() => {
                    botClient.removeListener(eventName, onEntry);
                    resolve(null);
                }, 75).unref?.();
            });

            const restPromise = (async () => {
                if (guild.members.me && !guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;

                // Coalesce concurrent requests for same guild/type to prevent Discord 429 Rate Limits
                if (!botClient._auditFetchPromises) botClient._auditFetchPromises = new Map();
                const fetchKey = `${guild.id}_${type}`;
                let inFlight = botClient._auditFetchPromises.get(fetchKey);
                if (!inFlight) {
                    inFlight = guild.fetchAuditLogs({ type, limit: 20 }).catch(() => null).finally(() => {
                        botClient._auditFetchPromises.delete(fetchKey);
                    });
                    botClient._auditFetchPromises.set(fetchKey, inFlight);
                }

                const fetchedLogs = await inFlight;
                if (!fetchedLogs?.entries) return null;

                // Hydrate in-memory cache with all recent entries from this batch
                if (botClient.auditLogCache) {
                    for (const [_, log] of fetchedLogs.entries) {
                        if (now - log.createdTimestamp < 10000) {
                            const exec = resolveEntryExecutor(guild, log);
                            if (exec) {
                                const logTargetId = log.target?.id || log.targetId || 'any';
                                const cacheData = {
                                    guildId: guild.id,
                                    action: type,
                                    targetId: logTargetId,
                                    executor: exec,
                                    createdTimestamp: log.createdTimestamp
                                };
                                botClient.auditLogCache.set(`${guild.id}_${type}_${logTargetId}`, cacheData);
                                if (!botClient.auditLogCache.has(`${guild.id}_${type}_any`)) {
                                    botClient.auditLogCache.set(`${guild.id}_${type}_any`, cacheData);
                                }
                            }
                        }
                    }
                }

                // Exact target match first
                let entry = fetchedLogs.entries.find(log => targetId ? (log.target?.id === targetId || log.targetId === targetId) : true);

                // Fallback to most recent entry of this exact action type within 6 seconds (handles mass-deletion bursts)
                if (!entry) {
                    const first = fetchedLogs.entries.first();
                    if (first && (now - first.createdTimestamp < 6000)) {
                        entry = first;
                    }
                }

                if (entry && (now - entry.createdTimestamp < 10000)) {
                    return resolveEntryExecutor(guild, entry);
                }
                return null;
            })();

            const winner = await Promise.race([
                wsPromise.then(res => res ? res : new Promise(() => {})),
                restPromise.then(res => res ? res : new Promise(() => {})),
                new Promise(resolve => setTimeout(() => resolve(null), 150).unref?.())
            ]);

            if (winner) return winner;

            const finalRest = await restPromise;
            if (finalRest) return finalRest;
        }

        return null;
    } catch (err) {
        return null;
    }
}

export { getAuditExecutor };