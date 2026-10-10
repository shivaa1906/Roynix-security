/**
 * Explainable Threat Scoring Engine
 */

export function calculateExplainableScore(member, { recentViolations = 0, isHoisted = false } = {}) {
    if (!member?.user) {
        return { totalScore: 0, tier: 'LOW', factors: [] };
    }

    const factors = [];
    let score = 0;

    const now = Date.now();
    const createdTimestamp = member.user.createdTimestamp || now;
    const ageDays = (now - createdTimestamp) / (1000 * 60 * 60 * 24);

    if (ageDays < 1) {
        score += 35;
        factors.push({ factor: 'Account Age < 24h', points: 35, description: 'Very new account' });
    } else if (ageDays < 7) {
        score += 15;
        factors.push({ factor: 'Account Age < 7d', points: 15, description: 'Recent account' });
    }

    if (!member.user.avatar) {
        score += 15;
        factors.push({ factor: 'Default Avatar', points: 15, description: 'No custom avatar set' });
    }

    if (isHoisted) {
        score += 15;
        factors.push({ factor: 'Hoisted Nickname', points: 15, description: 'Name starts with special sorting characters' });
    }

    if (recentViolations > 0) {
        const violationPoints = Math.min(35, recentViolations * 15);
        score += violationPoints;
        factors.push({
            factor: `${recentViolations} Recent Violations`,
            points: violationPoints,
            description: 'Triggered anti-spam or anti-link filters recently'
        });
    }

    const totalScore = Math.min(100, score);
    let tier = 'LOW';
    if (totalScore >= 70) tier = 'CRITICAL';
    else if (totalScore >= 45) tier = 'HIGH';
    else if (totalScore >= 25) tier = 'MEDIUM';

    return {
        totalScore,
        tier,
        factors
    };
}
