# Auto-Reply to Everyone Feature

## Overview
Added a global auto-reply feature that allows automatic replies to all incoming messages, with a dashboard toggle to enable/disable this functionality.

## Changes Made

### 1. Configuration (`config.json`)
- Added `autoReplyToAll` boolean flag in `settings` (default: `false`)
- Added `defaultReply` text field for the default message sent to everyone
- When `autoReplyToAll` is enabled, all new messages from everyone will receive an automatic reply

### 2. Message Handler (`index.js`)
- Modified the message handling logic to check for global auto-reply setting
- If a contact doesn't have a specific rule but `autoReplyToAll` is enabled, they receive the `defaultReply`
- Messages with timestamp before the bot started are skipped (only new messages get replies)
- Messages are not marked as unseen (they're handled but not marked as read by the bot)

### 3. Dashboard Backend (`dashboard.js`)
- Updated `validateSettings()` to validate the new fields:
  - `autoReplyToAll` must be a boolean
  - `defaultReply` is required when `autoReplyToAll` is enabled
  - `defaultReply` must be 1-1200 characters
- Updated `/api/state` endpoint to include the new settings in the response
- Updated `/api/settings` POST handler to save the new configuration

### 4. Dashboard UI (`dashboard/index.html`)
- Added "Auto-reply to everyone" checkbox
- Added "Default reply for everyone" textarea field
- Updated labels and help text for clarity

### 5. Dashboard JavaScript (`dashboard/app.js`)
- Updated settings form to load and save the new fields
- Form submission now includes `autoReplyToAll` and `defaultReply`

## How It Works

### Priority Order:
1. **Specific contact rules** - If a contact has an enabled rule in `autoReplies`, that takes priority
2. **Global auto-reply** - If no specific rule exists and `autoReplyToAll` is enabled, the `defaultReply` is used
3. **No reply** - If neither condition is met, no reply is sent

### AI Integration:
- If AI is enabled (`ai.enabled: true`), the AI will generate replies using the configured instructions
- If AI is disabled, the fixed reply (either contact-specific or default) is sent
- If AI fails, nothing is sent (no fallback to fixed reply)

### Message Handling:
- Only messages received AFTER the bot starts are replied to (prevents replying to old messages)
- Messages from the bot itself are ignored
- Status updates and broadcasts are ignored
- Cooldown settings still apply to prevent spam

## Usage

1. Open the dashboard at `http://127.0.0.1:3000`
2. Navigate to "ARC instructions" tab
3. Check "Auto-reply to everyone" to enable global auto-reply
4. Enter your default reply message in the "Default reply for everyone" field
5. Click "Save instructions"

The setting applies immediately to new incoming messages without needing to restart the bot.

## Configuration Example

```json
{
  "settings": {
    "autoReplyToAll": true,
    "defaultReply": "Thanks for your message! I'll get back to you soon.",
    "replyDelay": 2000,
    "logMessages": true
  },
  "ai": {
    "enabled": true,
    "cooldownMs": 0
  }
}
```

## Important Notes

- New messages are NOT marked as read/seen by WhatsApp - they remain as received messages
- Only messages with timestamps after bot startup are processed (old messages are ignored)
- Specific contact rules in `autoReplies` always take priority over global auto-reply
- The cooldown timer still applies to prevent multiple rapid replies to the same chat
