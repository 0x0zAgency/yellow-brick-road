# Linked Bricks and cross-wallet authorization · v1 prototype

A creator can register a recording while referencing cover art, composition, lyrics or another preexisting Yellow Brick owned by a different wallet. **A contract address or a credited name is not authorization.** This is a local-first, signed-consent workflow, not a finished license-delivery or settlement module.

## Creating a reference

1. The master creator uploads/hash-encrypts the primary file, enters creator and licensing claims, then uses **Add existing Brick reference** in Step 3.
2. They choose the relationship (cover art, composition, lyrics, other), enter the target Brick's contract address and original YellowBrickFactory address, and specify an explicit use/credit scope.
3. The client reads the live target Brick's `ipId()` and `controller()`, verifies the factory's `isBrick(target)`, and constructs an EIP-712 LinkApproval request. It includes the creator/requester wallet, source file SHA-256, target address, target IP ID, factory, relationship, scope, 32-byte random nonce, target contract as verifyingContract, chain ID, and an expiry (30 days by default).
4. The requester copies the JSON and shares it privately with the target Brick's controller. **There is no background delivery or server inbox.**
5. On the controller's connected wallet in **My Bricks → Approve a Brick reference request**, the owner pastes the JSON, reviews the requester, source commitment, target, relationship, scope and expiry, checks explicit consent, then signs with their own wallet (`eth_signTypedData_v4` via viem).
6. The owner copies the signed response to the requester, who pastes it into the original link form. The requester client verifies the signature using the current target controller, factory registration, target IP ID, chain ID, exact request digest, expiry, requester/source hash/scope. The app **revalidates each response immediately before sending any on-chain Brick mint transactions**.
7. The registration packet contains the external Brick reference and its signed EIP-712 consent evidence, separate from the original Brick's rights. A prior signature cannot be silently repurposed for another source hash, address, scope or chain.

## New artwork and lyrics

A **new cover-artwork file** receives its own visual-artwork Brick with independent title, visual IP category, description, artist credit, wallet and a separate pending royalties allocation. When using an external wallet, that cover Brick may only be minted by the artwork creator's wallet; an artist cannot mint another creator's artwork from the recording wallet. Instead, have the cover artist mint their own Brick and approve a reference.

**Lyrics manuscript** is an optional music-category upload. When a songwriter is registering an original composition associated with a recording, an attached lyrics file belongs to their composition Brick, not the sound recording. A lyric manuscript owned by another creator should be minted in the owner's wallet and linked to the recording. A linked composition is *referenced*, not minted a second time by the recording artist.

## Security boundary and future multi-signature handling

This implementation performs real browser-local EIP-712 wallet signatures. It supports EOA validation and viem EIP-1271 signature verification against contract-wallet controllers when a contract-wallet-approved response is supplied; **automated Safe/multisig proposal execution and signing remain future integrations**.

**Critical limitation:** the current `YellowBrickFactory` minting transaction registers a new Brick and its metadata digest only. The existing Building and factory contracts do not enforce or persist an independent signature-gated link. We therefore label the association as a requested/signed **off-chain** relationship, not as a finalized on-chain approval, completed licensing agreement or transfer of copyright. Future ingestion and/or a new link registry MUST reverify signatures, controller, chain, nonce replay protection, deadline and permitted scope before accepting or executing a rights-bearing link. Revocation/expiry and authorization policy require their own versioned protocol, not merely an EIP-712 signature embedded in JSON.

For privacy, source content, unencrypted files, wallet secrets and signatures are never transmitted to Road infrastructure. Request and approval JSON are exchanged voluntarily via copy/paste. The request **does reveal** addresses, source file hash and requested scope to the recipient; creators should not submit secret work titles or confidential collaboration details as public on-chain metadata. Cross-wallet request/response objects remain in session memory rather than unencrypted localStorage and will be lost on refresh.

## Manual smoke test

Start Ganache, deploy the factory, and mint a cover artist's artwork from account B. Import B's Brick contract and factory into a new recording registration from account A. Generate the link request from A. Switch to B in the wallet and use My Bricks to verify and sign the request. Switch back to A, paste the response and verify. A can then mint the recording with a signed external reference. Try modifying the source file, network, target Brick, scope, or controller after signing: validation must fail. The evidence remains off-chain until an authorized ingestion/link registry is implemented.
