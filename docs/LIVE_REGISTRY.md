# Real Brick discovery in IP Registry and YBR Player

Previously the IP Registry page rendered only local drafts and synthetic examples.
The Player's Road catalog intentionally selected only consented public audio with
readable, digest-matched local manifests. A successfully minted encrypted Brick
therefore appeared in neither view. This was a discovery gap, not evidence that
a mint transaction failed.

## Local chain registrations

The IP Registry now defaults to **On-chain registrations**, backed by the local
Player's read-only `GET /road/api/registry` endpoint via Vite. The existing drafts
and examples are a separate tab. No wallet signature is requested for discovery.

The endpoint reads the configured Ganache factory's `BrickDeployed` events, then
checks deployed code, factory membership, identity, originator, content commitment,
controller and metadata commitment/version/URI at one block snapshot. It rechecks
that block's canonical hash before returning. It never follows metadata URIs or
reads/decrypts content to populate an entry. Records are keyed by chain, factory
and Brick identity/address, not by title or content hash. Different works may have
the same content commitment and still be independent registrations.

The local scan covers at most the latest 100,000 blocks, refuses event sets above
1,000, and displays the latest 200 registrations with an explicit partial-result
notice. It is a local pilot index, not a globally complete or independently
trusted indexer. The service verifies against its configured RPC, not against an
independent consensus source. Browser display validates the response shape and
scope. A failed read is not represented as an empty verified registry.

Both the Registry and authenticated Player library refresh every five seconds
while visible. The Registry also has a manual refresh control. Existing confirmed
mints in this factory are discovered; users do not need to remint. Simulated
receipts do not create factory events and never populate the real registration list.
The configured factory/RPC is shown in the Registry. This endpoint covers local
Ganache 1337, not Sepolia or arbitrary factories. **My Bricks** remains available
for selecting another network/factory through the connected wallet.

## Registration is not playback

The authenticated Player library includes registered-only Bricks with an
**ON CHAIN** badge. Inspecting one shows its identity and an explicit
**REGISTERED / NOT PUBLISHED** state. Registered-only objects are not asserted to
be audio; media type, title, and duration cannot be inferred from ciphertext or
an unhosted metadata reference. Generic contract-based titles are intentional.

Readable labels from the existing authorized Road music catalog are joined only
when the identity, chain, factory, contract, controller, content commitment and
metadata commitment match. Public playback APIs continue to expose only eligible
public audio. Registration alone cannot authorize a stream or serve a file.

To hear an encrypted recording in the local demo, use **Add release to Player**
on its Mint Studio receipts page, approve the existing sharing consent, and share
the selected preview copies. This is a separate local-demo release, not a new
on-chain playback license or an automatic decryption path. Recovery keys and
private originals are never published by registry discovery. A refresh/closed
minting session may require restoring source files through the existing private
recovery flow before preparing another preview. Registration also does not prove
legal title, authorship or copyright ownership.

## Updating

Save any active private recovery backup first. Update the checkout, restart the
stack and reload the browser. An old standalone Player may otherwise be reused:

```sh
git pull --ff-only
npm run dev -- --restart-player
```

The existing restart guard must still verify that the Player belongs to the same
user and checkout. No Ganache database, IPFS pin, recovery key or receipt is deleted.

## Tests

- Player unit tests cover event/state agreement, no metadata dereference, bounded
  scans, reset/reorg detection, deterministic identity merging and new records on
  subsequent reads.
- Web client tests reject synthetic entries, malformed data, duplicates and a
  mismatched chain/factory; missing endpoints and offline nodes are errors.
- Player HTTP tests exercise anonymous registry reads, authenticated library
  discovery, unauthorized playback refusal and clearing stale chain data on error.
- `scripts/dev-registry-smoke.cjs`, after the existing integrated-stack smoke,
  creates a fresh private-metadata registration on disposable CI Ganache. It checks
  discovery through Vite and Player, no duplicate entries, and denied media routes.

The integration smoke deliberately creates a synthetic test registration. It is
not a command to run against a user's normal development chain without intending
that extra test mint. No manual MetaMask/macOS or browser visual walkthrough is
implied by these automated tests.
