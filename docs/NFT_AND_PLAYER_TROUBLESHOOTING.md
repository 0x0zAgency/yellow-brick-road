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

The Player shows only eligible **Playable tracks**, newest first. The entire
**Saved uploads** section and its counts are hidden, including after refresh,
sign-in or a chain-profile change. Its former UI area is reserved for future
playlists and library tools; no playlist feature or visible placeholder is added.

Saved preview files, descriptive metadata, original chain references and the
existing authenticated diagnostic metadata remain intact. Hiding the section
does not delete or migrate uploads. Authorization, audio, artwork and lyrics
endpoints still enforce live permissions. A mnemonic switch never reauthorizes
an old preview or changes its controller, revision or file commitments.

To return to the original default chain, use dashboard **m > d**, type **SWITCH**,
then run `npm run dev`. For a previous custom profile, use **m > i** with that
profile's original disposable test mnemonic. Enter seeds locally, never into chat.
The selector stores only the currently selected mnemonic; keep local backups of
custom test phrases needed for return visits. See `GANACHE_WALLETS.md`.

Reload the Player and sign back in after restarting it. Select the corresponding
test account in your wallet. Mint Studio defaults to the running Ganache factory for the launcher's
loopback RPC on chain 1337. The **Use running Ganache factory (automatic)**
option follows the current startup address instead of a stale browser value.
Turn it off to use a manual factory. Manual addresses are retained separately;
Sepolia, other RPC ports and other chain IDs never inherit this local default.
A changed effective factory cancels an open mint confirmation, and ordinary
on-chain contract/history verification still runs before signing. Do not reset
chain storage to fix visibility.

A work minted without Step 3 automatic Player delivery approval has no newly
delivered playable preview. Older registrations are not retroactively delivered.
Their registrations remain in the IP Registry.
Older local releases without current on-chain policy proofs remain blocked rather
than being silently converted into unrestricted demo playback.

## Verification

Tests cover source-bound public-cover consent, rejected and uncertain artwork
transactions, actual mint-plus-cover orchestration on Ganache/Kubo, read-only
metadata inspection, authenticated metadata-only saved inventories, denied media
routes and restoring playback through the original real chain. Browser regressions
exercise pre-mint thumbnail review and ensure the saved-upload section remains
absent across refreshes, sign-in and profile changes. The browser
wallet is mocked; the separate integration tests use real disposable Ganache.

## Player permissions are chosen in Step 3

Choose Audio Preview playback, artwork display and lyrics display alongside the
rights assignments in **Step 3 / IP and licensing**. Missing or still-hashing files cannot receive
a grant. Step 4 presents a read-only summary with **Edit permissions in Step 3**.
The existing `deployBrickWithPolicy` mint commits each applicable permission, file
commitment and optional permanent content lock on the Brick in the same transaction
as registration. The mint adapter reads those fields back to verify the result.
The local Player database stores delivery copies and references, not authority to
override an on-chain grant. Delivery follows the explicit Step 3 approval
automatically; it cannot make a denied preview playable or expose masters/project files.
Simulation does not write any policy to a blockchain. No contract upgrade or new
factory deployment is introduced by this UI change.

Player delivery approval is now collected in Step 3 and executed automatically after
mint confirmation. The old Your release / Add release to Player form is removed.
A failed delivery preserves the confirmed mint and offers Retry Player delivery.
See `PLAYER_STUDIO_RELEASES.md` for the current workflow.
