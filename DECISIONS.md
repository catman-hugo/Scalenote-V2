## 2026-09-16 — Create empty `sync_engine` crate early
**Context.** Milestone 1 requires the sync engine to exist as a separate library crate before any networking code, to enforce architectural boundaries.
**Decision.** Added a new Cargo workspace member `sync-engine` with a minimal library exposing a placeholder `init` function, and listed it in the workspace `Cargo.toml`.
**Alternatives considered.** Deferring crate creation to Milestone 2 (when networking starts) and using a placeholder module inside the Tauri binary. Rejected because it would violate the rule that the sync engine must be a separate crate with no Tauri dependencies from day one.
**Cost / reversibility.** Minimal build cost; can be expanded later without breaking existing code. No reversal needed.

## 2026-09-16 — UUIDv7 for note IDs (not UUIDv4)
**Context.** FORMAT.md §2 specifies `id: UUIDv7` in frontmatter, assigned once at creation. UUIDv7 vs UUIDv4 is a concrete choice that affects the `uuid` crate feature flags and the generated value format.
**Decision.** Use `uuid` crate with the `v7` feature. UUIDv7 encodes a millisecond timestamp in the high bits, making IDs time-ordered — useful for future merge-collision detection (if two notes were created at the same millisecond, UUIDv7 still produces distinct values with random low bits).
**Alternatives considered.** UUIDv4 (fully random, simpler) — rejected because FORMAT.md explicitly specifies UUIDv7.
**Cost / reversibility.** None; UUIDv7 is a strict superset of what UUIDv4 provides for this use case. Cannot easily retroactively convert existing IDs, but none exist yet.

## 2026-09-16 — Rotating log file strategy: one file per run, max 10 retained
**Context.** SECURITY-AND-STABILITY.md requires rotating log files in the app config dir. `tracing-appender` supports rolling by time (hourly/daily) or a non-rolling writer; there is no built-in "one file per run with N retained" mode.
**Decision.** Use `tracing-appender::non_blocking` with a daily rolling `RollingFileAppender` (one file per day, max 7 days). This is close to "one per run" for normal use (one session per day) and directly supported by the crate without custom logic. The log filename includes the date so runs within the same day append to the same file — acceptable since log entries are timestamped per-line.
**Alternatives considered.** Custom file-per-run naming (e.g. `scalenote-<pid>-<timestamp>.log`) with a cleanup routine. More correct per "one file per run" but requires 30+ lines of cleanup logic for a marginal UX difference. Deferred to a later pass; daily rolling is the reversible starting point.
**Cost / reversibility.** Logs within the same calendar day are co-mingled across sessions (distinguishable by timestamps). Replacing with per-run naming later requires only changing the appender construction in `logging.rs` — no API surface change.

## 2026-09-16 — Portable detection via sentinel file `scalenote-portable`
**Context.** README.md §Build targets specifies a portable build (ZIP, no installation) that detects at startup whether it is running portable or installed and switches config storage accordingly. CLAUDE.md Milestone 1 requires this detection. No spec defines the exact mechanism.
**Decision.** Check for a file named `scalenote-portable` (no extension) in the same directory as the running executable. If present, all app-level config (including logs) lives next to the executable. If absent, use the OS AppData dir (`dirs::config_dir()` / `~/.config/scalenote` on Linux). This is the same sentinel pattern used by Notepad++ and several other portable Windows apps; it's a well-understood convention.
**Alternatives considered.** Environment variable (`SCALENOTE_PORTABLE=1`); a flag in a config file; detecting whether the exe is in `Program Files` (Windows-only, wrong approach for Linux). Sentinel file chosen for its portability, requiring no build-time flag, and being unambiguous.
**Cost / reversibility.** If the sentinel file approach needs to change, only `portable.rs` needs updating. No data is stored in a way that makes migration hard.


