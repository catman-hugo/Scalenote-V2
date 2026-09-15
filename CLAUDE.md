# Agent instructions for building ScaleNote

You are building the app described in README.md. Read it first. This file is the operating contract — follow it exactly.

**Timeline: target a fully polished, non-crashing, good-looking core product by mid-January (roughly 4 months from the start of this project) — not everything in this spec, a deliberately chosen subset, sequenced below. The full scope in README.md is real and wanted, not aspirational filler, but it's sequenced to land across roughly a year, not compressed to hit the January date. If the January milestone slips due to model/compute quota limits or anything else, that's an acceptable, expected outcome — do not cut corners on quality or security to hit the date instead.**

## Document precedence and recording decisions

Three documents govern this build, and they will occasionally disagree. When they do:

- **`FORMAT.md` is authoritative for anything on disk** — markdown syntax, block IDs, frontmatter keys, sidecar shapes. If README.md or this file implies a different on-disk representation, FORMAT.md wins.
- **This file is authoritative for *how*** — architecture, sequencing, coding standards, security, stability. If README.md describes an implementation approach that conflicts with a rule here, the rule here wins.
- **README.md is authoritative for *what*** — which features exist, what they do, what's deliberately excluded. If this file is silent on whether something should exist, README.md decides.
- **On a substantive conflict — the documents disagree about behaviour, not about wording — do not pick.** Record it in `DECISIONS.md` and in PROGRESS.md's "Known issues" section, implement whichever option is smaller and easier to reverse, and keep going. Do not silently resolve a real disagreement between the specs in either direction; that's the single most expensive kind of drift, because it looks like progress.

### DECISIONS.md

Maintain a `DECISIONS.md` at the repo root as an append-only log of architectural decisions. **An entry is mandatory whenever any of these is true:**

- The specs don't determine the answer and the choice will be hard to reverse later (a data format, a schema, a crate boundary, a threading or ownership model).
- A new runtime dependency is added — including its license.
- A rule in this file is being followed in a way that isn't obvious, or an explicit `#[allow]`/exception is being taken.
- Two documents conflicted and you took the reversible option per the rule above.
- A feature is being implemented in a narrower form than README.md describes.

Entry format — short, dated, and honest:

```
## YYYY-MM-DD — <one-line decision>
**Context.** What forced a choice.
**Decision.** What you did.
**Alternatives considered.** What you didn't do, and why not.
**Cost / reversibility.** What this gives up, and what it would take to undo.
```

This log is reviewed alongside the code. An entry that says "chose X because it seemed best" is worth nothing; an entry that names the alternative and the cost is worth more than the diff it describes.

## Git workflow

- **Never commit or push directly to `main`.** All work happens on a feature branch, branched off an up-to-date `main`.
- Branch naming: `feature/<short-description>`, matching the milestone or feature it corresponds to in the roadmap below — e.g. `feature/vault-storage`, `feature/block-editor`, `feature/p2p-discovery`. One branch per reasonably-scoped piece of work, not one branch for an entire milestone if the milestone is large.
- Commit in small, frequent, clearly-described commits rather than one giant commit at the end of a branch's work — each commit should describe what changed and why when the reason isn't obvious from the diff alone.
- When a branch is ready — matches its feature's relevant section of PROGRESS.md, honestly — push it and open a pull request into `main`. Don't merge it yourself; that's a human review step.
- `main` only ever contains reviewed, stable code. If asked to fix something urgently, that still happens on a branch and through a PR, not as a direct push to `main`, even for a small fix.

## Roadmap

### Toward the January milestone — this subset needs to be genuinely done, not just started

**Milestone 1 — Foundation (~2 weeks).** Tauri + React + Vite scaffold. Vault folder selection, reading/writing plain markdown files, the sidebar file tree. Prove atomic writes work (kill the app mid-save, confirm no corruption). Set up the on-disk layout correctly from the start per README.md's directory example and `FORMAT.md` — note `id` frontmatter, canvas sidecars, visible attachments folder, `.scalenote/` reserved for regenerable caches and sync snapshots only, device secrets in app config rather than the vault. Portable-vs-installed detection. Structured logging (`tracing`, rotating file, frontend errors forwarded to it) — get this in early, not bolted on later, since everything after this point is easier to debug with it in place. Produce and actually run a Linux `.deb` at the end of this milestone: the dev machine is Linux, so this is the build that can be tested directly, and having a real installed artifact from week two is worth far more than discovering packaging problems in January.

