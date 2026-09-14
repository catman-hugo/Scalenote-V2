# Agent instructions for building ScaleNote

You are building the app described in README.md. Read it first. This file is the operating contract — follow it exactly.

**Timeline: target a fully polished, non-crashing, good-looking core product by mid-January (roughly 4 months from the start of this project) — not everything in this spec, a deliberately chosen subset, sequenced below. The full scope in README.md is real and wanted, not aspirational filler, but it's sequenced to land across roughly a year, not compressed to hit the January date. If the January milestone slips due to model/compute quota limits or anything else, that's an acceptable, expected outcome — do not cut corners on quality or security to hit the date instead.**

## Roadmap

### Toward the January milestone — this subset needs to be genuinely done, not just started

**Milestone 1 — Foundation (~2 weeks).** Tauri + React + Vite scaffold. Vault folder selection, reading/writing plain markdown files, the sidebar file tree. Prove atomic writes work (kill the app mid-save, confirm no corruption). Set up the on-disk layout correctly from the start per README.md's directory example — canvas sidecars, visible attachments folder, `.scalenote/` reserved for regenerable/device-local state only. Portable-vs-installed detection. Structured logging (`tracing`, rotating file, frontend errors forwarded to it) — get this in early, not bolted on later, since everything after this point is easier to debug with it in place.

**Milestone 2 — Core editing & organization (~5 weeks).** Markdown source editor with live preview, backed by `yrs` from the start (retrofitting CRDT after the fact is much more work than starting with it). SQLite search index, full-text search, command palette, quick switcher. Wikilinks, backlinks, tags. The full block-based rich editor (Tiptap) as an alternate view of the same CRDT-backed document: slash command menu, every block type in README.md's expanded list (headings, equations, Table of contents, Breadcrumb, Tabs, Synced block, columns, etc.), link paste (Mention/Paste/Embed/Bookmark), code blocks (exact visual spec), the shared image/embed resize-handle system, hover previews on menus. Sidebar entity kinds (Notebook/Folder/Section/Page) with custom icons/colors/covers, sidebar customization.

**Milestone 3 — Database views (~2 weeks).** Full property type set, all view types (Table/Kanban/Calendar/Gallery/List/Timeline/Charts/Form/Linked view), inline option editing, side peek.

**Milestone 4 — Canvas & drawing (~2 weeks).** Edgeless canvas mode, exact color swatches and background patterns, lasso-select (OneNote-style live hit-testing), block gutter drag/elongation, draw-over-text annotation layer (block-anchored, not screen-pixel), canvas embeds, split view.

**Milestone 5 — Settings & AI assistant (~2 weeks).** Full Settings UI (General/AI/Diagnostics), Ollama integration, hardware detection and fit scoring, guided setup, Study Assistants (RAG). Memory (see Milestone 10) is explicitly deferred past this point — don't let it creep into this milestone's scope.

**Milestone 6 — P2P collaboration core (~3 weeks).** Identity/profile, friend nicknames. LAN/Tailscale/manual discovery, pairing, `quinn` QUIC transport, CRDT sync, cursor/selection awareness, presence, reconnect handling. A single-account home server (the multi-account version is Milestone 8, after January).

**Milestone 7 — Hardening and design pass (~2 weeks) — this is the January finish line.** Security audit (`cargo audit`/`npm audit`, Tauri capability review, the untrusted-peer-input checklist). Stability pass: deliberately try to break every feature, including two live instances editing simultaneously. Performance pass. And the design audit described below — this is a real acceptance gate for the milestone, not optional polish.

### After January — real, wanted, sequenced for the rest of the year

**Milestone 8 — Multi-account home server:** the Jellyseerr-style request/approval flow, allowlist/blocklist, per-account isolated storage.
**Milestone 9 — Voice calls:** basic single-device calling first and thoroughly proven out, then the multi-device audio routing stretch capability.
**Milestone 10 — Memory:** background extraction, regex fallback, notes-as-storage, consolidation pass, relevance-scoped retrieval.
**Milestone 11 — Multi-device sync refinements:** cloud-folder fallback's external-change detection, the shared sync-engine crate boundary if not already clean from earlier work.
**Milestone 12 — Companion 3DS client:** navigate/add/draw, bidirectional canvas-only sync.
**Milestone 13 — Additional platforms:** Android build, the `.deb`, and the headless server-mode binary matching the existing `server/` scaffold.
**Milestone 14 — Open-source release audit:** the no-identifying-information sweep described in the security section below, license file, public-facing documentation pass.

