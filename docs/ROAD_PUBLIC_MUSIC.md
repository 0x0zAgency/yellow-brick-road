# Road Music: open playback from opted-in on-chain Bricks

**Status: local Ganache pilot (chain 1337), v0.2. Not a production service or commercial license.**

The YBR Player is a reference client for a common media access layer. Third-party artist apps should not need Spotify's SDK or a YBR Player account to query and play tracks explicitly published for public playback on the Road.

## Model

- **Brick identity:** the existing `YellowBrickFactory` registration event binds a work to a Brick contract and its on-chain SHA-256 `contentHash`.
- **Playback consent:** the current Brick controller publishes a metadata document containing `rights.playback.mode: "public-stream"`, `audience: "any-player"`, an explicit playback scope and an unencrypted audio asset reference. The existing `YellowBrick.metadataDigest` commits to the exact JSON document bytes. Merely minting an IP Brick does not grant playback rights.
- **Media integrity:** the Road Music gateway recomputes SHA-256 of the local audio file and checks it against both the manifest and on-chain Brick content hash, plus the manifest's on-chain digest. It also validates the factory event and current controller.
- **Revocation:** any metadata URI or digest change, controller transfer, asset tampering, or failed chain check removes the Brick from discovery and denies new playback requests. This is a live read, not a permanently granted entitlement.
- **No private-source access:** existing Mint Studio's `ipfs://` encrypted metadata and media, and `road-demo://` metadata references, do not qualify. This pilot never decrypts them and never exposes Kubo's administrative RPC.
- **Authorization boundary:** this v0.2 profile is *free local preview playback for any player*, not paid subscriptions, territory restrictions, royalties, or commercial exploitation. On-chain control is a publisher claim, not proof of copyright ownership. The gateway does not replace professional rights verification.

We extend the existing `schemas/brick-metadata-v1.schema.json` with an **optional** `rights.playback` field. AI training terms remain independent. No new on-chain contract or competing provenance scheme is introduced.

## Integrated local launch (recommended)

From the repository root, run `npm run setup:dev` once and then `npm run dev` (or `cd web && npm run dev`). This boots Ganache, reuses or deploys the existing factory, starts YBR Player and the web app, and **automatically publishes only our original synthetic audio fixture** for end-to-end player tests. Open http://127.0.0.1:5173/road/api/music or http://127.0.0.1:4173. Use `YBR_STACK_NO_DEMO_MUSIC=1` to opt out of automatic fixture publication. Existing encrypted Mint Studio sources never become public. [Full instructions](INTEGRATED_DEV_STACK.md).

## Manual launch (advanced)

From the main repository root, using the **same Ganache instance** as `web/`:

```bash
npm install
npm run compile
npm run ganache
```

In another terminal (once per clean Ganache instance):

```bash
npm run ganache:deploy
```

The factory address is recorded in `.road-local/factory.json`. If `web/` is already using another deployed factory, supply that address as `YBR_GANACHE_FACTORY` instead. Chain ID **1337**, RPC **http://127.0.0.1:8545**. Restarting an ephemeral Ganache chain requires redeployment and republishing.

In a third terminal:

```bash
cd apps/ybr-player
npm install
npm start
```

Open http://127.0.0.1:4173. The first two synthetic tracks are built into the local player as before, not Ganache registrations. Check **http://127.0.0.1:4173/road/api/status** to see whether the Road factory is connected.

## Publish the first eligible audio Brick (explicit opt-in)

Publishing **copies the track into an unencrypted folder** and makes it available through a public playback API. Only publish files you are authorized to distribute. Don't use a private master or the encrypted Mint Studio package.

From `apps/ybr-player`:

```bash
npm run road:publish
```

This publishes an original synthetic demo WAV, after explicitly granting free public *local preview* playback. For a different audio file you have permission to offer, the publishing utility accepts:

```bash
node scripts/publish-road-track.js --publish --file /path/to/track.mp3 --title "Track Title" --artist "Artist Name"
```

The publisher uses the **first unlocked Ganache test account** only, performs a genuine `deployBrickWithMetadataDigest` transaction on chain 1337, stores a public playback manifest under `data/road-public/` and a local audio copy under `media/road-public/`. Both public-copy directories are intentionally ignored by Git. These files must remain available while the gateway serves that Brick. Each metadata URI points to the local publisher on port 4173.

**Do not publish if this is a real-world license you haven't secured.** For this pilot, the stated terms are only local free preview playback; no royalty money moves.

## Any-player read API

No login or per-app key is required for explicit public playback:

| Request | Purpose |
| --- | --- |
| `GET /road/api/status` | Local chain and factory readiness |
| `GET /road/api/music` | Discover eligible published audio Bricks, their on-chain provenance and playback terms |
| `GET /road/api/music/:ipId` | Read one authorized Brick |
| `GET /road/metadata/:ipId` | Read the exact public metadata JSON whose digest is committed to the Brick |
| `GET /road/media/:ipId` | Stream the original licensed-public audio bytes with standard HTTP `Range` support |

The endpoints respond with `Access-Control-Allow-Origin: *` for **public GET/HEAD** requests only. No session data, private Brick registry or payment features are exposed cross-origin. Each request checks the local chain and current manifest. A third-party music player can use an ordinary HTML `<audio src="...">` pointing to `/road/media/:ipId`, provided it is hosted where this local gateway can be reached. The `/api/bricks` logged-in YBR Player catalog also includes these tracks, enabling playback inside YBR Player alongside the two original local demos.

The local origin is `http://127.0.0.1:4173`. This is **not a globally addressable Road**. Browsers on other computers cannot reach your machine through their own `localhost`. A future hosted, audited and permissioned gateway can implement the same integration pattern.

Test the real chain flow after publishing one track:

```bash
npm run road:smoke
```

This runs public catalog, CORS, range streaming, digest verification, tamper denial and **on-chain revocation** tests. It **revokes the test Brick at the end**, so publish another track for interactive playback afterward. Never point the smoke test at a real or irreplaceable recording.

## Future considerations

Separate discovery from delivery in production, support portable media CIDs and authorized encrypted delivery, chain-specific factory registries, a reorg-aware event indexer, per-territory and commercial license decisions, artist controller signatures with expiring grants, accounting and settled payments, rate limits/abuse controls, and persistent replicated hosting. Integrate established music and provenance standards (DDEX, PROV-O, C2PA) rather than replacing them. Controller rights claims still require independent verification before commercial distribution.
