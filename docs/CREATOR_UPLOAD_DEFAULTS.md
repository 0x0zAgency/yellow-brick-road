# Album artwork and creator upload defaults

Mint Studio's Master recording picker includes WAV, FLAC, AIFF, MP3 and other
audio formats. Audio Preview accepts `.mp3` only, with ID3 tags supplying the
track and album descriptions. Artwork uses PNG, JPEG or WebP; lyrics and metadata
have their own filters. Native projects remain unrestricted. File-picker hints
can be overridden by an OS, so the MP3 preview extension is also checked before
hashing and encryption.

## Reuse album artwork

Attach a tagged MP3 Audio Preview. At Review mint, **Previous album artwork**
offers public NFT images from matching previous uploads. Matching ignores case,
extra whitespace and equivalent Unicode composition, and uses the preview's
embedded album tag, not a filename or a saved form value. Missing album tags do
not match. Choose **Use previous album artwork** or continue with your own image.

Existing uploads shared with the local Player are searched, along with a small
browser index of subsequent confirmed mints. The latter stores hashed album
labels and public receipt identities, not raw tags, media, metadata or keys.
Clearing browser storage removes that index. Prior mints made before this feature
and never delivered to the Player are not discoverable by album automatically.

Candidates must match the connected wallet, chain, factory and genesis history.
The NFT identity, holder and current public `tokenURI.image` are read from the
chain. Selection verifies the public PNG; mint preflight rechecks its source and
bytes. Reset chains, fallback-only NFTs, changed images and unavailable content
cannot silently substitute artwork. Replacing the preview, wallet or network
clears the selection. No upload or transaction occurs merely from a suggestion.

Only the existing image URI is reused, within the normal batch mint transaction.
Each new track retains unique receipt metadata and Brick identity. Reusing a
thumbnail neither creates an artwork Brick nor grants rights to another work.

## Settings → Creator defaults

Enable **Use saved defaults and pre-check approvals**, configure the defaults,
then **Save creator defaults**. The master switch starts off for existing users.
The preset includes Player delivery and content locking, and both can be changed.
Other controls cover preview/artwork/lyrics permissions, separate songwriting
Bricks, creator payout share, AI training policy, currency, fee unit, recording
ingestion/use fees and songwriting ingestion/use fees.

Preferences apply when opening Mint Studio or starting another work. Saved
defaults override remembered licensing fields for a new registration; per-work
changes do not alter the saved defaults. Default Player delivery is preselected
only when an Audio Preview exists and its playback permission is enabled.
Unchecking delivery overrides the default for that work. The final review and
mint confirmation remain required; no signature, publication or license is
automatically executed by changing Settings. Current delivery targets the local
YBR Player. Licensing values remain proposals.

Content locking becomes permanent only when the reviewed mint is confirmed.
Player playback permissions remain revocable. Public NFT image selection and
collaborator authorizations retain their separate review controls.

Licensor email is an optional default. Review it in Mint Studio Step 3; each new
Brick stores the email publicly in its own contract. It is independent of encrypted
metadata and Player delivery. Existing Bricks retain their current contact until
the controller updates it. See [Brick licensing contacts](BRICK_LICENSING_CONTACT.md).
