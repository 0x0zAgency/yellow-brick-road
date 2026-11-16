# YBR LAN node prototype

The app terminal can discover other YBR instances with DNS-SD/mDNS (`_ybr._tcp.local`) and connect their Kubo IPFS nodes using libp2p. This establishes a real content transport connection. It does not combine Ganache histories, change the selected factory, synchronize registries or approvals, copy recovery files, pin another node's content, or give another node wallet controls.

## Use it

1. Pull the current app and run `npm run dev` on both computers, on the same Wi-Fi or Ethernet LAN. The launcher installs the added `bonjour-service` dependency when needed.
2. Once startup is ready, press **b — nodes** in each terminal.
3. Press **e**, review the LAN-mode description, and **Enter** to enable. Each terminal shows its LAN address and IPFS peer ID.
4. Choose a discovered node with the arrow keys. Press **Enter** to inspect its name, address, peer ID, chain, factory, and genesis. Compare the peer ID with the other terminal, then **Enter** to connect IPFS.
5. **Connected** appears only after Kubo reports the expected peer on the selected LAN address. Status refreshes every five seconds. **x** disconnects, **r** refreshes discovery, and **Esc** returns to the dashboard.

If multicast is blocked, **a** accepts the other terminal's private IPv4 address, optionally with its node port, such as `192.168.1.20:8792`. This takes the same inspect/confirm path. Guest Wi-Fi client isolation may block direct connections too; use a network that allows the two computers to communicate. IPv6-only networks are not supported in this first prototype.

## Ports and configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `YBR_LAN_ENABLED` | off | `1` explicitly enables LAN mode at launcher startup, including plain/headless mode. Otherwise enable per session in the terminal. |
| `YBR_NODE_NAME` | `YBR <peer suffix>` | Public display name. No computer hostname or wallet address is used by default. |
| `YBR_LAN_PORT` | `8792` | TCP port for the public node manifest. |
| `YBR_LAN_SWARM_PORT` | `4001` | Host TCP port forwarded to this Kubo node's swarm listener. Must match custom Docker port mappings. |
| `YBR_KUBO_RPC` | `http://127.0.0.1:5001` | Local admin API used by the launcher; remote admin URLs are refused. |

Allow UDP 5353 for multicast discovery, TCP 8792 for node identification, and TCP 4001 for the IPFS connection (or your configured ports). The existing Compose stack already publishes the swarm port. There is no automatic router port forwarding.

Example for a dedicated prototype node:

```sh
YBR_NODE_NAME="Studio A" YBR_LAN_ENABLED=1 npm run dev
```

## Public discovery and local controls

Only `GET /ybr/node/v1` is exposed on the node port. Its bounded response contains a protocol version, name, IPFS peer ID, swarm port, and public deployment identifiers. Same-subnet private IPv4 clients are accepted; browser origins, arbitrary URLs, redirects, public/off-subnet destinations and remote mutation routes are refused. App, Player, chain RPC, Kubo admin RPC, upload bridge, credentials, originals and recovery keys retain their existing localhost boundaries.

Discovery and HTTP deployment labels are **untrusted advertisements**, not proofs of chain history or ownership. The connection's libp2p handshake authenticates the peer ID; compare that ID out of band before connecting. Different deployments are allowed to share IPFS transport, while each app keeps its own active chain. A reset or changed peer/profile requires another review. Peer selection and discovery are session-local, with no automatic reconnect list.

The existing Kubo `server` profile denies LAN peers. Enabling LAN mode removes only standard private-address deny filters covering this computer's active LAN interfaces (RFC 1918 or IPv4 link-local). This change is saved in Kubo. Custom deny filters, `NoAnnounce`, NAT port mapping, and admin bindings are retained. Both computers must enable LAN mode so they can accept each other. If a custom filter still denies a peer, the operator must review that Kubo policy separately.

Turning LAN mode off stops YBR discovery and the manifest listener. Quitting the launcher does the same. Existing Kubo connections, saved LAN permissions, and pins remain because the persistent Kubo process stays running. Use **x** to disconnect a peer first; IPFS may subsequently reconnect on its own. To restore a server-only Kubo policy, stop YBR, apply Kubo's `server` configuration profile, and restart Kubo. Do not delete its volume.

## Verification

`npm run test:dev-stack` includes LAN validation, identity-change protection, network failure states, filter scope, cancellation and terminal controls. The `YBR LAN Nodes` workflow starts two disposable Kubo repositories with server filters and no public bootstrap routing, tests real bidirectional mDNS discovery, connects the nodes, transfers a fixture by CID with byte comparison, detects connection loss, and disconnects. It never accesses a developer's existing node.

Standards and APIs: [DNS-SD, RFC 6763](https://www.rfc-editor.org/rfc/rfc6763), [mDNS, RFC 6762](https://www.rfc-editor.org/rfc/rfc6762), [bonjour-service](https://github.com/onlxltd/bonjour-service), [Kubo swarm RPC](https://docs.ipfs.tech/reference/kubo/rpc/#api-v0-swarm-connect).
