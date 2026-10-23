# Continuous playback and file interactions

## Listening

Continuous play is on by default for this local demo. It starts only after the
listener starts playback. At the audio `ended` event, the Player walks the current
playable library in order, wrapping at the end (one track repeats itself). Each
next track obtains its own current authorization. Known denied/missing tracks are
skipped with a bounded pass; network/decode errors stop for a user retry, not an
endless loop. Manual selection, logout and turning the control off cancel an
in-flight transition. The on/off preference persists in this browser. This is not
gapless playback, crossfade, or an album playlist implementation.

## Durable, scoped observations

The browser submits play, pause, ended, seek and skip reports, plus artwork/lyrics
display reports. Only authorized files are accepted. Audio requires a playback
grant. The server supplies the actual subject from the authorized saved rendition,
not a client-supplied contract address. On-chain records bind chain ID, genesis,
factory, Brick, file revision and SHA-256; public Road recordings bind their
publication commitment. Simulation fixtures remain explicitly local-demo subjects.

The journal is `.road-local/player-interactions/events.ndjson`, owner-only and
independent of `dev-stack.log`. Restarting the dashboard clears diagnostic logs,
NOT interaction data. Capture is limited to 20,000 records / 16 MiB and 120 reports
per session per minute. At capacity it refuses new records and retains everything
already recorded. Export/archive the journal deliberately before replacing it;
there is no automatic history deletion. Playback continues if telemetry fails.

Reports use server receipt timestamps and session-salted event/playback IDs.
Duplicate retries are not counted twice. No raw session cookie, username, wallet
key, IP address, filename or private metadata is written to this new journal.
Existing legacy `data/player-events.ndjson` is not deleted or migrated. That old
API remains compatible; the browser now uses the file-scoped API instead.

## Request and ingest

For the local artist account, the selected track's **File interactions** panel
can request an aggregate snapshot for audio, artwork or lyrics and export it as
JSON. The API is `GET /api/bricks/:playerId/interactions?role=audio` (also artwork
or lyrics), with an ordinary artist session cookie and loopback/same-origin
checks. This shared demo artist identity is NOT proof of copyright ownership.
No unauthenticated public endpoint or raw listener event export is exposed.

Snapshots contain counters, time range, exact subject and a deterministic SHA-256
digest. They are cumulative. `reportedStarts` counts distinct reported playback
runs, not people; repeated play after pause is another play event in that run.
`endedReports` counts a run only after its recorded play event. Seeking to the end
can still produce an end report. These are **unverified client reports**, not
verified listening duration, unique listeners, royalty evidence or AI attribution.
The digest detects changed snapshot bytes; it is not a trusted attestation.

Create a private metadata draft using a complete mint packet and its snapshot:

```sh
node scripts/ingest-player-interactions.cjs \
  --packet mint-packet.json \
  --snapshot ybr-interaction-snapshot.json \
  --out metadata-draft.json
```

The tool checks the packet's committed metadata, chain/history/Brick/file revision
and file hash, then adds `extensions.playerInteractions` to a NEW metadata draft.
It never overwrites an existing output. Re-ingestion replaces the rendition's
cumulative snapshot instead of adding its totals again. Older snapshots are
rejected. Original rights, file commitments and Building relationships are retained.
The exported JSON contains private original metadata: keep it private.

This is a request/export/draft-ingestion foundation. A contract cannot itself make
an HTTP request. Production polling/attestation and controller-authorized encrypted
metadata publication remain separate work. This command does not upload, sign,
modify a live tokenURI or authorize a service to change a Brick. Before publishing
an update, recheck the current controller, content revision and metadata commitment
against the live chain; the saved packet can be stale.

Browser event semantics: https://html.spec.whatwg.org/multipage/media.html#event-media-ended
