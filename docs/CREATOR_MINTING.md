# Musician → Yellow Bricks: creator minting protocol (design v0.1)

This document audits the existing on-chain API against the FL Studio → rights-aware IP registration flow. The frontend prototype is a **local registration-packet builder**, not a storage server or minting service.

## User journey

1. **Identity:** connect a self-custodied EVM wallet, or start assisted onboarding. Assisted wallets must be created or derived by a security-reviewed wallet service (ideally account abstraction / user-controlled recovery) and assigned with auditable batch receipts. A node must **never** export private keys or become a permanent unilateral rights custodian. The current frontend simulates this choice only.
2. **Collect:** accept master WAV/AIFF/FLAC, MP3 preview with embedded ID3 metadata, cover image, FL Studio project/stems, metadata TXT/JSON. Read sidecar metadata only with user consent; reconcile with embedded tags and user edits. A sample rate and codec extractor is a later integration.
3. **Model separate IP:** original composition (musical work) and its recording (master) are distinct rights objects where applicable; cover artwork is independently owned and licensed. WAV/MP3 are asset representations of the master, not automatically separate rights objects. A Building defines the FL Studio session, release, album, or training context and its relationship/role/rights evidence.
4. **Validate and preview:** capture creators, contributors, rights claims, rights territories and dates, shares, identifiers, derivation, third-party samples and clearances, AI license options. Do not assert copyright adjudication or verified credits.
5. **Store:** produce a *public*, separately minimized metadata manifest and encrypted *private* assets before network upload. Prefer encrypted bytes on IPFS with CID of **ciphertext**, plus salted/blinded commitments to unreleased originals where appropriate. For alternate storage use a **governance-approved provider registry with immutable policy IDs, audit events and an exit/migration process**. No live storage integration exists.
6. **Grant access:** release decryption capability only after proof of an accepted license/token entitlement, with expiration, scope, audit log and revocation for future access. Revocation cannot revoke copies already downloaded. Key wrapping/KMS and independent keyholder recovery require threat review; storing an AES key or raw private asset on-chain is prohibited.
7. **Mint:** after explicit wallet approval, verify chain, nonce, factory, required rights evidence and upload receipts; call factory for each Brick, verify confirmed events and persist chain ID + contract address + transaction hash + metadata digest. Link the Bricks into a contextual Building with relation evidence. Current `YellowBrickFactory.deployBrick` requires `msg.sender` to be the originator, so **relayers/account abstraction require a new authorization path**; do not silently mint to the relayer. There is no production mint integration yet.
8. **Receipt:** show human-readable aliases, *valid* EVM address(es), all Brick IDs, CIDs, storage commitments, relationship IDs, licenses, timestamp, transaction hashes, recovery information, and export an open JSON artifact for external APIs.

## The 0x0z namespace

EVM addresses must be `0x` plus forty hexadecimal digits. **`0x0z...` is invalid** due to `z`. Use `0x0z:artist-name` as a verified display alias, separate from EIP-55 addresses, and define chain/address mappings in a globally resolvable signed namespace. A deterministic vanity `0x0...` prefix is possible but must never be confused with a brand identity or legal ownership. ENS-style names are another option.

## Machine-readable schemas

- [Yellow Brick metadata v1](../schemas/brick-metadata-v1.schema.json): typed identity, credits, music, claims, assets, relationships, payouts and extensibility.
- [Building context v1](../schemas/building-context-v1.schema.json): context, member roles, permission/evidence references, and extensions.

Both are provisional design schemas, not EVM token standards and not proof of rights. The MP3 prototype parses standard ID3v2.3/v2.4 title, artist, album, genre, BPM, key, ISRC and APIC cover art where readable; cover art still requires its own rights review. Full DDEX import/export and FL Studio direct integration are not implemented.

## Metadata surface (expandable, public vs private)

