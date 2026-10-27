# Workspace Tools

The workspace sidebar now has a collapsible **Tools** group containing
**Settings**, **Recover files**, and **MP3 Tags**. Existing appearance and private
recovery workflows are unchanged. Escape collapses the group and returns focus
to its trigger. Mobile navigation uses the same group.

## MP3 tag reader and updater

Choose a local `.mp3` (up to 128 MiB). A disposable browser worker uses the existing
`music-metadata` parser to verify MPEG Layer III and pinned `mp3tag.js` 3.17.1 to
read/write standard ID3. No file upload, API POST, wallet signature, mint, Player
replacement, rights update, or IPFS pin occurs. Files/tags are held in memory,
not saved to localStorage. Clear file releases them; navigating to another
workspace tool retains the editing session until cleared or the tab closes.

Editable fields: title, artist, album, album artist, composer, lyricist, songwriter
(explicit SONGWRITER custom text frame), genre, year/date, track/disc, BPM, ISRC,
publisher, copyright notice, comment and lyrics. Artist is not inferred to be the
songwriter. A frame inventory exposes original text and counts for binary fields.
Imported strings are rendered as text, never executed or followed as URLs.

Artwork previews accept embedded PNG/JPEG bytes, not remote references or SVG.
Replace/remove affects the front cover; other pictures remain. Replacements use
the existing bounded rasterizer to make a local PNG display copy (512 pixels,
512 KiB maximum). They are not NFT artwork updates.

Review the changes, check **Create a new tagged copy**, then choose
**Prepare verified copy** and **Download updated MP3**. The output is named
`<original>-tagged.mp3`; the selected source is never overwritten. Every edit
invalidates the previous output and approval. Discard edits restores the original
values. Parsing/writing times out after 30 seconds and can be canceled.

## Preservation and deliberate limits

The output retains ID3v2.3 or v2.4 as appropriate; untagged/ID3v1-only inputs get
ID3v2.3. ID3v1 descriptive fields are migrated when their v2 equivalent is missing;
the limited v1 trailer is removed rather than preserving conflicting old values.
The UI explicitly discloses this before export. Common fields cleared by the user
are removed. Clearing album also removes explicit custom album-title aliases.
Only the first comment/lyrics entry is edited; alternate languages/descriptors
remain. Untouched frames, including private/custom data and pictures, are copied
verbatim; only edited frames are encoded by the library. All decoded frame values
must still round-trip equivalently or export is blocked.

ID3v2.2, flagged/extended/unsynchronized tags, frame-level flags, ambiguous duplicate
frames, APEv2 and Lyrics3 tails are read-only in this tool. Malformed/truncated tags
and tags exceeding 16 MiB are refused. This first version deliberately prefers
refusal to silent tag loss; it is not a universal tag repair or transcoding tool.

Audio bytes outside the ID3 envelope must match byte-for-byte before a download
is offered. No audio is decoded/re-encoded for export. Tag encoding, padding and
legacy-tag migration can change. The standard ID3 envelope is rebuilt around
retained and library-generated frames, with no optional output padding; correctly
padded source tags are supported. **The whole-file checksum changes after editing.**
An edited copy is a new file version: it cannot silently satisfy an existing
Brick's content commitment or replace authorized Player media. Register or revise
it only through the separate reviewed workflow. Tags are not proof of rights.

## Installation and verification

This adds one exact-version browser dependency: `mp3tag.js` 3.17.1. After pulling,
run `npm run setup:dev`, then `npm run dev -- --restart-player`. No contracts or
network profiles change and no redeployment/remint/reset is required.

`web/tests/mp3-tag-safety.test.js` checks bounds and worker cancellation.
`web/tests/mp3-tag-editor.test.js` checks actual ID3v2.3/v2.4 round-trips with
Unicode, album/writing credits, custom/private frames, artwork, legacy migration
and unchanged audio, plus reimport through Mint Studio's existing parser.
`scripts/tools-browser.cjs` exercises the actual browser worker, export, consent,
mobile menu, drafts across navigation, themes, no uploads and no wallet writes.
Tests use synthetic tag fixtures, not the user's private MP3s.

Primary references:
- https://github.com/eidoriantan/mp3tag.js
- https://mp3tag.js.org/docs/mp3tag.html
- https://mp3tag.js.org/docs/frames.html
- https://github.com/Borewit/music-metadata
