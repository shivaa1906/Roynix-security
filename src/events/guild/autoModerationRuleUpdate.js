import { Events } from 'discord.js';
import { checkAutomodRuleChange } from '../../security/detection/automodProtection.js';

export const data = {
    name: Events.AutoModerationRuleUpdate,
    once: false,
    /**
     * @param {import('discord.js').AutoModerationRule} oldRule
     * @param {import('discord.js').AutoModerationRule} newRule
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(oldRule, newRule, client) {
        if (!newRule?.guild) return;
        try {
            await checkAutomodRuleChange(oldRule, 'update', newRule);
        } catch (err) {
            client?.logger?.warn?.(`[AutoModerationRuleUpdate] Error handling rule update: ${err?.message}`);
        }
    }
};
