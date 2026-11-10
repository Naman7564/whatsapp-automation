# Ace WhatsApp landing page

The landing page is integrated into the existing dashboard server. Start the agent with `npm start` and open **http://127.0.0.1:3000/landing/**. If the agent was running before this integration, restart it once. No second server is needed.

The workspace stays at **http://127.0.0.1:3000/**. Every Get Started action opens it. Features link directly to the existing reply-access and assistant-instructions views. The dashboard's existing ARC labels are unchanged; Ace is the landing-page brand requested by the owner.

The page describes implemented features: contact-level reply permissions, AI instructions, fixed replies when AI is disabled, reply delay, cooldown, read-only personal conversation browsing, persistent sessions, and terminal QR pairing. The illustrative conversation does not read private chats, generate AI responses, or send messages.

The existing local-host restrictions and content security policy also protect landing routes. Only index.html, styles.css, and ace.js are served from this folder. No configuration, session files, or documentation are exposed. AI requests still use the configured external provider; this is not an offline AI claim.

Run `node --test landing/landing.test.cjs` for offline integration and responsive browser tests. These use a separate ephemeral test server and never connect to WhatsApp.

`node landing/serve.cjs` remains available for standalone visual preview on port 4173, but workspace links require the integrated server on port 3000.