If work needs to pause or stop at any point, stop at the end of the current milestone, make sure everything up to that point is solid, and leave anything beyond it visibly disabled with a "not finished" state rather than partially built and broken.

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

## Logging

Use `tracing` in Rust (with `tracing-appender` for a rotating, non-blocking file writer) rather than ad-hoc `println!`/`console.log` scattered through the codebase. This matters more than it would in a typical app because devtools are disabled in the release build — a log file is the only diagnostic surface a user or a future developer has once the app is actually shipped.

- One log file per run, in the app-level config location (same place as general settings — see the portable/installed rule above), with rotation so files don't accumulate unbounded.
- Every entry: timestamp, level, the module/component it came from, a message, and structured fields for anything relevant (a note ID, a peer address, a file path, a byte count) — not just a free-text string with no context.
- Default level is info/warn/error. The verbose-logging toggle in Settings switches to debug/trace at runtime, no rebuild needed.
- Frontend errors must reach this same log file, not just the browser console — wire error boundaries and any caught-but-notable failures (a failed sync, a failed AI-tab request) through a Tauri command that writes into the Rust-side log.
- Never log note content, canvas/drawing data, the Ollama Cloud API key, or pairing secrets — log identifiers, paths, sizes, and counts instead. A log file that leaks the very content it's supposed to help debug around is a privacy problem, not a diagnostic tool.

## Security requirements (non-negotiable)

