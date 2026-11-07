# Brick-road loading states

`web/src/RoadProgress.jsx` provides a shared two-course yellow-brick road. Staggered bricks drop into place using CSS transforms and opacity; there are no animation timers, network calls or added dependencies.

Use `<RoadProgress label="Reading the registry…" />` for unknown-duration work. The build loops and omits `aria-valuenow`: a wallet confirmation, RPC call or upload is not assigned a fabricated percentage.

Pass `value` and `max` only for measured completion, such as successfully encrypted files. The component clamps finite values to 0–100%, fills whole bricks, and exposes the precise percentage through the progressbar. Invalid or missing values use the indeterminate animation. Mint Studio uses its encryption completion callbacks; its transaction wait remains indeterminate.

The `compact` size fits tool panels. `tiny` with `hideLabel` fits thumbnails while retaining an accessible name. Status text stays visible in normal/compact presentations and updates independently of animation frames. Remove the component when work finishes, fails or is cancelled; success/error messages remain still.

The component honors both `prefers-reduced-motion` and the workspace’s reduced-motion setting. Unknown waits show a still partial road; measured progress keeps its actual fill. Hidden tool panels pause animations. Colors participate in the existing appearance palette.

Integrated across the mint wait, file hashing/encryption, My Bricks discovery, registry loading/contact reads, NFT covers, local recovery, editor operations, licensing, Player delivery and workspace tools. Player playback position, wizard step indicators and financial charts remain their existing controls.

The browser regression verifies real animation phases, unknown versus measured semantics, zero/full/invalid values, both motion preferences, compact/mobile sizing and unmount. Existing workflow tests cover the actual mint/editor/licensing operations.
