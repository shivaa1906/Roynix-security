import { redactSecrets } from '../../utils/logger.js';

export function exportIncidentsToJSON(incidents = []) {
    const sanitized = incidents.map(inc => ({
        id: inc.incidentId || inc.id,
        guildId: inc.guildId || inc.guild_id,
        timestamp: inc.timestamp || inc.createdAt,
        moduleKey: inc.moduleKey || inc.module_key,
        actorId: inc.actorId || inc.executorId,
        severity: inc.severity,
        actionTaken: inc.actionTaken || inc.action_taken,
        status: inc.status || 'resolved'
    }));
    return JSON.stringify(sanitized, null, 2);
}

export function exportIncidentsToMarkdown(incidents = []) {
    let md = '# Security Incident Export Report\n\n';
    md += '| Timestamp | Module | Severity | Actor | Action Taken |\n';
    md += '| :--- | :--- | :--- | :--- | :--- |\n';

    for (const inc of incidents) {
        const ts = new Date(inc.timestamp || inc.createdAt || Date.now()).toISOString();
        const mod = inc.moduleKey || inc.module_key || 'Unknown';
        const sev = inc.severity || 'MEDIUM';
        const actor = inc.actorId || inc.executorId || 'Unknown';
        const action = inc.actionTaken || inc.action_taken || 'None';
        md += `| ${ts} | ${mod} | ${sev} | \`${actor}\` | ${action} |\n`;
    }

    return redactSecrets(md);
}
