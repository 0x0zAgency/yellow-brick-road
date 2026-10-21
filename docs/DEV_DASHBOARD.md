# Local development dashboard

Run `npm run dev` from the repository root or `web/` with Docker running.
The launcher uses a gold-accented, fixed terminal dashboard instead of mixing
Ganache, Player, Vite and IPFS output into one scrolling stream. No new package
or service is required.

## At a glance

- **Services:** Explorer, Player and encrypted-content IPFS bridge URLs and status.
- **Ganache:** RPC URL, chain ID 1337, account 0, its live ETH balance, block number,
  factory address, and whether this launcher owns or reuses the node.
- **YBR access:** actual `listener` and `artist` credentials and the verified local
  Ganache mnemonic. Credentials stay on the dashboard while activity changes below.
- **Activity:** a short log tail, with routine RPC requests kept out of this panel.

The normal layout fits an 80-column, 24-row terminal. Wider terminals get
side-by-side service and network panels. Smaller terminals show a compact status
fallback. Long override passwords are abbreviated on the home view; use `d` for
the complete value. Printable ASCII credentials are shown exactly; passwords
containing control or non-ASCII characters are labeled as configuration values
rather than displayed inaccurately.

## Keys

| Key | Action |
| --- | --- |
| `d` | Full reference: account-0 private key, HD path, IPFS peer, endpoints and shutdown commands. |
| `l` | Full in-memory log view (most recent 200 relevant lines). |
| `s` | Hide/show local credentials, useful before sharing your screen. |
| `p` | Freeze/unfreeze the display while selecting and copying text. Services keep running. |
| Up / Down | Scroll details or logs. |
| Escape | Return to the main dashboard. |
| `q` / Ctrl+C | Stop launcher-owned processes and restore the terminal. Kubo remains running. |

Services are polled every four seconds after startup. Failed health checks show
`DOWN` and `DEGRADED`, not a permanent green startup snapshot. The launcher also
verifies the actual Mint Studio IPFS proxy before reporting ready.

## Credentials and privacy

These are **local development accounts and test-chain keys**, never production
credentials. Never send real funds to the Ganache wallet. Anyone who can see the
terminal can see its displayed credentials; press `s` to hide them or launch with
`YBR_DEV_HIDE_SECRETS=1`.

The launcher generates fresh Player passwords and passes those same values to
its Player child. Existing `YBR_LISTENER_PASSWORD` / `YBR_ARTIST_PASSWORD` overrides
are respected. It does not persist passwords or expose a credential endpoint.

The Ganache mnemonic is captured from the node process started by this launcher
and displayed only after its derived account matches RPC account 0. The private
key is available on the details view. A reused Ganache or Player process does not
expose its credentials through the existing APIs, so the dashboard explicitly
says to consult that process's original terminal. It does not guess default
passwords or a seed for an unknown running node.

Child output is captured, terminal control sequences are removed, and known
Player credentials, Ganache seed lines and Ganache private-key lines are redacted
before logging. Logs are saved under the already git-ignored
`.road-local/dev-stack.log`, with one rotated `.1` file, approximately 1 MiB each.
On supported platforms the log files have owner-only permissions. Do not put
unrelated secrets into arbitrary application logs: this is targeted redaction,
not a general-purpose secret detector.

## Plain output and troubleshooting

`npm run dev -- --plain` or `YBR_DEV_PLAIN=1 npm run dev` disables the interactive
screen. Pipes, CI and `TERM=dumb` automatically use plain output. Credentials are
not printed in this mode; run in an interactive terminal or supply known local
password overrides to reference them. `NO_COLOR=1` keeps the dashboard layout
without color.

Errors remain visible after the alternate screen closes. Full redacted output
is available in `.road-local/dev-stack.log`. Ctrl+C stops owned child processes
only; reused services and the persistent Kubo node are left alone. Stop Kubo
separately with `npm run ipfs:down`, never `down -v` to preserve your pins.

Run `node --test scripts/dev-dashboard.test.cjs` for dashboard unit tests or
`npm run test:dev-stack` for the combined launcher suite. The integrated CI smoke
boots real Kubo/Ganache/Player/Vite and checks the configured Player logins plus
log redaction. Terminal behavior is tested separately from service startup.
