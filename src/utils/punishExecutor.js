/**
 * Ultra-low latency executor punishment resolver (0ms per-executor deduplication & direct REST ban)
 * @param {import('discord.js').Guild} guild 
 * @param {import('discord.js').User | { id: string }} executor 
 * @param {'ban'|'kick'} punishment 
 * @param {string} reason 
 * @param {import('../base/Roynix.js').Roynix} client 
 * @param {string} [trackingKey] 
 * @returns {Promise<string>}
 */
export async function punishExecutor(guild, executor, punishment = 'ban', reason = 'Roynix Antinuke System', client = null, trackingKey = null) {
    if (!guild || !executor?.id) return 'No Action';

    const botClient = client || guild.client;
    const executorKey = `${guild.id}_punished_${executor.id}`;

    // 1. Check if this executor was ALREADY punished in this guild within the last 15s (prevents 50x redundant ban spam during mass nuke)
    if (botClient?.antinukeActionTracker) {
        if (botClient.antinukeActionTracker.has(executorKey)) {
            const tracked = botClient.antinukeActionTracker.get(executorKey);
            return tracked?.actionTaken || (punishment === 'kick' ? 'Kicked' : 'Banned');
        }
        if (trackingKey && botClient.antinukeActionTracker.has(trackingKey)) {
            const tracked = botClient.antinukeActionTracker.get(trackingKey);
            return tracked?.actionTaken || (punishment === 'kick' ? 'Kicked' : 'Banned');
        }

        const record = {
            actionTaken: punishment === 'kick' ? 'Kicked' : 'Banned',
            timestamp: Date.now()
        };
        botClient.antinukeActionTracker.set(executorKey, record);
        setTimeout(() => botClient.antinukeActionTracker.delete(executorKey), 15000).unref?.();

        if (trackingKey) {
            botClient.antinukeActionTracker.set(trackingKey, record);
            setTimeout(() => botClient.antinukeActionTracker.delete(trackingKey), 15000).unref?.();
        }
    }

    let actionTaken = '';
    try {
        if (punishment === 'ban') {
            // Fire direct REST ban immediately at 0ms without waiting for member fetch
            const banPromise = guild.bans.create(executor.id, { reason, deleteMessageSeconds: 604800 }).catch(() => null);
            const cachedMember = guild.members.cache.get(executor.id);
            const stripPromise = (cachedMember && cachedMember.manageable)
                ? cachedMember.roles.set([], `${reason} | Emergency Role Strip`).catch(() => null)
                : Promise.resolve();

            await Promise.allSettled([banPromise, stripPromise]);
            actionTaken = 'Banned';
        } else {
            // Kick mode
            const executorMember = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id).catch(() => null);
            if (executorMember) {
                const stripPromise = executorMember.manageable
                    ? executorMember.roles.set([], `${reason} | Emergency Role Strip`).catch(() => null)
                    : Promise.resolve();
                const kickPromise = executorMember.kickable
                    ? executorMember.kick(reason).catch(() => null)
                    : Promise.resolve();
                await Promise.allSettled([stripPromise, kickPromise]);
                actionTaken = executorMember.kickable ? 'Kicked' : 'Roles Stripped';
            }
        }
    } catch {}

    return actionTaken || 'No Action';
}
