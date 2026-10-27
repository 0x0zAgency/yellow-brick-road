# Workspace Tools and MP3 tags

## Navigation

The workspace sidebar groups **Settings**, **Recover files**, and **MP3 tags**
under the expandable **Tools** menu. The active tool opens its group automatically,
including on mobile. The existing Settings and encrypted-file recovery screens
are retained. The breadcrumb reads Workspace / Tools / the selected tool.
`?tool=settings`, `?tool=recovery`, and `?tool=mp3-tags` open known tools directly;
unknown query values return to the usual landing page.

Settings retains its common-tool shortcuts. Workspace/Player themes, independent
Player playback, network controls, keys and recovery material are unchanged.

## MP3 reader and updater

Choose a local MP3 (up to 64 MiB). Reading and editing run in a disposable browser
worker with a 45-second timeout, not a server upload. The screen shows descriptive
credits, tag types, codec details and available embedded artwork. Its filterable
inspector displays up to 200 tag summaries; binary values are summarized.

Editable fields: title, artist, album, album artist, songwriters, composers,
lyricists, year, genre, track/total, disc/total, ISRC and copyright. Songwriters use
an explicit `TXXX:SONGWRITER` field; composers and lyricists use `TCOM` and `TEXT`.
An edited blank removes that field. Editing Year deliberately replaces the full
recording date with a four-digit year; the UI discloses this.

Review the before/after changes and check **Approve tag changes**, then choose
**Prepare tagged copy**. The tool verifies the copy before offering
**Download tagged MP3**. The original file is never overwritten. Changing a field
invalidates any previously prepared download. Files and draft edits stay only in
memory; cancel, clear, navigating away or reloading discards them. No metadata is
silently stored in localStorage or sent to a wallet, Player, registry or IPFS.

## Preservation and safe boundaries

Reading uses the existing `music-metadata` package. New text frames are encoded
with pinned MIT-licensed `mp3tag.js` 3.17.1, not a new text-tag codec. A bounded
ID3 envelope adapter retains unedited v2 frame bytes (including APIC artwork,
custom frames and unknown frames), replaces only explicitly edited text frames,
and compares the remaining audio payload byte-for-byte. No audio re-encoding.
The output is parsed again, and its edited fields must match before download.

Editing supports ordinary, unflagged ID3v2.3 and ID3v2.4 tags and tagless MP3s.
ID3v2.2, unsynchronised/extended/footer tags, flagged or position-sensitive frames,
additional APE/Lyrics tag formats, and malformed/oversized layouts are read-only
or rejected rather than stripped. Tag area is limited to 8 MiB and 2,048 frames.
This is a deliberately conservative first editor, not universal tag conversion.

ID3v1 conversion needs a separate explicit checkbox. Supported legacy descriptive
values and comments are carried into v2 when absent there; existing v2 values
remain authoritative. The old trailer is removed only from the exported copy to
avoid two contradictory copies of the edited field. Conflicting legacy comments
block export. Advanced or unsupported structures remain untouched in the source.

Changing tags changes a file's whole-file hash even when its audio is unchanged.
An edited MP3 is not automatically a revision of a previously minted Brick, and
no stored hash, permission, NFT image, royalty, IP claim or recovery key is changed.
Use the new file in a later, explicitly reviewed registration/revision workflow.
Embedded tags remain descriptive assertions, not proof of legal ownership.

## Minter upload precedence

Restored form data is a default, not a manual-edit lock. New uploaded descriptions
and credits replace remembered values (including track title, artist, album and
writers). Missing/invalid tags do not clear saved fields. Primary filename fallback
also replaces a stale remembered title when no embedded title is available.

Deliberate edits or clearing in the **current** session remain authoritative during
late worker updates and file replacement. Once restored in a new session, those
values are defaults again. Existing role priority is unchanged: metadata sidecar,
then embedded preview tags, then embedded master tags; cover/lyrics/project file
names do not rename the main release. **Use extracted album** can explicitly
replace a current-session album edit. Newly resolved values are remembered only
when **Remember form fields on this device** is enabled. Metadata never supplies
wallets, permissions, contributor approvals or royalty assignments.

## Test and install

```sh
npm run setup:dev
node --test web/tests/mp3-tool-model.test.js web/tests/mp3-tool-core.test.js web/tests/upload-precedence.test.js web/tests/album-recovery.test.js
npm --prefix web test
npm --prefix web run build
```

The new dependency needs installation after pulling. Stop Dev Control, pull main,
run `npm run setup:dev`, then `npm run dev -- --restart-player`. No contract
redeployment, chain reset, remint, certificate change or storage migration is
required for Tools or precedence. The separate atomic-mint factory requirement
still applies to installations that have not yet upgraded that contract.

CI additionally checks the actual editor worker, download/reparse, Unicode tags,
unknown frames and artwork preservation, legacy conversion, no network/storage
writes, desktop/mobile navigation, and restored data in the actual minter. Test
media is synthetic. No public chain or user funds are used.

Primary references: https://mp3tag.js.org/docs/mp3tag.html ,
https://github.com/Borewit/music-metadata , https://id3.org/id3v2.3.0 ,
https://id3.org/id3v2.4.0-structure .
