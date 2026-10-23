# Compact creator views

## Mint Results

The result summary shows a thumbnail, work title, batch counts and explicit
simulation/verified/incomplete state. **Customize NFT appearance / tokenURI** sits
above the individual receipts. The primary button opens and focuses that section.
Artwork consent and the wallet-signed update remain separate from playback rights.
Nothing is published merely by rendering a thumbnail. A verified earlier artwork
transaction does not disable choosing a replacement cover; a pending/uncertain
transaction still blocks resubmission. Replacement artwork requires fresh consent.

Receipt cards initially show the title, role, status and abbreviated identifier.
**Copy All** still copies the full human-readable receipt. Expand **Receipt details
& wallet import** for complete NFT contract/token IDs, Brick IDs, transactions,
blocks and gas values. JSON export and private recovery backup remain prominent.
Encrypted storage details and local demonstration downloads have their own
collapsed section. Incomplete transactions and artwork errors are not hidden.

A thumbnail labeled **Local preview** or **Release preview** is a browser-only
rendition of the attached artwork, not evidence that an NFT was updated. Only a
verified cover result gets the NFT-cover label. No-public-cover and retrieval
failures have explicit placeholders. The metadata name can still be Yellow Brick
Registration. This change does not customize titles or other tokenURI fields.

## My Bricks and the live IP Registry

Both use thumbnail-led cards, collapsed chain details and pages of 12 records.
My Bricks keeps NFT customization, policy editing and encrypted-file recovery.
The Registry keeps search, creator filtering, refresh and offline/partial-scan
warnings. Public playback links appear only on records reporting public playback.
Missing or encrypted labels are not guessed or decrypted for display.

Public covers are read from the actual collection's inline tokenURI, checked
against the expected factory, Brick address, token/IP identity and receipt holder,
at a consistent block. Thumbnail reads are lazy and limited to three concurrent
jobs. They request no account access, wallet signature, mint or policy change.
The Registry uses only its configured loopback RPC; My Bricks uses its existing
wallet connection. Full identifiers remain available inside expanded details.

The narrow GET `/api/road-ipfs/nft-cover/:cid` route reads only a locally pinned,
normalized PNG, at most 512 KiB and 512x512 pixels. It retains bridge Host/origin
checks and refuses encrypted containers, SVG, source metadata, paths and query
parameters. It is not a generic IPFS or external-URL proxy. Public covers outside
this local pin store can show a placeholder; this is not an availability promise.

## Verification

Unit tests cover honest batch counts, accepted thumbnail URLs, metadata identity
bindings, chain changes/reorgs, bounded PNG reads and local request boundaries.
The Ganache/Kubo smoke exercises the same read helper and PNG route against real
local contracts and pins. The browser regression mounts the actual React views
with explicitly mocked RPC/image responses, checks compact controls, copy values,
pagination, search, offline states and mobile overflow, and captures screenshots.
The existing Mint Studio browser workflow checks local thumbnail preparation
through actual browser encryption and the simulated-mint flow.

No contracts, permission models, storage profiles, private keys or existing mints
are changed. Save active recovery backups before reloading the updated app.
