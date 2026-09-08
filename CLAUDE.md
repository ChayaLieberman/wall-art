# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, single-page marketing/e-commerce-lead site (Hebrew, `dir="rtl"`) for מרדכי ליברמן, an artist who does hand-carved Jerusalem-themed wall reliefs. No framework, no bundler, no package manager — just `index.html`, `styles.css`, and `script.js` loaded directly by the browser. There is no `package.json`; do not introduce one or a build step unless explicitly asked.

## Repository layout and the `dist/` mirror

- `index.html`, `styles.css`, `script.js`, `catalog.pdf`, `images/` at the repo root are the **source** files you edit.
- `dist/` is an exact duplicate of those same root files/folders. `.openai/hosting.json` (`static.directory: "dist"`) tells the hosting platform to serve **only from `dist/`**, so `dist/` is what visitors actually see.
- There is no build script that generates `dist/` — it is kept in sync by hand. **Any change to `index.html`, `styles.css`, `script.js`, `catalog.pdf`, or `images/` must be mirrored into the matching path under `dist/`**, or the deployed site will not reflect the change. When in doubt, diff root vs. `dist` for the files you touched before considering a task done.
- This directory (`site/`) is its own git repo (single history, no remote configured). The parent directory (`C:\Users\a0583\source\MyProject`) is *not* a git repo; it just holds sibling asset/working folders (see below) and is not part of what gets deployed.

## Sibling folders (outside this repo, one level up)

- `../tests/site-browser.html` — a self-running, dependency-free regression check. It loads `/site/index.html` in an iframe and drives the UI (gallery lightbox, mobile nav, the whole designer flow: shapes, models, text styles, frames, undo, draft autosave, PNG export, quote/share/email flow) via DOM clicks, asserting with a simple `check(name, condition)` logger. There is no test runner — open it in a browser against a server rooted at the **parent** directory so `/site/...` paths resolve, e.g. run a static server from `C:\Users\a0583\source\MyProject` and browse to `/tests/site-browser.html`. Read its output pane for PASS/FAIL lines.
- `../tests/responsive-preview.html` — manual visual check; loads `/site/index.html` in a resizable iframe with buttons for common breakpoints (320/390/760/1440) and section anchors.
- `../gallery/`, `../paintings/` — raw source images that get edited/exported into `site/images/` (finished gallery photos and painting thumbnails used by the designer).
- `../catalog-review/render.ps1` — a Windows-only PowerShell utility (uses `Windows.Data.Pdf` WinRT APIs) that rasterizes pages of `site/catalog.pdf` to PNG for visual review. Unrelated to the site runtime; only relevant if regenerating catalog preview images.
- `../backups/` — manual timestamped snapshots of the whole `site/` folder (not git-based). Leave these alone; they're not part of the working codebase.

There is no lint or automated test command to run (`npm test`, etc. do not apply) — verification is: open the page(s) in a browser (via the test harnesses above, or directly) and check visually/interactively.

## Architecture: `script.js`

Everything lives in one file, organized top-to-bottom as independent feature blocks operating on `index.html` by element ID/class — there's no module system or shared state object beyond a few top-level `let`s.

1. **Nav toggle + lightbox gallery** — a pointer-events-based lightbox (`#lightbox`) supporting wheel zoom, double-tap zoom, and pinch/drag pan via the Pointer Events API (works uniformly for mouse/touch/pen).
2. **Free-canvas designer** (the largest piece, from `// ===== Free-canvas designer =====` onward) — a drag/resize layer system on `#designer-canvas`:
   - Layer types: `shape` (the aleph-square/rect base area), `frame` (only one exists at a time — changing frame kind restyles the existing element rather than adding a new one), `text` (contenteditable, `style-carve`/`style-raised`), `painting` (a chosen model or an uploaded/data-URL image).
   - `createLayerShell()` is the shared factory for drag handles, resize corners, and delete/edit buttons; `attachDrag()` implements pointer-based drag/resize with clamping to canvas bounds.
   - Undo: every mutation calls `pushUndo()` first, which serializes the whole canvas (`serializeCanvas()`/`serializeLayer()`) onto `undoStack` (capped at `UNDO_LIMIT`); `undo()` pops and calls `rebuildCanvas()`. The `isRebuilding` flag suppresses re-entrant history pushes while a saved/undo state is being replayed.
   - Draft persistence: `scheduleDraftSave()` debounces writes of the serialized canvas to `localStorage` (`amaDesignerDraft`); restored on load with a dismissible "draft restored" notice.
   - "Guided" controls (the accordion: שטח/ציור/כיתוב/מסגרת) are a thin layer over the same primitives — `guidedChange()` wraps a mutation in `pushUndo`/`isRebuilding` and then calls `syncGuidedChoices()` to reflect current layer state back onto the `aria-pressed` buttons via a `MutationObserver` on the canvas.
   - Export: `exportDesignCanvas()` re-draws all layers onto an off-screen `<canvas>` at a fixed 1200px width (manually re-implementing each layer type's look — shape fill, text with carve/raised shadow treatment, frame styles including the glass frame's corner "screws") to produce a downloadable/shareable PNG independent of the live DOM styling.
   - Quote flow: `#config-send` exports the design, then shows either a Web Share API button (if `navigator.canShare` supports files) or a `mailto:` link that also triggers the PNG download — any further canvas mutation invalidates the prepared quote via the same `MutationObserver` pattern (`invalidateQuote`).
3. **Scroll-reveal animations** for the gallery grid and the "how it works" process steps, via `IntersectionObserver` with a graceful no-JS-observer fallback.

## Conventions

- Hebrew RTL throughout: `<html lang="he" dir="rtl">`. Keep new copy in Hebrew and mind logical (`inline-start`/`inline-end`) vs. physical CSS properties already used in `styles.css`.
- Fonts are loaded from Google Fonts in `<head>` (Frank Ruhl Libre, David Libre, Assistant) — no local font files.
- `styles.css` design tokens live in `:root` at the top of the file (color palette under `--surface`/`--accent`/`--bronze`/etc., `--radius`, `--max-width`); prefer reusing these over hardcoding new colors. Sections are marked with `/* ===== Name ===== */` banner comments — grep for these to jump to a section rather than reading the whole 2000+-line file.
