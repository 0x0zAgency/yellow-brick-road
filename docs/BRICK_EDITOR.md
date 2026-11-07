# Brick editor

In **My Bricks**, find your registrations and select **Edit Brick** on a Brick card (including a member inside a Building).

- **Work details:** automatically load a matching recovery file saved for the connected wallet (or import its JSON), then edit title, description, language, existing creator credit names/roles, music details where present, and industry identifiers. Review changes, then save through the controller wallet.
- **NFT artwork:** inspect the public NFT metadata and publish a replacement display thumbnail through the existing cover tool.
- **Licensor contact:** read and change the public licensing email stored on the Brick.
- **Content controls:** read the current file lock and, for audio works, Player permissions. Locked files stay permanently locked. Descriptive metadata remains editable.
- **Licensing & funds:** the existing licensing workspace opens for this Brick, including offers, default acceptance, collaborator payout shares and withdrawals.

Work details require supported encrypted IPFS metadata and a nonzero on-chain commitment. The editor reads live factory membership, controller, metadata version and chain history, then verifies the recovered plaintext against that commitment. Unsupported/legacy metadata cannot be rewritten through this form; independent cover and contact controls remain available when supported by their contracts.

Only ciphertext goes to the IPFS upload bridge. Recovery files are saved in browser-local IndexedDB, scoped to the connected wallet. Keys are never sent to a server or written to localStorage. Decrypted metadata stays in component memory; a work title is kept with the local recovery file for identification. Closing the editor clears its in-memory session, while saved recovery files remain available; unsaved work details prompt before leaving. Wallet/network changes clear it immediately. An updated recovery JSON is available after pinning, including when a wallet confirmation is rejected. The same original recovery key can still open the updated metadata from the Brick. Updated recovery files are retained locally before signing and enriched with the verified Brick identity after confirmation; earlier copies remain available. Download the new file for its current CID/checksums. Clearing an editing session does not delete saved files.

The save calls the existing `updateMetadataWithDigest` on the existing Brick. It does not mint a replacement or change files, file commitments, original content identity, relationships, rights terms, payout configuration or Player permissions. Existing unknown metadata fields/extensions survive. Revision records use PROV-O revision vocabulary and preserve the original recording timestamp. Private work titles do not change the public NFT name.

After confirmation, My Bricks updates its metadata reference/version and advances matching local Building associations to the confirmed digest. Shared Brick references remain shared. This is a local display association, not a new on-chain Building or a license grant.

The editor rechecks the reviewed state before pinning and before signing, verifies the exact confirmed transaction, and checks the resulting version/commitment. A submitted transaction can be checked again without submitting another write. Existing immutable Brick deployments have no expected-version parameter on `updateMetadataWithDigest`: concurrent controller transactions accepted after wallet review cannot be prevented on-chain. Use one editing session at a time; unexpected final state is reported rather than retried automatically.

Previously delivered Player publications are bound to the old metadata commitment and may become unavailable until redelivered. The editor does not republish private material or silently renew a Player delivery. Original source-file replacement and adding/removing credited identities are outside this descriptive editor; use explicit content revisions or rights workflows for those operations.

Validation: unit tests cover field preservation, bounded inputs, authenticated recovery, ciphertext-only pinning, recovery round-trip and Building associations. A disposable Ganache test verifies edits to locked Bricks, authorization, stale reviews, exact transaction verification and confirmation recovery. Chromium covers the actual My Bricks/editor flow, rejected wallet retries, download/reopen, wallet changes and desktop/mobile layouts.

## Local recovery collection

**Tools → Recovery files** collects imported files and recovery files from IPFS minting, Brick editing and file recovery. It supports multiple original v1/v2 JSON files, a single wallet collection export, search, individual downloads and individual removal. Reimporting the same file does not duplicate it. Updated snapshots retain older recovery material. A collection can be reimported only under its recorded wallet; standalone recovery files are assigned to the connected wallet.

Files live only in IndexedDB on this browser profile and site origin. They are not backed up to the app, server, IPFS or blockchain. Switching origins (including HTTP/HTTPS, localhost/127.0.0.1, or port) uses a different collection. Clearing browser site data removes it. **Download all** creates a private, portable JSON collection; keep this export independently. The wallet address organizes local records; it is not encryption or an authentication barrier against another person using the same browser profile.

Opening Edit Brick reads the current chain, factory, controller and metadata commitment, then tries matching local keys without sending them anywhere. Saved Brick associations are only hints; actual decryption and the current on-chain digest must verify. Wallet/network changes discard the editing session. If no saved file matches, the existing manual import remains available. Unavailable/full storage does not invalidate a successful on-chain update: the UI reports that local saving failed and retains the manual download.

Collections are bounded to 512 files and 32 MiB per wallet. Import validation completes before an atomic IndexedDB write, and storage failure never reports a successful save.
