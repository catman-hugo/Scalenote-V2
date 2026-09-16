# Progress

Status legend: `done` — implemented and tried-to-break tested · `partial` — implemented but has known gaps (explain) · `disabled` — not finished, visibly turned off in the UI (explain) · `not started`

Update this continuously while working, not just at the end. Each section below is tagged with the milestone it belongs to, per CLAUDE.md's roadmap — sections tagged Milestone 1 through 7 are the January target; everything tagged "after January" is real, wanted, and already fully speced, just sequenced later. Don't read this whole document as one flat list that all needs to be `done` at once.

## Core (Milestone 1–2)
- [ ] Document model: every note backed by a `yrs` `Y.XmlFragment` block tree from the first commit of M2 (not retrofitted later) — status: partial (yrs Y.XmlFragment integration and snapshot persistence verified with automated integration test)
- [x] CRDT snapshots persist to `.scalenote/crdt/<note-id>.bin` and reload across restarts — status: done
- [x] Snapshot carries a markdown content hash; on mismatch the file on disk wins, snapshot is rebuilt, user is told — status: done
- [x] Note `id` UUID in frontmatter: assigned on creation, survives rename/move, never reused — status: done
- [ ] Markdown source mode is a projection: lossless round-trip both directions, read-only while a peer is connected — status:
- [ ] `FORMAT.md` round-trip and idempotence property tests pass over every block type — status:
- [x] Sync engine as its own library crate, established in M2 before any networking exists; crate compiles and tests pass with no Tauri dependency (checked in CI) — status: done
- [ ] Canvas, annotation, and folder sidecars are each their own CRDT document with their own snapshot — status:
- [ ] Sidecars keyed by note `id`, not filename, so rename touches filenames only — status:
- [x] Vault create/open — status: done
- [x] On-disk layout matches README's directory example (canvas sidecars visible, attachments visible, `.scalenote/` cache-only) — status: done
- [x] Sidebar file tree (create/rename/move/delete) — status: done
- [x] Autosave + atomic writes — status: done
- [x] Front‑end scaffolding (React + Vite + Tauri integration) — status: done
- [ ] SQLite index build/rebuild — status:
- [ ] Full-text search — status:
- [ ] Command palette — status:
- [ ] Quick switcher — status:
- [ ] Wikilinks + autocomplete — status:
- [ ] Backlinks panel — status:
- [ ] Tags + tag browser — status:
- [x] Dark/light theme — status: done

## Block editor (Milestone 2)
- [ ] Block editor core (Tiptap, `yrs`-backed) — status:
- [ ] Slash command menu — status:
- [ ] Hover block gutter (drag handle + per-block menu) — status:
- [ ] Gutter elongates to span multi-block selection on hover — status:
- [ ] Whole-block highlight while dragging (not text-only) — status:
- [ ] Drag ghost tracks pointer with no lag (direct DOM transform, not state-driven) — status:
- [ ] Left/right drop on a block creates a side-by-side column — status:
- [ ] `/canvas` slash entry present but visibly disabled with a reason during M2, not stubbed (canvas embed itself is Milestone 4 — see Canvas / drawing) — status:
- [ ] Headings, lists, todo, toggle, quote, code, callout, divider, table, image — status:
- [ ] Code block: single flat gray color, no two-tone header bar — status:
- [ ] Code block: language label top-right, auto-detected — status:
- [ ] Code block: right-click to override detected language, override sticks — status:
- [ ] Code block: download button writes exact content with correct file extension — status:
- [ ] Hover preview panel: one shared component, works consistently across slash menu / turn-into / add-property / add-view menus — status:
- [ ] Link paste menu: Mention / Paste / Embed / Bookmark — status:
- [ ] Bookmark fetches and caches title/description/preview image, falls back to plain link on failure — status:
- [ ] Heading levels 1-4, Page block, Table of contents, block/inline equations — status:
- [ ] Page-level Button (local actions only), Breadcrumb, Tabs, Synced block, toggle headings — status:
- [ ] Explicit 2-5 column blocks via slash command — status:
- [ ] Inline emoji, inline date/reminder mention — status:
- [ ] General file attachment block, Mermaid diagrams — status:
- [ ] Block-level actions: copy link to block, duplicate, move to — status:
- [ ] Confirmed NOT built: per-block Ask AI/AI-generated blocks, third-party embed integrations, cloud import sources, mention-a-person, block-level text/background color — status:
- [ ] Mention fetches and caches page title, falls back to plain link on failure — status:
- [ ] Embed loads in a sandboxed frame with no Tauri/filesystem access — status:
- [ ] Embed shows a clear message when a site blocks framing, instead of a broken block — status:
- [ ] Image and embed blocks share one 8-handle resize implementation, lag-free — status:

