import http from 'node:http';
import { applyLockdownProfile } from '../services/lockdown/lockdownProfiles.js';

/**
 * Hardened, Secure Dashboard API Server
 * Enforces per-guild authorization, mandatory high-entropy tokens, rate limiting, and input validation.
 */
export class DashboardApiServer {
    constructor({
        client = null,
        apiSecret = process.env.DASHBOARD_API_TOKEN,
        port = 0,
        host = '127.0.0.1',
        rateLimitMax = 60,
        rateLimitWindowMs = 60000,
        guildScopes = new Map()
    } = {}) {
        this.client = client;
        this.apiSecret = apiSecret ? String(apiSecret).trim() : null;
        this.port = port;
        this.host = host;
        this.server = null;
        this.rateLimitMax = rateLimitMax;
        this.rateLimitWindowMs = rateLimitWindowMs;
        this.rateLimitMap = new Map(); // ip -> { count, resetAt }
        this.guildScopes = guildScopes instanceof Map ? guildScopes : new Map(); // token -> Set<guildId> or '*'
    }

    /**
     * Grant a token access to specific guilds
     * @param {string} token
     * @param {string[] | string} allowedGuilds - Array of guild IDs or '*' for all
     */
    registerTokenScope(token, allowedGuilds) {
        if (!token) return;
        const scopes = Array.isArray(allowedGuilds) ? new Set(allowedGuilds) : new Set([allowedGuilds]);
        this.guildScopes.set(token, scopes);
    }

    /**
     * Check if a token is authorized for a specific guild
     * @param {string} token
     * @param {string} guildId
     * @returns {boolean}
     */
    isTokenAuthorizedForGuild(token, guildId) {
        if (!token || !guildId) return false;
        // Check registered scopes
        const scopes = this.guildScopes.get(token);
        if (scopes) {
            return scopes.has('*') || scopes.has(guildId);
        }
        // If it matches the master secret, it is authorized if no explicit scopes are set or if allowed
        if (this.apiSecret && token === this.apiSecret) {
            return true;
        }
        return false;
    }

    _checkRateLimit(identifier) {
        const now = Date.now();
        const record = this.rateLimitMap.get(identifier);
        if (!record || now > record.resetAt) {
            this.rateLimitMap.set(identifier, { count: 1, resetAt: now + this.rateLimitWindowMs });
            return true;
        }
        record.count += 1;
        if (record.count > this.rateLimitMax) {
            return false;
        }
        return true;
    }

    start() {
        return new Promise((resolve, reject) => {
            // Refuse to start if authentication secret is missing, too short, or uses known insecure defaults
            if (!this.apiSecret || this.apiSecret.length < 16 || this.apiSecret === 'test_secret_key_123') {
                return reject(new Error('DashboardApiServer refused to start: Secure DASHBOARD_API_TOKEN (minimum 16 characters) is required.'));
            }

            this.server = http.createServer(async (req, res) => {
                const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
                res.setHeader('Content-Type', 'application/json');

                // 1. Rate Limiting Check
                const clientIp = req.socket?.remoteAddress || 'unknown';
                if (!this._checkRateLimit(clientIp)) {
                    res.writeHead(429);
                    return res.end(JSON.stringify({ error: 'Too Many Requests: Rate limit exceeded' }));
                }

                // 2. Public health endpoint (Never exposes tokens or sensitive internals)
                if (url.pathname === '/api/health' && req.method === 'GET') {
                    res.writeHead(200);
                    return res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
                }

                // 3. Authentication Check
                const authHeader = req.headers['authorization'];
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    res.writeHead(401);
                    return res.end(JSON.stringify({ error: 'Unauthorized: Bearer token required' }));
                }

                const bearerToken = authHeader.slice(7).trim();
                const isMasterToken = bearerToken === this.apiSecret;
                const isRegisteredToken = this.guildScopes.has(bearerToken);

                if (!isMasterToken && !isRegisteredToken) {
                    res.writeHead(401);
                    return res.end(JSON.stringify({ error: 'Unauthorized: Invalid token' }));
                }

                // 4. Guild Route Parameter & Authorization Check
                const guildRouteMatch = url.pathname.match(/^\/api\/guild\/([a-zA-Z0-9_-]{1,32})(\/[a-zA-Z0-9_-]+)?$/);
                if (guildRouteMatch) {
                    const targetGuildId = guildRouteMatch[1];
                    const subAction = guildRouteMatch[2] ? guildRouteMatch[2].slice(1) : 'status';

                    // Verify tenant / guild isolation
                    if (!this.isTokenAuthorizedForGuild(bearerToken, targetGuildId)) {
                        res.writeHead(403);
                        return res.end(JSON.stringify({ error: `Forbidden: Token not authorized for guild ${targetGuildId}` }));
                    }

                    // Guild Status: GET /api/guild/:guildId/status
                    if (subAction === 'status' && req.method === 'GET') {
                        const antinukeData = (typeof this.client?.getAntinukeData === 'function'
                            ? await this.client.getAntinukeData(targetGuildId)
                            : null) || {};

                        res.writeHead(200);
                        return res.end(JSON.stringify({
                            guildId: targetGuildId,
                            enabled: Boolean(antinukeData.enabled),
                            punishment: antinukeData.punishment || antinukeData.action || 'ban',
                            disabledEvents: antinukeData.disabledEvents || []
                        }));
                    }

                    // Guild Lockdown: POST /api/guild/:guildId/lockdown
                    if (subAction === 'lockdown' && req.method === 'POST') {
                        const guild = this.client?.guilds?.cache?.get?.(targetGuildId) || null;
                        if (!guild) {
                            res.writeHead(404);
                            return res.end(JSON.stringify({ error: 'Guild not found on this shard' }));
                        }

                        const result = await applyLockdownProfile(guild, 'STRICT');
                        res.writeHead(200);
                        return res.end(JSON.stringify({ success: true, lockdown: result }));
                    }
                }

                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Endpoint not found' }));
            });

            this.server.listen(this.port, this.host, () => {
                const addr = this.server.address();
                this.port = typeof addr === 'object' && addr ? addr.port : this.port;
                resolve(this.port);
            });
            this.server.on('error', reject);
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve(true));
            } else {
                resolve(true);
            }
        });
    }
}
