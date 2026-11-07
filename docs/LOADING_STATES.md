# Brick-road loading states

`web/src/RoadProgress.jsx` provides a shared two-course yellow-brick road. Staggered bricks drop into place using CSS transforms and opacity; there are no animation timers, network calls or added dependencies.

Use `<RoadProgress label="Reading the registry…" />` for unknown-duration work. The build loops and omits `aria-valuenow`: a wallet confirmation, RPC call or upload is not assigned a fabricated percentage.

Pass `value` and `max` only for measured completion, such as successfully encrypted files. The component clamps finite values to 0–100%, fills whole bricks, and exposes the precise percentage through the progressbar. Invalid or missing values use the indeterminate animation. Mint Studio uses its encryption completion callbacks; its transaction wait remains indeterminate.

The `compact` size fits tool panels. `tiny` with `hideLabel` fits thumbnails while retaining an accessible name. Status text stays visible in normal/compact presentations and updates independently of animation frames. Remove the animation when work finishes, fails or is cancelled; success/error messages remain still. In normal page flow, keep a `StatusArea` mounted so this transition does not remove its reserved space.

The component honors both `prefers-reduced-motion` and the workspace’s reduced-motion setting. Unknown waits show a still partial road; measured progress keeps its actual fill. Hidden tool panels pause animations. Colors participate in the existing appearance palette.

Integrated across the mint wait, file hashing/encryption, My Bricks discovery, registry loading/contact reads, NFT covers, local recovery, editor operations, licensing, Player delivery and workspace tools. Player playback position, wizard step indicators and financial charts remain their existing controls.

## Stable status areas

`web/src/StatusArea.jsx` reserves a border-box slot across idle, pending, completion and error states: 88px for page status, 72px for compact tool panels and 48px for inline file status. Keep it mounted even without a message. Pass `busy`, `label`, `message`, `error`, optional `detail`, and measured `value`/`max`. Long text scrolls inside the slot and is keyboard-focusable; errors remain alerts. Only pending operations render the road animation. Buttons keep their action labels while disabled.

Used in My Bricks, Buildings/Cover Art Studio, the Brick editor and its controls, recovery tools, MP3 tools, Settings, mint/file checks, artwork lookup/publication, registry contact lookup, Player delivery and licensing/payment panels. The IP Registry retains its existing reserved polling status row. Already-sized artwork placeholders and the standalone mint-wait dialog keep their dedicated progress presentations.

My Bricks retains results during a same-wallet/network/factory refresh and clears them on scope changes or read failure. Buildings keeps its catalog mounted during refresh, disables mutation controls while pending, and clears failed reads as before. Public thumbnail rechecks retain the previous image only for the same URI; a changed URI or failed recheck cannot reuse it as verified content.

Browser regression holds actual My Bricks and Buildings reads on desktop/mobile, checks the positions of downstream controls and results before/during/after refresh, and checks all shared slot sizes through idle, unknown/measured progress, success and long-error transitions.

The browser regression verifies real animation phases, unknown versus measured semantics, zero/full/invalid values, both motion preferences, compact/mobile sizing and unmount. Existing workflow tests cover the actual mint/editor/licensing operations.
