// Offline browser regression coverage. Fixtures are never shipped to the UI.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { createDashboard } = require('./dashboard');

test('responsive dashboard and read-only conversation flows', { timeout: 120000 }, async t => {
    let config = { autoReplies: { test: { number: '919876543210', enabled: true, reply: 'Test reply' } }, ai: {}, settings: {} };
    let failMessages = false;
    const runtime = { status: 'ready', failures: new Map(), connectionError: '' };
    const chats = Array.from({ length: 45 }, (_, index) => ({
        id: { _serialized: `${919876543210 + index}@c.us`, user: String(919876543210 + index) },
        name: index === 0 ? 'Test contact with an intentionally very long display name for overflow checks' : `Test contact ${index}`,
        timestamp: 1700000000, lastMessage: { body: 'A message preview to verify single-line truncation.' },
        unreadCount: 0
    }));
    const client = {
        getChats: async () => chats,
        getChatById: async id => {
            if (failMessages) throw Error('Intentional browser-test failure');
            return { id: { user: id.split('@')[0] }, getContact: async () => ({ number: id.split('@')[0] }),
                fetchMessages: async () => Array.from({ length: 60 }, (_, i) => ({ id: { _serialized: `test-${i}` },
                    body: i === 59 ? 'LongMessage'.repeat(120) : `Test message ${i}`, type: 'chat', fromMe: i % 2 === 0,
                    timestamp: 1700000000 + i * 4000 })) };
        }
    };
    const server = createDashboard({ client, runtime, getConfig: () => config, saveConfig: value => { config = value; }, port: 0 });
    await once(server, 'listening');
    const browser = await puppeteer.launch({ headless: true });
    t.after(async () => { await browser.close(); await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    const shots = path.join(__dirname, '.impeccable', 'verification');
    fs.mkdirSync(shots, { recursive: true });
    const waitForLoaded = () => page.waitForFunction(() => document.querySelectorAll('.chat-row').length > 0 && !document.getElementById('refresh').disabled);
    for (const [width, height] of [[1440, 900], [1024, 768], [820, 600], [375, 812], [1280, 480]]) {
        await page.setViewport({ width, height });
        await page.goto(base, { waitUntil: 'networkidle0' });
        await waitForLoaded();
        await page.click('.chat-row');
        await page.waitForSelector('.message');
        await page.$eval('#messages', el => { el.scrollTop = 0; });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width}`);
        assert.equal(await page.evaluate(() => document.querySelectorAll('.date-divider').length > 1), true);
        assert.equal(await page.$eval('.message time', el => !!el.title && !!el.dateTime), true);
        assert.equal(await page.$('textarea[aria-label="Message"]'), null);
        const geometry = await page.evaluate(() => {
            const names = ['.list-tools', '.list-foot', '.conversation-head', '.conversation-foot', '#refresh', '.connection-area'];
            return names.map(name => { const element = document.querySelector(name); const r = element.getBoundingClientRect();
                return { name, visible: !!element.getClientRects().length, top: r.top, bottom: r.bottom }; });
        });
        for (const item of geometry.filter(item => item.visible)) {
            assert.ok(item.top >= 0 && item.bottom <= height + 1, `${item.name} outside ${width}x${height}`);
        }
        await page.screenshot({ path: path.join(shots, `${width}x${height}.png`) });
    }
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(base, { waitUntil: 'networkidle0' }); await waitForLoaded();
    await page.type('#chat-search', 'Test');
    await page.waitForFunction(() => document.querySelectorAll('.chat-row').length === 45);
    await page.$eval('#chat-list', el => { el.scrollTop = 520; });
    const position = await page.$eval('#chat-list', el => el.scrollTop);
    await page.evaluate(() => {
        const list = document.getElementById('chat-list');
        const rows = [...list.querySelectorAll('.chat-row')];
        rows.find(row => row.offsetTop >= list.scrollTop)?.click();
    });
    await page.waitForSelector('.message');
    await page.click('.back-to-list');
    await page.waitForFunction(() => !document.querySelector('.inbox').classList.contains('has-selection'));
    assert.equal(await page.$eval('#chat-search', el => el.value), 'Test');
    assert.equal(await page.$eval('#chat-list', el => el.scrollTop), position);
    await page.$eval('#chat-search', el => { el.value = 'does-not-exist'; el.dispatchEvent(new Event('input')); });
    assert.match(await page.$eval('#chat-list', el => el.textContent), /No matching conversations/);
    await page.$eval('#chat-search', el => { el.value = ''; el.dispatchEvent(new Event('input')); });
    failMessages = true;
    await page.click('.chat-row');
    await page.waitForFunction(() => document.getElementById('conversation-head').textContent.includes('Retry conversation'));
    assert.equal(await page.$eval('.back-to-list', el => !!el.getClientRects().length), true);
    await page.screenshot({ path: path.join(shots, 'mobile-error.png') });
    await page.click('.back-to-list');
    failMessages = false;
    await page.click('.chat-row'); await page.waitForSelector('.message');
    await page.click('.manage-access');
    await page.waitForFunction(() => !document.getElementById('numbers-view').hidden);
    assert.match(await page.$eval('#rule-number', el => el.value), /^\d+$/);
    await page.type('#rule-reply', 'Offline permission test reply');
    await page.click('#rule-form [type="submit"]');
    await page.waitForFunction(() => document.getElementById('rule-result').textContent.startsWith('Saved'));
    await page.click('#navigation-toggle'); await page.click('[data-tab="instructions"]');
    await page.waitForFunction(() => !document.getElementById('instructions-view').hidden);
    await page.type('#instructions', 'Browser test instruction');
    await page.click('#settings-form [type="submit"]');
    await page.waitForFunction(() => document.getElementById('settings-result').textContent.startsWith('Saved'));
    assert.match(config.ai.instructions, /Browser test instruction/);
    await page.screenshot({ path: path.join(shots, 'mobile-settings.png'), fullPage: true });
    await page.click('#navigation-toggle'); await page.click('[data-tab="chats"]');
    runtime.status = 'disconnected';
    await page.click('#refresh');
    await page.waitForFunction(() => document.getElementById('connection').textContent === 'disconnected');
    assert.equal(await page.$eval('#connection-notice', el => el.hidden), false);
    assert.deepEqual(errors, []);
    await page.focus('#refresh');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'chat-search');
});