**Milestone 2 — Core editing & organization (~5 weeks).** The document model comes first and is not optional groundwork: `yrs` backs every note from the first commit of this milestone, the sync-engine crate boundary exists from the first commit of this milestone (see "Shared sync engine crate"), and CRDT snapshots persist and reload per the "Document model" section. Retrofitting either after the editor exists is a rewrite, not a refactor — do not defer them to Milestone 6 on the grounds that no networking exists yet. Then: markdown source editor as a projection of that document with live preview, SQLite search index, full-text search, command palette, quick switcher, wikilinks, backlinks, tags. The full block-based rich editor (Tiptap) over the same document: slash command menu, every block type in README.md's expanded list, all serialized exactly as `FORMAT.md` specifies, link paste (Mention/Paste/Embed/Bookmark), code blocks (exact visual spec), the shared image/embed resize-handle system, hover previews on menus. Sidebar entity kinds (Notebook/Folder/Section/Page) with custom icons/colors/covers, sidebar customization.

Two things explicitly **not** in this milestone even though they appear in the block editor's UI surface: the `/canvas` embed block and the draw-over-text annotation layer, both of which depend on the canvas data model built in Milestone 4. Register their slash-command entries as visibly disabled with a "coming in the canvas milestone" tooltip rather than stubbing them.

**Import from other note apps (Obsidian/Notion/OneNote/Evernote) and local-file-format import (Markdown/Text, CSV, Word, PDF) are explicitly not in this milestone either** — they move to Milestone 9, after January. Four importers plus four file-format parsers, each requiring a real fixture and a recorded expected-output diff per the testing standard below, is its own substantial body of work; compressing it into this milestone alongside the document model and the full block editor is how features end up marked `done` without actually being hardened. The Settings → Import section itself doesn't need to exist until Milestone 9 either.

**Milestone 3 — Database views (~2 weeks).** Full property type set, all view types (Table/Kanban/Calendar/Gallery/List/Timeline/Charts/Form/Linked view), inline option editing, side peek. `created_by`/`last_edited_by` are built here and record the **local account identity**, which exists from first run — they do not wait on Milestone 6, which only changes who else can appear in them.

**Milestone 4 — Canvas & drawing (~2 weeks).** Edgeless canvas mode, the CRDT-backed canvas document (see "Canvas, annotation, and folder documents"), exact color swatches and background patterns, lasso-select (OneNote-style live hit-testing), block gutter drag/elongation, draw-over-text annotation layer (block-anchored via block IDs, not screen pixels), canvas embeds, split view, pen button mapping for stylus devices.

**Milestone 5 — Settings (~1 week).** General tab (theme, accent color, font size, editor width, sidebar width, default page mode, Connection section, Diagnostics section) only. **No AI tab in this milestone** — AI doesn't exist anywhere in the app, including in Settings, until Milestone 11 builds it, toggle included. Shortened from the original two-week estimate now that it no longer carries Ollama integration, hardware detection, or RAG.

**Milestone 6 — P2P collaboration core (~3 weeks).** Account/device identity and enrolment (see "Identity, devices, and pairing"), friend nicknames. LAN/Tailscale/manual discovery, pairing, `quinn` QUIC transport, wiring the already-existing CRDT documents to the already-existing sync crate, cursor/selection awareness, presence, reconnect handling. A single-account home server (the multi-account version is Milestone 8, after January). If Milestone 2 was done correctly, this milestone adds transport and trust — not a document model.

**Milestone 7 — Hardening and design pass (~2 weeks) — this is the January finish line.** Security audit (`cargo audit`/`npm audit`, Tauri capability review, the untrusted-peer-input checklist). Stability pass: deliberately try to break every feature, including two live instances editing simultaneously. Performance pass. And the design audit described below — this is a real acceptance gate for the milestone, not optional polish.

### After January — real, wanted, sequenced for the rest of the year

**Milestone 8 — Multi-account home server:** the Jellyseerr-style request/approval flow, allowlist/blocklist, per-account isolated storage.
**Milestone 9 — Import from other note apps:** Obsidian, Notion, OneNote, Evernote, and local-file-format import (Markdown/Text, CSV, Word, PDF), each tested against a real fixture with a recorded expected-output diff. The Settings → Import section is built here.
**Milestone 10 — Voice calls:** basic single-device calling first and thoroughly proven out, then the multi-device audio routing stretch capability.
**Milestone 11 — AI assistant:** the global, opt-in, context-aware surface described in "AI assistant: surface, context, and memory" below — the enable toggle and the full Settings → AI tab, local/cloud model selection and hardware fit-scoring, the context-permission model and vault-search tool, and memory built on the note document model. This is the same slot the original roadmap gave to "Memory" alone; the scope is now substantially larger and the whole feature lives here, not split between an earlier Settings milestone and a later Memory milestone.
**Milestone 12 — Multi-device sync refinements:** conflict surfacing for the cloud-folder mode beyond the baseline hash check, snapshot compaction, and any remaining cleanup of the sync-crate boundary.
**Milestone 13 — Companion 3DS client:** navigate/add/draw, bidirectional canvas-only sync.
**Milestone 14 — Additional platforms:** Android build and the headless server-mode binary matching the existing `server/` scaffold.
**Milestone 15 — Open-source release audit:** the no-identifying-information sweep described in the security section below, license file, public-facing documentation pass.

