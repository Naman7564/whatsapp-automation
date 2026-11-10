const assert = require('node:assert/strict');
const { test } = require('node:test');
const { generateReply, isGoogleMeet } = require('./arc');

test('provider response handling', async (t) => {
    const originalFetch = global.fetch;
    const originalKey = process.env.ARC_API_KEY;
    process.env.ARC_API_KEY = 'offline-test-key';
    t.after(() => {
        global.fetch = originalFetch;
        if (originalKey === undefined) delete process.env.ARC_API_KEY;
        else process.env.ARC_API_KEY = originalKey;
    });
    await t.test('retries empty reasoning-only output with a larger budget', async () => {
        const budgets = [];
        global.fetch = async (_url, options) => {
            budgets.push(JSON.parse(options.body).max_tokens);
            return { ok: true, json: async () => ({ choices: [{ message: budgets.length === 1 ?
                { content: null, reasoning: 'private reasoning' } : { content: 'Hello! How can I help?' } }] }) };
        };
        assert.equal(await generateReply('hello'), 'Hello! How can I help?');
        assert.deepEqual(budgets, [1024, 2048]);
    });
    await t.test('accepts text content blocks', async () => {
        global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{
            message: { content: [{ type: 'text', text: 'Thanks!' }] }
        }] }) });
        assert.equal(await generateReply('thank you'), 'Thanks!');
    });
    await t.test('includes saved owner preferences alongside built-in instructions', async () => {
        global.fetch = async (_url, options) => {
            const prompt = JSON.parse(options.body).messages[0].content;
            assert.match(prompt, /Never invent facts/);
            assert.match(prompt, /Use a friendly tone/);
            return { ok: true, json: async () => ({ choices: [{ message: { content: 'Hello!' } }] }) };
        };
        assert.equal(await generateReply('hello', [], 'Use a friendly tone'), 'Hello!');
    });
    await t.test('whereabouts questions go to AI with instructions and context', async () => {
        const history = [{ role: 'user', content: 'Hi ARC' },
            { role: 'assistant', content: 'Hi! How can I help?' }];
        for (const text of ['where is naman', 'naman kahan ha', 'नमन कहाँ है?']) {
            let calls = 0;
            global.fetch = async (_url, options) => {
                calls++;
                const body = JSON.parse(options.body);
                assert.match(body.messages[0].content, /Any message for him/);
                assert.deepEqual(body.messages.slice(1, -1), history);
                assert.equal(body.messages.at(-1).content, text);
                return { ok: true, json: async () => ({ choices: [{
                    message: { content: 'AI-generated response for this conversation.' }
                }] }) };
            };
            assert.equal(await generateReply(text, history), 'AI-generated response for this conversation.');
            assert.equal(calls, 1);
        }
    });
    await t.test('fails safely after two empty answers', async () => {
        let calls = 0;
        global.fetch = async () => {
            calls++;
            return { ok: true, json: async () => ({ choices: [] }) };
        };
        await assert.rejects(generateReply('hello'), /empty answer after retry/);
        assert.equal(calls, 2);
    });
    await t.test('does not retry invalid credentials', async () => {
        let calls = 0;
        global.fetch = async () => { calls++; return { ok: false, status: 401 }; };
        await assert.rejects(generateReply('hello'), /HTTP 401: check ARC_API_KEY/);
        assert.equal(calls, 1);
    });
    await t.test('retries truncated output instead of sending a partial answer', async () => {
        let calls = 0;
        global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{
            finish_reason: ++calls === 1 ? 'length' : 'stop', message: { content: 'Hello!' }
        }] }) });
        assert.equal(await generateReply('hello'), 'Hello!');
        assert.equal(calls, 2);
    });
});

test('Google Meet links receive the exact reply without an API call', async () => {
    assert.equal(isGoogleMeet('Please join https://meet.google.com/abc-defg-hij'), true);
    assert.equal(isGoogleMeet('https://example.com'), false);
    assert.equal(await generateReply('https://meet.google.com/abc-defg-hij', []),
        'Got it. I’ll notify Naman.');
});