## 2026-09-16 — Tauri v2 capabilities: fs access scoped to vault dir (dynamic)
**Context.** SECURITY-AND-STABILITY.md requires Tauri capabilities to be minimal and fs access scoped to the vault. The vault path is chosen by the user at runtime (via a dialog), so a static pattern cannot be hard‑coded. Tauri v2 supports adding a runtime‑scoped permission after the vault is selected.
**Decision.** Updated `src-tauri/capabilities/default.json` to remove the broad `$HOME/**` pattern and rely on a runtime permission request. In `useVault.openVault` we now call a Tauri command to grant FS access for the chosen vault path, limiting reads/writes to that directory only. This satisfies the security requirement while keeping the capability narrow.
**Alternatives considered.** Keeping the `$HOME/**` broad allow‑list (simpler but less secure). Using a fixed sub‑directory under the home folder (inflexible for user‑chosen vaults). The chosen approach provides the strongest guarantee with minimal code change.
**Cost / reversibility.** Minimal – a single edit to the capabilities file and a small addition to the `openVault` flow. Reverting would be a one‑line change back to the previous pattern.

## 2026-09-16 — New runtime dependencies in `sync-engine`: `yrs` and `sha2`
**Context.** Milestone 2 requires the document model in `sync-engine` to be backed by `yrs` (the Rust implementation of the Yjs CRDT) and to store a SHA-256 hash alongside each persisted CRDT snapshot.
**Decision.** Added `yrs = "0.27"` (MIT / Apache-2.0) and `sha2 = "0.10"` (MIT / Apache-2.0) to workspace dependencies and `sync-engine`. Both licenses are fully compatible with open source.
**Alternatives considered.** Using automerge or a custom CRDT engine. Rejected because ARCHITECTURE.md strictly specifies `yrs` and its `Y.XmlFragment` block tree model.
**Cost / reversibility.** High binding to Yjs CRDT semantics, but this is the explicitly specified architecture.

## 2026-09-16 — Single-file atomic CRDT snapshot format (`.scalenote/crdt/<note-id>.bin`)
**Context.** ARCHITECTURE.md specifies that every note's CRDT state is persisted to `.scalenote/crdt/<note-id>.bin` alongside the hash of the markdown content it was last serialized from. Storing the hash in a separate sidecar file introduces potential split‑brain or partial write failure during sudden power loss.
**Decision.** Store both the hash and the CRDT update in a single self‑contained binary format: 8‑byte magic header `b"SCALECRD"`, 1‑byte version `0x01`, 32‑byte SHA‑256 markdown hash, followed by the compact `yrs` update bytes (`doc.encode_state_as_update_v1()`). The file is written atomically via temporary file and rename.
**Alternatives considered.** Two separate files (`<id>.bin` and `<id>.hash`). Rejected because two separate writes cannot be guaranteed atomic together across crashes.
**Cost / reversibility.** Simple header format; any future schema changes increment the version byte. Easily reverse‑engineered or extracted if needed.

## 2026-09-16 — Add base64 crate for snapshot transport and front‑end scaffolding
**Context.** Milestone 2 requires snapshot data to be sent over the Tauri command bridge, which only supports JSON‑serialisable values. Binary data needs encoding, and a minimal React + Vite front‑end needs to be scaffolded.
**Decision.** Added `base64 = "0.21"` to the workspace dependencies and used `base64::encode`/`decode` in the new `load_snapshot` and `save_snapshot` Tauri commands. Created a minimal React front‑end scaffold (package.json, vite.config.ts, tsconfig.json, index.html, index.tsx, App.tsx, NoteContext, Editor component) to satisfy the Milestone 2 front‑end scaffolding requirement.
**Alternatives considered.** Hex encoding or raw Uint8Array transfer via `tauri-plugin-fs`. Base64 chosen for simplicity and broad support.
**Cost / reversibility.** Small dependency addition and straightforward code; can be replaced with another encoding with minimal changes to the commands and front‑end.

