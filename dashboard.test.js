const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const http = require('node:http');
const { createDashboard, getChatSummaries, getChatMessages } = require('./dashboard');

test('message viewer bypasses chat serialization and preserves cached messages on history failure', async () => {
    const originalWindow = global.window;
    const chat = { id: { _serialized: '1234567890@lid', user: '1234567890' },
        contact: { phoneNumber: { user: '919876543210' } }, msgs: { getModelsArray: () => [
            { id: { _serialized: 'outgoing', fromMe: true }, body: 'Reply', type: 'chat', t: 20 },
            { id: { _serialized: 'incoming', fromMe: false }, body: 'Hello', type: 'chat', t: 10 },
            { isNotification: true, t: 1 }
        ] } };
    global.window = { require: name => {
        if (name === 'WAWebCollections') return { Chat: { getModelsArray: () => [chat] } };
        if (name === 'WAWebChatLoadMessages') return { loadEarlierMsgs: async () => { throw Error('r'); } };
        throw Error('Unexpected module');
    } };
    try {
        const client = { pupPage: { evaluate: (fn, id) => fn(id) }, getChatById: () => { throw Error('must not serialize chat'); } };
        const result = await getChatMessages(client, chat.id._serialized);
        assert.equal(result.number, '919876543210');
        assert.equal(result.messages.length, 2);
        assert.equal(result.messages[0].body, 'Hello');
        assert.equal(result.messages[1].fromMe, true);
        assert.match(result.warning, /Older history/);
        await assert.rejects(getChatMessages(client, '9999999999@c.us'), /no longer loaded/);
    } finally { if (originalWindow === undefined) delete global.window; else global.window = originalWindow; }
});

test('chat summaries bypass group serialization and sort personal chats', async () => {
    const originalWindow = global.window;
    global.window = { require: name => {
        assert.equal(name, 'WAWebCollections');
        return { Chat: { getModelsArray: () => [
            { id: { _serialized: '1234567890@lid', user: '1234567890' }, t: 10,
                contact: { phoneNumber: { user: '919876543210' }, pushname: 'Contact' },
                msgs: { getModelsArray: () => [{ body: 'Hello', t: 10 }] } },
            { id: { _serialized: '9999999999@c.us', user: '9999999999' }, t: 20 },
            { id: { _serialized: '123@g.us' }, serialize: () => { throw Error('r'); } },
            { id: { _serialized: 'status@broadcast' } }
        ] } };
    } };
    try {
        const summaries = await getChatSummaries({ pupPage: { evaluate: fn => fn() }, getChats: () => { throw Error('must not serialize all chats'); } });
        assert.equal(summaries.length, 2);
        assert.equal(summaries[0].id, '9999999999@c.us');
        assert.equal(summaries[1].number, '919876543210');
        assert.equal(summaries[1].preview, 'Hello');
    } finally { if (originalWindow === undefined) delete global.window; else global.window = originalWindow; }
});

test('local dashboard API with offline WhatsApp client', async t => {
    let config = { autoReplies: {}, settings: {}, ai: {}, secret: 'never-expose' };
    const runtime = { status: 'ready', failures: new Map(), connectionError: '' };
    const chat = { id: { _serialized: '1234567890@c.us', user: '1234567890' }, name: '<script>contact</script>',
        getContact: async () => ({ number: '1234567890' }), fetchMessages: async () => [{ id: { _serialized: 'm1' }, body: 'Hello', fromMe: false, timestamp: 1, type: 'chat' }] };
    const server = createDashboard({ client: { getChats: async () => [chat], getChatById: async () => chat }, getConfig: () => config, saveConfig: next => { config = next; }, runtime, port: 0 });
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dashboard-Request': '1', ...headers }, body: JSON.stringify(body) });
    await t.test('serves UI and security headers', async () => {
        const response = await fetch(base);
        assert.match(await response.text(), /WhatsApp workspace/);
        assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
        assert.equal((await fetch(base + '/.env')).status, 404);
    });
    await t.test('does not expose unrelated config or secrets', async () => {
        const response = await fetch(base + '/api/state');
        const text = await response.text(); assert.ok(!text.includes('never-expose'));
    });
    await t.test('saves and disables rules including duplicate number entries', async () => {
        assert.equal((await post('/api/rules', { number: '+1 234567890', enabled: true, reply: 'Hi' })).status, 200);
        assert.equal(config.autoReplies.contact_1234567890.enabled, true);
        config.autoReplies.duplicate = { number: '1234567890', enabled: true, reply: 'Other' };
        await post('/api/rules', { number: '1234567890', enabled: false, reply: 'Hi' });
        assert.ok(Object.values(config.autoReplies).every(r => !r.enabled));
        assert.equal((await post('/api/rules', { number: 'bad', enabled: true, reply: 'Hi' })).status, 400);
    });
    await t.test('validates and saves owner instructions without discarding existing configuration', async () => {
        assert.equal((await post('/api/settings', { instructions: 'Be concise', enabled: true, replyDelay: 0, cooldownMs: 1000 })).status, 200);
        assert.equal(config.ai.instructions, 'Be concise'); assert.equal(config.secret, 'never-expose');
        assert.equal((await post('/api/settings', { instructions: '', enabled: true, replyDelay: -1, cooldownMs: 0 })).status, 400);
    });
    await t.test('rejects foreign origins and host headers', async () => {
        assert.equal((await post('/api/settings', {}, { Origin: 'https://attacker.example' })).status, 403);
        const status = await new Promise((resolve, reject) => {
            http.get(base + '/api/state', { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
        });
        assert.equal(status, 403);
        assert.equal((await fetch(base + '/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    });
    await t.test('loads chats and messages and rejects invalid chat identifiers', async () => {
        assert.equal((await (await fetch(base + '/api/chats')).json()).chats.length, 1);
        assert.equal((await (await fetch(base + '/api/messages?chat=1234567890%40c.us')).json()).messages[0].body, 'Hello');
        assert.equal((await fetch(base + '/api/messages?chat=group@g.us')).status, 400);
        runtime.status = 'disconnected';
        assert.equal((await fetch(base + '/api/messages?chat=1234567890%40c.us')).status, 409);
        assert.deepEqual((await (await fetch(base + '/api/chats')).json()).chats, []);
    });
});
