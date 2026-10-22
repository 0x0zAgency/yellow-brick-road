# Mint Studio releases in YBR Player

## One pre-mint setup, in Step 3

Run `npm run dev`. Mint Studio uses port 5173; the independent reference Player
uses port 4173. No third-party streaming SDK is involved.

1. In **Step 2 / Files**, attach a primary work, a separate Audio Preview, and any
   cover or lyric files. Encrypt locally as before.
2. In **Step 3 / IP and licensing**, review credits, Player permissions and the
   optional permanent content lock. Choose **Deliver approved copies to YBR
   Player automatically after mint** to consent to the local transfer of permitted
   preview/artwork/lyrics bytes and public release/file labels. This is unchecked
   by default. File, credit or permission changes require renewed approval.
3. Step 4 is a read-only policy/delivery summary plus network and NFT-cover review.
   Confirm the mint. Each applicable Brick receives its policy atomically with
   registration; the normal adapter verifies the receipt and on-chain state.
4. The browser then delivers the approved copies automatically. Receipts show
   **Ready in YBR Player** and an open link, not another permission/enablement panel.
   Sign in with the credentials on the development dashboard.

A local simulation can also deliver an explicitly approved demo preview, but it
never creates on-chain permissions. Real automatic delivery currently supports
Ganache 1337 only. Sepolia minting remains available without local delivery.

## Permission authority and private files

The **Brick**, not the Player database, is the authority for a real mint's Player
permissions. Publication, listing and media serving verify the current owning
Brick/controller, revision, role, SHA-256 and chain history. A recording grant
cannot authorize a separate visual or composition Brick. Revocations and changed
controllers/revisions continue to block access.

Only the **Audio Preview** supplies audio. A master is never a fallback. The
browser decrypts selected files using its existing ephemeral vault and checks
exact bytes before transmission. Masters, project binaries, recovery keys and
private packets are not sent. Associated filenames and creator-declared credits
are disclosed only under the Step 3 delivery approval.

Approval is volatile, not a stored application rights flag. It is bound to the
reviewed files, public labels and policy. Public NFT-thumbnail consent is separate:
a login-protected Player cover URL is not a public ERC-721 image.

## Delivery failures do not invalidate a mint

The confirmed mint is retained before delivery begins. An unavailable Player,
changed permission, unsupported response, cancellation or timeout is reported as
**Player delivery needs attention**, never as a reason to mint again. Use **Retry
Player delivery** to retry the same approved copies. Identical publication is
idempotent and does not submit another blockchain transaction.

The current browser vault is required. Do not refresh an active session without
saving its recovery backup. This change does not add cross-session re-publication,
recover old browser keys, or retroactively deliver old registrations. Recover
original files with the existing recovery tools, but do not mint duplicate Bricks
as a delivery repair.

## Formats and display

Audio supports browser-compatible MP3, WAV, OGG/Opus, M4A/MP4 audio, FLAC, WEBM or
AAC up to 32 MiB. Covers support validated PNG/JPEG/WebP up to 8 MiB. Lyrics support
UTF-8 TXT and WebVTT up to 512 KiB. Unsupported or oversized selected assets are
rejected during delivery review before the mint. Turn off that asset permission
or use a supported file. No format conversion or master fallback is performed.

The Player listening view contains only playable tracks, newest first. The Saved
uploads section stays hidden. Selected cover art appears on release/file cards;
plain lyrics are rendered as text, and WebVTT timing uses the browser's native
track support. No lyric timestamps are invented.

## Local transport and storage

Approved copies live unencrypted under `.road-local/player-releases/`, ignored by
Git. They survive restarts but remain subject to live rights checks. Local Player
accounts are a development access boundary, not production artist tenancy.

The existing same-origin loopback and CSRF-protected publishing endpoints are
reused: GET `/api/player-publish/config`, POST `/api/player-publish/releases`, and
DELETE `/api/player-publish/releases/:id`. The deletion API still withdraws local
copies; the former publication/removal form is no longer mounted in receipts.
Withdrawal cannot retract already buffered/downloaded bytes. No endpoint should
be exposed as a production upload service.

These copies do not enter the public `/road/api/music` catalog, grant commercial
or AI-training licenses, establish copyright title, or create payments. Existing
standards and on-chain policy checks are unchanged.

## Verification

Unit tests cover opt-in, source-bound review, unsupported inputs/networks, failed
or mismatched mints, delivery failure/retry, byte integrity and no master/key
publication. Real Ganache tests commit the policies, deliver automatically, retry
without duplicate uploads or new mints, and continue through revocation checks.
Chromium exercises Step 3 approval, automatic simulated delivery, authenticated
playback, artwork and lyrics, plus metadata edits that invalidate delivery consent.
