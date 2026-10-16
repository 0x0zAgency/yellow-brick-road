# 0x🟨 Road

**The Yellow Brick Road of 0x0z.**

**The Intellectual Property Protocol for the internet. 🟨**

Independent IP contracts first. Albums, collections, datasets and regeneration megabuildings second. AI is an application, not the identity of the Road.

## Protocol principles

- **One Yellow Brick = one addressable IP contract** with a creator claim, persistent content commitment and controller.
- **Buildings reference existing IP.** No implicit rights transfer or permission to use underlying works.
- **No Road registration charge.** Creators pay blockchain gas to deploy their IP contracts.
- **No speculative token.** Future Road infrastructure payments can only go to qualified blockchain-node operators for measured useful services. Ordinary creators receive licensed royalties without operating nodes.
- **Budget-capped usage microfees.** Once authorized utility funding is collected, fee collection stops. A separate treasury prototype now tests capped collection; **the royalty settlement contract still collects zero Road operating fees**. The treasury has not been integrated into actual licensed transactions.
- **All users vote, weighted.** Each uniquely verified participant has baseline influence; additional influence will be bounded and earned, not bought.

## Working prototype: bricks, royalties, and public utility

| Contract | Capability |
|---|---|
| [YellowBrick](contracts/YellowBrick.sol) | Independent work contract, originator, content hash, metadata and controller |
| [YellowBrickFactory](contracts/YellowBrickFactory.sol) | Deterministic EIP-1167 clone deployment |
| [YellowBrickBuilding](contracts/YellowBrickBuilding.sol) | Typed membership referencing independent brick contracts |
| [YellowBrickLicense](contracts/YellowBrickLicense.sol) | Controller-declared economic licenses with fixed use price, expiry, committed terms |
| [RoadRoyaltySettlement](contracts/RoadRoyaltySettlement.sol) | Versioned split policies, replay-protected usage settlement and pull-based royalties |
| [MockUSD](contracts/test/MockUSD.sol) | Six-decimal, freely minted **test-only** payment asset |
| [RoadGovernance](contracts/RoadGovernance.sol) | Weighted attested-user votes, two-day voting and one-day execution delay |
| [RoadNodeRegistry](contracts/RoadNodeRegistry.sol) | Governance-attested operator eligibility and service evidence |
| [RoadTreasury](contracts/RoadTreasury.sol) | 30-day budget periods, capped utility fees and governed node service payouts |

### Run

Requires Node.js 20+ and npm:

```sh
npm install
npm run compile
npm test
npm run demo
```

The demo registers a Yellow Brick, includes it in an album, issues an economic license to one test user, and accounts for one test-dollar of usage royalties split $0.80/$0.20.

This is a local Hardhat demonstration. **No production assets or real dollars are involved.**

## Web interface (React + Vite + Bootstrap)

A responsive **0x🟨 Road Explorer** prototype now lives in [`web/`](web/README.md). It includes a dashboard, searchable IP registry, composable structures, royalty-split simulator, weighted governance demo, and Road node views.

Run it locally:

```sh
cd web
npm install
npm run dev
```

The UI uses **synthetic sample records** and browser-local draft storage; drafts, votes, licensing examples, balances and node status are **not on-chain**. Connecting a wallet only requests an account address and does not deploy contracts or sign transactions. [Web UI documentation](web/README.md) explains the limitations.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Draft public-utility constitution](docs/CONSTITUTION.md)
- [Roadmap](docs/ROADMAP.md)
- [Utility governance v0.3 and trust assumptions](docs/UTILITY_GOVERNANCE.md)

**Caveats:** Neither on-chain registration nor a content commitment proves copyright ownership. A usage evidence hash is only an attestation, not proof of neural-model causal influence. The voter enrollment attester and node-service eligibility are still centralized trust assumptions and are not production identity or node proofs. Actual licenses require review of the full terms and the legal rights involved. The contracts are unaudited and not safe for actual royalty custody.

The original CC0 repository LICENSE is preserved; source-level MIT identifiers require a final consistent licensing decision.
