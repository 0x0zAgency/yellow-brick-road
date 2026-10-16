# Roadmap

### Phase 1: Individual bricks (prototype)
- EIP-1167 minimal-proxy IP contracts, deterministic CREATE2 addresses and metadata.
- No Road platform registration fee; deployer pays base-chain gas.
- Test repeat registration, independent controllers and permission checks.

### Phase 2: Buildings (prototype)
- Deploy album and regeneration structures referencing separate bricks.
- Test that a brick may appear in several structures without a transfer.
- Distinguish membership assertion from permission to use.

### Phase 3: Licensing, usage and royalties (future)
- Versioned AI and non-AI licenses and proof-carrying usage events.
- Source provenance graph with authenticated and replay-protected usage batches.
- Exact integer accounting for per-IP splits, including an 80/20 test.

### Phase 4: Funded node services (future)
- Blockchain-node operation verification plus challengeable Road service measurements.
- Approved-budget maximum collection and cap-boundary tests.
- Treasury roll-forward, audited service payouts, operator appeals.

### Phase 5: All-user weighted governance (future)
- Baseline participation, capped earned influence, privacy-respecting anti-Sybil protections.
- Proposals, timelocks, weighted snapshots, thresholds and public reports.

**Release gates:** clean Solidity compilation and reproducible tests, contract security review, legal analysis, and an independent audit before processing real royalties.