## Canvas / drawing (Milestone 4)
- [ ] Edgeless canvas mode toggle — status:
- [ ] Split view (editor + canvas side-by-side, resizable) — status:
- [ ] Freehand pen tool — status:
- [ ] Pen/highlighter color picker: 3×5 swatch grid (exact Previous ScaleNote hex values), custom picker box below spanning 3 swatch-widths with matching spacing, no recent-colors row — status:
- [ ] Shapes, sticky notes, text boxes, image placement — status:
- [ ] Lasso-select with group move/resize handles — status:
- [ ] Lasso selection updates live while drawing, not just on release — status:
- [ ] Infinite pan/zoom — status:
- [ ] Canvas background pattern (Blank/Dots/Lines) matches exact spec: colors, spacing, red margin line — status:
- [ ] Canvas undo/redo — status:
- [ ] Canvas strokes are immutable records in a `Y.Map` keyed by UUID; editing replaces rather than mutates — status:
- [ ] Placed objects' mutable fields are nested maps, so concurrent moves of different properties don't clobber — status:
- [ ] Canvas undo/redo uses an origin-scoped `yrs` UndoManager — local undo never reverts a peer's action — status:
- [ ] Canvas embed (`/canvas`, live read-only view into a frame) — status:
- [ ] Draw-over-text annotation mode (pen toggle) — status:
- [ ] Annotation strokes anchored to a block ID (minted lazily per `FORMAT.md` §3), stored as fractions of that block's box — status:
- [ ] Annotations survive a window resize / different aspect ratio without misaligning (actually tested at two different sizes) — status:
- [ ] Block reorder does not relocate anchored ink (anchoring is by ID, not index) — status:
- [ ] Deleting a block tombstones its ink; undoing the delete restores it — status:
- [ ] Peer deleting a block removes the ink on both sides, no divergent sidecars — status:
- [ ] Pen button mapping (eraser/barrel button) — status:
- [ ] Import: OneNote ink drawings mapped to real canvas strokes, not flattened images — status:

