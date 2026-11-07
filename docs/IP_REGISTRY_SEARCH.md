# IP Registry discovery scaffold

Open **IP Registry** to find works for an ingestion license, publishing project or purchase discussion. Browsing requires no wallet connection. This is a search interface over the existing verified registry, not a marketplace with published sale listings.

## Available now

- Search public titles, creator labels and descriptions, IP identities, contract/wallet addresses, mint transactions and content/metadata commitments.
- Filter by publicly disclosed work type, public preview availability, original creator or current controller, registration block range, and the connected creator’s works.
- Sort by newest/oldest registration or title. Switch between grid and list layouts.
- Bookmark works into a local shortlist. Only public identity keys are stored; they include chain, factory, genesis when supplied, Brick, IP identity and mint transaction. A same-address deployment on another history does not inherit a match. Storage failure is reported. No recovery material, labels, terms or contact email is stored in this collection.
- Open **Explore this IP** for public information, provenance identifiers and the current licensor email read directly from the Brick. The native dialog supports keyboard focus containment, Escape and focus return.
- Choose **License for publishing** or **License for ingestion**, then **Propose … license**. The existing offer workspace receives the selected Brick and scope. It checks current compatibility, policies and account/network state before any offer is signed.
- Choose **Discuss a purchase** to read the licensor contact. Its email link opens the user’s mail client. There is no automatic email, purchase offer transaction, listing price or purchase checkout in this scaffold.

The intent choices select the next action; they do not claim or filter for rights availability. A public playback grant does not imply an ingestion/publishing grant or that the IP is for sale. The current public catalog supports music labels. Other work categories are present in the filter vocabulary, but private registrations remain **Type not disclosed** until a verified public publication adapter exists. No work type is guessed from filenames, ciphertext, commitments or local recovery files.

Building associations stay intact: matching one member includes its related parts. The matching-work count and result count are separate. A saved shortlist view shows only members of the current verified scan; it never treats a saved identity as a current registration. The existing Local drafts & examples tab stays separate from live results.

## Coverage

The existing `/road/api/registry` feed scans the selected factory, at most 100,000 blocks and 200 returned registrations, and refreshes every five seconds. The UI exposes partial coverage. Block filters narrow that loaded range; they do not expand historical indexing. Offline or invalid registry responses remove live results and close the detail view instead of claiming an empty registry.

No private metadata URI is fetched for search. Thumbnails use the existing restricted public receipt-image path. Search, filtering, bookmarking and opening work details request no signatures or transactions. The offer workspace remains the place for authentication and explicitly approved signing/payment.

## Next extension points

`web/src/registry-search.js` owns search predicates, sorting, public work classification and shortlist identities. `RegistrySearch.jsx` owns filters and the work-detail dialog; `LiveRegistry.jsx` supplies verified rows and preserves Building grouping. Extend the existing feed with a verified public publication adapter before enabling more category mappings.

Richer discovery needs creator-published listing data with an explicit schema and revision. Candidate facets include permitted uses, territory, duration, exclusivity, currency-denominated pricing, attribution requirements, approval mode and purchase availability. Unknown fields must remain unknown, never default to “available,” “free,” or automatic approval. Keep native/token prices separate until a quote policy exists.

Bind each listing to chain, genesis, factory, Brick, current controller and its signed publication revision. Invalidate stale listings on controller changes or withdrawn publication; recheck current on-chain terms before presenting an executable offer. A full deployment needs a paginated indexer and reproducible sort/cursor semantics beyond the bounded local scan.

Use existing provenance standards when enriching public records: retain PROV-O relationships and carry C2PA references where available. Registration, public publication, signed license terms and purchase/assignment agreements are distinct evidence. NFT/control transfer alone must not be displayed as an agreed IP-rights purchase.

## Verification

Model tests cover combined filters, undisclosed fields, exact wallet roles, large block numbers, Building grouping, sorting and identity-scoped local storage. Existing Chromium regressions cover real React search controls, no-match/error states, shortlist persistence, list/grid views, purchase email, scope handoff, keyboard focus, desktop/mobile bounds and the absence of signing/private-content requests. The licensing regression verifies that the selected publishing scope reaches the actual offer form.
