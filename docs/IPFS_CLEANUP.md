# Local IPFS cleanup

In Dev Control (`npm run dev`), press **c**, then choose:

- **a — Remove ALL local IPFS files:** removes recursive/direct pins and every
  top-level IPFS Desktop (MFS) file or folder, then runs Kubo garbage collection.
- **c — Reclaim unpinned cache:** runs garbage collection while retaining pins
  and IPFS Desktop files.

Review the API address, peer identity, counts and storage size. Pause uploads and
IPFS Desktop edits, and close artwork views before proceeding. Type the exact
confirmation shown and press Enter. The phrase includes the node's identity
suffix. Escape cancels before cleanup starts. A terminal of at least 80×24 is
required so the review is visible; pasted text cannot confirm in Dev Control.

**Full cleanup is irreversible and covers the entire selected local node.** YBR
does not maintain a test-only pin registry. Files belonging to other applications
and other wallet/network profiles on that node are included. Existing NFT artwork
links and encrypted recovery references may stop working. Download anything you
want to keep first; a recovery key alone cannot recreate missing ciphertext.

## Standalone script

```sh
npm run ipfs:clean                    # read-only full-cleanup preview
npm run ipfs:clean -- --apply          # preview, then interactive confirmation
npm run ipfs:clean -- --cache-only     # read-only cache-cleanup preview
npm run ipfs:clean -- --cache-only --apply
```

The script uses `YBR_KUBO_RPC` (default `http://127.0.0.1:5001`), just like the
launcher. Set the same value when running it separately. Only HTTP loopback APIs
are accepted; redirects and remote APIs are rejected. The script works with IPFS
Desktop or the local Docker Kubo node. It requires a running node, not Docker
specifically. There is no unattended `--force` option or browser deletion endpoint.

The preview performs no writes. Applying requires a TTY and an exact confirmation.
Dev Control also checks that Kubo matches the peer discovered by the running stack.
The review expires after ten minutes and is rechecked before any deletion. A
changed inventory requires a fresh review. New/remaining pins or Desktop entries
detected during full cleanup stop garbage collection; already completed removals
are not rolled back. Avoid concurrent writers until the operation finishes.

## Results and limits

Results show pins and Desktop entries removed, blocks collected, storage reclaimed
and remaining protected entries. These counts differ: a directory pin can protect
many blocks, and multiple files can share blocks. Kubo retains its empty MFS root
and repository metadata, so a clean node need not show zero bytes or blocks.

Before deletion, the script saves a private inventory report in
`.road-local/ipfs-cleanup/`. The final report records completion or partial failure.
Reports contain CIDs and Desktop entry names, **not file contents or a backup**.
An `incomplete` report means cleanup may still be running or was interrupted;
it does not mean that nothing was deleted.
An exclusive `active.lock` prevents overlapping cleanups from this checkout. If a
process is killed, inspect the latest report and node before retrying. Remove a
stale lock only after confirming its process has stopped, then run a fresh preview.
Separate checkouts and external clients are not locked out of Kubo.

This preserves the Kubo repository configuration and identity, wallet keys,
Ganache chains/contracts, original source files, and Player media/Playable Cover
records. It does not reset the application or remove already minted Bricks.

It removes locally stored IPFS content, not copies held by other peers or remote
pinning services. Browser/Player copies also remain; opening a known CID can fetch
content again from the network. This is storage cleanup, not secure erasure.

Kubo reference: [garbage collection](https://docs.ipfs.tech/how-to/kubo-garbage-collection/)
and [RPC API](https://docs.ipfs.tech/reference/kubo/rpc/).
