# CWS Submission Notes

This file is the single source of truth for filling the Chrome Web Store
submission form. Copy each section directly into the corresponding field.

---

## 1. Pre-flight checklist

Before uploading, confirm:

- [ ] `npm run build` completes with no warnings
- [ ] `dist/manifest.json` contains the updated `version` (`1.1.2`)
- [ ] `dist/manifest.json` icons are present (`16`, `48`, `96`, `128`)
- [ ] `dist.zip` rebuilt from the latest `dist/`
- [ ] No source maps or `.env` files inside `dist.zip`
- [ ] Privacy policy hosted at a publicly reachable URL (GitHub Pages / Gist / Notion)
- [x] Three icons replaced with the final brand artwork (not placeholders)
- [ ] At least 3 screenshots prepared at 1280×800
- [ ] Promo tile prepared at 440×280

---

## 2. Store listing

### Item name

```
DXF File Viewer
```

### Short description (max 132 chars)

```
Use DXF File Viewer to open and view .dxf files online — fast AutoCAD-compatible DXF viewer in your browser. Now a DWG viewer too.
```

### Detailed description (max 16 384 chars)

```
Use DXF File Viewer to open and view .dxf files instantly in your browser. The extension gives fast, lightweight access to drawings without installing any heavy CAD software.

✨ What DXF File Viewer does:
1. Opens drawings in seconds — drag, drop, or click
2. Shows lines, layers, blocks, dimensions, and annotations
3. Lets you pan and zoom every detail of the drawing
4. Toggles layers to focus on specific parts, with hover preview to isolate any layer
5. Works fully in your browser — no install, no account
6. Light and dark themes, with live cursor coordinates

📌 Who needs a dxf viewer online:
➤ Engineers and architects who view dxf online without AutoCAD
➤ Students learning CAD who want a simple .dxf viewer in the browser
➤ Construction managers receiving drawings from designers
➤ Freelancers previewing files before opening heavy CAD tools
➤ Anyone wondering how to view dxf files quickly on any device

🎯 Why people choose this dxf tool:
The pain with CAD drawings is buying an autocad dxf viewer license or installing similar tools just to peek inside. DXF File Viewer runs in your browser and opens any standard .dxf file in seconds.

🚀 How the dxf file viewer online works:
1️⃣ Install the extension from the Chrome Web Store
2️⃣ Click the icon in your toolbar
3️⃣ Drag your drawing into the viewer
4️⃣ Pan and zoom to inspect the structure
5️⃣ Toggle layers and explore each part

📂 Supported files:
- Standard DXF — both ASCII and binary
- DWG drawings — converted to DXF in your browser, no extra software
- Layered drawings — every layer preserved and toggleable
- 2D entities — lines, polylines, arcs, circles, splines, hatches, text
- Block references, dimensions, and annotations

🔒 Your privacy matters. DXF File Viewer processes drawings locally in your browser. Drawings never leave your device. No upload and no cloud processing of drawings. We use anonymous product analytics to improve reliability and features, and this can be disabled in the extension popup.

💡 What is a DXF file?
A DXF file (Drawing Exchange Format) is a CAD format from Autodesk for sharing data between applications. Unlike binary formats, it is text-based and easy to share. Open drawings exported from any CAD tool that supports DXF.

⚙️ DXF File Viewer vs heavy CAD software:
▸ No install — opens in your browser
▸ No license — works without AutoCAD subscriptions
▸ Lightweight — runs entirely in the browser
▸ Cross-platform — Windows, macOS, Linux, ChromeOS

🛠 Real-world use cases:
• Quickly preview drawings emailed by clients
• Review CAD work in meetings without firing up AutoCAD
• Teach students how to view dxf files in class
• Open files on a tablet or Chromebook
• Use as a fallback dxf reader when AutoCAD is offline
• Use it as a quick DWG viewer when AutoCAD isn't installed
• View cad online with zero setup

🧱 Built for everyday CAD workflows:
1. Approval rounds — check dimensions in seconds
2. Field inspection — bring a drawing on a tablet to a job site
3. Archive access — browse old drawings from email
4. Cross-team handoff — non-CAD users read engineering files
5. Quick triage — sort drawings needing full CAD work

⚡ Built on proven rendering:
The extension uses tested parsing libraries trusted by engineering teams worldwide. Every update is reviewed for performance and compatibility before release on the Chrome Web Store.

❓ Frequently asked questions:
Q: Does it open 3D content in DXF files?
A: It opens any standard 2D DXF drawing, including drawings produced from 3D models in CAD tools. Pure 3D mesh and surface entities have limited rendering support — best results come from 2D drawings and projected views.

Q: Does the viewer open DWG files?
A: Yes. DXF File Viewer now opens DWG files by converting them to DXF locally in your browser — no upload, no AutoCAD. DWG is Autodesk's binary format, and the viewer handles the conversion for you.

Q: Did you search for online dxf viewer or dxf view online?
A: Yes, this is the same tool. Whether you call it a dxf reader or just a way to view drawings, your file opens in the browser.

📍 Tips for using DXF File Viewer:
- Drop your drawing onto the extension popup
- For large drawings, hide unused layers
- Open files straight from email or chat
- Hover a layer name in the panel to preview only that layer

👉 Ready to view dxf online?
Install DXF File Viewer, drop your file, and start exploring. No subscription, no heavy install, no waiting. Built for engineers, architects, students, and anyone needing quick CAD previews.

—
AutoCAD® is a registered trademark of Autodesk, Inc. This extension is not affiliated with or endorsed by Autodesk.
```

