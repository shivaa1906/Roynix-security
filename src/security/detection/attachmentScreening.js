/**
 * Malicious Attachment & Executable File Screening
 */

const DANGEROUS_EXTENSIONS = new Set([
    'exe', 'scr', 'bat', 'cmd', 'vbs', 'vbe', 'js', 'jse',
    'wsf', 'wsh', 'ps1', 'ps2', 'psc1', 'psc2', 'msh', 'msh1',
    'msi', 'msp', 'mst', 'jar', 'pif', 'com', 'hta', 'cpl'
]);

/**
 * Screen message attachments for dangerous executables and scripts.
 * @param {Array<{ name?: string, url?: string }>} attachments
 * @returns {{ isDangerous: boolean, blockedFiles: string[] }}
 */
export function screenAttachments(attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return { isDangerous: false, blockedFiles: [] };
    }

    const blocked = [];
    for (const att of attachments) {
        const filename = att.name || att.url || '';
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
            blocked.push(filename);
        }
    }

    return {
        isDangerous: blocked.length > 0,
        blockedFiles: blocked
    };
}
