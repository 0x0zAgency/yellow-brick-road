# YBR IPFS encrypted-storage pilot

## Scope

This is the first **real content-addressed upload** path for Yellow Brick Road. It is opt-in, local-first, and intended for small test assets only. Mint Studio hashes and encrypts original files in the browser and sends only the encrypted `0ZROAD01` container through the local YBR upload bridge into our own pinned Kubo node. New per-Brick metadata documents are likewise encrypted in the browser, pinned, and referenced by `ipfs://<CID>` in subsequent test-chain mints.

This is not a production storage, creator-recovery, rights licensing, or durable global availability guarantee.

## Start the persistent local node

Prerequisites: Docker Desktop or a Docker Engine with Compose, Node.js 24, and the YBR repository. From repo root:

```sh
npm run ipfs:up
npm run ipfs:status
```

`infra/ipfs/compose.yaml` starts official Kubo and persists its repository in the Docker named volume `ybr-kubo-data`. `docker compose down` or `npm run ipfs:down` stops the container **without deleting its volume**. **Do not use `down -v`** unless you intend to delete all locally pinned content. Back up the Docker volume and the creator's separate key file.

In terminal two, run the narrow upload bridge:

```sh
npm run ipfs:bridge
```

The bridge is bound to `127.0.0.1:8791`. It accepts only encrypted binary `POST /api/road-ipfs/upload` (maximum **32 MiB per encrypted container**) and a health read. It does not expose Kubo's administrative RPC API to the browser. It verifies upload SHA-256 by retrieving the CID from the node, then checks the Kubo pinset. The pin and returned CID are authoritative only for the local node at that moment. Automated CI also restarts Kubo and rechecks that the pin and bytes survive when the named Docker volume remains attached.

In terminal three:

```sh
cd web
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite runs **loopback-only** for this pilot and proxies `/api/road-ipfs` to the bridge, never to Kubo's RPC. In Mint Studio, attach your files and select **Upload encrypted files to my local YBR IPFS node** under the Step 02 browser-encryption section. Click **Test IPFS connection**, then **Encrypt & Continue**. You can alternatively opt out and continue with the simulated uploader. The real-IPFS choice is deliberately not persisted across projects.

To test a real upload and pinned ciphertext independently of the browser:

```sh
npm run ipfs:smoke
```

It prints a real CID but never prints a decryption key. Inspect Kubo locally with:

```sh
docker compose -f infra/ipfs/compose.yaml exec kubo ipfs pin ls --type=recursive
```

The Kubo HTTP gateway is loopback-only at `http://127.0.0.1:8080/ipfs/<CID>` for inspecting **ciphertext**. CID retrieval via the public IPFS network is possible when reachable and connected, but this setup alone does not provide a public endpoint or geographic redundancy.

## Private data and recovery

- Plaintext source bytes, private decryption key/passphrase and decrypted metadata **do not** go to Kubo, the bridge, or the chain. The bridge accepts only `0ZROAD01` encrypted containers with generic header name and MIME, and refuses an unencrypted source file.
- CID references, ciphertext, approximate sizes, publisher/node network metadata and upload timing **can become public**. Even ciphertext cannot be guaranteed to disappear after release on IPFS; peers may retain copies.
- The encryption key remains in volatile browser memory. **Download the private recovery-key file** before refreshing or closing the page. You can take an early backup before minting (contains the key but may not yet contain CIDs); download it again after ingestion to include the final IPFS references. It includes the session secret and CIDs, so possession grants access to the encrypted contents. Do not publish, pin, or email that recovery file to an untrusted recipient.
- `ipfs://` metadata CIDs reference encrypted containers, **not** directly renderable OpenSea/MetaMask metadata. The registration ERC-721 receipt token maintains its own independent embedded yellow-square icon and generic public metadata.
- The on-chain `contentHash` and other public commitments may still disclose equality/membership of recognizable originals. Blinded commitments and creator-authorized disclosure need another protocol version. Do not use unpublished high-sensitivity IP on a public testnet without assessing that privacy limitation.
- The private package is currently assembled locally and includes references to pinned encrypted assets. There is no Road service that accepts, decrypts, or independently adjudicates the contents.

## Operating a persistent YBR IPFS service

The storage strategy should evolve from one pinned Kubo instance to a provider-independent, auditable service:

1. **Pin operations.** Deploy Kubo under our control; keep the RPC on private networks with strict auth and TLS for any remote management. Never proxy general `/api/v0/*` into public client code. Operate a narrow, authenticated ciphertext-only ingestion API with quotas and malware/abuse protection.
2. **Durability.** Replicate pinsets to at least two separately operated storage nodes, ideally via IPFS Cluster or a compatible pinning service, plus a backup/export strategy. A CID is an address, not a guarantee that anybody will keep hosting its bytes.
3. **Pin audits.** Record ingestion receipts and periodically re-fetch pinned CIDs, validate ciphertext SHA-256, compare replication status, and issue availability proofs/alerts.
4. **Creator permissions.** Introduce signed package ingest manifests (W3C PROV-O / C2PA references), versioned retention policies, credentialed ingestion, audit logs, refunds or quotas, and explicit data portability. Storage providers should not control creator decryption keys.
5. **Authorized access.** Build signed delivery entitlements and recipient key-wrapping/recovery with reviewed cryptography before serving decrypted works to DSPs or AI model providers.

Kubo’s official docs warn that its RPC is an administrator interface and **must never be exposed directly**; our Docker RPC and gateway bindings are loopback-only. See [Kubo RPC](https://docs.ipfs.tech/reference/kubo/rpc/), [Kubo Docker](https://docs.ipfs.tech/install/run-ipfs-inside-docker/), [self-hosted gateways and replication](https://docs.ipfs.tech/how-to/replace-public-gateways-with-self-hosted-ipfs/).

## Deployment limitations

Kubo persistence is local to Docker's named volume. Restarting your server/container does not erase pins if the same volume is retained, but deleting the volume, a drive failure, loss of the key file or a disconnected machine can still make creator data unavailable. Do not characterize the pilot as a guaranteed persistent service.

The `npm run dev` host is restricted to `127.0.0.1` intentionally. Production public uploads require a dedicated authenticated service design; do not change Vite to `0.0.0.0` or bind port `5001` publicly.
