# NFT images and uploads after switching a Ganache mnemonic

These are separate state transitions. Restarting an application neither assigns
NFT artwork nor transfers permissions to a different chain history.

## The NFT still displays the yellow square

The receipt's `tokenURI` returns inline JSON. Its `name` is still **Yellow Brick
Registration**; its `image` determines the artwork. An `ipfs://...` image is a
published cover. An embedded yellow-square SVG is the fallback, not an IPFS
retrieval error. A cover shown in the Player does not prove the NFT image was set.

For a new real mint, **Review mint > Preview cover for NFTs** prepares the attached
artwork locally. Inspect it, then explicitly approve public publication. The mint
workflow checks collection support before uploading, pins the reviewed thumbnail,
registers the Bricks, and requests one additional `setCovers` transaction. Success
requires reading the actual `tokenURI.image` back. NFT-cover consent is independent
of encrypted-IPFS upload and Player-preview permissions. Without public-cover
consent, the yellow-square fallback remains intentional.

Rejecting the artwork signature does **not** undo completed mints. Receipts say
that artwork still needs attention, preserve the public pin and any submitted
transaction hash, and offer the existing cover editor. Do not mint duplicates.
A pending/uncertain transaction is not automatically resubmitted.

For existing supported NFTs, use **My Bricks > Set or update NFT cover**. Select
**Inspect actual NFT metadata** to read their current image without signing or
publishing. Apply a public cover there if needed. The metadata inspector distinguishes
actual fallback artwork from an already-set cover. Wallet cache/gateway issues
matter only after the actual image has changed; local pinning still does not
promise worldwide reachability.

Collections deployed before `artworkVersion() == 1` have immutable, fixed artwork.
This frontend improvement cannot rewrite them. It does not deploy a new factory,
migrate, remint, reset Ganache or delete anything. The previous one-time factory
upgrade requirement for future mints is documented in `NFT_COVERS.md`.

## Recent uploaded previews disappeared after changing the mnemonic

The mnemonic control selects an **isolated persistent chain profile**, not a key
rotation on the old chain. Bricks and their permissions stay on their original
chain. Local Player preview copies stay in `.road-local/player-releases/`.

Previously, permission-filtered uploads were silently omitted. The Player now
shows a separate **Saved uploads** inventory, newest first. It retains descriptive
metadata and original chain references when a preview cannot be played. Badges
and explanations distinguish another chain history, another factory, older uploads
without policy proofs, changed permissions, and unavailable verification.

The normal **Playable tracks** list still contains only eligible playable tracks.
Unavailable inventory entries have no media URLs or play actions. Authorization,
audio, artwork and lyrics endpoints still enforce live permissions. Merely seeing
a saved title does not grant access. A mnemonic switch never reauthorizes an old
preview or changes its controller, revision or file commitments.

To return to the original default chain, use dashboard **m > d**, type **SWITCH**,
then run `npm run dev`. For a previous custom profile, use **m > i** with that
profile's original disposable test mnemonic. Enter seeds locally, never into chat.
The selector stores only the currently selected mnemonic; keep local backups of
custom test phrases needed for return visits. See `GANACHE_WALLETS.md`.

Reload the Player and sign back in after restarting it. Select the corresponding
test account in your wallet. Mint Studio now warns when its saved local factory
differs from the startup factory and offers **Use startup factory**; it never
silently overwrites a saved selection. Do not reset chain storage to fix visibility.

A work that was only minted, without the separate **Add release to Player** action,
has no saved playable preview here. Its registration belongs in the IP Registry.
Older local releases without current on-chain policy proofs remain blocked rather
than being silently converted into unrestricted demo playback.

## Verification

Tests cover source-bound public-cover consent, rejected and uncertain artwork
transactions, actual mint-plus-cover orchestration on Ganache/Kubo, read-only
metadata inspection, authenticated metadata-only saved inventories, denied media
routes and restoring playback through the original real chain. Browser regressions
exercise pre-mint thumbnail review and the separate saved-upload view. The browser
wallet is mocked; the separate integration tests use real disposable Ganache.
