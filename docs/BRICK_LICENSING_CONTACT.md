# Brick licensing contact

A licensing email belongs to each Brick contract. It is publicly readable even
when the work and registration metadata are encrypted and files are locked.
It is a controller-declared contact for approval requests and agreements, not a
verified mailbox, signed license, ownership proof or permission to use the work.

## Creator workflow

Set an optional **Licensor email** in Mint Studio Step 3 and review its public
publication before minting. The same contact starts on every new Brick in that
registration (recording, songwriting and artwork); each can subsequently be
edited independently. Referenced existing Bricks keep their own contacts.
**Settings → Creator defaults → Default licensor email** supplies a reusable
starting value when saved defaults are enabled.

Open **Licensor contact** on a Brick in **My Bricks**, **IP Registry**, or the mint
receipts. **Read licensing contact** reads current contract state. The current
controller can save a replacement address or clear it by saving an empty field.
Saving requires a wallet transaction. File locking does not freeze this contact.
The IP Registry supports read-only lookup without connecting a wallet.

An accepted controller transfer clears the contact and increments its version.
The successor must explicitly publish its own contact. Historical addresses
remain visible in blockchain transactions and logs after replacement or clearing.

## Contract interface

```solidity
function licensingContact() external view
    returns (string memory email, uint64 version, address authority);

function setLicensingContact(string calldata email, uint64 expectedVersion) external;

event LicensingContactUpdated(
    uint64 indexed version,
    address indexed controller,
    string email
);
```

`authority` is the current Brick controller. Only that controller can update the
contact. `expectedVersion` must match the reviewed version, preventing stale
edits from overwriting a subsequent change or surviving a controller transfer.
Clearing the contact also increments the version. An empty email means no contact
has been supplied, not that approval is unnecessary.

The address supports ASCII dot-atom email local parts (up to 64 characters) and
DNS domains with at least one dot; total length is at most 254 bytes. International
domain names must use their ASCII/Punycode form. Display names, multiple recipients,
quoted local parts, whitespace, control characters and message headers are not
accepted. The frontend normalizes the domain to lowercase and escapes reserved
characters when constructing a `mailto:` link.

## Integration

Identify the correct chain and factory, verify `factory.isBrick(brickAddress)`,
then read `licensingContact()` at a consistent block. The NFT receipt already
identifies its underlying Brick with `brickForToken(tokenId)`. No IPFS retrieval,
metadata decryption, Player delivery or YBR-hosted contact directory is required.

```js
const contactAbi = [{
  type: 'function', name: 'licensingContact', stateMutability: 'view', inputs: [],
  outputs: [
    { name: 'email', type: 'string' },
    { name: 'version', type: 'uint64' },
    { name: 'authority', type: 'address' }
  ]
}];
const [email, version, authority] = await client.readContract({
  address: brickAddress, abi: contactAbi, functionName: 'licensingContact'
});
```

Refresh the current state before routing an approval or agreement request. Include
the chain, factory, Brick address and requested use so the recipient can identify
the work. Set the recipient using an email library's structured address field;
do not concatenate it into message headers. The contact interface does not send
email or change any training/playback permissions. An email reply does not replace
the applicable license or required controller signature.

The registration packet includes `rights.licensingContact.email` as its initial
snapshot. This encrypted/exported snapshot may become stale: live Brick state is
authoritative for current contact routing. Contacts are intentionally absent from
NFT display metadata, which external wallets may cache.

## Minting and compatibility

The factory exposes `licensingContactInterfaceVersion() == 1` and
`deployBricksWithLicensingContact(registrations, imageURI, licensingEmails)`.
The ordered email list must match the registration count. Every entry requires a
file policy; blank contacts are allowed. Contacts, permissions, Bricks and initial
NFT artwork are initialized atomically. Any invalid entry reverts the whole batch.
Mint Studio verifies each contact after confirmation before reporting success.

Existing factory entry points remain compatible; minting without an email still
uses the existing batch method. A new Brick minted through that method has an
empty contact at version zero and its controller can supply a contact later.

Older deployed factories and their EIP-1167 Bricks are immutable. They cannot gain
this storage or interface through a frontend update. An email-bearing mint stops
before submission on an unsupported factory. For local testing, with Ganache
running, deploy the updated factory using `npm run ganache:deploy`, then restart
the dev stack. This preserves the earlier deployment reference and existing
Bricks; it does not alter their contracts. On Sepolia, explicitly select or deploy
a factory supporting this interface. No production deployment occurs on merge.

## Validation

Contract tests cover independent contacts, controller-only writes, version checks,
transfer clearing, permanent file locks, malformed addresses, atomic rollback,
input bounds and initializer protection. Wallet integration tests cover the real
batch mint, readback, updates and stale-review rejection on Ganache and a local
Sepolia-ID chain. Browser tests cover saved defaults and per-work contact overrides.
