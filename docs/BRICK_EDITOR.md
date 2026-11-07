# Brick editor

In **My Bricks**, find your registrations and select **Edit Brick** on a Brick card (including a member inside a Building).

- **Work details:** import the private recovery JSON from Mint Studio, edit title, description, language, existing creator credit names/roles, music details where present, and industry identifiers. Review changes, then save through the controller wallet.
- **NFT artwork:** inspect the public NFT metadata and publish a replacement display thumbnail through the existing cover tool.
- **Licensor contact:** read and change the public licensing email stored on the Brick.
- **Content controls:** read the current file lock and, for audio works, Player permissions. Locked files stay permanently locked. Descriptive metadata remains editable.
- **Licensing & funds:** the existing licensing workspace opens for this Brick, including offers, default acceptance, collaborator payout shares and withdrawals.

Work details require supported encrypted IPFS metadata and a nonzero on-chain commitment. The editor reads live factory membership, controller, metadata version and chain history, then verifies the recovered plaintext against that commitment. Unsupported/legacy metadata cannot be rewritten through this form; independent cover and contact controls remain available when supported by their contracts.

Only ciphertext goes to the IPFS upload bridge. Keys and decrypted descriptions stay in component memory, never localStorage. Closing the editor clears the session; unsaved work details prompt before leaving. Wallet/network changes clear it immediately. An updated recovery JSON is available after pinning, including when a wallet confirmation is rejected. The same original recovery key can still open the updated metadata from the Brick. Save the new recovery file for its current CID/checksums.

The save calls the existing `updateMetadataWithDigest` on the existing Brick. It does not mint a replacement or change files, file commitments, original content identity, relationships, rights terms, payout configuration or Player permissions. Existing unknown metadata fields/extensions survive. Revision records use PROV-O revision vocabulary and preserve the original recording timestamp. Private work titles do not change the public NFT name.

After confirmation, My Bricks updates its metadata reference/version and advances matching local Building associations to the confirmed digest. Shared Brick references remain shared. This is a local display association, not a new on-chain Building or a license grant.

The editor rechecks the reviewed state before pinning and before signing, verifies the exact confirmed transaction, and checks the resulting version/commitment. A submitted transaction can be checked again without submitting another write. Existing immutable Brick deployments have no expected-version parameter on `updateMetadataWithDigest`: concurrent controller transactions accepted after wallet review cannot be prevented on-chain. Use one editing session at a time; unexpected final state is reported rather than retried automatically.

Previously delivered Player publications are bound to the old metadata commitment and may become unavailable until redelivered. The editor does not republish private material or silently renew a Player delivery. Original source-file replacement and adding/removing credited identities are outside this descriptive editor; use explicit content revisions or rights workflows for those operations.

Validation: unit tests cover field preservation, bounded inputs, authenticated recovery, ciphertext-only pinning, recovery round-trip and Building associations. A disposable Ganache test verifies edits to locked Bricks, authorization, stale reviews, exact transaction verification and confirmation recovery. Chromium covers the actual My Bricks/editor flow, rejected wallet retries, download/reopen, wallet changes and desktop/mobile layouts.
