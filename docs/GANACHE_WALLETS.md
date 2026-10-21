# Ganache mnemonic control

Start `npm run dev` in an interactive terminal. Once the stack is READY, press
**m** for **Ganache Wallet Control**. This is a local-development tool, not a
production wallet importer. Never use a seed that controls real funds or assets:
Ganache exposes unlocked development accounts to local RPC clients.

- **g** generates a random 24-word English BIP-39 test mnemonic.
- **i** accepts an existing English BIP-39 test mnemonic with hidden input.
  Supported lengths are 12, 15, 18, 21 and 24 words. The existing ethers library
  checks its word list and checksum; no homemade mnemonic scheme is used.
- **d** returns to the original deterministic Ganache wallet and its original DB.

The review screen shows the derived account-0 address and profile identity, not
the entered seed. Type **SWITCH**, then Enter to confirm. Escape or Ctrl+C inside
the menu cancels without changing wallet settings. Pasted multiline input is
masked and bracketed paste cannot confirm a switch. During entry, letters such
as q, r, s and p are input, not dashboard shortcuts.

## Applying a change

Before confirming, finish any pending wallet transactions and save active Mint
Studio recovery backups. A confirmed change cleanly stops this launcher's owned
services, verifies that Ganache has released its RPC port, and only then saves the
new selection. It does not force-kill or take over an unrelated service. Start the
selected profile with **`npm run dev`** in the same terminal. Node 24 selection,
script approvals, IPFS startup, factory preparation and generated test-music
publication remain part of the normal launcher.

The tool refuses a reused external Ganache, a reused Player, or explicit
YBR_GANACHE_FACTORY/VITE_ROAD_GANACHE_FACTORY overrides. For an older reused
Player, restart with `npm run dev -- --restart-player`. Stop an external Ganache
in the terminal that owns it before relaunching. No external process is killed by
the mnemonic tool. It is unavailable in redirected/plain/CI dashboard mode.

## Chain history stays with its wallet profile

The default wallet keeps `.road-local/ganache`, `.road-local/factory.json`, and
`.road-local/factory-history/`. Nothing is moved or deleted when adding this tool.

Each custom mnemonic gets its own persistent directory:

```
.road-local/ganache-profiles/<derived-account-0-without-0x>/ganache/
.road-local/ganache-profiles/<derived-account-0-without-0x>/factory.json
.road-local/ganache-profiles/<derived-account-0-without-0x>/factory-history/
```

Re-entering that same mnemonic returns to its existing chain. Choosing **d**
returns to the original chain. A new seed starts a different local chain, not a
migration of existing Bricks or NFTs to new keys. The old contracts, balances,
transactions and nonces remain in their original database. The launcher and
`npm run ganache` use the same profile selection. `npm run ganache:deploy` and the
Player's factory reader select that profile's factory reference as well.

IPFS pins, recovery files, local Player uploads and Player login credentials are
not deleted or reassigned. Public playback eligibility still requires the
current chain's authorization checks. Local demo previews remain separate from
on-chain registrations.

All profiles use local RPC `http://127.0.0.1:8545` and chain ID 1337. After switching,
reload the applications, select/import the corresponding **test** account in
MetaMask, and compare the Mint Studio factory address to the dashboard. Browser
saved factory choices are not silently overwritten; replace a previous profile's
saved address when necessary. MetaMask may retain stale history for this shared
chain ID. Existing history-verification checks remain in force; a profile change
never bypasses them or resets the browser wallet.

## Secrets and storage

The selected seed is saved in owner-only, git-ignored
`.road-local/ganache-wallet.json` (mode 600 within a mode-700 local directory).
**This is local plaintext storage, not encrypted custody.** The programmatic
Ganache API receives the mnemonic in memory. It is not passed as a command-line
argument or environment-variable value. There is no secret-discovery HTTP API.
The dashboard verifies account 0 before showing the active seed and key. Its
existing `s` visibility toggle and saved-log redaction remain in force.

The selector rejects malformed configuration, symlinked/foreign-owned paths and
world/group-readable seed files. Configuration replacement is atomic. A failed
shutdown or still-occupied RPC port does not save the new selection. Back up test
mnemonics you need to return to; the selection file holds only the currently
selected mnemonic. Existing profile databases are retained, not a history of
all secret phrases.

## Verification

`npm run test:dev-stack` includes the input/confirmation/redaction tests and real
Ganache profile round-trip tests. They cover independent profile factories,
private settings permissions, bad checksums, cancellation, external-process
refusal, default-wallet compatibility, and retaining blocks, deployed code,
balances, transaction receipts and nonces when switching back.

This uses Ganache's documented `wallet.mnemonic`/`wallet.deterministic` and
`database.dbPath` options, plus ethers v5 BIP-39 validation and HD derivation:
- https://github.com/trufflesuite/ganache/tree/v7.9.2/packages/ganache
- https://docs.ethers.org/v5/api/utils/hdnode/
