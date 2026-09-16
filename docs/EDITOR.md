<!-- Part of ScaleNote's spec. See CLAUDE.md for the document index and when to read this file. -->

## Design and visual quality: do not look AI-generated

Reference point: Previous ScaleNote's actual look and feel — flat, restrained, quiet, purposeful. That is the literal bar, not a generic "modern SaaS" aesthetic. This is a real, checkable acceptance criterion for Milestone 7 (and worth holding to throughout, not just at the end) — not a vague vibe.

**Actively avoid:**
- Gradients used decoratively — background washes, button fills, card backgrounds. Solid colors only, except where a gradient is an explicit, speced functional option (the canvas background Gallery, the cover image Gallery) — and even there, restrained, not a rainbow of options for their own sake.
- Glassmorphism or frosted-blur panels. No `backdrop-filter` blur, no translucent frosted cards.
- Oversized drop shadows, glow effects, neon accents.
- Reflexive large border-radius on every rectangle "because it looks modern" — round where it's already established (buttons, cards) and stop there.
- Micro-animations on every hover or click — elements that scale up, bounce, pulse, or otherwise animate beyond a fast, purposeful state change. Motion should do a job (a menu sliding in, a hover preview appearing, the drag ghost tracking the pointer) — it isn't decorative flourish layered on top of everything.
- Decorative icons or illustrations that don't serve a specific functional purpose.
- Inconsistent spacing or alignment "for visual interest" — hold to one consistent, modest spacing scale throughout.

**Instead:**
- Color is functional, not decorative — entity accents, status indicators, the pen/highlight palette, the theme's own defined palette. Not scattered in as extra visual flourish anywhere else.
- Flat surfaces, minimal shadow. A single subtle shadow for genuine elevation (a modal, an open dropdown) is fine; stacking multiple shadow or glow layers is not.
- Plain, readable typography — one clean sans-serif, a consistent weight/size scale, no display fonts for body content.
- Before calling any screen done, check it specifically against this list — does it use a gradient, blur, glow, or animation that isn't functionally load-bearing? If so, remove it. This is a real gate, not a suggestion.

## Why hand-rolled canvas, not a whiteboard SDK

Don't pull in tldraw, Excalidraw, or similar full whiteboard libraries. Build the canvas with HTML5 Canvas and `perfect-freehand` for stroke smoothing. The point of this build is to see what you can actually produce, not what a pre-built library produces for you.

## Pen/highlighter color swatches (exact values, do not approximate)

3 rows of 5 swatches, in this exact order and grouping:

- **Row 1 (Vibrant):** Red `#E71225`, Orange `#F6630D`, Yellow `#FFC114`, Green `#008C3A`, Light Green `#66CC00`
- **Row 2 (Cool):** Sky Blue `#00A0D7`, Dark Blue `#004F8B`, Purple `#AB008B`, Pink `#FF0066`, Plum `#CC0066`
- **Row 3 (Grayscale):** White `#F3F2F1`, Silver `#B8BFC1`, Gray `#849398`, Charcoal `#4A4A4A`, Black `#000000`

Below this 3×5 grid, a custom color picker box spans the width of 3 swatches, using the same spacing as between swatches in the grid above — no separate "recent colors" row.

## Canvas background pattern (exact values, do not approximate)

Three options: Blank (nothing drawn), Dots, Lines.

- **Dots:** spacing 24px, scaled by the current zoom level. Each dot is a filled circle, radius 0.8px.
- **Lines:** horizontal lines every 28px, scaled by zoom, 1px stroke width.
- **Red margin line:** in Lines mode only, one additional vertical line at 80px from the left edge (scaled by zoom and panned with the viewport, same as the horizontal lines), color `#FF5050`, 1.5px stroke width — the standard ruled-notebook margin line.
- **Pattern color adapts to the canvas background color's brightness:** compute perceptual brightness as `(r*299 + g*587 + b*114) / 1000`; if brightness is above the halfway point (128 out of 255), use `#3A3A3A` (dark grey, for light backgrounds); otherwise use `#CAEBFD` (light blue, for dark backgrounds). This applies to both dots and the horizontal lines — the red margin line's color never changes.
- All spacing values scale with zoom and pan together with the viewport, so the pattern stays visually anchored to canvas space rather than sliding independently as the user pans or zooms.

## Image and embed resizing

