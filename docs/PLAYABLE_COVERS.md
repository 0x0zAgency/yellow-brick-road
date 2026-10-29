# Creator Cover Art Studio

Cover Art Studio turns a creator's uploaded audio into a committed **Playable
Cover**. It appears as a separate line item in YBR Player alongside the source
tracks. Listener controls move the listening point and blend the sounds; the
composition tools live in the creator workspace.

1. In Mint Studio, share the Audio Previews and cover artwork you want to use with
   the Player. Existing Mint Studio release associations provide an audio Building
   in the tool. You can also open **Buildings → New Building** to group uploaded
   audio into a new local audio Building.
2. Open that Building's **Cover Art Studio**, or use **Tools → Cover Art Studio**.
   The composer is locked until an audio Building exists.
3. Name the Playable Cover and choose shared artwork. Add up to eight sounds from
   the uploads available in this local workspace, including sounds outside the
   Building's initial members.
4. Drag the numbered audio pins around the artwork. Arrow keys move the focused
   pin by 1%; Shift + arrow moves it by 5%. Position and size fields allow precise
   placement. The entire region stays within the artwork.
5. Use **Preview cover** to listen and move the listening point. Stop the preview
   to edit pins again. Drafts remain in memory while navigating the workspace;
   reloading before committing discards the draft.
6. Choose **Commit Playable Cover**. The layout, title, blend reach, Building
   association and source checksums are saved. The Player discovers the new item
   on its next library refresh, or immediately through **Open in Player**.

Committed records survive browser and Player restarts. **Edit copy** restores a
saved layout into the composer; committing a changed copy creates a new immutable
object. An identical retry reuses the same object and original publication date.
**Withdraw** removes a cover from the Player without deleting its source audio.

## Existing rights and storage

This extends the local creator-preview workflow. The local publishing API requires
a loopback, same-origin request and the current process's publishing token. It is
not public multi-user creator authentication. “Your uploads” refers to preview
copies shared into this local workspace, not every registered Brick or private
encrypted upload. The tool never reads recovery keys or substitutes masters for
Audio Previews.

Audio Buildings and Playable Covers are app presentation objects stored under
`.road-local/playable-covers/`. Mint Studio release associations are contextual
Buildings derived from the release's existing Brick references; no Building
contract is deployed. Manually created Buildings have their own stored member
references. These groupings do not claim copyright or grant a license.

Every source is checked through the existing Player permission service on commit
and catalog reads. Playback authorizes and streams each referenced audio Brick
independently, preserving its interaction identity. Artwork uses its existing
permission-protected route. A missing source, changed commitment, changed network
or revoked permission makes the whole cover unavailable. The listening view stops
an active cover when a refresh removes it. Original source tracks remain separate
items. Playable Covers do not enter the public `/road/api/music` catalog.

Sounds loop independently using the existing Audiocover engine. This is an
interactive mix, not a rendered audio file or sample-synchronized stem export.
Presentation data remains separate from PROV-O provenance references and the
protocol's rights records.

## Verification

`npm --prefix apps/ybr-player test` includes Building unlock, durable commits,
idempotency, permissions, HTTP boundaries, withdrawal and pin movement tests.
After building the web app, `node scripts/playable-cover-browser.cjs` exercises
the production React bundle and an isolated Player with synthetic media:
dragging, keyboard placement, resizing, preview, commit, reopening the saved
layout, Player selection, playback, revocation and mobile layout. It requires the
same isolated Playwright installation as the other browser regressions and is
included in the Player release CI workflow. It makes no blockchain writes.
