const $ = id => document.getElementById(id);
let state, chats = [], selected = '', selectedNumber = '', messageRequest = 0, refreshing = false, settingsLoaded = false, chatLoadError = '';
let inboxScroll = 0;
const inboxPreferences = { query: '' };
const titles = { chats: ['Conversations', 'View recent WhatsApp chats.'], numbers: ['Reply access', 'Choose exactly who ARC is allowed to reply to.'], instructions: ['ARC instructions', 'Make the assistant sound like your assistant.'] };
function route() {
    const params = new URLSearchParams(location.hash.slice(1).split('?')[1] || '');
    const tab = location.hash.slice(1).split('?')[0] in titles ? location.hash.slice(1).split('?')[0] : 'chats';
    for (const key of Object.keys(titles)) $(key + '-view').hidden = tab !== key;
    document.querySelectorAll('[data-tab]').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
    $('page-title').textContent = titles[tab][0]; $('page-description').textContent = titles[tab][1];
    document.querySelector('.navigation').classList.remove('is-open');
    $('navigation-toggle').setAttribute('aria-expanded', 'false');
    if (tab === 'chats') {
        $('chat-search').value = params.get('q') ?? inboxPreferences.query;
    }
    renderChats();
    const chat = params.get('chat');
    if (tab === 'chats' && chat && chat !== selected) openChat(chat);
    if (tab === 'chats' && !chat) {
        if (selected) messageRequest++;
        selected = '';
        document.querySelector('.inbox').classList.remove('has-selection');
        renderChats();
        $('chat-list').scrollTop = inboxScroll;
    }
}
function setChatUrl(id) {
    const params = new URLSearchParams();
    if (id) params.set('chat', id);
    if ($('chat-search').value) params.set('q', $('chat-search').value);
    location.hash = 'chats' + (params.size ? '?' + params : '');
}
async function api(url, body) {
    const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dashboard-Request': '1' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed. Try again.');
    return data;
}
function el(tag, text, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
function ruleFor(number) { return Object.values(state?.rules || {}).find(r => String(r.number) === String(number)); }
function labelFor(number) { return state?.failures[number] ? 'Reply failed' : ruleFor(number)?.enabled ? 'Auto-reply on' : 'Auto-reply off'; }
function renderChats() {
    if (!state) return;
    const query = $('chat-search').value.toLowerCase();
    const filtered = chats.filter(c => (c.name + ' ' + c.number).toLowerCase().includes(query));
    const scroll = $('chat-list').scrollTop;
    $('chat-list').replaceChildren();
    if (chatLoadError) {
        $('chat-list').append(el('p', 'Conversations could not be loaded. Click Refresh data to retry. Your reply settings are still available.', 'empty error'));
        return;
    }
    if (!filtered.length) $('chat-list').append(el('p', state.status !== 'ready' ? 'Chats will appear when WhatsApp is connected. Scan the QR code in the terminal if prompted.' : chats.length ? 'No matching conversations. Change your search.' : 'No personal chats found. Start a conversation in WhatsApp, then refresh.', 'empty'));
    for (const c of filtered) {
        const button = el('button', undefined, 'chat-row'); button.type = 'button'; button.setAttribute('aria-current', String(selected === c.id));
        const avatar = el('span', initials(c.name), 'avatar'); avatar.setAttribute('aria-hidden', 'true');
        const summary = el('span', undefined, 'chat-summary');
        const name = el('strong', c.name); name.title = c.name;
        const status = el('small', `${labelFor(c.number)}${c.unread ? ` / ${c.unread} unread` : ''}`, replyClass(c.number));
        summary.append(name, el('p', c.preview || 'No text preview'), status);
        button.append(avatar, summary);
        button.onclick = () => { inboxScroll = $('chat-list').scrollTop; setChatUrl(c.id); if (c.id === selected) openChat(c.id); };
        $('chat-list').append(button);
    }
    $('chat-list').scrollTop = scroll;
}
function initials(name) {
    return String(name || '?').trim().split(/\s+/u).slice(0, 2).map(word => Array.from(word)[0] || '').join('').toLocaleUpperCase();
}
function replyClass(number) { return 'reply-state' + (state?.failures[number] ? ' failed' : ruleFor(number)?.enabled ? ' enabled' : ''); }
function conversationHeader(name, description, id, number) {
    const info = el('div', undefined, 'contact-info');
    const heading = el('h2', name); heading.title = name;
    info.append(heading, el('p', description));
    if (number) info.append(el('span', labelFor(number), replyClass(number)));
    const back = el('button', 'Back to inbox', 'back-to-list'); back.onclick = returnToList;
    $('conversation-head').replaceChildren(back, info);
    if (number) {
        const manage = el('button', 'Manage reply access', 'manage-access'); manage.onclick = () => editRule(number);
        $('conversation-head').append(manage);
    }
}
function renderRules() {
    const rules = Object.values(state.rules); $('rule-count').textContent = `${rules.filter(r => r.enabled).length} enabled / ${rules.length} configured`;
    $('rules-list').replaceChildren();
    if (!rules.length) $('rules-list').append(el('p', 'No numbers are allowed yet. Add a phone number to enable replies.', 'empty'));
    for (const rule of rules) {
        const row = el('div', undefined, 'rule-row'); const content = el('div');
        const number = el('strong', '+' + rule.number); number.append(el('span', rule.enabled ? 'Enabled' : 'Off', 'badge' + (rule.enabled ? ' enabled' : '')));
        content.append(number, el('p', rule.reply));
        const failure = state.failures[rule.number];
        if (failure) content.append(el('p', `Last failure: ${failure.error} (${new Date(failure.at).toLocaleString()}).`, 'error'));
        const edit = el('button', 'Edit'); edit.onclick = () => editRule(rule.number);
        row.append(content, edit); $('rules-list').append(row);
    }
}
function editRule(number) {
    const rule = ruleFor(number);
    location.hash = 'numbers'; $('rule-heading').textContent = rule ? 'Edit reply access' : 'Add a phone number';
    $('rule-number').value = number || ''; $('rule-enabled').checked = !!rule?.enabled;
    $('rule-reply').value = rule?.reply || ''; $('rule-result').textContent = '';
    $('rule-number').focus();
}
async function openChat(id) {
    const changed = selected !== id;
    const request = ++messageRequest; selected = id; renderChats();
    document.querySelector('.inbox').classList.add('has-selection');
    const chat = chats.find(c => c.id === id);
    conversationHeader(chat?.name || 'Conversation', 'Loading reply access…', id);
    $('messages').setAttribute('aria-busy', 'true');
    $('messages').replaceChildren(el('p', 'Loading recent messages…', 'empty'));
    if (changed && matchMedia('(max-width: 700px)').matches) {
        document.querySelector('.conversation').focus({ preventScroll: true });
    }
    try {
        const data = await api('/api/messages?chat=' + encodeURIComponent(id)); if (request !== messageRequest) return;
        selectedNumber = data.number;
        // Resolve privacy-preserving WhatsApp LID identifiers using the contact’s actual number.
        if (chat) { chat.number = data.number; renderChats(); }
        conversationHeader(chat?.name || '+' + data.number, '+' + data.number, id, data.number);
        if (state.failures[data.number]) $('conversation-head').append(el('p', state.failures[data.number].error, 'error'));
        $('messages').replaceChildren();
        if (data.warning) $('messages').append(el('p', data.warning, 'notice'));
        if (!data.messages.length) $('messages').append(el('p', 'No recent messages available in this chat.', 'empty'));
        let previousDay = '';
        for (const m of data.messages) {
            const date = new Date(m.timestamp * 1000);
            const day = date.toLocaleDateString();
            if (day !== previousDay) {
                const divider = el('div', date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), 'date-divider');
                $('messages').append(divider); previousDay = day;
            }
            const node = el('article', undefined, 'message' + (m.fromMe ? ' sent' : ''));
            node.setAttribute('aria-label', m.fromMe ? 'Outgoing message' : 'Incoming message');
            const time = el('time', date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
            time.dateTime = date.toISOString(); time.title = date.toLocaleString(); time.setAttribute('aria-label', date.toLocaleString());
            node.append(el('p', m.body || `[${m.type} message; view media in WhatsApp]`), time); $('messages').append(node);
        }
        $('messages').scrollTop = $('messages').scrollHeight;
    } catch (error) {
        if (request !== messageRequest) return;
        conversationHeader(chat?.name || 'Conversation unavailable', 'Recent messages could not be loaded.', id);
        const retry = el('button', 'Retry conversation'); retry.onclick = () => openChat(id);
        $('conversation-head').append(retry);
        $('messages').replaceChildren(el('p', error.message, 'empty error'));
    } finally {
        if (request === messageRequest) $('messages').setAttribute('aria-busy', 'false');
    }
}
function returnToList() {
    messageRequest++;
    selected = '';
    document.querySelector('.inbox').classList.remove('has-selection');
    setChatUrl('');
    renderChats();
    $('chat-list').scrollTop = inboxScroll;
    $('chat-search').focus({ preventScroll: true });
}
async function refresh() {
    if (refreshing) return; refreshing = true; $('refresh').disabled = true; $('refresh').setAttribute('aria-busy', 'true'); $('refresh-label').textContent = 'Refreshing…';
    $('global-error').hidden = true;
    try {
        state = await api('/api/state');
        $('connection').textContent = state.status === 'ready' ? 'WhatsApp connected' : state.status;
        $('connection-notice').hidden = state.status === 'ready' && !state.connectionError;
        $('connection-notice').textContent = state.connectionError || 'WhatsApp is not ready. Keep the agent running and scan the QR code in the terminal when prompted.';
        if (!settingsLoaded) {
            $('instructions').value = state.settings.instructions; $('ai-enabled').checked = state.settings.enabled;
            $('reply-delay').value = state.settings.replyDelay; $('cooldown').value = state.settings.cooldownMs;
            $('auto-reply-all').checked = state.settings.autoReplyToAll; $('default-reply').value = state.settings.defaultReply;
            $('base-instructions').textContent = state.baseInstructions; settingsLoaded = true;
        }
        renderRules();
        let data;
        try { data = await api('/api/chats'); chatLoadError = ''; }
        catch (error) { chatLoadError = error.message; renderChats(); throw error; }
        const known = new Map(chats.map(c => [c.id, c.number]));
        chats = data.chats.map(c => ({ ...c, number: known.get(c.id) || c.number })); renderChats();
        $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
        if (selected) await openChat(selected);
        else route();
    } catch (error) { $('global-error').hidden = false; $('global-error').textContent = error.message; }
    finally { refreshing = false; $('refresh').disabled = false; $('refresh').removeAttribute('aria-busy'); $('refresh-label').textContent = 'Refresh data'; }
}
async function submit(form, result, url, body) {
    const button = form.querySelector('[type=submit]'); button.disabled = true; button.setAttribute('aria-busy', 'true'); result.classList.remove('error'); result.textContent = 'Saving…';
    try { await api(url, body); form.dataset.dirty = 'false'; result.textContent = 'Saved. Applies to new messages.'; await refresh(); }
    catch (error) { result.textContent = error.message; result.classList.add('error'); }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}
$('rule-form').onsubmit = e => { e.preventDefault(); submit(e.currentTarget, $('rule-result'), '/api/rules', { number: $('rule-number').value, enabled: $('rule-enabled').checked, reply: $('rule-reply').value }); };
$('settings-form').onsubmit = e => { e.preventDefault(); submit(e.currentTarget, $('settings-result'), '/api/settings', { enabled: $('ai-enabled').checked, instructions: $('instructions').value, replyDelay: Number($('reply-delay').value), cooldownMs: Number($('cooldown').value), autoReplyToAll: $('auto-reply-all').checked, defaultReply: $('default-reply').value }); };
$('new-rule').onclick = () => editRule(''); $('refresh').onclick = refresh;
$('chat-search').oninput = () => { inboxPreferences.query = $('chat-search').value; renderChats(); history.replaceState(null, '', '#chats?' + new URLSearchParams({ ...(selected ? { chat: selected } : {}), q: $('chat-search').value })); };
$('navigation-toggle').onclick = () => {
    const open = document.querySelector('.navigation').classList.toggle('is-open');
    $('navigation-toggle').setAttribute('aria-expanded', String(open));
};
document.querySelectorAll('[data-tab]').forEach(link => {
    link.title = link.textContent.trim();
    link.setAttribute('aria-label', link.textContent.trim());
});
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', e => { if (document.querySelector('form[data-dirty=true]')) { e.preventDefault(); e.returnValue = ''; } });
document.querySelectorAll('form').forEach(form => { form.addEventListener('input', () => { form.dataset.dirty = 'true'; }); });
route(); refresh();