Both image blocks and link-embed blocks share one resize implementation: 8 handles (top/bottom/left/right edges, plus 4 corners). Edge handles resize width or height independently; corner handles preserve aspect ratio by using whichever axis moved more (compare the horizontal and vertical drag distance, scale by the larger one, derive the other dimension from the aspect ratio — don't average the two or you get a mushy, unresponsive feel). Update the block's size attribute directly on every pointermove — no debounce, no intermediate state — for the same lag-free reason established for the block gutter drag elsewhere in this document. Clamp to a sensible minimum size (don't let a block get resized down to nothing) and support both mouse and touch input on the handles.

## Link paste: Mention / Paste / Embed / Bookmark

- **Paste** is the default/fallback and needs no network — just the raw URL as plain text. If a title fetch (Mention, Bookmark) or embed load fails for any reason (offline, blocked, timeout), fall back to this rather than leaving a broken block.
- **Mention** fetches only the target page's title (and favicon, if trivially available) — a small, bounded request, not a full page load. Cache the result on the block so re-opening the note doesn't re-fetch every time.
- **Bookmark** is the same idea as Mention but richer — title, a short description, and a preview image, shown as a card. Same caching rule: fetch once, store the result, don't re-fetch on every open.
- **Embed** loads the linked page in a sandboxed frame with no access to the Tauri IPC bridge, filesystem, or any app internals — treat embedded content as fully untrusted, same as any other third-party web content. Some sites block being framed entirely; when that happens, show a clear "can't embed this site — try Mention, Bookmark, or Paste instead" message rather than a broken or blank block.
- Embed blocks use the same resize-handle system as image blocks (see above) — one interaction pattern for both, not two.

## Additional block types: implementation notes

**`FORMAT.md` is authoritative for how every one of these is written to disk** — the directive syntax, attribute names, and block-ID convention. Do not invent a representation for a block type; if `FORMAT.md` doesn't cover something you need, add it there first (with a `DECISIONS.md` entry) rather than improvising in the serializer. The notes below cover behaviour, not syntax.

- **Table of contents:** derived entirely from the note's own heading blocks at render time — never stored separately, so it can't go stale. Clicking an entry scrolls to that heading.
- **Breadcrumb:** derived from the file's own path relative to the vault root — walk up the folder tree, read each ancestor folder's name (and icon, if the `.scalenote-folder.json` sidecar has one) for the trail. No separate breadcrumb data to maintain.
- **Copy link to block:** generate a stable per-block anchor ID (assigned once, on block creation, stored with the block) so a link can point at a specific block within a note, not just the note as a whole. Keep this ID stable across edits to the block's content — only regenerate if the block itself is deleted and recreated.
- **Synced block:** content lives in one place, referenced by ID from every location it's embedded. Store the canonical content once (in the note where it was originally created) and have every other instance hold just a reference — editing any instance updates the canonical copy, and every reference re-renders from it. Make it visually obvious when a block is a synced reference versus original content, so a user doesn't edit what they think is a local copy and get confused when it changes elsewhere too.
- **Mermaid diagrams:** render fully locally via a bundled diagramming library — this is text-to-diagram, not an image, so no network fetch is involved at any point.
- **Import from other note apps.** Model this on Obsidian's own official Importer plugin (a real, shipped, open-source implementation worth studying directly rather than guessing at the formats) — it's the concrete proof that everything below is achievable fully offline:
  - **Obsidian:** no parser needed — just point the vault picker at the folder. Detect a `.obsidian/` folder and show a one-time compatibility notice (wikilinks work as-is; callouts and Dataview-style queries don't translate automatically). Never read, write, or delete anything inside `.obsidian/`.
  - **Notion:** parse the ZIP the user exports themselves from Notion ("Export all workspace content," Markdown & CSV or HTML) — never a live Notion API/account connection. CSVs become ScaleNote database schemas; map Notion property types to ScaleNote's own where they match (Select→Select, Status→Status, Date→Date, and so on), and fall back to plain Text for anything that doesn't have a clean equivalent rather than dropping the data. This is the messiest of the four formats — Notion's nested block model doesn't map 1:1 to plain markdown — so don't try to silently guarantee perfect fidelity; report what didn't come across cleanly rather than pretending everything transferred.
  - **OneNote:** parse `.one`/`.onepkg` files directly — this is a real, proven-possible format to parse offline (Obsidian's importer does exactly this, no Microsoft account or API involved). Map ink drawings directly onto ScaleNote's own canvas stroke schema (see the Canvas data model section in ARCHITECTURE.md) rather than flattening them to a static image — this is a genuine, meaningful fidelity win over a naive "screenshot the page" import. Map formatting, lists, tables, tasks, tags, highlights, equations, images, attachments, and internal links onto their ScaleNote block equivalents.
  - **Evernote:** parse `.enex` files — Evernote's own local XML export format. Also fully offline, no account.
  - **Local-file-format import beyond named source apps:** Markdown/Text, CSV (into a database), Word, PDF — local parsers producing new notes/database rows. Word and PDF parsing libraries exist in the Rust ecosystem and should run entirely offline.
  - **Every importer is local-file-based only, never account/API-based** — consistent with the rest of this spec's no-accounts design. If a format's only realistic import path would require OAuth or a live API connection to the source service, that's a sign it doesn't belong in this feature, not a sign to build the OAuth flow anyway.
  - **Test each importer against a real fixture file and a recorded expected output**, diffed on every change — the same testing pattern Obsidian's own importer uses. A parser silently regressing on an edge case it used to handle correctly is exactly the kind of bug that's invisible without this.
  - Validate imported content the same way any other write path is validated — a malformed row, a corrupted embedded image, or a file that fails to parse partway through shouldn't crash the app or produce a half-written note; skip that item, keep going, and report what didn't import at the end.

## Canvas embed in the block editor

A `/canvas` slash command inserts a **live read-only view into a frame on the note's own canvas layer** — not a separate mini-canvas, not a static image. Mechanically:

- Executing `/canvas` creates a new frame (a placed object, as above) at a sensible empty position on the canvas — check existing object bounds and place it somewhere that doesn't overlap them, don't hardcode a fixed spawn coordinate — and inserts a `canvasEmbed` block at the cursor that stores only that frame's ID.
- The embed block subscribes to the same canvas data and redraws whenever it changes, clipped to the frame's rectangle, so edits made in canvas mode appear live in the embedded view without the user doing anything.
- The embed is read-only in place — you can't draw directly inside it in the text flow. Double-clicking it should jump straight into canvas mode with the view centered on that frame, rather than making the user hunt for it manually.

## Lasso-select on canvas (model this on OneNote)

Don't compute the enclosed selection only once when the pointer is released. Re-evaluate which strokes/objects fall inside the loop continuously while the user is still drawing it, so items highlight and un-highlight live as the loop grows or the user backtracks — this incremental feedback is what makes OneNote's lasso feel responsive, and a single pointer-up calculation feels dead by comparison. Also don't require every sampled point of a stroke to fall inside the loop polygon to count it as selected — that's too strict for curved strokes that dip slightly outside a loosely-drawn loop; a majority-of-points or centroid-inside test is more forgiving and closer to how OneNote actually behaves. After the loop closes, show resize/move handles around the resulting bounding box of the whole selection.

## Block gutter drag (model the feel on AppFlowy, the elongation on AFFiNE)

- Move the drag ghost by writing directly to its transform/position on every raw pointermove event — do not route the position through component state and a re-render cycle. Routing through state introduces a frame of lag that is very noticeable even though the position is only slightly stale; a direct style mutation on the DOM node tracks the pointer exactly.
- When the gutter is hovered over a multi-block selection (not just a single block), recompute the gutter's rendered height and position from the bounding rect of the *entire* selected range, so it visually elongates to span all selected blocks rather than staying sized to one. Recalculate this on every hover change, not once at selection time.
- While dragging, highlight the *entire block* being dragged (a background tint on the whole block container), not just its text content — a text-only highlight reads as "selecting text," a whole-block highlight reads as "moving a block," and the latter is what you want here.
- Detect drop position as one of `above` / `below` / `left` / `right` relative to the block being hovered over, based on which edge of that block the pointer is closest to. `above`/`below` reorders normally. `left`/`right` creates a side-by-side column layout with the dragged block and the target block sharing a row — this is the Notion-style column-creation gesture and is a first-class drop outcome, not an edge case to skip.

## Known failure patterns to avoid

These are real bugs from Previous ScaleNote, worth guarding against explicitly rather than rediscovering:

- **CRDT/provider lifecycle leaks.** Every place a CRDT document or network connection is created must have a matching teardown when the component unmounts or the connection closes. A duplicate connection from a leaked prior instance is a classic source of "why did that edit get applied twice" bugs.
- **Autosave racing a note switch.** If the user switches notes while a save is still in flight, the in-flight save must either complete and write to the *correct* note, or be cancelled — never let it land after the switch and overwrite the new note with stale data.
- **UI state silently diverging from the CRDT source of truth.** If the title (or any field) is ever held in local component state instead of being read from the CRDT document, a later re-render can revert it to a stale value. Any field that's part of the document belongs in the document, not duplicated in local state.
- **Overly broad Tauri permissions.** Don't grant `shell:default`, `http:default`, or similar catch-all permissions "to be safe" — grant only the specific commands/APIs actually called, per the security rules in SECURITY-AND-STABILITY.md.
- **Unbounded trust of incoming network payloads.** Don't apply a raw incoming CRDT update straight to the document without a size check first — see the peer-to-peer security rules in SECURITY-AND-STABILITY.md.

## Customizable sidebar sections

Which sections are visible and their order is a personal layout preference, not vault content — store it in the app-level config location (same place as theme/font size/other Settings values), not in the vault. A pinned database view section stores a reference (which folder, which specific view configuration) rather than duplicating that view's definition. "Upcoming" is computed at render time by scanning notes for reminder values on date properties/inline date mentions — not a separately maintained list that could drift out of sync with the actual notes.

## Custom icons and page cover images

- The "Add icon" / "Add cover" hover row only renders when both are genuinely unset on that page — check both conditions, not just one, and remove the row entirely (not just hide it) once either gets set, rather than leaving dead space or a disabled state behind.

- A custom-uploaded icon is stored as a real file in the vault's `attachments/` folder, same as any other image — referenced from the entity's frontmatter (for a page) or `.scalenote-folder.json` (for a Notebook/Folder/Section) by path, not embedded as a data URI or duplicated elsewhere.
- The light/dark preview swatches when uploading a custom icon are just the same pending image rendered twice, once over each theme's actual background color — not a separate rendering pipeline, just two instances of the normal icon-render component with different backgrounds behind it.
- The local icon library (for reusing an uploaded icon elsewhere) is a small index of `{ name, file path }` pairs stored in `.scalenote/` — a convenience index, regenerable from the attachments folder if it's ever lost, not a second source of truth for the images themselves.
- A page cover image has three possible sources, and the frontmatter should distinguish them clearly: a built-in Gallery choice stores just an ID (which bundled color/gradient/texture) plus nothing else — no file involved; an Upload or Link-sourced cover stores a file path into `attachments/` (Link fetches the image once, then it's a local file exactly like an upload — not re-fetched on every open) plus a reposition offset (the vertical crop position within the fixed-height banner).
- Link-sourced covers are the same category of narrow network exception as Mention/Embed/Bookmark — fetch once, fall back to no-cover-set if it fails, never retry silently in the background.

## Sidebar entity kinds (Notebook / Folder / Section / Page)

Notebook, Folder, and Section are the same underlying disk primitive — a directory — distinguished only by a small metadata sidecar and how the sidebar renders them. Don't build three separate storage mechanisms for these:

- A directory that represents a Notebook, Folder, or Section has a `.scalenote-folder.json` sidecar *inside* it, holding `{ kind: "notebook" | "folder" | "section", icon, color }`. Absence of this file means "plain folder, default rendering, no customization set."
- Section renders with a colored accent bar (matching the visual style Previous ScaleNote used) rather than a folder icon, even though on disk it's identical to Folder apart from the `kind` field.
- Page icon/color needs no separate sidecar — pages already have YAML frontmatter, so `icon` and `color` are just two more frontmatter fields on the note's own `.md` file.
- Icon can be an emoji character (store it as-is, render as-is, never tinted) or a reference to one of a small set of built-in monochrome glyph icons bundled with the app (ship these as local SVG assets, not fetched from a network — this must work fully offline). A glyph icon's `color` field tints it; an emoji's `color` field only affects that entity's sidebar accent, not the emoji itself.
- The color picker is a genuine picker (a color wheel or hex/RGB input) — not a fixed palette of preset swatches. Users can set any color, not just one of eight.

## Hover previews on menus

Build this as one shared component (a small floating preview panel keyed to "currently highlighted menu item"), not a bespoke implementation per menu — the slash command menu, "turn into" menu, add-property picker, and add-view picker should all use the same underlying mechanism. Delay showing the preview slightly on hover (don't flash a preview for every item the pointer passes over while scrolling quickly) and position it beside the highlighted item without overlapping the menu itself. Preview thumbnails are static illustrative assets bundled with the app (per the offline-only rule — no fetching preview images from a network), not generated from the user's actual note content.

## Code block

Single background color for the whole block — don't build a separate-colored header strip the way some reference chat UIs do; the language label and download button sit as small controls floating in the top-right corner of the same flat surface, not in a visually distinct bar. Auto-detect the language from content on every content change (a lightweight heuristic/library-based detector is fine — this doesn't need to be perfect, just right often enough that manual override is the exception, not the rule). Right-click opens a context menu to pick a language explicitly, which then sticks (stop auto-detecting for that block once the user has manually set one, so it doesn't fight their choice on every keystroke). The download button writes the block's exact text content to a file with the right extension for its current language — this is a plain local file write, not a network operation.
