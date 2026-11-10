# WhatsApp Automation Agent

A Node.js-based WhatsApp automation agent that supports QR code scanning for authentication and automatic replies to specific contacts.

## Features

- 📱 **QR Code Authentication** - Easy connection via WhatsApp Web
- 🤖 **Auto-Reply System** - Configure automatic responses for specific numbers
- 🔄 **Live Config Reload** - Update auto-reply rules without restarting
- 📝 **Message Logging** - Track incoming messages and sent replies
- 💾 **Persistent Sessions** - Stay logged in between restarts

## Installation

1. Make sure you have Node.js installed (version 14 or higher)
2. Navigate to the project folder:
   ```bash
   cd D:\whatsapp-automation
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### First Time Setup

1. Start the automation agent:
   ```bash
   npm start
   ```

2. A QR code will appear in your terminal
3. Open WhatsApp on your phone
4. Go to **Settings** → **Linked Devices** → **Link a Device**
5. Scan the QR code displayed in the terminal
6. Once connected, the agent will be ready!

### Configuring Auto-Replies

Edit the `config.json` file to add auto-reply rules:

```json
{
  "autoReplies": {
    "friend1": {
      "number": "1234567890",
      "enabled": true,
      "reply": "Hey! I'm currently away. I'll reply when I'm back."
    },
    "work": {
      "number": "9876543210",
      "enabled": true,
      "reply": "Thank you for your message. I'll respond during business hours."
    },
    "family": {
      "number": "5555555555",
      "enabled": false,
      "reply": "This is an automated response."
    }
  },
  "settings": {
    "defaultReply": "Thank you for contacting me. This is an automated response.",
    "replyDelay": 2000,
    "logMessages": true
  }
}
```

### Configuration Options

#### Auto-Reply Rules

Each rule in `autoReplies` has:
- **number**: The phone number to auto-reply to (can be partial match)
- **enabled**: `true` to activate, `false` to disable
- **reply**: The message text to send automatically

#### Settings

- **defaultReply**: Message sent if no specific rule matches (optional)
- **replyDelay**: Delay in milliseconds before sending reply (default: 2000)
- **logMessages**: Set to `true` to log all messages, `false` to disable

### Adding New Auto-Reply Rules

You can add new rules while the bot is running:

1. Open `config.json`
2. Add a new entry under `autoReplies`:
   ```json
   "myNewRule": {
     "number": "1112223333",
     "enabled": true,
     "reply": "Your custom message here"
   }
   ```
3. Save the file - the bot will automatically reload the configuration!

### Phone Number Format

Phone numbers should be entered without special characters:
- ✅ Correct: `"1234567890"`
- ✅ Correct: `"919876543210"` (with country code)
- ❌ Wrong: `"+1 (234) 567-8900"`
- ❌ Wrong: `"1234-567-890"`

The bot uses partial matching, so you can use just the last digits if you want to match multiple numbers.

## Commands

- **Start the bot**: `npm start`
- **Development mode** (auto-restart on changes): `npm run dev`
- **Stop the bot**: Press `Ctrl+C`

## Troubleshooting

### QR Code won't scan
- Make sure you're using WhatsApp on your phone (not WhatsApp Business)
- Try deleting the `./session` folder and scanning again
- Ensure your phone has a stable internet connection

### Bot stops responding
- Check if WhatsApp Web is still connected on your phone
- Restart the bot with `npm start`
- Check the terminal for error messages

### Authentication failed
1. Stop the bot
2. Delete the `./session` folder:
   ```bash
   rmdir /s session
   ```
3. Start the bot again and rescan the QR code

### Messages not auto-replying
- Check that the rule is `"enabled": true` in config.json
- Verify the phone number matches (check the logged number in the terminal)
- Ensure the bot is running and shows "ready" status

## File Structure

```
whatsapp-automation/
├── index.js          # Main bot script
├── config.json       # Auto-reply configuration
├── package.json      # Node.js dependencies
├── README.md         # This file
└── session/          # Authentication data (created automatically)
```

## Security Notes

⚠️ **Important Security Information:**

- The `session` folder contains your WhatsApp authentication data
- Keep this folder private and never share it
- Add `session/` to `.gitignore` if using version control
- Be careful with the `config.json` file if it contains sensitive information

## Advanced Usage

### Conditional Replies

You can create more complex rules by editing `index.js`. For example:
- Reply based on message content
- Send different replies based on time of day
- Forward messages to another number
- Send media files instead of text

### Running as a Service

To keep the bot running 24/7:
- **Windows**: Use PM2 or NSSM (Non-Sucking Service Manager)
- **Linux/Mac**: Use PM2 or systemd

Example with PM2:
```bash
npm install -g pm2
pm2 start index.js --name whatsapp-bot
pm2 save
pm2 startup
```

## Limitations

- WhatsApp may flag the account if used excessively for automation
- The bot needs to stay running to send auto-replies
- Internet connection required for both the bot and your phone
- Some WhatsApp updates may temporarily break functionality

## Support

If you encounter issues:
1. Check the terminal output for error messages
2. Verify your Node.js version: `node --version` (should be 14+)
3. Make sure all dependencies are installed: `npm install`
4. Try deleting `session` folder and reconnecting

## License

MIT License - Feel free to modify and use as needed!
