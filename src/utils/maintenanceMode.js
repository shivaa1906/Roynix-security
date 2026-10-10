const maintenanceStore = new Map(); // guildId -> { enabled, expiresAt, reason }

export function enableMaintenanceMode(guildId, durationMs = 3600000, reason = 'Server Maintenance') {
    if (!guildId) return null;
    const record = {
        enabled: true,
        expiresAt: durationMs ? Date.now() + durationMs : null,
        reason,
        startedAt: Date.now()
    };
    maintenanceStore.set(guildId, record);
    return record;
}

export function isMaintenanceModeActive(guildId) {
    if (!guildId) return false;
    const record = maintenanceStore.get(guildId);
    if (!record || !record.enabled) return false;

    if (record.expiresAt && Date.now() > record.expiresAt) {
        maintenanceStore.delete(guildId);
        return false;
    }

    return true;
}

export function disableMaintenanceMode(guildId) {
    return maintenanceStore.delete(guildId);
}
