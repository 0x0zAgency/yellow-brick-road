# Mint Studio: wallet-signed test-chain minting

This walkthrough describes the **live test-chain** mode. Without a connected wallet, Mint Studio automatically runs the original **Simulation**. Connecting a wallet enables Ganache or Sepolia minting. Neither mode uploads source files: browser encryption is real, upload receipts are simulated, and the `road-local://` on-chain URI cannot retrieve files.

## Ganache: local wallet + real EVM transactions

In two terminals at repository root:

```bash
npm install
npm run ganache
```

While Ganache keeps running, in terminal 2:

```bash
npm run ganache:smoke
```

The smoke script deploys `YellowBrickFactory` to **that instance** of Ganache (chain ID 1337), registers sample Bricks, and writes `.road-local/ganache-mint-receipts.json`. Copy the `factoryAddress` displayed in the CLI. A fresh chain means a fresh address.

Configure your browser wallet (e.g. MetaMask) with a custom network:

- Network: Ganache Local
- RPC: `http://127.0.0.1:8545`
- Chain ID: `1337`
- Currency: ETH (disposable test ETH)

Use **one of Ganache's disposable accounts**, funded with pretend local ETH. Do not use or import a private key from a wallet that holds valuable funds, even on a test network.

Start the web UI with `cd web && npm install && npm run dev`. In Mint Studio:

1. Connect your browser wallet. Network configuration is entered in Step 4.
2. Choose the IP category, add a primary work file, and continue through browser-side encryption.
3. Fill in IP and licensing claims.
4. On **Review**, select **Local Ganache** and paste the factory address from `.road-local/ganache-mint-receipts.json`. Check the RPC URL, chain ID and wallet.
5. Choose **Review wallet mint**, then **Request wallet signatures**.
6. Approve **one transaction per Brick** in your wallet. Wait for blockchain confirmations.
7. Review actual deployed Brick addresses, transaction hashes, block numbers, and gas used.

The application validates your wallet account, chain ID, deployed factory code and expected factory interface before signing. It checks the `BrickDeployed` event and predicted CREATE2 address after every receipt. If you reject a later transaction, the previously confirmed Bricks remain on-chain. **Do not blindly retry** the entire mint.

For convenience, you can optionally create `web/.env.local` with:

```env
VITE_ROAD_GANACHE_FACTORY=0xYOUR_DEPLOYED_GANACHE_FACTORY
```

Environment variables starting with `VITE_` are **public build-time configuration**, never put secrets in them. Restart Vite after changes.

## Sepolia

If you already have Sepolia test ETH, select **Sepolia**, switch your wallet to chain ID **11155111**, and supply a **separately deployed Sepolia YellowBrickFactory address**. Ganache addresses do not transfer to Sepolia. Confirming sends real **public testnet** transactions and spends Sepolia test ETH on gas. Do not enter any private key into the website.

You can optionally set `VITE_ROAD_SEPOLIA_FACTORY` in `web/.env.local` to prefill the contract field. The repository's `npm run sepolia:check` only reads Sepolia state; it does not deploy the contract. A Sepolia factory deployment must be completed separately before using the browser mint.

## Verification

CI runs frontend tests and production build, the Solidity suite, local Ganache mint smoke, and a two-Brick **EIP-1193-style test-provider** integration against Ganache verifying actual deployed contract bytecode. CI does **not** click through a human MetaMask dialog. That final interactive wallet check must be performed in a browser with your selected disposable test wallet.

**Rights caution:** an on-chain timestamp is proof that the transaction was included in that block, not conclusive proof of original creation or legal ownership. No IPFS or token-gated decryption service is deployed here.
