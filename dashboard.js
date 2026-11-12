const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { SYSTEM_PROMPT } = require('./arc');

async function getChatSummaries(client) {
    // getChats() serializes every group and channel too. A metadata failure in
    // any one of them rejects the entire list, even for this personal-chat UI.
    if (client.pupPage) return client.pupPage.evaluate(() => {
        const chats = window.require('WAWebCollections').Chat.getModelsArray();
        return chats.filter(chat => /^\d+@(c\.us|s\.whatsapp\.net|lid)$/.test(chat.id?._serialized || ''))
            .map(chat => {
                const last = chat.msgs?.getModelsArray?.().at(-1);
                const contact = chat.contact;
                const phone = contact?.phoneNumber?.user;
                return { id: chat.id._serialized,
                    name: chat.formattedTitle || contact?.name || contact?.pushname || chat.id.user,
                    number: phone || chat.id.user, preview: last?.body || '',
                    timestamp: chat.t || last?.t || 0, unread: chat.unreadCount || 0 };
            }).sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
    });
    const chats = await client.getChats();
    return chats.filter(c => !c.isGroup && /@(c\.us|s\.whatsapp\.net|lid)$/.test(c.id._serialized)).slice(0, 200).map(c => ({
        id: c.id._serialized, name: c.name || c.id.user, number: c.id.user,
        preview: c.lastMessage?.body || '', timestamp: c.timestamp, unread: c.unreadCount
    }));
}

async function getChatMessages(client, id) {
    if (client.pupPage) return client.pupPage.evaluate(async chatId => {
        const chat = window.require('WAWebCollections').Chat.getModelsArray()
            .find(item => item.id?._serialized === chatId);
        if (!chat) throw new Error('This chat is no longer loaded. Refresh the conversation list.');
        const read = () => chat.msgs.getModelsArray().filter(m => !m.isNotification);
        let warning = '';
        let messages = read();
        // Avoid getChatById's full serializer, which can fail before messages load.
        try {
            for (let attempt = 0; messages.length < 60 && attempt < 5; attempt++) {
                const loaded = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
                const next = read();
                if (!loaded?.length || next.length <= messages.length) break;
                messages = next;
            }
        } catch {
            warning = 'Older history could not be loaded. Showing messages currently available in WhatsApp Web.';
        }
        return { number: chat.contact?.phoneNumber?.user || chat.id.user, warning,
            messages: messages.sort((a, b) => (a.t || 0) - (b.t || 0)).slice(-60).map(m => ({
                id: m.id?._serialized || '', body: m.body || '', type: m.type || 'unknown',
                fromMe: !!m.id?.fromMe, timestamp: m.t || 0
            })) };
    }, id);
    const chat = await client.getChatById(id);
    const contact = await chat.getContact().catch(() => null);
    const messages = await chat.fetchMessages({ limit: 60 });
    return { number: contact?.number || chat.id.user, messages: messages.map(m => ({
        id: m.id._serialized, body: m.body || '', type: m.type, fromMe: m.fromMe, timestamp: m.timestamp
    })) };
}

function validateSettings(body) {
    if (typeof body.instructions !== 'string' || body.instructions.length > 12000) throw new Error('Instructions must be at most 12,000 characters.');
    if (typeof body.enabled !== 'boolean') throw new Error('Choose whether AI replies are enabled.');
    if (typeof body.autoReplyToAll !== 'boolean') throw new Error('Choose whether auto-reply to all is enabled.');
    if (body.autoReplyToAll && typeof body.defaultReply !== 'string') throw new Error('Default reply is required when auto-reply to all is enabled.');
    if (body.autoReplyToAll && (!body.defaultReply.trim() || body.defaultReply.length > 1200)) throw new Error('Default reply must be between 1 and 1,200 characters.');
    for (const key of ['replyDelay', 'cooldownMs']) {
        if (!Number.isInteger(body[key]) || body[key] < 0 || body[key] > 3600000) throw new Error(`${key} must be between 0 and 3,600,000 milliseconds.`);
    }
    return body;
}

