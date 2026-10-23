# Dev Control network selection

**n** opens Network Control when the stack is READY. **g** selects Local Ganache
(1337), **s** selects Sepolia testnet (11155111). Enter reviews the choice; a second
Enter saves it and stops launcher-owned services. Finish pending mints and save
browser recovery keys before confirming. Escape cancels. Run `npm run dev` again
and reload Mint Studio to apply the selected default.

This changes the **Mint Studio target**, not the underlying local demo backend.
The Player, Registry, demo recording and encrypted IPFS bridge continue on local
Ganache. No public-network deployments, transactions or account imports are run.
Sepolia requires test ETH, an existing compatible factory and a wallet on Sepolia;
wallet switching and signing still happen in the browser. Mainnet is not offered.

Only the choice and a revision marker are saved to the git-ignored, owner-only
`.road-local/dev-network.json`. The launcher supplies two non-secret public Vite
values: `VITE_ROAD_DEFAULT_NETWORK` and `VITE_ROAD_NETWORK_SELECTION`. The browser
applies each explicit terminal selection once, retaining manual browser choices
until the terminal selection changes again. It never changes a running mint.
Returning to Ganache selects its normal loopback RPC and automatic factory mode.
Existing factory addresses, chain profiles, IPFS pins, media, interaction journals
and recovery material remain unchanged.

**i** cycles this machine's currently assigned interface addresses, both on the
home screen and inside Network Control. It includes loopback, Ethernet/Wi-Fi
interface addresses and assigned VPN interfaces reported by Node. The list is
refreshed on each press; vanished adapters are not retained as active. It does not
scan nearby SSIDs, connect/disconnect Wi-Fi or VPNs, or alter system routing.

The selected connection is a **reference display**, not an application bind
setting or a working LAN URL. Ganache, Kubo admin APIs, the upload bridge and the
password-free demo Player remain loopback-only. Safe authenticated LAN serving
is a separate feature; cycling addresses does not open private services.

Primary API: https://nodejs.org/api/os.html#osnetworkinterfaces
