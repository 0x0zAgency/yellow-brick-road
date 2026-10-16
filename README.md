# 0x🟨 Road

**The Intellectual Property Protocol for the Internet.**

*The Yellow Brick Road of 0x0z.*

> **The asset carries the rights. Not the platform.**
>
> **Platforms execute. Objects govern.**

## Why: The internet is missing an IP layer

The internet was built to move information, not to preserve the rights attached to it.

A photograph can be shared, a song sampled, a book digitized, and a creative archive used to train artificial intelligence. The content moves across systems, but its identity, provenance, permissions, attribution, and compensation rarely travel with it.

Every platform is left to reconstruct that information, build its own licensing machinery, or ignore it.

**This is not simply a legal problem. It is an architectural problem.** We built digital networks around files, databases, and platforms instead of rights-aware assets.

The internet needs a common intellectual property layer where creative works can identify themselves, communicate permissions, establish relationships, and participate in economic transactions without depending on the platform that holds them.

**The work should carry its rights wherever it goes.**

[Read the original founding manifesto: The AI Rights Object Standard](MANIFESTO.md).

## What: The Yellow Brick Road

0x🟨 Road is an open protocol for executable intellectual property. It provides a shared language for an individual work's identity, claimed rights, licensing conditions, attribution, relationships, and settlement.

### Yellow Bricks: Identity

A **Yellow Brick** is an individually addressable intellectual property object: a song, photograph, manuscript, design, dataset, or software component.

Each Brick can reference a persistent content commitment, its originator and rights controller, metadata, and machine-readable licensing terms. A Brick is not confined to one album, publisher, application, or platform.

**Bricks establish what the IP is.**

### Buildings: Context

A **Building defines the context in which intellectual property is organized, presented, or used.** This is more than a collection of files: it describes the role and relationships of the participating IP.

A song may appear in an album, a compilation, a film, or a training dataset. Each context describes a different use and may be governed by different permissions.

An **album** organizes recordings, compositions, and artwork into a release. A **compilation** brings works from multiple creators together. A **book** assembles text, illustrations, and photographs. A **photograph** may itself be a finished work incorporating independently identifiable elements. A **schema** defines relationships among information objects. A **training dataset** records the source works, authorized uses, attribution rules, and other agreed conditions of training.

Buildings describe these relationships without replacing the underlying Bricks. Merely referencing a work does not grant permission: authorization comes from the rights and licenses applicable to that context.

**Buildings establish what the IP is doing.**

### The Road: Interoperability

The **Road** is the common protocol connecting Bricks, Buildings, creators, and the systems using their work.

It allows software to find an IP object, understand how it participates in a given context, read applicable rights information, record authorized use, and settle value according to an agreement.

It is not a store, record label, AI company, marketplace, or a single blockchain. It is the common rights layer those systems can speak.

**Bricks are identity. Buildings are context. The Road is interoperability.**

## How: Executable intellectual property

Instead of separating content from rights information, the Road makes rights-readable objects part of the architecture.

An IP object should be able to answer:

**Who owns me?** A persistent identity, provenance record, and evidence of the parties claiming or controlling rights.

**How may I be used?** Machine-readable terms for access, training, publication, reproduction, transformation, and other contexts.

**What is owed, and to whom?** Agreed attribution requirements, eligible recipients, royalty allocations, and auditable settlement records.

The protocol records and communicates rights claims and agreements; it does not independently adjudicate copyright ownership. The platform implements the common protocol instead of inventing a different accounting system for each class of creative work.

**Implement once. Rights travel with the asset.**

### AI training, provenance, and generational rights

Artificial intelligence makes the need for a native intellectual property layer especially urgent.

Creative works enter training datasets carrying identities, owners, histories, and rights. Traditional AI pipelines frequently separate the data from that information, making attribution and compensation difficult to maintain.

The Yellow Brick Road proposes a different architecture.

A creator can authorize the use of a Yellow Brick for AI training under machine-readable terms. Those terms may require attribution, auditable inclusion in training records, limitations on model use, and royalties arising from subsequent generations.

**Training datasets are Buildings:** they establish the context and permissions under which source IP is used. Models can reference the dataset versions and licensed sources used in their development. Generated works can establish additional relationships to their model lineage and applicable source materials.

These relationships can preserve an auditable chain of provenance and contractual obligations through training, model development, generation, and subsequent reuse. A source work does not disappear into an anonymous dataset merely because a machine learned from it.

Importantly, **recorded inclusion in a training set is different from proof that a particular source caused or influenced a particular output**. Today, the exact contribution of every training example to each generation generally cannot be reliably reconstructed. The Road must not pretend otherwise.

Where source-by-source influence is not demonstrable, agreements can instead define transparent royalty pools or predetermined allocation rules for eligible training contributors. More precise contribution methods can be supported if they become verifiable.

The goal is not to make every AI platform independently reconstruct intellectual property rights. It is to give platforms a common protocol through which rights can be understood, honored, attributed, and compensated.

**The knowledge does not lose its history when a machine learns from it.**

### No fees to participate

The Road is designed as public infrastructure, not a tollbooth for intellectual property.

**No fees to create an IP identity, establish relationships, or participate in the protocol.** On-chain transactions still incur the underlying blockchain network's gas costs, which are not Road fees.

Creators receive compensation under their licensing agreements without needing to operate nodes. Any future Road infrastructure fees on eligible commercial transactions must be publicly authorized, limited to genuine operating needs, and stop at a defined funding cap. Those infrastructure charges are separate from royalties owed to rights holders.

The purpose is to make IP portable and economically useful, not to extract rent from its existence.

## A new foundation for the creative economy

AI may be the clearest example of the problem, but the solution applies to music, publishing, photography, film, software, design, research, education, and forms of digital media yet to be invented.

The internet gave every document an address.

Blockchains gave digital assets owners.

**The Road gives intellectual property a shared language for rights and economic participation.**

## Explore

- [The AI Rights Object Standard: Founding Manifesto](MANIFESTO.md)
- [Protocol Architecture](docs/ARCHITECTURE.md)
- [Public Utility Constitution](docs/CONSTITUTION.md)
- [Road Explorer Interface](web/README.md)
- [Technical Roadmap](docs/ROADMAP.md)
- [Prototype Utility Governance](docs/UTILITY_GOVERNANCE.md)

0x🟨 Road is an experimental open-source protocol. Current contracts demonstrate IP identity, contextual references, licensing declarations, royalty accounting, and public-utility governance in local test environments. Registration records claims rather than independently proving legal ownership. Model-lineage and rights propagation require trustworthy evidence, legally valid agreements, and further implementation. No production deployment, audited rights enforcement, or real royalty custody is represented here.

**0x🟨 Road. The missing layer of the internet.**
