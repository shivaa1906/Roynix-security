import emojis from '../config/emojis.js';

export const antinukeModules = [
    // --- 24 Core AntiNuke Modules (Legacy Backwards-Compatible) ---
    { name: 'Anti Bot', key: 'antiBot', aliases: ['bot', 'antibot'], description: 'Prevents unauthorized bots from being added' },
    { name: 'Anti Ban', key: 'antiBan', aliases: ['ban', 'antiban'], description: 'Prevents unauthorized member bans' },
    { name: 'Anti Kick', key: 'antiKick', aliases: ['kick', 'antikick'], description: 'Prevents unauthorized member kicks' },
    { name: 'Anti Channel Create', key: 'antiChannelCreate', aliases: ['channelcreate', 'antichannelcreate', 'cc'], description: 'Prevents unauthorized channel creation' },
    { name: 'Anti Channel Delete', key: 'antiChannelDelete', aliases: ['channeldelete', 'antichanneldelete', 'cd'], description: 'Prevents unauthorized channel deletion' },
    { name: 'Anti Channel Update', key: 'antiChannelUpdate', aliases: ['channelupdate', 'antichannelupdate', 'cu'], description: 'Prevents unauthorized channel modifications' },
    { name: 'Anti Sticker Create', key: 'antiStickerCreate', aliases: ['stickercreate', 'antistickercreate'], description: 'Prevents unauthorized sticker creation' },
    { name: 'Anti Sticker Delete', key: 'antiStickerDelete', aliases: ['stickerdelete', 'antistickerdelete'], description: 'Prevents unauthorized sticker deletion' },
    { name: 'Anti Sticker Update', key: 'antiStickerUpdate', aliases: ['stickerupdate', 'antistickerupdate'], description: 'Prevents unauthorized sticker modifications' },
    { name: 'Anti Guild Update', key: 'antiGuildUpdate', aliases: ['guildupdate', 'antiguildupdate', 'serverupdate'], description: 'Prevents unauthorized server setting changes' },
    { name: 'Anti Role Create', key: 'antiRoleCreate', aliases: ['rolecreate', 'antirolecreate', 'rc'], description: 'Prevents unauthorized role creation' },
    { name: 'Anti Role Delete', key: 'antiRoleDelete', aliases: ['roledelete', 'antiroledelete', 'rd'], description: 'Prevents unauthorized role deletion' },
    { name: 'Anti Role Update', key: 'antiRoleUpdate', aliases: ['roleupdate', 'antiroleupdate', 'ru'], description: 'Prevents unauthorized role modifications' },
    { name: 'Anti Unban', key: 'antiUnban', aliases: ['unban', 'antiunban'], description: 'Prevents unauthorized unbanning of members' },
    { name: 'Anti Webhook Update', key: 'antiWebhookUpdate', aliases: ['webhook', 'webhookupdate', 'antiwebhook', 'antiwebhookupdate'], description: 'Prevents unauthorized webhook creation/edits' },
    { name: 'Anti Member Update', key: 'antiMemberUpdate', aliases: ['memberupdate', 'antimemberupdate'], description: 'Prevents unauthorized role assignments' },
    { name: 'Anti Emoji Update', key: 'antiEmojiUpdate', aliases: ['emojiupdate', 'antiemojiupdate'], description: 'Prevents unauthorized emoji edits' },
    { name: 'Anti Emoji Create', key: 'antiEmojiCreate', aliases: ['antiemojicreate', 'emojicreate'], description: 'Prevents unauthorized emoji creation' },
    { name: 'Anti Emoji Delete', key: 'antiEmojiDelete', aliases: ['antiemojidelete', 'emojidelete'], description: 'Prevents unauthorized emoji deletion' },
    { name: 'Anti Prune', key: 'antiPrune', aliases: ['prune', 'antiprune'], description: 'Prevents unauthorized member pruning' },
    { name: 'Anti Ping', key: 'antiPing', aliases: ['ping', 'antiping', 'everyone', 'here'], description: 'Prevents unauthorized mass mentions' },
    { name: 'Auto Recovery', key: 'autoRecovery', aliases: ['recovery', 'autorecovery', 'restore'], description: 'Automatically restores deleted/modified channels & roles' },
    { name: 'Zero-Trust Quarantine', key: 'zeroTrustQuarantine', aliases: ['zerotrust', 'quarantine', 'zt'], description: 'Automatically revokes administrative permissions from unwhitelisted bots' },
    { name: 'Circuit Breaker', key: 'circuitBreaker', aliases: ['circuit', 'breaker', 'lockdown'], description: 'Automated emergency server lockdown and multi-bot quarantine during raid bursts' },

    // --- Newly Integrated Advanced Modules ---
    { name: 'Channel Overwrite Protection', key: 'channelOverwriteProtection', aliases: ['overwrites', 'overwrite', 'cop'], description: 'Detects and reverts unauthorized dangerous permission overwrite additions' },
    { name: 'Role Position Protection', key: 'rolePositionProtection', aliases: ['roleposition', 'rolehierarchy', 'rpp'], description: 'Detects and reverts unauthorized role elevation and hierarchy tampering' },
    { name: 'Permission Escalation', key: 'permissionEscalation', aliases: ['permescalation', 'escalation', 'pe'], description: 'Reverts unauthorized administrative permission grants to roles' },
    { name: 'Invite Creation Protection', key: 'inviteProtection', aliases: ['invitecreate', 'antiinvite', 'invites'], description: 'Instantly deletes invites created by untrusted users' },
    { name: 'AutoMod Protection', key: 'automodProtection', aliases: ['automod', 'antiautomod'], description: 'Protects Discord AutoMod rules from unauthorized deletion or disabling' },
    { name: 'Integration Protection', key: 'integrationProtection', aliases: ['integration', 'integrations'], description: 'Monitors and protects guild integrations and external app connections' },
    { name: 'Join Raid Protection', key: 'joinRaid', aliases: ['joinraid', 'antiraid', 'raidjoin'], description: 'Tracks join burst velocity and trips emergency lockdown on join waves' },
    { name: 'Timeout Protection', key: 'timeoutProtection', aliases: ['timeout', 'antitimeout'], description: 'Reverts unauthorized member timeouts applied to staff and members' },
    { name: 'Phishing Filter', key: 'phishingDetector', aliases: ['phishing', 'antiphish', 'scamlinks'], description: 'Detects and deletes known phishing domains and typo-squatted variations' },
    { name: 'Scam Pattern Filter', key: 'scamPatterns', aliases: ['scampatterns', 'fakenitro', 'scam'], description: 'Blocks fake Nitro, Steam gift, and token-grabber lure patterns' },
    { name: 'Attachment Screening', key: 'attachmentScreening', aliases: ['attachments', 'antivirus', 'executables'], description: 'Blocks executable and script files (.exe, .bat, .vbs, .sh, .py)' },
    { name: 'Anti-Spam Rate Limiter', key: 'antiSpam', aliases: ['antispam', 'ratelimit', 'spam'], description: 'Per-user message rate limiter preventing rapid copy-paste spam' },
    { name: 'Voice Security', key: 'voiceSecurity', aliases: ['voicesecurity', 'voicehopping', 'voice'], description: 'Detects rapid voice hopping, channel flooding, and moderator move abuse' }
];

/**
 * Find a module by key, name, or alias
 * @param {string} query
 * @returns {object|null}
 */
export function findModule(query) {
    if (!query) return null;
    const clean = query.toString().toLowerCase().replace(/[\s\-_]/g, '');
    return antinukeModules.find(m =>
        m.key.toLowerCase() === clean ||
        m.name.toLowerCase().replace(/[\s\-_]/g, '') === clean ||
        m.aliases?.some(a => a.toLowerCase().replace(/[\s\-_]/g, '') === clean)
    ) || null;
}

/**
 * Format active protection events listing with corresponding toggle switch
 * @param {string[]} [disabledEvents=[]]
 * @returns {string}
 */
export function renderEventsList(disabledEvents = []) {
    const disabledList = Array.isArray(disabledEvents) ? disabledEvents : [];
    return antinukeModules.map(mod => {
        const isEnabled = !disabledList.includes(mod.key);
        const icon = isEnabled ? emojis.enabled : emojis.disabled;
        return `> ${icon} **${mod.name}**`;
    }).join('\n');
}
