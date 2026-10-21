# YBR cyberpunk development terminal

Run `npm run dev` from the repository root or `web/` with Docker running.
The local control screen has an ASCII YBR masthead, gold/cyan/magenta frames,
an animated brick chase, real service health, and stationary credential panels.
The brick animation is decorative, not network activity or throughput telemetry.

## Node 24, automatically

Both development entrypoints and `npm run setup:dev` go through `scripts/dev.cjs`.
It loads no project packages until Node 24 is selected. On macOS/Linux, an older
Node process loads your installed nvm and runs `nvm use 24`; when 24 is missing,
it runs `nvm install 24` first. It then restarts under that runtime and puts its
binary directory first in PATH for Ganache, Vite, npm, and Player children.
`.nvmrc` pins the development major to 24. Your parent terminal's Node selection
and default nvm alias are not changed by the wrapper itself.

Supported nvm locations: NVM_DIR, ~/.nvm, XDG_CONFIG_HOME/nvm, and the normal
Apple Silicon/Intel Homebrew nvm script locations. nvm must already be installed;
the launcher never downloads and executes an nvm installer. Missing nvm,
installation failures, or selection of another Node major stop startup before
services launch. A system Node 24 works directly without nvm. Windows users must
select Node 24 themselves with their installed version manager.

Check the selection without starting any services:

```sh
npm run dev -- --check-node
```

## Logins in this terminal

The `listener` and `artist` passwords are generated once and stored in
`.road-local/player-access.json`, inside the existing git-ignored directory.
The directory is owner-only (700) and the file owner-only (600) on POSIX systems.
The file contains Player demonstration credentials, **not Ganache seeds or IPFS
recovery keys**. It is local plaintext: do not commit or share it, and do not use
production credentials here. Windows ACLs are not hardened by these POSIX modes.
Environment overrides YBR_LISTENER_PASSWORD and YBR_ARTIST_PASSWORD still work.

The new `npm start` entrypoint for the Player uses the same file. A launcher that
reuses that Player checks both credentials through the existing login endpoint,
logs the short-lived test sessions out, then displays the verified credentials.
There is no password-discovery HTTP endpoint and no password guessing.

### One-time migration from an older running Player

A Player started by the old version has random credentials that cannot be
recovered from its API. Replace it once from this terminal:

```sh
npm run dev -- --restart-player
```

Or press **r twice** inside the dashboard (Escape cancels). This resets Player
sessions, not IPFS pins or Ganache. Before sending SIGTERM the launcher verifies
with lsof/ps that port 4173 belongs to the current user, the exact checkout's
Player working directory, and the expected Node script. It refuses foreign or
ambiguous processes and never uses SIGKILL. macOS/Linux need lsof for this
one-time operation. A Player already managed by this launcher is not restarted:
its verified passwords are already available with s.

## Screen and keys

The main view fits 80x24, with side-by-side service and Ganache panels at wider
widths. Long password overrides are abbreviated on the home screen; d shows the
complete values. Control/non-ASCII passwords are labeled rather than rendered
misleadingly. Smaller windows fall back to service status without credentials.

| Key | Action |
| --- | --- |
| d | Reference view: full credentials, account-0 key, HD path, IPFS peer and endpoints. |
| l | Expanded recent activity, up to 200 relevant lines. |
| s | Hide/show local credentials. |
| p | Pause drawing for selecting/copying text; services keep running. |
| a | Toggle animated bricks. |
| r, r | Confirm a controlled restart of this checkout's reused Player. |
| Up / Down | Scroll details or logs. |
| Escape | Main view; cancel pending restart confirmation. |
| q / Ctrl+C | Stop launcher-owned processes and restore terminal input/cursor. |

Services are checked every four seconds. The dashboard reports DOWN/DEGRADED on
failed health checks. Only changed rows are repainted; credentials do not move
with animation. `YBR_DEV_REDUCED_MOTION=1` starts with animation off. `NO_COLOR=1`
keeps the layout without color. `YBR_DEV_HIDE_SECRETS=1` hides credentials initially.

## Privacy, logging and shutdown

The Ganache mnemonic is shown only after its derived account matches account 0
from the launcher-owned node. Reused unknown Ganache nodes do not disclose their
seed via RPC; no seed is guessed. **Never send real funds to local test wallets.**

Known Player credentials, Ganache seed lines and private-key lines are redacted
from captured child output before saving `.road-local/dev-stack.log`. One rotated
`.1` file is retained, approximately 1 MiB per file. This remains targeted
redaction, not a general-purpose secret detector. Player credentials are visible
on the interactive screen unless hidden; hide them before screen sharing.

Pipes, CI, TERM=dumb, or `npm run dev -- --plain` use plain output without printing
credentials. Kubo, its volumes, and pre-existing services remain running when
the launcher exits. `npm run ipfs:down` stops Kubo without deleting the volume.
Never use `down -v` to preserve pins. No encryption or licensing behavior changed.

## Tests

`npm run test:dev-stack` covers the launcher, IPFS, dashboard, nvm bootstrap,
credential persistence/permissions, verified reuse and guarded Player restart.
The nvm shell tests use controlled fixtures, not live downloads. The integrated
GitHub job runs the real stack on Node 24, authenticates both Player accounts,
checks stored credentials and reuse, and verifies log redaction. Terminal
animation and restoration are tested independently from Docker startup.
