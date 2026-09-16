<!-- Part of ScaleNote's spec. See CLAUDE.md for the document index and when to read this file. -->

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