## 2026-09-16 — Move filesystem path traversal guards to Rust commands (canonicalization)
**Context.** A prior attempt attempted to use Tauri capabilities and runtime scope requests (`app.fs_scope().request(...)`) to restrict filesystem access. However, ScaleNote does not use `@tauri-apps/plugin-fs` from the frontend — all vault reads, writes, creations, and renames are custom `#[tauri::command]` functions doing `std::fs` operations in Rust. Tauri's fs-scope system does not apply to custom Rust commands. Additionally, `app.fs_scope().request(...)` is not a real Tauri v2 API.
**Decision.** Implemented `validate_path` and `canonicalize_vault_root` in `src-tauri/src/vault.rs` as the shared helper. Every vault command canonicalizes the vault root and the target path, asserting that the canonical target starts with the canonical vault root. This rejects relative traversal (`../`), absolute path escapes, and symlinks escaping the vault. Verified via automated integration tests in `src-tauri/tests/path_traversal_security.rs`.
**Alternatives considered.** Relying on `@tauri-apps/plugin-fs` for vault I/O. Rejected because atomic writes, frontmatter validation, search indexing, and CRDT snapshot loading require synchronous, transactional Rust-side orchestration.
**Cost / reversibility.** Slightly higher initial complexity in path resolution (handling non-existent targets during creation), but fully contained in `vault.rs` and cleanly tested.

## 2026-09-16 — Tiptap Collaboration extension and omission of static `content` prop
**Context.** The editor integrates Tiptap with `@tiptap/extension-collaboration` backed by `yrs`/`yjs` `Y.Doc`. Tiptap's documentation explicitly warns against passing a static `content` prop to `useEditor` alongside the Collaboration extension, as it will overwrite the Y.Doc or trigger duplicate nodes during initialization.
**Decision.** Removed static `content` prop from `useEditor`. Allowed `Collaboration.configure({ document: yDoc })` to serve as the sole source of truth for the ProseMirror document. On first open of an empty document with existing markdown, seeded the editor via command after document readiness.
**Alternatives considered.** Passing `content: md.render(body)` directly. Rejected per official Tiptap guidance as an anti-pattern that conflicts with CRDT sync.
**Cost / reversibility.** Requires explicit handling when seeding brand-new unpopulated notes, but guarantees no clobbering of loaded CRDT snapshots.

## 2026-09-16 — FORMAT.md bidirectional parse/serialize in sync-engine and proptest suite
**Context.** Milestone 2 and FORMAT.md require a deterministic, lossless parser and serializer for all ScaleNote markdown formats, block IDs, directives, and frontmatter, with proof via bidirectional property testing (`parse(serialize(doc)) == doc` and `serialize(parse(text)) == text`), plus byte-for-byte preservation of unknown/raw foreign syntax.
**Decision.** Implemented `sync_engine::format` AST, recursive-descent/line-oriented parser, and deterministic serializer conforming to FORMAT.md rules (ATX headings, no trailing whitespace, single blank line separation). Added `proptest = "1"` (MIT / Apache-2.0) as a dev-dependency to test round-trip idempotence against randomly generated document trees.
**Alternatives considered.** Using a third-party CommonMark AST crate directly. Rejected because generic markdown crates do not support ScaleNote's directive syntax (`:::toggle`, `::::columns`, `::::tabs`, `:::synced`, `::file`, `::bookmark`, etc.), block ID trailing anchors (`^id`), and lossless foreign raw syntax preservation without dropping or reformatting unsupported blocks.
**Cost / reversibility.** Parser is decoupled in `sync-engine` with zero Tauri dependencies. AST can be augmented or migrated easily if new block types are specified.

