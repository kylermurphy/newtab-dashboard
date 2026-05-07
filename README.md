# Dashboard — New Tab

A modular, privacy-first productivity dashboard that replaces Chrome's new tab page. Drag and resize panels, keep your work in view, and carry everything with you across every device on your Chrome profile.

---

## Why it exists

Most new tab extensions are either too simple (just a clock and a background) or too heavy (cloud accounts, trackers, ads). This one sits in the middle: a real workspace you can customise, built entirely on Chrome's own APIs, with no servers, no accounts, and no data ever leaving your browser.

Everything — notes, kanban cards, window positions — lives in `chrome.storage`. Notes and Kanban boards sync automatically across your Chrome profile using `chrome.storage.sync`, the same secure channel Chrome uses for bookmarks and passwords.

---

## What it looks like

### The main dashboard

```
┌──────────────────────────────────────────────────────────────────────────┐
│  14:32   SAT, MAY 3                                        + Module      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ╔═══════════════════╗   ╔══════════════════════════════════════════╗    │
│  ║ ● ─ ○  Tab Mgr   ║   ║ ● ─ ○  My Project Kanban               ║    │
│  ╠═══════════════════╣   ╠══════════════════════════════════════════╣    │
│  ║ 🔍 Search tabs…  ║   ║ 🔍 Search   + Add Card  ⊞  ⋮⋮         ║    │
│  ║ All  🔊  📌  ●   ║   ║ All  Feature  Bug  Task  Idea           ║    │
│  ║ 12 of 34 tabs ↓  ║   ╠══════════════╦═════════╦════════════════╣    │
│  ╠═══════════════════╣   ║  TO DO     3 ║ DOING 2 ║  DONE       4  ║    │
│  ║ ◉ github.com/dash ║   ║ ┌──────────┐ ║ ┌─────┐ ║ ┌───────────┐ ║    │
│  ║   notion.so       ║   ║ │ API docs │ ║ │Auth │ ║ │ Design    │ ║    │
│  ║   figma.com/proto ║   ║ │[Feature] │ ║ │[Bug]│ ║ │[Task]     │ ║    │
│  ║   localhost:3000  ║   ║ └──────────┘ ║ └─────┘ ║ └───────────┘ ║    │
│  ╚═══════════════════╝   ╚══════════════╩═════════╩════════════════╝    │
│                                                                          │
│  ╔══════════════════════════╗   ╔════════════════════╗                   │
│  ║ ● ─ ○  Notes         ●  ║   ║ ● ─ ○  Pomodoro   ║                   │
│  ╠══════════════╦═══════════╣   ╠════════════════════╣                   │
│  ║ Meeting notes║ Client    ║   ║ Focus  Short  Long  ║                   │
│  ║ Sprint plan  ║ called    ║   ║    ╭──────────╮    ║                   │
│  ║ Ideas        ║ re: API   ║   ║    │  24:17   │    ║                   │
│  ║              ║ changes…  ║   ║    │  Focus   │    ║                   │
│  ║              ╠═══════════╣   ║    ╰──────────╯    ║                   │
│  ║              ║ 42w · 198 ║   ║  [ Pause ]  [ ↺ ] ║                   │
│  ╚══════════════╩═══════════╝   ╚════════════════════╝                   │
└──────────────────────────────────────────────────────────────────────────┘

  ● = red dot (close)   ─ = yellow dot (minimise to title bar)
  ○ = green dot (restore)    drag title bar to move, corner to resize
```

### Tab Manager — find any tab instantly

