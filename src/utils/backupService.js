import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Creates a verified SQLite backup using WAL checkpoint and VACUUM INTO.
 * Accepts either a FastDB instance or a direct filesystem path to a SQLite database.
 * @param {import('./fastDb.js').FastDB | string} target - FastDB instance or path string
 * @param {string} [backupDir='./backups']
 * @param {number} [maxBackups=5]
 * @returns {{ backupPath: string, verified: boolean, timestamp: string }}
 */
export function createDatabaseBackup(target, backupDir = './backups', maxBackups = 5) {
    let sqliteHandle = null;
    let shouldClose = false;

    if (typeof target === 'string') {
        if (!fs.existsSync(target)) {
            throw new Error(`Database source file does not exist: ${target}`);
        }
        sqliteHandle = new DatabaseSync(target);
        shouldClose = true;
    } else if (target?.sqlite) {
        sqliteHandle = target.sqlite;
    } else {
        throw new Error('Valid FastDB instance or database file path required');
    }

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup_${timestamp}.sqlite`);

    try {
        // Checkpoint WAL first
        try {
            sqliteHandle.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        } catch {
            // Non-fatal if checkpoint cannot truncate immediately
        }

        // Execute VACUUM INTO
        sqliteHandle.exec(`VACUUM INTO '${backupPath}'`);
    } finally {
        if (shouldClose && sqliteHandle) {
            try {
                sqliteHandle.close();
            } catch {}
        }
    }

    // Verify integrity of newly created backup
    const testDb = new DatabaseSync(backupPath);
    let isIntegrityOk = false;
    try {
        const row = testDb.prepare('PRAGMA integrity_check;').get();
        isIntegrityOk = row && Object.values(row)[0] === 'ok';
    } finally {
        testDb.close();
    }

    if (!isIntegrityOk) {
        if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
        }
        throw new Error('Backup integrity verification failed');
    }

    // Rotate old backups
    const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup_') && f.endsWith('.sqlite'))
        .map(f => ({ name: f, path: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);

    while (files.length > maxBackups) {
        const oldest = files.pop();
        if (oldest && fs.existsSync(oldest.path)) {
            fs.unlinkSync(oldest.path);
        }
    }

    return { backupPath, verified: true, timestamp };
}
