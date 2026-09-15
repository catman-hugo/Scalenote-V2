# ScaleNote

A local-first, offline note-taking desktop app combining ideas from Obsidian, Notion, AFFiNE, OneNote, and AppFlowy. Built with Tauri (Rust + TypeScript/React).

This is an experimental build carried out by an autonomous coding agent (gpt-oss:120b-cloud via Claude Code) as a capability test. There is no cloud sync, no account system, no telemetry, no network access at all. Everything lives in a local folder ("vault") on disk.

## Branding

This project reuses the name and logo from Previous ScaleNote — Ron's own earlier project, same owner, intentional rebrand rather than a fresh identity. Use the actual logo/icon assets from Previous ScaleNote's codebase directly (`apps/desktop/public/brand/rc5-logo.png` and the icon set under `apps/desktop/src-tauri/icons/` in that project) rather than generating new artwork — Ron will provide these files. Match the exact capitalization "ScaleNote" (one word, capital S and N), consistent with how Previous ScaleNote styled its own name in its build artifacts.

## Why these five apps

- **Obsidian** → local markdown files as the source of truth, wikilinks, backlinks, graph view, quick switcher, command palette.
- **Notion** → block-based editing, slash command menu, nested pages, simple databases/tables.
- **AFFiNE** → edgeless canvas mode per document, infinite whiteboard, freehand drawing.
- **OneNote** → notebook/section/page hierarchy, freeform ink and drawing.
- **AppFlowy** → sidebar workspace with spaces, kanban/board view, icons per page, theming.

## Tech stack

- **Shell / backend:** Tauri v2 (Rust)
- **Frontend:** React + TypeScript, Vite
- **Rich text / block editor:** Tiptap (ProseMirror), with markdown import/export
- **Drawing / canvas:** HTML5 Canvas + `perfect-freehand` for stroke smoothing (built in-house, not a third-party whiteboard SDK — see CLAUDE.md for why)
- **Local index/search/backlinks:** SQLite via `rusqlite`, rebuilt from the markdown files on disk if it ever goes missing or corrupt. This index is a cache, never a source of truth — nothing should exist only inside it.
- **Source of truth:** plain `.md` files with YAML frontmatter. Everything that counts as content has a visible, ordinary location on disk — a user (or a local AI agent with filesystem access) should be able to open the vault folder in any file browser and see everything that exists, with no opaque blobs standing in for real content. The exact syntax of every block type, and how block IDs are stored, is specified in `FORMAT.md` — that document, not this one, is authoritative for on-disk syntax. Concretely:
  ```
  MyVault/
    Meeting Notes.md
    Meeting Notes.canvas.json      ← present only if this note has edgeless-canvas content
    Meeting Notes.annotations.json ← present only if this note has draw-over-text ink
    Project X/                     ← a Folder, Notebook, or Section — same disk shape either way
      .scalenote-folder.json        ← present only if a custom icon/color/kind was set
      Some Note.md
    attachments/
      screenshot-2026-09-11.png
    .scalenote/
      index.sqlite                 ← regenerable search/backlink cache only
      crdt/                         ← per-note sync snapshots; see "What is authoritative" below
  ```
  - Every note carries a stable `id:` field in its YAML frontmatter — a UUID assigned once, on creation, never reassigned, never reused. This is what lets a note be renamed or moved without breaking its sync state, its annotations, or anything that references it. It is an ordinary, visible frontmatter line, not a hidden handle.
  - A note's edgeless-canvas layer is a plain JSON sidecar file next to its `.md` file. Draw-over-text ink is a *separate* sidecar — different semantics (anchored to blocks, not freeform-positioned) deserve a different file, not overloading one format for two purposes.
  - A folder's custom icon/color and its kind (plain Folder, Notebook, or Section) live in a small `.scalenote-folder.json` sidecar inside it — absent unless the user actually customizes that folder. A page's icon/color live directly in its own `.md` frontmatter, no sidecar needed.
  - Attachments live in a visible `attachments/` folder inside the vault, not hidden away.
  - `.scalenote/` holds regenerable caches and sync state only — never the only copy of anything. Deleting it is always safe: the search index rebuilds from the markdown files, and the CRDT snapshots rebuild from the current contents of each note. What you lose by deleting it is edit *history*, not content — see below.
  - Device-local secrets (identity keys, device certificates, 3DS pairing keys) live in the app-level config location alongside other settings, **not** in the vault. The vault is content; it gets synced, shared, and backed up, and secrets have no business travelling with it.
- **What is authoritative, and when:** `yrs` (the Rust port of the Yjs CRDT) backs every note while it is open, and is what real-time collaboration and clean offline merging are built on. To make that survive being closed, each note's CRDT state is written to a snapshot under `.scalenote/crdt/`, keyed by the note's frontmatter `id`. Each snapshot records a hash of the markdown it was last serialized from. On opening a note:
  - **If the hash matches the file on disk,** the snapshot loads and you get full merge history — two devices that both edited this note while offline will merge correctly when they meet.
  - **If the hash does not match** — the file was edited outside ScaleNote, by a text editor, a sync client, a script, or a local AI agent — **the markdown file wins**. The stale snapshot is discarded, a fresh document is built from the file's current text, and the event is logged and surfaced to the user. Nothing that was written to disk is ever silently overwritten by in-memory state.

  In short: the file is what exists, the snapshot is how well we can merge it. Losing the snapshot degrades merges to plain text reconciliation; it never loses a word you wrote.
- **All vault state is CRDT-backed, not just note text.** Canvas sidecars, annotation sidecars, and folder sidecars (including database schemas) each have their own document, so multi-device sync and the home server can carry drawings, ink, and database schemas correctly rather than leaving them to last-writer-wins. Strokes and placed objects are immutable records keyed by UUID, which merges cleanly by construction — see CLAUDE.md.
- **P2P transport:** `quinn` (pure Rust QUIC) for the direct connection between two peers — TLS 1.3 encrypted by default, single UDP port, no relay/TURN server, no STUN needed because in every supported discovery path (below) a reachable address is already known up front.

