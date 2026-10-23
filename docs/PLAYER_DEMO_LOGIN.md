# Automatic artist sign-in for the local demo

`npm run dev` and `npm --prefix apps/ybr-player start` now open the standard
loopback Player as **artist**, without typing a username or password. The footer
shows **Signed in as artist · local demo**. This convenience applies only to the
disposable demonstration, not creator identity or ownership verification.

After pulling this update, restart an older Player once with:

```sh
npm run dev -- --restart-player
```

Reload the Player. Existing listener sessions remain listener sessions; use
**Switch account**, then **Continue as artist (demo)** to change explicitly.

## Account switching

**Switch account** logs out and pauses automatic sign-in, including across page
reloads. Choose **Continue as artist (demo)** to resume, or sign in manually with
the listener/artist credentials in the startup dashboard. A manually chosen
listener is not promoted to artist, even when its session expires. Restarting the
Player starts a fresh demo sign-in preference; no uploads or Bricks are changed.
Sign-in does not autoplay audio.

To test the ordinary password flow instead:

```sh
YBR_PLAYER_AUTO_LOGIN=0 npm run dev -- --restart-player
```

The default returns when that environment override is removed. Directly running
`node apps/ybr-player/server.js` retains manual authentication. Nonstandard ports,
non-loopback launcher hosts, and `NODE_ENV=production` do not enable auto-login.

## Boundary

No password is embedded in HTML, JavaScript, URLs, browser storage or an API
response. The browser requests an ordinary expiring, opaque HttpOnly session for
the configured demo artist. `GET /api/session` only reports status; it never signs
anyone in. The opt-in `POST /api/session/demo` route requires a loopback-bound
server, loopback peer, matching local Host/port and same-origin request. Forwarded
proxy headers and cross-site requests are refused. Do not expose or proxy this
local reference Player to the internet; this shortcut is not production identity.

The session does not bypass per-Brick playback grants or current on-chain
permissions, revision/history checks, artwork/lyrics checks, or revocations. It
never signs a wallet transaction, decrypts protected originals, publishes a work,
or makes an unavailable track playable. The hidden Saved uploads UI stays hidden.

## Tests

`apps/ybr-player/test/demo-login.test.js` covers HTTP sessions, launcher opt-out, logout/resume, listener isolation
and normal playback authorization.
`scripts/player-autologin-browser.cjs` exercises the real Player
session and browser code on an isolated loopback test server, including renewal,
manual listener sessions and expiration. The launcher selection helper is tested
separately; full-stack and real Ganache policy tests remain enabled.
