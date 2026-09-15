# ScaleNote file format

This document is authoritative for anything ScaleNote writes to disk: markdown syntax, block IDs, frontmatter keys, and sidecar shapes. Where README.md or CLAUDE.md implies a different on-disk representation, this document wins. If a block type you need isn't covered here, add it here first — with a `DECISIONS.md` entry — rather than improvising in the serializer.

Two properties this format exists to guarantee:

1. **Lossless round-trip.** For any document ScaleNote produced, `parse(serialize(doc)) == doc` and `serialize(parse(text)) == text`. Both directions are property-tested, over every block type below.
2. **Nothing is ever dropped.** Syntax this parser doesn't understand is preserved byte-for-byte and written back unchanged. A vault is not allowed to lose content by being opened.

---

## 1. Design rules

**Markdown first.** Anything CommonMark can express is written as CommonMark: headings, paragraphs, emphasis, lists, blockquotes, fenced code, tables (GFM), links, images, task list items. ScaleNote-specific syntax exists only for things markdown genuinely can't express.

**Directives for everything else.** ScaleNote uses the generic directive syntax (the CommonMark directive proposal, as implemented by `remark-directive` and its Rust equivalents) in three shapes:

| Shape | Syntax | Used for |
|---|---|---|
| Container | `:::name{attrs}` … `:::` | Blocks with children (columns, tabs, toggles, synced source) |
| Leaf | `::name{attrs}` | Blocks with no children (ToC, breadcrumb, canvas embed, database view) |
| Inline | `:name[label]{attrs}` | Inline constructs (mentions, dates) |

**Attributes.** `{key=value}` pairs, space-separated. Values containing spaces, `}`, `"`, or newlines are double-quoted with backslash escaping (`\"`, `\\`). Bare values otherwise. Boolean attributes may be written bare (`{locked}` == `{locked=true}`). Attribute order on serialize is the order given in each block's spec below, so output is deterministic. `{#id}` is the shorthand for a block ID attribute (see §3).

**Nesting.** Container directives nest by fence length: an outer container uses more colons than any container inside it. A `:::::columns` containing `:::tabs` is correct; equal-length fences are a parse error and the outer block is preserved verbatim as raw (§8).

**Determinism.** The serializer is idempotent and has exactly one output for a given document: ATX headings (`##`, never underlines), `-` for bullets, `1.` `2.` `3.` for ordered lists (not all-`1.`), fenced code with backticks (tildes only when the content contains a backtick fence), `*emphasis*` and `**strong**`, no trailing whitespace, LF line endings, exactly one blank line between top-level blocks, and a trailing newline at end of file.

**Frontmatter.** YAML, `---`-delimited, always first in the file, always present (every note has at least an `id`). Keys are serialized in the order given in §2.

---

## 2. Note frontmatter

```yaml
---
id: 01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44
icon: "📓"
color: "#4A7FB5"
cover:
  source: gallery        # gallery | file
  value: gradient-slate  # gallery ID, or a path under attachments/ for file
  offset: 0.35           # vertical crop position, 0–1; file covers only
tags: [research, kala]
created: 2026-01-12T09:14:03Z
properties:
  Status: In review
  Due: 2026-02-01
  Owner: 3
---
```

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | UUIDv7, assigned once at creation, never reassigned or reused. Keys the CRDT snapshot, the annotation sidecar, and any stable reference to this note. A note found without one gets one written on first open. |
| `icon` | no | An emoji character, or `glyph:<n>` for a bundled monochrome glyph. |
| `color` | no | `#RRGGBB`. Tints a glyph icon; for an emoji icon, only sets the sidebar accent. |
| `cover` | no | See above. A `gallery` cover references a bundled asset ID and involves no file. |
| `tags` | no | Flow-style list. Inline `#tags` in the body are *not* duplicated here; the two are separate surfaces and the index merges them. |
| `created` | no | RFC 3339. Written at creation. Filesystem metadata is a fallback only — it does not survive backups, clones, or sync clients. |
| `properties` | no | This note's database property values, keyed by property *name* as shown in the folder schema. Absent key = no value, which is not an error. |

Unknown frontmatter keys are preserved verbatim, in their original position, and written back unchanged. This is what makes pointing ScaleNote at an Obsidian vault non-destructive.

---

## 3. Block IDs

Block IDs are **assigned lazily** — only when something needs to reference a block. Stamping every block would make files noisy and would pollute any Obsidian vault the app is pointed at. Three things mint an ID: anchoring an annotation stroke, copying a link to the block, and turning a block into a synced-block source.

