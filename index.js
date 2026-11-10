const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { generateReply } = require('./arc');
const { createDashboard } = require('./dashboard');
const runtime = { status: 'starting', connectionError: '', failures: new Map() };
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
const histories = new Map();
const busyChats = new Set();
const chatQueues = new Map();
const lastReplies = new Map();
const startedAt = Math.floor(Date.now() / 1000);

// Load configuration
const configPath = path.join(__dirname, 'config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
function saveConfig(next) {
    const temporaryPath = configPath + '.tmp';
    fs.writeFileSync(temporaryPath, JSON.stringify(next, null, 2) + '\n');
    fs.renameSync(temporaryPath, configPath);
    config = next;
}

// Watch config file for changes
fs.watchFile(configPath, (curr, prev) => {
    console.log('📝 Config file changed, reloading...');
    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log('✅ Config reloaded successfully');
    } catch (error) {
        console.error('❌ Error reloading config:', error.message);
    }
});

// Initialize WhatsApp client with local authentication
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './session'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// QR Code event - Display QR code for scanning
client.on('qr', (qr) => {
    runtime.status = 'scan QR in terminal';
    console.log('\n🔐 WhatsApp Authentication Required!');
    console.log('📱 Scan this QR code with your WhatsApp mobile app:\n');
    qrcode.generate(qr, { small: true });
    console.log('\nSteps to connect:');
    console.log('1. Open WhatsApp on your phone');
    console.log('2. Go to Settings > Linked Devices');
    console.log('3. Tap "Link a Device"');
    console.log('4. Scan the QR code above\n');
});

// Ready event - Client is authenticated and ready
client.on('ready', () => {
    runtime.status = 'ready';
    runtime.connectionError = '';
    console.log('\n✅ WhatsApp Automation Agent is ready!');
    console.log('🤖 Bot is now active and monitoring messages...');
    console.log('📋 Loaded auto-reply configurations:');
    
    const autoReplies = config.autoReplies || {};
    const enabledReplies = Object.values(autoReplies).filter(r => r.enabled);
    
    if (enabledReplies.length === 0) {
        console.log('   ⚠️  No auto-replies configured yet');
        console.log('   Edit config.json to add auto-reply rules\n');
    } else {
        enabledReplies.forEach(reply => {
            console.log(`   📞 ${reply.number}: "${reply.reply}"`);
        });
        console.log('');
    }
});

// Authenticated event
client.on('authenticated', () => {
    runtime.status = 'loading chats';
    console.log('✅ Authentication successful!');
});

// Authentication failure event
client.on('auth_failure', (msg) => {
    runtime.status = 'authentication failed';
    runtime.connectionError = String(msg);
    console.error('❌ Authentication failed:', msg);
    console.log('Please delete the ./session folder and try again.');
});

// Disconnected event
client.on('disconnected', (reason) => {
    runtime.status = 'disconnected';
    runtime.connectionError = String(reason);
    console.log('⚠️  Client was disconnected:', reason);
});

// Message received event - Auto-reply logic
client.on('message', (message) => {
    const chatId = message.from;
    const previous = chatQueues.get(chatId) || Promise.resolve();
    const pending = previous.catch(() => {}).then(() => handleMessage(message));
    chatQueues.set(chatId, pending);
    pending.finally(() => {
        if (chatQueues.get(chatId) === pending) chatQueues.delete(chatId);
    }).catch(error => console.error('❌ Message queue error:', error.message));
});

