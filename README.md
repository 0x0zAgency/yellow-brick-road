# 0x🟨 Road

**The Intellectual Property Protocol for the Internet.**

*The Yellow Brick Road of 0x0z.*

> **The asset carries the rights. Not the platform.**
>
> Platforms execute. Objects govern.

## QuickStart

Requires **Node 24** and a browser wallet for real local minting.

```sh
git clone https://github.com/0x0zAgency/yellow-brick-road.git
cd yellow-brick-road
npm run setup:dev
npm run dev
```

Start **Docker with Compose** first, or run **IPFS Desktop** with its local Kubo API at
`http://127.0.0.1:5001`. The launcher reuses a healthy IPFS node; otherwise it starts
Kubo through Docker. Ganache, the factory, Explorer, IPFS bridge and Player are
prepared automatically.

Open [Road Explorer / Mint Studio](http://127.0.0.1:5173) or
[YBR Player](http://127.0.0.1:4173). Press **s** in the startup dashboard to reveal
the development wallet and Player login details.

### Prefer desktop apps?

Download [Ganache](https://github.com/trufflesuite/ganache-ui/releases) and
[IPFS Desktop](https://github.com/ipfs/ipfs-desktop/releases), start both, then run
the same commands above. Docker is optional when IPFS Desktop is running.

- **IPFS Desktop:** local API `http://127.0.0.1:5001`. For another local API address,
  start with `YBR_KUBO_RPC=http://127.0.0.1:PORT npm run dev`.
- **Ganache:** RPC `http://127.0.0.1:8545`, chain ID **1337**, and the same mnemonic
  and derivation path as YBR's selected development wallet. Network ID alone is
  insufficient. A fresh checkout uses the public test mnemonic
  `myth like bonus scare over problem client lizard pioneer submit female collect`,
  with account 0 at `m/44'/60'/0'/0/0`
  (`0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1`).
  Configure and save a Ganache workspace with these settings before launching YBR.

The desktop Ganache node replaces the managed Ganache process. It must expose
unlocked test accounts; YBR refuses a mismatched wallet or chain.

### Mint your first Brick

Add the local RPC above to your browser wallet (chain **1337**, currency **ETH**)
and import a Ganache **test** account. In Mint Studio, connect, attach files, review
permissions, select **Local Ganache**, and approve the registration transactions.
The dashboard shows the active factory address if needed. Without a wallet,
Mint Studio runs a simulation.

For stored uploads, enable encrypted IPFS storage and download the recovery backup.
Publishing an NFT cover is a separate public-artwork opt-in after minting; Player
playback permissions are separate again. Use development seeds only.

[Full setup](docs/INTEGRATED_DEV_STACK.md) ·
[Wallet profiles](docs/GANACHE_WALLETS.md) ·
[IPFS storage and recovery](docs/IPFS_YBR_STORAGE_PILOT.md) ·
[NFT covers and deployment](docs/NFT_COVERS.md)

## WHY: The Internet Is Missing an IP Layer

The internet was built to move information, not to preserve the rights attached to it.

A photograph can be shared, a song sampled, a book digitized, and a creative archive used to train artificial intelligence. The content moves across systems, but its identity, provenance, permissions, attribution, and compensation rarely travel with it.

Every platform is left to reconstruct that information, build its own licensing machinery, or ignore it.

**This is not simply a legal problem. It is an architectural problem.**

We built digital networks around files, databases, and platforms instead of rights-aware assets.

The internet needs a common intellectual property layer where creative works can identify themselves, communicate permissions, establish relationships, and participate in economic transactions without depending on the platform that holds them.

**The work should carry its rights wherever it goes.**

[Read our founding manifesto: The AI Rights Object Standard](https://github.com/0x0zAgency/yellow-brick-road/blob/main/MANIFESTO.md)

## WHAT: The Yellow Brick Road

0x🟨 Road is an open protocol for executable intellectual property.

It provides a shared language for an individual work's identity, claimed rights, licensing conditions, attribution, relationships, and economic settlement.

The Road consists of three fundamental concepts.

### 🟨 Yellow Bricks: Identity

A **Yellow Brick** is an individually addressable intellectual property object.

A song. A photograph. A manuscript. A design. A dataset. A software component.

Each Brick carries or references its persistent identity, provenance, rights information, and machine-readable licensing terms.

A Brick can exist independently of any album, application, publisher, platform, or marketplace.

It is designed to remain identifiable wherever it travels and however it participates in other creative works.

**Bricks establish what the IP is.**

### Buildings: Context

A **Building defines the context in which intellectual property is organized, presented, or used.**

A song can be a standalone recording, a track on an album, part of a compilation, the soundtrack to a film, or source material for an AI training dataset.

The underlying IP remains identifiable, but its role and the terms governing its use can differ in each context.

Buildings describe those contexts.

An **album** organizes recordings, compositions, and artwork into a release.

A **compilation** brings works from multiple creators into a shared publication.

A **book** organizes writing, illustrations, photography, and other contributions into a published work.

A **photograph** can be a finished work or a composition containing independently identifiable creative elements.

A **schema** defines how information and other IP objects relate within a structured system.

A **training dataset** organizes source material for machine learning, recording the permissions, attribution requirements, and other conditions governing its use.

Buildings are not limited to existing media formats. They can describe any structured use of intellectual property, including formats that have yet to be invented.

Each Building provides a machine-readable context for participating Bricks, defining their relationships, roles, and applicable terms.

A Building describes a use; it does not automatically authorize that use. Authorization comes from the relevant rights and licenses.

**Bricks establish what the IP is. Buildings establish what the IP is doing.**

### The Road: Interoperability

The **Road** is the common protocol connecting Bricks, Buildings, creators, and the systems that use their work.

It provides shared standards for discovering intellectual property, understanding relationships, expressing permissions, recording usage, and settling value.

The Road is not a store, a record label, an AI company, or a marketplace.

It is the protocol those systems can share.

Just as HTTP allows different systems to exchange information, the Road aims to give different systems a common way to interact with intellectual property.

**Bricks are identity. Buildings are context. The Road is interoperability.**

## HOW: Executable Intellectual Property

Instead of separating content from its rights, the Road treats intellectual property as a programmable object.

Every Yellow Brick is designed to answer three fundamental questions:

**Who owns me?**

The object maintains a persistent identity, provenance references, and information about the parties claiming or controlling its rights.

**How may I be used?**

The object communicates machine-readable licensing terms and the conditions under which a work may be accessed, incorporated, reproduced, trained upon, or transformed.

**What is owed, and to whom?**

The object participates in programmable royalty agreements, identifies eligible recipients, and supports transparent accounting and settlement.

An IP object can communicate a rights claim, but registration alone does not legally establish ownership. Valid permissions depend on the authority of the rights holders and their agreements.

The platform doesn't need to invent an entirely new rights system for every category of content.

It implements the protocol and interacts with the objects.

**Implement once. Rights travel with the asset.**

### AI Training, Provenance, and Generational Rights

Artificial intelligence makes the need for a native intellectual property layer especially urgent.

Creative works enter training datasets carrying identities, owners, histories, and rights. Traditional AI pipelines frequently separate the data from that information, making attribution and compensation difficult to maintain.

The Yellow Brick Road proposes a different architecture.

A creator can authorize the use of a Yellow Brick for AI training under machine-readable terms. Those terms may require attribution, auditable inclusion in training records, limitations on model use, and royalties arising from subsequent generations.

Training datasets become Buildings that establish the context and permissions under which source IP is used.

Models reference the datasets and licensed sources that contributed to their development.

Generated works can establish additional relationships to their model lineage and source materials.

Through these relationships, the protocol preserves an auditable chain of provenance and contractual obligations from the original intellectual property through training, model development, generation, and subsequent reuse.

Consider a photographer who authorizes an image for AI training.

The photograph's Yellow Brick could specify that:

- The image may be used for training under an agreed license.
- Its identity and attribution must remain in the training provenance records.
- Models trained on it must maintain the agreed source records and applicable obligations.
- Qualifying generations create royalty obligations according to an established compensation formula.
- Subsequent authorized uses must preserve the terms that the license requires to continue.

The AI developer does not need to create a custom accounting system for every photographer, musician, writer, or publisher.

Its infrastructure reads the rights, records the authorized use, maintains the source relationship, and settles compensation according to the agreement.

The Road also distinguishes between documented inclusion in a training dataset and scientifically demonstrated influence on a particular generated output.

Current AI systems generally cannot reliably reconstruct the exact contribution of every training example to every generation.

Where individual influence cannot be established, licenses can define transparent royalty pools or predetermined allocation methods for eligible source providers. More precise attribution methods can be supported as they become verifiable.

**The knowledge does not lose its history when a machine learns from it.**

### Rights-Native Artificial Intelligence

The Yellow Brick Road is not designed merely to account for intellectual property consumed by today's AI systems.

It is intended to establish a standard for building future AI models around rights-aware knowledge objects from the beginning.

In a rights-native AI ecosystem, training begins with authorized, independently identifiable intellectual property.

Datasets preserve their provenance and licensing obligations.

Model developers incorporate the Road's rights and accounting interfaces into their training and generation pipelines.

Compliant systems can identify the source datasets used to train a model, maintain applicable licensing and attribution records, and produce auditable usage events from which compensation can be calculated and distributed.

Rather than reconstructing rights after a model has already been trained, the necessary records and obligations are maintained throughout its lifecycle.

Compliance must be measurable, independently auditable, and interoperable across model developers, not simply asserted by a platform.

The objective is a future in which AI models are built rights-aware by default, and the creative works that make machine intelligence possible remain identifiable, attributable, and economically connected to their creators.

**AI should not have to remember who taught it. It should never be allowed to forget.**

### No Fees to Participate

The Road is designed as public infrastructure, not a tollbooth for intellectual property.

**No fees to create an IP identity, establish relationships, or participate in the protocol.**

On-chain transactions may still incur the underlying blockchain network's gas costs.

Commercial transactions compensate rights holders according to their licensing agreements.

Any future Road infrastructure funding must be transparent, democratically authorized, limited to actual operating needs, and capped when those needs are met.

Creators do not need to operate blockchain nodes to own intellectual property or receive royalties.

The Road is not a speculative token economy or a system for collecting passive rent from creative work.

Its infrastructure exists to support the circulation, recognition, and compensation of intellectual property.

**The purpose of the Road is to make rights portable and economically useful, not to profit from their existence.**

## WHERE: A New Creative Economy

The Yellow Brick Road leads toward a new creative economy, one designed for an era in which people and intelligent machines create, collaborate, learn, and transact at unprecedented scale.

An economy where intellectual property remains connected to its origins, where rights are understandable across platforms, and where creators can participate in the value their work helps generate.

Rights-native AI models are an essential part of this future.

By building provenance, permissions, attribution, and royalty accounting into the foundations of AI training and generation, we can make responsible participation a native capability rather than an afterthought.

But the ambition reaches beyond artificial intelligence.

Music, literature, photography, film, research, software, and creative industries yet to emerge can all benefit from the same shared infrastructure.

**Fairness** means creators have a meaningful say in how their work is used and can receive compensation under transparent, agreed terms.

**Transparency** means the relationships between works, their uses, and their economic outcomes can be independently inspected and verified.

**Opportunity** means creators of every size can participate without depending on the permission, accounting systems, or economic priorities of a single platform.

The Road does not determine what creativity is worth. It gives creators and the systems that use their work a common foundation on which value can be negotiated, recognized, and exchanged.

This is the future we intend to build.

**A new creative economy where knowledge retains its history, creativity retains its value, and everyone who contributes has a path to participate in the prosperity that follows.**

---

## Explore the Protocol

- [The AI Rights Object Standard: Founding Manifesto](https://github.com/0x0zAgency/yellow-brick-road/blob/main/MANIFESTO.md)
- [Protocol Architecture](https://github.com/0x0zAgency/yellow-brick-road/blob/main/docs/ARCHITECTURE.md)
- [Public Utility Constitution](https://github.com/0x0zAgency/yellow-brick-road/blob/main/docs/CONSTITUTION.md)
- [Road Explorer Interface](https://github.com/0x0zAgency/yellow-brick-road/tree/main/web)
- [YBR Player: standalone player + opt-in Ganache Road music](https://github.com/0x0zAgency/yellow-brick-road/tree/main/apps/ybr-player)
- [Road public music integration for artist-made players](https://github.com/0x0zAgency/yellow-brick-road/blob/main/docs/ROAD_PUBLIC_MUSIC.md)
- [Technical Roadmap](https://github.com/0x0zAgency/yellow-brick-road/blob/main/docs/ROADMAP.md)

*The Yellow Brick Road is an experimental open-source protocol under active development. Current smart contracts demonstrate IP identity, contextual relationships, licensing declarations, royalty accounting, and governance in local test environments. Registration does not independently establish legal ownership, and production systems require further verification, security auditing, and legal review.*

**0x🟨 Road. The missing layer of the internet.**

### Wallet-signed Mint Studio on local Ganache

Use Node 24. Install dependencies with `npm install` in the repository
and in `web/`. Keep Ganache running in its own terminal:

```sh
npm run ganache
```

In a second terminal deploy the factory once for this chain instance:

```sh
npm run ganache:deploy
```

The command prints the factory address and saves the chain ID, deployment hash,
and address in `.road-local/factory.json`. It only deploys to a loopback RPC on
chain **1337**. Restarting Ganache without persistent chain storage invalidates
old addresses; deploy again and paste the new address into the studio.

Start the frontend with `cd web && npm run dev`. In your browser wallet, add the
local RPC `http://127.0.0.1:8545`, chain ID **1337**, currency **ETH**. Import one
of the disposable accounts printed by Ganache into a separate development wallet.
These public deterministic accounts are only for local testing. The frontend
never asks for a private key. Ganache's network ID can differ from its chain ID;
use `eth_chainId`, not `net_version`, when configuring the wallet.

In Mint Studio connect the wallet and complete the files and rights steps. In
**Step 4 — Review**, select **Local Ganache**, check the RPC URL and chain ID, and
paste the factory address. Without a connected wallet, the original simulation runs automatically. Attach files, review metadata, then confirm each Brick in your wallet.
Each Brick is a separate transaction; the factory charges no platform fee.
The client checks both wallet/RPC chain IDs and their latest common block hash,
simulates each call, waits for a mined receipt, checks the factory event and
registry, and reads the deployed Brick's controller, content and metadata digests,
and URI. Receipts show transaction hashes, addresses and block numbers.

Download the JSON packet after completion, especially if a later signature is
rejected or a transaction times out. A pending transaction may still be mined;
inspect its hash before starting another work. Confirmed transactions cannot be
undone by canceling later signatures. The studio does not automatically retry a
partial batch. Receipt evidence and exact committed metadata bytes remain in
memory until you export them; refreshing loses the session and in-memory encrypted
copies. Ciphertext already pinned to IPFS survives independently.

Mint Studio can optionally pin browser-encrypted originals and metadata to a
local Kubo node. The **Recover files** screen imports a private recovery backup,
retrieves pinned ciphertext, and verifies/decrypts it in the browser. **My Bricks**
can additionally compare recovered metadata with the digest read from the selected
contract. See the [encrypted IPFS pilot and recovery guide](docs/IPFS_YBR_STORAGE_PILOT.md).
Without the opt-in IPFS path, uploads remain simulated. Remote delivery entitlements
and license-based decryption are not implemented. `road-local://sha256/…` is a local
metadata commitment, not a remotely retrievable storage URI. A composition
without a separate source file uses its exact metadata digest as its content hash;
it does not claim to hash a composition source recording. The contextual Building,
license quotes and payout proposals remain off-chain. Registration does not prove
ownership. **Simulated** mode never requests a mint signature and produces no
transaction hashes or contract addresses.

Run the frontend regression tests with `cd web && npm test`, the production build
with `npm run build`, and `npm run test:wallet` from the repository root. The latter
starts a disposable HTTP Ganache instance and exercises the same mint service
through an EIP-1193 wallet adapter that signs transactions with a test-only key.
It does not exercise a browser extension's confirmation UI.

### Connected wallets and Sepolia

Mint Studio automatically uses the original simulation while no wallet is connected.
A connected wallet enables real minting; choose Ganache or Sepolia. The studio
recognizes a wallet already on Sepolia and selects it automatically. Existing wallet
connections are restored without opening a connection prompt. Wallet errors never
silently fall back to simulation, and a disconnect during a real batch stops the
batch while retaining its transaction evidence.

For Sepolia, switch your wallet to chain **11155111** and enter an existing deployed
`YellowBrickFactory` address for Sepolia. The studio reads the chain through the
wallet provider, so no separate RPC key is required. Factory addresses are kept
separately for each network configuration for the current session. The same receipt,
event, registry and contract-state checks apply. Merely connecting does not send
transactions: review the mint and explicitly approve each wallet request. Each
approved transaction uses Sepolia test ETH for gas. There is no automatic public
factory deployment, funding, or mainnet support.

Changing the account or network invalidates an open confirmation review. With no
wallet connected, continuing starts the simulation again. Plaintext files, metadata
and decryption keys stay in the browser in both modes; the optional IPFS path
publishes only their encrypted containers. Integration tests exercise both network paths
using disposable local chains, including one configured with Sepolia's chain ID;
they do not spend funds on public Sepolia.

## Start the integrated YBR development stack

For local testing, the main web app now launches the **standalone YBR Player**, Ganache (or reuses your existing chain 1337), the verified YellowBrickFactory, and one opt-in synthetic audio Brick together:

```sh
npm run setup:dev  # first time only
npm run dev
```

The same integrated workflow runs from `cd web && npm run dev`. Main web: `http://127.0.0.1:5173` • YBR Player: `http://127.0.0.1:4173` • Public Road Music: `http://127.0.0.1:5173/road/api/music`. Only our generated test recording is automatically published on disposable local Ganache; private IPFS and other creator assets remain private. For standalone Vite, use `cd web && npm run dev:web`. Read [integrated setup and safety guidance](docs/INTEGRATED_DEV_STACK.md).
