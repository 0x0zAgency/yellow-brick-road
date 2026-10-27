# One-transaction minting with initial NFT images

## Workflow

Choose files in Step 2 and review rights/Player permissions in Step 3. In final
review, prepare the cover or primary PNG/JPEG/WebP photo as a normalized public PNG
thumbnail and approve publication. Only this display copy is pinned publicly.
Original files, private metadata and recovery keys keep their existing protection.

The factory's `deployBricksWithPolicy(Registration[], string imageURI)` creates 1–32 independent
Bricks and ERC-721 receipts in one transaction. Each request retains its own nonce,
content/metadata commitments, controller, policy and lock; the release image is supplied once. The caller is
the originator/controller/holder. A failed entry rolls back the entire batch.
Building membership remains a contextual metadata relationship, not an implicit
license, rights transfer or new Building contract.

`tokenURI` remains ERC-721 JSON. Its `image` contains the public IPFS image URI at
initial registration, rather than being a raw image URL or a later artwork update.
No second wallet transaction is submitted for initial images. Without public-image
approval, the built-in fallback remains. Later voluntary image replacement still
requires a transaction and emits ERC-4906 metadata-update events.

The UI simulates and estimates the entire batch before asking the wallet to sign,
uses a 20% gas margin, and refuses batches above the block budget or Sepolia's
EIP-7825 transaction gas cap instead of splitting silently.
Receipts share one transaction hash and explicitly label gas as the shared batch
total. Verification checks every event, identity, file policy, NFT holder and image
at the receipt block, followed by a block-history check. An uncertain/replaced
transaction is never automatically resubmitted. A pin made before a canceled or
reverted mint can still be public.

## Compatibility and cost decisions

- Keep ERC-721 receipts and the existing ERC-1167 per-Brick clones. No token format
  conversion, account-abstraction dependency, relayer or protocol fee is introduced.
- Batch inside the factory so an ordinary EIP-1193 wallet submits one transaction.
  EIP-5792 is useful for future wallet integrations, but wallet batches do not
  universally guarantee one transaction. No wallet capability upgrade is required.
- Store an identical image URI once per receipt collection and reference it by its
  hash from each receipt. A later update to one receipt does not change its siblings.
- A shared image argument avoids repeating the same CID in transaction calldata.
  Each NFT still has its own independently editable reference.
- Gas is not zero. Independent Brick state and image references still require gas.
  This change removes separate transaction overhead and repeated image-string storage.
  Real costs depend on the target chain, inputs and fee market.

Primary standards: [ERC-721](https://eips.ethereum.org/EIPS/eip-721),
[ERC-1167](https://eips.ethereum.org/EIPS/eip-1167),
[ERC-4906](https://eips.ethereum.org/EIPS/eip-4906), and
[EIP-5792](https://eips.ethereum.org/EIPS/eip-5792).

## Local deployment

Existing deployed factories are immutable. The new UI deliberately refuses a
legacy factory rather than silently reverting to several fee-paying transactions.
This is not a migration of existing Bricks or NFTs.

After applying and validating the code, leave the current local Ganache stack
running. In a second terminal in the same checkout, run:

```sh
nvm use 24
npm run ganache:deploy
```

The deployment saves the previous factory reference in the selected profile's
factory-history directory and reports `mintBatchVersion: 1`. It does not reset the
chain or delete pins, uploaded previews, analytics, credentials or recovery data.
Then stop the old launcher and run:

```sh
npm run dev -- --restart-player
```

Reload Mint Studio and use **Use running Ganache factory (automatic)**. The Registry
and Player index the selected factory; previous registrations still belong to their
original deployment. Re-select the original factory for historical viewing;
changing factories does not aggregate their libraries. This
update does not migrate a library between factories or change old NFTs for free.
Do not remint existing works merely to repair artwork. For an old artwork-capable
receipt, the existing holder-authorized update remains available; fixed-artwork
collections cannot be rewritten in place.

For Sepolia, use Dev Control **n → s**. Reuse an existing batch-capable factory with
**f**, or explicitly leave **f** blank to prepare a new factory. Supply the separate
test signer with **k**, review the estimate/ceiling, then type **DEPLOY SEPOLIA**.
A replacement requires a fresh quote and approval even when a profile exists.
Its previous reference is retained in an owner-only `sepolia-history-*.json` record.
No old contract is deleted or modified. Restart and reload after activation.
The Ganache deploy command never deploys to Sepolia. No public-network deployment
is performed merely by pulling or starting the application.

## Validation and gas benchmark

```sh
npm run setup:dev
npm run compile
npm test
npm run test:wallet
npm --prefix web test
npm --prefix web run build
```

`test/BatchMint.js` exercises rollback, caller identity, per-Brick policies, initial
images, immutable receipt identity, and independent replacement of shared covers.
Its benchmark compares 1, 3 and 10 registrations using the retained single-mint API
plus `setCovers` against one atomic batch on the same contracts and chain snapshot.
It prints `ATOMIC_MINT_GAS_BENCHMARK` rows. This isolates batching benefits; it is not
a claim about live-network gas prices or an audited minimum-cost implementation.

`web/integration/batch-mint.test.js` uses disposable Ganache, including the Sepolia
chain-ID configuration, for actual EIP-1193 writes, complete shared receipts,
rejection, replacement and timeout handling. The existing Kubo smoke now checks
that the reviewed initial cover path submits exactly one wallet transaction.
Browser regression coverage includes primary-photo thumbnail review and keeps
public approval separate from file encryption and Player delivery.

## Related extraction and preview repairs

Album extraction retains successfully decoded tags after later parser failure or
worker timeout, checks standard/legacy/custom album tags via music-metadata, and
keeps manual fields intact. **Use extracted album** explicitly replaces a remembered
value. Original MP3 bytes are never rewritten; embedded tags are unverified suggestions.

Registry and My Bricks distinguish metadata-read failures from an NFT with no public
image. Retry works for image fetch failures. Registry polling does not discard an
in-flight thumbnail read. HTTPS uses the same-origin read gateway; private media is
never fetched to fill a missing cover. These fixes do not change an already-minted
fallback image without a holder-authorized update transaction.

Verification commands above include actual contract rollback and gas comparisons,
local Ganache/Sepolia-ID wallet integration, real tagged-MP3 fixtures, Chromium
form tests, and a real HTTPS batch/Registry/My Bricks smoke. Consult the PR checks
for results for the exact commit you are using. No live Mac/MetaMask or public
Sepolia deployment is implied by the isolated tests.
