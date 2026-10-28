# Public NFT images: delivery and diagnostics

The public thumbnail and the encrypted original are separate objects. Receipt
`tokenURI` returns public ERC-721 JSON and its `image` points to a normalized PNG
CID. The Brick's `metadataURI` can point to encrypted metadata; it is not a wallet
image URL and must never be substituted for `tokenURI.image`.

## What this repair changes

The previous public-image reader refused a valid PNG unless its CID had a direct
or recursive pin on this particular Kubo node. That is a retention policy, not a
requirement for reading public IPFS content. Public thumbnail retrieval now uses a
bounded Kubo `cat` (512 KiB + 1 byte, 12-second request timeout) and validates PNG
structure before serving anything. It can use cached data or retrieve the PNG from
IPFS peers without automatically pinning it. This does not make an offline provider
reachable and is not a public-gateway availability guarantee.

Encrypted-file recovery STILL requires a local pin and a valid encrypted
container. No recovery route, private key, original-file permission, on-chain
commitment or contract changes. Public-image requests cannot supply URLs, paths,
credentials or Kubo API methods. Only supported PNG responses are served inline;
encrypted references, invalid images, outages and timeouts return bounded error
codes rather than private bytes or upstream secrets. Host/origin restrictions stay
in effect. The Kubo admin API remains loopback-only.

Before a new mint or an artwork update, publication now checks both the pin and the
actual browser-facing public image GET: expected byte checksum, PNG structure,
size limits and (in a browser) successful decoding with at least one nontransparent
pixel. A broken image route blocks signing instead of approving a URI alone.
Preparation rejects entirely transparent thumbnails before asking for publication
consent. Publishing may still leave a public pin after subsequent verification
fails; no mint transaction is sent in that case.

Collection thumbnails reserve their dimensions, load eagerly AFTER the existing
viewport-gated NFT read, track load/error/timeout explicitly, and have a retry
control. A transient read error can retain a previously verified image labeled
'Last verified cover', never an invented new cover. There is no encrypted-original
or local-upload substitution.

## Checking an existing NFT

In My Bricks or the IP Registry choose **Check image** below the thumbnail. The
read-only dialog shows the exact on-chain image URI and checks its public bytes,
dimensions, SHA-256 and browser decoding. A successful result includes **Open public
thumbnail**. It does not request a signature, upload originals or change metadata.
**Inspect actual NFT metadata** in the artwork editor uses the same image check.

- Public PNG works here, wallet is blank: investigate wallet caching and the
  wallet's public IPFS gateway. A local pin is not worldwide hosting. In particular,
  an external NFT indexer cannot read a private localhost Ganache blockchain.
- Public image unavailable: keep the original provider/Kubo node online and retry.
  A different node can now retrieve the public PNG from peers without a local pin.
  Data with no reachable provider cannot be reconstructed from its CID.
- Encrypted image reference: do NOT publish a key or decrypt a private source to
  service an image request. The URI itself needs review. The normal mint path
  never uses this reference as an image.
- Fully transparent image: the pixels have no visible content. Prepare a visible
  thumbnail and review any proposed metadata change normally.

Re-publishing the exact existing approved thumbnail rechecks/re-pins it and reads
the NFT's current image. When the URI is already identical, no `setCovers`
transaction is requested. Choosing different bytes/CID still requires a normal
holder-approved artwork update. No automatic paid repair or remint.

## Updating the application

Save active recovery material, stop Dev Control, pull main, then run:

```sh
npm run dev -- --restart-player
```

Reload My Bricks/Registry. Restart the upload bridge too if it was launched in a
separate terminal. This patch adds no dependencies and needs no factory deployment,
chain reset, new certificate, remint or deletion of `.road-local`.

## Verification boundaries

Dependency-free tests exercise the real HTTP bridge, public PNG delivery without a
pin, checksum/size failures, encrypted-reference refusal and a failed GET after a
successful pin. Existing encrypted recovery tests retain the local-pin restriction.
Browser tests exercise actual decoding, fully transparent PNG rejection, visible
load failures/retry and a same-URI repair with zero wallet writes. The HTTPS stack
mints three real local Bricks in one transaction, removes only the synthetic
thumbnail's test pin, and verifies its image and read-only diagnostics in both
collection views. This is not a live user's NFT, macOS/MetaMask or public-gateway
test. The report alone did not include a collection/token ID or CID sufficient to
attribute the user's exact blank image to one cause.
