# Project licenses and funds held by IP

The independent `YellowBrick` contract is the receiving account for its IP. Its ERC721 registration receipt identifies that contract. Payments are **not** pooled in the NFT collection, application wallet, or the older royalty-settlement demo.

## Workspace

Open **Licenses & royalties**, or **License this IP / manage offers** on a registry Brick. Connect the licensing wallet and sign in to the offer inbox. The sign-in message authenticates the wallet; it grants no license and transfers no funds.

- **License IP:** submit signed offers for ingestion or publishing, with project details, exact terms, payment currency, price per unit, quantity, duration, offer deadline and an explicit revocation choice. Review a creator counter-offer before accepting it.
- **Creator inbox:** approve the exact terms, counter, or decline. A counter keeps the Brick, project and licensee, but can change scope, price, quantity, duration or terms. An already authorized offer is cancelled on the Brick before a counter replaces it.
- **Acceptance & collaborators:** manual approval is the default. The current controller can enable a separate rule for each scope. The rule checks the exact terms commitment, currency, price floor, maximum quantity, maximum remaining duration, optional project commitment and revocation choice. There is no blanket acceptance toggle. Sign in when saving a rule to publish its matching terms document in this inbox.
- **IP funds:** inspect native or ERC20 balances and withdraw the connected recipient’s accrued share. Owners and collaborators each claim directly from the Brick. Loading an ERC20 address reads its currency metadata before displaying amounts.

The public licensor email is read from the Brick. Its existing contact editor remains available in the registry and creator views. The app does not send email automatically.

## Fund custody and shares

`licenseReceiver()` is always the Brick itself. An accepted license charges `unitPrice × units` once and stores a grant. Recording usage consumes its prepaid quantity without charging again. Usage records bind an identifier and evidence commitment; they do not prove that a real-world use occurred or enforce rights outside this protocol.

`configureLicensePayout` accepts 1–16 distinct recipients with positive basis-point shares totaling 10,000. New receipts accrue to those recipients. Integer rounding goes to the final recipient. Payout versions are immutable, including the initial 100% owner version. Payout changes invalidate unaccepted signatures and disable automatic rules until the creator reviews them again.

`licenseClaimable(asset, recipient)` tracks each recipient’s earned balance. `claimIPFunds(asset)` transfers only the caller’s accrued amount, clears it before calling out, and is guarded against reentrancy. A failed transfer reverts the accounting change. There is no controller sweep of collaborator balances. The application has no claim authority.

Native transfers to the Brick accrue immediately. Standard ERC20 transfers sent outside `acceptProjectLicense` cannot notify the Brick; `accountReceivedIPFunds(asset)` allocates the unaccounted balance using the **current** shares. Anyone may trigger this allocation. Allocate these deposits before editing shares when the prior split is intended. Forced native transfers are accounted in the same way. Fee-on-transfer, rebasing and other nonstandard assets are unsupported; licensed incoming transfers must deliver exactly the expected amount. Do not send NFTs or unsupported assets to the Brick.

Controller transfer starts a new 100% split for the new controller and invalidates pending authorizations and automatic policies. It does not take away any recipient’s previously earned balance, change an existing grant, or move funds. A new controller can revoke an existing grant only if its accepted terms explicitly permitted owner revocation. Expiry and revocation do not automatically refund payment. Agree on delivery, refund and revocation terms before payment.

## Signed offers and direct transactions

Offers use a `LicenseOffer` typed-data message and the domain `Yellow Brick Project License`, version `1`, with chain ID, verifying Brick and a per-initialization salt. The salt commits to chain ID, Brick, the preceding block and IP identity. The message includes current controller, licensee, receiving Brick, app deployment identity, currency, scope, project and terms commitments, price, quantity, expiry, deadline, licensing epoch, nonce and revocability. EOAs and ERC1271 controller wallets are supported.

The project commitment hashes canonical JSON containing `title`, `description`, `uri`, in that order. The terms commitment hashes the exact normalized UTF-8 terms (trimmed and CRLF converted to LF). `web/src/licensing/protocol.js` defines the canonical envelope and typed message. Store the complete envelope and signatures; chain commitments alone cannot reconstruct the document.