```
╔══════════════════════════════════════╗
║ ● ─ ○  Tab Manager                  ║
╠══════════════════════════════════════╣
║  🔍  github                          ║
║  All   🔊 Audio   📌 Pinned  ● Active║
║  3 of 34 tabs             ↓ Export  ║
╠══════════════════════════════════════╣
║  ◉  github.com / dashboard      ✕   ║
║     github.com                       ║
║     GitHub Actions — CI build    ✕   ║
║     github.com/actions/runs           ║
║     Pull Request #184 — fixes    ✕   ║
║     github.com/pulls/184             ║
╚══════════════════════════════════════╝

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

Click a row to jump to that tab. Filter by audio/pinned/active. Export the current filtered view — handy for sharing "open tabs for this project" with a colleague.

### Kanban Board — your workflow, your columns

```
First-run: choose your columns
╔═════════════════════════════════════════════╗
║  Configure your board                       ║
║                                             ║
║  ┌─────────┐ ┌─────────────┐ ┌───────────┐ ║
║  │● To Do  │ │● In Progress│ │● Done  ✓  │ ║
║  └─────────┘ └─────────────┘ └───────────┘ ║
║  ┌──────────┐ ┌─────────┐ ┌─────────────┐  ║
║  │  Review  │ │ Backlog │ │   Testing   │  ║
║  └──────────┘ └─────────┘ └─────────────┘  ║
║                                             ║
║  Layout:  [ Single row ▾ ]                  ║
║                                             ║
║  Tags:  ● Task  ● Feature  ● Bug  ● Idea    ║
║  [  New tag label…   ] [🎨] [ Add Tag ]     ║
║                                             ║
║  [ Use Defaults ]        [ Create Board ]   ║
╚═════════════════════════════════════════════╝

Running board in 2×2 grid layout:
╔══════════════════════════════════════════════════╗
║ ● ─ ○  Sprint 24                       ⊞  ⋮⋮   ║
╠══════════════════════════════════════════════════╣
║ 🔍 Search…   + Add Card    ⊞  ⋮⋮               ║
║ All  Feature  Bug  Task  Idea  Research           ║
╠════════════════════╦═════════════════════════════╣
║  ⬤ TO DO       3  ║  ⬤ IN PROGRESS           2  ║
║ ─────────────── ⠿  ║ ─────────────────────── ⠿  ║
║ ┌──────────────┐   ║ ┌───────────────────────┐   ║
║ │ Add dark mode│   ║ │ Refactor auth module  │   ║
║ │ [Feature]    │   ║ │ [Task]                │   ║
║ └──────────────┘   ║ └───────────────────────┘   ║
║ + Add card         ║ + Add card                   ║
╠════════════════════╬═════════════════════════════╣
║  ⬤ DONE        4  ║  ⬤ BLOCKED              1   ║
║ ─────────────── ⠿  ║ ─────────────────────── ⠿  ║
║ ┌──────────────┐   ║ ┌───────────────────────┐   ║
║ │ API endpoints│   ║ │ Waiting on design sign│   ║
║ │ [Feature]    │   ║ │ [Bug]                 │   ║
║ └──────────────┘   ║ └───────────────────────┘   ║
╚════════════════════╩═════════════════════════════╝

  ⠿ = drag column header to reorder
  ⊞ = cycle layout: row → 2×2 → 3×2
  ⋮⋮ = edit columns and tags
```

### Quick Notes — synced scratch pad

```
╔══════════════════════════════════════════════════╗
║ ● ─ ○  Notes                                    ║
╠═══════════════╦══════════════════════════════════╣
║ Meeting notes ║ Meeting notes              ● + ✕║
║ Sprint plan   ╠══════════════════════════════════╣
║ API ideas     ║                                  ║
║               ║ Client called re: the API        ║
║               ║ timeline. Need to push back      ║
║               ║ the deadline by one week.        ║
║               ║                                  ║
║               ║ Action items:                    ║
║               ║ - Update project plan            ║
║               ║ - Email stakeholders             ║
║               ╠══════════════════════════════════╣
║               ║ 42 words · 198/6500 chars     ● ║
╚═══════════════╩══════════════════════════════════╝
                                               ↑
                        sync dot: yellow = saving, green = synced,
                        red = quota exceeded (still saves locally)
