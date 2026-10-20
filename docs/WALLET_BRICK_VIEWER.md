# Wallet Brick Viewer (read-only)

Open **My Bricks** in the Road sidebar and connect your EIP-1193 browser wallet. No signing or gas is required to view registrations.

## How it works

1. The client reads the connected wallet address and current EVM chain ID without requesting a signature.
2. Supply the **YellowBrickFactory** address deployed on that network. If you successfully minted through Mint Studio using this browser, its factory address is saved *locally* under `road:factory:<chainId>` so the viewer can prefill it. Public `VITE_ROAD_GANACHE_FACTORY` and `VITE_ROAD_SEPOLIA_FACTORY` settings also prefill the field.
3. Click **Find my on-chain Bricks**. The client verifies the factory and implementation bytecode, searches its `BrickDeployed` events filtered by the connected wallet's `originator` address, then checks individual Brick contracts.
4. It displays on-chain contract address, IP identity, content and metadata commitments, metadata version/reference, current controller, block and transaction link (for Sepolia).

No account keys, private files, encrypted media, local drafts, metadata JSON or source content are transmitted to the Road. RPC queries go to the blockchain node configured in your wallet; that provider can observe the queried wallet and contract addresses, so this is **read-only**, but not a zero-network-traffic privacy mode.

## Important limitations

- The viewer shows Bricks **originally minted by** this address through **one selected factory**. It does not enumerate every Brick now controlled by the address after transfers, because the factory's creation event alone cannot index third-party originators whose control changed. Current controller is checked separately for found Bricks.
- Simulated receipts are **not** on-chain Bricks and never appear.
- The current `road-local://` and `road-demo://` metadata references are not remote storage. A viewer cannot reconstruct private titles or decrypt originals from content hashes alone. No public metadata URI is fetched.
- An empty result means no matching creation events **in the scanned network, factory and block range**, not that a wallet has no IP.
- Browser RPC providers may limit `eth_getLogs` queries. The viewer scans 5,000 blocks per request; at most 100,000 blocks per invocation, with an optional starting block and a maximum of 200 displayed Bricks. For older registrations or heavy-use deployments, an indexer implementing equivalent verifiable event/contract reads is needed.
- The viewer never treats creator declarations or on-chain registration as proof of legal rights.
- If your Ganache chain is reset, previously deployed contracts and events no longer exist; re-run the local factory deployment and use the new address.

The client uses the same IP contract and provenance boundaries as Mint Studio. The Road backend receives no package and stores no information during viewing.