| Domain | Fields and semantics |
|---|---|
| Identity | schema/version, IP identifier, object type, title, alternate titles, language, description, provenance, persistent fingerprints, creators |
| Music identifiers | ISRC (recording), ISWC (composition), UPC/EAN (release), IPI/CAE and ISNI (contributors), ISMN if appropriate; each optional and marked verified/unverified |
| Credits | legal/stage names, pseudonyms, roles (composer, lyricist, vocalist, producer, engineer, artist, designer), shares, identifiers, jurisdiction, contact privacy |
| Audio | sample rate, bit depth, channels, codec, runtime, loudness, BPM, key, genre, instruments, lyrics language, ISRC, explicit flag, version/mix/master |
| Production | DAW/version, session date, participants, samples and licensed elements, stems, project revisions, creation proofs, device/workflow provenance |
| Rights | master vs composition vs art, ownership claims, claimant verification, geographic scope, start/end, exclusivity, chain of title, conflicts/disputes, signatures |
| Licensing | purpose (stream/sync/remix/train/infer), terms URI + hash, licensee, fee basis, attribution, revocation, downstream obligations, training opt-in |
| Economics | beneficiaries, payout address, split versions totaling 10,000 bps, currency/asset, distributor/label shares, tax jurisdiction and private payout details |
| Assets | role, content type, format, original checksum, size, encrypted CID, plain digest kept private if sensitive, encryption/alg/key policy, preview, private/public |
| Storage | provider ID, board policy version, gateway(s), pin/retention policy, integrity receipts, erasure/migration options, encryption envelope references |
| Relationships | source / cover art / derived from / composition embodies / album member / dataset member; role, evidence commitment, authorization status |
| AI lineage | training permission, rights constraints, audit manifest, model/dataset version, usage events, attribution rules, generation royalty allocation |
| Interoperability | JSON Schema, content-addressed manifests, DDEX RIN for sessions, ERN for releases, RDR where relevant, C2PA when applicable, extensions |

A hash of a source file is not an encryption mechanism. Public fingerprints of unreleased files may leak membership information; use a reviewed commitment scheme appropriate to the threat model. Do not put contact info, legal agreements, rights evidence, secret URLs, decryption keys or plaintext unpublished works into public JSON.

**Recommended compatibility:** DDEX RIN describes recording sessions and contributor roles; DDEX ERN handles release metadata and deal terms. Mapping adapters may require DDEX's implementation license. [DDEX RIN](https://ddex.net/standards/recording-information-notification/) · [DDEX ERN](https://ddex.ddex.net/standards/release-delivery/) · [IPFS privacy](https://docs.ipfs.tech/how-to/privacy-best-practices/).

## Existing Solidity contracts: audit

| Contract | Currently provides | Missing for this flow |
|---|---|---|
| `YellowBrick` | Immutable originator, content hash and ID, mutable controller, versioned metadata URI and **optional metadata digest** with committed updates | Field-level signatures, provenance/dispute status, permission-controlled sensitive URI; contract represents a work, not an ERC-721 token |
| `YellowBrickFactory` | Predictable CREATE2 clone by calling signer, creator == `msg.sender`; **new digest-committed registration path** | Signed mint intents/permit + relayer entry, safe batch mint/partial failure handling, chain-aware receipts, fee sponsorship, factory and schema version registry |
| `YellowBrickBuilding` | Typed Building, one relationship + evidence hash per Brick, append-only history | Rich per-member **context**, multiple roles for the same Brick, versioned membership/permissions, signer consent when needed, building metadata digest |
| `YellowBrickLicense` | Controller-issued, licensee-specific fixed-price use and hashed terms | License families/usage units, permission type, rights layers, territory, identity proof, attribution, revocation semantics for prior model training, delegated signatures |
| `RoadRoyaltySettlement` | License-keyed pay-per-use, split snapshots, replay protection, pull claims, zero Road fee | Multi-Brick/payee pooled settlements, invoice/usage batch Merkle proofs, model lineage evidence policy, accounting denominators, disputable claims, escrow for contested rights |
| `RoadNodeRegistry` | Node/service eligibility attestations, governance-only | **Separate** approved storage provider policy, checks for encryption/availability, key custody independence, SLA and challenge mechanisms |
| `RoadTreasury` | Governance-capped utility fee in independent module | No fee hookup to creator minting; policy must preserve no Road identity/mint fee and respect future public utility budgets |

**Key security issues:** source URI mutability must not quietly change a public commitment; controller wallet loss or compromise risks rights representation; identity attestation must resist Sybil/impersonation; shared master/composition owners cannot be assumed the same; copyright registration and rights transfer require real-world legal verification; an IP Brick is **not automatically a tradable NFT** and transferring a control key does not transfer copyright.

## Prototype scope and acceptance criteria

The `Mint Studio` UI provides artist identity choice, local file hashing, text metadata import, track metadata editing, training rights selection, storage intent, optional composition Brick, independent artwork Brick, a simulated Building, validation and a downloadable registration packet.

It **does not** encrypt, upload to IPFS, allocate wallets, call contracts, sign messages, create approvals, collect payments, nor claim successful minting. All those actions require explicit cryptographic, backend and chain integrations, audits and user confirmation.

**Next contract implementation order:** signed creator mint permit + deterministic metadata digest policy; versioned rights-aware Building member roles; approved encrypted storage provider registry; encrypted asset gateway and audited capability access; testnet mint and verified receipt; authenticated licensing/usage reporting.