async function handleMessage(message) {
    try {
        // Skip status updates and broadcasts
        if (message.fromMe || message.isStatus || message.broadcast ||
            !/@(c\.us|s\.whatsapp\.net|lid)$/.test(message.from || '') ||
            message.type !== 'chat' || !message.body?.trim() ||
            message.timestamp < startedAt) {
            return;
        }

        // Get contact info
        const contact = await message.getContact().catch(() => null);
        const chatId = message.from;
        
        // Extract phone number from chat ID (format: number@c.us or number@s.whatsapp.net)
        let contactNumber = chatId.split('@')[0];
        
        // Try to get the actual phone number from contact object
        if (contact && contact.number && contact.number.length > 0) {
            contactNumber = contact.number;
        }
        
        // Try to get it from the chat ID - this is more reliable
        try {
            const chat = await message.getChat();
            if (!contact?.number && chat && chat.id && chat.id.user && !chatId.endsWith('@lid')) {
                contactNumber = chat.id.user;
            }
        } catch (e) {
            // Ignore errors getting chat object
        }
        
        // Log incoming message
        if (config.settings.logMessages) {
            console.log(`\n📨 Message from ${contact?.pushname || 'Unknown'}:`);
            console.log(`   Sender identifier: ${contactNumber}`);
            console.log(`   Chat ID: ${chatId}`);
            console.log(`   Text: ${message.body || '(media/non-text)'}`);
        }
        
        // Check if this is a message from a contact (not from us)
        if (!message.fromMe) {
            // Check for specific auto-reply configuration
            let replyText = null;
            let matchedRule = null;
            
            // Search through auto-reply configurations
            for (const [ruleName, rule] of Object.entries(config.autoReplies || {})) {
                if (rule.enabled && String(contactNumber) === String(rule.number)) {
                    replyText = rule.reply;
                    matchedRule = ruleName;
                    break;
                }
            }
            
            // Never send fallback replies to unlisted contacts.
            if (!matchedRule) return;
            if (busyChats.has(chatId)) return;
            if (Date.now() - (lastReplies.get(chatId) || 0) < (config.ai?.cooldownMs ?? 0)) {
                console.log('⏳ Reply skipped: configured contact cooldown is active.');
                return;
            }
            
            // Send auto-reply if configured
            if (replyText) {
                // Add delay before replying (more natural)
                busyChats.add(chatId);
                try {
                        const history = histories.get(chatId) || [];
                         if (config.ai?.enabled) replyText = await generateReply(message.body, history, config.ai.instructions || '');
                        await new Promise(resolve => setTimeout(resolve, config.settings.replyDelay ?? 2000));
                         if (!config.autoReplies[matchedRule]?.enabled || String(config.autoReplies[matchedRule].number) !== String(contactNumber)) return;
                         await message.reply(replyText);
                         runtime.failures.delete(String(contactNumber));
                        lastReplies.set(chatId, Date.now());
                        histories.set(chatId, [...history,
                            { role: 'user', content: message.body.slice(0, 6000) },
                            { role: 'assistant', content: replyText }].slice(-12));
                        if (histories.size > 100) histories.delete(histories.keys().next().value);
                        if (lastReplies.size > 1000) lastReplies.delete(lastReplies.keys().next().value);
                        console.log(`✅ Auto-replied using rule: ${matchedRule}`);
                        console.log(`   Sent: "${replyText}"\n`);
                     } catch (error) {
                         runtime.failures.set(String(contactNumber), { error: error.message, at: Date.now() });
                         if (runtime.failures.size > 1000) runtime.failures.delete(runtime.failures.keys().next().value);
                        console.error('❌ Error sending reply:', error.message);
                    } finally {
                        busyChats.delete(chatId);
                    }
            } else {
                console.log('⚠️  No auto-reply rule configured for this contact\n');
            }
        }
    } catch (error) {
        console.error('❌ Error processing message:', error.message);
    }
}

// Error event
client.on('error', (error) => {
    runtime.connectionError = error.message;
    console.error('❌ Client error:', error);
});

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down WhatsApp Automation Agent...');
    await client.destroy();
    process.exit(0);
});

// Initialize the client
createDashboard({ client, getConfig: () => config, saveConfig, runtime,
    port: Number(process.env.DASHBOARD_PORT || 3000) });
console.log('🚀 Starting WhatsApp Automation Agent...');
console.log('📁 Session data will be stored in ./session folder');
client.initialize().catch(error => {
    runtime.status = 'connection failed';
    runtime.connectionError = error.message;
    console.error('WhatsApp initialization failed:', error.message);
});
