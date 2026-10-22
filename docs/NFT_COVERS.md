# Actual registration NFT covers

The receipt contract previously returned `defaultImage()` unconditionally. A cover
shown in the Player or stored in an encrypted artwork Brick was never used by the
NFT's `tokenURI`. Wallet refresh alone cannot fix that contract behavior.

## What is implemented

Newly deployed `YellowBrickReceipt` collections implement owner-controlled
`setCovers(uint256[],string)` (up to 32 receipts in a transaction). ERC-721
`tokenURI` remains self-contained JSON, but its standard `image` property now uses
the public `ipfs://<CID>` cover when one has been assigned. Otherwise the yellow
square remains a truthful fallback. `artworkVersion()` is 1. ERC-4906's interface
ID and `MetadataUpdate` events let compatible indexers notice changes.

The receipt holder, not an approved operator or protocol administrator, changes
the display. This does not change the Brick controller, private metadata URI,
content or metadata commitments, receipt identity, nontransferability, rights,
royalties or ownership claims. It is a cover presentation, not proof of copyright.

## Creator workflow

After a **real confirmed mint**, the results page has **Actual NFT / ERC-721
artwork**, separately from the Player preview controls. It is available even
without a playable Audio Preview. Select **Prepare NFT cover** to use the attached
artwork from the current browser vault, or select another PNG/JPEG/WebP file.
Inspect the display copy, approve public publication, and select **Publish cover
to NFTs**. Approve the separate gas-paid transaction in your wallet. One transaction
updates the batch's existing receipt tokens; no additional Bricks are minted.

On **My Bricks**, use **Set or update NFT cover** beneath a receipt. Select an image
there when the original Mint Studio browser session is no longer available. No
recovery key needs to be uploaded. Failed legacy, owner, network or collection
checks occur before publication. Wallet/account checks repeat before signing.
The success result is based on reading each actual `tokenURI.image`, not a local
UI flag. Read-back also verifies the metadata's Brick Contract and Registration IP
ID attributes against each selected receipt; a matching image alone is insufficient.
Publishing a cover never authorizes publication or streaming of the underlying
work. Player permissions remain independent.
A submitted transaction hash stays visible if confirmation is uncertain.
Inspect it before attempting a second update. A rejected wallet request may leave
an already-pinned public image; the UI explicitly reports this.

## Privacy and IPFS availability

Input covers are limited to 8 MiB. The browser re-renders a PNG thumbnail up to
512 x 512 pixels and 512 KiB. Source EXIF, text, file names, embedded credentials,
and signed provenance manifests are not copied to that derivative. The original
remains unmodified in its existing storage. In particular, an original C2PA
signature is not claimed as a valid signature of this new thumbnail.

Only this reviewed display copy is sent to the dedicated consent-gated local
`POST /api/road-ipfs/nft-cover` endpoint. The bridge independently checks PNG
structure, dimensions, CRCs, permitted chunk types, and bounded body size; it pins
the image, retrieves the exact bytes and checks pin status before reporting
success. This is not a generic plaintext upload endpoint. The encrypted original
upload/recovery routes retain their existing restrictions. Masters, projects,
lyrics, metadata packets and keys are never sent by the cover publisher.

A public thumbnail is intentionally retrievable by anyone, and copies may persist
indefinitely. Clearing or replacing the displayed URI does not erase old copies.
A local Kubo pin is not a global availability guarantee. The pin must be reachable
through IPFS infrastructure used by the viewing wallet. A wallet's external
indexer also cannot inspect a private localhost Ganache chain. ERC-721/4906
compliance does not guarantee every wallet immediately renders every local NFT.

## Important: already-deployed collections cannot change in place

The previous factory and its receipt contract are non-upgradeable. Their bytecode
still hardcodes the square. Pulling source changes does NOT change existing token
metadata. This implementation deliberately refuses those collections rather than
claiming success, resetting Ganache, reminting a work, or swapping token IDs.

For FUTURE local mints, explicitly deploy the updated factory on the existing
Ganache chain. Keep Ganache running. From a second terminal at the repository root:

```sh
nvm use 24
npm run ganache:deploy
```

The deployment command archives the previous factory receipt under
`.road-local/factory-history/` before selecting the new factory. It does not delete
old contracts, Bricks, NFTs, the Ganache DB or IPFS pins. It does not migrate them.
The live Registry indexes one configured factory; use **My Bricks** with the saved
old factory address to inspect earlier registrations. Do not remint old works
solely to make them visible.

Stop the dev launcher, then restart it (with Docker running):

```sh
npm run dev -- --restart-player
```

A reused IPFS bridge from an older launcher must also be stopped once so the new
endpoint is loaded. The ordinary launcher stops the bridge it owns on Ctrl+C. No
Docker volume deletion is needed. In Mint Studio's Review step, replace any saved
old factory address with the newly deployed address. The factory stored in your
browser is deliberately not silently overwritten. Sepolia requires a separately
deployed updated factory; no public network deployment is performed automatically.

Existing old NFTs cannot gain covers in place. A future replacement-receipt
migration would need an explicit separate design and creator approval, not an
undisclosed second registration.

## Tests and standards

- `test/NftCovers.js`: real Solidity authorization, metadata, events, batch atomicity,
  fallback, URI validation, nontransferability and unchanged underlying commitments.
- `web/tests/nft-cover-*.test.js`: source/transport and wallet adapter regressions.
- `scripts/nft-cover-smoke.cjs`: CI-only real Kubo/Vite/Ganache flow including the
  browser's transaction adapter, exact PNG retrieval and tokenURI read-back.
- `scripts/nft-cover-browser.cjs`: Chromium component test with a mock wallet,
  actual image rasterization, metadata removal, consent gate and cancellation.
  This is not a MetaMask extension or macOS walkthrough.

Primary standards: https://eips.ethereum.org/EIPS/eip-721 and
https://eips.ethereum.org/EIPS/eip-4906 . No new package or competing NFT metadata
schema is introduced.
