export function generateSecurityRecommendations(guild, antinukeData) {
    const recommendations = [];

    if (!antinukeData?.enabled) {
        recommendations.push({
            priority: 'HIGH',
            title: 'Enable AntiNuke System',
            description: 'Run /antinuke enable to activate real-time server protection and event monitoring.'
        });
        return recommendations;
    }

    const disabled = antinukeData.disabledEvents || [];

    if (disabled.includes('antiBot')) {
        recommendations.push({
            priority: 'HIGH',
            title: 'Enable AntiBot Protection',
            description: 'Unauthorized bots can introduce malicious integration roles and permissions.'
        });
    }

    if (disabled.includes('antiWebhookUpdate')) {
        recommendations.push({
            priority: 'HIGH',
            title: 'Enable AntiWebhook Protection',
            description: 'Webhooks can be used to bypass channel restrictions and blast spam.'
        });
    }

    if (!antinukeData.protectRole) {
        recommendations.push({
            priority: 'MEDIUM',
            title: 'Configure Roynix Protect Role',
            description: 'Ensure the Roynix Protect role is positioned near the top of Server Settings → Roles.'
        });
    }

    if (!antinukeData.extraOwners || antinukeData.extraOwners.length === 0) {
        recommendations.push({
            priority: 'LOW',
            title: 'Assign Trusted Extra Owners',
            description: 'Designate trusted co-owners to manage emergency lockdowns when the server owner is offline.'
        });
    }

    return recommendations;
}