### Category

```
Productivity
```

### Language

```
English (United States)
```

---

## 3. Privacy tab

### Single purpose

```
View AutoCAD-compatible DXF (Drawing Exchange Format) files locally in the browser, with layer controls and pan/zoom navigation, without uploading drawings to any external service. DWG files are supported by converting them to DXF locally in the browser.
```

### Permission justifications

The extension declares no permissions in `manifest.json`
(`"permissions": []`). Leave the justification fields empty.

### Remote code disclosure

Select: **No, I am not using remote code.**

Justification (if asked):

```
All JavaScript, CSS, fonts, and assets are bundled inside the extension package. No code is fetched from a remote server at runtime.
```

### Data usage disclosure

For every category, select the values below:

| Category | Answer |
|---|---|
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | Yes (anonymous product analytics events only) |
| Website content | No |

### Three certifications (must check all three)

- [x] I do not sell or transfer user data to third parties, outside of the
      approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to
      my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or
      for lending purposes.

### Privacy policy URL

```
https://gist.github.com/AlexLyr/6ed770e249d0dbe614610dfaba0799a1
```

Recommended hosting options (any one works):

- GitHub Pages: enable Pages on the repo and link to a published copy of `PRIVACY-POLICY.md`
- Gist: paste `PRIVACY-POLICY.md` into a public gist, link to its raw HTML view
- Notion: published page

---

## 4. Manual artifacts still required

| Asset | Spec | Status |
|---|---|---|
| Final icon 16×16 PNG | transparent, brand colours | Done |
| Final icon 48×48 PNG | transparent, brand colours | Done |
| Final icon 128×128 PNG | transparent, brand colours | Done |
| Screenshot 1: popup with drop zone | 1280×800 PNG | TODO |
| Screenshot 2: viewer + layers panel + drawing | 1280×800 PNG | TODO |
| Screenshot 3: viewer on dark theme | 1280×800 PNG | TODO |
| Screenshot 4: hover preview / layer isolation | 1280×800 PNG | TODO |
| Screenshot 5: cursor coordinates close-up | 1280×800 PNG | TODO |
| Small promo tile | 440×280 PNG | TODO |
| Marquee promo tile (optional) | 1400×560 PNG | optional |

Keep originals so you can iterate after first review.

---

## 5. Build and upload

```
npm run build
cd dist && zip -rq ../dist.zip .
```

Upload `dist.zip` via the Chrome Web Store developer dashboard.

After approval, monitor:

- Reviews and crash reports tab
- Console.developer dashboard for any policy notes from the review team
