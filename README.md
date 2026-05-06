# Dashboard — New Tab

A modular, privacy-first productivity dashboard that replaces Chrome's new tab page. Drag and resize panels, keep your work in view, and carry everything with you across every device on your Chrome profile.

---

## Why it exists
Most new tab extensions are either too simple (just a clock and a background) or too heavy (cloud accounts, trackers, ads). This one sits in the middle: a  workspace you can customise, built entirely on Chrome's own APIs, with no servers, no extnesion accounts, and no data leaving the browser.

Everything — notes, kanban cards, window positions — lives in `chrome.storage`. Notes and Kanban boards sync  across your Chrome profile using `chrome.storage.sync`, the same secure channel Chrome uses for bookmarks.

---

## Features at a glance

| Module | Highlights |
|---|---|
| **Tab Manager** | Real-time search and filter (all / audio / pinned / active), jump to any tab, close tabs, export to CSV / Markdown / plain text, copy to clipboard |
| **Kanban Board** | Pick your columns on creation, custom colour-coded tags, drag cards between columns, drag headers to reorder columns, three layout modes (row / 2×2 / 3×2), cross-device sync |
| **Quick Notes** | Multiple named notes, sidebar list, word and character count, cross-device sync, graceful handling of concurrent edits from other devices |
| **Pomodoro Timer** | Circular progress ring, configurable work / short break / long break durations, session dot counter, page-title notification on completion |

**Dashboard shell**

- Drag panels by title bar · resize from bottom-right corner
- Yellow dot minimises to title bar · green dot restores
- Add unlimited panel instances · each Kanban board is independent with its own name and data
- Window layout saves locally · notes and Kanban data sync across your Chrome profile

---

## What it looks like

### The main dashboard

![Dashboard](screen_shots\dashboard.png)

```
  ● = red dot (close)   
  ● = yellow dot (minimise to title bar)
  ● = green dot (restore) 
  drag title bar to move, corner to resize
```

### Tab Manager — find any tab instantly

<img src="screen_shots\tab_manager.png" width=300>

```
Export dropdown:
  ┌─────────────────────────┐
  │ Copy as Markdown        │  ← instant clipboard
  │ Copy as Text            │  ← instant clipboard
  │ ─────────────────────── │
  │ Download CSV            │  ← file download
  │ Download Markdown       │
  │ Download plain text     │
  └─────────────────────────┘
```

Click a row to jump to that tab. Filter by audio/pinned/active. Export the current filtered view — handy for saving tabs for later or sharing.

<img src="screen_shots\tab_manager_filtered.png" width=300>

### Kanban Board — your workflow, your columns

Add a new Kanban board with `+MODULE`, add a name, configure your board, and customize your tags.

<img src="screen_shots\kanban_config.png">

<img src="screen_shots\kanban.png">

```
  ⠿ = drag column header to reorder
  ⊞ = cycle layout: row → 2×2 → 3×2
  ⋮⋮ = edit columns and tags
```

### Quick Notes — synced scratch pad

<img src="screen_shots\notepad.png">

```
sync dot: 
yellow = saving 
green = synced
red = quota exceeded (still saves locally)
```

### Pomodoro Timer

<img src="screen_shots\pomodoro_full.png">



---

## Privacy and security

This extension makes **zero external network requests**. No analytics, no telemetry, no ads, no third-party services. All data stays in your browser.

**Permissions used:**

| Permission | Reason |
|---|---|
| `tabs` | Read open tab titles and URLs for the Tab Manager |
| `storage` | Persist notes, kanban data, and window layout |

No `<all_urls>`, no content scripts, no access to page content.

**Security hardening:**

