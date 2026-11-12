const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real message handler without launching Chrome or connecting to WhatsApp.
function setup({ all = true, rules = {}, ai = false, instructions = '', generateReply = async () => 'AI reply' } = {}) {
    const config = { settings: { autoReplyToAll: all, defaultReply: 'Global reply', replyDelay: 0 },
        autoReplies: rules, ai: { enabled: ai, instructions } };
    const sent = [];
    let beforeSend = () => {};
    const context = vm.createContext({
        __dirname, console: { log() {}, error() {} },
        process: { env: {}, on() {} },
        setTimeout: callback => { beforeSend(config); callback(); },
        require: name => {
            if (name === 'whatsapp-web.js') return {
                Client: class { on() {} initialize() { return Promise.resolve(); } }, LocalAuth: class {}
            };
            if (name === 'qrcode-terminal') return {};
            if (name === 'fs') return { existsSync: () => false,
                readFileSync: () => JSON.stringify(config), watchFile() {} };
            if (name === 'path') return path;
            if (name === './arc') return { generateReply };
            if (name === './dashboard') return { createDashboard() {} };
            throw Error(`Unexpected import: ${name}`);
        }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context);
    const message = { from: '74093336518899@lid', type: 'chat', body: 'Hi',
        timestamp: Math.floor(Date.now() / 1000) + 1,
        getContact: async () => null, getChat: async () => null,
        reply: async text => { sent.push(text); } };
    return { sent, message, handle: () => context.handleMessage(message),
        beforeSend: fn => { beforeSend = () => fn(vm.runInContext('config', context)); } };
}

test('global auto-reply sends to an unlisted LID contact with fixed or AI replies', async () => {
    for (const ai of [false, true]) {
        const bot = setup({ ai });
        await bot.handle();
        assert.deepEqual(bot.sent, [ai ? 'AI reply' : 'Global reply']);
    }
});

test('global auto-reply off leaves unlisted contacts alone', async () => {
    const bot = setup({ all: false });
    await bot.handle();
    assert.deepEqual(bot.sent, []);
});

test('turning global auto-reply off cancels a pending global reply', async () => {
    const bot = setup();
    bot.beforeSend(config => { config.settings.autoReplyToAll = false; });
    await bot.handle();
    assert.deepEqual(bot.sent, []);
});

test('contact rules keep priority and are rechecked before sending', async () => {
    for (const disable of [false, true]) {
        const bot = setup({ rules: { contact: { number: '74093336518899', enabled: true, reply: 'Personal reply' } } });
        if (disable) bot.beforeSend(config => { config.autoReplies.contact.enabled = false; });
        await bot.handle();
        assert.deepEqual(bot.sent, disable ? [] : ['Personal reply']);
    }
});

test('old messages are ignored even when global auto-reply is enabled', async () => {
    const bot = setup();
    bot.message.timestamp -= 3600;
    await bot.handle();
    assert.deepEqual(bot.sent, []);
});

test('global and contact auto-replies use the shared ARC instructions and owner preferences', async t => {
    const { generateReply, SYSTEM_PROMPT } = require('./arc');
    const originalFetch = global.fetch;
    const originalKey = process.env.ARC_API_KEY;
    process.env.ARC_API_KEY = 'offline-test-key';
    t.after(() => {
        global.fetch = originalFetch;
        if (originalKey === undefined) delete process.env.ARC_API_KEY;
        else process.env.ARC_API_KEY = originalKey;
    });
    const requests = [];
    global.fetch = async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Hello from ARC' } }] }) };
    };
    for (const all of [true, false]) {
        const bot = setup({ all, ai: true, instructions: 'Use a friendly tone.', generateReply,
            rules: all ? {} : { contact: { number: '74093336518899', enabled: true, reply: 'Fixed reply' } } });
        await bot.handle();
        assert.deepEqual(bot.sent, ['Hello from ARC']);
        const request = requests.at(-1);
        assert.equal(request.messages[0].role, 'system');
        assert.ok(request.messages[0].content.startsWith(SYSTEM_PROMPT));
        assert.ok(request.messages[0].content.includes('Use a friendly tone.'));
        assert.equal(request.messages.at(-1).content, 'Hi');
    }
    assert.equal(requests.length, 2);
});
