# ARC dashboard

Run `npm start`, then open **http://127.0.0.1:3000**. Restart the agent once if it was already running before the dashboard was added. Scan the WhatsApp QR code in the terminal if requested.

The dashboard runs alongside the existing WhatsApp agent, without an additional web framework or dependencies.

The **Ace WhatsApp landing page** is available at **http://127.0.0.1:3000/landing/** on the same server. Its Get Started buttons open the existing workspace at `/`. Restart the agent once after adding this route. No separate landing-page server is required.

## Conversations

- Browse up to 200 personal chats and read the latest 60 messages in a selected chat.
- Search by name or number, or filter by reply access and failures.
- Click **Manage reply access** to configure the selected contact. WhatsApp may initially provide an internal LID identifier; opening the chat resolves its actual phone number when available.
- The viewer is read-only. Media must be viewed in WhatsApp. Click **Refresh data** for new messages and current connection status.

## Reply access

Add a number including country code and a fixed reply, then choose whether it can receive automatic replies. Disabled and unlisted numbers never receive automatic replies. Existing `config.json` rules are preserved; the dashboard updates matching numbers, including duplicate rules.

**Needs attention** shows automatic-reply failures recorded since this process started. Opening Reply access shows the last error for a configured number. Failures clear after a successful auto-reply and are not persisted across restarts. A cooldown skip is not a failure.

## ARC instructions

Edit owner preferences, enable or disable AI generation, and set the reply delay and per-chat cooldown. Changes are saved to `config.json` and apply to subsequent requests. Requests already generating may retain the previous instructions. Built-in identity, privacy, safety, and Google Meet behavior are retained. When AI is off, enabled contacts receive their fixed reply. AI errors do not send a fallback.

## Local access and privacy

The server binds only to `127.0.0.1`, rejects foreign hosts/origins, and requires a custom header on writes. It deliberately has no remote-access/login feature. Anyone with access to your local computer/browser can use the dashboard. Do not expose it using a tunnel or reverse proxy without adding authentication and HTTPS.

Credentials and session files are not served. Chat content comes directly from the WhatsApp client, not a separate dashboard database. Keep `config.json`, `.env`, and `session/` private.

To change the port, set `DASHBOARD_PORT=3001` in `.env`, restart, and open `http://127.0.0.1:3001`. If the port is in use, stop the other process or choose a different port.

Run automated offline tests with `npm test`.
