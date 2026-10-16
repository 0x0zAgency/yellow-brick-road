# 0x🟨 Road

**The Yellow Brick Road of 0x0z.**

**The Intellectual Property Protocol for the internet. 🟨**

Independent IP contracts first. Albums, collections, datasets and regeneration megabuildings second. AI is an application, not the identity of the Road.

## Protocol principles

- **One Yellow Brick = one addressable IP contract** with a creator claim, persistent content commitment and controller.
- **Buildings reference existing IP.** No implicit rights transfer or permission to use underlying works.
- **No Road registration charge.** Creators pay blockchain gas to deploy their IP contracts.
- **No speculative token.** Future Road infrastructure payments can only go to qualified blockchain-node operators for measured useful services. Ordinary creators receive licensed royalties without operating nodes.
- **Budget-capped usage microfees.** Once authorized utility funding is collected, fee collection stops. The actual fee and cap mechanism are future work, and these prototype contracts collect **zero Road operating fees**.
- **All users vote, weighted.** Each uniquely verified participant has baseline influence; additional influence will be bounded and earned, not bought.

## First functioning slice

| Contract | Capability |
|---|---|
| [YellowBrick](contracts/YellowBrick.sol) | Independent work contract, originator, content hash, metadata and controller |
| [YellowBrickFactory](contracts/YellowBrickFactory.sol) | Deterministic EIP-1167 clone deployment |
| [YellowBrickBuilding](contracts/YellowBrickBuilding.sol) | Typed membership referencing independent brick contracts |
| [YellowBrickLicense](contracts/YellowBrickLicense.sol) | Controller-declared economic licenses with fixed use price, expiry, committed terms |
| [RoadRoyaltySettlement](contracts/RoadRoyaltySettlement.sol) | Versioned split policies, replay-protected usage settlement and pull-based royalties |
| [MockUSD](contracts/test/MockUSD.sol) | Six-decimal, freely minted **test-only** payment asset |

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

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Draft public-utility constitution](docs/CONSTITUTION.md)
- [Roadmap](docs/ROADMAP.md)

**Caveats:** Neither on-chain registration nor a content commitment proves copyright ownership. A usage evidence hash is only an attestation, not proof of neural-model causal influence. Actual licenses require review of the full terms and the legal rights involved. The contracts are unaudited and not safe for actual royalty custody.

The original CC0 repository LICENSE is preserved; source-level MIT identifiers require a final consistent licensing decision.