- All user and storage-sourced data rendered via DOM API only — no `innerHTML` with variable data anywhere in the codebase
- `sec.shell()` tagged template enforces alphanumeric-only interpolated values at runtime and throws on violation
- `sec.safeColor()` validates hex colours from storage against a strict regex before any style assignment
- `sec.attr()` blocks `javascript:`, `data:`, and `vbscript:` URIs on navigable attributes
- Dynamic styles use individual `.style` property assignments — no `cssText` with variable data
- Favicon URLs validated to `https://` or `chrome-extension://` schemes only before being set as `src`
- Layout data sanitized on load: types coerced, numeric values clamped to valid ranges, module types validated against a whitelist
- Strict CSP in `manifest.json`: `script-src 'self'; object-src 'none'; base-uri 'none'`
- No external font CDN — system font stack only (no Google Fonts)
- `chrome.storage.sync` errors are logged; quota failures degrade gracefully to local-only with a visible red indicator dot

---

## Installation

### Chrome Web Store

*Available at: [link]*

### Manual install (developer mode)

1. Download and unzip the latest release from the [Releases page](../../releases)
2. Open Chrome → navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `newtab-dashboard` folder
5. Open a new tab

### Build from source

```bash
git clone https://github.com/YOUR_USERNAME/newtab-dashboard.git
cd newtab-dashboard
# No build step required — load the folder directly in Chrome
```

---

## Cross-device sync

Notes and Kanban data sync across all Chrome instances signed in to the same Google account using `chrome.storage.sync`.

**How it works:**
- Writes go to local storage first (instant), then mirror to sync in the background
- On load, local and sync copies are merged — the copy with the newer `updatedAt` timestamp wins
- Incoming sync updates from another device refresh the UI in real time
- If you are actively typing a note, remote updates will not overwrite your text until you move focus away

**Quota:** Chrome allows 100 KB total sync storage, with an 8 KB per-item limit. Each note body and each kanban card occupies one key. Normal usage (dozens of notes, hundreds of cards) is comfortably within quota. If the limit is ever reached, the sync indicator turns red and all data continues saving locally — nothing is lost.

**What syncs / what doesn't:**

| Data | Synced |
|---|---|
| Note titles and bodies | ✅ |
| Kanban cards | ✅ |
| Kanban column order and tags | ✅ |
| Panel window positions and sizes | ❌ (local only — screen layouts differ per device) |
| Pomodoro settings | ❌ (local only) |

---

## Project structure

```
newtab-dashboard/
├── manifest.json          Chrome extension manifest (Manifest V3)
├── newtab.html            New tab page entry point
├── style.css              All styles and design tokens
├── security.js            Sanitization helpers + SyncStore class
├── dashboard.js           Window management, drag/resize, module picker
├── modules/
│   ├── tabs.js            Tab Manager module
│   ├── kanban.js          Kanban Board module
│   ├── notes.js           Quick Notes module
│   └── pomodoro.js        Pomodoro Timer module
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Contributing

Pull requests welcome. Please read the security rules below before opening one — they're enforced and non-negotiable.

### Security rules

- **Never** use `innerHTML` with variable data. Use `sec.el()`, `sec.attr()`, and `textContent`
- All data from `chrome.storage` must pass through a sanitizer function before use
- New style values derived from storage or user input must use `sec.safeColor()` or equivalent whitelist validation
- `sec.shell()` template literals may only interpolate instance IDs (alphanumeric, `_`, `-`)
- Do not add external network requests or CDN dependencies

### Adding a new module

1. Create `modules/yourmodule.js`:
```js
'use strict';
window.YourModule = {
  title: 'Your Module',
  defaultSize: { w: 400, h: 400 },
  mount(container, instanceId) {
    const { el, attr, shell } = window.sec;
    // Render into container using DOM API — no innerHTML with variable data
  }
};
```

2. Register it in `dashboard.js`:
```js
const MODULE_REGISTRY = {
  // ...existing modules...
  yourmodule: window.YourModule,
};
```

3. Add a picker button in `newtab.html` inside `.picker-options`
4. Add a `<script src="modules/yourmodule.js"></script>` in `newtab.html` before `dashboard.js`

For modules with persistent data, use `SyncStore` from `security.js` — see `notes.js` for a reference implementation.

---

## Licence

MIT — see [LICENSE](LICENSE)
