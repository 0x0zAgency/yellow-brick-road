# Yellow Brick Road roadmap

## Completed prototype foundation
- CREATE2 / EIP-1167 per-work brick contracts, independent owners, no factory markup.
- Composable album and regeneration buildings referencing existing IP bricks.
- Opt-in creator-issued license declarations, expiry and revocation.
- Immutable payout-policy versions and $1 mock-dollar royalty flow split 80/20.
- Replay-resistant per-license usage identifiers, evidence commitments and pull-based claims.
- Entirely local deterministic demo (`npm run demo`) and automated Hardhat test cases.

## Next
- Enforce true signed license agreements, separate rights authorities, disputes, recipient authorization and creator revocation semantics.
- Benchmark fees, limits, token safety, evidence availability and audits. Test with adversarial ERC-20 mock implementations.
- Road treasury with transparent vote-approved period caps and carried reserves (not implemented).
- Attested qualifying blockchain-node service and operator eligibility (not implemented).
- All-user Sybil-resistant weighted governance with open auditability (not implemented).
- Chain-independent IP IDs, upgrade/portability design, multiple collection structures and UI explorer.

## Safety / scope
Current economic flow uses freely-mintable MockUSD and has **zero Road operating fee**. It demonstrates accounting, not copyright or actual model use verification. Smart contracts are experimental, unaudited, and unsuitable for real assets until external security and legal reviews.
