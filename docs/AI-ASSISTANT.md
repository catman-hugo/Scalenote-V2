<!-- Part of ScaleNote's spec. See CLAUDE.md for the document index and when to read this file. -->

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
