/**
 * New-Account-Age Screening Engine
 * Note: Never bans accounts solely for age; applies restricted role or quarantine.
 */

export function screenAccountAge(member, minAgeMinutes = 1440) {
    if (!member?.user?.createdTimestamp) {
        return { isNewAccount: false, ageMinutes: 0, minAgeMinutes };
    }

    const now = Date.now();
    const ageMs = now - member.user.createdTimestamp;
    const ageMinutes = Math.floor(ageMs / 60000);

    const isNewAccount = ageMinutes < minAgeMinutes;
    return {
        isNewAccount,
        ageMinutes,
        minAgeMinutes,
        action: isNewAccount ? 'restrict' : 'allow'
    };
}
