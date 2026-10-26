# Workspace Settings and Dev Control identity

The workspace sidebar now includes **Settings** with **Tools & status**, **Colors & themes**, and **Icons & graphics**. This is a presentation layer, not a rights database or deployment authority.

## Tools

Open Mint Studio, My Bricks, IP Registry, Buildings, file recovery, or the independent YBR Player. Review the launcher's public chain/factory identity and explicitly check local Player/IPFS readiness. Commands are visible and copyable but are never executed by the browser. Network selection, test signer entry, spending caps, and deployment approval remain in Dev Control. No private RPC URL, signer key, seed, login password, or recovery file is read by Settings.

## Colors and themes

Original Gold preserves the existing CSS colors. Neon Road, Paper Studio, and Evergreen are starting presets. Fourteen palette controls map backgrounds, surfaces, inputs, borders, text, accents, statuses and shadows. An expandable, searchable shade editor controls all 642 existing stylesheet color literals independently, with pagination. An individual override takes precedence over its palette family. Image pixels, third-party widgets and browser chrome are not recolored.

Vite's existing PostCSS pipeline introduces standard CSS custom properties into first-party workspace declarations, with the original literal as fallback. URLs, quoted strings, third-party CSS, and the Settings recovery button are excluded. No arbitrary user CSS is evaluated. Adding an original color requires updating the palette registry; a test checks coverage. The fixed high-contrast **Restore default preview** button deliberately remains usable when a custom palette is unreadable.

Changes preview immediately. **Save appearance** persists the current look. **Save named theme** also saves or replaces a named preset (up to eight). **Discard preview** restores the saved appearance, and **Restore default preview** returns to Original Gold without deleting the theme library. Saving is explicit. Storage errors are reported rather than claiming success.

Themes export as bounded versioned JSON containing presentation settings and explicitly selected graphic copies only. Import validates all fields, hex colors, installed icon identifiers and PNGs; graphics are decoded and normalized again. Importing only creates a preview until saved. The text/panel and button contrast checks are advisory checks for two pairs, not a complete accessibility certification.

## Icons and graphics

Choose installed vector icons for workspace navigation, work types, Building cards, and missing-artwork placeholders. Customize icon line weight, sidebar logo, ambient background and placeholder graphic. PNG/JPEG/WebP uploads up to 8 MiB are locally rasterized using the existing bounded image preparation code, then limited to 512 pixels and 128 KiB. They are never pinned, uploaded or substituted for a real NFT's published cover. Custom placeholders retain the unavailable-cover caption; changing a theme cannot change tokenURI or grant media access.

Use the animation toggle to reduce workspace motion. The operating system's reduced-motion setting is also respected. Playback behavior is unchanged.

## Storage and scope

The only settings key is `road:appearance:v1` in this workspace origin's localStorage. It is not encrypted: avoid private imagery in cosmetic assets. Themes are local to the browser and origin, not synchronized to a blockchain, account, repository, other port or another machine. JSON export/import supports portability. YBR Player and CLI palettes are not controlled by this first workspace Settings page. Existing creator drafts, Building associations, wallet settings, recovery records, IPFS pins and analytics are never cleared by appearance reset.

## Dev Control title

Roomy terminals show the creator-supplied, 72-column framed **YBR** artwork on the left, including its block/shade pattern, with **YBR PLAYER LOGIN** at the top right. Services and the active chain stack underneath the login box. The complete artwork is 27 rows; at least 135 columns and roughly 35 rows are needed, depending on wrapped credentials. Shorter wide terminals keep the original framed-letter section at left and put services/chain panels below it. Narrow or short windows (including 80×24) retain compact solid YBR lettering so credentials, selected network/factory, warnings and controls remain visible. The renderer measures the whole frame before choosing a layout; it never crops the art or login box to fit. The explicit **YELLOW BRICK ROAD // DEVELOPMENT CONTROL** title and **CREATOR TOOLS / IP PROTOCOL** remain above the wide layout. Animated bricks, quiet logs, hidden interface controls and deployment approval remain unchanged. The tagline remains **FOLLOW THE YELLOW BRICK ROAD**.

## Verification

`node --test web/tests/appearance.test.js` covers theme validation, original palette preservation, CSS transformation, named-library bounds, import attacks and storage errors. `node --test scripts/dev-title.test.cjs scripts/dev-dashboard.test.cjs` covers sizing, credentials, honest status, animation and redaction. CI runs `scripts/settings-browser.cjs` against the actual workspace with synthetic graphics; it performs no chain writes. No contract redeployment, chain reset or remint is required.
