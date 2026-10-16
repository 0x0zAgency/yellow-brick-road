# Yellow Brick Road: utility and governance prototype v0.3

**Status: local/test-only. Not production governance or a source of financial return.**

## What now compiles and is tested

- `RoadGovernance.sol`: enrollment for attested distinct users, 1–5 fixed contribution voting weight, proposals restricted to specific Road treasury and registry contracts, two-day vote, one-day timelock, distinct-voter and weight quorum.
- `RoadNodeRegistry.sol`: governance-authorized attestation of node and measured-service evidence; revocation through a subsequent governance decision.
- `RoadTreasury.sol`: one test-token treasury; community-authorized budget capacity, at most 1% fee rate, hard integer cap, expiry and governed period rollover, carried-forward unspent funds, and one-time work IDs for node service payouts.
- `test/road-utility.test.js`: budget cap (including a final partial fee), payout eligibility, unauthorized actions, voting, identity duplication, replay protection, period expiry and reserve carry-forward.

## Not yet integrated with the license/royalty system

The treasury is intentionally independent of `RoadRoyaltySettlement.sol`, which continues to send **100% of licensed settlement value to the approved rights-holder split**. Road treasury contributions in the current proof of concept are made by manually invoking `collect`, with the payment amount supplied by that caller. The prototype **does not verify that a fee came from an actual commercial transaction** and is **not** permissioned to skim royalties. The next technical milestone is an atomic integration with a verified, replay-resistant settlement ID and fee quote, with economic authority explicitly established through licensed terms, not automatically inferred.

## Operational constraints

1. Registration gas goes to the underlying EVM network, not the Road treasury. The Road mint factory adds no markup.
2. Road node/operator payments require both a governance-recognized qualifying blockchain node and a useful Road service. Proof hashes and approval in this prototype are **attestations**. They do not demonstrate actual physical operation, node ownership, authenticity of performed work or independence of the operator.
3. The governance enrollment attester is trusted. One wallet equals neither one person nor a secure proof of unique identity. A large attester may manufacture weight. `MAX_WEIGHT=5` is a per-registered-identity limit, not a defense against fraudulent identities.
4. `RoadGovernance` can invoke arbitrary functions on the two allowlisted target contracts if a proposal passes. An independent security assessment must narrowly scope executable actions and prevent arbitrary external target configuration.
5. Any road microfee is **budget-capped**, and when capacity is exhausted `quote` returns zero. Fees cannot be charged on arbitrary external blockchain transactions. Only opt-in or contract-integrated usage flows can participate.
6. Period duration is currently fixed at 30 days. A new period can only open after expiry and after an executed governance vote. Unspent treasury balances reduce new permitted funding. No new period can be opened solely to reset counters mid-period.
7. The settlement and node-registry contracts are experimental, unaudited, and use a freely mintable mock token in tests. Do not operate a live treasury or custody actual IP royalties with them.

## Remaining security and public-utility work

- Independent proof/verification of actual base-chain node control and demonstrated Road service quality, plus challenges, revocation and fraud penalties.
- Privacy-preserving distinct-user credentials, contribution weight calculation, delegation, appeals, anti-capture limits and formal constitutional voting thresholds.
- Approved settlement endpoints, explicit supported-token allowlists, nonstandard ERC-20 protections, accurate fee-on-settlement accounting, fuzz and invariant tests, multiple rights types, arrears and dispute procedures.
- No native investment token, passive yield, node sales scheme, automatic staking payouts or usage-as-an-investment advertising.
- External smart-contract security, legal/financial structure and privacy review before production usage.

## Constitution boundary

A public-utility governance vote can authorize fees, budgets and node service compensation. It must not revoke someone else's copyright, arbitrarily replace immutable source commitments or retroactively rewrite an existing rights-holder agreement. Intellectual property authority and community infrastructure governance are distinct domains.
