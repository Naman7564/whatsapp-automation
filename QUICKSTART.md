# Quick Start Guide

## Step 1: Configure Your Auto-Replies

Edit `config.json` and replace the example numbers with the actual numbers you want to auto-reply to:

```json
{
  "autoReplies": {
    "friend": {
      "number": "1234567890",      ← Replace with actual phone number
      "enabled": true,              ← Set to true to activate
      "reply": "Your message here"  ← Your custom auto-reply message
    }
  }
}
```

### Phone Number Tips:
- Include country code without + symbol: `919876543210` for India
- Or use just the number: `9876543210`
- Remove all spaces, dashes, and parentheses
- Partial matching works (e.g., `12345` will match `919876512345`)

## Step 2: Start the Bot

Open a terminal in this folder and run:
```bash
npm start
```

## Step 3: Scan the QR Code

1. A QR code will appear in your terminal
2. Open WhatsApp on your phone
3. Go to: **Settings** → **Linked Devices** → **Link a Device**
4. Scan the QR code
5. Wait for "WhatsApp Automation Agent is ready!" message

## Step 4: Test It!

Send a message from the configured number to your WhatsApp. The bot should automatically reply!

## Common Configurations

### Reply to a specific person:
```json
"john": {
  "number": "1234567890",
  "enabled": true,
  "reply": "Hey! I'm busy right now. I'll text you back later."
}
```

### Business hours auto-reply:
```json
"work_hours": {
  "number": "9876543210",
  "enabled": true,
  "reply": "Thank you for contacting us. Our business hours are 9 AM - 5 PM. We'll respond during these hours."
}
```

### Temporary away message:
```json
"away": {
  "number": "5555555555",
  "enabled": true,
  "reply": "I'm on vacation until Dec 1st. For urgent matters, please call my office."
}
```

### Disable a rule without deleting it:
```json
"old_rule": {
  "number": "1111111111",
  "enabled": false,  ← Just set this to false
  "reply": "This won't be sent"
}
```

## Updating Auto-Replies While Running

You can edit `config.json` while the bot is running:
1. Open `config.json` in any text editor
2. Make your changes
3. Save the file
4. The bot will automatically reload the config!

No need to restart! ✨

## Stopping the Bot

Press `Ctrl+C` in the terminal to stop the bot safely.

## Troubleshooting

**QR code not appearing?**
- Make sure you're in the correct folder
- Check that npm install completed successfully

**Bot not replying?**
- Verify `"enabled": true` in config.json
- Check the phone number matches what you see in the terminal logs
- Make sure the bot shows "ready" status

**Need to reconnect?**
1. Stop the bot (Ctrl+C)
2. Delete the `session` folder
3. Run `npm start` again
4. Scan the new QR code
