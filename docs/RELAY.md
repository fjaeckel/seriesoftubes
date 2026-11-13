# Running a relay

The relay is the small server that lets Series of Tubes players play together: their games connect to it, it keeps
and forwards their signed records, ranks them on its leaderboards, and syncs with other servers if you want it to.
It runs no game logic and holds nothing a player cannot lose: every player keeps their own network in their own save.

Design: [docs/plans/federation.md](plans/federation.md). Protocol: [docs/FEDERATION-PROTOCOL.md](FEDERATION-PROTOCOL.md).
Decision: [ADR 0005](adr/0005-federation-by-player-run-servers.md). The project runs no server of its own; every server
is someone's choice and responsibility.

This is the reference. Never run a server before? [HOSTING.md](HOSTING.md) walks through it step by step: a VPS with
Docker Compose, a binary with systemd, a Raspberry Pi at home, and a LAN party without the internet.

## Before anything else: a domain and a real TLS certificate

The game is served over HTTPS, and a page served over HTTPS may only open **`wss://`** connections. Browsers refuse
plain `ws://`, a bare IP address and a self-signed certificate without telling the player much. So you need:

- **A domain name** (a subdomain is fine, for example `relay.example.net`). The protocol refuses node addresses that
  are public IP literals, and the registry refuses any IP literal or `.local` name. (Private addresses are fine for
  a server on a LAN: see `relay lan` and [HOSTING.md, LAN party](HOSTING.md#lan-party).)
- **A certificate a browser trusts**, for example from Let's Encrypt. Caddy gets and renews one on its own.
- **Port 443 reachable** from the internet (or another port, written into your node's URL as `wss://host:8443/fed`).

The usual setup is a reverse proxy that holds the certificate and passes WebSocket traffic to the relay on localhost.
The relay can also serve TLS itself (`tlsCert` and `tlsKey` in the config) if you prefer.

## The reverse proxy, with access logs off

Most web servers log every request's address by default. The relay keeps no addresses at all (see Privacy below),
but it cannot promise anything for the server in front of it, and registered servers sign `noLogs: true`, a promise
that **nothing in front of the relay logs addresses either**. So turn access logs off, and keep error logs from
recording client addresses. That is the whole reason for the examples below being the way they are.

The relay reads the client's address from `X-Forwarded-For` only when the request comes from a trusted proxy
(`trustedProxies`, loopback by default), uses it in memory for the country lookup and connection limits, and forgets
it.

### Caddy

Caddy writes no access log unless you ask for one with a `log` directive, so leave it out:

```caddy
relay.example.net {
	# No `log` directive: no access log. Caddy adds X-Forwarded-For itself.
	reverse_proxy /fed 127.0.0.1:8080
}
```

### nginx

```nginx
server {
    listen 443 ssl;
    http2 off;                       # WebSocket upgrade needs HTTP/1.1
    server_name relay.example.net;
    ssl_certificate     /etc/letsencrypt/live/relay.example.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.example.net/privkey.pem;

    access_log off;                  # no per-request log
    error_log /var/log/nginx/relay-error.log emerg;   # nginx error lines name the client: keep only emergencies

    location = /fed {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;  # the real peer, not a chain the client sent
        proxy_read_timeout 300s;     # the protocol pings after 60 s idle and gives up after 120 s
        proxy_send_timeout 300s;
    }
}
```

If your host or CDN logs in front of you, the same applies there. A server found logging addresses can be removed
from the registry by pull request and shunned by its peers.

## Setting up

### 1. Get the relay

- **Binary:** download the archive for your platform from the GitHub release: Linux (amd64, arm64, armv6, armv7, 386,
  riscv64, ppc64le, s390x, loong64), macOS, Windows, FreeBSD, OpenBSD and NetBSD, each with `SHA256SUMS` and a build
  provenance attestation. It holds one static file with nothing to install. Which one, and how to check it:
  [HOSTING.md, getting the relay](HOSTING.md#getting-the-relay).
- **Container:** `ghcr.io/fjaeckel/seriesoftubes-relay` (tags `X.Y.Z`, `X.Y`, `latest`; linux/amd64 and arm64) is built
  `FROM scratch` (a few MB), runs as an unprivileged user (uid 65532) and keeps everything in the `/data` volume.
  `relay init` in it writes `"listen": "0.0.0.0:8080"` so the proxy can reach it, and metrics on `0.0.0.0:9100` for
  the Docker network (see Metrics). Add the address your proxy connects from to `trustedProxies`
  (`relay init --trusted-proxies 172.30.0.0/24`, your container network). Without it every player seems to come from
  the proxy, shares its one connection limit (30 per 5 minutes by default) and gets no country. Trust only a network
  on which nothing but your proxy can reach the relay: anything trusted can claim any address. The relay warns at
  start when it listens beyond loopback, serves no TLS itself and trusts loopback proxies only. A complete Docker
  Compose setup with Caddy, or with certbot and the relay serving TLS: [HOSTING.md](HOSTING.md).
- **From source:** `cd relay && go build ./cmd/relay`.

Every command takes `--data DIR` (default: `$RELAY_DATA`, else `./relay-data`). Everything lives in that one folder.
One relay at a time: a running relay locks its folder (`LOCK`), and a second `relay serve` on it refuses to start.

### 2. Initialise

```sh
relay init --url wss://relay.example.net/fed
```

This makes the data folder (mode 0700) with:

| File | What |
| --- | --- |
| `node.key` | This node's key. Nodes sign receipts and prove who they are with it. |
| `operator.key` | Your operator key, separate from any game save: it is your control of the server. **Back it up.** Pass `--operator-key FILE` to use one you already have. |
| `config.json` | What rarely changes (below). |

`init` also takes `--listen ADDR`, `--trusted-proxies CIDR,…` (added to loopback), `--tls-cert FILE --tls-key FILE`,
and `--metrics ADDR [--metrics-public]`; `--listen`, `--metrics` and `--metrics-public` default to `$RELAY_LISTEN`,
`$RELAY_METRICS` and `$RELAY_METRICS_PUBLIC` (set in the container image).

### 3. Found a server, or join one

A **new server**:

```sh
relay genesis --name "Packet Lunch" --sync open --langs en,de --desc "Small, friendly, always on."
```

This signs the `genesis` record (its id is the server's identity, printed at the end) and the first `server` record
with your operator key. `--no-logs=true` is the default: it declares that neither the relay nor anything in front of
it logs addresses. Only set it to false if that is not true; such servers cannot be registered.

**Another node of an existing server** (run by you or by a co-operator), see "Adding a node" below.

### 4. Run it

```sh
relay serve
```

A systemd unit:

```ini
[Unit]
Description=Series of Tubes relay
After=network-online.target

[Service]
User=relay
Environment=RELAY_DATA=/var/lib/relay
ExecStart=/usr/local/bin/relay serve
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/relay

[Install]
WantedBy=multi-user.target
```

The relay logs to stderr: counts, error codes, record kinds and network keys. Never addresses, headers or user agents.

## The config file

`config.json` in the data folder. The relay rereads it on `SIGHUP` (`systemctl reload relay`); `listen`, `metrics`
and the TLS file names change on restart only. The certificate and key themselves are reread when the files change
(checked at most once a minute), so a renewal needs no restart; a pair that does not load keeps the old one serving. Unknown settings are refused, so a typo cannot silently do nothing.

| Setting | Default | What |
| --- | --- | --- |
| `listen` | `127.0.0.1:8080` | Where the relay listens (behind your proxy) |
| `path` | `/fed` | The WebSocket path |
| `url` | | This node's public `wss://` URL |
| `tlsCert`, `tlsKey` | | Serve TLS directly instead of behind a proxy (both or neither; reloaded when the files change) |
| `server` | | The server identity (written by `genesis` or `join`) |
| `seeds` | | `join`: URLs of running nodes of the server |
| `selective` | `[]` | Server identities allowed when the server's sync policy is `selective` |
| `neighbours` | `[]` | Other servers' nodes this node connects to: `{url, send, take}`, see Sync |
| `defaultSend`, `defaultTake` | all | Classes for servers that connect to you and are not neighbours |
| `countryDb` | | A country-only MaxMind-format database (GeoLite2-Country, DB-IP Country Lite). Optional |
| `registry` | `https://seriesoftub.es/federation/servers.json` | The registry snapshot (a URL or a file); used for the shun tally |
| `metrics` | | A **localhost** address for `/metrics`, for example `127.0.0.1:9100`. Anything else is refused unless `metricsPublic` is set |
| `metricsPublic` | `false` | Allow `metrics` beyond localhost, for a Prometheus in another container (the image sets it, with `0.0.0.0:9100`). The relay warns at start; keep the port off the internet |
| `trustedProxies` | loopback | Proxies whose `X-Forwarded-For` is believed (in a container: add the proxy's network, see Container above) |
| `listed` | `false` | A note for yourself: whether you mean to be in the registry |
| `notifyURL` | off | An `https://` URL the relay POSTs to once per new relay release (see Versions and update notices). Anything else is refused |
| `limits` | | `maxClients` 5000, `maxNodes` 64, `connsPerAddr` 30 per `addrWindowSec` 300, `msgsPerSec` 20 |

## Adding a second operator, and their node

A server is its operator list; there is no shared server key. Changes to the operator and node lists are
**proposals** that take effect once a strict majority of the current operators signed them (1 of 1, 2 of 2, 2 of 3,
3 of 4…). Proposals expire after 14 days.

1. Your co-operator runs `relay init --url wss://their.host/fed` on their machine and sends you their **operator key**
   (printed by `init`) and **node key**.
2. You propose adding them as an operator. With one operator that is a majority already:

   ```sh
   relay ops propose add-operator THEIR_OPERATOR_KEY
   ```

3. They prepare their node to join and start it; it fetches the server's records from yours and waits:

   ```sh
   relay join SERVER_IDENTITY --from wss://relay.example.net/fed
   relay serve
   ```

4. Now there are two operators, so adding their node needs both signatures. Their node is not on the list yet and
   cannot sync, so they send their signature to your node over `wss://` (signed on their machine, with their key):

   ```sh
   relay ops propose add-node THEIR_NODE_KEY --url wss://their.host/fed            # you; prints the proposal id
   relay ops pending                                                                # they see it on their node too
   relay ops sign PROPOSAL_ID --via wss://relay.example.net/fed                     # they sign it
   ```

   Within a minute their node sees itself on the list and the two nodes start syncing.

5. Describe the server again, so its `server` record lists both nodes, and have it signed the same way (now either
   node works, with or without `--via`):

   ```sh
   relay ops server            # keeps name, sync, languages and description; add --desc "…" etc. to change them
   relay ops sign RECORD_ID    # the other operator
   ```

From then on the two nodes copy everything between themselves, players may connect to either, and if one goes away
the other carries on. `relay nodes` shows each node and whether a session with it is up. Operators can also do all of
this from the game, after importing their operator key there; the relay checks those actions against the same list.

To move a node to a new address: `relay ops propose set-node NODE_KEY --url wss://new.host/fed`. To retire one:
`relay ops propose remove-node NODE_KEY`. Removing an operator works the same way (`remove-operator`).

## Sync policy: who your server syncs with

Your players always see each other. Whether they also see other servers' players is your choice, published in your
`server` record:

| Policy | Syncs with |
| --- | --- |
| `standalone` | Nobody. A club, a classroom, a LAN party: its players only see each other |
| `selective` | Only the servers listed in `selective` in the config |
| `open` | Any server that is not standalone |

Syncing is mutual: two servers sync only when **both** policies allow it. Change yours with
`relay ops server --sync open` (signed by a majority, like every change to the server record).

Your node connects to the servers in `neighbours`; others may connect to you. For each neighbour you choose what you
**send** and what you **take**, by class:

| Class | Carries |
| --- | --- |
| `players` | Announcements, stats, offers and answers, leaves: what lets players peer and rank together |
| `catalog` | The servers you know (gossip), passed on with the path they came by |
| `advice` | Your hide lists, as advice to others |

Shun votes always travel, whatever you choose, as long as the voting server is in your node's registry snapshot (or is
your own server): only registry servers' votes can count, and a server known from gossip alone costs nothing to make up,
so your node refuses the votes of any other (and keeps at most 8192 votes of any one server). A server may take records
without passing them on. Your node keeps at most 4096 catalog entries, 512 of them first heard from any one neighbour,
each at most 60 KB (so any one fits a game's frame), and reads nothing a new neighbour says about other servers until
its own entry has checked. A neighbour that does not send its own entry within 30 seconds is dropped, and sessions with
servers your node does not know yet take at most 8 of its `maxNodes` slots; your own server's nodes always get one.

```json
"neighbours": [
  {"url": "wss://relay.friends.example/fed"},
  {"url": "wss://big.example.org/fed", "send": ["players"], "take": ["players", "catalog"]}
]
```

## Being listed in the registry

The registry is the folder `federation/servers/` in this repository, one file per server. The game's site publishes
it as `servers.json`. To be listed:

```sh
relay registry-file > federation/servers/SERVER_IDENTITY.json
```

and open a pull request adding that file. CI runs `relay check-registry` on it: the file parses and fits 64 KB; its
records are signed; the operator chain follows from the genesis by majority-signed changes; the server record is
signed by a majority of the current operators and declares `noLogs: true`; no other server has the same name; and one
of your nodes answers a challenge signed with its node key over `wss://`. A failing check prints the step and the
error code. You can run the same check yourself:

```sh
relay check-registry federation/servers/SERVER_IDENTITY.json             # including the live challenge
relay check-registry --offline federation/servers/SERVER_IDENTITY.json   # without it
```

Change your file by pull request whenever the operators, nodes or description change (`relay registry-file` again).
`listed` and `answered` are written only by the weekly job and must not change: `relay registry-file` copies them from
`federation/servers/SERVER_IDENTITY.json` when run in a checkout, or from `--from FILE`. Write to a new file and move
it over the old one (`>` straight onto the old file empties it before the relay reads it). Servers that have not answered for two
weeks are removed. Only registered servers that have been listed for 30 days and answered within 14 vote in shuns.

## Day to day

All of these talk to the running relay over a local socket in the data folder (mode 0600), never over the network.
Operator actions are signed with the operator key on that machine.

| Command | What |
| --- | --- |
| `relay status` | Server, head, operators and nodes, sessions (with what each peer node runs), record counts, disk use, the relay version, and "update available: x.y.z (security)" with the notes link when one is out |
| `relay servers` | Every server you know, from the registry and from gossip |
| `relay players` | Networks with an announcement: name, ASN, last heard, quiet state, hidden or shunned |
| `relay nodes` | This server's nodes and which are up |
| `relay board --board pops --measure growth` | A whole leaderboard as this server ranks it for players (`--board` pops, pies, traffic, total or cone) |
| `relay hide KEY` / `--names` / `--refuse` | Leave a network off your boards, show it by ASN only, or refuse its new records |
| `relay unhide KEY` | Take it off all three lists |
| `relay shun KEY --reason spam` | Vote to exclude a network everywhere (`cheating`, `offensive_name`, `spam`, `abuse`) |
| `relay unshun KEY` | Withdraw your vote |
| `relay ops pending` / `propose` / `sign` / `server` | Operator and node changes (above) |
| `relay backup FILE.tar.gz` | A consistent copy of the data folder |

A network is shunned everywhere when at least a quarter of the voting servers, and at least five, vote for it. Votes
last 90 days unless renewed, and a shun lifts 7 days after the votes fall below the threshold. Every vote is a signed
record that travels to every server, but your node sends votes only to games that proved an operator key of your
server (an operator panel in the game); other players' games get only the list of excluded networks, and an excluded
player only the reasons given, never counts or who voted. A game joined to several servers ends its running deals
with an excluded network only when most of them (and at least two) list it; one server's list alone hides the network
and stops new deals with it, nothing more.

Players can **report** a network to the operators of a server they joined, with one of the same four reasons and no
text. A report goes only to your server: your node keeps it 30 days (one per player and reported network, the newest;
at most 20 new ones per player a day), passes it to your other nodes and to no other server, and shows it only in the
operator panel of a game that proved your operator key (Reports: per network, the reasons with counts and how many
players reported it). It changes nothing by itself: you decide whether to hide the network or vote.

## Leaderboards

Your node ranks the leaderboards itself and sends players only what they look at: the top 50 rows of the slice they
asked for and their own row (`rank`, protocol 9.5), the values for the filter sheet (`facets`), and what the game needs
of a few networks (`nets`). It never sends the records of a whole board. Rankings follow the protocol's rules exactly
(10.1 to 10.5, 10.12); games check a row or two now and then against the signed records (`rankwhy`), so a node that
ranks wrongly is noticed and left out for a day.

How it works (`relay/internal/rank`):

- **In memory, updated as records arrive.** Per network: its stats records of the two 24-hour windows and the seven
  days before them (parsed once), its newest announce, and, when it reports traffic with other players, its traffic
  totals for each of the 576 five-minute slots of the windows (in and out, after the min() rule). A new record only
  recomputes the slots it changes, for that network and the networks that list it; a record in the slot still running
  changes nothing until the slot ends. Hides and shuns recompute only the networks that report traffic with them.
- **Rankings on demand, cached.** A ranking is worked out the first time someone asks for that slice in that slot
  and kept (up to 64 boards and 256 filtered slices; the least recently used go first). Everyone asking for the same
  slice meanwhile waits for that one result. At the start of each slot the unfiltered boards are worked out at once.
- **Bounded work.** Rankings run on a fixed pool of workers, one per CPU (`GOMAXPROCS`); a request never starts a
  goroutine of its own, and when the pool's queue is full the node answers `rate_limited`. Records are handed to the
  rankings through a queue, so storing them never waits for a ranking.
- **Start-up.** The rankings are built from the data folder in parallel while the node already serves; until they
  are ready (a fraction of a second for ten thousand networks) `rank` is answered `rate_limited`.
- **Memory.** About 9 KB per network that reports player traffic (its per-slot totals) plus about half a kilobyte per
  stats record held. Measured: 10,000 networks with a record every two hours (270,000 records) take about 23 KB each,
  some 230 MB; networks that report every five minutes take more, in proportion to their records (which the data
  folder holds anyway).
- `relay board` shows a whole board as players' games see it.

## Upgrades, backups and data

- **Upgrading:** your relay tells you when a newer one is out (Versions and update notices, below). Replace the
  binary (or the image) and restart. The data folder carries a version (`VERSION`) and is
  migrated on start; a relay refuses a folder written by a newer one instead of misreading it. Servers agree on a
  protocol version when they connect and keep speaking the older one until both sides have upgraded, so a federation
  upgrades one server at a time.
- **Backups:** `relay backup FILE.tar.gz` writes the records, catalog, config and node key (mode 0600). The operator
  key is left out on purpose: keep your own copy of `operator.key` somewhere safe. If a node loses its disk, the
  server's other nodes and the servers it syncs with fill it back in; what nobody else had is only recent stats and
  offers, which players send again.
- **What is kept:** records go into one file per day under `log/`. Stats are kept 72 hours (plus, for carrying forward,
  each network's newest and the one in force when the previous window starts), offers, answers and players' reports 30 days, votes 97
  days (90 they count, and the 7 a shun takes to lift), announcements until a network has been silent 180 days (one per
network and 5-minute slot, the newest; at most 4096 offers per network, 128 to any one other). What a
  `leave` removes is removed for good. Daily files are rewritten or deleted once nothing in them is kept, today's
  included, at the hourly retention run.

## Versions and update notices

**Every node says what it runs.** Its `welcome` (to games and to other nodes) and its `hello` to other nodes carry
`impl: {name: "tubes-relay", version: "x.y.z"}`, and your server's catalog entry lists the versions of its nodes as far as
the emitting node knows them (itself, and the nodes of your server it has a session with). Players see "relay x.y.z" per
node on your server's page in the looking glass; `relay status` shows yours and each peer's. It is informational: no
one signs it and nothing but displays uses it, not even the update notices below. A build without a version (`go build` by hand) says
`dev` and is never told to update.

**Where the news comes from.** The site publishes one static file beside the registry,
`https://seriesoftub.es/federation/relay.json` (`{v, version, released, security, notes, minSafe?}`), written by the
site build at each release. Your relay reads it from the folder its `registry` setting points at (a file `relay.json`
next to a local `servers.json` works too), at start and with each registry refresh (every 6 hours). It sends nothing
when it reads it: no version, no identity, just a GET like the registry's. Only if it cannot read the file does it ask
GitHub: `https://api.github.com/repos/fjaeckel/seriesoftubes/releases/latest`, on the same schedule, unauthenticated,
with `User-Agent: tubes-relay/<version>` and nothing else about your server. It takes the release's tag (`v3.7.0`
is 3.7.0; anything that is not a version is ignored) and its page on github.com as the notes, and marks the hint
"from GitHub releases". It is never a security hint: only `relay.json` says that. If GitHub answers 403 or 429 the
relay waits as long as it is asked to, and at least 6 hours (doubling to at most 48 while it repeats); it keeps the
last release it read. A `relay.json` read again takes over. What other servers' nodes run (gossip) is only shown,
never taken as news of a release. (The environment variable `RELAY_RELEASES_URL` replaces the API's address, `https://`
or `http://` on loopback only; it is for end-to-end tests.)

**Security releases.** `security: true` marks a release that fixes a relay security issue; `minSafe` names the newest
such release, so a relay older than it is told "security" even after later, ordinary releases.

**How you hear of it** when your relay is behind:

- the log, once at start and then at most once a day: `relay update available running=… version=… security=… notes=…`;
- `relay status`: `update` with the version, whether it is a security fix, the notes link and where it came from, and
  the line "update available: x.y.z (security) <notes>" on stderr;
- metrics: `relay_update_available{security="true"|"false"}` (1 on the matching series while behind, else 0),
  `relay_latest_version_info{version}` 1, and `relay_build_info{version}` 1 for what you run;
- your game: a session that proved an operator key of your server (the operator panel) gets an `update` frame after
  its `auth`, and again when the news changes; the panel shows "Update available", louder for a security fix, with
  the release notes link. Other players' games never get it;
- optionally, `notifyURL`: the relay POSTs `{"server", "running", "version", "security", "notes"}` as JSON once per new
  version (10 s timeout, retried after 30 s, 2 min and 10 min; if all fail, again at the next check), and remembers in
  `update.json` in the data folder which version it told, so a restart does not repeat it. Point it at your own chat
  webhook or alerting. It carries your server identity and versions only: no addresses, players or keys. Off unless
  you set it, and only `https://` URLs (without a user or password in them) are accepted.

## LAN parties: `relay lan`

`relay lan [--name NAME] [--port 8443] [--listen ADDR] [--host NAME|ADDR] [--data relay-lan]` runs a standalone
server for a local network in one step, with no domain, no public certificate and no internet:

- it uses its own data folder (`relay-lan` by default; it refuses one holding a relay that is not a LAN server);
- the first time, it runs `init` and founds a `standalone` server (`--name`, default "LAN Before Time"), with no
  registry and no update feed, so it fetches nothing;
- it makes a self-signed certificate (ECDSA P-256, one year, files `lan-cert.pem` and `lan-key.pem`) for the
  machine's mDNS name `<hostname>.local`, `localhost`, loopback and its LAN addresses (private and link-local IPv4,
  IPv6 unique local addresses), and keeps it while it still covers them and is valid for another week;
- it listens on `--port` on every interface (or `--listen`), serves the protocol at `/fed` and, at `/`, a small page of
  its own (no scripts, nothing loaded from elsewhere; never the game, which is only on GitHub Pages) with the invite
  link for the address the browser used;
- it prints for the players, on its own terminal only, the page addresses and the invite links by `.local` name and by
  address.

Node URLs may name private, link-local and loopback addresses for this (protocol section 5, Url); the registry refuses
any IP address and any `.local` name (`local_url`), so LAN servers are never listed. How to run a LAN party, and what
works on phones: [HOSTING.md, LAN party](HOSTING.md#lan-party).

## Testing against the game

`node scripts/fed-e2e.js` (from the repository root, after `npm ci`) builds this relay, runs it with TLS on loopback and
plays two games against it in Chromium: join, announce, deals, a shun reaching its threshold, a report reaching only the operator, the boards. Not part of CI. `node scripts/fed-e2e.js --play` sets up the same relay and
opens two Chromium windows on an invite to it, so you can play two networks against each other by hand.
`node scripts/fed-e2e.js --lan` runs `relay lan` on 127.0.0.1 and has a Chromium player open its page, take the invite
by IP address and join with the self-signed certificate.

## Metrics

Set `"metrics": "127.0.0.1:9100"` to serve `/metrics` in the Prometheus text format on localhost: connections by
role, records stored by kind, records sent, refusals by error code, sync sessions, open clients and sessions, records
held, disk use, rankings answered from the cache or worked out (`relay_rank_answers_total` by `cache`, hit or miss), and the version it runs and whether an update is out (`relay_build_info`, `relay_update_available`,
`relay_latest_version_info`, see Versions and update notices), all `relay_*`, plus the standard Go runtime (`go_*`) and process
(`process_*`) metrics. It uses the Prometheus client library on its own registry, so nothing else is exposed. Counts
and versions only: no label ever holds an address, a key or a name. The relay refuses a metrics address that is not on
localhost unless `"metricsPublic": true` is set, as in the container image, so a Prometheus on the same Docker network
can scrape `http://relay:9100/metrics` (the image exposes 9100; never publish it to the internet). A ready scrape job,
labels for several nodes and alerting rules: [HOSTING.md, monitoring](HOSTING.md#monitoring-with-prometheus).

## Privacy, in short

- Records hold only what the player signed, plus your node's receipt with the time rounded to the 5-minute slot.
- The connecting address is used in memory only: to look up a country (when you configured a country-only database and
  the player shares their country) and to limit connections per address for a few minutes. It is never written,
  logged, or passed on.
- Logs and metrics hold counts, error codes, record kinds and network keys (the public, pseudonymous game identity).
- Unknown fields in records are refused, so nothing finer than a country can ever be smuggled into one.
- Deals between players are sealed for the two players (offers and declines): your node checks their shape and
  signature, stores and forwards them, and sends them only to the games of those two players. Neither you nor anyone
  else running a node can read what was offered, at what price, or why someone said no. Open consortium projects are
  public by design.
