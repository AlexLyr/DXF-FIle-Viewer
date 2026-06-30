# DXF & DWG File Viewer

Chrome extension for opening and inspecting `.dxf` and `.dwg` drawings locally in the browser.

## Features

- Layer controls with quick hover-preview and solo mode
- Measure tool with endpoint/midpoint/center snap
- Text find (`Ctrl+F`) with next/prev navigation
- Saved views (bookmarks)
- Compare overlay between two drawings
- Light/dark themes and original DXF colors toggle
- Screenshot capture
- Print current view
- Recent files list
- Coordinate readout and minimap

## Build from source

1. Install dependencies:
   - `npm install`
2. Build extension:
   - `npm run build`
3. Load in Chrome:
   - Open `chrome://extensions`
   - Enable Developer mode
   - Click **Load unpacked**
   - Select the `dist/` folder

## Renderer

- Rendering is powered by `dxf-render`. (The legacy `dxf-viewer` renderer has been removed.)

## Product analytics (PostHog)

- Copy `.env.example` to `.env` and set:
  - `VITE_POSTHOG_API_KEY`
  - `VITE_POSTHOG_API_HOST` (EU default: `https://eu.i.posthog.com`)
- Full setup and dashboard checklist: `marketing/posthog-analytics.md`

## Privacy policy

- See `PRIVACY-POLICY.md`

## License

This project is licensed under GPL-3.0-or-later.