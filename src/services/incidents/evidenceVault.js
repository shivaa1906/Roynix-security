import { createHash } from 'node:crypto';

const evidenceMap = new Map(); // incidentId -> { payloadHash, payload, timestamp }

/**
 * Store incident evidence in tamper-evident vault with SHA-256 integrity hash.
 * @param {string} incidentId
 * @param {object} payload
 * @returns {{ hash: string, timestamp: number }}
 */
export function vaultIncidentEvidence(incidentId, payload) {
    if (!incidentId || !payload) throw new Error('incidentId and payload required');

    const serialized = JSON.stringify(payload);
    const hash = createHash('sha256').update(serialized).digest('hex');
    const timestamp = Date.now();

    evidenceMap.set(incidentId, {
        payloadHash: hash,
        payload: serialized,
        timestamp
    });

    return { hash, timestamp };
}

/**
 * Verify integrity of stored evidence.
 * @param {string} incidentId
 * @param {object} currentPayload
 * @returns {{ valid: boolean, originalHash: string | null, currentHash: string }}
 */
export function verifyEvidenceIntegrity(incidentId, currentPayload) {
    const record = evidenceMap.get(incidentId);
    if (!record) return { valid: false, originalHash: null, currentHash: '' };

    const currentHash = createHash('sha256').update(JSON.stringify(currentPayload)).digest('hex');
    const valid = record.payloadHash === currentHash;

    return {
        valid,
        originalHash: record.payloadHash,
        currentHash
    };
}

/**
 * Retrieve vaulted evidence record.
 * @param {string} incidentId
 * @returns {object | null}
 */
export function getVaultedEvidence(incidentId) {
    const record = evidenceMap.get(incidentId);
    if (!record) return null;
    return {
        payloadHash: record.payloadHash,
        payload: JSON.parse(record.payload),
        timestamp: record.timestamp
    };
}
