import { Events } from 'discord.js';
import { checkIntegrationsUpdate } from '../../security/detection/integrationProtection.js';

export const data = {
    name: Events.GuildIntegrationsUpdate,
    once: false,
    /**
     * @param {import('discord.js').Guild} guild
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(guild, client) {
        if (!guild?.id) return;
        try {
            await checkIntegrationsUpdate(guild);
        } catch (err) {
            client?.logger?.warn?.(`[GuildIntegrationsUpdate] Error handling integrations update: ${err?.message}`);
        }
    }
};
