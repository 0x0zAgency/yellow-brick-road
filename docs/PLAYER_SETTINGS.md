# Player Settings and shared Road branding

Open **Settings** from the Player sidebar or its top-bar shortcut, also available
on mobile. The Player now uses the creator app's six-brick mark, **0x🟨 Road**
wordmark and **THE YELLOW BRICK ROAD** subtitle, including at sign-in. The old
`YBR / PLAYER / LIBRARY` breadcrumb is removed. A custom logo can be brought over
by exporting the workspace theme and importing it in the Player.

## Playback & tools

Control continuous playback through the existing playback state, or adjust the
current session volume. Open the library or Brick inspector, request a library
refresh, open the same-protocol creator workspace, or explicitly check the Player's
network connection. Only playable tracks remain visible. Settings does not
restart, remount or start audio. Existing access checks, continuous-play behavior,
artist sign-in and interaction reporting remain authoritative.

## Colors & themes

**Original Gold, Neon Road, Paper Studio and Evergreen** use the same preset data
as Workspace Settings. Fourteen palette controls cover backgrounds, panels,
inputs, borders, text, accents, statuses and shadows. Live preview recolors the
library, inspector, playback bar, sign-in and settings, not uploaded image pixels.

**Save appearance** persists the current look. **Save named theme** stores or
replaces a named entry, up to eight. **Discard preview** restores the saved look.
**Restore default preview** recovers a readable default without clearing the
library. Its own contrast stays fixed so it works after an unreadable palette edit.
Deleting a named theme does not discard an in-progress preview. Another Player
tab's saved changes are applied only when this tab has no unsaved preview.

Import/export uses the existing `ybr-workspace-theme` version 1 format, not a new
competing format. Export from Workspace Settings, import in Player Settings,
review and save. The same file can go back the other way. Workspace-only shade
overrides and icon slots are preserved in exports; Player CSS uses the shared
semantic palette. Imports are previews, not automatic writes.

## Icons & graphics

Choose installed vector icons for Library, Brick inspector, Settings and missing
artwork, and adjust line weight. Optional PNG/JPEG/WebP logo, background and
placeholder sources are bounded to 8 MiB and normalized locally to PNG display
copies no larger than 512 pixels and 128 KiB. The bounded rasterizer is shared
with the workspace without importing its vault code into the Player.

SVG, remote image URLs, arbitrary CSS/JavaScript and unknown/prototype fields are
rejected. Valid imported images are decoded and normalized again. Images stay in
browser storage, never uploaded or pinned. A custom placeholder is labeled as an
interface placeholder and does not overlay an authorized published cover.

## Storage and security boundary

Only `ybr:player:appearance:v1` stores Player appearance. Workspace storage,
continuous-play preferences, creator files, Building associations, keys, rights,
public NFT metadata, analytics and chain configuration are not cleared or rewritten.
Appearance is not encrypted or synced between origins, ports, HTTP/HTTPS or devices.
Do not put private imagery in cosmetic assets. Export/import is the portability path.

The Player keeps its build-free frontend. Six explicitly allowlisted, public
presentation modules are served from `web/src`; no generic source-file endpoint is
added. Scripts remain same-origin under CSP, with no unsafe-inline/eval permission.
`img-src blob:` is allowed only to decode locally selected raster images. Browser
links preserve the current protocol, including the existing local HTTPS flow.

## Validation

`node --test web/tests/player-appearance.test.js apps/ybr-player/test/appearance-assets.test.js`
checks shared format compatibility, isolated storage, malformed data, public routes
and private-file denial. `scripts/player-settings-browser.cjs` uses a disposable
local Player and synthetic media/graphics for desktop/mobile checks, persistence,
import/export, two-tab conflicts, CSP and uninterrupted authorized playback. It
captures screenshots in `.road-local/player-browser-results` and makes no chain
writes. The real HTTPS stack regression also tests Player settings persistence and
same-protocol links, alongside the existing mint flow. No live Mac/MetaMask test
or production security audit is implied.

Pull and restart the managed Player, then reload. No factory deployment, chain
reset, remint, new npm dependency or OS certificate change is required.