function createDashboard({ client, getConfig, saveConfig, runtime, port = 3000 }) {
    const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/tokens.css': ['tokens.css', 'text/css'] };
    const server = http.createServer(async (req, res) => {
        const origin = `http://${req.headers.host}`;
        const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return send(403, { error: 'Use the 127.0.0.1 dashboard address.' });
        if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Cross-origin requests are not allowed.' });
        const url = new URL(req.url, origin);
        try {
            if (req.method === 'GET' && url.pathname === '/landing') {
                res.writeHead(302, { Location: '/landing/' });
                return res.end();
            }
            const landingFiles = { '/landing/': ['index.html', 'text/html'], '/landing/index.html': ['index.html', 'text/html'], '/landing/styles.css': ['styles.css', 'text/css'], '/landing/ace.js': ['ace.js', 'text/javascript'] };
            if (req.method === 'GET' && landingFiles[url.pathname]) {
                const [file, type] = landingFiles[url.pathname];
                res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
                return res.end(fs.readFileSync(path.join(__dirname, 'landing', file)));
            }
            if (req.method === 'GET' && files[url.pathname]) {
                const [file, type] = files[url.pathname];
                res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
                return res.end(fs.readFileSync(path.join(__dirname, 'dashboard', file)));
            }
            if (req.method === 'GET' && url.pathname === '/api/state') {
                const config = getConfig();
                return send(200, { status: runtime.status, connectionError: runtime.connectionError,
                    rules: config.autoReplies || {}, failures: Object.fromEntries(runtime.failures),
                    settings: { enabled: !!config.ai?.enabled, instructions: config.ai?.instructions || '',
                        replyDelay: config.settings?.replyDelay ?? 2000, cooldownMs: config.ai?.cooldownMs ?? 0,
                        autoReplyToAll: !!config.settings?.autoReplyToAll, defaultReply: config.settings?.defaultReply || '' },
                    baseInstructions: SYSTEM_PROMPT });
            }
            if (req.method === 'GET' && url.pathname === '/api/chats') {
                if (runtime.status !== 'ready') return send(200, { chats: [], disconnected: true });
                return send(200, { chats: await getChatSummaries(client) });
            }
            if (req.method === 'GET' && url.pathname === '/api/messages') {
                if (runtime.status !== 'ready') return send(409, { error: 'WhatsApp is not connected. Scan the QR code in your terminal.' });
                const id = url.searchParams.get('chat');
                if (!/^\d+@(c\.us|s\.whatsapp\.net|lid)$/.test(id || '')) return send(400, { error: 'Invalid chat.' });
                return send(200, await getChatMessages(client, id));
            }
            if (req.method === 'POST' && ['/api/rules', '/api/settings'].includes(url.pathname)) {
                if (req.headers['x-dashboard-request'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) return send(403, { error: 'Invalid dashboard request.' });
                let raw = '';
                for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 64000) return send(413, { error: 'Request too large.' }); }
                let body;
                try { body = JSON.parse(raw); } catch { return send(400, { error: 'Invalid JSON.' }); }
                if (!body || typeof body !== 'object') return send(400, { error: 'Invalid request.' });
                const config = structuredClone(getConfig());
                try {
                    if (url.pathname === '/api/settings') {
                        validateSettings(body);
                        config.ai = { ...config.ai, enabled: body.enabled, instructions: body.instructions, cooldownMs: body.cooldownMs };
                        config.settings = { ...config.settings, replyDelay: body.replyDelay, autoReplyToAll: body.autoReplyToAll, defaultReply: body.defaultReply };
                    } else {
                        const number = String(body.number || '').replace(/[\s+()-]/g, '');
                        if (!/^\d{7,15}$/.test(number)) throw new Error('Enter a phone number with country code, using 7 to 15 digits.');
                        if (typeof body.enabled !== 'boolean' || typeof body.reply !== 'string' || !body.reply.trim() || body.reply.length > 1200) throw new Error('A fallback reply of 1 to 1,200 characters is required.');
                        config.autoReplies ||= {};
                        const matches = Object.keys(config.autoReplies).filter(k => String(config.autoReplies[k].number) === number);
                        const keys = matches.length ? matches : [`contact_${number}`];
                        for (const key of keys) config.autoReplies[key] = { ...config.autoReplies[key], number, enabled: body.enabled, reply: body.reply.trim() };
                    }
                } catch (error) { return send(400, { error: error.message }); }
                saveConfig(config);
                return send(200, { saved: true });
            }
            send(404, { error: 'Not found.' });
        } catch (error) {
            console.error(`Dashboard ${req.method} ${url.pathname} failed:`, error.stack || error);
            send(500, { error: 'Unable to load or save data. Check the terminal and try again.' });
        }
    });
    server.listen(port, '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${server.address().port}`));
    server.on('error', error => console.error('Dashboard server:', error.message));
    return server;
}

module.exports = { createDashboard, validateSettings, getChatSummaries, getChatMessages };