## Feature list

### Core (must work, must not crash)
- Create / open a vault (a folder on disk)
- Create, rename, move, delete notes and folders in a sidebar tree
- Block-based rich editing mode (Notion/AppFlowy-style) is the primary editing surface and the structure the document actually holds: headings, bullet/numbered/todo lists, toggle lists, quote, code block with syntax highlighting (see below for the exact look), callout, divider, table, image embed
- Markdown source editing with live preview (Obsidian-style), as an alternate view of the same note. The document's real structure is the block tree; source mode is that tree written out as markdown, exactly as it appears on disk, and edits made there are parsed back in as a single change when you leave the mode or pause. Two consequences, stated plainly rather than discovered: the round-trip between the two modes is lossless (guaranteed by `FORMAT.md` and tested as such), and **source mode is read-only while another person is connected to that note** — with a visible reason shown, not a silently disabled button. Character-by-character collaborative editing happens in block mode; raw markdown editing is a solo activity.
- Pasting a URL into the text prompts a choice of three ways to handle it (Notion-style): **Mention** (inline, compact — fetches the target page's title and shows it as the link text, with a small icon), **Paste** (leaves it as a plain pasted URL, no fetch, works fully offline), or **Embed** (a live, resizable view of the linked page). Images and Embed blocks share the same resize handles: 8 handles (4 edges, 4 corners), corners preserve aspect ratio, edges resize freely, and the resize follows the pointer directly with no lag — same direct-manipulation approach as the block gutter drag, not routed through a debounced state update.
- Slash command menu (`/`) to insert blocks, including `/canvas` to embed a live view into a region of the note's own canvas layer (see Canvas embed below)
- Additional block types beyond the core set above: four heading levels (not three), a Page block (embeds a sub-page inline, distinct from a lightweight page reference/link), Table of contents (auto-generated from the page's own headings), block and inline equations, a page-level Button (same local-actions-only rule as the database Button property — set a property, create a linked note, never arbitrary code), Breadcrumb (shows this page's location in the Notebook/Folder/Section hierarchy, derived straight from its file path), Tabs, Synced block (edit its content once, the edit shows up everywhere that block is referenced), toggle headings (collapsible), explicit 2–5 column layout blocks via slash command (in addition to the drag-to-column gesture described above), inline emoji, an inline date/reminder mention (uses a local OS notification, no network involved), general file attachments (into the vault's `attachments/` folder), and Mermaid diagrams (text-based diagram syntax, rendered entirely locally — no network call needed to draw a flowchart or sequence diagram).
- A fourth link-paste option, **Bookmark**, alongside Mention/Paste/Embed from earlier: a cached title, description, and preview image shown as a card — fetched once when created, same as Mention's title fetch.
- Block-level actions: copy a link to a specific block (an internal anchor within the note), duplicate, move to a different page.
- Import from other note apps, available from Settings: point ScaleNote at an export file or folder from another app and get real ScaleNote notes out, not a lossy dump.
  - **Obsidian:** not really an "import" at all, since both apps store vaults as loose markdown files — just point ScaleNote at the same folder. ScaleNote recognizes an Obsidian vault (a `.obsidian/` folder present) and shows a one-time "here's what carries over automatically and what doesn't" notice rather than silently assuming perfect fidelity: wikilinks already match ScaleNote's own syntax and just work, but Obsidian-specific syntax (callouts, Dataview-style plugin queries) doesn't translate on its own. ScaleNote never reads, modifies, or deletes the `.obsidian/` folder itself.
  - **Notion:** the user exports their own workspace from Notion first (Notion's own "Export all workspace content," as Markdown & CSV or HTML) — ScaleNote parses that local export file, never connecting to a Notion account or API. Exported CSVs (Notion databases) become ScaleNote databases, with property types translated where they genuinely match (Select, Status, Date, and so on). Honest caveat, not a promise of perfect fidelity: Notion's block model is the most complex of these to translate, so some manual cleanup after import should be expected, not treated as a bug.
  - **OneNote:** parses `.one`/`.onepkg` files directly — OneNote's own native format — fully offline, no Microsoft account or internet connection needed. Carries over formatting, lists, tables, tasks, tags, highlights, equations, images, attachments, internal links, and ink drawings — OneNote's ink strokes map directly onto ScaleNote's own canvas stroke data, so handwritten OneNote pages come across as real, editable ScaleNote drawings, not flattened images.
  - **Evernote:** parses `.enex` files — Evernote's own local XML export format, also fully offline, no account involved.
  - **Local-file-based only, deliberately never account/API-based** — the user exports or has their own local file first, in every case; ScaleNote never implements an OAuth flow or live API connection to pull from someone's Notion or Microsoft account directly. This matches this app's no-accounts design the same way every other import/export path in this spec does.
- Local file-format import beyond the named source apps above: Markdown/Text, CSV (into a database), Word (`.docx`), PDF (text extraction) — all local parsing, no accounts or cloud services involved.
- **Deliberately not included, and why:** any "Ask AI" action embedded in block menus, or AI-generated block types like "AI Meeting Notes" — these would duplicate, and sit in tension with, the single AI surface described later in this document (reachable from anywhere once enabled, but it is one surface, not several scattered ones). Dedicated embed integrations for specific third-party services (Figma, Miro, Jira, Slack, GitHub, Asana, Loom, and so on) — the generic Embed block already covers loading any of these via their ordinary public URL, and building per-service integrations would require OAuth/API keys for each one, which conflicts with the no-accounts design. Live, account-connected import from any source app (as opposed to the local-file-based import above) — same reasoning. Mentioning a person by name — same reasoning as the excluded Person database property; there's no persistent multi-user identity system here, only ephemeral per-session P2P peer identities. Text color and background color as block-level formatting options — considered and intentionally left out, not an oversight.
- Hover block gutter: a small handle appears to the left of the block under the cursor, for dragging to reorder and opening a per-block menu (delete/duplicate/turn into). Elongates to span the full height of the selection when hovering over multiple selected blocks (AFFiNE-style). Dragging highlights the whole block being moved, not just its text, and dropping on the left/right edge of another block creates a side-by-side column instead of reordering (Notion-style) — see CLAUDE.md for the exact interaction spec
- Draw-over-text annotation mode: a pen toggle in the toolbar overlays an ink layer directly on the block content — draw notes, arrows, or emphasis right over the text, not on a separate canvas. Each stroke is anchored to the specific block(s) it was drawn over (see CLAUDE.md for how), so the ink moves and scales together with the text — a note opened on a different screen or window size still looks right, because the drawing was never tied to absolute screen coordinates in the first place
- Wikilinks `[[note name]]` with autocomplete, and a backlinks panel per note
- Full-text search across the vault
- Command palette (`Ctrl+P` / `Cmd+P`) and quick switcher (`Ctrl+O`)
- Tags (`#tag`) with a tag browser
- Autosave (debounced) with atomic writes (write temp file, then rename — never overwrite in place)
- Dark and light theme

### Canvas / drawing (AFFiNE + OneNote)
- Per-note "edgeless" canvas mode toggle — freeform surface alongside the normal page
- A third **split** view: block editor and canvas side-by-side, resizable, in addition to the either/or block-mode/canvas-mode toggle
- Freehand pen/drawing tool with pressure-sensitive smoothing (perfect-freehand)
- Color picker for the pen and highlighter: a 3×5 grid of 15 preset swatches — exact colors below, not an arbitrary set — with a custom color picker beneath it, no "recent colors" row. The custom picker box spans the width of 3 swatches, using the same spacing as between swatches in the grid above it, so it reads as part of the same grid rather than a separate control bolted on underneath. See CLAUDE.md for the exact hex values, which must be reproduced precisely.
- Basic shapes (rectangle, ellipse, arrow, line), sticky notes, text boxes, free placement of images
- Lasso-select on canvas: freeform loop selection (not just a rectangle), evaluated live while drawing so items highlight as the loop passes over them (OneNote-style), with resize/move handles on the resulting group afterward — see CLAUDE.md for the exact interaction spec
- Canvas embed: `/canvas` in the block editor inserts a live, read-only view into a rectangular region ("frame") of the note's own canvas layer — edits made in canvas mode appear there automatically
- Canvas background pattern: Blank, Dots, or Lines — see CLAUDE.md for the exact colors/spacing, which must be reproduced precisely, not approximated
- Infinite pan/zoom canvas
- Undo/redo on canvas actions

### Identity & profile (not an account system)

This isn't a walk-back of "no accounts" — it's a clarification of what that always meant. "No accounts" means no third party ever verifies your identity or holds your data. It never meant you can't have a name, or that your own laptop and phone can't know they belong to the same person.

- **Your identity is a key pair you own.** The first ScaleNote install generates an account key pair, stored only on that device. Nobody issues it, nobody verifies it, nobody can revoke it but you. This is what other people's copies of ScaleNote recognize as "you."
- **Adding your own devices:** each additional device generates its own device key and is enrolled by a device you've already got — one shows a short code, the other enters it, and the enrolling device signs a certificate binding the new device key to your account key. From then on that device can act as you: sync your vault, receive your calls, request access to your home server. There's no server in this loop; it's two of your own machines agreeing over the local network or your tailnet.
- **Any enrolled device can enroll another**, so losing one device never locks you out of adding the next. The honest trade-off: this means your account key exists on each of your devices, so a device that falls into someone else's hands is a compromise of your identity, not just that machine. Any other enrolled device can revoke it, and the revocation spreads to peers as they reconnect — best-effort, because there's no central authority to ask.
- **Local username:** every install can optionally set a display name — self-declared, stored on your devices, never verified or stored by anyone else. This is what shows up to other people during P2P collaboration and in Created-by/Last-edited-by database properties.
- **Local password:** optional app-lock, not authentication — there's no server to authenticate against. If set, it gates opening the app on that device (useful on a shared family computer), and is stored (hashed) locally only. It is not encryption: the vault is plain files and anyone with access to the disk can read them regardless. The app says so where the setting lives.
- **Friend nicknames (private, local-only overrides):** trust and nicknames attach to a person's *account* key, not to a particular machine of theirs. Set a local nickname for anyone you've connected with and it follows them — to their new laptop, and through any number of display-name changes. This override is visible only on your device: if your friend Sam sets his own username to "Seal," you can privately label him "Sam" in your view, everyone else still sees "Seal," and Sam still sees himself as "Seal" — your nickname for him never gets broadcast to him or anyone else.

### Real-time collaboration (peer-to-peer, no server)

**Default port: UDP 57420** for all ScaleNote peer connections (both discovery-based and manual). Configurable in settings if it conflicts with something on a given machine. Chosen specifically to avoid common self-hosted service ports (Jellyfin, Sonarr, Radarr, Lidarr, Readarr, Bazarr, Prowlarr, Jellyseerr, Kavita, Nextcloud, Home Assistant, Pi-hole, Beszel, Syncthing, WireGuard, Tailscale itself, and generic ones like 8080/3000/9000).

Three ways peers find each other, no discovery step requires a central server:

- **Same LAN/Wi-Fi:** automatic, via mDNS — ScaleNote advertises and listens for a `_scalenote._tcp.local` service and lists other instances found this way in the sidebar.
- **Same Tailscale tailnet:** automatic, but via a different mechanism than mDNS — Tailscale is a mesh VPN and does not relay multicast/broadcast traffic between nodes, so mDNS alone won't find tailnet peers who aren't also on the same physical LAN. Instead, ScaleNote queries the local Tailscale client (via its local API / `tailscale status --json`) for the current tailnet's peer list, then checks each peer's Tailscale IP on the ScaleNote port to see if an instance is running there. If Tailscale isn't installed or running, this step is simply skipped — not an error.
- **Anyone else:** manual IPv4 entry. Type in their address, ScaleNote attempts a direct connection on the ScaleNote port. The other person is responsible for port-forwarding that UDP port on their router if they're not reachable directly (same expectation as any direct P2P tool) — ScaleNote doesn't attempt any NAT traversal beyond that.

Once any of the above finds a candidate peer:

- A connection **request** shows a confirmation prompt naming the incoming peer's address (and their declared display name, once connected) — no connection is accepted silently. This applies even to auto-discovered LAN/tailnet peers. Once a peer has been explicitly accepted at least once, reconnecting later doesn't re-prompt — the confirmation is for new/unrecognized peers, not for re-establishing a connection you've already trusted (this matters for a home server, below, which reconnects far more often than a one-off collaboration session).
- Live cursor and selection awareness — see the other person's cursor position and selection, labeled, updating in real time, the way AFFiNE and AppFlowy do it.
- Live text/block sync via CRDT (conflict-free — both people can type in the same note at the same time and it merges correctly, no "locked by other user" state).
- Presence indicator: who's currently connected to this note/vault.
- If the connection drops, editing continues locally without any interruption or data loss, and reconnecting re-syncs cleanly.
- Treat the remote peer as untrusted input at all times (see CLAUDE.md) — this is a direct connection to another person's machine, not a trusted server.

### Voice calls (peer-to-peer)

Calling another person to talk through a shared note or folder together — reviewing study material out loud, not a general chat app.

- **Transport reuses the existing P2P connection** — Opus-encoded audio as another stream over the same `quinn` QUIC connection already established for document sync, rather than adding a second protocol (WebRTC's own ICE/STUN machinery solves a problem — finding a reachable address — that doesn't exist here, since discovery/pairing already solved it).
- **1:1 and group calls**, scoped to whoever's currently collaborating on a note or a folder (including its subfolders/subpages) — call the person you're editing with directly, or call everyone currently active in a shared folder.
- **Incoming call UI**, Discord/WhatsApp-style: a call box in the bottom-left corner showing the caller's profile icon, their name (respecting a friend nickname if one is set — see Identity & profile above), "is calling," and green Accept / red Decline buttons.
- **Rings on every device the recipient is currently online on** (matching WhatsApp's behavior) — accepting on any one of them answers the call for that person.

**Advanced, phase two: multi-device audio routing.** The motivating case: calling from a phone because the PC has no microphone, but the phone's screen is too small to actually review the notes on. Once a call is active, let the person reassign which of *their own* currently-online devices is acting as microphone input and which is acting as speaker output — answer on the phone, then move the mic role to the phone and the speaker role to the PC, and keep the PC's large screen for actually reading the document. Mechanically: audio frames get relayed between the person's own devices over the same already-established local sync infrastructure (LAN/tailnet reach between their own devices, same as multi-device sync). This adds real latency when the mic and speaker devices differ from each other, which is an honest trade-off of the flexibility, not a bug to chase away. Build and prove out the basic single-device call first; this is explicitly a stretch capability layered on top, not part of the initial call feature.

### Multi-device sync (for your own devices, not collaborating with others)

Real-time P2P collaboration above is for working with *other people*. This is the separate question of keeping *your own* laptop, desktop, and phone in sync with each other. All three options below carry the whole vault — notes, canvas layers, annotation ink, folder sidecars including database schemas, and attachments — not just note text. They differ only in how much infrastructure they need:

- **Nothing extra:** your devices sync directly with each other exactly like the P2P collaboration above, whenever two of them happen to be online on the same network at the same time. Works, but both devices need to be reachable simultaneously. Because they're enrolled under the same account key (see Identity & profile above), they recognize each other without any pairing prompt.
- **Home server (recommended if you have an always-on machine):** designate one of your own enrolled devices as your home server — a machine that's usually on. This isn't a different sync system: it's the same `yrs` CRDT engine and QUIC connection already described above, just used in a hub pattern instead of live person-to-person editing. Configure it in Settings with a custom IP address and port (the same manual-entry mechanism as connecting to a peer outside your discovery range, just given a dedicated, persistent slot so it reconnects automatically rather than being a one-off). Each of your devices independently syncs with the home server whenever it's reachable; the CRDT merges correctly regardless of which devices were online when, so editing on your laptop while the server's down and having it catch up later works cleanly. This is the mode the persisted CRDT snapshots exist for — without them, "catch up later" would be text reconciliation rather than a real merge. A headless "server mode" build (no GUI, just the sync engine, meant to run unattended) is how this actually gets deployed on a homelab box — a Dockerfile, docker-compose.yml, and setup guide (including Proxmox-specific guidance: LXC-with-nesting vs. a small VM) already exist in `server/` in this repo, describing the target shape for that build. It's a deployment contract for a future binary, not a working server yet — see `server/SERVER.md` for the honest status.
  - **A home server can host more than one person's account,** cleanly isolated from each other. Nobody hands over a username/password to the server owner at all — access works the same way Jellyseerr handles new user requests: someone points their client at the server's IP and port and sends a request to use it, carrying their account public key and self-declared display name; the server owner's admin device gets a pending-request notification with green Accept / red Decline, exactly like an incoming call. Once accepted, that person's identity gets its own isolated space on the server — their content never mixes with anyone else's, and all of their enrolled devices are covered by the one approval, because approval attaches to the account key rather than to a machine. An **allowlist** lets the owner pre-approve specific people so they're never prompted again, and a **blocklist** silently auto-declines future requests from a specific identity without even surfacing a prompt — the actual mitigation for someone spamming fake requests: it costs the owner nothing to decline, and a repeat offender just gets blocked outright.
- **Third-party cloud folder sync (Nextcloud, MEGAsync, Google Drive, Dropbox, or similar), for anyone without a home server:** since a vault is just plain files, pointing your vault folder at a folder one of these tools already syncs works today with no integration work on ScaleNote's part at all — no APIs, no accounts added to the app itself. **Important limitation, stated plainly rather than glossed over:** a generic file-sync tool has no idea what a CRDT is, so it reconciles whole files. If you edit the same note offline on two devices, you get whatever that tool does with a real conflict — usually a last-write-wins overwrite or a "conflicted copy" duplicate that needs manual merging, not the clean automatic merge the P2P/home-server options give you. What ScaleNote does add here is honesty about it: because every note's sync snapshot records a hash of the markdown it came from, a file that changed underneath the app is *detected* rather than silently trusted — ScaleNote rebuilds from what's actually on disk and tells you the note changed elsewhere, instead of quietly overwriting the incoming version with stale in-memory state. This mode is a reasonable, genuinely free fallback, but it isn't equivalent to the other two — the app says so, not just this document.

## Organization (Notion + AppFlowy)
- Four creatable sidebar entity kinds, all from one "New" menu: **Notebook** (top-level grouping), **Folder** (ordinary nesting), **Section** (a lightweight grouping rendered with a colored accent bar rather than a folder icon — for things like grouping weeks/chapters without implying deep nesting), and **Page** (actual content). Nesting works the same as it does in a normal file browser — any of the first three can contain any of the others.
- Custom icon and custom color on **every** kind above, not just one of them — pick an emoji, or pick one of a small set of built-in simple monochrome glyph icons and tint it to any custom color via a real color picker (hex/RGB, not a fixed set of preset swatches), or upload a fully custom image as the icon. Emojis keep their natural appearance and aren't tinted; the color still applies independently as that entity's sidebar accent color either way. Icon and color are two independent, optional properties — set one, both, or neither.
  - When uploading a custom image as an icon, show two small preview swatches side by side — one on a light background, one on a dark one — so the user can confirm it actually reads clearly in both of ScaleNote's theme modes before committing, rather than finding out after the fact that it disappears in dark mode.
  - Uploaded custom icons can optionally be added to a small local icon library for reuse elsewhere in the vault, instead of re-uploading the same image every time.
  - The emoji picker includes a shuffle/random button for browsing, alongside search.
- Page **cover images** — a banner image at the top of a page, independent of its icon. Sources: a built-in Gallery of solid colors, gradients, and textures (bundled locally, no network needed), Upload (a local file), or Link (paste any direct image URL — a narrow, explicit, opt-in network fetch, same category as the Mention/Embed/Bookmark exceptions elsewhere in this spec — falls back cleanly if the URL doesn't resolve). Once set: Change (swap it for a different source), Reposition (drag to adjust which part of the image shows in the fixed-height banner), and Download (save a copy locally).
- Neither icon nor cover clutters a page that doesn't have one set. For a page with no icon and no cover yet, hovering near the top of the page (above the title) reveals a small "Add icon" / "Add cover" row — one hover away, not permanently visible chrome on every page. Once either is actually set, that row is gone for good on this page; the icon and cover are then edited through their own interactions (click the icon to reopen its picker, hover the cover for Change/Reposition/Download).
  - **Deliberately not included, and why:** a built-in Unsplash (or similar stock-photo service) search integration — this needs a third-party API and, typically, an API key, which conflicts with the no-accounts, no-cloud-integration design running through this whole spec. Link (paste any image URL) already covers "grab a photo from the web" without needing a dedicated stock-photo integration.
- Nested pages / sub-pages
- Workspace sidebar with collapsible sections ("spaces")
- Customizable sidebar: drag to reorder which sections appear (the main Notebook/Folder tree, Recents, Favorites, Tags, Upcoming, Shared, any pinned database views, and — only once AI is enabled in Settings — the AI panel), with an "Add section" picker to bring in ones that aren't currently shown, and a "Done" button to exit customize mode. Favorites (star/pin any note for quick access) and Upcoming (a local aggregation of notes with reminders set) are both new — not previously in this spec, worth having on their own merits, not just as customization filler. "Shared" here means notes with an active or past P2P collaboration session, not Notion's cloud-sharing concept.
  - **Deliberately not included, and why:** a "Chats" section (a cloud team-chat feature — there's no accounts or multi-user messaging system here), an "Agents" section (Notion's cloud AI agents — same reasoning as the already-excluded per-block "Ask AI" and "AI Meeting Notes": one scoped AI feature in Settings, not several competing ones scattered around the app), and a "Developer" section (API/integration settings that don't apply, and would conflict with the existing no-plugin-system non-goal).
- Database views (Notion-style, see the dedicated section below for full detail): a folder of notes can be viewed as a Table, a Kanban board, or a Calendar — all views of the same underlying notes and properties, switchable via tabs

### Graph & navigation (Obsidian)
- Local graph view (current note + its links)
- Global graph view (whole vault)

### Polish
- Distraction-free / zen writing mode
- Keyboard shortcuts documented in-app (`?` opens a shortcuts sheet)
- Export a note to `.md` (already native) and to `.pdf`
- Recently opened notes list
- Crash-safe: see `CLAUDE.md` stability rules — every one of the above features must degrade gracefully (visibly disabled with a tooltip explaining why) rather than crash the app if something about it fails.

## Settings

Two tabs: **General** and **AI**.

**General:** theme (light/dark), accent color (a real color picker, not fixed swatches — same picker used for entity colors elsewhere in the app), font size, editor width, sidebar width, default page mode for new pages (Blocks / Split / Canvas), pen button mapping for stylus-equipped devices (what the pen's dedicated eraser button and barrel button do — none / eraser / highlighter / pen). A **Connection** section shows current P2P discovery status (LAN/tailnet peers found, if any), the sync port (default 57420, editable), and 3DS pairing — generate a pairing code here for the companion 3DS client. No "server address" field and no account/sign-out section — there's no server and no accounts, so unlike Previous ScaleNote, this section only ever shows the user's own device's connection state, never an address to type in. An **Import** section is where the Obsidian/Notion/OneNote/Evernote/local-file import described above actually lives — pick a source, point it at a file or folder, review what will come in before committing. A **Diagnostics** section has a verbose-logging toggle and an "Open logs folder" button — see below for what actually gets logged.

**AI:** see the dedicated section below.

## Logging

Proper structured logging, not scattered debug prints — someone with code knowledge should be able to open a log file and actually troubleshoot an issue, especially since devtools are disabled in the release build (a security requirement above), which means a log file is the *only* way to see what went wrong in a shipped copy of the app.

- Timestamped, leveled (error/warn/info/debug/trace), one log file per run, written to the app-level config location (same directory as general app settings — OS AppData when installed, next to the executable when portable, per the portable/installed rule above), with rotation so old logs don't accumulate forever.
- Default level is info/warn/error in normal use. A verbose-logging toggle in Settings bumps this to debug/trace temporarily for troubleshooting, without needing a rebuild or a hidden config flag.
- Frontend errors and important events (an error boundary catching something, a failed sync, a failed AI-tab network call) get forwarded to the same log file via a backend call — not just logged to the browser console, which the user can't see in a release build.
- Never log actual note content, drawing data, the Ollama Cloud API key, or pairing secrets. Log identifiers, file paths, sizes, and counts instead — enough to diagnose a problem without the log file itself becoming a privacy or security liability.
- "Open logs folder" in Settings so a non-technical user can find and share the file without knowing where it lives on disk.

## AI assistant (opt-in, off by default, the one feature that needs internet)

Everything else in ScaleNote works fully offline by design. AI is the deliberate, narrow exception to that — and a second, equally deliberate exception to ScaleNote's normal defaults: it is **opt-in, not opt-out**, and it is invisible until a user turns it on. Until the master toggle in Settings → AI is switched on, there is no AI affordance anywhere in the app — no icon, no chat bubble, no menu entry, no keyboard shortcut that does anything, no suggestion. Settings → AI is the only place AI-related UI exists before that toggle is flipped.

### One surface, reachable from anywhere

Once enabled, AI shows up as a single dockable panel — not a button scattered into the editor toolbar, the database view, and the canvas separately. Open it with a keyboard shortcut (configurable; the panel can also be added to the sidebar like Favorites or Upcoming, once AI is on) and it's available no matter what you're looking at, because it reads context from whatever's active rather than being wired into any one view.

### What it can see, and the boundary around that

When the panel opens, it automatically pulls in the content of whatever's currently active — the note you have open, the rows and schema of a database view, or the text-bearing objects on a canvas (sticky notes, text boxes; it doesn't attempt to interpret freehand ink) — shown as removable chips you can see and take back out before sending anything. Nothing beyond that is included automatically.

Two ways to go further, both explicit:

- **Attach something:** drag a file or another note into the conversation. Text is extracted the same way the local-file importers already extract it (PDF, Word, plain text) — this is what replaces the old separate "Study Assistants" mode: uploading a textbook or a set of slides just means attaching it, and it's then part of that conversation's context like anything else you added.
- **Grant vault search:** a permission, off by default, in Settings → AI. When granted, the assistant can issue bounded search queries against your own vault mid-conversation — the same local index the app already builds for full-text search — and show you what it found. When not granted, it only ever knows what's in view or what you handed it directly. This is what lets it connect things across your notes rather than only answering about the one you happen to have open.

It never reads `.scalenote/` internals, device identity keys, or anything outside the vault — the same filesystem scoping that governs the rest of the app applies here too.

### Memory

The assistant can write durable facts — preferences, recurring context, decisions you've mentioned — to a dedicated `Memory/` folder in the vault, so it isn't starting cold every time. Each fact is a real note: small, with frontmatter for type, date, confidence, and which conversation it came from. This means memory is visible, editable, and deletable exactly like any other note, and it syncs (P2P, home server, cloud-folder fallback) exactly the way any other note does, because it *is* one.

A few things worth being specific about:

- **Extraction happens after a conversation, not live during it** — the model reviews what was said and proposes candidate facts once the panel is closed or the session goes idle. A conversation itself is never persisted as a note; only what gets extracted from it is. Keeping full transcripts as vault content would clutter search and the graph with conversational scaffolding, and it's the wrong shape for what memory is for.
- **A regex fallback catches obvious statements** ("my name is...", a clear preference) when no model is reachable, so memory doesn't just silently stop working.
- **Memory is atomic facts, not documents.** Retaining whole uploaded files is what attaching a file to a conversation is for, not this.
- **A periodic consolidation pass** merges near-duplicates and prunes low-value entries, so this doesn't grow without bound. `Memory/` is excluded from full-text search results and the graph view by default — it's still a real, editable, syncing folder, just not one that should clutter either of those surfaces — with a setting to include it if you want to.
- **Never stores secrets.** No passwords, API keys, or tokens, ever, even if a conversation mentions one — that content is flagged and skipped, not extracted.
- **Retrieval shows its work.** Only memories actually relevant to the current conversation are pulled in, found via local embedding search — never the whole store — and which memories got recalled is shown to you, not hidden.

### Local and cloud models

Settings → AI is where you turn AI on at all, choose local (Ollama) or cloud (Ollama Cloud) models, or configure both and pick per-conversation. The model catalog — Recommended / Browse Ollama / Browse HuggingFace / Ollama Cloud / Installed — computes fit against your actual detected hardware rather than showing static badges, same as before: CPU, RAM, and GPU/VRAM detected automatically, with plain-language warnings on every listed model (too small and likely to make things up, text-only, will be slow on this machine) rather than silence. HuggingFace listings are checked for a usable GGUF quantization before being offered.

**What leaves the device when Cloud is selected, stated plainly:** the message you send, every context chip currently attached to it, and any vault-search results pulled in during that turn. Nothing is sent anywhere until you actually send a message with a cloud model selected — turning the master toggle on, or opening the panel, sends nothing by itself. If Cloud is also the model handling memory extraction, the conversation content being summarized for that leaves the device too; a separate setting lets you keep extraction on a local model regardless of which model you're chatting with, so choosing Cloud for one doesn't quietly mean Cloud for the other.

You also set a system prompt here — a free-text instruction prepended to every context assembly, entirely under your control, not something the app adds silently.

### Deliberately not included, and why

There is one AI surface, not several. No AI affordance is embedded in block context menus, no "AI Meeting Notes" block type, no separate agents or automations elsewhere in the app — all of it goes through the one panel described above, gated by the one toggle. Dedicated per-service integrations are still out of scope for the same reason they always were: this app doesn't do OAuth or cloud accounts, and the generic Embed block and the vault-search tool already cover "pull outside information in" without needing either.

## Hover previews on menus

Any menu that presents a curated list of choices the user might not recognize by name — the slash command menu, the block "turn into" menu, the database "add property" type picker, the "add view" type picker — shows a small preview panel beside the highlighted item after a brief hover delay: a generic illustrative thumbnail plus a one-line plain-language description of what that choice actually does. This isn't derived from the user's real data (Notion's own previews are generic mockups, not a live preview of your actual content) — it just needs to answer "is this the thing I think it is" before committing to the choice. Applies consistently everywhere this class of menu appears, not just the slash command menu.

## Code block

One flat, uniform gray box (Notion-style) — no two-tone header-bar-plus-body split like some AI chat tools use. Within that single-color box: the detected language name in the top-right corner (not top-left), and a download-as-file button. Language is auto-detected from the code's content as it's typed or pasted; right-clicking the block opens a context menu to override the detected language manually if auto-detection guesses wrong. Downloading saves the block's content as a plain text file with the appropriate extension for its language (`.py`, `.rs`, `.go`, etc.), named after the block's language and, where available, some context from the note (e.g. a heading above it) rather than a generic `code.txt`.

## Database views (Notion-style)

A "database" here isn't a separate feature bolted on top — it's a folder of notes, viewed through a table/board/calendar renderer instead of a plain file list. This reuses the exact same storage already established (notes are `.md` files with frontmatter): a database adds a **property schema** for that folder (what properties exist, their types, and their option lists/colors for select-type ones), stored in that folder's `.scalenote-folder.json` sidecar, and each note's specific values for those properties live in its own frontmatter, same as any other note metadata.

- **Property types:** Text, Number, Checkbox, Date, Select, Multi-select, and **Status** — a distinct type from Select: it has three fixed groups (To-do / In progress / Complete) and each group can contain one or more custom-named, custom-colored values. This is what makes a clean progress-tracking column and a sensible default Kanban grouping possible without the user having to invent the "to-do/doing/done" structure themselves. Also: URL, Email, Phone (validated/typed text variants), Files & media (attaches into the vault's existing `attachments/` folder), Relation (link this row to a row in another database folder), Rollup (aggregate a value — count, sum, average — across a row's related rows via a Relation), Formula (compute a value from this row's other properties), Created time / Last edited time (read straight from the file's own filesystem metadata, no user input), Created by / Last edited by (meaningful once P2P collaboration is involved — shows which peer), ID (an auto-incrementing number scoped to the folder), and Button (triggers a small local action — set a property, create a linked note — no cloud automation involved).
  - **Deliberately not included, and why:** Person (would require a multi-user account system this app doesn't have), Place (needs a mapping/geocoding service — no offline story for that), and any cloud-integration property (Google Drive File, Figma File, GitHub Pull Request, Zendesk Ticket) — these all fundamentally require external cloud accounts, which conflicts with the point of this app.
- **Date properties** support: a plain date, an optional end date (for ranges), a date format choice, an optional time component, and an optional reminder.
- **Select/Status/Multi-select options** are edited inline from the cell itself — no separate modal. A dropdown lists existing options (create a new one by typing a name that doesn't exist yet), each option can be reordered via a drag handle and renamed/recolored via a small menu on the option itself.
- **Every row is a real page**, not just a table row — clicking a row opens a **side peek**: a panel sliding in from the side showing that row's properties and its actual page body (which can be edited right there, or the row can be opened in full like any other note). This is just that note's own file being viewed in a different pane, not a separate row-data structure.
- **View types, one set of underlying notes for all of them:** Table, Kanban/Board (grouped by a Select or Status property), Calendar (month grid, notes plotted by a Date property), Gallery (card grid — good for image-heavy folders), List (a compact single-column view, simpler than Table), Timeline (Gantt-style, using a Date property's range), Charts (bar/line/donut/number — simple local aggregate visualizations over the folder's properties, no data leaves the device), Form (a fillable form whose submission creates a new note in the folder), and Linked view (the same folder's database shown elsewhere in the vault with its own independent filter/sort, still the same underlying notes). Switching or adding views never duplicates or converts data — it's the same notes and properties rendered differently.
  - **Deliberately not included, and why:** Dashboard and Feed views (real added complexity with no clear use case for a note-taking app), Map view (same network-dependency problem as the Place property), and Synced Databases pulling from GitHub/Asana/GitLab (cloud integrations, same reasoning as the excluded property types above).
- **Inline vs. full-page:** a database view can either be embedded inline within a normal note's content (alongside other blocks) or take over an entire page as that page's whole content — both are the same underlying mechanism, just a difference in how much of the page it occupies.
- **Adding a property** adds a new column to the schema (and by extension, a new optional frontmatter field on every note in that folder); properties can be added, renamed, retyped, or removed from the schema at any time, and existing note frontmatter is updated accordingly rather than left orphaned.

## Build targets

- **Now:** Linux `.deb` first, ahead of the Windows build — development is happening on Linux Mint, so this is the target that can actually be run and tested directly on the dev machine, rather than needing a Windows box or a VM to verify anything. Build via `tauri build` on the Linux target.
- **Now, right after `.deb`:** Windows, offered as two artifacts from the same codebase — a standard installer (`.exe` via NSIS, installs to Program Files, adds a Start Menu shortcut and uninstaller) and a **portable** build (a ZIP containing just the executable and its resources, no installation, no registry writes — the app detects a sentinel file next to the executable at startup and, if present, stores all app-level config next to the exe instead of the OS's per-user AppData folder). Vault location is unaffected either way — a vault is just a folder the user points the app at, same in both modes. Since this can't be run directly on the Linux dev machine, verify it via cross-compilation output plus either a Windows VM or a second machine before considering it actually done, not just "it compiled."
- **Later:** Android client (Tauri v2 supports Android as a build target from the same Rust core and React frontend, via `tauri android init` / `tauri android build`). Not part of this build — do not start on it now. Worth keeping in mind while building: avoid anything in the frontend or Rust core that's inherently desktop-only (e.g. assuming a filesystem picker dialog exists in its desktop form, assuming a mouse/hover-only interaction for the canvas) if it costs nothing to avoid now, since it'll make the eventual Android port smoother. Don't spend time actively engineering for it yet.
- **Later:** a companion New 3DS/2DS homebrew client (devkitARM + libctru + citro2d, separate codebase entirely — this does not run on Tauri). Draw-only: captures stylus strokes on the touchscreen, stores them locally on the SD card in the same stroke schema as the desktop canvas, and syncs to the desktop app over LAN when on the same Wi-Fi/hotspot. Ship as `.3dsx` first for testing via the homebrew launcher, `.cia` (via makerom/bannertool) only once the `.3dsx` is proven working. See the dedicated section below for the sync design. Not part of this build — do not start on it now.
- **Later, needs a design decision:** Docker doesn't naturally fit a desktop GUI app, but now has a concrete motivating use case and a concrete deployment scaffold: a headless "server mode" build for running the Home server (see Multi-device sync above) unattended on a homelab box — see `server/Dockerfile`, `server/docker-compose.yml`, and `server/SERVER.md` for the target shape, including Proxmox-specific guidance. These files describe what the future `scalenote-server` binary needs to satisfy; that binary doesn't exist yet. Do not attempt to build it in the current session — but do structure the sync engine as a separate library crate now (see CLAUDE.md) so building it later doesn't require reimplementing anything.

## Companion 3DS client (future, design only for now)

A separate homebrew app for New 3DS/2DS hardware (tested target: New 2DS XL running Luma3DS CFW) — not a port of the Tauri app, a standalone native client using devkitARM/libctru/citro2d, the same toolchain family as prior 3DS homebrew work.

Deliberately narrow scope: **navigate between pages, add new pages, and draw. That's the entire interactive surface — drawing is the only form of editing available on this client.** The 3DS never renders or edits a page's text/block content at all, only its title (for the list) and its canvas/drawing layer. This keeps the client genuinely simple to build and light on this hardware, rather than a scaled-down attempt at the full editor.

- **Page navigation:** a simple list of page titles, navigable via D-pad/circle pad or touch tap — no rich text rendering needed, just a label list.
- **Add page:** creates a new blank page. Default to an auto-generated name (e.g. a timestamp) so this is a single button press; optionally let the user type a title via the on-device software keyboard (`swkbd`) if they want one, but never require it. New pages land in an unsorted area on the desktop side by default — the expectation is the user files them into the right place on the laptop later, the 3DS isn't responsible for organizing them.
- **Drawing:** touchscreen + stylus, same `VectorStroke` schema as the desktop canvas — this is the only editable content on this client. The touchscreen reports position only, not pressure — approximate stroke-width variation from point-to-point drawing speed, and be upfront in the UI/docs that this is an approximation, not true pressure sensitivity.
- **Shared sync core:** use `ctru-rs` (the community Rust toolchain for 3DS homebrew) so `yrs` can run on the 3DS too. This client needs only the canvas-layer document and the page title list — never the full block/text document — which is a small fraction of what the desktop carries, and is why this is feasible on this hardware at all. The canvas document being a CRDT of immutable UUID-keyed strokes (rather than a file the 3DS would have to overwrite wholesale) is what makes bidirectional, offline-tolerant drawing sync possible here; that decision is made in the desktop app's Milestone 4, not deferred to this client.
- **Local storage:** SD card, same canvas schema as the desktop, so no translation layer is needed for local storage or sync.
- **Discovery:** a lightweight UDP broadcast beacon on the LAN (not full mDNS — not practical on this toolchain) to find a running ScaleNote desktop instance on the same network.
- **Pairing (one-time):** the desktop app shows a short pairing code in settings; entered on the 3DS via the software keyboard. The code also carries the desktop's self-signed TLS certificate fingerprint, so the 3DS can trust that specific instance without a real CA.
- **Sync transport:** the desktop app runs a small LAN-only HTTPS server with a self-signed cert; the 3DS connects over real TLS via the system SSL service — the same mechanism already proven working for HTTPS calls to a media server on this hardware in a prior 3DS homebrew project. No unencrypted fallback.
- **Sync direction: bidirectional and live**, scoped to page titles and canvas content only. When both the desktop app and the 3DS client are open and on the same network, new pages and drawing changes on either side propagate to the other automatically. When one side is offline, edits queue locally and merge cleanly via the CRDT once both are back on the same network.
- **No hardcoded server address ever** — the 3DS only ever knows about a desktop instance through discovery + pairing, never a typed-in or baked-in IP (see the general security rule above; a 3DS's connection to a specific desktop is established once via the pairing code, then re-discovered by broadcast on each subsequent session since a DHCP-assigned LAN IP can change).

## Running it

```
npm install
npm run tauri dev      # development
npm run tauri build    # produces the Windows installer/exe in src-tauri/target/release/bundle
```

## Non-goals for this build

- No cloud sync, no accounts, no telemetry, no analytics, no auto-update pinging a remote server
- No central server of any kind, including for collaboration — peer-to-peer only
- No plugin system / third-party extension marketplace
- No mobile app in this build (Android is a planned future target — see Build targets)
- **No live multi-cursor drawing UI in this build.** The canvas *data model* is CRDT-backed from the start, the same as note content — strokes and placed objects are immutable records keyed by UUID, which merge cleanly by construction, and canvas content does sync between your own devices and to a home server. What's out of scope for this pass is the real-time drawing *experience*: seeing another person's cursor while they draw, streaming an in-progress stroke, and resolving simultaneous selection or transform of the same objects. The storage is ready for it; the interaction isn't being built yet.

See `CLAUDE.md` for the agent's operating instructions, coding standards, and security/stability requirements, and `PROGRESS.md` for the live status of every feature above.
