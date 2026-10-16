# Ganache: real local blockchain transactions

Ganache is an **archived** Ethereum development chain, offered as an optional compatibility tool. Hardhat remains the primary test runner. Ganache transactions are real executions of Solidity/EVM logic **only on your disposable local chain**. They are not public Ethereum or Sepolia transactions.

From the repository root, use two terminals:

```sh
npm install
npm run compile
npm run ganache
```

In terminal two:

```sh
npm run ganache:smoke
```

The server binds to `127.0.0.1:8545`, chain ID `1337`, and creates deterministic **throwaway** test accounts with simulated ETH. Never reuse these public demo keys on a live chain. The smoke command refuses to run unless the chain ID matches and the configured RPC is loopback-only. It deploys `YellowBrickFactory`, then three example Bricks for sound, choreography, and a literary work. It checks the emitted event, predicted deterministic address, originator, content hash, and metadata digest; then writes transaction hashes, gas used, block numbers, and addresses into `.road-local/ganache-mint-receipts.json` (ignored by Git).

These tests hash illustrative test payloads rather than user-uploaded files. No IPFS upload or public token is created. Restarting a clean Ganache chain invalidates old local receipts. To run the existing Hardhat suite against Ganache, use `npm run ganache:test` with a clean server. The **website mint button remains simulated** and does not automatically send wallet transactions to Ganache.

Ganache archive: https://github.com/ConsenSys-archive/ganache

For a public testnet where you already have test ETH, see `docs/SEPOLIA_TESTNET.md`.
