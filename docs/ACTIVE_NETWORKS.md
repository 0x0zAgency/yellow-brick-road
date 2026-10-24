# One active network in Dev Control

The `[n]` selector activates a complete blockchain profile, not a Mint Studio-only preference. Supported profiles are Local Ganache (1337) and Sepolia (11155111). It does not support Ethereum mainnet or claim to estimate rollup/L2 data fees.

The running apps remain on localhost. Mint Studio, My Bricks, Registry, Building membership checks, NFT thumbnails, Player permission checks and interaction scopes all use the selected chain and factory. The local IPFS service remains local. Remote RPC credentials are not Vite settings: browser reads use the loopback, read-only `/road/rpc` adapter. Wallet signing remains in the browser wallet.

## First Sepolia activation

Start the normal stack, press `n`, then `s`. The active configuration remains unchanged while preparing this proposal.

- `u`: enter the Sepolia RPC URL. Remote endpoints require HTTPS. HTTP is permitted only on loopback for private testing. API keys in URL paths or queries remain in the owner-only local profile, not in browser code or the dashboard.
- `f`: enter an existing compatible YellowBrickFactory, or leave blank for a first deployment. `b` supplies its deployment block. An existing deployment is verified, not assumed from its address.
- `k`: enter a **separate Sepolia test-wallet private key** using hidden terminal input. It is not saved in the network profile. Do not enter a real-funds wallet or a Ganache seed. The current and standard Ganache account families are refused. `SEPOLIA_PRIVATE_KEY` is an optional process-local alternative; do not put it in shell history or commit it.
- `c`: set the maximum deployment budget in Sepolia ETH. Default: 0.05. This is a refusal ceiling, not an instruction to spend that amount.
- Enter: verify the RPC and factory. For a new deployment, compile and estimate the actual factory creation transaction without broadcasting it.

For a new deployment the review shows the signer, one transaction including the Brick implementation and NFT receipt collection, estimated gas, padded gas limit, EIP-1559 fee cap and priority fee, estimated cost, maximum cost and conservative remaining balance. The quote expires after 90 seconds. `r` refreshes it. Enter opens the final approval field; type **DEPLOY SEPOLIA** and Enter to authorize the exact capped transaction. Pasted newlines and bracketed pasted approval cannot submit it. Review requires an interactive terminal at least 80x24. Escape before submission cancels without changing the active selection.

The signed deployment has explicit chain, nonce, bytecode, value (zero), gas limit, max fee and priority fee. The ceiling is gasLimit × maxFeePerGas. The deployment is refused above the block gas limit or EIP-7825 transaction cap. Fees, balance, nonce, compiled bytecode and chain history are rechecked before signing. The launcher does not silently increase the fee or retry a new deployment after a timeout.

After confirmation, the verified profile and deployment receipt are saved. The old launcher-owned services stop. Run `npm run dev` again and reload the browser applications. Dev Control now displays **ACTIVE SEPOLIA / CHAIN 11155111**. Managed Ganache is not started, and its demo song is not automatically minted on Sepolia. A running external Ganache is not killed, but is not used by this profile. Switch the browser wallet to Sepolia before signing; its network events cannot silently change the application's selected network.

Existing saved deployments are revalidated and reused without a deployment transaction. A valid factory's implementation and receipt collection are checked as well. A missing or inconsistent remote profile fails closed and offers Network Control in an interactive launcher. Noninteractive startup never approves deployment. Remote outages do not reconnect to Ganache.

## Storage and recovery

Selection stays in `.road-local/dev-network.json`. Completed remote configuration is in `.road-local/networks/sepolia.json`, with the RPC URL, chain/genesis, factory, deployment block, signer address and transaction hash. Files are owner-only and git-ignored; the RPC URL is sensitive plaintext, not encrypted credential custody. No private signing key or signed raw transaction is persisted.

`.road-local/networks/sepolia-pending.json` is written and flushed **before broadcasting**. An uncertain transaction remains a hard stop against another deployment. Reopening Network Control queries that hash and can recover a confirmed deployment without spending again. A reverted transaction or abandoned deployment lock requires explicit inspection; do not delete these records merely to make an error disappear. A transaction already submitted to the network cannot be canceled by closing the menu.

Returning to Ganache reopens the existing selected wallet profile. Switching does not migrate or remint works, rewrite permissions, delete media, remove IPFS pins, or reset interaction journals. A Ganache release is not a Sepolia release. Unavailable tracks remain absent from the playable library. Public NFT thumbnails still depend on their available local pins. Private originals are not exposed to fill missing thumbnails.

The existing development artist auto-login is only a convenience for this loopback application. It neither establishes rights nor bypasses on-chain file authorization. The interface shortcut `i` remains reference-only and does not change Wi-Fi, VPN or routing.

## Contract scope

This change uses the contracts currently on main. It does **not** merge the separate atomic-mint/initial-artwork change in PR #28 or upgrade an immutable existing factory. A later contract-version upgrade needs a separately reviewed deployment plan. No public Sepolia deployment was performed as part of testing this change.

## Verification

`node --test scripts/dev-network.test.cjs scripts/dev-network-profile.test.cjs scripts/deployment-budget.test.cjs apps/ybr-player/test/road-rpc.test.js` tests selection/consent, private records, fee calculations and read-only HTTP boundaries.

After installing dependencies and compiling, `node --test scripts/dev-sepolia.integration.cjs` creates an isolated local Ganache node using chain ID 11155111 and disposable test accounts. It checks actual deployment with approved fees, zero-cost reuse, Registry/My Bricks discovery, preview delivery/playback, cross-chain refusal, revocation and interaction identities. It never connects to public Sepolia. CI additionally starts the complete launcher against that node and verifies that no Ganache process or automatic remote test-music mint appears. Separate Chromium checks exercise the real creator views with explicit mocked wallet/RPC responses.
