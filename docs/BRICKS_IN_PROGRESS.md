# Bricks in progress

My Bricks and the Mint Studio workbench list unfinished work for the connected wallet. **Save & pause** waits for the local save to finish, then opens the list. **Start a new mint** saves the current work before opening an empty form. Ordinary workspace navigation keeps the active studio mounted and its autosave running.

The list distinguishes:

- **In progress:** files and form choices are saved, with no reference approval outstanding.
- **Waiting for approval:** at least one prepared reference request still needs a response.
- **Ready to resume:** all reference responses have arrived; the creator must still review and mint.
- **Needs attention:** a request is missing, expired, declined, withdrawn, stale, or belongs to a different source/wallet/network.
- **Check mint transaction:** submission may already have happened. Resume opens saved results instead of issuing another mint.

The notifications service updates saved drafts while the requester is signed in. A creator can leave the studio, reload, sign in to requests again and receive an approval into the saved draft. Manual approval responses remain supported. Stored response status is a convenience, not an authorization: the existing mint preflight checks the source commitment, expiry, controller and signature again.

## Local persistence

IndexedDB database `ybr-mint-drafts-v1` contains wallet-scoped draft records and a separate file store. Form and request updates do not rewrite unchanged file payloads. Before the Files step encrypts a source, its browser File/Blob is saved locally. After encryption, its encrypted container and recovery key are retained locally instead. Drafts include metadata, rights choices, reference requests/responses, reuse choices, songwriter splits, selected network/factory and chain genesis hash. Scoped thumbnail and Player delivery choices are retained; changing their source files or metadata still invalidates the corresponding review. Mint confirmation is always requested again on resume.

No original files or recovery keys are sent to the inbox, app server or IPFS by saving a draft. Browser wallet scoping is an organizational boundary, not encryption or a separate login boundary. Scripts on this origin can access its local storage. Clearing browser data removes the drafts; storage quota errors explicitly report **Not saved** and prevent a pause/new-mint action from discarding the current form.

Resume checks the wallet, chain and saved chain history. Managed deployments must match the original factory. A draft without recorded history keeps its files but clears approvals/reuse claims for fresh verification. An interrupted mint is recorded before the transaction path begins, preventing reload from silently offering the same work as a fresh mint. Completed results remain available under **Completed on this device**; removing a local draft does not withdraw an already sent request.

## Verification

`web/tests/mint-drafts.test.js` covers state transitions, expiry/source/wallet/chain boundaries, interrupted submissions, response matching and storage errors. `scripts/mint-drafts-browser.cjs` runs two browser wallets against a disposable Ganache chain and the real inbox service. It verifies raw and encrypted file recovery after reload, controller approval delivery, resume, multiple drafts, navigation autosave, wallet/history isolation, delayed-write response preservation and mobile layout. No developer chain or private files are used.
