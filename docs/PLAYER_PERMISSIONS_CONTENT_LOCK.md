# Pre-mint Player permissions and content locking

## Creator workflow

Mint Studio's **Review mint** step now shows the **YBR Player permissions** and **Content locked** options before wallet confirmation. Defaults allow Audio Preview playback, cover display and lyrics display only when the corresponding uploaded file exists. Master recordings and project files are not Player targets. AI-training policy remains independent. The final confirmation repeats the selections.

The settings are a proposal before signing, not already on chain. On a policy-capable factory, `deployBrickWithPolicy` registers each Brick and initializes its file commitments, Player permission bits, first revision and optional permanent lock in the **same transaction**. The normal post-mint readback verifies these values. Simulated mints are clearly labeled and do not create grants or locks on chain.

A recording, cover artwork and composition remain independent Bricks. Each stores permissions only for files it actually contains: typically preview playback on the recording, artwork display on the visual work, and lyrics display on the composition. A grant on the recording does not grant permission to another creator's artwork or composition. Linked external Bricks are not automatically authorized by this profile.

A separate **Add release to Player** confirmation is still required to share plaintext preview copies with the local Player. The key and master/project bytes never accompany that request. Permission and content delivery are separate actions.

## Live permission checks

For a wallet-minted preview publication, the browser includes a bounded, public authorization reference: chain ID, configured factory, genesis hash, and the owning Brick/controller/content revision for each shared role. The server verifies the real factory membership, current controller, revision, effective permission bit and matching SHA-256 at a chain snapshot. It rejects inconsistent history and fails closed if chain verification is unavailable.

The checks run when publishing, listing, authorizing and serving files. Revoking preview playback removes the release from the playable list. Revoking artwork or lyrics hides and blocks only that asset. Permissions can be revoked while content is locked. An accepted controller transfer invalidates the previous controller's effective grant; the successor must explicitly authorize its own use. A content revision clears permissions to zero, and stale copied previews cannot inherit approval for the new revision.

This is a **free local-preview application profile**, not the existing paid `YellowBrickLicense` flow. The constant `PLAYER_APPLICATION` identifies `ybr:application:ybr-player:v1`; it is a named policy scope, **not an authenticated app wallet or service identity**. The local Player still uses its existing session/same-origin access boundary. Production service authentication, signed app identity, territorial licensing, payments and DRM are not claimed. Bytes already delivered, buffered or copied cannot be recalled by an on-chain revocation.

The existing public Ganache synthetic-audio demonstration is a separate, explicitly public playback profile. New Mint Studio policy grants do not automatically add a release to that public endpoint.

## Content locked

**Default: off.** The switch is reversible while reviewing a mint. When a transaction commits `locked=true`, or the controller later calls `lockContent`, that Brick's current file set is permanently sealed. There is no unlock operation.

The lock protects the current work hash, per-role preview/artwork/lyrics hashes, and a SHA-256 manifest of **every associated uploaded file**. The manifest encodes a role-sorted JSON array of `[role, sha256-with-0x-prefix, byteLength]`. It excludes filenames and storage locations, so a label correction or relocation of exactly identical bytes does not require a new content identity. A platform must validate the manifest and bytes, not trust an arbitrary metadata URI alone.

| Change | Unlocked | Locked |
| --- | --- | --- |
| Correct generated descriptive metadata | Controller update | Controller update; does not change committed files |
| Revoke/change Player permissions | Controller transaction | Controller transaction |
| Replace preview, master, cover, lyrics, project or uploaded sidecar bytes | Explicit new file revision and new approval | Rejected on this Brick; create a new linked Brick |
| Replace a storage location with identical file bytes | Allowed; verify existing hashes | Allowed; verify existing hashes |
| Change NFT thumbnail presentation | Existing receipt-holder controls | Existing receipt-holder controls, separate from this file lock |
| Change original registration hash/IP identity | Never | Never |

The UI explicitly states that descriptive metadata and wallet thumbnail presentation have independent controls. `contentLocked` is **not** a blanket claim that every visible label or generated NFT thumbnail is immutable. Platforms needing those stronger assurances must separately pin/verify them.

## Editing and new uploads

The original `contentHash` and `ipId` never change. The new `currentContentHash`, `contentRevision` and `fileCommitments` represent the current file version. `reviseFiles` accepts a complete replacement commitment set plus a new metadata URI/digest and expected content/metadata versions. It rejects stale reviews and locked content, increments the content revision, emits an audit event, and clears Player approval. It does not accept raw file bytes or keys on chain.

**Implemented UI:** pre-mint review; live policy inspection, permission changes and permanent locking in **My Bricks → Player permissions and content lock**. Wallet confirmation is required for writes.

**Not yet implemented UI:** the end-to-end upload-replacement editor. The contract revision path is tested, but users cannot yet replace uploads from that panel. That editor must reuse the existing browser encryption, IPFS upload and recovery workflows, show old versus new file hashes, preserve all prior references, and require a fresh review before committing. It must also solve recovery-key continuity for old and new encrypted versions, rather than silently overwriting backups.

Version provenance should use W3C PROV-O's `prov:wasRevisionOf` and `prov:wasDerivedFrom`, with `prov:specializationOf` for a version's relation to a stable work where appropriate. C2PA remains complementary media evidence, not a replacement for app permissions. This change does not claim to generate or verify C2PA assertions, nor does it define a competing provenance format.

## Existing deployments and local setup

Existing EIP-1167 Bricks/factories are immutable deployments. Pulling code does **not** add these methods to already deployed contracts. Old method entry points remain available for compatibility, but a Brick created without policy initialization does not acquire a new permission automatically.

The updated mint UI refuses an incompatible factory before the optional encrypted-IPFS upload starts. With the existing local Ganache still running, explicitly deploy the new version from the repository root:

```sh
npm run compile
npm run ganache:deploy
```

Restart `npm run dev`, then select the newly deployed factory in Mint Studio if a saved older address takes precedence. The deployment script archives the former factory reference; it does not delete the chain, migrate registrations, remint old works, or replace wallet tokens. Old registrations remain inspectable through their original factory.

Local simulation previews retain their explicitly unverified status. Legacy stored previews with on-chain references but no policy proof are not served as if authorized under this new policy; their files are not silently deleted. New on-chain preview sharing currently verifies Ganache 1337 only. Sepolia can store the policy, but delivery through the local Player is not configured for it.

## Verification

Tests cover atomic mint initialization, per-Brick role separation, missing-file refusal, absent master/project permissions, permanent locking, controller-only changes, stale reviews, revision resets, controller transfer, and preservation of original identity. A disposable Ganache integration signs real policy mints through the browser-wallet adapter, publishes exact preview bytes, revokes permissions, checks denied HTTP delivery and hidden artwork, seals content, and verifies revocation still works. The Chromium release test inspects the pre-mint defaults and permanent-lock warning, alongside the existing artwork/lyrics/preview-only checks.

References: W3C PROV-O https://www.w3.org/TR/prov-o/ and ERC-1167 https://eips.ethereum.org/EIPS/eip-1167. No new cryptographic primitive is introduced.
