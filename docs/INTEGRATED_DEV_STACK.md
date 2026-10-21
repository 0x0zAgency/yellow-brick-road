# Integrated YBR development stack

Run the whole local Yellow Brick Road from **one command**, including the main Road Explorer (`web/`), YBR Player, Ganache, the real YellowBrickFactory, and a controller-authorized synthetic music Brick.

This workflow is for **development only**. It is not a production deployment, blockchain-mainnet publication, or commercial music license.

## One-time installation

Requirements: Node.js 22.12+ (Node 24 recommended), npm, local ports 5173 (web), 4173 (player) and 8545 (Ganache).

```bash
git clone https://github.com/0x0zAgency/yellow-brick-road.git
cd yellow-brick-road
npm run setup:dev
```

Or, for an existing clone, update to the newest `main`, then run `npm run setup:dev`.

## Start everything

From **repository root**:

```bash
npm run dev
```

Or from **web/**, if that is your normal workflow:

```bash
cd web
npm run dev
```

Both entry points run the same integrated launcher. It:

1. Checks if a Ganache RPC is available at `127.0.0.1:8545`. Reuses a healthy chain 1337, otherwise starts a new local Ganache. It refuses to deploy to a different chain on port 8545.
2. Reuses the configured / saved `YellowBrickFactory` if it has code and a deployed implementation on that chain. If missing or stale, recompiles and deploys the **existing** contract (not a new type of contract).
3. Generates YBR's original *Golden Hour* synthetic audio and, if not yet present, registers one opted-in public-demo recording with its media SHA-256 and on-chain metadata commitment. This fixture is safe to share because **we generate it**, not because a pre-existing artist Brick is assumed public.
4. Starts the separate YBR Player on port 4173 (or reuses a compatible already-running player) and connects it to the verified factory.
5. Starts the Road Explorer Vite app on port 5173, using the **same factory address**. The main web application links to the Player as a separate service. `/road/*` on port 5173 proxies only the public music APIs to the player. It never proxies Kubo's admin API.

### Open

| Service | URL |
| --- | --- |
| Road Explorer | http://127.0.0.1:5173 |
| YBR Player | http://127.0.0.1:4173 |
| Open Road Music catalog through main app | http://127.0.0.1:5173/road/api/music |
| Direct Road Music API | http://127.0.0.1:4173/road/api/music |
| Ganache | http://127.0.0.1:8545 |

The Player's generated `listener` and `artist` test-account passwords print to the terminal. The publicly opted-in Road tracks may be read from `/road/*` without a Player login, since they are specifically published for any-player preview. The Player's local demo library remains login-protected.

## Running without publishing the demo recording

Set `YBR_STACK_NO_DEMO_MUSIC=1` before `npm run dev`. The player and chain can still launch and any previously authorized recordings remain available.

The launcher **never publishes**, decrypts, or uploads files from Mint Studio, encrypted IPFS, user-selected sources, or other existing Bricks. Only the checked first-party synthetic demo file is automatically registered, and that happens only in local Ganache.

## Existing chain and manual factory selection

If you've already deployed a factory via Mint Studio or `npm run ganache:deploy`, supply its address with `YBR_GANACHE_FACTORY=0x...`, or use the existing `.road-local/factory.json`. The launcher verifies the factory and shares it with the Vite frontend and player.

A fresh Ganache reset loses previous deployments, so the launcher may create a new local factory and fixture. Existing local files are never reinterpreted as authorized for playback merely because they remain on disk. The Road Music gateway checks current on-chain rights and digests on each read.

When you press **Ctrl+C**, the launcher terminates the local processes it started. It deliberately leaves any pre-existing Ganache and YBR Player instances alone, so it does not interrupt your separate experiments. When a server already occupies port 5173, stop it before starting the integrated stack.

## Manual / focused development

- `cd web && npm run dev:web` runs **only Vite**, without the integrated Ganache/player bootstrap.
- `cd apps/ybr-player && npm start` runs **only the YBR Player**.
- `npm run test:dev-stack` validates startup readiness and synthetic fixture invariants.
- `node scripts/dev-stack-smoke.cjs` checks an **already running integrated stack** for deployed factory, Road music, browser-independent cross-origin/byte-range access, and cryptographic media/metadata integrity.
- The Web UI GitHub Actions workflow now boots the complete integrated stack and executes the same cross-service smoke check in CI.

The existing private encrypted-IPFS bridge remains separately operated with `npm run ipfs:bridge`, `npm run ipfs:up`; it is **not** silently started or exposed as part of public music streaming.

## Production boundaries

This is a Ganache chain-1337 reference implementation. It doesn't adjudicate copyright, authorize commercial distribution, provide global content availability, settle royalties, or establish genuine plays. Open internet playback requires independently verified rights, production identity/permissions, hosted delivery, rate limits, signed usage records, and secure accounting. We use existing PROV-O, C2PA and music reporting standards where they apply, extending only YBR-specific gaps.
