# Localis

Browser extension (Manifest V3) that replaces the new tab page with a customizable start page.
No build step: HTML + ES modules + [Dexie](https://dexie.org) included in `lib/`.

## Install (Chromium browsers)

1. Download the extension ZIP from [GitHub Releases](https://github.com/scaamanho/tabra/releases) and extract it. Do not use GitHub's automatically generated “Source code” archive.
2. Open the extensions page for your browser:

    | Browser | Extensions page |
    |---|---|
    | Chrome | `chrome://extensions` |
    | Brave | `brave://extensions` |
    | Edge | `edge://extensions` |
    | Vivaldi | `vivaldi://extensions` |

3. Turn on **Developer mode** on that page.
4. Select **Load unpacked** and choose the extracted Localis folder.
5. Open a new tab. To edit, click the **⚙** icon (hover to see **Manage**) or use the extension icon.

## GitHub Actions package

Download the extension ZIP asset from [GitHub Releases](https://github.com/scaamanho/tabra/releases), not GitHub's automatically generated “Source code” archive. Publishing a release attaches the extension-only ZIP. To add it to an existing release, run **Package extension** from Actions and enter its tag in `release_tag`. Each push and manual workflow run also creates a versioned `localis-extension` artifact in Actions. The extension ZIP excludes `index.html`, landing page styles, and screenshots.

## Features

| Component | Description |
|---|---|
| Start page (`newtab.html`) | **Multiple pages** with tabs, collapsible sections, instant filtering across pages, search shortcuts (`g text`, `yt text`), and theme, layout, and size controls. |
| Administration (`admin.html`) | Visual board editing, drag-and-drop sections and links (including between sections), editing dialogs, and favicon / emoji / URL / uploaded image icons. |
| Theme engine (`js/themes.js`) | Theme tokens generate CSS variables. 20 built-in themes, live preview editor, glass effect, image or gradient backgrounds, and custom CSS. **Follow system** mode supports separate light and dark themes. |
| Data (`js/db.js`, `js/io.js`) | IndexedDB with Dexie. JSON import/export (merge or replace), HTML bookmark import, and automatic backups before imports. |

## Shortcuts (start page)

| Key | Action |
|---|---|
| Type any letter or `/` | Focus search |
| `↓` / `↑` | Cycle through results |
| `Enter` / `Ctrl+Enter` | Open the selected result (or search shortcut such as `g text`) in the current / a new tab |
| `Esc` | Clear the filter |
| `Alt+1`…`Alt+9` | Switch pages |

In the administration panel, deleting a link, section, or page shows an **Undo** action.

## Structure

```
manifest.json      background.js
newtab.html        admin.html
css/  base.css (board + themes)  newtab.css  admin.css
js/   db.js  themes.js  io.js  render.js  newtab.js  admin.js  boot.js
lib/  dexie.mjs (Dexie 4.x, Apache-2.0)
```

`render.js` is shared by the start page and administration panel.
`boot.js` applies the last theme from `localStorage` before the first paint to prevent flickering.

## Data model (Dexie, version 4)

```
settings : key                      -- one document { key: 'main', title, themeId, themeMode, activePageId, … }
pages    : ++id, order              -- { title, icon, order }
sections : ++id, order, pageId      -- { pageId, title, icon, color, span(1-3), layout(grid|list), collapsed, order }
items    : ++id, sectionId, order   -- { title, url, description, iconType, icon, tags, target, sectionId, order }
themes   : id                       -- custom themes only
backups  : ++id, createdAt          -- { label, data: <full export> }
```

Existing databases migrate automatically: v1 sections are assigned to a Home page, and v4 updates the previous default title to Localis. Custom titles and content are preserved.

## Export format

```json
{ "format": "startboard", "version": 2, "exportedAt": "…",
  "settings": { … }, "pages": [ … ], "sections": [ … ], "items": [ … ], "themes": [ … ] }
```

Each block is optional. Version 1 files without `pages` remain supported; their sections go to a new page. Imports are validated and sanitized (`javascript:`/`data:` URLs are discarded, colors and ranges are constrained, and CSS `@import` is removed), and IDs are reassigned. The `startboard` format identifier is retained for compatibility with existing exports.

## Notes

- **Favicons**: Chrome/Edge use the local `_favicon` API (`favicon` permission) without sending domains to third parties. You can choose DuckDuckGo, Google, or letters only in settings.
- **`chrome://` and `file://` links** open through `chrome.tabs` because extension page links cannot navigate to them directly.
- **Firefox**: the code is mostly compatible, but the manifest needs adaptation (`background.scripts`, `browser_specific_settings.gecko.id`), and `_favicon` is unavailable (DuckDuckGo is used automatically).
- Data lives in the browser profile and **does not sync** across devices. Use export/import to transfer it.