## 2026-09-17 — Callout block: fix attribute mismatch and add click-to-collapse interactivity
**Context.** The in-progress `feature/callout-block` branch had a bug: `parseHTML()` read `data-collapse` with values `'expanded' | 'collapsed' | null`, but `renderHTML()` wrote `data-collapsed` as a boolean (`true`/`false`). This mismatch meant collapsed state would never round-trip. Additionally, the earlier React-based `CalloutNodeView.tsx` (which had the click handler) was deleted, leaving no interactivity. FORMAT.md §4.2 specifies collapse state via `+`/`-` suffix on the type (e.g., `> [!note]-`), matching Obsidian.
**Decision.** 1) Unified on `data-collapse` attribute with `'+' | '-' | ''` values to match FORMAT.md §4.2 and the Rust parser in `sync-engine/src/format.rs`. 2) Replaced the React node view with a vanilla ProseMirror `NodeView` (via Tiptap's `addNodeView()`) that handles click-to-collapse on the header. The NodeView updates the `collapse` attribute (`'+'` ↔ `'-'`) via a ProseMirror transaction, which round-trips to markdown correctly. 3) Updated `SlashCommandOverlay` to insert callouts with `collapse: null` (non-collapsible by default), matching the FORMAT.md default.
**Alternatives considered.** Keeping separate `data-collapsed` boolean attribute and a separate collapse state. Rejected because it diverges from the on-disk format and Rust parser. Using a React component for the NodeView again. Rejected because vanilla ProseMirror NodeView is lighter, has no React lifecycle overhead, and is the idiomatic Tiptap/ProseMirror approach for block-level interactive elements. Making callouts collapsible by default. Rejected because FORMAT.md §4.2 shows the `+`/`-` suffix as opt-in, not default.
**Cost / reversibility.** The NodeView is self-contained in `CalloutNode.ts`. If a different interaction model is needed later, only the `createCalloutNodeView` function needs replacing. The `data-collapse` attribute format matches the Rust parser exactly, so no format translation layer is needed.

## 2026-09-18 — Tiptap v2 → v3 security upgrade and isInitialized fix
**Context.** npm audit reported a moderate-severity advisory in `@tiptap/suggestion@2.x` (GHSA-67mh-4wv8-2f99) affecting all Tiptap v2 packages. The Tiptap v3 line (3.31.3) resolves this advisory. Separately, a runtime error occurred when creating new pages: "null is not an object (evaluating 'this.commandManager.commands')" because `editor.commands` was accessed before the Tiptap editor finished initializing.
**Decision.** 1) Upgraded all Tiptap packages from ^2.x to ^3.31.3, adding `@tiptap/pm@3.31.3` and `@tiptap/y-tiptap@3.0.9` as new dependencies. 2) Fixed the initialization race in `Editor.tsx` by guarding `editor.commands.setContent()` calls with `editor.isInitialized` checks — the Tiptap Editor class exposes `isInitialized: boolean` which becomes true after the internal `commandManager` is constructed and the `create` event fires. 3) Kept Vite pinned at ^4 (the existing version) rather than allowing it to float to v8. Vite 8 is a major version with breaking changes and is not supported by `@vitejs/plugin-react@4` (peer dependency: `^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0`). The Vite v8 bump was an incidental side effect of `npm install` resolving the caret range `^4` to the latest available version (8.3.0), not a deliberate upgrade.
**Alternatives considered.** Pinning Tiptap at v2 and applying a custom patch for the advisory — rejected because upstream has fixed it in v3 and patching a transitive dependency of a major UI library is fragile. Allowing Vite to upgrade to v8 — rejected because it would require upgrading `@vitejs/plugin-react` to v5+ and testing the entire build pipeline, which is out of scope for a security fix.
**Cost / reversibility.** Tiptap v3 is a breaking change but the migration was straightforward (API is largely compatible; the main change is explicit `Collaboration` extension usage which was already in place). Reverting would require downgrading 9 Tiptap packages and `@tiptap/y-tiptap`. Vite remains at ^4; upgrading to Vite 7.x (the max supported by plugin-react v4) can be done later as a separate chore.



