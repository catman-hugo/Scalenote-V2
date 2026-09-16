<!-- Part of ScaleNote's spec. See CLAUDE.md for the document index and when to read this file. -->

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

## Shared sync engine crate (Milestone 2, not later)

Structure the CRDT and sync engine as its own library crate in the Cargo workspace from the first commit of Milestone 2 — before any networking exists. The temptation is to defer it until Milestone 6, when there's something to send over a wire; resist it, because by then the document model will have grown Tauri-shaped dependencies that are painful to unpick.

**In the crate:** document types and their `yrs` schemas (note, canvas, annotation, folder), markdown parse/serialize per `FORMAT.md`, snapshot persistence and the hash check, discovery (mDNS/Tailscale/manual), pairing and the identity/certificate model, `quinn` transport, awareness, and the validation/rate-limiting of incoming messages.

**Not in the crate:** anything Tauri — window management, commands, dialogs, the UI bridge — and anything React. The crate must compile and its tests must pass without Tauri as a dependency; that's the mechanical check that the boundary is real, and it's what makes the headless server binary in `server/` possible later without forking the sync logic. Add that check to CI in Milestone 2 so the boundary can't rot quietly.

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

## Draw-over-text annotation layer

Don't build this the way Previous ScaleNote did: it stored overlay ink strokes in fixed pixel coordinates relative to the viewport (`viewport = {x:0, y:0, zoom:1}`, canvas resized via `ResizeObserver` on raw container pixels), meaning the ink was anchored to the screen, not to the text. The result was ink that stayed in the same screen position while the text reflowed underneath it on any window resize, font change, or different screen — almost certainly the root cause behind a long list of "pen tool" bugs in that project rather than a series of unrelated issues.

Instead:

- **The anchor is a block ID**, not a position or an index. Drawing a stroke over a block that has no ID yet mints one and writes it into the markdown file per `FORMAT.md` — lazily, on first need. Anchoring by index or by order is wrong and will silently relocate every stroke the first time a block is reordered, which is a supported gesture.
- Store a stroke's points as fractional offsets relative to *that block's own bounding box* (x/y as 0–1 fractions of the block's width/height), with stroke thickness in units relative to that block's font size (e.g. `em`) rather than raw pixels.
- At render time, position each stroke relative to wherever its anchor block currently sits, at its current size. Because the coordinates are fractions of the block's own box, the stroke moves when content above it shifts the block down, and scales when the block's width or font size changes — alignment falls out of expressing the stroke in the block's own terms instead of the screen's.
- **Known limitation, document it rather than chase it:** fractional coordinates track the block's *box*, not its *words*. If a paragraph reflows from two lines to five because its text was edited, ink at y=0.5 stays at the vertical midpoint of a now-taller box, which is over different words than it was. This is expected behaviour for this design, not a regression; underline-a-specific-word fidelity through arbitrary text edits is out of scope. Say so in the UI docs.
- A stroke spanning multiple blocks anchors to whichever block it starts in — also a documented scope limit, not something to solve by splitting ink across anchors.
- **Deleting a block deletes its anchored strokes with it — as a tombstone, not a hard delete.** Undoing the block deletion must restore its ink. Retain deleted strokes for at least the life of the undo stack; a plain Ctrl+Z that silently discards drawings is data loss.
- The annotation layer is a CRDT document of its own (see "Canvas, annotation, and folder documents" above), so a peer deleting a block removes the associated ink on both sides instead of leaving each device with a differently-orphaned sidecar.
- Serialize it to its own sidecar file (`Note Title.annotations.json`, per README.md's directory layout) — separate from the edgeless-canvas sidecar, since the coordinate semantics are genuinely different (block-anchored/fractional vs. freeform/absolute) and conflating them into one format invites exactly the kind of bug above.

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