Only the named licensee can call `acceptProjectLicense`. It requires a current controller signature or a qualifying automatic rule. Cancelled or used offer IDs cannot be accepted again. `recordLicensedUse` is restricted to the licensee, rejects duplicate usage IDs and excess quantity, and requires a live grant. All of these calls, payout updates and withdrawals go directly to the Brick. ERC20 approval, when needed, is a standard call to the token contract naming the Brick as spender; the UI requests only the payment amount.

Offers and counters remain application-side until acceptance; this version does not escrow pending-offer funds. Application status cannot manufacture a license: the inbox derives licensed, revoked, cancelled, stale and expired states from live chain data. Closing an offer which already has an authorization requires on-chain cancellation first. A decline does not disable a creator’s broader automatic policy for future offers.

## Deployment wallet and inbox service

The Vite server and preview server mount `/api/licensing`. The service is initialized lazily, after Dev Control supplies a complete network profile. It verifies chain ID and genesis history and accepts only factory-registered Bricks with `projectLicensingVersion() == 1`. The browser also checks wallet account, chain and block history before signing or sending a transaction. The app supports local Ganache and Sepolia profiles.

Each `(chain ID, factory, genesis)` deployment gets its own randomly generated receiving wallet. The address is public in `/config` and the workspace. It identifies that deployment’s offer inbox; **IP payments must go to their Brick**. The wallet private key is never returned to the browser or used to submit transactions. A distinct deployment has a distinct wallet; restarting the same deployment keeps its wallet.

Private state lives under `.road-local/licensing/<deployment-hash>/`: `wallet.json` (private key) and `offers.json` (signed offers, counters and policy documents). Directories have mode 0700, files 0600; symlink storage is rejected. Writes are serialized and replaced atomically. Back up this directory privately; losing the wallet file changes the app deployment identity, and losing the ledger loses its offer documents. These paths are git-ignored and denied by Vite’s filesystem server. Never include them in a public build or support bundle. Static HTML hosting alone cannot run the inbox.

This is a single-process local/testnet service. Run one process per ledger; production hosting needs a transactional database, multi-process locking, monitoring and an operational wallet-backup policy. It bounds requests at 64 KiB, offers at 1,000 per deployment / 100 per licensee, and challenge/session maps at 256. Sessions are in memory and expire after 30 minutes; challenges expire after five minutes and are single-use. Restarts require signing in again. Signed offers persist.

Requests must use the deployment origin, with JSON and a CSRF token for writes. The default allows loopback hosts only. `YBR_LICENSING_ORIGIN` explicitly configures another origin; TLS and an appropriate reverse proxy are needed outside local development. The API never accepts a client-selected RPC endpoint. Sign-in messages bind the origin, chain, factory, genesis and deployment wallet. Offer lists require a wallet session and return only that wallet’s offers or offers on a Brick it currently controls.

| Endpoint | Purpose |
| --- | --- |
| `GET /config` | Public deployment identity and CSRF token |
| `GET /state?brick=…` | Current owner, licensing epoch, salt, rules, shares and matching terms |
| `GET /asset?address=…` | Currency symbol and decimals; zero address denotes native ETH |
| `POST /challenge`, `POST /session` | Wallet-signature authentication |
| `GET /offers?brick=…` | Authenticated incoming/outgoing offers, reconciled with the Brick |
| `POST /offers` | Signed licensee proposal |
| `POST /offers/:id/decision` | Controller approval/counter or party closure |
| `POST /policy-document` | Controller publishes a document matching its on-chain terms hash |

## Compatibility and verification

Existing Bricks are immutable and cannot gain this code through an app update. Deploy the updated factory through the existing Dev Control deployment flow and mint new Bricks to test these features. The workspace identifies older Bricks without changing or reminting them. Factory deployment is not performed by opening the licensing UI. Existing registration, metadata, content-lock, licensing-contact and receipt APIs remain available. A project license does not automatically decrypt private files or change Player-delivery permissions.

Verification covers native and ERC20 custody, direct deposits, collaborator withdrawals, payout edits and transfers, failed/reentrant claims, ERC1271 approvals, transfer-tax rejection, exact automatic rules, replay/cancellation, usage quantity, revocation, real EVM negotiation/payment through the app client, private persistent storage, authentication, and desktop/mobile UI roles and payment review. The original separate license/settlement demo contracts remain compatibility examples, not the workspace’s payment path.