- The app must work fully offline, with three explicit, narrow exceptions: the AI assistant tab, the Mention/Embed/Bookmark link-paste options (which fetch a page title, description, or preview, or load a live preview — "Paste" as a plain URL requires no network and always works offline), and Link-sourced page cover images (paste an image URL, fetched once and then stored locally like any other attachment). Every other feature (notes, canvas, search, sync, collaboration, everything) makes zero network requests, ever. Do not add remote fonts, remote scripts, or CDN references anywhere in the frontend or backend outside these scoped exceptions.
- Tauri capabilities/permissions: grant only what is used. No shell access, no arbitrary process spawning, no HTTP plugin. Filesystem access must be scoped to the user-selected vault folder only — never allow a path that resolves outside it (guard against `../` traversal explicitly, don't just trust the OS).
- Content Security Policy in `tauri.conf.json` must be strict: no `unsafe-eval`, no remote origins.
- Disable devtools and any debug panel in the release build.
- The app renders user-authored markdown. Do not render raw HTML from note content unless it is sanitized (use DOMPurify or an equivalent allowlist-based sanitizer) — this is a real XSS vector if skipped.
- Pin dependency versions in `package.json` and `Cargo.toml` (no floating `^`/`*` ranges for anything security-relevant). Run `cargo audit` and `npm audit` before finishing and fix or document any findings.
- No `eval`, no `Function()` constructor, no `dangerouslySetInnerHTML` without sanitization, anywhere.
- No hardcoded IP addresses, hostnames, credentials, tokens, or any other environment-specific or sensitive value anywhere in source. Every network address the app ever talks to must come from discovery (mDNS, Tailscale peer list, the future 3DS pairing/broadcast scheme) or explicit user input at runtime, never a baked-in constant. The fixed port number (57420) is not sensitive and is fine to hardcode — it's a protocol convention, not an address or a secret.
- **This project is being released as public, open-source code, so the above extends to any identifying information at all** — not just IPs and credentials. No real names, no real IP addresses, no real server details, in code, comments, commit messages, example/test data, or default configuration, anywhere. Anyone should be able to clone this repo and run their own fully independent instance with zero dependency on, or trace of, whoever originally built it. Use clearly fake placeholder data in any example/test fixtures (`example.local`, `alice`/`bob`-style placeholder names, etc.), never real ones. Before any public release, do a final pass searching the whole codebase specifically for anything that could identify a real person or a real server — this is worth treating as a release checklist item, not an assumption that following the rule during development was automatically sufficient.

### Peer-to-peer specific

- Treat every byte received from a remote peer as untrusted input, full stop. A peer is another person's machine, not a server you control — this applies equally to LAN/tailnet auto-discovered peers and manually entered ones.
- Never auto-accept a connection. Every incoming connection attempt — including LAN mDNS and tailnet-discovered peers — surfaces a confirmation prompt naming the peer's address before any data is exchanged.
- Validate and size-limit every incoming CRDT update and awareness message before applying it. Reject malformed messages instead of panicking on them.
- Rate-limit incoming messages per peer to prevent a malicious or buggy remote from flooding the connection and freezing the UI.
- Being listed as a Tailscale peer does not imply trust — it only means Tailscale already authenticated that device onto the tailnet. Still require the connection-request confirmation and still validate all incoming data the same as for a manual/internet peer.
- Default listening port is UDP 57420 (see README.md for why), configurable in settings. Bind failure (port already in use) must show a clear "change port in settings" message, not crash.
- QUIC/TLS 1.3 encryption is on by default via `quinn` — do not disable it or add a plaintext fallback mode.
- Do not implement a relay/TURN-equivalent fallback in this build. If a direct connection can't be established, fail visibly with a clear message rather than silently routing through a third party.
- A dropped or malicious peer connection must never be able to corrupt the local copy of the note. Local disk state is only ever written from the local CRDT state after it's been merged, never written directly from raw incoming network bytes.

## Stability requirements (non-negotiable)

- Rust: no `.unwrap()` or `.expect()` in any code path that runs after startup. Use `Result` and handle errors — log them and surface a non-fatal message to the UI, never let a panic take down the app. Install a panic hook that logs to a file and shows a recoverable error state.
- Every file write is atomic: write to a temp file in the same directory, then rename over the target. Never truncate-and-write in place.
- Wrap the React app in error boundaries at the level of each major panel (sidebar, editor, canvas, graph view) so a crash in one panel shows an inline error in that panel only, not a blank white screen for the whole app.
- Autosave must be debounced (not on every keystroke to disk) but must never lose more than a few seconds of work if the app is killed.
- On startup, if the SQLite index is missing or fails to open, rebuild it from the markdown files rather than crashing or refusing to start.
- No unnecessary code comments. Write comments only where the code's intent genuinely isn't obvious from names and structure (a non-obvious workaround, a security-relevant decision, a tricky algorithm). Do not narrate what the code is doing line by line.
- Keep functions and modules small and single-purpose. Prefer simple, explicit code over clever abstractions — this codebase will be read and evaluated by a human afterward.

## Draw-over-text annotation layer

Don't build this the way Previous ScaleNote did: it stored overlay ink strokes in fixed pixel coordinates relative to the viewport (`viewport = {x:0, y:0, zoom:1}`, canvas resized via `ResizeObserver` on raw container pixels), meaning the ink was anchored to the screen, not to the text. The result was ink that stayed in the same screen position while the text reflowed underneath it on any window resize, font change, or different screen — almost certainly the root cause behind a long list of "pen tool" bugs in that project rather than a series of unrelated issues.

Instead:

- When a stroke is drawn, determine which block it was drawn over and store its points as fractional offsets relative to *that block's own bounding box* (x/y as 0–1 fractions of the block's width/height), with stroke thickness in units relative to that block's font size (e.g. `em`) rather than raw pixels.
- At render time, position each stroke relative to wherever its anchor block currently sits, at its current size. Because the coordinates are fractions of the block's own box, the stroke naturally moves when content above it shifts the block down, and scales when the block's width or font size changes — no separate logic is needed to "keep it aligned," alignment falls out of expressing the stroke in the block's own terms instead of the screen's.
- A stroke spanning multiple blocks anchors to whichever block it starts in — document this as a known scope limit rather than attempting to split ink across multiple anchors.
- Deleting a block deletes its anchored strokes with it. No orphaned ink left floating with nothing to anchor to.
- Store this layer as its own sidecar file (`Note Title.annotations.json`, per README.md's directory layout) — separate from the edgeless-canvas sidecar, since the coordinate semantics are genuinely different (block-anchored/fractional vs. freeform/absolute) and conflating them into one format invites exactly the kind of bug above.

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

## Canvas data model

Design the canvas layer as two flat collections, not a type hierarchy:

- **Strokes:** each stroke stores its path data, tool, color, thickness, opacity, z-index, and a precomputed bounding box (recompute it whenever the path changes, don't recalculate on every hit-test — this is what makes lasso-select and click-to-select fast on a canvas with hundreds of strokes).
- **Placed objects:** sticky notes, text boxes, images, shapes, and frames all share one common shape — position (x, y), size, rotation, z-index — with a type-specific data payload layered on top (e.g. a sticky note's payload is just `{ text, backgroundColor }`). Don't give each object kind its own top-level schema; one shared shape plus a loose payload avoids a combinatorial explosion of near-identical types as more object kinds get added.
- **Frames:** a frame is a placed object (`kind: "frame"`) that names a rectangular region of the canvas. This is what makes canvas-embed-in-a-note possible — see below.

## Image and embed resizing

Both image blocks and link-embed blocks share one resize implementation: 8 handles (top/bottom/left/right edges, plus 4 corners). Edge handles resize width or height independently; corner handles preserve aspect ratio by using whichever axis moved more (compare the horizontal and vertical drag distance, scale by the larger one, derive the other dimension from the aspect ratio — don't average the two or you get a mushy, unresponsive feel). Update the block's size attribute directly on every pointermove — no debounce, no intermediate state — for the same lag-free reason established for the block gutter drag elsewhere in this document. Clamp to a sensible minimum size (don't let a block get resized down to nothing) and support both mouse and touch input on the handles.

## Link paste: Mention / Paste / Embed / Bookmark

- **Paste** is the default/fallback and needs no network — just the raw URL as plain text. If a title fetch (Mention, Bookmark) or embed load fails for any reason (offline, blocked, timeout), fall back to this rather than leaving a broken block.
- **Mention** fetches only the target page's title (and favicon, if trivially available) — a small, bounded request, not a full page load. Cache the result on the block so re-opening the note doesn't re-fetch every time.
- **Bookmark** is the same idea as Mention but richer — title, a short description, and a preview image, shown as a card. Same caching rule: fetch once, store the result, don't re-fetch on every open.
- **Embed** loads the linked page in a sandboxed frame with no access to the Tauri IPC bridge, filesystem, or any app internals — treat embedded content as fully untrusted, same as any other third-party web content. Some sites block being framed entirely; when that happens, show a clear "can't embed this site — try Mention, Bookmark, or Paste instead" message rather than a broken or blank block.
- Embed blocks use the same resize-handle system as image blocks (see below) — one interaction pattern for both, not two.

## Additional block types: implementation notes

- **Table of contents:** derived entirely from the note's own heading blocks at render time — never stored separately, so it can't go stale. Clicking an entry scrolls to that heading.
- **Breadcrumb:** derived from the file's own path relative to the vault root — walk up the folder tree, read each ancestor folder's name (and icon, if the `.scalenote-folder.json` sidecar has one) for the trail. No separate breadcrumb data to maintain.
- **Copy link to block:** generate a stable per-block anchor ID (assigned once, on block creation, stored with the block) so a link can point at a specific block within a note, not just the note as a whole. Keep this ID stable across edits to the block's content — only regenerate if the block itself is deleted and recreated.
- **Synced block:** content lives in one place, referenced by ID from every location it's embedded. Store the canonical content once (in the note where it was originally created) and have every other instance hold just a reference — editing any instance updates the canonical copy, and every reference re-renders from it. Make it visually obvious when a block is a synced reference versus original content, so a user doesn't edit what they think is a local copy and get confused when it changes elsewhere too.
- **Mermaid diagrams:** render fully locally via a bundled diagramming library — this is text-to-diagram, not an image, so no network fetch is involved at any point.
- **Import from other note apps.** Model this on Obsidian's own official Importer plugin (a real, shipped, open-source implementation worth studying directly rather than guessing at the formats) — it's the concrete proof that everything below is achievable fully offline:
  - **Obsidian:** no parser needed — just point the vault picker at the folder. Detect a `.obsidian/` folder and show a one-time compatibility notice (wikilinks work as-is; callouts and Dataview-style queries don't translate automatically). Never read, write, or delete anything inside `.obsidian/`.
  - **Notion:** parse the ZIP the user exports themselves from Notion ("Export all workspace content," Markdown & CSV or HTML) — never a live Notion API/account connection. CSVs become ScaleNote database schemas; map Notion property types to ScaleNote's own where they match (Select→Select, Status→Status, Date→Date, and so on), and fall back to plain Text for anything that doesn't have a clean equivalent rather than dropping the data. This is the messiest of the four formats — Notion's nested block model doesn't map 1:1 to plain markdown — so don't try to silently guarantee perfect fidelity; report what didn't come across cleanly rather than pretending everything transferred.
  - **OneNote:** parse `.one`/`.onepkg` files directly — this is a real, proven-possible format to parse offline (Obsidian's importer does exactly this, no Microsoft account or API involved). Map ink drawings directly onto ScaleNote's own canvas stroke schema (see the Canvas data model section) rather than flattening them to a static image — this is a genuine, meaningful fidelity win over a naive "screenshot the page" import. Map formatting, lists, tables, tasks, tags, highlights, equations, images, attachments, and internal links onto their ScaleNote block equivalents.
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
- **Overly broad Tauri permissions.** Don't grant `shell:default`, `http:default`, or similar catch-all permissions "to be safe" — grant only the specific commands/APIs actually called, per the security rules above.
- **Unbounded trust of incoming network payloads.** Don't apply a raw incoming CRDT update straight to the document without a size check first — see the peer-to-peer security rules above.

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

## Database views

A database is a folder with a property schema attached — nothing more exotic than that. Extend the same `.scalenote-folder.json` sidecar used for Notebook/Folder/Section kind/icon/color with an optional `database` field holding the schema:

- Schema shape: an ordered list of properties, each with a name, a type (`text` | `number` | `checkbox` | `date` | `select` | `multi_select` | `status` | `url` | `email` | `phone` | `files` | `relation` | `rollup` | `formula` | `created_time` | `last_edited_time` | `created_by` | `last_edited_by` | `id` | `button`), and type-specific config (option lists for select-family types, a target-folder reference for `relation`, a source-relation-plus-aggregation-function for `rollup`, an expression string for `formula`, an action definition for `button`).
- Each note inside that folder stores its actual property *values* in its own YAML frontmatter, keyed by property name. A note missing a value for a schema property simply has no value for it (render as empty in the table), not an error.
- **`relation`** stores the target note's path (relative to the vault root, so it survives the vault being moved as a whole) in the source note's frontmatter. **`rollup`** is computed at render time by following a `relation` property and aggregating a chosen property across every related note (count, sum, average, min, max) — it's never stored, always recalculated, so it can't go stale.
- **`formula`** evaluates a small, sandboxed expression language over the row's other properties (arithmetic, string concatenation, basic date math, comparisons) — computed at render time like rollup, never stored. Keep the expression grammar small and well-documented rather than trying to match a spreadsheet's full formula language.
- **`created_time`/`last_edited_time`** read directly from the note file's filesystem metadata — no separate tracking needed. **`created_by`/`last_edited_by`** record which peer (by their P2P collaboration identity) last touched the note; on a note that's never been edited collaboratively, these just show the local device.
- **`id`** is a simple counter scoped to the folder, stored in the folder's `.scalenote-folder.json` alongside the schema (the next value to hand out) — assign once, on note creation, never reassign.
- **`button`** actions are limited to local, in-app operations (set a property to a value, create a new linked note) — there is no cloud automation layer to call out to, and this must never become a place arbitrary code executes.
- Adding/renaming/retyping/removing a property in the schema is a schema edit in the folder sidecar. When a property is removed, don't silently leave orphaned frontmatter keys on every note — either strip the key or leave it and stop rendering it (pick one, document the choice in PROGRESS.md, but don't do both inconsistently). Removing a `relation` property should not delete the target notes it pointed to, only the reference.
- The view types (Table, Kanban, Calendar, Gallery, List, Timeline, Charts, Form, Linked view) are pure renderers over the same schema + notes — no separate storage per view, no conversion step when switching. Kanban groups by any `select` or `status` property; Calendar and Timeline plot notes by `date` properties (Timeline additionally uses the end-date range); Charts aggregate over existing properties and compute at render time, same as Rollup; a Linked view is just a second view configuration (its own filter/sort/view-type choice) pointing at the same folder's schema, stored wherever the user placed that linked view rather than duplicating the folder's data.
- A **Form** view generates a simple input form from the schema (one field per property) and creates a new note in the folder on submission — this is the one place a "view" writes data rather than only reading it, so validate the same way normal property editing would (a malformed date or an out-of-range number shouldn't create a broken note).
- Status is deliberately its own type, not a flavor of Select — it has three fixed top-level groups (`todo` / `in_progress` / `complete`) with custom-named, custom-colored values nested under each. This is what a Kanban view defaults to grouping by when a folder has a Status property, since the three groups already form a sensible board without the user configuring anything.
- Option edits (add/rename/recolor/reorder a Select/Status/Multi-select option) happen inline from the cell — a dropdown listing current options with a "type a new name to create one" affordance, drag handles for reordering, and a small per-option menu for rename/recolor/delete. Deleting an option in use should clear it from any note's value rather than leaving a dangling reference to a deleted option.
- The side peek (opening a row without leaving the table) is just that note's file rendered in a side panel — reuse the normal note editor there, don't build a second parallel editing surface for "rows."
- Inline vs. full-page is a placement detail (is this database view embedded as a block within a note's content, or is it the entirety of a page), not a different underlying mechanism — same schema, same renderer, same notes either way.
- Do not build Person properties, Place properties, Map views, Dashboard/Feed views, or any cloud-synced database integration (GitHub/Asana/GitLab/Google Drive/Figma/Zendesk-style properties) — these either require an account/cloud system this app deliberately doesn't have, or a mapping/geocoding service with no offline story. If asked to reconsider scope later, that's a real conversation to have, but it isn't part of this build.

## Identity, profile, and friend nicknames

- Local username and password are app-level config (same location as other Settings values, portable-vs-installed aware per the rule above) — never transmitted anywhere except as the display name presented to a P2P peer during connection. The password, if set, is hashed locally and only ever checked locally; there is no server-side counterpart to check it against.
- Every device generates a persistent key pair on first run — this is its permanent identity, already required for P2P pairing/trust. The self-declared username is just a mutable label attached to that key, broadcast to peers on connection.
- A friend nickname is a local mapping of `{ peer_public_key: nickname }`, stored only on the device that set it, never sent to the peer or to anyone else. When rendering a peer's name anywhere in the UI, check for a local nickname keyed by their public key first, and fall back to their broadcast display name if none is set. Never let a nickname overwrite or transmit the peer's own self-declared username — the mapping is purely a local rendering override.

## Shared sync engine crate (build this now, even though the server binary comes later)

Structure the P2P/CRDT sync engine (mDNS/Tailscale/manual discovery, pairing, `quinn` transport, `yrs` document sync, awareness) as its own library crate in the Cargo workspace, separate from the Tauri-specific desktop application code (window management, Tauri commands, the UI bridge). The desktop app depends on this crate; it does not contain the sync logic itself. This isn't optional future-proofing — it's what makes the headless server-mode binary described in `server/` (Dockerfile, docker-compose.yml, SERVER.md) possible at all without reimplementing or forking the sync logic later. Get the crate boundary right now, before any server binary exists, rather than trying to extract it after the fact.

## Voice calls

- Audio is Opus-encoded and carried as an additional stream over the same `quinn` QUIC connection already used for CRDT sync between two peers — don't stand up a second transport or protocol (e.g. full WebRTC) for this; the hard part WebRTC solves (finding a reachable address) is already solved by this project's discovery/pairing.
- Call signaling (invite, ring, accept, decline, hang up) is a small message set sent over that same connection, or over a fresh connection attempt using the normal discovery/pairing path if the peer isn't already connected.
- An incoming call rings on every device currently online under the recipient's identity — see the account model below for what "under the recipient's identity" means. Accepting on any one of them answers the call; the others stop ringing.
- **Phase two — multi-device audio routing — is a genuinely new capability, not a copy of an existing app's behavior** (see README.md for why). Implementation sketch: once a call is active, the account's other currently-online devices can be offered as alternate mic/speaker endpoints. Reassigning the mic role to a different device means that device starts capturing and encoding audio, relaying it over the normal local device-to-device connection (LAN/tailnet reach between the person's own devices, same as multi-device sync) to whichever device is actually maintaining the call connection to the remote peer, which forwards it onward — and symmetrically for speaker reassignment on the receive side. This adds a relay hop and real latency whenever mic/speaker devices differ from the "call-hosting" device; don't try to hide that trade-off, surface it honestly if it becomes noticeable (e.g. a subtle indicator that audio is being relayed through another device). Build and thoroughly test single-device calling before attempting this.

## Multi-account home server

- A home server (see README.md and `server/`) can host more than one person's isolated account. Each account's data lives in its own directory/keyspace on the server's disk — never sharing storage or being readable across accounts, same isolation discipline as separate vaults.
- **Access request flow, modeled on Jellyseerr's request/approval pattern:** a new device pointed at the server's IP+port sends a request containing its identity's public key and self-declared display name — no username/password ever changes hands. The server's admin identity (whichever identity originally set the server up) receives a pending-request notification with Accept/Decline, structurally the same UI pattern as an incoming call. Accepted requests get their own isolated account space; declined ones get nothing, at no cost to the admin.
- **Allowlist:** admin can pre-approve a specific public key so future requests from it are silently accepted rather than prompted. **Blocklist:** admin can silently auto-decline all future requests from a specific public key, with no prompt shown at all — this, not just "always ask," is the actual spam mitigation, since declining costs nothing but repeated prompts from a persistent bad actor are still an annoyance worth being able to shut off entirely.
- **Account model:** an "account" is an identity (the same persistent key pair already used for pairing everywhere else in this spec) plus the set of devices currently authorized to act as that identity — on a home server, that's the set of devices that were accepted via the request flow above (or are the same device that set the server up). This is the same concept multi-device sync and voice call ringing both depend on — don't build three different notions of "which devices belong to this person."

## Multi-device sync (home server and cloud-folder fallback)

- **Home server is not a new sync system.** It's the existing `yrs` + `quinn` P2P engine, with one paired peer designated in Settings as "always try to reach this one," given a persistent manual IP+port slot (reusing the manual-entry mechanism already built for out-of-tailnet peers) instead of being discovered fresh each time. Don't build a second protocol for this.
- Once a home server (or any peer) has been explicitly accepted once, subsequent reconnects should not re-trigger the accept/reject confirmation prompt — track "peers I've already trusted" (by public key) separately from "peers currently requesting a connection," and only prompt for the latter.
- Retry/reconnect to a configured home server should be patient and unobtrusive — it's expected to be offline sometimes (Ron's example: off overnight). Attempt periodically in the background, sync immediately when reachable, and don't surface repeated connection-failure noise to the user for an expected, intermittent offline state.
- **Cloud-folder fallback (Nextcloud/MEGAsync/Google Drive/etc.) needs zero special integration** — it works purely because the vault is plain files and atomic writes are already required everywhere. The one thing worth adding: since this mode has no CRDT protection across devices, consider detecting the disagreement case — if a note's file on disk doesn't match what the app's own last-known state for that note was (changed outside the app, e.g. by a sync client pulling a different version), surface something like "this note may have changed elsewhere — review before continuing" rather than silently trusting whichever version happened to land on disk last. This is a real data-safety gap in this mode and deserves an honest signal to the user, not silence.

## Memory (chat with recall across conversations)

- No second heavy service dependency for this — don't pull in a separate vector-database service the way the reference system this was modeled on does. Embeddings are computed locally via Ollama's embedding models (e.g. `nomic-embed-text`) through the same already-scoped Ollama integration, and stored alongside the existing search index in `.scalenote/index.sqlite` — brute-force or lightweight cosine similarity over that is entirely sufficient at the scale a personal memory store actually reaches (hundreds to low thousands of entries), and it keeps this a single lightweight binary rather than a multi-container stack.
- Each extracted fact is a real note: a small `.md` file with frontmatter (`type`, `date`, `confidence`, and a reference to the source conversation) in a dedicated Memory folder in the vault. The SQLite-backed embedding index is a cache for fast semantic lookup, same as the search index elsewhere in this spec — the notes are the source of truth, the index is regenerable from them.
- **Extraction pipeline, in order:** after a conversation (not live, mid-turn), run it through the configured model asking it to identify durable facts worth remembering. If that fails or no model is reachable, fall back to a deterministic regex pass catching obvious patterns ("my name is X", clear preference statements) — this fallback exists specifically so memory doesn't just silently stop working when a model is temporarily unavailable, mirroring a real design choice in the reference system.
- **Periodic consolidation:** run a scheduled pass (daily is a reasonable default) that fingerprints/embeds existing memory notes to find near-duplicates and merges or removes them, and prunes entries that have aged out or scored as low-value. This is not optional polish — unbounded memory growth is a documented real-world failure mode in the reference system, worth designing around from the start rather than patching in later.
- **Retrieval at chat time:** embed the current conversation's recent context, query the local similarity index for the most relevant existing memory notes, and inject only those (a small number, not the whole store) into the prompt. Show the user which memories were actually recalled for a given response where feasible, rather than making retrieval invisible — this matters because memory is genuinely steering the model's behavior, and an unreasonable or wrong-sounding response is much easier to diagnose if the person can see what got recalled.
- **Security framing:** memory notes are persistent context that gets fed back into every future model call that retrieves them. Never let this feature be used to store secrets — no passwords, API keys, tokens, or credentials, ever, and don't build any flow that would make that seem like a reasonable thing to do (e.g. don't extract and store anything that looks like a credential, even if the conversation mentions one — flag and skip it instead).
- **Explicitly not a document store.** Don't let memory extraction try to ingest or retain whole documents/files — that's what Study Assistants (RAG) already does, and building document retention into fact-extraction memory produces exactly the "shredded into meaningless fragments" failure mode reported against the reference system. If a user pastes or references a large document in chat, that's a candidate for Study Assistants, not memory extraction.

## AI assistant scope (the one place network access is allowed)

The AI tab is the sole exception to the offline-only rule, and it stays narrow:

- No network call from this feature happens until the user actually opens the AI tab or acts on it. It isn't checking for updates or phoning anything on app startup.
- The only endpoints this feature ever talks to are: the local Ollama installation (if present, on its own localhost port — this is local, not "internet," but still worth naming explicitly), Ollama's actual cloud API (for cloud model access with a user-provided key), and HuggingFace's actual API (for browsing/downloading GGUF models). No other destinations, no analytics, no telemetry, no "phone home" of any kind bundled in alongside this feature.
- The API key, once entered, is stored locally (in the app-level config location — OS AppData or the portable-mode folder next to the exe, per the portable/installed rule above) and is never transmitted anywhere except in requests the user's own actions trigger.
- Hardware detection (CPU/RAM/GPU/VRAM) is a fully local read — via the `sysinfo` crate for CPU/RAM, and platform GPU APIs (DXGI on Windows) for VRAM — never sent anywhere except as an input to the local fit-scoring calculation.
- Before listing a HuggingFace model as downloadable, verify it actually has a usable GGUF quantization available. Presenting a model that turns out to have no GGUF source is a real, documented dead-end in a reference implementation of this same feature — check first, don't let the user hit it after picking one.
- Fit-scoring math (estimating a model's VRAM/RAM footprint from its parameter count and quantization level, then comparing against detected hardware) happens locally — this is a calculation, not a network call, and should work even if the catalog was fetched a while ago and cached.

## PROGRESS.md

Keep `PROGRESS.md` updated as you go, not just at the end. For every feature listed in README.md, mark it one of: `done`, `partial (note why)`, `disabled (note why)`. This file is the actual deliverable being evaluated alongside the app — be precise and honest in it. Don't mark something `done` if you haven't actually tried to break it. When something is partial or disabled, cite the specific reason concretely (what's missing, what broke) rather than a vague "needs more work."

## Definition of done for the session

- `npm run tauri build` succeeds and produces a working Windows installer
- The app opens, a vault can be created/opened, notes can be created/edited/saved/reopened without data loss
- Killing the app mid-edit does not corrupt any file
- No feature in the UI throws an unhandled exception when used normally or when used slightly wrong (empty input, huge input, special characters, rapid clicking)
- `PROGRESS.md` accurately reflects the state of every feature in README.md
