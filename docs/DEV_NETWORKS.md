# Dev Control network selection

Press **n** for Network Control, then **g** for Local Ganache or **s** for Sepolia.
The selected profile applies to the whole stack, including Mint Studio, My Bricks,
the Registry, Buildings, NFT reads, Player permissions, and interaction scopes.

**Sepolia uses Infura automatically.** Fresh demo setups use the existing ethers
SDK's shared development access. No RPC URL field or **u** shortcut is shown.
Saved endpoints and advanced environment overrides are preserved. Dedicated
Infura access is optional through `INFURA_API_KEY`; shared access may be throttled.
Failures never silently switch providers or fall back to Ganache.

Enter prepares the verification and estimate; it does not deploy. New deployment
requires a separate test signer, an acceptable spending ceiling, and the literal
**DEPLOY SEPOLIA** approval. Existing verified contracts are reused without a
new deployment. After activation, restart `npm run dev` and reload the apps.

The interface-address cycling feature and **i** shortcut are hidden for now.
They are absent from the home screen, details screen and network menu. These
controls do not change the machine's Wi-Fi, VPN, routing, or service bindings.

See [One active network in Dev Control](ACTIVE_NETWORKS.md) for configuration,
deployment estimates, signing, RPC precedence, and recovery. Existing chain
profiles, pins, media, interaction journals and recovery material are retained.