If work needs to pause or stop at any point, stop at the end of the current milestone, make sure everything up to that point is solid, and leave anything beyond it visibly disabled with a "not finished" state rather than partially built and broken.

## Document model: what is authoritative, and when

This is the most important architectural decision in the project. Read it before writing any editor or storage code.

### The block tree is the document; markdown is its serialization

Each note is a single `yrs` document whose content is a **`Y.XmlFragment` holding the block tree**, bound to Tiptap/ProseMirror. That structure — not a string of markdown — is what collaborative editing, block IDs, block drag/reorder, synced blocks, and annotation anchoring all operate on.

Markdown source mode is a **projection**, not a second document:

- Entering source mode serializes the current document to markdown exactly as it would be written to disk, per `FORMAT.md`.
- Editing there is permitted only when no remote peer is connected to this note. While a peer is connected, source mode is read-only with a visible, specific reason shown — not a greyed-out button with no explanation.
- Leaving source mode (or a debounce while in it) parses the text and applies the difference to the document as **one transaction**, not as a stream of character operations. A parse failure leaves the document untouched and reports the error inline with the offending line; it never partially applies.
- Do not attempt to bind a `Y.Text` of raw markdown as a second collaborative surface. One document, one canonical structure.

Because everything rests on this, the parse/serialize round-trip is a correctness requirement, not a nicety: `parse(serialize(doc)) == doc` and `serialize(parse(text)) == text` for any document ScaleNote itself produced. Write property tests for both directions in Milestone 2, covering every block type in `FORMAT.md`.

### Persisting CRDT state, and what beats what

A `yrs` document rebuilt from scratch out of markdown on every open has no shared history with anyone else's copy, which means offline edits on two devices cannot actually merge — they can only be reconciled as text. That would make the home-server sync mode no better than the cloud-folder fallback it's supposed to improve on. So state persists:

