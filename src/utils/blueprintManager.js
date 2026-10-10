import { ChannelType, PermissionsBitField, OverwriteType } from 'discord.js';

class BlueprintManager {
    constructor() {
        /** @type {Map<string, { channels: Map<string, object>, categories: Map<string, object>, roles: Map<string, object> }>} */
        this.guildBlueprints = new Map();
        /** @type {Map<string, string>} oldCategoryId -> newlyRecreatedCategoryId */
        this.recreatedCategories = new Map();
        /** @type {Map<string, Promise<string|null>>} oldCategoryId -> in-flight category creation promise */
        this.pendingCategories = new Map();
        /** @type {Map<string, string>} oldRoleId -> newlyRecreatedRoleId */
        this.recreatedRoles = new Map();
        /** @type {Map<string, Promise<boolean>>} oldRoleId -> in-flight role creation promise */
        this.pendingRoles = new Map();
        /** @type {Map<string, Promise<boolean>>} oldChannelId -> in-flight channel creation promise */
        this.pendingChannels = new Map();
        /** @type {Map<string, string>} liveChannelId -> originalCategoryId (for re-attaching orphaned children) */
        this.channelParentOrigin = new Map();
    }

    /**
     * Get or initialize guild blueprint storage
     * @param {string} guildId 
     */
    _getGuildBlueprint(guildId) {
        if (!this.guildBlueprints.has(guildId)) {
            this.guildBlueprints.set(guildId, {
                channels: new Map(),
                categories: new Map(),
                roles: new Map()
            });
        }
        return this.guildBlueprints.get(guildId);
    }

