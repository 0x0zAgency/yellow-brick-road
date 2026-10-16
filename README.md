# 0x🟨 Road

**The Yellow Brick Road of 0x0z.**

**The Intellectual Property Protocol for the internet. 🟨**

IP first. Products second. Every registered work can have its own independent Yellow Brick contract; album, collection, and regeneration structures reference those bricks without absorbing their rights. AI is a use case, not the protocol's identity.

## Founding principles

- **One brick, one IP contract.** A chain-specific address and content commitment, distinct from legal copyright ownership.
- **Buildings reference bricks.** Adding a work to an album, collection or dataset does not grant a license or transfer rights.
- **No Road registration markup.** An IP originator pays only underlying blockchain gas to activate an on-chain brick; off-chain creation is free.
- **No speculation.** Road infrastructure fee payments require qualifying blockchain-node operation **and** verifiable Road services. Royalties for creative works do not require running a node.
- **Operating-budget fee cap.** The Road may collect microfees on eligible economic settlements only within an authorized budget and reserve limit. When the cap is met, its fee drops to zero; underlying chain gas is unaffected.
- **Governance belongs to all users, weighted.** Universal participation with bounded contribution-based weighting, not balances, wallet counts or node counts.

## First proof of concept

Three original Solidity contracts: [YellowBrick](contracts/YellowBrick.sol), [YellowBrickFactory](contracts/YellowBrickFactory.sol), and [YellowBrickBuilding](contracts/YellowBrickBuilding.sol). A factory deploys EIP-1167 minimal-proxy brick contracts; a building references registered bricks. No license or royalty module is implemented yet.

```bash
npm install
npm run compile
npm test
```

## Design documents

- [Architecture](docs/ARCHITECTURE.md)
- [Draft public utility constitution](docs/CONSTITUTION.md)
- [Roadmap](docs/ROADMAP.md)

**Status:** experimental and unaudited. On-chain registration records an assertion, not proof of copyright ownership. No deployment with real funds. The existing CC0 LICENSE is retained unchanged. These new code files use SPDX MIT identifiers; the project's final consolidated code licensing needs an explicit decision.

Inspired by prior explorations in [InfinityMint](https://github.com/0x0zAgency/infinitymint), but developed independently.
