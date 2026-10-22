# Upload metadata autofill and preview-only playback

## What the creator sees

Every selected file gets a title derived from its basename (without the final extension, with underscores converted to spaces). Unicode, track numbers, version numbers and hyphens are preserved. The primary work supplies the initial release title. An artwork/lyrics/project filename never renames the recording.

Supported embedded metadata replaces inferred filename values, but never replaces an edited field, including a field deliberately cleared by the creator. Pre-existing saved form values also stay intact. For conflicting automatic suggestions, an explicit metadata sidecar has priority, then Audio Preview tags, then Master Recording tags. Replacing a file discards that file's old automatic suggestions; superseded reads cannot apply late results.

## Adapters, not a claim to parse every binary format

- **All uploads:** filename title, filename, reported MIME type and byte length. Unsupported formats remain uploadable under the existing size limit with these defaults.
- **Audio/media:** `music-metadata` reads embedded tags from supported MP3/ID3, WAV/BWF, FLAC, Ogg/Opus, MP4/M4A, AIFF and other formats recognized by that library. The importer maps title, recording artist, album, composer/lyricist/writer credits, approved genre, BPM, musical key, valid ISRC and comments. Technical attributes such as duration, codec, sample rate, channels and bit depth are retained when available. Missing tags stay missing; there is no external lookup or AI inference.
- **Images:** `exifr` reads selected descriptive TIFF/EXIF fields in supported JPEG, TIFF, PNG, HEIC/HEIF and AVIF files. Image title, creator and dimensions remain associated with the image; an artwork upload does not overwrite the release's recording artist. GPS, XMP, camera serial numbers and unbounded raw tag collections are not copied.
- **Metadata sidecars:** bounded JSON or key/value text supports only known descriptive form fields. It cannot set permissions, wallet addresses, royalties, claims or streaming grants.

Document/DAW-specific embedded metadata parsers are not implemented in this increment. They get filename defaults and basic file attributes. Embedded cover/lyrics binary extraction is not added here; those continue to use their existing dedicated upload slots.

## Privacy and safety

Parsing runs in a disposable browser Worker with a 15-second timeout, using locally selected File objects. A malformed or unsupported tag returns a filename fallback without blocking encryption. The current 256 MiB upload cap still applies. Workers are canceled when a file is replaced, the category changes, the studio resets, or the component unmounts. Keys are not involved in metadata extraction.

Raw files and extracted tags are not sent to a metadata service. As before, **Remember form fields on this device** can persist the reviewed descriptive form fields in browser localStorage; disable it for sensitive drafts. Selected per-file technical metadata travels in the registration packet labeled `unverified-file-metadata`. Public release labels leave the browser only when the creator approves automatic local Player delivery in Step 3 before mint.

Embedded credits are unverified statements from the file, not evidence of copyright ownership, contributor consent, royalties, or permission. The encoder/tool tag is not guessed to be the creator's DAW. Unknown genres remain a manual choice rather than corrupting the approved genre selector.

## Audio Preview is the only Player source

The uploaded **Audio Preview** supplies playback bytes. A missing/unsupported preview blocks publication even if the Master Recording is a supported audio format. Browser and server checks enforce the role; the browser never decrypts the master for Player delivery. Existing stored master-based demo releases are hidden and unservable, not silently deleted. Re-publish using a preview. The separate synthetic Ganache fixture is unchanged.

## Tests

`npm test --prefix web` covers filename normalization, field whitelists, supported format fixtures, broken tags, deterministic precedence, manual clearing and stale results. Player tests reject master/ambiguous sources and legacy master delivery. Chromium integration attaches files through the real Mint Studio, exercises worker parsing from master and preview, checks field edits, and verifies played bytes match a distinct preview rather than the master.

Parser references: https://github.com/Borewit/music-metadata and https://github.com/MikeKovarik/exifr. These are reused format readers; YBR does not define a replacement media-tag standard.

## MP3 album and songwriter mapping

The Files summary and Step 3 form expose **Album / release** and **Songwriters /
composers**. Standard album TALB, composer TCOM and lyricist TEXT tags are read
through music-metadata. Missing normalized fields can fall back to those native
ID3 frames, including their ID3v2.2 equivalents. Explicit custom TXXX Writer,
Writers, Songwriter and Songwriters descriptions are also recognized,
case-insensitively. Values are trimmed and duplicate names collapsed; artist and
album-artist tags never invent songwriting credit. Missing credits stay empty.

These are unverified suggestions. Manual album/writer edits and intentional
clearing win over later file parsing, just like title edits. Album is retained in
the recording metadata; reviewed writers feed the independent composition credits
when that Brick is selected. Other-writer approval checks remain in force.

Tests include encoded MP3 album/composer/lyricist/custom-writer frames and a real
Chromium Worker-to-form path, not only mocked parser results.
