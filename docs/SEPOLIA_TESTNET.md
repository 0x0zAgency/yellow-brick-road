# Sepolia: public Ethereum testnet

**Chain ID:** `11155111`. Sepolia ETH is **test currency**, not real ETH. If you already have Sepolia ETH in a wallet, you do not need Ganache accounts or a faucet to use that wallet on Sepolia.

This integration adds a network configuration and a **read-only connection check**. It does NOT deploy or mint on Sepolia automatically, and the website's mint workflow still simulates receipts in-browser.

## Connect from Hardhat (no private key needed for checking)

Obtain an Ethereum Sepolia JSON-RPC URL from a provider you trust. In your terminal:

```sh
export SEPOLIA_RPC_URL="https://YOUR-SEPOLIA-RPC-ENDPOINT"
npm install
npm run sepolia:check
```

The command verifies Sepolia chain ID and reads its current block number without sending a transaction. The `sepolia` network configuration is activated only when `SEPOLIA_RPC_URL` is set.

To prepare future **explicitly authorized** testnet contract deployments with Hardhat, an isolated test-only wallet can optionally be passed as `SEPOLIA_PRIVATE_KEY`. Do not enter any key into the website, commit it to Git, paste it in chat, or reuse a wallet/private key protecting real funds. In particular, **no private key is needed to connect MetaMask**; MetaMask signs locally.

If using MetaMask, choose Ethereum Sepolia (chain ID 11155111), select an account holding Sepolia test ETH, and keep it separate from any mainnet account. A future optional website transaction flow will request a wallet signature, verify chain ID 11155111, call the deployed YellowBrickFactory, and then read the on-chain receipt. That UI transaction flow is **not implemented yet**.

For disposable automated contract tests without a public RPC, use `npm test` (Hardhat in-memory) or `npm run ganache` plus `npm run ganache:smoke` (Ganache loopback).
