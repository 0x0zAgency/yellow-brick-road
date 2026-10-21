# Local wallet / RPC history mismatch

`Wallet and RPC point to different blockchain histories` is a YBR pre-signature
check, not a transaction-nonce error. A matching chain ID (1337) and matching
account/factory addresses do not prove two RPC endpoints have the same history.
A second Ganache instance can have the same settings with different blocks.

The old local check compared a fresh RPC block against only the wallet's numbered
block read. That read may be cached from a previous disposable Ganache process.
Deleting transaction/nonce activity is not a reliable way to invalidate it.

## Current behavior

A matching numbered block still passes normally. After a mismatch, local Ganache
verification requires both:

1. The wallet returns the exact RPC block by hash and number.
2. The wallet's fresh `pending` view identifies a canonical mined head (or a real
   pending block's canonical mined parent) on the configured RPC, at least as new
   as the reference block. The original reference is then rechecked on the RPC.

MetaMask's block-cache middleware excludes `pending` reads. Ganache returns its
mined head for this tag; other clients can return an unmined block with a null
hash. The check handles both representations. Merely finding a common ancestor
or orphan block by hash never authorizes a conflicting fresh head. Missing,
malformed, unsupported, timed-out, or conflicting reads fail closed. There is one
bounded retry for a transient head change, no network mutation, no mining request,
and no signature or transaction in the recovery routine. Sepolia keeps its
existing wallet-backed path. Chain ID and account checks remain in place.

Failures now include the expected local RPC origin, chain ID, reference height,
and abbreviated observed hashes. This still cannot prove the user's exact cause
without their live provider responses. A persistent mismatch can be a genuinely
wrong selected RPC, not a cache problem.

## Persistent development chain

`npm run ganache`, including the node started by `npm run dev`, now stores the
chain in `.road-local/ganache` and uses network ID 1337 as well as chain ID 1337.
Normal stop/start keeps the blocks, contracts, balances and nonces in that DB.
The directory is already ignored by Git. Do not delete it as a troubleshooting
step. Kubo volumes and IPFS recovery files are separate and unchanged.

An already-running external Ganache is still reused, not killed or migrated.
An older in-memory chain cannot be retroactively recovered after stopping it.
The first persistent launch creates a new database if none exists; this preserves
future history, not previously discarded test mints. Back up local test artifacts
before deliberately changing or replacing a running chain.

## Updating and checking settings

Save the private IPFS recovery backup before refreshing an active encryption
session. Stop the old dev launcher, pull the updated code, run `npm run dev`, then
reload the local application. The Node 24 bootstrap remains in effect.

For the default stack, use the same endpoint in both Mint Studio and the selected
MetaMask Ganache network: `http://127.0.0.1:8545`, chain ID `1337`, currency `ETH`.
A network named Ganache with port 7545 or 9545 is not necessarily this node. Do not
reset your wallet, uninstall MetaMask, share a seed phrase, delete `.road-local`,
or remove Docker volumes to solve this check. Review any earlier transaction
receipts before retrying a partially completed batch.

## Tests and upstream references

- `npm --prefix web test`: dependency-free stale-read / fork / timeout regressions.
- `npm run test:wallet`: real Ganache restart with stale numbered-provider reads,
  wallet-signed mint, actual foreign-chain refusal, plus restart persistence using
  the exact npm Ganache CLI flags in an isolated temporary directory.
- These provider tests simulate cache behavior. They are not a live MetaMask
  browser-extension walkthrough or a macOS test.

Primary implementation references:
- https://github.com/MetaMask/core/blob/main/packages/eth-json-rpc-middleware/src/block-cache.ts
- https://github.com/MetaMask/core/blob/main/packages/eth-json-rpc-middleware/src/utils/cache.ts
- https://github.com/trufflesuite/ganache/blob/develop/packages/ganache/README.md
