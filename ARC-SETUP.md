# ARC replies

Requires Node.js 22+ and an OpenRouter API key. ARC defaults to OpenRouter with `openrouter/free`. Free routing is subject to provider availability and rate limits.

1. Copy `.env.example` to `.env` and put your API key in `ARC_API_KEY`.
2. Set `ARC_BASE_URL=https://openrouter.ai/api/v1` and `ARC_MODEL=openrouter/free`. You may replace the model with an available OpenRouter model ID.
3. Restart with `npm run dev`. Environment changes require a restart.

Only enabled contacts in `config.json` receive replies. Numbers/identifiers now match exactly, not partially. An `@lid` identifier is a WhatsApp privacy identifier, not a phone number or a Linked Device ID. Use the exact sender identifier currently logged by the bot.

With `ai.enabled: true`, ARC replaces the rules' fixed reply text. Non-Meet messages and up to six recent exchanges per contact are sent to the configured AI provider. Memory is held only in RAM and resets on restart. API usage may cost money. Missing credentials or API errors send no fallback reply.

Google Meet links receive exactly “Got it. I’ll notify Naman.” without an API call. This is an acknowledgment only: no separate notification to Naman or calendar action is implemented.

Groups, statuses, broadcasts, non-text messages and messages older than process startup are ignored. Messages from each contact are queued and processed in order. The default `ai.cooldownMs` is 0, so follow-up messages are not skipped after a successful reply. Set a positive cooldown to reduce bot loops; messages processed during that cooldown will be skipped with a log. Restarting clears cooldowns and pending queues. With no cooldown, conversations with other auto-reply bots may loop and increase API usage; only enable trusted contacts.

Set `ai.enabled: false` to return to the configured static replies. Keep your `.env` and session folder private. WhatsApp Web automation is unofficial and may carry account restrictions.

Run the offline check with `node --test arc.test.js`.
