# Agent instructions for building ScaleNote

You are building the app described in README.md. Read it first. This file is the operating contract — follow it exactly.

**Timeline: target a fully polished, non-crashing, good-looking core product by mid-January (roughly 4 months from the start of this project) — not everything in this spec, a deliberately chosen subset, sequenced below. The full scope in README.md is real and wanted, not aspirational filler, but it's sequenced to land across roughly a year, not compressed to hit the January date. If the January milestone slips due to model/compute quota limits or anything else, that's an acceptable, expected outcome — do not cut corners on quality or security to hit the date instead.**

## Reference documents — read on demand, not all at once

This file (`CLAUDE.md`) plus `README.md` and `FORMAT.md` are the three documents whose precedence is defined below and are worth having loaded whenever you're working on this project. The detailed rules for specific subsystems live in separate files under `docs/` so this file stays short — **read the relevant one in full before writing code in that area**, rather than loading all of them every session:

- **`docs/ARCHITECTURE.md`** — the document model (what's authoritative between the CRDT and the markdown file, and when), the sync-engine crate boundary, canvas/annotation/folder CRDT design, the draw-over-text annotation layer, and database/property schema design. Read this before touching storage, the `yrs` document, sync, canvas data, or database schemas.
- **`docs/EDITOR.md`** — visual design constraints, canvas swatches/background patterns, block editor mechanics (link paste, block types, importers, code block, hover previews, drag/gutter behavior, image/embed resizing, sidebar entity kinds, icons/covers), and known failure patterns to avoid. Read this before building any UI, the block editor, or the canvas interaction layer.
- **`docs/SECURITY-AND-STABILITY.md`** — logging, the non-negotiable security requirements (including peer-to-peer-specific rules), and the non-negotiable stability requirements. Read this before writing anything that touches the filesystem, the network, or panics/error handling — and re-check it at the Milestone 7 hardening pass.
- **`docs/IDENTITY-AND-COLLABORATION.md`** — the account/device key and pairing model, voice calls, the multi-account home server, and multi-device sync (home server + cloud-folder fallback). Read this before touching identity, P2P discovery/pairing, or sync targets other than a single local vault.
- **`docs/AI-ASSISTANT.md`** — the AI panel's surface, context assembly, memory, and local/cloud model handling. Read this before touching anything AI-related; do not start this work before Milestone 11.

## Document precedence and recording decisions

Three documents govern this build, and they will occasionally disagree. When they do:

- **`FORMAT.md` is authoritative for anything on disk** — markdown syntax, block IDs, frontmatter keys, sidecar shapes. If README.md or this file implies a different on-disk representation, FORMAT.md wins.
- **This file (and the docs/ files it points to) is authoritative for *how*** — architecture, sequencing, coding standards, security, stability. If README.md describes an implementation approach that conflicts with a rule here, the rule here wins.
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

**Milestone 2 — Core editing & organization (~5 weeks).** The document model comes first and is not optional groundwork: `yrs` backs every note from the first commit of this milestone, the sync-engine crate boundary exists from the first commit of this milestone (see `docs/ARCHITECTURE.md`, "Shared sync engine crate"), and CRDT snapshots persist and reload per `docs/ARCHITECTURE.md`'s "Document model" section. Retrofitting either after the editor exists is a rewrite, not a refactor — do not defer them to Milestone 6 on the grounds that no networking exists yet. Then: markdown source editor as a projection of that document with live preview, SQLite search index, full-text search, command palette, quick switcher, wikilinks, backlinks, tags. The full block-based rich editor (Tiptap) over the same document: slash command menu, every block type in README.md's expanded list, all serialized exactly as `FORMAT.md` specifies, link paste (Mention/Paste/Embed/Bookmark), code blocks (exact visual spec), the shared image/embed resize-handle system, hover previews on menus. Sidebar entity kinds (Notebook/Folder/Section/Page) with custom icons/colors/covers, sidebar customization.

Two things explicitly **not** in this milestone even though they appear in the block editor's UI surface: the `/canvas` embed block and the draw-over-text annotation layer, both of which depend on the canvas data model built in Milestone 4. Register their slash-command entries as visibly disabled with a "coming in the canvas milestone" tooltip rather than stubbing them.

**Import from other note apps (Obsidian/Notion/OneNote/Evernote) and local-file-format import (Markdown/Text, CSV, Word, PDF) are explicitly not in this milestone either** — they move to Milestone 9, after January. Four importers plus four file-format parsers, each requiring a real fixture and a recorded expected-output diff per the testing standard in `docs/EDITOR.md`, is its own substantial body of work; compressing it into this milestone alongside the document model and the full block editor is how features end up marked `done` without actually being hardened. The Settings → Import section itself doesn't need to exist until Milestone 9 either.

**Milestone 3 — Database views (~2 weeks).** Full property type set, all view types (Table/Kanban/Calendar/Gallery/List/Timeline/Charts/Form/Linked view), inline option editing, side peek. `created_by`/`last_edited_by` are built here and record the **local account identity**, which exists from first run — they do not wait on Milestone 6, which only changes who else can appear in them.

**Milestone 4 — Canvas & drawing (~2 weeks).** Edgeless canvas mode, the CRDT-backed canvas document (see `docs/ARCHITECTURE.md`, "Canvas, annotation, and folder documents"), exact color swatches and background patterns, lasso-select (OneNote-style live hit-testing), block gutter drag/elongation, draw-over-text annotation layer (block-anchored via block IDs, not screen pixels), canvas embeds, split view, pen button mapping for stylus devices.

**Milestone 5 — Settings (~1 week).** General tab (theme, accent color, font size, editor width, sidebar width, default page mode, Connection section, Diagnostics section) only. **No AI tab in this milestone** — AI doesn't exist anywhere in the app, including in Settings, until Milestone 11 builds it, toggle included. Shortened from the original two-week estimate now that it no longer carries Ollama integration, hardware detection, or RAG.

**Milestone 6 — P2P collaboration core (~3 weeks).** Account/device identity and enrolment (see `docs/IDENTITY-AND-COLLABORATION.md`, "Identity, devices, and pairing"), friend nicknames. LAN/Tailscale/manual discovery, pairing, `quinn` QUIC transport, wiring the already-existing CRDT documents to the already-existing sync crate, cursor/selection awareness, presence, reconnect handling. A single-account home server (the multi-account version is Milestone 8, after January). If Milestone 2 was done correctly, this milestone adds transport and trust — not a document model.

**Milestone 7 — Hardening and design pass (~2 weeks) — this is the January finish line.** Security audit (`cargo audit`/`npm audit`, Tauri capability review, the untrusted-peer-input checklist in `docs/SECURITY-AND-STABILITY.md`). Stability pass: deliberately try to break every feature, including two live instances editing simultaneously. Performance pass. And the design audit described in `docs/EDITOR.md` — this is a real acceptance gate for the milestone, not optional polish.

### After January — real, wanted, sequenced for the rest of the year

**Milestone 8 — Multi-account home server:** the Jellyseerr-style request/approval flow, allowlist/blocklist, per-account isolated storage.
**Milestone 9 — Import from other note apps:** Obsidian, Notion, OneNote, Evernote, and local-file-format import (Markdown/Text, CSV, Word, PDF), each tested against a real fixture with a recorded expected-output diff. The Settings → Import section is built here.
**Milestone 10 — Voice calls:** basic single-device calling first and thoroughly proven out, then the multi-device audio routing stretch capability.
**Milestone 11 — AI assistant:** the global, opt-in, context-aware surface described in `docs/AI-ASSISTANT.md` — the enable toggle and the full Settings → AI tab, local/cloud model selection and hardware fit-scoring, the context-permission model and vault-search tool, and memory built on the note document model. This is the same slot the original roadmap gave to "Memory" alone; the scope is now substantially larger and the whole feature lives here, not split between an earlier Settings milestone and a later Memory milestone.
**Milestone 12 — Multi-device sync refinements:** conflict surfacing for the cloud-folder mode beyond the baseline hash check, snapshot compaction, and any remaining cleanup of the sync-crate boundary.
**Milestone 13 — Companion 3DS client:** navigate/add/draw, bidirectional canvas-only sync.
**Milestone 14 — Additional platforms:** Android build and the headless server-mode binary matching the existing `server/` scaffold.
**Milestone 15 — Open-source release audit:** the no-identifying-information sweep described in `docs/SECURITY-AND-STABILITY.md`, license file, public-facing documentation pass.

If work needs to pause or stop at any point, stop at the end of the current milestone, make sure everything up to that point is solid, and leave anything beyond it visibly disabled with a "not finished" state rather than partially built and broken.

## PROGRESS.md

Keep `PROGRESS.md` updated as you go, not just at the end. For every feature listed in README.md, mark it one of: `done`, `partial (note why)`, `disabled (note why)`. This file is the actual deliverable being evaluated alongside the app — be precise and honest in it. Don't mark something `done` if you haven't actually tried to break it. When something is partial or disabled, cite the specific reason concretely (what's missing, what broke) rather than a vague "needs more work."

## Definition of done, per milestone

Apply this at the end of each milestone in the Roadmap above, not only once at the very end of the project:

- The relevant build for that milestone succeeds and actually runs: the Linux `.deb` from Milestone 1 onward (built and tested on the dev machine), the Windows installer once Milestone 7's hardening pass covers it (verified on a VM/second machine, not just "it compiled").
- The app opens, a vault can be created/opened, notes can be created/edited/saved/reopened without data loss.
- Killing the app mid-edit does not corrupt any file.
- No feature added in that milestone throws an unhandled exception when used normally or when used slightly wrong (empty input, huge input, special characters, rapid clicking).
- `PROGRESS.md` accurately reflects the state of every feature touched in that milestone.
