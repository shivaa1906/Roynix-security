const HOIST_CHARS = /^[\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]+/i;

/**
 * Check and sanitize member nickname against dehoisting and abuse.
 * @param {import('discord.js').GuildMember} member
 * @returns {Promise<{ dehoisted: boolean, oldNickname: string, newNickname: string }>}
 */
export async function sanitizeNickname(member) {
    if (!member?.manageable) {
        return { dehoisted: false, oldNickname: member?.displayName || '', newNickname: member?.displayName || '' };
    }

    const currentName = member.nickname || member.user?.username || '';
    if (!HOIST_CHARS.test(currentName)) {
        return { dehoisted: false, oldNickname: currentName, newNickname: currentName };
    }

    // Strip leading hoist characters
    let cleaned = currentName.replace(HOIST_CHARS, '').trim();
    if (!cleaned || cleaned.length < 2) {
        cleaned = `Dehoisted-${member.user.discriminator || 'User'}`;
    }

    try {
        await member.setNickname(cleaned, 'Roynix Security: Automatic Dehoisting');
        return { dehoisted: true, oldNickname: currentName, newNickname: cleaned };
    } catch {
        return { dehoisted: false, oldNickname: currentName, newNickname: currentName };
    }
}
