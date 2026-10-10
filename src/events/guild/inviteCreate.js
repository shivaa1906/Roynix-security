import { Events } from 'discord.js';
import { checkInviteCreate } from '../../security/detection/inviteProtection.js';

export const data = {
    name: Events.InviteCreate,
    once: false,
    /**
     * @param {import('discord.js').Invite} invite
     * @param {import('../../base/Roynix').Roynix} client
     */
    async execute(invite, client) {
        if (!invite?.guild) return;
        try {
            await checkInviteCreate(invite);
        } catch (err) {
            client?.logger?.warn?.(`[InviteCreate] Error handling invite: ${err?.message}`);
        }
    }
};