- **Format:** `^` followed by 6–12 characters of `[a-z0-9]`. Generated randomly, not sequentially. Unique within a note.
- **Leaf blocks** (paragraph, heading, list item, code fence, table, image) carry the ID as a trailing token on the block's last line, separated by a single space: `A paragraph of text. ^k3f9q2`. This is Obsidian's convention, deliberately — it interoperates.
- **Container directives** carry it as an attribute on the opening fence: `:::callout{type=warning #k3f9q2}`.
- **Stability:** an ID survives every edit to the block's content, its reordering, its indentation, and its conversion to another block type via "turn into." It is regenerated only if the block is deleted and a new one created. Duplicating a block mints a new ID for the copy — never two blocks with the same ID in one note.
- **Hand-edited files:** if a parse finds duplicate IDs in a note, the first occurrence in document order keeps it and later ones are reassigned, logged at `warn`. References that pointed at a reassigned block are reported as broken rather than silently repointed.
- **Cross-note references** use `note-id#block-id` (the note's frontmatter UUID, not its path), so both rename and move are safe.

---

## 4. Block catalogue

### 4.1 Standard markdown (no ScaleNote syntax)

Headings (`#`–`####`, four levels), paragraphs, bullet/ordered lists, task list items (`- [ ]` / `- [x]`), blockquote, fenced code, GFM tables, thematic break (`---` on its own line), images, links. Serialized per the determinism rules in §1.

### 4.2 Callout

Obsidian-compatible blockquote callout syntax, chosen so callouts interoperate in both directions with an Obsidian vault.

```markdown
> [!warning] Don't skip this
> The body of the callout, which may contain **any** block content,
> including lists and code.
```

- Type is one of `note`, `info`, `tip`, `success`, `warning`, `danger`, `question`, `quote`, `example`. Unknown types render with the default appearance and are preserved.
- A trailing `+` or `-` on the type (`> [!note]-`) marks it collapsible, default-collapsed or default-expanded respectively, matching Obsidian.
- A block ID goes on the last line of the callout body.

### 4.3 Toggle list and toggle heading

```markdown
:::toggle
A collapsible block. The first child is the summary line.

Everything after it is the collapsed body.
:::
```

```markdown
:::toggle{as=h2}
## A collapsible heading

Body content hidden until expanded.
:::
```

- `as` is `h1`–`h4` for a toggle heading, absent for a toggle list. When present, the first child must be a heading of that level; a mismatch is repaired on parse and logged.
- Default state is collapsed. `{open}` marks a toggle that renders expanded.

### 4.4 Column layout

```markdown
::::columns
:::column{width=0.6}
Left side content.
:::
:::column{width=0.4}
Right side content.
:::
::::
```

- 2–5 `column` children. `width` is a fraction of the row, 0–1, and the set must sum to 1 ± 0.001; on mismatch, widths are normalized on parse and logged at `debug`.
- Produced both by the `/columns` slash command and by the drag-to-left/right gutter gesture; there is one representation for both.

### 4.5 Tabs

```markdown
::::tabs
:::tab{title="Setup"}
Content of the first tab.
:::
:::tab{title="Usage"}
Content of the second tab.
:::
::::
```

- At least one `tab` child. `{active}` on one tab marks the default; absent, the first is active.

### 4.6 Synced block

The canonical copy is a container in the note where it was created. Every other placement is a leaf reference.

```markdown
:::synced{#sync-7hq2k9}
The content that lives in exactly one place.
:::
```

```markdown
::synced-ref{note=01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44 block=sync-7hq2k9}
```

- The reference stores only identifiers — it does not cache a copy of the text. This keeps one source of truth at the cost of the reference being unreadable in a plain text editor; that trade is taken deliberately, because a cached copy that silently goes stale is worse than a pointer that is obviously a pointer.
- If the target note or block is missing, the reference renders as a visible "synced block not found" placeholder showing both IDs. It is never removed from the file.
- Synced block source IDs are prefixed `sync-` to make them recognizable in a hand-edited file.

### 4.7 Page block (inline sub-page embed)

```markdown
::page{note=01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44}
```

Distinct from a wikilink: a wikilink (`[[Some Note]]`) is an inline link, a page block renders the sub-page inline. Referenced by note UUID, not path.

### 4.8 Table of contents

```markdown
::toc{depth=3}
```

`depth` is 1–4, default 3. Content is derived from the note's own headings at render time and is never stored.

### 4.9 Breadcrumb

```markdown
::breadcrumb
```

Derived from the note's path relative to the vault root at render time. No stored data.

### 4.10 Canvas embed

```markdown
::canvas{frame=f_01937d31-2a55-7c10-8e99-0b4d2e7a1c63}
```

References a frame (a placed object of `kind: "frame"`) in this note's own canvas document. Read-only in the text flow. If the frame no longer exists, renders a visible placeholder and is preserved in the file.

### 4.11 Button

```markdown
::button{label="Mark done" action=set-property property="Status" value="Complete"}
```

```markdown
::button{label="Add a task" action=create-linked-note folder="Tasks" relation="Parent"}
```

- `action` is exactly one of `set-property` or `create-linked-note`. **No other values are permitted, ever** — this is not a place arbitrary code executes. An unrecognized action renders as a disabled button with a visible reason, and is preserved in the file.

### 4.12 Equations

- Inline: `$E = mc^2$`
- Block: `$$` on its own line, the expression, `$$` on its own line.

A literal `$` in prose is escaped `\$`. Block equations may carry a block ID on the closing `$$` line.

### 4.13 Mermaid and other diagram code

````markdown
```mermaid
graph TD
  A --> B
```
````

An ordinary fenced code block with the `mermaid` info string, rendered locally by the bundled library. No network fetch at any point. Nothing ScaleNote-specific about the syntax — a vault opened elsewhere just shows the code.

### 4.14 Code block language override

````markdown
```python {locked}
print("detected as python, and pinned there")
```
````

The `locked` attribute means the user set the language manually; auto-detection stops for that block. Absent, the language in the info string is whatever detection last produced and may change as the content changes.

### 4.15 File attachment

```markdown
::file{path="attachments/spec-v3.pdf" name="spec-v3.pdf" size=482113}
```

`path` is always relative to the vault root and always inside `attachments/`. `name` is the display label (defaults to the filename). `size` is bytes, advisory, refreshed on open.

### 4.16 Bookmark, embed, and mention (link paste)

The four link-paste outcomes have four representations:

- **Paste** — a bare autolink, no directive: `<https://example.com/page>`. No network, always works offline.
- **Mention** — inline: `:mention[Page title]{url="https://example.com/page" fetched=2026-01-12}`. The title is cached in the file; `fetched` records when, so a stale title is diagnosable.
- **Bookmark** — leaf: `::bookmark{url="https://example.com/page" title="Page title" description="One line." image="attachments/bm-7hq2.png" fetched=2026-01-12}`. The preview image is fetched once into `attachments/` and thereafter is an ordinary local file.
- **Embed** — leaf: `::embed{url="https://example.com/page" width=720 height=405}`. Dimensions are written by the resize handles.

If a fetch fails at creation time, the block degrades to Paste rather than being written in a broken state.

### 4.17 Image sizing

```markdown
![A diagram](attachments/diagram.png){width=640 height=360}
```

Attributes are written only when the image has been resized; an unresized image is plain markdown.

### 4.18 Inline date / reminder mention

```markdown
Ship it by :date[2026-02-01]{remind=2026-01-31T09:00}
```

- The bracketed text is the date in ISO form; a display format is a render-time preference, not stored per-mention.
- `remind` is optional and RFC 3339. Reminders fire as local OS notifications; no network involved. The Upcoming sidebar section is computed by scanning for these at render time, never maintained as a separate list.

### 4.19 Database view

```markdown
::database{folder="Projects" view=v_01937d33-9c02-77ba-b1e4-8f0a3d5c2e71}
```

- `folder` is relative to the vault root. `view` references a view configuration stored in that folder's `.scalenote-folder.json`.
- **Full-page placement** is the same directive as the only block in an otherwise empty note body, with `database_view: full` in that note's frontmatter. Inline placement is the same directive among other blocks. One mechanism, one syntax; placement is the only difference.
- A **Linked view** is an independent view configuration that happens to point at another folder — same directive, different `folder`/`view` pair. Nothing is duplicated.

### 4.20 Inline emoji

Literal Unicode. No syntax, no shortcodes — the picker inserts the character. A shortcode-style `:smile:` in a file is prose and is left alone.

---

## 5. Sidecars

All three are **serializations of a CRDT document**, not the source of truth for merging (see CLAUDE.md, "Document model"). All three are written atomically, and all three are keyed to the note by its frontmatter `id` rather than by filename, so a rename touches filenames only.

### `<Note>.canvas.json`

```json
{
  "format": 1,
  "note_id": "01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44",
  "background": { "pattern": "lines", "color": "#FFFFFF" },
  "strokes": {
    "s_01937d35-1f22-7d40-a6b1-2c3e4f5a6b7c": {
      "tool": "pen", "color": "#E71225", "thickness": 2.5, "opacity": 1,
      "z": 12, "bbox": [104, 220, 318, 291],
      "points": [[104,220,0.4],[106,224,0.5]]
    }
  },
  "objects": {
    "f_01937d31-2a55-7c10-8e99-0b4d2e7a1c63": {
      "kind": "frame", "x": 0, "y": 0, "w": 640, "h": 360, "rot": 0, "z": 1,
      "payload": { "label": "Diagram" }
    }
  }
}
```

Stroke points are `[x, y, pressure]`, pressure 0–1. Strokes are immutable: editing one deletes its key and inserts a new record.

### `<Note>.annotations.json`

```json
{
  "format": 1,
  "note_id": "01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44",
  "strokes": {
    "a_01937d36-7b31-7e55-9022-1d4c5e6f7a8b": {
      "block": "k3f9q2",
      "tool": "pen", "color": "#FFC114", "thickness_em": 0.18, "opacity": 1,
      "points": [[0.12, 0.44], [0.19, 0.46]]
    }
  }
}
```

Points are fractions of the anchor block's own bounding box, 0–1 on each axis. `thickness_em` is relative to that block's font size. `block` is a block ID within this note (§3).

### `.scalenote-folder.json`

```json
{
  "format": 1,
  "kind": "notebook",
  "icon": "glyph:book",
  "color": "#4A7FB5",
  "database": {
    "properties": [
      { "id": "p_01937d38-...", "name": "Status", "type": "status",
        "config": { "groups": {
          "todo": [{ "name": "Backlog", "color": "#849398" }],
          "in_progress": [{ "name": "Doing", "color": "#00A0D7" }],
          "complete": [{ "name": "Shipped", "color": "#008C3A" }] } } }
    ],
    "views": [
      { "id": "v_01937d33-...", "name": "Board", "type": "kanban",
        "group_by": "p_01937d38-...", "filters": [], "sort": [] }
    ],
    "assigned_ids": { "01937d2e-8f41-7a3c-9b22-5e1f0a6c8d44": 1 }
  }
}
```

Properties carry a stable `id` so renaming one doesn't orphan values. `assigned_ids` backs the `id` property type and its merge-collision rule (see CLAUDE.md). Absent `database` means an ordinary folder.

---

## 6. Wikilinks and tags

- **Wikilink:** `[[Note name]]`, `[[Note name|display text]]`, `[[Note name#block-id]]`. Resolved by name against the vault, matching Obsidian's behaviour, which is why no import step is needed for an Obsidian vault.
- **Tag:** `#tag`, `#nested/tag`. Not a directive; parsed inline from prose. A `#` followed by a digit is not a tag.

---

## 7. What ScaleNote writes into a foreign vault

Pointing ScaleNote at an existing Obsidian vault adds, over time: an `id` frontmatter key per note opened, block IDs on blocks that get referenced or annotated, `.scalenote-folder.json` in customized folders, sidecars beside notes with drawings, and `.scalenote/`. It never reads, writes, or deletes anything inside `.obsidian/`. The one-time compatibility notice must say what gets *added*, not only what doesn't carry over — a user who expected a read-only viewer deserves to know before the first save, not after.

Note that with the callout syntax in §4.2 and the wikilink syntax in §6, callouts and links do now interoperate with Obsidian in both directions. Dataview-style plugin queries still don't translate and are preserved as raw (§8).

---

## 8. Unknown and foreign syntax

**The rule: preserve, never drop.** Anything the parser doesn't recognize becomes a `raw` block holding its exact source text, byte-for-byte including whitespace.

- A raw block renders as a monospace box with a small "unrecognized syntax" marker and a disabled-looking treatment, so it's obviously not ScaleNote content.
- It is **not editable in block mode** (editing would require understanding it); it is editable in markdown source mode, where it's just text.
- On serialize it is written back exactly as it came in — not reformatted, not re-indented, not escaped differently.
- Raw blocks may be moved, duplicated, and deleted like any other block. Moving one does not alter its content.

This covers: unknown directive names, unknown attributes on known directives (preserved on the block and written back), raw HTML blocks, Dataview and other plugin query fences, MDX, unrecognized frontmatter keys, and anything a future ScaleNote version writes that this version doesn't know about.

**Forward compatibility.** Sidecars carry a `format` integer. A sidecar with a `format` higher than this build understands is not written to at all: the app opens the note read-only for that layer, says why, and preserves the file untouched. Silently downgrading someone's data is worse than refusing to touch it.

---

## 9. Required tests

These are correctness requirements, not nice-to-haves, and belong in Milestone 2 alongside the parser:

1. **Round-trip, both directions,** property-tested over generated documents covering every block type in §4, every nesting combination of containers, and every frontmatter key in §2.
2. **Idempotence:** `serialize(parse(serialize(doc)))` is byte-identical to `serialize(doc)`.
3. **Preservation:** a fixture file containing unknown directives, raw HTML, a Dataview fence, MDX, and unknown frontmatter keys round-trips byte-for-byte after being loaded, edited elsewhere in the document, and saved.
4. **Block ID stability:** editing, reordering, indenting, and "turn into" on a block with an ID leaves the ID unchanged; duplicating mints a new one; a note with hand-duplicated IDs repairs deterministically.
5. **Obsidian interop:** a small real Obsidian vault fixture opens, saves, and shows no diff beyond the additions listed in §7.
