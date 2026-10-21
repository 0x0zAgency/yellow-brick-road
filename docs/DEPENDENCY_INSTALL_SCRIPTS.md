# Development dependency script approvals

The normal root or web `npm run dev` entrypoint selects Node 24 first, then runs
`npm install-scripts approve --all` separately in the repository root, `web/`,
and `apps/ybr-player/` before starting the application services. These are three
independent npm projects, not one workspace installation. The existing Node 24
bootstrap, Player login display, synthetic music fixture and IPFS startup remain
unchanged.

`npm run setup:dev` runs this sequence in each project:

```sh
npm install
npm install-scripts approve --all
npm rebuild
```

Approval writes npm's `allowScripts` policy; it does not itself execute previously
blocked native builds. Setup rebuilds after approving. Ordinary `npm run dev`
checks approvals every time but only rebuilds a project when its policy changed;
it does not reinstall all dependencies at each launch. Use `npm run setup:dev`
after changing Node or to retry an interrupted/failed native build.

The `--all` option is intentional. A bare `all` would name a package. This is an
automatic approval decision requested for the local YBR development stack, not
a dependency audit. Install scripts run dependency code with your local user's
permissions. Do not use this convenience flow for untrusted dependency updates
or as a production supply-chain review. npm's own default approval pinning is
retained. No global npm settings, bypass flags or dependency overrides are added.

Existing explicit `false` entries are left to npm's native policy handling, not
pruned or replaced. The launcher also refuses to rebuild if an approval command
unexpectedly removes one. As always, actual policy enforcement depends on the
installed npm release; older advisory releases do not provide the same protection
as newer releases that block unapproved scripts.

## Compatibility and failures

The helper detects the selected npm's command list without executing a write.
It prefers `npm install-scripts approve --all`. An earlier npm exposing only the
official standalone alias uses `npm approve-scripts --all`. If neither exists,
startup stops with an instruction to update npm for Node 24. The launcher never
silently bypasses approval and never upgrades a global npm installation itself.

An installation, approval or rebuild failure stops the sequence before services
start, preserving the failing exit code. Missing dependency trees tell you to run
`npm run setup:dev`. The read-only `npm run dev -- --check-node` remains read-only
and does not install or approve packages.

Approvals can change the three projects' tracked `package.json` files locally.
Those `allowScripts` changes are expected; inspect them with `git diff` and review
before committing. npm may also update lockfiles during setup. The launcher does
not commit generated policies or lockfiles on your behalf.

## Why two bufferutil and utf-8-validate versions?

The root project pins Ganache 7.9.2. Its upstream manifest and that of its
WebSocket adapter specify these exact optional dependency versions:

```text
ganache@7.9.2
|-- bufferutil@4.0.5
|-- utf-8-validate@5.0.7
`-- @trufflesuite/uws-js-unofficial@20.30.0-unofficial.0
    |-- bufferutil@4.0.7
    `-- utf-8-validate@6.0.3
```

These are logical dependency paths, not a claim about their physical hoisting
locations on every machine. Both version pairs were also reported in the YBR CI
installation warnings. They are transitive dependencies, not duplicate YBR
services. The upstream exact version requirements differ, so a single version
cannot satisfy both as written. `utf-8-validate` also crosses a major version.
This change does not force a deduplication or override those pins.

`bufferutil` accelerates WebSocket frame masking/unmasking. `utf-8-validate`
provides native UTF-8 validation; current ws releases use Node's built-in
validation on newer Node versions, but that does not remove older dependencies'
package declarations. Approval enables their installation scripts according to
npm's policy; it does not merge versions or fix an incompatible uWS binary.

Inspect the exact installed tree on your machine with:

```sh
npm explain bufferutil
npm explain utf-8-validate
npm ls bufferutil utf-8-validate --all
```

Primary sources:

- https://docs.npmjs.com/cli/v12/commands/npm-install-scripts/
- https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts/
- https://raw.githubusercontent.com/trufflesuite/ganache/v7.9.2/packages/ganache/package.json
- https://raw.githubusercontent.com/trufflesuite/uws-js-unofficial/master/package.json
- https://github.com/websockets/ws#opt-in-for-performance

## Tests

`node --test scripts/dev-install-scripts.test.cjs` covers command capability,
all three project directories, repeat runs, setup ordering, preserved denials,
missing dependencies, malformed manifests and failure propagation. The combined
`npm run test:dev-stack` includes these regressions. The integrated GitHub job uses
`npm run setup:dev` before exercising the normal development startup, so both the
setup and repeat-approval paths run with the selected Node 24/npm installation.
