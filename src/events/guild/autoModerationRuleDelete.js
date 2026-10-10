import { Events } from 'discord.js';
import { checkAutomodRuleChange } from '../../security/detection/automodProtection.js';

export const data = {
    name: Events.AutoModerationRuleDelete,
    once: false,
    /**
     * @param {import('discord.js').AutoModerationRule} rule
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(rule, client) {
        if (!rule?.guild) return;
        try {
            await checkAutomodRuleChange(rule, 'delete');
        } catch (err) {
            client?.logger?.warn?.(`[AutoModerationRuleDelete] Error handling rule delete: ${err?.message}`);
        }
    }
};
