import test from 'node:test';
import assert from 'node:assert/strict';
import {
    checkUserMessageRate,
    checkChannelFlood,
    checkDuplicateMessages,
    checkExcessiveCaps,
    checkEmojiSpam
} from '../src/security/detection/messageSecurity.js';
import { checkPhishing, extractDomains } from '../src/security/detection/phishingDetector.js';
import { checkUnauthorizedLinks } from '../src/security/detection/linkProtection.js';
import { screenAttachments } from '../src/security/detection/attachmentScreening.js';
import { checkScamPatterns } from '../src/security/detection/scamPatterns.js';
import { checkVoiceState } from '../src/security/detection/voiceSecurity.js';
import { createMockClient, createMockGuild, createMockMember } from './fixtures/mockDiscord.js';

test('Phase 3 [MSG-RATE-01]: checkUserMessageRate detects user spam burst', () => {
    const g = 'guild-msg-rate';
    const u = 'user-spammer';

    for (let i = 0; i < 4; i++) {
        const res = checkUserMessageRate(g, u, 5, 4000);
        assert.equal(res.isSpam, false);
    }
    const res5 = checkUserMessageRate(g, u, 5, 4000);
    assert.equal(res5.isSpam, true, '5th message in 4s must trip spam flag');
});

test('Phase 3 [MSG-FLOOD-01]: checkChannelFlood detects channel flood bursts', () => {
    const chan = 'chan-flood-1';
    for (let i = 0; i < 14; i++) {
        const res = checkChannelFlood(chan, 15, 3000);
        assert.equal(res.isFlood, false);
    }
    const res15 = checkChannelFlood(chan, 15, 3000);
    assert.equal(res15.isFlood, true, '15th message in 3s must trip channel flood flag');
});

test('Phase 3 [MSG-DUP-01]: checkDuplicateMessages flags cross-channel copy-paste spam', () => {
    const g = 'guild-dup';
    const u = 'spammer-cross';
    const text = 'Check out this totally free money giveaway guys!';

    // Send in channel 1
    const r1 = checkDuplicateMessages(g, u, 'c1', text, 3);
    assert.equal(r1.isDuplicate, false);

    // Send in channel 2
    const r2 = checkDuplicateMessages(g, u, 'c2', text, 3);
    assert.equal(r2.isDuplicate, false);

    // Send in channel 3
    const r3 = checkDuplicateMessages(g, u, 'c3', text, 3);
    assert.equal(r3.isDuplicate, true, 'Duplicate across 3 channels must trip duplicate flag');
});

test('Phase 3 [CAPS-01]: checkExcessiveCaps accurately flags uppercase text', () => {
    assert.equal(checkExcessiveCaps('HELLO EVERYONE PLEASE JOIN THIS RIGHT NOW', 10, 0.7), true);
    assert.equal(checkExcessiveCaps('Hello everyone, please join our server!', 10, 0.7), false);
    assert.equal(checkExcessiveCaps('SHORT', 10, 0.7), false); // Under min length
});

test('Phase 3 [EMOJI-01]: checkEmojiSpam counts custom and unicode emojis', () => {
    const spamMsg = '😀😃😄😁😆😅😂🤣😭😗😙😚 <:custom_1:1234567890> <a:custom_2:9876543210>';
    const cleanMsg = 'Hello there! 😄 How are you?';

    assert.equal(checkEmojiSpam(spamMsg, 10).isSpam, true);
    assert.equal(checkEmojiSpam(cleanMsg, 10).isSpam, false);
});

test('Phase 3 [PHISH-01]: checkPhishing catches typo-squatting and scam domains', () => {
    assert.equal(checkPhishing('Click here: https://discorcl.com/nitro-gift').isPhishing, true);
    assert.equal(checkPhishing('Join steam: http://steamcornmunity.com/trade').isPhishing, true);
    assert.equal(checkPhishing('Official site: https://discord.com/app').isPhishing, false);
    assert.equal(checkPhishing('Clean link: https://google.com').isPhishing, false);
});

test('Phase 3 [LINKS-01]: checkUnauthorizedLinks enforces domain whitelisting', () => {
    const safeContent = 'Watch this: https://youtube.com/watch?v=123 and join https://discord.gg/abc';
    const unsafeContent = 'Go to this random site: https://malicious-tracker.ru/download';

    assert.equal(checkUnauthorizedLinks(safeContent).hasUnauthorizedLink, false);
    assert.equal(checkUnauthorizedLinks(unsafeContent).hasUnauthorizedLink, true);
});

test('Phase 3 [ATTACH-01]: screenAttachments flags dangerous executables and scripts', () => {
    const dangerous = [{ name: 'setup_free_nitro.exe' }];
    const script = [{ name: 'update_tool.bat' }];
    const safe = [{ name: 'screenshot.png' }, { name: 'rules.pdf' }];

    assert.equal(screenAttachments(dangerous).isDangerous, true);
    assert.equal(screenAttachments(script).isDangerous, true);
    assert.equal(screenAttachments(safe).isDangerous, false);
});

test('Phase 3 [SCAM-01]: checkScamPatterns detects fake nitro and token grabber bait', () => {
    assert.equal(checkScamPatterns('@everyone get your free nitro claim now at http://link.com').isScam, true);
    assert.equal(checkScamPatterns('Hey check out my beta tester game download at http://link.zip').isScam, true);
    assert.equal(checkScamPatterns('Good morning everyone, hope you have a great day!').isScam, false);
});

test('Phase 3 [VOICE-01]: checkVoiceState detects rapid channel hopping', async () => {
    const client = createMockClient();
    const guild = createMockGuild({ client });
    const member = createMockMember({ id: 'hopper-1', guild });
    let disconnected = false;

    client.getAntinukeData = async () => ({
        enabled: true,
        action: 'kick'
    });

    member.voice = {
        disconnect: async () => { disconnected = true; }
    };

    // Simulate 5 rapid hops
    for (let i = 1; i <= 4; i++) {
        await checkVoiceState({ channelId: `vc-${i}`, member, guild }, { channelId: `vc-${i + 1}`, member, guild });
    }
    const res5 = await checkVoiceState({ channelId: 'vc-4', member, guild }, { channelId: 'vc-5', member, guild });

    assert.equal(res5.actionTaken, 'disconnected_for_hopping');
    assert.equal(disconnected, true, 'Rapid voice hopper must be disconnected');
});
