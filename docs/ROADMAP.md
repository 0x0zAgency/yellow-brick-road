# Yellow Brick Road roadmap

## Completed prototype foundation
- CREATE2 / EIP-1167 per-work brick contracts, independent owners, no factory markup.
- Composable album and regeneration buildings referencing existing IP bricks.
- Opt-in creator-issued license declarations, expiry and revocation.
- Immutable payout-policy versions and $1 mock-dollar royalty flow split 80/20.
- Replay-resistant per-license usage identifiers, evidence commitments and pull-based claims.
- Entirely local deterministic demo (`npm run demo`) and automated Hardhat test cases.

## v0.3 public-utility and governance prototypes
- Thirty-day Road treasury with voted funding targets, exact fee caps, and reserve carry-forward.
- Governance-attested actual-node and Road-service eligibility, with one-time service payout IDs.
- Weighted voting with a universal enrolled-user baseline, quorum, timelocks and voting snapshots.
- Simulation tests for identity duplicates, unauthorized transfers, node eligibility, replay protection and cap boundaries.
- These components are **not yet linked to real licensed settlement fees** and cannot prove unique human identity or physical blockchain node ownership.

## Next
- Enforce true signed license agreements, separate rights authorities, disputes, recipient authorization and creator revocation semantics.
- Benchmark fees, limits, token safety, evidence availability and audits. Test with adversarial ERC-20 mock implementations.
- Integrate verified licensed settlement events atomically with the fee treasury. Current standalone collections accept caller-supplied amount.
- Replace trusted node-service attestations with credible, challengeable operation and useful-work verification.
- Replace centralized identity enrollment with independently auditable privacy-preserving Sybil defenses; finalize weight formula.
- Chain-independent IP IDs, upgrade/portability design, multiple collection structures and UI explorer.

## Safety / scope
Current creator-royalty settlement uses freely-mintable MockUSD and has **zero Road operating fee**; the separate experimental treasury collects simulated, voluntary fees. It demonstrates accounting, not copyright or actual model use verification. Smart contracts are experimental, unaudited, and unsuitable for real assets until external security and legal reviews.