```

### Pomodoro Timer

```
╔═══════════════════════╗
║ ● ─ ○  Pomodoro      ║
╠═══════════════════════╣
║  Focus  Short   Long  ║
║                       ║
║       ╭───────╮       ║
║     ╭─┤ 24:17 ├─╮     ║
║     │ │ Focus │ │     ║
║     ╰─┴───────┴─╯     ║
║                       ║
║  [ Start ] [ ↺ ]  ⚙  ║
║                       ║
║    ● ● ○ ○            ║
║    2 of 4 sessions    ║
╠═══════════════════════╣
║  Settings (⚙):       ║
║  Focus       25 min   ║
║  Short break  5 min   ║
║  Long break  15 min   ║
║  Long after   4 sess  ║
║  [ Save ]             ║
╚═══════════════════════╝
```

---

## Themes

Six themes are built in, switchable instantly via the **⚙** button in the top bar. The choice is saved and restored across sessions.

| Theme | Character |
|---|---|
| **Dark** | Deep charcoal base, blue accent. The default. |
| **Light** | White surfaces, cool grey page, saturated blue accent. |
| **Solarized Light** | Ethan Schoonover's warm cream palette with blue/cyan accents. |
| **Solarized Dark** | Same canonical palette, inverted to a deep teal base. |
| **FiveThirtyEight** | Editorial newspaper feel — warm off-white, Georgia serif font, strong red accent, ruled borders. |
| **Cyberpunk** | Near-black navy, electric magenta + cyan neons, zero border-radius, monospace everywhere, glowing window borders. |

Each theme defines the complete CSS custom property set — backgrounds, surfaces, borders, accents, shadows, and typography — so every component adapts without a single hardcoded colour override outside of `themes.css`.

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

Notes and Kanban data sync across all Chrome instances signed into the same Google account using `chrome.storage.sync`.

### When things sync

Every save triggers a connectivity probe first — a tiny test write to `chrome.storage.sync` that confirms sync is actually reachable before committing data. If the probe succeeds, data is written to sync immediately. If it fails, data is saved locally and the sync dot turns red with a tooltip explaining exactly why.

On load, the extension reads local storage instantly (so the page is never blocked), then checks sync in the background and merges any newer data from other devices. The merge uses `updatedAt` timestamps — whichever copy of a card or note is newer wins.

The `onChange` listener fires when sync pushes an update from another device while the new tab is open, refreshing the UI without a page reload.

### Sync status dot

Hover the dot to see the exact status. Possible states:

| Dot colour | Meaning |
|---|---|
| 🟡 Yellow | Saving in progress |
| 🟢 Green | Synced to Chrome profile |
| 🔴 Red | Not syncing — hover for exact reason |

Red dot reasons and fixes:

| Tooltip says | Fix |
|---|---|
| Not signed into Chrome | Sign into Chrome with a Google account |
| Extension sync disabled | Go to `chrome://settings/syncSetup` → enable Extensions |
| Quota exceeded | Data is saved locally; reduce notes/cards to stay under 100KB |
| Network offline | Will retry automatically on next save |
| Extension ID unstable | See developer mode section below |

### Developer mode: why sync may not work between two computers

**This is the most common reason sync appears broken.** Unpacked extensions loaded via "Load unpacked" get a **random extension ID** assigned by Chrome on each computer. `chrome.storage.sync` keys are scoped to the extension ID, so the two computers are writing to completely separate namespaces and will never see each other's data.

**To fix this**, give the extension a stable ID by adding a `"key"` field to `manifest.json`:

1. On one computer, go to `chrome://extensions` and note the extension ID (e.g. `abcdefghijklmnopqrstuvwxyz123456`).
2. Find the `.pem` file Chrome generated when you first loaded the extension (it's in the same folder as the extension, named something like `newtab-dashboard.pem`).
3. Open the `.pem` file, copy the base64 content between `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----`.
4. Add it to `manifest.json`:
```json
"key": "MIIBIjANBgkq...your full key here...IDAQAB"
```
5. Reload the extension on both computers — they should now share the same ID and sync will work.

Alternatively, publish to the Chrome Web Store (even as unlisted/private). Published extensions always have a stable ID and sync works without any extra steps.

### What syncs / what doesn't

| Data | Synced |
|---|---|
| Note titles and bodies | ✅ |
| Kanban cards | ✅ |
| Kanban column order and tags | ✅ |
| Panel positions and sizes | ❌ (local only — screen layouts differ per device) |
| Theme choice | ❌ (local only) |
| Pomodoro settings | ❌ (local only) |

### Sync quota

Chrome allows 100 KB total sync storage with an 8 KB per-item limit. Each note body and each kanban card is stored as a separate key. Normal usage (dozens of notes, hundreds of short cards) fits comfortably. If you exceed the limit the dot turns red, all data continues saving locally, and nothing is lost.


---

## Project structure

```
newtab-dashboard/
├── manifest.json          Chrome extension manifest (Manifest V3)
├── newtab.html            New tab page entry point
├── themes.css             Theme token definitions (6 themes)
├── style.css              All structural styles and layout
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
