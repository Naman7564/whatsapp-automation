const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { createDashboard } = require('../dashboard');

test('Ace landing shares dashboard server, preserves workspace, and works on phones', { timeout: 90000 }, async t => {
    const server = createDashboard({ client: {}, getConfig: () => ({ autoReplies: {}, ai: {}, settings: {} }),
        saveConfig: () => {}, runtime: { status: 'disconnected', failures: new Map() }, port: 0 });
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${url}/landing`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/landing/');
    assert.match(await (await fetch(url)).text(), /WhatsApp workspace/);
    for (const asset of ['styles.css', 'ace.js']) {
        const assetResponse = await fetch(`${url}/landing/${asset}`);
        assert.equal(assetResponse.status, 200);
        assert.match(assetResponse.headers.get('content-security-policy'), /default-src 'self'/);
    }
    assert.equal((await fetch(`${url}/landing/README.md`)).status, 404);
    assert.equal((await fetch(`${url}/landing/app.js`)).status, 404);
    const browser = await puppeteer.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const shots = path.join(__dirname, '..', '.impeccable', 'verification', 'ace-landing');
    fs.mkdirSync(shots, { recursive: true });
    for (const [width, height] of [[1440, 1000], [1280, 800], [768, 1024], [390, 844], [320, 700]]) {
        await page.setViewport({ width, height });
        await page.goto(`${url}/landing/`, { waitUntil: 'networkidle0' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
        assert.match(await page.title(), /Ace WhatsApp/);
        await page.screenshot({ path: path.join(shots, `${width}.png`), fullPage: true });
    }
    await page.click('[data-reply="ai"]');
    assert.match(await page.$eval('#sample-reply', el => el.textContent), /Example instruction/);
    assert.match(await page.$eval('#preview-description', el => el.textContent), /not a live AI response/);
    await page.focus('[data-reply="fixed"]');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-reply="fixed"]', el => el.getAttribute('aria-pressed')), 'true');
    await page.click('.hero-aside .button');
    assert.equal(new URL(page.url()).pathname, '/');
    await page.waitForSelector('#chats-view');
    await page.setJavaScriptEnabled(false);
    await page.goto(`${url}/landing/`, { waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#sample-reply', el => el.getBoundingClientRect().width > 0), true);
    assert.deepEqual(errors, []);
});
