# YBR IPFS encrypted-storage pilot

## Scope

This is the first **real content-addressed upload** path for Yellow Brick Road. It is opt-in, local-first, and intended for test assets up to 256 MiB per original. Mint Studio hashes and encrypts original files in the browser and sends only the encrypted `0ZROAD01` container through the local YBR upload bridge into our own pinned Kubo node. New per-Brick metadata documents are likewise encrypted in the browser, pinned, and referenced by `ipfs://<CID>` in subsequent test-chain mints.

The pilot supports creator recovery with a locally imported private backup. It is not a production storage, custodial recovery, rights licensing, or durable global availability guarantee.

## Start the persistent local node

Prerequisites: Docker Desktop or a Docker Engine with Compose, Node.js 24, and the YBR repository. From repo root:

```sh
npm run ipfs:up
npm run ipfs:status
```

`infra/ipfs/compose.yaml` starts official Kubo and persists its repository in the Docker named volume `ybr-kubo-data`. `docker compose -f infra/ipfs/compose.yaml down` or `npm run ipfs:down` stops the container **without deleting its volume**. **Do not use `down -v`** unless you intend to delete all locally pinned content. Back up the Docker volume and the creator's separate key file.

In terminal two, run the narrow upload bridge:

```sh
npm run ipfs:bridge
```

The bridge is bound to `127.0.0.1:8791`. It accepts encrypted binary `POST /api/road-ipfs/upload`, `GET /api/road-ipfs/content/<CID>` for locally pinned ciphertext, and a health read. Upload and recovery support **256 MiB per original file**, matching browser encryption. The shared encrypted-container cap additionally reserves the full ROADENC v1 header and authentication-tag overhead (65,561 bytes), so an original exactly at 256 MiB is accepted. Encryption and recovery still buffer files in memory; larger files need a streaming design. Encrypted Kubo add/read operations allow up to three minutes each. It does not expose Kubo's administrative RPC API to the browser. It verifies upload SHA-256 by retrieving the CID from the node, then checks the Kubo pinset. Reads require a direct or recursive local pin before fetching content. The pin and returned CID are authoritative only for the local node at that moment. Automated CI also restarts Kubo and recovers the original and metadata through the narrow bridge when the named Docker volume remains attached.

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

For the same larger-file regression used in CI, run `YBR_IPFS_SMOKE_MIB=40 npm run ipfs:smoke`; use the same value when running `web/scripts/ipfs-verify-persistence.mjs`.

It prints a real CID but never prints a decryption key. Inspect Kubo locally with:

```sh
docker compose -f infra/ipfs/compose.yaml exec kubo ipfs pin ls --type=recursive
```

The Kubo HTTP gateway is loopback-only at `http://127.0.0.1:8080/ipfs/<CID>` for inspecting **ciphertext**. CID retrieval via the public IPFS network is possible when reachable and connected, but this setup alone does not provide a public endpoint or geographic redundancy.

## Recover files after reopening the app

Keep the original Kubo data volume and run the node, bridge, and Vite frontend as above. The key and all decryption stay in the browser; the bridge receives only a CID when retrieving a file.

### Recovery from a private backup

1. After upload, download **private recovery keys** from Mint Studio. New exports use `0x-road-ipfs-recovery-v2` and include the key, CIDs, ciphertext checksums and sizes, and original checksums and sizes. This is a private local backup format, not a provenance standard or a license.
2. Close/reopen the app or choose **Recover files** in the sidebar.
3. Select the private recovery JSON. Import is local and sends no request.
4. Click **Recover & download** beside an original file or encrypted metadata document. The browser fetches ciphertext, checks its hash and size, authenticates/decrypts the container, checks the original hash and size, then offers a download.
5. Use **Clear recovery session** to discard the imported key and cancel pending retrieval. No key or recovered plaintext is saved in localStorage.

Files are downloaded as attachments, never rendered as arbitrary HTML or SVG in the application. No wallet signature is needed for private key-holder recovery. Possession of a key does not establish legal rights or a streaming license.

### Recovery from an on-chain Brick

1. In **My Bricks**, scan the correct network and factory.
2. On a Brick whose metadata reference is a supported `ipfs://` CID, choose **Recover encrypted files**.
3. Import the private backup and click **Retrieve & verify registered metadata**.
4. The browser compares the exact decrypted metadata bytes with the metadata digest read from that Brick contract. A mismatch stops recovery before metadata-derived file references are shown.
5. Recover the referenced originals. Their ciphertext and plaintext checksums come from the verified metadata.

This path can use an early key-only backup: the observed on-chain metadata URI supplies the missing CID. It verifies the scanned registration's commitment, not copyright ownership or a live license decision. Changing wallet/network or rerunning the scan clears the recovery session.

### Older and incomplete backups

Version-one recovery files remain supported. Their asset entries have ciphertext digests but no independently recorded original digests, and their metadata entries have no saved checksums. The UI reports these weaker checks explicitly. A selected on-chain metadata commitment can supply an independent plaintext check for a legacy or key-only backup.

An early backup with no CIDs cannot locate content by itself. Use it with an IPFS-backed Brick in My Bricks, or import the final backup exported after upload. Recovery cannot restore a missing key or content whose pins/storage were lost.

### Recovery boundary and verification

- Only bare CIDs are accepted. No arbitrary gateway URL, path suffix, query string, redirect, or generic Kubo RPC is exposed.
- The bridge checks a local pin, bounds streamed response bytes, validates generic encrypted-container headers, and returns ciphertext with `no-store`, `nosniff`, and attachment headers.
- The browser independently hashes the returned bytes against its imported or metadata-derived commitment. A bridge-provided hash alone is not the trust anchor.
- Imported backups are capped at 1 MiB and 64 entries per list. Retrieval has a five-minute browser timeout and supports cancellation; stale operations cannot download after a new backup is imported or the panel closes.
- CI uses a 40 MiB original to catch regressions to the old 32 MiB cap, including recovery after restarting Kubo. The smoke test exercises real encrypted source and metadata upload, private-backup export/import, recovery, wrong-key rejection, and checksum mismatch rejection. The restart check recovers source bytes again through the same endpoint.

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
