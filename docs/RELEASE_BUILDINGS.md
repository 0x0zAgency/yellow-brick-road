# Release Buildings

A music release is a **Building** of independently registered Bricks. A release
is not another rights claim, and attaching a file is not automatically minting it
as another NFT.

- Recording Brick: master, Audio Preview, project file and metadata sidecar.
- Artwork Brick: independently credited cover artwork.
- Composition Brick: songwriting and its lyrics/evidence, when created separately.
  Otherwise the attached lyrics stay with the primary work.

The Building can be expanded in Mint Results, My Bricks and the on-chain Registry.
Mint Results keeps NFT customization above its collapsed parts. Pending receipts
remain visible by opening the group automatically. Collections paginate complete
Buildings, not individual members; search matches a part without hiding its siblings.

## Explicit associations, not guesses

New packets contain a `building` proposal plus `extensions.building` in each
member's metadata. The ordinary verified mint commits those metadata bytes using
its existing metadata digest. The separate **Download Building manifest** action exports resolved
chain/factory/history-scoped references. Keep the full JSON mint packet to restore
associations later; the manifest alone is not its receipt/evidence bundle. No extra NFT or
Building contract is deployed, no existing contract is upgraded, and no ownership,
playback policy, license or payout setting changes as a consequence of membership.

The `YellowBrickBuilding` contract already supports direct Brick references; this
is a **contextual Building**, not a claim that that contract was deployed. Nested
album/compilation references are a manifest-level foundation only. The current
contract does not accept another Building as a member, so nested on-chain Building
authoring requires further implementation and explicit creator authorization.

The view caches only chain/genesis/factory/member identifiers and file roles under
`road:release-buildings:v1`. It is a rebuildable display index, not a permission
source. The cache holds no private names, file bytes, metadata packets or keys.
It is matched against the current verified scan, including IP ID, transaction and
metadata commitment. Different histories, different factories or changed metadata
cannot silently merge. Shared members are references in each parent, not a reason
to merge those parents. Missing scan members are called out.

Encrypted metadata cannot be read from a hash. On another browser, or for older
mints, choose **Restore grouping from JSON packet** with the original full mint
packet. Parsing and commitment checks happen locally; nothing is published or
signed. The existing `recording-session` and `creative-work-session` packet forms
are accepted only when their explicit part relationships and receipts match.
Missing/changed/unknown associations remain standalone rather than being guessed
from matching cover images, artist names, album tags or timestamps. Import is not
verification of copyright ownership. Keep your packet; the cache retains at most
200 Building associations.

## Albums, compilations and interoperability

`createBuilding` and `validateBuildingGraph` accept `music-release`, `work-bundle`,
`album` and `compilation`. Members reference a `brick` or another `building`, with
an explicit role and sequence position. The graph rejects duplicate members,
duplicate identities and cycles. Unresolved external references are permitted but
are not authorization or evidence of an available/deployed member.

PROV-O `prov:Collection` / `prov:hadMember` express portable membership. PROV
collections are unordered; Road's `position` is the application ordering field.
The export does not claim C2PA or DDEX conformance and does not infer derivation
from mere collection membership. Schema: `building-context-v1.1.schema.json`.

Primary vocabulary reference: https://www.w3.org/TR/prov-o/#Collection and
https://www.w3.org/TR/prov-o/#hadMember . Existing v1 schema is retained unchanged.

## Tests

Unit regressions cover membership commitments, file roles, scoped identity,
no-heuristic grouping, shared members, graph cycles, tampered imports, legacy
packets and private-data exclusion. The real Ganache policy integration resolves
all minted parts against live verified contracts without another transaction.
The Chromium view regression tests collapsed/expanded results, packet import,
collection rollups, child searches, mobile layout, copies, errors and no signing.
Its visual RPC data is mocked; the separate chain integration is real.