- On save, write the note's CRDT state to `.scalenote/crdt/<note-id>.bin`, keyed by the note's frontmatter `id` (a UUID, so renaming or moving the note doesn't orphan it). Write a compacted full-document update (`encode_state_as_update`), atomically, same temp-file-then-rename rule as any other write — not an append-only log.
- Alongside it, store the **hash of the markdown content this snapshot was last serialized from**.
- On open, compare that hash against the actual file on disk:
  - **Match:** load the snapshot. Full history, real merges.
  - **Mismatch:** the file changed outside ScaleNote — a text editor, a sync client, a script, a local AI agent with filesystem access (an explicitly supported scenario, see README.md). **The file on disk wins.** Discard the snapshot, build a fresh document from the file's current text, start a new snapshot, log it at `warn`, and tell the user the note changed outside the app. Never let in-memory state silently overwrite a file someone else wrote.
  - **Missing or corrupt snapshot:** same as mismatch. This is a normal, non-error path.
- This is also why a cloud sync client mangling `.scalenote/crdt/` is harmless rather than catastrophic: a conflicted or stale snapshot simply fails its hash check and gets rebuilt.

Two invariants that follow, and must hold everywhere:

1. **Content lives in the `.md` file. History lives in `.scalenote/`.** Deleting `.scalenote/` entirely must lose no content — only the ability to merge cleanly with a peer's divergent offline history until both sides re-baseline. Never store anything in `.scalenote/` that isn't reconstructible from vault files, accepting degraded merge quality as the only loss.
2. **Disk is written only from merged local CRDT state**, never directly from incoming network bytes (see the peer-to-peer security rules).

### Note identity

Every note gets `id: <UUIDv7>` in its frontmatter, assigned once at creation, never reassigned, never reused, preserved across rename/move/import. It keys the CRDT snapshot, the annotation sidecar, and anything that needs to survive a rename. If a note arrives without one (hand-created, imported, copied in from an Obsidian vault), assign one on first open and write it back. If two notes in a vault somehow carry the same `id`, the one with the older filesystem creation time keeps it and the other is reassigned, logged at `warn`.

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

- The app must work fully offline, with three explicit, narrow exceptions: the AI assistant (see "AI assistant: surface, context, and memory" — invisible and inert until explicitly enabled, and even then silent until acted on), the Mention/Embed/Bookmark link-paste options (which fetch a page title, description, or preview, or load a live preview — "Paste" as a plain URL requires no network and always works offline), and Link-sourced page cover images (paste an image URL, fetched once and then stored locally like any other attachment). Every other feature (notes, canvas, search, sync, collaboration, everything) makes zero network requests, ever. Do not add remote fonts, remote scripts, or CDN references anywhere in the frontend or backend outside these scoped exceptions.
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

- **The anchor is a block ID**, not a position or an index. Drawing a stroke over a block that has no ID yet mints one and writes it into the markdown file per `FORMAT.md` — lazily, on first need. Anchoring by index or by order is wrong and will silently relocate every stroke the first time a block is reordered, which is a supported gesture.
- Store a stroke's points as fractional offsets relative to *that block's own bounding box* (x/y as 0–1 fractions of the block's width/height), with stroke thickness in units relative to that block's font size (e.g. `em`) rather than raw pixels.
- At render time, position each stroke relative to wherever its anchor block currently sits, at its current size. Because the coordinates are fractions of the block's own box, the stroke moves when content above it shifts the block down, and scales when the block's width or font size changes — alignment falls out of expressing the stroke in the block's own terms instead of the screen's.
- **Known limitation, document it rather than chase it:** fractional coordinates track the block's *box*, not its *words*. If a paragraph reflows from two lines to five because its text was edited, ink at y=0.5 stays at the vertical midpoint of a now-taller box, which is over different words than it was. This is expected behaviour for this design, not a regression; underline-a-specific-word fidelity through arbitrary text edits is out of scope. Say so in the UI docs.
- A stroke spanning multiple blocks anchors to whichever block it starts in — also a documented scope limit, not something to solve by splitting ink across anchors.
- **Deleting a block deletes its anchored strokes with it — as a tombstone, not a hard delete.** Undoing the block deletion must restore its ink. Retain deleted strokes for at least the life of the undo stack; a plain Ctrl+Z that silently discards drawings is data loss.
- The annotation layer is a CRDT document of its own (see "Canvas, annotation, and folder documents" below), so a peer deleting a block removes the associated ink on both sides instead of leaving each device with a differently-orphaned sidecar.
- Serialize it to its own sidecar file (`Note Title.annotations.json`, per README.md's directory layout) — separate from the edgeless-canvas sidecar, since the coordinate semantics are genuinely different (block-anchored/fractional vs. freeform/absolute) and conflating them into one format invites exactly the kind of bug above.

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

## Canvas, annotation, and folder documents (all CRDT-backed)

Note text is not the only thing that syncs. The canvas layer, the annotation layer, and the folder sidecar are each their own `yrs` document with its own snapshot under `.scalenote/crdt/`, following exactly the same hash-checked, file-wins rules as note content above. This is what lets multi-device sync and the home server carry drawings, ink, and database schemas rather than leaving them to last-writer-wins, and it's what makes the 3DS client (Milestone 13) possible at all.

This is deliberately *not* the hard version of collaborative drawing. Design the canvas layer as two flat CRDT maps, not a type hierarchy and not an ordered sequence:

- **Strokes:** a `Y.Map` from stroke UUID to an **immutable** stroke record — path data, tool, color, thickness, opacity, z-index, and a precomputed bounding box (recompute it whenever the path changes, don't recalculate on every hit-test — this is what makes lasso-select and click-to-select fast on a canvas with hundreds of strokes). A stroke is never mutated in place: editing one means deleting the old key and inserting a new record. Concurrent drawing is then concurrent insertion at distinct keys, which merges correctly with no ordering question to resolve — that's the whole reason strokes are the easy case and text is the hard one.
- **Placed objects:** a `Y.Map` from object UUID to a record sharing one common shape — position (x, y), size, rotation, z-index — with a type-specific data payload layered on top (e.g. a sticky note's payload is just `{ text, backgroundColor }`). Don't give each object kind its own top-level schema; one shared shape plus a loose payload avoids a combinatorial explosion of near-identical types. Unlike strokes, placed objects are mutable (dragging a sticky note updates its position); store mutable fields as a nested `Y.Map` so two people moving different properties of the same object don't clobber each other.
- **Frames:** a frame is a placed object (`kind: "frame"`) that names a rectangular region of the canvas. This is what makes canvas-embed-in-a-note possible — see below.
- **Annotation strokes** live in the note's annotation document: a `Y.Map` from stroke UUID to `{ block_id, points[], thickness_em, tool, color }`. Same immutability rule as canvas strokes.
- **Folder sidecar** (`kind`, `icon`, `color`, and the optional `database` schema) is a `Y.Map`. The database property schema is an ordered list of property definitions; use a `Y.Array` so two people adding a column concurrently both keep their column.

**Undo must be scoped.** Use a `yrs` UndoManager keyed to the local client's origin, on both the note document and the canvas document, so Ctrl+Z undoes *your* last action and never silently reverts a collaborator's. A local undo stack over a shared document is a data-loss bug, not a convenience.

**The `id` database property needs a collision rule.** A folder-scoped "next number to hand out" counter is not safe under offline merging: two devices offline both take 7. Instead, store assigned IDs as part of the folder document (`note-uuid → integer`), allocate locally as `max(assigned) + 1`, and resolve collisions deterministically at merge time: of two notes holding the same number, the one whose note UUID sorts lower keeps it, the other is reassigned to the new max. Log reassignments. IDs are stable in the overwhelming majority of cases and never silently duplicate in the rest, which is the correct trade for a display-facing number.

## Image and embed resizing

Both image blocks and link-embed blocks share one resize implementation: 8 handles (top/bottom/left/right edges, plus 4 corners). Edge handles resize width or height independently; corner handles preserve aspect ratio by using whichever axis moved more (compare the horizontal and vertical drag distance, scale by the larger one, derive the other dimension from the aspect ratio — don't average the two or you get a mushy, unresponsive feel). Update the block's size attribute directly on every pointermove — no debounce, no intermediate state — for the same lag-free reason established for the block gutter drag elsewhere in this document. Clamp to a sensible minimum size (don't let a block get resized down to nothing) and support both mouse and touch input on the handles.

## Link paste: Mention / Paste / Embed / Bookmark

- **Paste** is the default/fallback and needs no network — just the raw URL as plain text. If a title fetch (Mention, Bookmark) or embed load fails for any reason (offline, blocked, timeout), fall back to this rather than leaving a broken block.
- **Mention** fetches only the target page's title (and favicon, if trivially available) — a small, bounded request, not a full page load. Cache the result on the block so re-opening the note doesn't re-fetch every time.
- **Bookmark** is the same idea as Mention but richer — title, a short description, and a preview image, shown as a card. Same caching rule: fetch once, store the result, don't re-fetch on every open.
- **Embed** loads the linked page in a sandboxed frame with no access to the Tauri IPC bridge, filesystem, or any app internals — treat embedded content as fully untrusted, same as any other third-party web content. Some sites block being framed entirely; when that happens, show a clear "can't embed this site — try Mention, Bookmark, or Paste instead" message rather than a broken or blank block.
- Embed blocks use the same resize-handle system as image blocks (see below) — one interaction pattern for both, not two.

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

- Schema shape: an ordered list of properties, each with a name, a stable property UUID (so renaming a property doesn't orphan every note's values), a type (`text` | `number` | `checkbox` | `date` | `select` | `multi_select` | `status` | `url` | `email` | `phone` | `files` | `relation` | `rollup` | `formula` | `created_time` | `last_edited_time` | `created_by` | `last_edited_by` | `id` | `button`), and type-specific config (option lists for select-family types, a target-folder reference for `relation`, a source-relation-plus-aggregation-function for `rollup`, an expression string for `formula`, an action definition for `button`). The schema lives in the folder's CRDT document and serializes to the `database` field of `.scalenote-folder.json`; use a `Y.Array` of property definitions so two people adding a column concurrently both keep theirs.
- Each note inside that folder stores its actual property *values* in its own YAML frontmatter, keyed by property name. A note missing a value for a schema property simply has no value for it (render as empty in the table), not an error.
- **`relation`** stores the target note's path (relative to the vault root, so it survives the vault being moved as a whole) in the source note's frontmatter. **`rollup`** is computed at render time by following a `relation` property and aggregating a chosen property across every related note (count, sum, average, min, max) — it's never stored, always recalculated, so it can't go stale.
- **`formula`** evaluates a small, sandboxed expression language over the row's other properties (arithmetic, string concatenation, basic date math, comparisons) — computed at render time like rollup, never stored. Keep the expression grammar small and well-documented rather than trying to match a spreadsheet's full formula language.
- **`created_time`/`last_edited_time`** read directly from the note file's filesystem metadata — no separate tracking needed. **`created_by`/`last_edited_by`** record which peer (by their P2P collaboration identity) last touched the note; on a note that's never been edited collaboratively, these just show the local device.
- **`id`** is a display-facing integer scoped to the folder, allocated on note creation and never deliberately reassigned. It cannot be a simple "next value" counter — two devices editing offline would both take the same number. Store assigned values in the folder document as `note-uuid → integer`, allocate as `max(assigned) + 1`, and resolve merge collisions deterministically: of two notes holding the same value, the one whose note UUID sorts lower keeps it and the other is reassigned to the new maximum, logged at `info`. Never surface a duplicate.
- **`button`** actions are limited to local, in-app operations (set a property to a value, create a new linked note) — there is no cloud automation layer to call out to, and this must never become a place arbitrary code executes.
- Adding/renaming/retyping/removing a property in the schema is a schema edit in the folder sidecar. When a property is removed, don't silently leave orphaned frontmatter keys on every note — either strip the key or leave it and stop rendering it (pick one, document the choice in PROGRESS.md, but don't do both inconsistently). Removing a `relation` property should not delete the target notes it pointed to, only the reference.
- The view types (Table, Kanban, Calendar, Gallery, List, Timeline, Charts, Form, Linked view) are pure renderers over the same schema + notes — no separate storage per view, no conversion step when switching. Kanban groups by any `select` or `status` property; Calendar and Timeline plot notes by `date` properties (Timeline additionally uses the end-date range); Charts aggregate over existing properties and compute at render time, same as Rollup; a Linked view is just a second view configuration (its own filter/sort/view-type choice) pointing at the same folder's schema, stored wherever the user placed that linked view rather than duplicating the folder's data.
- A **Form** view generates a simple input form from the schema (one field per property) and creates a new note in the folder on submission — this is the one place a "view" writes data rather than only reading it, so validate the same way normal property editing would (a malformed date or an out-of-range number shouldn't create a broken note).
- Status is deliberately its own type, not a flavor of Select — it has three fixed top-level groups (`todo` / `in_progress` / `complete`) with custom-named, custom-colored values nested under each. This is what a Kanban view defaults to grouping by when a folder has a Status property, since the three groups already form a sensible board without the user configuring anything.
- Option edits (add/rename/recolor/reorder a Select/Status/Multi-select option) happen inline from the cell — a dropdown listing current options with a "type a new name to create one" affordance, drag handles for reordering, and a small per-option menu for rename/recolor/delete. Deleting an option in use should clear it from any note's value rather than leaving a dangling reference to a deleted option.
- The side peek (opening a row without leaving the table) is just that note's file rendered in a side panel — reuse the normal note editor there, don't build a second parallel editing surface for "rows."
- Inline vs. full-page is a placement detail (is this database view embedded as a block within a note's content, or is it the entirety of a page), not a different underlying mechanism — same schema, same renderer, same notes either way.
- Do not build Person properties, Place properties, Map views, Dashboard/Feed views, or any cloud-synced database integration (GitHub/Asana/GitLab/Google Drive/Figma/Zendesk-style properties) — these either require an account/cloud system this app deliberately doesn't have, or a mapping/geocoding service with no offline story. If asked to reconsider scope later, that's a real conversation to have, but it isn't part of this build.

## Identity, devices, and pairing

Three features — multi-device sync, ringing an incoming call on all of a person's devices, and per-account isolation on a home server — all depend on knowing which devices belong to the same person. There is exactly one mechanism for that, defined here. Do not build a second notion of it anywhere.

### Keys

- **Account key pair** (Ed25519), generated on first run of the first install. This *is* the person's identity. Peers trust account keys; nothing else.
- **Device key pair** (Ed25519), generated on first run of every install, unique to that machine.
- **Device certificate:** `{ device_pubkey, account_pubkey, device_label, issued_at }`, signed by the account key. A device presents its certificate plus proof of possession of its device key; a peer verifies the signature chains to an account key it already trusts.
- Both private keys and the certificate live in the **app-level config location** (portable-vs-installed aware), never in the vault. The vault gets synced, shared, and backed up; secrets must not travel with it.

### Enrolling your own second device

1. On an already-enrolled device, Settings → Connection → "Add a device" shows a short code and begins listening on the LAN/tailnet.
2. The new device enters the code, the two connect over the normal QUIC transport, and the code authenticates the channel (treat it as a short-lived pre-shared secret; rate-limit attempts, expire it in minutes, and never reuse one).
3. The enrolling device signs a certificate for the new device's key and transmits it **along with a copy of the account private key**, so the new device is a full peer.
4. Both devices record the new device in a device list within the account.

**Any enrolled device can enrol another.** The alternative — only the founding device may enrol — means a lost laptop permanently prevents adding a phone, with no server to recover from, and that is a worse failure than the one it prevents. The cost of this choice is real and must be stated in the UI: the account key exists on every enrolled device, so a stolen unlocked device is a compromise of the identity, not just of that machine.

**Revocation:** any enrolled device can revoke another, producing a revocation record signed by the account key. Revocations propagate to peers as they reconnect. Be honest about the limit — with no central authority, revocation is best-effort and eventually-consistent; a peer that never reconnects never learns. Say this in the UI rather than implying a guarantee.

### Trust and naming

- **Trust attaches to account keys.** Accepting a connection request once means accepting that person, including from devices of theirs you've never seen. Do not prompt per-device; that's noise that trains people to click Accept without reading.
- The self-declared username is a mutable label attached to the account key, broadcast to peers on connection, never verified by anyone.
- A friend nickname is a local mapping of `{ account_pubkey: nickname }`, stored only on the device that set it, never sent to the peer or to anyone else. When rendering a peer's name anywhere in the UI, check for a local nickname keyed by their account key first, and fall back to their broadcast display name if none is set. Never let a nickname overwrite or transmit the peer's own self-declared username — the mapping is purely a local rendering override. Because it keys on the account rather than a device, your nickname for someone follows them to their new machine, which is the behaviour README.md promises.
- The local password app-lock is unrelated to any of the above: hashed locally, checked locally, gates opening the app on one device. It is not encryption and the vault remains readable on disk; the Settings UI must say so plainly rather than implying protection it doesn't provide.

## Shared sync engine crate (Milestone 2, not later)

Structure the CRDT and sync engine as its own library crate in the Cargo workspace from the first commit of Milestone 2 — before any networking exists. The temptation is to defer it until Milestone 6, when there's something to send over a wire; resist it, because by then the document model will have grown Tauri-shaped dependencies that are painful to unpick.

**In the crate:** document types and their `yrs` schemas (note, canvas, annotation, folder), markdown parse/serialize per `FORMAT.md`, snapshot persistence and the hash check, discovery (mDNS/Tailscale/manual), pairing and the identity/certificate model, `quinn` transport, awareness, and the validation/rate-limiting of incoming messages.

**Not in the crate:** anything Tauri — window management, commands, dialogs, the UI bridge — and anything React. The crate must compile and its tests must pass without Tauri as a dependency; that's the mechanical check that the boundary is real, and it's what makes the headless server binary in `server/` possible later without forking the sync logic. Add that check to CI in Milestone 2 so the boundary can't rot quietly.

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

## AI assistant: surface, context, and memory

This is the one feature in the app that is opt-in rather than opt-out, and the one place network access to a third party is ever allowed. Both properties are non-negotiable and both are cross-cutting — they constrain code outside this section too, not just the AI code itself.

### Invisibility is a build requirement, not a visual one

Before the master toggle in Settings → AI is on, there must be **zero** AI-related elements anywhere in the rendered app — not hidden via CSS, not disabled, not present-but-unstyled. The command doesn't exist in the command palette's registered list. The keyboard shortcut listener doesn't register. The sidebar's "Add section" picker doesn't offer the AI panel. The component doesn't mount. Implement the gate at the point where these things are registered, not at the point where they're rendered — a `display: none` on an always-mounted component fails this requirement even though it looks identical to a user.

Write a test for this directly: render the full app tree with AI disabled and assert no AI-tagged DOM node exists anywhere, not "assert the AI panel is not visible." This is exactly the kind of requirement that's easy to satisfy shallowly, so make it mechanically checkable rather than trusting a visual pass.

### The surface

One dockable panel, opened by a configurable keyboard shortcut once AI is enabled, and offerable through the customizable sidebar's "Add section" picker. It is not wired into the editor toolbar, the database view header, or the canvas separately — those are three different places a stray affordance could leak from, and three different places context-assembly logic would have to be duplicated. The panel reads "what's currently active" from wherever the user actually is; it does not need per-view integration points to do that.

### Context assembly

On open, the panel inspects the active view and populates removable chips:

- An open note → its rendered block-tree content (not the raw markdown; the block tree, so context reflects what's actually on screen including collapsed-toggle state where relevant).
- An open database view → its schema and the currently visible/filtered rows, serialized compactly (respect a row cap; a 2,000-row table view does not belong in a prompt wholesale — summarize and let the vault-search tool fetch specifics on request instead).
- An open canvas → the text-bearing placed objects (sticky notes, text boxes) present in view. Freehand ink strokes are not interpreted or described — there's no vision step here, and pretending otherwise would be worse than not including canvas context at all.

These chips can be removed before sending. Nothing beyond the active view is included without one of two explicit actions:

- **Attaching a file or another note** to the conversation — extracted via the same local parsers the importers use (PDF text extraction, `.docx`, plain text), never a network fetch.
- **Vault search**, gated by its own permission toggle in Settings → AI, default off. When granted, the assistant may issue queries against the existing SQLite full-text index during a conversation; show the user what was retrieved, the same transparency rule memory retrieval already follows below. This is the mechanism that replaces the old standalone "Study Assistants (RAG)" feature — an uploaded textbook is just an attachment, and answering from it is just this tool finding it.

**Boundary, unconditional:** never read `.scalenote/` internals, identity keys, device certificates, or pairing secrets, and never resolve a path outside the vault root — the same Tauri filesystem scoping that governs every other feature applies here with no special case.

### Memory

Extracted facts are real notes in a dedicated `Memory/` vault folder — small `.md` files with frontmatter for `type`, `date`, `confidence`, and a reference to the source conversation. Because these are ordinary notes, they get the same `yrs` document model, the same CRDT snapshot, and the same sync behavior as everything else in the vault, for free — nothing extra needs to be built for memory to sync via P2P collaboration, a home server, or the cloud-folder fallback.

- **A conversation is never itself persisted as a note.** Only extraction output is. Extraction runs in the background after the panel closes or the session goes idle — never live, mid-turn — asking the configured model to identify durable facts worth remembering.
- **A deterministic regex fallback** ("my name is X," a clearly stated preference) runs when no model is reachable or the model-based pass fails, so memory doesn't silently stop working.
- **A separate setting decouples extraction's model from the conversation's model** — a user chatting on a cloud model can still keep extraction (and therefore that conversation's summary) on a local model. Default: extraction uses whichever model is configured for chat, and the Settings → AI tab states this plainly next to the toggle that changes it.
- **Periodic consolidation** (daily is a reasonable default) fingerprints/embeds existing memory notes, merges near-duplicates, and prunes low-value or aged-out entries — required, not optional, because unbounded memory growth is the documented failure mode this design is built against. Enforce a soft size cap on `Memory/` that forces an out-of-cycle consolidation pass if exceeded, rather than relying on the schedule alone.
- **`Memory/` is excluded from full-text search results and the graph view by default.** It remains a real, syncing, user-editable folder — the exclusion is about not cluttering two surfaces that weren't designed with a hundred small fact-notes in mind, not about hiding the folder itself. A setting toggles inclusion back on.
- **Retrieval is relevance-scoped and shown, never a full dump.** Embed the current conversation's recent context, query the local similarity index, inject only the small number of genuinely relevant notes, and show the user which ones were recalled for a given response — this matters because memory steers behavior, and a wrong-sounding response is much easier to diagnose when what got recalled is visible.
- **Never stores secrets.** No passwords, API keys, tokens, or credentials — flag and skip anything that looks like one during extraction, even if the conversation explicitly states it and even if the user asks for it to be remembered.

### Local and cloud models

Settings → AI is the only place any of this is configured: the master enable toggle, provider selection (local Ollama, Ollama Cloud, or both with a per-conversation choice), the model catalog (Recommended / Browse Ollama / Browse HuggingFace / Ollama Cloud / Installed — unchanged from the original design: fit-scoring against actually detected hardware, plain-language small-model/no-image/slow-on-CPU warnings on every listing, HuggingFace GGUF availability verified before a model is offered as downloadable), the context permissions described above, the memory controls described above, and a free-text system prompt prepended to every assembled context.

- **No network call happens until the user acts.** Not on enabling the toggle, not on opening the panel — only on sending a message with a cloud-backed model selected, or on a background extraction pass that is itself configured to use a cloud model.
- **The only network destinations, ever, for this feature:** the local Ollama installation (localhost, not "internet," but named explicitly since it's still a process boundary), Ollama's actual cloud API, and HuggingFace's actual API for browsing/downloading GGUF models. No analytics, no telemetry, nothing else.
- **State plainly, in the Settings UI itself, what a cloud request contains:** the message, every context chip currently attached, and any vault-search results pulled in during that turn. This is not a footnote — put it next to the provider selector, not buried in a help page.
- Hardware detection (CPU/RAM/GPU/VRAM) is a fully local read (`sysinfo`, platform GPU APIs) and is never transmitted anywhere except as input to the local fit-scoring calculation. The API key, once entered, is stored in the app-level config location and is never transmitted except in requests the user's own actions trigger.

### One surface, not several

No "Ask AI" affordance is embedded in block context menus, no AI-generated block types, no second AI entry point anywhere else in the app. Everything above — chat, context, memory, model selection — goes through the one panel gated by the one toggle. If a future request asks for AI somewhere else in the UI, that is a request to add a second surface and should be treated as a real scope decision (a `DECISIONS.md` entry, at minimum), not an incremental addition.

## PROGRESS.md

Keep `PROGRESS.md` updated as you go, not just at the end. For every feature listed in README.md, mark it one of: `done`, `partial (note why)`, `disabled (note why)`. This file is the actual deliverable being evaluated alongside the app — be precise and honest in it. Don't mark something `done` if you haven't actually tried to break it. When something is partial or disabled, cite the specific reason concretely (what's missing, what broke) rather than a vague "needs more work."

## Definition of done, per milestone

Apply this at the end of each milestone in the Roadmap above, not only once at the very end of the project:

- The relevant build for that milestone succeeds and actually runs: the Linux `.deb` from Milestone 1 onward (built and tested on the dev machine), the Windows installer once Milestone 7's hardening pass covers it (verified on a VM/second machine, not just "it compiled").
- The app opens, a vault can be created/opened, notes can be created/edited/saved/reopened without data loss.
- Killing the app mid-edit does not corrupt any file.
- No feature added in that milestone throws an unhandled exception when used normally or when used slightly wrong (empty input, huge input, special characters, rapid clicking).
- `PROGRESS.md` accurately reflects the state of every feature touched in that milestone.
