# YBR cyberpunk development terminal

Run `npm run dev` from the repository root or `web/` with Docker running.
The local control screen has an ASCII YBR masthead, gold/cyan/magenta frames,
an animated brick chase, real service health, and stationary credential panels.
The tagline is **FOLLOW THE YELLOW BRICK ROAD**. The brick animation is decorative,
not network activity or throughput telemetry.

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

The **YBR PLAYER LOGIN** panel sits above the service panels, with separate
`Username` and `Password` rows for `listener` and `artist`. Both accounts are
verified against the running Player before their passwords are displayed.

Passwords are generated once and stored in `.road-local/player-access.json`,
inside the existing git-ignored directory. The directory is owner-only (700) and
the file owner-only (600) on POSIX systems. The file contains Player demonstration
credentials, **not Ganache seeds or IPFS recovery keys**. It is local plaintext:
do not commit or share it, and do not use production credentials here. Windows
ACLs are not hardened by these POSIX modes. Environment overrides
YBR_LISTENER_PASSWORD and YBR_ARTIST_PASSWORD still work.

The Player's `npm start` entrypoint uses the same file. A launcher that reuses
that Player checks both credentials through the existing login endpoint and
logs the short-lived verification sessions out. There is no password-discovery
HTTP endpoint and no password guessing.

### Automatic repair of an older running Player

No special flag is needed for the normal startup path. When an existing Player
has unknown or mismatched passwords, an unhealthy factory, or a stale factory,
`npm run dev` automatically attempts a guarded restart and launches it with
known local credentials. It no longer reports READY with unavailable logins.
A healthy Player with verified credentials is reused without a restart.

Before sending SIGTERM, lsof/ps must establish the current user, this exact
checkout's Player working directory, and an expected Node script. Foreign or
ambiguous processes are not stopped, and SIGKILL is never used. A refused repair
or failed login check stops startup with an error instead of displaying guessed
passwords. macOS/Linux require lsof for this repair. On Windows an older Player
must be stopped manually once.

Repair resets Player sessions, not IPFS pins or Ganache. The explicit override
`npm run dev -- --restart-player` and **r twice** (Escape cancels) remain available.
A Player already managed by this launcher is not restarted through the r key:
its verified passwords are already available with s.

## Automatic Ganache test music

Default startup generates only the existing first-party synthetic audio fixture,
registers **Golden Hour — Road Release** by **The Amber Sessions** on local Ganache
when missing, and reuses the matching registered Brick on subsequent launches.
User media and encrypted IPFS originals are never automatically published.

The launcher re-reads the registered catalog after publication. After starting
or reusing the Player, it checks the Player's catalog and fetches the fixture's
actual playback bytes through a fixed loopback route. The returned SHA-256 must
match the generated fixture before startup continues. `Test music: Golden Hour /
PLAYBACK VERIFIED` records this startup check. It is not a live throughput meter.
The details view includes the test Brick ID and its playback URL.

`YBR_STACK_NO_DEMO_MUSIC=1` remains an explicit opt-out and displays SKIPPED, never
PLAYBACK VERIFIED. Registration, catalog, or audio-integrity failures otherwise
stop startup. The test fixture does not require an extra publish command.

## Screen and keys

The main view fits 80x24, with side-by-side service and Ganache panels at wider
widths. Long password overrides are abbreviated on the home screen; d shows the
complete values. Control/non-ASCII passwords are labeled rather than rendered
misleadingly. Short windows of at least 61 columns and 15 rows keep the login
panel in a compact view. Smaller windows show status without credentials.

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
credentials. Kubo and its volumes remain running when the launcher exits.
Reused healthy services are left alone; Players replaced during repair are now
launcher-owned and stop with it. `npm run ipfs:down` stops Kubo without deleting
the volume. Never use `down -v` to preserve pins. No encryption or licensing
behavior changed.

## Tests

`npm run test:dev-stack` includes Player startup postconditions, registration
idempotency, playback integrity, and exact-tagline/layout regressions. The
existing nvm tests use controlled fixtures, not live downloads. The integrated
GitHub job starts an older standalone Player first, then uses the default dev
command without a restart flag. It verifies guarded automatic repair, both real
logins, credential permissions, playback, repeated publication without duplicate
Bricks, and log redaction on Node 24 with real Kubo/Ganache/Player/Vite.
