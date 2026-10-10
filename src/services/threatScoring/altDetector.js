/**
 * Multi-Signal Alternate Account Risk Detector
 */

export function evaluateAltRisk(member, { isJoinRaid = false } = {}) {
    if (!member?.user) {
        return { riskScore: 0, riskTier: 'LOW', factors: [] };
    }

    const factors = [];
    let score = 0;

    const now = Date.now();
    const createdTimestamp = member.user.createdTimestamp || now;
    const ageHours = (now - createdTimestamp) / (1000 * 60 * 60);

    // Factor 1: Account Age
    if (ageHours < 24) {
        score += 40;
        factors.push('Account created less than 24 hours ago (+40)');
    } else if (ageHours < 168) {
        score += 20;
        factors.push('Account created less than 7 days ago (+20)');
    }

    // Factor 2: Default Avatar
    if (!member.user.avatar) {
        score += 20;
        factors.push('User is using default Discord avatar (+20)');
    }

    // Factor 3: Username Pattern (Randomized numbers / Bot-like naming)
    const username = member.user.username || '';
    if (/\d{4,}$/.test(username) || /^[a-z0-9]{12,}$/i.test(username)) {
        score += 15;
        factors.push('Username contains high-entropy or randomized pattern (+15)');
    }

    // Factor 4: Joined during active raid burst
    if (isJoinRaid) {
        score += 25;
        factors.push('Member joined during active join raid wave (+25)');
    }

    const cappedScore = Math.min(100, score);
    let riskTier = 'LOW';
    if (cappedScore >= 75) riskTier = 'CRITICAL';
    else if (cappedScore >= 50) riskTier = 'HIGH';
    else if (cappedScore >= 25) riskTier = 'MEDIUM';

    return {
        riskScore: cappedScore,
        riskTier,
        factors
    };
}
