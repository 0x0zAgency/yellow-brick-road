# 0x🟨 Road Explorer

The first web interfaces for the Yellow Brick Road IP protocol.

**Stack:** React 19, Vite 8, Bootstrap 5.3 and Lucide icons. The frontend is independent of the existing Hardhat/Solidity toolchain.

## Start

Requirements: **Node.js 22.12 or newer** (Node.js **24 recommended**), npm. The repo includes `web/.nvmrc` to select Node 24 with nvm.

```sh
cd web
nvm install
nvm use
npm install
npm run dev
```

If `nvm` is not installed, install Node.js 24 by another method and omit the two `nvm` commands. If you see `node:util does not provide an export named styleText`, your Node.js runtime is too old. Check `node -v`, upgrade, remove `web/node_modules` and reinstall.

Open the URL printed by Vite (normally http://localhost:5173). For a production-style static bundle, run `npm run build`; it writes `web/dist/`. Run `npm run test` to exercise the fee, split and catalog models.

## Screens

- **Manifesto:** Why / What / How / Where landing page with the original AI Rights manifesto, Brick–Building–Road diagrams, and AI source-to-royalty lifecycle.
- **Overview:** Catalog metrics, featured protocol explanation, activity and budget preview.
- **Mint Studio:** FL Studio musician wizard with wallet identity modes, browser-local SHA-256 hashing, AES-256-GCM encrypted downloads, Session Blueprint native DAW project files, MP3 ID3 metadata/cover extraction, separate rights objects, storage-intent review, and JSON pre-mint packet export. **No uploading, token-gated access, wallet creation, signing or blockchain minting happens.** [Creator flow and audit](../docs/CREATOR_MINTING.md).
- **IP Registry:** Search/filter works, inspect metadata, and save local IP drafts.
- **Structures:** Inspect independent brick membership and create local album/collection/regeneration reference sets.
- **Licenses & royalties:** Example license declarations and a working $1 split calculator; mock totals, no transfers.
- **Governance:** Demo proposals and local-only ballots, a fee quote and budget-cap simulator.
- **Road network:** Illustrative Road operators and the distinction between actual blockchain nodes and IP contracts.

## What is real and what isn't

**Encryption:** Optional local AES-256-GCM protected downloads with a passphrase-derived key (PBKDF2-SHA-256, 310,000 iterations, fresh salt and IV per asset). No server receives the files or passphrase. There is no recovery or token-based unlocking yet. Protect your passphrase and retain your original file.\n\n**Real:** responsive frontend code, persisted local drafts, search/filter, relationship composition, calculations, and browser-wallet connection *for account identification only*.

**Not real:** the sample licenses, on-chain contract addresses, royalties, token transfers, votes, node status, budgets or sample events. No production blockchain contracts are configured or deployed from this interface. No wallet signing or blockchain writing occurs.

The original Solidity system includes working *local blockchain* contracts, but this frontend deliberately does not claim to connect to deployed versions. Connecting a wallet uses `eth_requestAccounts` and is optional. No private keys are stored. Browser-local drafts are only available on that device and can disappear when local data is cleared.

### Follow-up integrations

1. Select a chain/testnet and deploy versioned contracts for an actual pilot.
2. Index factory `BrickDeployed`, building relationships and license/royalty events through a verifiable read-only API.
3. Add explicit network, factory and rights-module configuration, wallet chain checking, transaction review and gas estimates before enabling any on-chain writes.
4. Introduce authenticated rights grants and a secure settlement/treasury integration with budget caps before displaying any real royalty balance.
5. Implement real participant identity and qualified node attestation beyond the demo.

## Notes

- `web/dist` and `web/node_modules` should never be committed.
- Demo content is synthetic, not claims to real IP ownership or real use.
- The root repository currently contains an existing CC0 license; some Solidity files use MIT SPDX headers. Resolve the final code licensing position before wider reuse.

## ENS and demo uploads

Connect a wallet to display its **verified Ethereum-mainnet primary ENS name** when available. Reverse results are checked against forward resolution. Otherwise the interface displays a shortened wallet address; ENS remains a display identity only. Supply an Ethereum mainnet endpoint via `VITE_ENS_RPC_URL` for reliable hosted resolution (no private key). Wallet account changes invalidate a previous name.

In Mint Studio, **all five file selectors accept any extension** for testing. File-role labels are advisory, not a type-validation guarantee. The existing browser hashing/encryption size cap still applies; format-aware parsers may skip unsupported content. The demo does not publish files, mint contracts or verify authorship.

## Expanded IP categories and blockchain test networks

Mint Studio supports **35 IP categories** covering music and songwriting, writing, images, film, choreography and dance-move evidence, spatial capture, 3D works, software, games, data, design, brands and other evidence. For spatial works the demo records claimed capture/performance times, tracking formats, joint conventions, performer credits and external C2PA / PROV-O attestation links. These are **creator-declared** and not independently verified; recording a dance move does not grant exclusive rights.

The site still performs **simulated uploads and minting**. To run actual contract deployments locally, start Ganache with `npm run ganache` and run `npm run ganache:smoke` separately. Real Ganache **local** transactions produce receipt files, but the Mint Studio UI does not sign or transmit them. See [Ganache instructions](../docs/GANACHE_LOCAL.md).

If you have **Sepolia test ETH**, configure `SEPOLIA_RPC_URL` and run `npm run sepolia:check` from the repository root. This is read-only. No public-chain deployment is performed. See [Sepolia guide](../docs/SEPOLIA_TESTNET.md).

We integrate existing provenance standards rather than inventing competing ones. See [IP categories and provenance](../docs/IP_CATEGORY_PROVENANCE.md).

## Test-chain minting in Mint Studio

The **Review** step offers **Ganache Local** (chain 1337), **Sepolia** (11155111) and a separate **Simulation** mode. The real modes use the injected browser wallet to call `YellowBrickFactory.deployBrickWithMetadataDigest`, require user approval per Brick, wait for actual EVM receipts and expose transaction hashes and deployed addresses. Ganache factory address comes from `.road-local/ganache-mint-receipts.json` after running `npm run ganache:smoke`. An independently deployed Sepolia factory is needed for Sepolia. Optional public configuration: `VITE_ROAD_GANACHE_FACTORY` and `VITE_ROAD_SEPOLIA_FACTORY`.

See [Wallet-signed test-chain mint instructions](../docs/WALLET_MINT_TEST.md). **No real file upload, key escrow, IPFS hosting or royalty settlement occurs.** On-chain demo metadata URIs are intentionally non-resolving. The human MetaMask interaction must be verified by a tester, in addition to automated wallet-provider and Ganache checks.
