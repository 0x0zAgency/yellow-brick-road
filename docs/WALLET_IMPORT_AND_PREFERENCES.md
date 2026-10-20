# Wallet import and local Mint Studio preferences

## Importing a registered Brick as an NFT

New YellowBrickFactory deployments mint a standard **ERC-721 registration receipt** for every Brick registered. This is separate from the underlying YellowBrick rights object.

After a verified mint, Mint Studio now displays **two copyable values**:

1. **NFT contract address:** The factory's `receiptToken()` ERC-721 collection address. All receipts created through that particular factory share this address.
2. **Token ID:** The `uint256(ipId)` value, displayed as a decimal number suitable for wallet NFT import fields.

## Default NFT artwork

Every new YellowBrickReceipt ERC-721 now exposes a **🟨 yellow-square default icon**. The `tokenURI` metadata includes an `image` property containing an inline base64-encoded SVG. No external image host, source-work preview, or public artwork URL is required. The SVG includes the yellow-square emoji in its accessible title and paints the square directly so it works without an emoji font.

The artwork is marked `Default Artwork: yellow-square-v1` in the NFT attributes. This deliberately centralizes a neutral fallback; future releases can select different artwork presets for different IP categories after there is a suitable public, privacy-preserving category signal.

**Deployment note:** updated Solidity bytecode only affects *newly deployed* receipt collections and the factories that create them. Existing Ganache or Sepolia receipt NFTs do not gain an image from updating the repository. Deploy a new factory, mint a new receipt, and import the new collection address and token ID. Some wallets cache NFT metadata or do not display `data:` SVG images, so wallet artwork cannot be guaranteed across all apps.

In a wallet supporting custom NFT imports (such as MetaMask), choose **Import NFT**, confirm the correct Ganache/Sepolia network, paste the NFT contract address, then paste the decimal Token ID. Wallet support for custom networks and `data:` NFT metadata URIs varies. A wallet may list the receipt without thumbnail artwork. No public source files are needed: the NFT serves inline, generic metadata that does not expose the work's private contents.

**This receipt cannot be transferred or sold.** Holding or importing it is not evidence of copyright title or permission to license a work. The Brick's `controller` and separate rights declarations remain independent. Older factories have no NFT receipt collection; their Bricks have contract addresses and IP IDs, but **are not ERC-721 NFTs**. Do not import the original Brick contract as an NFT collection.

After updating the contracts, run `npm run ganache:deploy` with Ganache active to get a **new** factory address and `nftContractAddress`. An earlier Ganache factory deployment is not automatically upgraded. Sepolia requires a new deployment too if the existing factory is legacy.

## Local preferences

Mint Studio now stores Ganache/Sepolia configuration and factory addresses locally in the browser, keyed by configured network+RPC. It restores IP category, creator-entered text, spatial claims, draft rights choices and proposed fees when **Remember form fields on this device** is enabled.

Form fields are ordinary **unencrypted local browser storage**, not secure storage. They may include sensitive unpublished work titles or collaborator names. The checkbox and clear button are on the first Mint Studio step. Uncheck to remove the saved form. Clearing the form does not wipe the separate network/factory preferences; those deliberately remain for convenience.

No private wallet key, authorization token, encryption secret, uploaded bytes, file buffer, ciphertext, temporary mint packet or full rights-bearing data package is saved. Files must be attached again after refresh, and temporary encryption keys are not recoverable after page reload. The app does not sync any of these saved preferences with Road servers.

Do not confuse persistence of form inputs with durable encrypted package storage. That requires a separate consented local-file/export workflow and secure key management.
