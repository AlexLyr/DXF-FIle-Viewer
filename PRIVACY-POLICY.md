# Privacy Policy for DXF File Viewer

Effective date: May 29, 2026

DXF File Viewer ("the Extension") is a Chrome extension that lets users open,
view, inspect, measure, and compare AutoCAD-compatible DXF (Drawing Exchange
Format) and DWG files locally in their browser. This document explains how the
Extension handles user data.

## Plain-English Summary

The Extension does not collect, transmit, sell, or share personal data with us
or with third parties. DXF and DWG drawings are processed locally in your
browser and are not uploaded to any server or cloud service.

Some viewer data is stored locally on your device so the Extension can provide
features such as recent files, saved views, and viewer preferences. This local
data stays inside your browser.

## What Data We Do Not Collect

The Extension does not collect, request, or transmit any of the following:

- Personally identifiable information, such as name, email, phone, or address
- Authentication credentials, such as passwords, API keys, or OAuth tokens
- Financial or payment information
- Health information
- Location data
- Browsing history or web activity
- Personal communications
- Website content from pages you visit
- Device identifiers, IP addresses, or fingerprinting data
- Usage analytics or telemetry

## How Your DXF/DWG Files Are Handled

When you open a DXF or DWG file in the Extension:

1. The file is read locally by your browser using the standard File API.
2. The file data is passed to the Extension's viewer page using local browser
   storage mechanisms.
3. The drawing is parsed and rendered locally in your browser, including
   inside a Web Worker where needed for performance.
4. The file is not uploaded to any server, cloud service, or third party.

To support the recent files feature, the Extension may store recently opened
DXF/DWG files locally in your browser's IndexedDB storage. This lets you reopen a
recent drawing from the Extension UI without selecting the file again. Recent
file data remains on your device and is not transmitted by the Extension.

## Local Storage

The Extension stores some data locally in your browser to provide its core
viewer features:

- Viewer preferences, such as theme, original color mode, minimap visibility,
  coordinate display, and selected language
- Recently opened DXF files, including file name, file size, opened time, and
  local file data for the recent files list
- Saved views or bookmarks, including bookmark label, drawing position, zoom
  width, and creation time
- Temporary pending file data used to open a selected DXF in the viewer tab

This data is stored using standard browser storage APIs such as
`window.localStorage` and IndexedDB. It stays on your device. You can remove it
by clearing extension site data or browser storage in Chrome settings.

## Screenshots and Clipboard

If you use the screenshot feature, the Extension may generate a PNG image from
the current drawing view. The image may be downloaded to your device or copied
to your clipboard only after you request that action.

## Permissions

The Extension's manifest declares no Chrome permissions (`"permissions": []`).
It does not request access to:

- Tabs or browsing history
- Active tab content
- Cookies
- Bookmarks
- Network requests
- `chrome.storage`

## Third Parties and External Services

The Extension does not use analytics providers, advertising networks, tracking
services, or external APIs.

After installation, the Extension may open a welcome page hosted on GitHub
Pages for onboarding. This page is separate from the Extension's DXF processing
and does not receive your DXF files.

## Remote Code

The Extension does not load or execute remote code. All JavaScript, CSS, fonts,
localization files, and assets required by the Extension are bundled inside the
Extension package and served locally from within Chrome.

## Children's Privacy

The Extension does not knowingly target or collect data from children under the
age of 13.

## Sale or Transfer of Data

We do not sell, trade, or transfer user data to third parties.

## Changes to This Policy

This policy may be updated as the Extension evolves. When that happens, the
effective date at the top will be updated.

## Contact

For privacy questions or concerns, contact:

alexlyrchikov927@gmail.com