    /**
     * Retry helper for resilient execution under heavy big-server nuke load
     * @template T
     * @param {() => Promise<T>} fn 
     * @param {number} retries 
     * @returns {Promise<T>}
     */
    async _withRetry(fn, retries = 3) {
        let lastErr;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                lastErr = err;
                const waitMs = err?.retry_after ? Math.ceil(err.retry_after * 1000) : (400 * (attempt + 1));
                await new Promise(r => setTimeout(r, waitMs));
            }
        }
        throw lastErr;
    }

    /**
     * Capture full guild channel & role structure into blueprint memory
     * @param {import('discord.js').Guild} guild 
     */
    captureGuild(guild) {
        if (!guild) return;
        for (const [_, ch] of guild.channels.cache) {
            this.recordChannel(ch);
        }
        for (const [_, role] of guild.roles.cache) {
            this.recordRole(role);
        }
    }

    /**
     * Record or update a single role in the blueprint (including cached member IDs holding the role)
     * @param {import('discord.js').Role} role 
     */
    recordRole(role) {
        if (!role || !role.guild || role.managed || role.id === role.guild.id) return;
        const bp = this._getGuildBlueprint(role.guild.id);
        const existing = bp.roles.get(role.id);

        const memberIds = [];
        if (role.members) {
            for (const [memberId] of role.members) {
                memberIds.push(memberId);
            }
        }

        bp.roles.set(role.id, {
            id: role.id,
            name: role.name,
            color: role.color,
            hoist: role.hoist,
            position: role.rawPosition,
            permissions: role.permissions.bitfield.toString(),
            mentionable: role.mentionable,
            memberIds: memberIds.length > 0 ? memberIds : (existing?.memberIds || [])
        });
    }

    /**
     * Record or update a single channel in the blueprint
     * @param {import('discord.js').GuildChannel} channel 
     * @param {string} [originParentId]
     */
    recordChannel(channel, originParentId = null) {
        if (!channel || !channel.guild || channel.isThread?.()) return;
        const bp = this._getGuildBlueprint(channel.guild.id);

        const overwrites = [];
        if (channel.permissionOverwrites?.cache) {
            for (const [id, ow] of channel.permissionOverwrites.cache) {
                overwrites.push({
                    id,
                    type: ow.type,
                    allow: typeof ow.allow?.bitfield === 'bigint' ? ow.allow.bitfield.toString() : String(ow.allow || 0),
                    deny: typeof ow.deny?.bitfield === 'bigint' ? ow.deny.bitfield.toString() : String(ow.deny || 0)
                });
            }
        }

        const effectiveParentId = channel.parentId || originParentId || null;
        if (effectiveParentId && channel.type !== ChannelType.GuildCategory) {
            this.channelParentOrigin.set(channel.id, effectiveParentId);
        }

        const data = {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            parentId: effectiveParentId,
            position: channel.rawPosition ?? 0,
            topic: channel.topic || null,
            nsfw: Boolean(channel.nsfw),
            rateLimitPerUser: channel.rateLimitPerUser || 0,
            bitrate: channel.bitrate || null,
            userLimit: channel.userLimit || null,
            rtcRegion: channel.rtcRegion || null,
            overwrites
        };

        if (channel.type === ChannelType.GuildCategory) {
            bp.categories.set(channel.id, data);
        } else {
            bp.channels.set(channel.id, data);
        }
    }

    /**
     * Retrieve snapshot of a deleted channel
     * @param {string} guildId 
     * @param {string} channelId 
     * @returns {object|null}
     */
    getChannelSnapshot(guildId, channelId) {
        const bp = this.guildBlueprints.get(guildId);
        if (!bp) return null;
        return bp.channels.get(channelId) || bp.categories.get(channelId) || null;
    }

    /**
     * Sanitize permission overwrites, automatically remapping deleted Role IDs to newly recreated Role IDs
     * @param {import('discord.js').Guild} guild 
     * @param {Array|Collection} rawOverwrites 
     * @returns {Array<object>}
     */
    _sanitizeOverwrites(guild, rawOverwrites) {
        const safe = [];
        const items = Array.isArray(rawOverwrites)
            ? rawOverwrites
            : (rawOverwrites?.values ? Array.from(rawOverwrites.values()) : []);

        const seenIds = new Set();
        for (const ow of items) {
            if (!ow || !ow.id) continue;
            let targetId = ow.id;

            // Remap if this role was deleted and recreated during the nuke
            if (this.recreatedRoles.has(targetId)) {
                targetId = this.recreatedRoles.get(targetId);
            }

            if (seenIds.has(targetId)) continue;

            const isEveryone = targetId === guild.id;
            const isRole = guild.roles.cache.has(targetId);
            const isMember = guild.members.cache.has(targetId);

            if (isEveryone || isRole || isMember) {
                seenIds.add(targetId);
                const type = (isEveryone || isRole) ? OverwriteType.Role : OverwriteType.Member;
                const allow = typeof ow.allow === 'bigint'
                    ? ow.allow.toString()
                    : String(ow.allow?.bitfield ?? ow.allow ?? 0);
                const deny = typeof ow.deny === 'bigint'
                    ? ow.deny.toString()
                    : String(ow.deny?.bitfield ?? ow.deny ?? 0);

                safe.push({
                    id: targetId,
                    type,
                    allow,
                    deny
                });
            }
        }
        return safe;
    }

    /**
     * Ensure a deleted category is recreated exactly once (deduplicating concurrent child channel requests)
     * and re-attach any orphaned child channels that belonged to it.
     * @param {import('discord.js').Guild} guild 
     * @param {string} oldCategoryId 
     * @param {object} [categoryFallback] 
     * @returns {Promise<string|null>} New Category ID
     */
    async _ensureCategoryRecreated(guild, oldCategoryId, categoryFallback = null) {
        if (!guild || !oldCategoryId) return null;

        // 1. Check if original category is still alive
        const existing = guild.channels.cache.get(oldCategoryId);
        if (existing && existing.type === ChannelType.GuildCategory) {
            return existing.id;
        }

        // 2. Check if already recreated
        if (this.recreatedCategories.has(oldCategoryId)) {
            const mappedId = this.recreatedCategories.get(oldCategoryId);
            const mappedCat = guild.channels.cache.get(mappedId);
            if (mappedCat && mappedCat.type === ChannelType.GuildCategory) {
                return mappedCat.id;
            }
        }

        // 3. Check if recreation is currently in-flight (prevents duplicate categories when 15 child channels delete at once)
        if (this.pendingCategories.has(oldCategoryId)) {
            return await this.pendingCategories.get(oldCategoryId);
        }

        const createPromise = (async () => {
            try {
                const bp = this._getGuildBlueprint(guild.id);
                const catSnapshot = bp.categories.get(oldCategoryId) || categoryFallback;
                if (!catSnapshot) return null;

                const catName = (catSnapshot.name || 'recovered-category').slice(0, 100);
                const catPosition = catSnapshot.position ?? catSnapshot.rawPosition ?? undefined;
                const catSafeOverwrites = this._sanitizeOverwrites(
                    guild,
                    catSnapshot.overwrites || catSnapshot.permissionOverwrites?.cache || []
                );

                const newCategory = await this._withRetry(() =>
                    guild.channels.create({
                        name: catName,
                        type: ChannelType.GuildCategory,
                        position: catPosition,
                        permissionOverwrites: catSafeOverwrites,
                        reason: 'Roynix Time Machine | Category Reconstruction'
                    })
                );

                if (newCategory) {
                    this.recreatedCategories.set(oldCategoryId, newCategory.id);
                    setTimeout(() => this.recreatedCategories.delete(oldCategoryId), 120000).unref?.();
                    this.recordChannel(newCategory);

                    // Re-attach any child channels that were orphaned when the old category was deleted
                    this._reattachOrphanedChildren(guild, oldCategoryId, newCategory.id).catch(() => null);
                    return newCategory.id;
                }
                return null;
            } catch {
                return null;
            } finally {
                this.pendingCategories.delete(oldCategoryId);
            }
        })();

        this.pendingCategories.set(oldCategoryId, createPromise);
        return await createPromise;
    }

    /**
     * Re-attach surviving or already-recreated child channels whose original category was deleted after them
     * @param {import('discord.js').Guild} guild 
     * @param {string} oldCategoryId 
     * @param {string} newCategoryId 
     */
    async _reattachOrphanedChildren(guild, oldCategoryId, newCategoryId) {
        const bp = this._getGuildBlueprint(guild.id);
        for (const [chId, ch] of guild.channels.cache) {
            if (ch.type === ChannelType.GuildCategory || ch.isThread?.()) continue;
            const originParent = this.channelParentOrigin.get(chId) || bp.channels.get(chId)?.parentId;
            if (originParent === oldCategoryId && ch.parentId !== newCategoryId) {
                await ch.setParent(newCategoryId, { lockPermissions: false, reason: 'Roynix Time Machine | Re-attaching to recovered category' }).catch(() => null);
            }
        }
    }

    /**
     * Atomically restore a deleted channel with full hierarchical fidelity, deduplication, and multi-tier fallbacks
     * @param {import('discord.js').Guild} guild 
     * @param {import('discord.js').GuildChannel|object} channelFallback 
     * @returns {Promise<boolean>}
     */
    async restoreChannelHierarchical(guild, channelFallback) {
        if (!guild || !channelFallback) return false;
        const guildId = guild.id;
        const channelId = channelFallback.id;

        if (this.pendingChannels.has(channelId)) {
            return await this.pendingChannels.get(channelId);
        }

        const task = (async () => {
            try {
                const snapshot = this.getChannelSnapshot(guildId, channelId);
                const type = snapshot?.type ?? channelFallback.type ?? ChannelType.GuildText;

                // If the deleted channel IS a category, use the deduplicated category builder
                if (type === ChannelType.GuildCategory) {
                    const newCatId = await this._ensureCategoryRecreated(guild, channelId, channelFallback);
                    return Boolean(newCatId);
                }

                const name = (snapshot?.name || channelFallback.name || 'recovered-channel').slice(0, 100);
                const position = snapshot?.position ?? channelFallback.rawPosition ?? undefined;
                const rawParentId = snapshot?.parentId || channelFallback.parentId || this.channelParentOrigin.get(channelId) || null;

                // 1. Hierarchical Category Resolution (recreates parent category once if missing)
                let targetParentId = null;
                if (rawParentId) {
                    targetParentId = await this._ensureCategoryRecreated(guild, rawParentId);
                }

                // 2. Build sanitized permission overwrites (with automatic Role ID remapping)
                const safeOverwrites = this._sanitizeOverwrites(
                    guild,
                    snapshot?.overwrites || channelFallback.permissionOverwrites?.cache || []
                );

                // 3. Primary Atomic Creation with automatic retry on transient rate limits
                const baseOptions = {
                    name,
                    position,
                    parent: targetParentId || undefined,
                    permissionOverwrites: safeOverwrites,
                    reason: 'Roynix Time Machine | Channel Auto-Recovery'
                };

                let createdChannel = null;

                createdChannel = await this._withRetry(async () => {
                    switch (type) {
                        case ChannelType.GuildText:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildText,
                                topic: (snapshot?.topic || channelFallback.topic || undefined)?.slice(0, 1024),
                                nsfw: Boolean(snapshot?.nsfw ?? channelFallback.nsfw),
                                rateLimitPerUser: Math.min(snapshot?.rateLimitPerUser || channelFallback.rateLimitPerUser || 0, 21600)
                            });

                        case ChannelType.GuildVoice:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildVoice,
                                bitrate: snapshot?.bitrate || channelFallback.bitrate || undefined,
                                userLimit: snapshot?.userLimit || channelFallback.userLimit || undefined,
                                rtcRegion: snapshot?.rtcRegion || channelFallback.rtcRegion || undefined
                            });

                        case ChannelType.GuildAnnouncement:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildAnnouncement,
                                topic: (snapshot?.topic || channelFallback.topic || undefined)?.slice(0, 1024),
                                nsfw: Boolean(snapshot?.nsfw ?? channelFallback.nsfw)
                            });

                        case ChannelType.GuildStageVoice:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildStageVoice,
                                bitrate: snapshot?.bitrate || channelFallback.bitrate || undefined,
                                userLimit: snapshot?.userLimit || channelFallback.userLimit || undefined
                            });

                        case ChannelType.GuildForum:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildForum,
                                topic: (snapshot?.topic || channelFallback.topic || undefined)?.slice(0, 1024),
                                rateLimitPerUser: Math.min(snapshot?.rateLimitPerUser || channelFallback.rateLimitPerUser || 0, 21600)
                            });

                        default:
                            return await guild.channels.create({
                                ...baseOptions,
                                type: ChannelType.GuildText
                            });
                    }
                });

                if (createdChannel) {
                    this.recordChannel(createdChannel, rawParentId);
                    return true;
                }
                return false;
            } catch (err) {
                // Tier-2 Fallback: Create safe channel without parent/overwrites if constraints failed
                try {
                    const safeName = (channelFallback.name || 'recovered-channel').slice(0, 100);
                    const isCat = channelFallback.type === ChannelType.GuildCategory;
                    const fallbackChannel = await guild.channels.create({
                        name: safeName,
                        type: isCat ? ChannelType.GuildCategory : ChannelType.GuildText,
                        reason: 'Roynix Time Machine | Resilient Fallback Channel Recovery'
                    });
                    if (fallbackChannel) {
                        this.recordChannel(fallbackChannel, channelFallback.parentId || null);
                        return true;
                    }
                } catch {}
                return false;
            } finally {
                this.pendingChannels.delete(channelId);
            }
        })();

        this.pendingChannels.set(channelId, task);
        return await task;
    }

    /**
     * Atomically restore a deleted role from blueprint memory, remap IDs, and re-assign to cached members
     * @param {import('discord.js').Guild} guild 
     * @param {string|import('discord.js').Role} roleFallback 
     * @returns {Promise<boolean>}
     */
    async restoreRole(guild, roleFallback) {
        if (!guild || !roleFallback) return false;
        const roleId = typeof roleFallback === 'string' ? roleFallback : roleFallback.id;

        if (this.recreatedRoles.has(roleId)) return true;
        if (this.pendingRoles.has(roleId)) return await this.pendingRoles.get(roleId);

        const task = (async () => {
            try {
                const bp = this._getGuildBlueprint(guild.id);
                const snapshot = bp.roles.get(roleId);

                const name = (snapshot?.name || roleFallback.name || 'recovered-role').slice(0, 100);
                const color = snapshot?.color || roleFallback.color || undefined;
                const hoist = Boolean(snapshot?.hoist ?? roleFallback.hoist);
                const mentionable = Boolean(snapshot?.mentionable ?? roleFallback.mentionable);

                let permissions = undefined;
                if (snapshot?.permissions) {
                    permissions = new PermissionsBitField(BigInt(snapshot.permissions));
                } else if (roleFallback.permissions) {
                    permissions = roleFallback.permissions;
                }

                if (guild.members.me?.permissions && permissions) {
                    permissions = permissions.bitfield & guild.members.me.permissions.bitfield;
                }

                const newRole = await this._withRetry(() =>
                    guild.roles.create({
                        name,
                        color,
                        hoist,
                        mentionable,
                        permissions,
                        reason: 'Roynix Time Machine | Blueprint Role Auto-Recovery'
                    })
                );

                if (newRole) {
                    this.recreatedRoles.set(roleId, newRole.id);
                    setTimeout(() => this.recreatedRoles.delete(roleId), 120000).unref?.();
                    this.recordRole(newRole);

                    // Restore role position safely below bot's highest role
                    const desiredPos = snapshot?.position ?? roleFallback.rawPosition;
                    const botHighest = guild.members.me?.roles?.highest?.position ?? 0;
                    if (typeof desiredPos === 'number' && desiredPos > 0 && botHighest > 1) {
                        const targetPos = Math.min(desiredPos, botHighest - 1);
                        newRole.setPosition(targetPos).catch(() => null);
                    }

                    // Re-assign role back to members who held it before deletion (up to 25 cached members to respect rate limits)
                    const memberIds = snapshot?.memberIds || [];
                    if (memberIds.length > 0) {
                        (async () => {
                            for (const memberId of memberIds.slice(0, 25)) {
                                const member = guild.members.cache.get(memberId);
                                if (member && member.manageable) {
                                    await member.roles.add(newRole.id, 'Roynix Time Machine | Restoring Deleted Role to Member').catch(() => null);
                                }
                            }
                        })();
                    }

                    return true;
                }
                return false;
            } catch {
                try {
                    const name = (typeof roleFallback === 'string' ? 'recovered-role' : roleFallback.name || 'recovered-role').slice(0, 100);
                    const newRole = await guild.roles.create({
                        name,
                        reason: 'Roynix Time Machine | Safe Fallback Role Auto-Recovery'
                    });
                    if (newRole) {
                        this.recreatedRoles.set(roleId, newRole.id);
                        return true;
                    }
                    return false;
                } catch {
                    return false;
                }
            } finally {
                this.pendingRoles.delete(roleId);
            }
        })();

        this.pendingRoles.set(roleId, task);
        return await task;
    }
}

export const blueprintManager = new BlueprintManager();
