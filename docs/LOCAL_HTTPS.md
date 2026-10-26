# Local HTTPS and mint RPC diagnostics

The browser's parameterless `eth_chainId` request is valid JSON-RPC. The local
read gateway accepts an omitted `params` member and forwards an empty array.
The existing read/simulation allowlist is unchanged; wallet signing and transaction
submission never go through this gateway. Startup probes the actual browser route
before reporting READY, rather than only checking the upstream chain.

## Enable HTTPS on your development machine

Save any pending Mint Studio recovery backup and export your theme first. Stop
Dev Control and, in your repository folder, run:

```sh
brew install mkcert
npm run setup:https
npm run dev -- --restart-player
```

The Homebrew command is for macOS. Other systems should install mkcert using its
upstream instructions. `setup:https` explicitly runs `mkcert -install`, which can
ask for operating-system approval to trust a **local development CA**, then creates
localhost / 127.0.0.1 / ::1 certificates. Normal startup never installs a CA.

The dashboard then shows **https://127.0.0.1:5173** (workspace) and
**https://127.0.0.1:4173** (Player). Open those exact addresses. Both servers use
native TLS; browser RPC, upload and recovery requests stay same-origin through
Vite. Session cookies are Secure over HTTPS. HMR uses Vite's native secure socket.
Ganache, the private Kubo API and the IPFS bridge remain loopback HTTP backends,
not public servers. This does not configure production HTTPS or LAN access.

Certificates are owner-only files in git-ignored `.road-local/tls`. The mkcert
root private key stays in mkcert's own store and is never copied into the project.
Do not share certificate private keys or `rootCA-key.pem`. Vite denies access to
`.road-local`, PEM files and other private files. No secret is a VITE_ setting.
Node is re-executed with a local CA bundle, preserving an existing extra CA file;
certificate verification remains enabled, including the Vite-to-Player proxy.
Invalid, incomplete, mismatched or expired certificates stop startup instead of
silently falling back to HTTP.

HTTP and HTTPS are **different browser origins**. Old forms, themes, Building
associations and recovery material are not deleted, but their local storage is
not automatically transferred. Export/import themes, retain complete mint packets
and download recovery backups before changing. To access the previous origin:

```sh
npm run dev -- --http --restart-player
```

That is an explicit local recovery mode, not a remote-network fallback. Open the
HTTP URL shown for that run, export the data needed, then restart without `--http`.
Existing contracts, IPFS pins, preview files and on-chain identities stay intact.
The HTTP URLs already committed in synthetic test-music metadata are not rewritten;
media is served through relative routes on the current HTTPS Player without reminting.

## Validation and limits

`node --test scripts/dev-https.test.cjs` tests real verified TLS with ephemeral test
certificates, rejection of untrusted CAs/unsafe files and the gateway readiness probe.
`apps/ybr-player/test/road-rpc.test.js` exercises actual HTTP requests with omitted
parameters, malformed inputs and signing-method denial. A separate CI job starts
Vite, Player, Ganache and Kubo under TLS, mints through the actual browser adapter,
checks receipt verification, Secure cookies, same-origin routes and private-file
denial. Its browser context accepts only test-environment certificate errors;
Node's requests still verify the generated CA. It does not test macOS Keychain,
a real browser-wallet extension, Infura availability or public-chain transactions.

Sources: https://www.jsonrpc.org/specification#request_object
https://vite.dev/config/server-options#server-https
https://github.com/FiloSottile/mkcert