## Organization, database views, icons & covers (Milestone 2–3)
- [ ] Nested pages — status:
- [ ] Spaces sidebar — status:
- [ ] Customizable sidebar: drag-to-reorder sections, Add section picker, Done to exit — status:
- [ ] Favorites section (star/pin notes) — status:
- [ ] Upcoming section (computed from reminders, not separately maintained) — status:
- [ ] Pinned database view section — status:
- [ ] Confirmed NOT built: Chats, Agents, Developer sidebar sections — status:
- [ ] Database schema stored in folder sidecar, values in note frontmatter (not a separate data structure) — status:
- [ ] Property types: text, number, checkbox, date, select, multi-select, status — status:
- [ ] Property types: url, email, phone, files & media — status:
- [ ] Relation property (links to a note in another folder, stored by path) — status:
- [ ] Rollup property (computed at render time from a Relation, never stored) — status:
- [ ] Formula property (sandboxed expression, computed at render time) — status:
- [ ] Created time / Last edited time (from filesystem metadata) — status:
- [ ] Created by / Last edited by (records the local account identity, which exists from first run; peer identities simply appear here once M6 lands) — status:
- [ ] ID property: allocated as max+1 from the folder document, merge collisions resolved deterministically by note UUID, never surfaces a duplicate — status:
- [ ] Button property (local actions only — set property / create linked note, no arbitrary code execution) — status:
- [ ] Confirmed NOT built: Person, Place, Map view, Dashboard/Feed views, cloud-synced database integrations — status:
- [ ] Status property's three fixed groups (to-do/in progress/complete) with custom values nested under each — status:
- [ ] Date property: end date, format, time, reminder — status:
- [ ] Table view — status:
- [ ] Kanban board view (defaults to grouping by Status when present) — status:
- [ ] Calendar view (month grid, notes plotted by a date property) — status:
- [ ] Gallery view (card grid) — status:
- [ ] List view (compact single-column) — status:
- [ ] Timeline view (Gantt-style, date range) — status:
- [ ] Chart views: bar, line, donut, number (computed locally, no data leaves the device) — status:
- [ ] Form view (creates a validated new note on submission) — status:
- [ ] Linked view (independent filter/sort over the same folder's data) — status:
- [ ] Inline vs. full-page database placement — status:
- [ ] Inline option editing: create/rename/recolor/reorder/delete, from the cell, no separate modal — status:
- [ ] Side peek opens a row as its real note file in a side panel, not a separate row-editing surface — status:
- [ ] Adding/removing a schema property updates note frontmatter consistently across the folder — status:
- [ ] Four sidebar entity kinds creatable from one "New" menu (Notebook/Folder/Section/Page) — status:
- [ ] Section renders with colored accent bar, not a folder icon — status:
- [ ] Custom color available on every entity kind (real color picker, not fixed swatches) — status:
- [ ] Custom icon on every entity kind: emoji or recolorable built-in glyph — status:
- [ ] Custom icon: upload a full image, light/dark preview swatches before committing — status:
- [ ] Custom icon: optional local icon library for reuse — status:
- [ ] Emoji picker shuffle/random button — status:
- [ ] Page cover images: Gallery (colors/gradients/textures, no file), Upload, Link (narrow network exception) — status:
- [ ] Page cover images: Change, Reposition, Download controls — status:
- [ ] Hover-reveal "Add icon" / "Add cover" row on pages with neither set, gone once either is set — status:
- [ ] Confirmed NOT built: Unsplash/stock-photo integration — status:

## Identity & profile (Milestone 6)
- [ ] Account key pair generated on first run of the first install — status:
- [ ] Device key pair per install; device certificate signed by the account key — status:
- [ ] Device enrolment: short-code channel, rate-limited and expiring, account key transferred to the new device — status:
- [ ] Any enrolled device can enrol another; UI states the compromise trade-off plainly — status:
- [ ] Revocation record signed by the account key, propagates on reconnect; UI states it is best-effort — status:
- [ ] Trust and friend nicknames key on the account public key, so they follow a person to a new device — status:
- [ ] Nickname correctly follows a renamed peer, and a peer on a machine you've never seen — status:
- [ ] Local username (optional, self-declared, never verified by a server) — status:
- [ ] Local password app-lock (optional, hashed locally, no server counterpart; UI states plainly this is not encryption) — status:

## Real-time collaboration (peer-to-peer) (Milestone 6)
- [ ] Note content model backed by `yrs` CRDT — status: built in Milestone 2, see Core
- [ ] Shared section (P2P collaboration history, not cloud sharing) — status:
- [ ] mDNS LAN auto-discovery — status:
- [ ] Tailscale tailnet peer discovery (via local Tailscale client) — status:
- [ ] Manual IPv4 entry and connection — status:
- [ ] Connection-request confirmation prompt (never auto-accept) — status:
- [ ] Direct QUIC connection between two peers (default port UDP 57420) — status:
- [ ] Live CRDT text/block sync between connected peers — status:
- [ ] Live cursor/selection awareness (labeled, real-time) — status:
- [ ] Presence indicator (who's connected) — status:
- [ ] Reconnect after a dropped connection re-syncs cleanly — status:
- [ ] Already-trusted peers skip the accept/reject prompt on reconnect — status:

## Import from other note apps (Milestone 9 — after January)
- [ ] Import: Obsidian vault detection, `.obsidian/` folder never touched, compatibility notice shown, and the notice states what ScaleNote *adds* to the vault (id frontmatter, block IDs, sidecars) not only what doesn't carry over — status:
- [ ] Import: Notion (Markdown+CSV or HTML export ZIP), CSVs become databases with property-type mapping — status:
- [ ] Import: OneNote text/formatting/tables/tags (.one/.onepkg, fully offline, no Microsoft account) — status:
- [ ] Import: Evernote (.enex, fully offline, no account) — status:
- [ ] Import: each format tested against a real fixture + recorded expected output, diffed on every change — status:
- [ ] Confirmed: every importer is local-file-based only, no account/API-based import path exists — status:
- [ ] Local file-format import: Markdown/Text, CSV, Word, PDF — status:
- [ ] Settings → Import section built here (was previously assumed to exist from Milestone 5; it doesn't until this milestone) — status:

## Voice calls (Milestone 10 — after January)
- [ ] Opus audio over the existing QUIC connection, no second transport — status:
- [ ] Incoming call UI: bottom-left box, profile icon, name/nickname, is-calling, Accept/Decline — status:
- [ ] 1:1 calls — status:
- [ ] Group calls scoped to a shared folder's active collaborators — status:
- [ ] Rings on every online device under the recipient's identity — status:
- [ ] Advanced/phase-two: multi-device mic/speaker reassignment mid-call — status: (honestly mark partial/disabled if not reached — this is explicitly a stretch capability)

## Multi-account home server (Milestone 8 — after January)
- [ ] Per-account isolated storage on the server, no cross-account access — status:
- [ ] Access request flow: public-key + display name, no credentials exchanged — status:
- [ ] Admin Accept/Decline prompt for pending requests (Jellyseerr-style) — status:
- [ ] Allowlist (silent auto-accept for pre-approved identities) — status:
- [ ] Blocklist (silent auto-decline, no prompt shown) — status:
- [ ] One shared account model used consistently by multi-device sync, voice call ringing, and server access — status:

## Multi-device sync (Milestone 6 for single-account home server; Milestone 12 for cloud-folder-fallback refinements, after January)
- [ ] Home server: dedicated persistent IP+port slot in Settings, reuses existing P2P engine — status:
- [ ] Home server: patient background retry, no error noise for expected offline periods — status:
- [ ] Cloud-folder fallback works with zero special integration (atomic writes already sufficient) — status:
- [ ] Cloud-folder fallback: hash-mismatch detection surfaces a warning and rebuilds from disk rather than silently trusting stale in-memory state (see Core's snapshot-hash rule) — status:
- [ ] Incoming messages validated, size-limited, and rate-limited (tested with two real instances) — status:

## Settings — General & Diagnostics (Milestone 5; AI tab is its own Milestone 11 section, see above)
- [ ] General tab: theme, accent color (real picker), font size, editor width, sidebar width, default page mode — status:
- [ ] Connection section: P2P discovery status, port setting, 3DS pairing code generation — status:
- [ ] No hardcoded/persisted server address field anywhere in settings — status:
- [ ] Diagnostics section: verbose-logging toggle, "Open logs folder" button — status:

## Logging (Milestone 1)
- [x] Structured leveled logging via `tracing`, rotating file, one per run — status: done
- [x] Frontend errors/notable failures forwarded to the same log file, not just console — status: done
- [ ] Verbose-logging toggle works without a rebuild — status:
- [x] No note content, canvas data, API keys, or pairing secrets appear in logs (actually checked, not assumed) — status: done

## AI assistant (Milestone 11 — after January)
- [ ] Master enable toggle in Settings → AI; AI does not exist anywhere in the app, including in Settings, before this milestone — status:
- [ ] Invisibility test: full app tree rendered with AI disabled contains zero AI-tagged elements (mechanical check, not a visual pass) — status:
- [ ] No AI shortcut registers, no AI command appears in the palette, no AI sidebar section is offerable, while disabled — status:
- [ ] Global AI panel: one dockable surface, opened by shortcut and offerable via the customizable sidebar, not wired separately into editor/database/canvas — status:
- [ ] Context chips: active note's block-tree content auto-populates on panel open, removable before sending — status:
- [ ] Context chips: active database view's schema + visible/filtered rows (row-capped, summarized) auto-populate — status:
- [ ] Context chips: active canvas's text-bearing placed objects (not freehand ink) auto-populate — status:
- [ ] Attach a file or note to a conversation; text extracted via the same local parsers as the importers, no network fetch — status:
- [ ] Vault-search permission toggle (default off) in Settings → AI; when granted, assistant can query the local search index mid-conversation and shows what it retrieved — status:
- [ ] Confirmed: no path outside the vault root or into `.scalenote/` internals is ever reachable from AI context assembly — status:
- [ ] Model catalog: Recommended / Browse Ollama / Browse HuggingFace / Ollama Cloud / Installed, fit-scored against actual detected hardware — status:
- [ ] Plain-language small-model / no-image-support / slow-on-CPU warnings on every listed model — status:
- [ ] HuggingFace GGUF availability validated before offering a model as downloadable — status:
- [ ] Hardware detection (CPU/RAM/GPU/VRAM) with manual rescan, fully local, never transmitted except as fit-scoring input — status:
- [ ] System prompt field: free text, user-authored, prepended to every assembled context — status:
- [ ] Cloud data disclosure shown next to the provider selector in Settings, not buried: states exactly what a cloud request contains — status:
- [ ] No network call from this feature until the user sends a message with a cloud model selected, or a cloud-configured extraction pass runs — status:
- [ ] Memory: extracted facts stored as real notes with frontmatter (type/date/confidence/source) in a dedicated `Memory/` folder — status:
- [ ] Memory: notes get the same `yrs` document model and CRDT snapshot as any other note (no separate sync mechanism needed) — status:
- [ ] Memory: conversations are never persisted as notes; only extraction output is — status:
- [ ] Memory: background extraction after a session ends (not live mid-turn), LLM-primary with regex fallback — status:
- [ ] Memory: extraction model is independently configurable from the chat model (e.g. local extraction even when chatting on Cloud) — status:
- [ ] Memory: periodic consolidation/dedup pass, actually tested for bloat prevention, plus a size-cap-triggered out-of-cycle pass — status:
- [ ] Memory: `Memory/` excluded from full-text search and graph view by default, with a setting to include it — status:
- [ ] Memory: relevance-scoped retrieval, recalled memories shown to the user, not invisible — status:
- [ ] Memory: never stores credentials/secrets, actively skips anything that looks like one even on explicit request — status:
- [ ] Confirmed: memory extraction does not attempt to ingest whole documents (attaching a file to a conversation covers that) — status:
- [ ] Confirmed: no second AI entry point exists anywhere else in the app (no per-block Ask AI, no AI-generated block types) — status:

## Graph & navigation (Milestone 2)
- [ ] Local graph view — status:
- [ ] Global graph view — status:

## Polish (Milestone 2, finished in Milestone 7)
- [ ] Zen mode — status:
- [ ] Shortcuts sheet — status:
- [ ] Export to PDF — status:
- [ ] Recently opened list — status:

## Security checklist (gated at Milestone 7)
- [ ] Fully offline except the three documented exceptions (AI assistant, invisible and inert until explicitly enabled; Mention/Embed/Bookmark link paste; Link-sourced cover images) — status:
- [ ] Tauri capabilities minimal, fs scoped to vault, path traversal guarded — status: partial (path traversal guarded in custom Rust commands via canonicalize_vault_root and validate_path; automated tests verified)
- [ ] Strict CSP, devtools disabled in release — status:
- [ ] Rendered HTML sanitized — status:
- [ ] Dependencies pinned, `cargo audit` / `npm audit` run — status:

## Stability checklist (gated at Milestone 7)
- [ ] No `.unwrap()`/`.expect()` in post-startup Rust code — status:
- [ ] Panic hook installed, logs instead of crashing — status:
- [ ] Error boundaries around each major UI panel — status:
- [x] Killed the app mid-save and confirmed no corruption — status:
- [ ] Tried to break every feature listed above (empty/huge/weird input) — status:

## Design audit (gated at Milestone 7, the actual January acceptance bar for visual quality)
- [ ] No decorative gradients anywhere outside the speced canvas/cover Gallery options — status:
- [ ] No glassmorphism/backdrop-blur panels anywhere — status:
- [ ] No oversized shadows, glow effects, or neon accents — status:
- [ ] Border-radius used consistently, not reflexively applied everywhere — status:
- [ ] No decorative hover/click micro-animations (scale, bounce, pulse) beyond fast, purposeful state changes — status:
- [ ] No decorative icons/illustrations without a specific function — status:
- [ ] Consistent spacing scale held throughout, not varied "for visual interest" — status:
- [ ] Compared side-by-side against Previous ScaleNote's actual screens and holds up — status:

## Build (`.deb` and portable/installed detection: Milestone 1; Windows installer polish: Milestone 7)
- [x] `.deb` build produced and actually run/tested on the Linux dev machine at the end of Milestone 1 — status: done
- [ ] Portable ZIP build produced, sentinel-file detection switches config path correctly — status:
- [ ] `npm run tauri build` produces a working Windows installer (verified on a VM/second machine, not just "it compiled") — status:

## Known issues / honest notes to Ron
(Anything that doesn't fit neatly above — surprises, things that took longer than expected, things you'd do differently with more time.)

- [ ] `DECISIONS.md` exists and has an entry for every mandatory case listed in CLAUDE.md — status:
