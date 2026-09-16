<!-- Part of ScaleNote's spec. See CLAUDE.md for the document index and when to read this file. -->

## Logging

Use `tracing` in Rust (with `tracing-appender` for a rotating, non-blocking file writer) rather than ad-hoc `println!`/`console.log` scattered through the codebase. This matters more than it would in a typical app because devtools are disabled in the release build — a log file is the only diagnostic surface a user or a future developer has once the app is actually shipped.

- One log file per run, in the app-level config location (same place as general settings — see the portable/installed rule elsewhere in this spec), with rotation so files don't accumulate unbounded.
- Every entry: timestamp, level, the module/component it came from, a message, and structured fields for anything relevant (a note ID, a peer address, a file path, a byte count) — not just a free-text string with no context.
- Default level is info/warn/error. The verbose-logging toggle in Settings switches to debug/trace at runtime, no rebuild needed.
- Frontend errors must reach this same log file, not just the browser console — wire error boundaries and any caught-but-notable failures (a failed sync, a failed AI-tab request) through a Tauri command that writes into the Rust-side log.
- Never log note content, canvas/drawing data, the Ollama Cloud API key, or pairing secrets — log identifiers, paths, sizes, and counts instead. A log file that leaks the very content it's supposed to help debug around is a privacy problem, not a diagnostic tool.

## Security requirements (non-negotiable)

- The app must work fully offline, with three explicit, narrow exceptions: the AI assistant (see AI-ASSISTANT.md — invisible and inert until explicitly enabled, and even then silent until acted on), the Mention/Embed/Bookmark link-paste options (which fetch a page title, description, or preview, or load a live preview — "Paste" as a plain URL requires no network and always works offline), and Link-sourced page cover images (paste an image URL, fetched once and then stored locally like any other attachment). Every other feature (notes, canvas, search, sync, collaboration, everything) makes zero network requests, ever. Do not add remote fonts, remote scripts, or CDN references anywhere in the frontend or backend outside these scoped exceptions.
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
