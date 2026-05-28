# DXF File Viewer

Chrome extension for opening and inspecting `.dxf` drawings locally in the browser.

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

## Privacy policy

- See `PRIVACY-POLICY.md`