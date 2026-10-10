import { PermissionFlagsBits } from 'discord.js';
import { isStagingActionAllowed } from '../../utils/stagingGuard.js';

const lockdownSnapshots = new Map(); // guildId -> snapshot

export const LOCKDOWN_PROFILES = Object.freeze({
    ISOLATION: {
        deny: [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.CreatePublicThreads,
            PermissionFlagsBits.CreatePrivateThreads,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak
        ],
        verificationLevel: 4 // VERY_HIGH
    },
    STRICT: {
        deny: [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AddReactions
        ],
        verificationLevel: 3 // HIGH
    },
    SILENT: {
        deny: [
            PermissionFlagsBits.SendMessages
        ],
        verificationLevel: 2 // MEDIUM
    }
});

/**
 * Apply a lockdown profile to a guild.
 * @param {import('discord.js').Guild} guild
 * @param {'ISOLATION' | 'STRICT' | 'SILENT'} profileName
 * @returns {Promise<{ applied: boolean, profile: string }>}
 */
export async function applyLockdownProfile(guild, profileName = 'STRICT') {
    if (!guild || !isStagingActionAllowed(guild.id).allowed) return { applied: false, profile: profileName };

    const profile = LOCKDOWN_PROFILES[profileName] || LOCKDOWN_PROFILES.STRICT;
    const everyoneRole = guild.roles?.everyone;
    if (!everyoneRole) return { applied: false, profile: profileName };

    // Capture previous state if not already locked
    if (!lockdownSnapshots.has(guild.id)) {
        lockdownSnapshots.set(guild.id, {
            permissions: BigInt(everyoneRole.permissions.bitfield),
            verificationLevel: guild.verificationLevel,
            lockedAt: Date.now()
        });
    }

    try {
        let currentBits = BigInt(everyoneRole.permissions.bitfield);
        for (const perm of profile.deny) {
            currentBits &= ~BigInt(perm);
        }
        await everyoneRole.setPermissions(currentBits);

        if (typeof guild.setVerificationLevel === 'function' && profile.verificationLevel) {
            await guild.setVerificationLevel(profile.verificationLevel).catch(() => null);
        }

        return { applied: true, profile: profileName };
    } catch {
        return { applied: false, profile: profileName };
    }
}

/**
 * Restore previous permissions and verification level after lockdown.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<{ restored: boolean }>}
 */
export async function restoreLockdownProfile(guild) {
    if (!guild || !lockdownSnapshots.has(guild.id)) {
        return { restored: false };
    }

    const snapshot = lockdownSnapshots.get(guild.id);
    const everyoneRole = guild.roles?.everyone;

    try {
        if (everyoneRole && snapshot.permissions !== undefined) {
            await everyoneRole.setPermissions(snapshot.permissions);
        }
        if (typeof guild.setVerificationLevel === 'function' && snapshot.verificationLevel !== undefined) {
            await guild.setVerificationLevel(snapshot.verificationLevel).catch(() => null);
        }
        lockdownSnapshots.delete(guild.id);
        return { restored: true };
    } catch {
        return { restored: false };
    }
}
