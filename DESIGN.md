# ARC dashboard design

## Direction

A read-only WhatsApp management workspace, following the owner's explicit three-column brief. On desktop: 212px evergreen navigation, 320px inbox, and a flexible conversation. At tablet widths navigation becomes a 72px icon rail. At 700px and below the navigation becomes a menu and conversations drill into a full-width pane.

## Visual system

Use semantic variables in `dashboard/tokens.css`. Evergreen navigation pairs light text with a filled active destination. White inbox and header surfaces sit beside a pale sage message history; incoming messages are white and outgoing messages mint. Green denotes selection, reply permission, focus, and primary actions. Failures use red plus explicit error text.

Use the existing Segoe UI system stack, 14px body, 13px list previews, 11–12px metadata, 16px contact headings, and a 24px page heading. Corners are 8–10px. Dividers are thin; no gradients, heavy shadows, or ornamental cards. Icons are authored outline SVGs with a consistent 1.7px stroke.

## Layout and interaction

The shell fills the viewport. Only the inbox list, message history, and settings content scroll; their scoped controls and footers remain visible. Short desktop viewports use reduced vertical padding. Message dates divide history; localized times expose full timestamps through `title`, `datetime`, and an accessible name.

Search remains a hash URL parameter. The conversation-filter dropdown was removed at the owner's request. Phone back navigation preserves inbox scroll and search text. Loading, disconnected, empty, request-error, retry, and permission states use live API results. No composer or manual-send endpoint is introduced. Focus rings are visible, navigation labels remain accessible in the collapsed rail, and the phone menu reports its expanded state.

## Verification

`npm test` covers the existing backend and ARC behavior. `npm run test:ui` uses explicitly offline fixtures for responsive and interaction regression checks; fixtures are never delivered by the production dashboard. Production continues using the existing WhatsApp client and API endpoints.
