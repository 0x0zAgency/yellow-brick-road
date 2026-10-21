# Mint Studio releases in YBR Player

## Use the files already uploaded in your browser

Start the existing integrated app with `npm run dev` from the repository root or `web/`. Mint Studio runs on port 5173 and the separate YBR Player on port 4173.

1. Attach a Master Recording and a separate Audio Preview, cover artwork, and lyrics in Mint Studio. Complete the simulated mint or an actual test-chain mint.
2. In **Mint results**, find **Your release / YBR Player**. The Player uses only the Audio Preview. A master is never a fallback.
3. Choose whether to include the cover and lyrics. Confirm permission to share the selected copies and release/file labels with local Player users, then select **Add release to Player**.
4. Open the release in YBR Player and sign in with the credentials printed by the integrated launcher. Its library also refreshes every five seconds while visible, without restarting playback.

There is no second file-picker/upload step. Mint Studio decrypts only the selected already-attached files locally using the existing browser vault, verifies them against the reviewed source hashes, and sends the consented preview copies to the local Player. The key, recovery backup, private packet and project binaries are never sent.

**The browser session must still contain the uploaded files and encryption key.** Old encrypted IPFS registrations are not automatically decrypted or republished. For a closed/lost browser session, use the existing Recover files workflow to recover your originals and attach them again. No new decryption tool is added.

## What the Player displays

The collection includes three distinct kinds of entry: built-in synthetic demos, actual chain-authorized public Road tracks, and explicitly shared **DEMO UPLOAD** releases. A supplied mint address in a local preview is an unverified reference, not a verified playback license. This distinction remains visible in the inspector and API.

A release cover is displayed in the library thumbnail, now-playing bar, inspector, and every associated-file card. One stored image supplies all those views. Creator-declared recording, cover and songwriting credits are shown together. Missing or unavailable cover images retain the YBR fallback.

Plain UTF-8 `.txt` lyrics appear as text, never interpreted HTML. Timed `.vtt` lyrics use the browser's native WebVTT metadata track, highlight the active cue, and support clicking a line to seek. We use the existing [W3C WebVTT standard](https://www.w3.org/TR/webvtt1/), not a new YBR timing format. We do not invent timestamps for plain lyrics.

Project files and other associated originals can appear as labeled records with the same cover, but their bytes are **not** shared. Only selected audio, artwork and lyrics are copied.

This change concerns the Player and its release/file views. It does **not** rewrite ERC-721 `tokenURI` or replace the existing registration token's on-chain default artwork. A wallet-visible token cover needs a separately authorized publicly retrievable image and an appropriate receipt-contract update; a login-protected Player URL must not be advertised as a public token image.

## Supported preview inputs

- Audio: MP3, WAV, OGG/Opus, M4A/MP4 audio, FLAC, WEBM or AAC, up to **32 MiB**. Actual decoding depends on the browser; supply a browser-supported MP3/WAV Audio Preview.
- Cover: PNG, JPEG or WebP, up to **8 MiB**. SVG and HTML are rejected, and declared media types must match the image signature.
- Lyrics: UTF-8 TXT or WebVTT, up to **512 KiB**. DOCX, PDF and LRC are not parsed by this version. They can remain associated evidence without being shared as display lyrics.

The adapter bounds the request, validates checksums and sizes, and stores at most 100 local preview releases. Repeating an identical publication reuses the same release ID. Changing selected assets or metadata creates a new preview version.

## Local copies, permissions and removal

Shared copies are stored under `.road-local/player-releases/`, ignored by Git. They survive Player restarts and are **unencrypted local preview copies**. Anyone using a valid account on that local Player can view them. This is not per-artist production access control.

Use **Remove local preview copies** in the Mint Studio publication panel to withdraw that preview. The original encrypted uploads, IPFS pins, mint receipts and contracts are untouched. Withdrawal denies subsequent requests and removes the entry on library refresh, but cannot retract bytes already downloaded or buffered.

The publishing endpoints use same-origin loopback checks and an unpredictable per-process CSRF token. They are development-only and must not be exposed as a production upload service. Player artwork and lyrics require the normal Player session; audio additionally requires playback authorization. Tampered stored media fails its checksum check. No arbitrary remote URL is fetched.

The public `/road/api/music` catalog is unchanged: private local previews are **not** inserted into the chain-authorized public catalog. Decryption and local sharing do not create a public streaming license, copyright title, verified play, royalty balance, or payment.

## API / implementation

`GET /api/player-publish/config` and `POST /api/player-publish/releases` are proxied by the main web app to the Player. The latter requires `X-YBR-Publish-Token` and explicit sharing consent. `DELETE /api/player-publish/releases/:id` withdraws the selected local preview.

Player discovery uses the existing authenticated `/api/bricks` endpoint. The local adapter adds `source: "studio-demo"`, a release-level artwork reference, optional plain/WebVTT lyrics and associated-file records. This is an internal demo adapter, not a replacement for YBR metadata, PROV-O, C2PA or music-industry standards.

Tests cover the existing browser vault-to-preview flow, refusal without consent, source-checksum verification, safe media types, no key serialization, local-origin/CSRF protection, authenticated media access, byte-range playback, library persistence, idempotency, withdrawal, and real Chromium upload/playback with shared cover art and synchronized WebVTT lyrics. Existing Ganache and IPFS integration workflows continue separately.

## Preview-only playback

The Audio Preview slot is the sole playback source for uploaded releases. A supported Master Recording is never a fallback. Missing or unsupported previews leave **Add release to Player** disabled with instructions to attach an Audio Preview. The browser adapter will not read/decrypt the master for playback; the server independently rejects a non-preview source declaration or an associated-file list that shares a master. Masters and projects can still appear as unshared file labels with the release cover.

Legacy local demo publications marked as playing the master are no longer listed or served; their local files are not silently deleted. Re-publish with an attached Audio Preview or explicitly remove the old record. This does not alter the separately authorized synthetic Ganache fixture, commercial licenses, or encrypted IPFS sources.
