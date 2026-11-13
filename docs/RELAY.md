# Running a relay

The relay is the small server that lets Series of Tubes players play together: their games connect to it, it keeps
and forwards their signed records, ranks them on its leaderboards, and syncs with other servers if you want it to.
It runs no game logic and holds nothing a player cannot lose: every player keeps their own network in their own save.

Protocol: [docs/FEDERATION-PROTOCOL.md](FEDERATION-PROTOCOL.md).
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
  start when it listens beyond loopback, serves no TLS itself and trusts loopback proxies only. The image runs
  [`relay up`](#relay-up) unless given another command. A complete Docker
  Compose setup with Caddy, or with certbot and the relay serving TLS: [HOSTING.md](HOSTING.md).
- **From source:** `cd relay && go build ./cmd/relay`.
- **From the repository with Docker Compose:** `relay/docker-compose.yml` builds the image from the checkout and runs
  it with certbot, every setting in `relay/.env` ([HOSTING.md, from the repo](HOSTING.md#from-the-repo-recommended)).

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

### `relay up`

Steps 2 to 4 in one command, for containers and one-command setups (the image's default command, and what
`relay/docker-compose.yml` runs). Every setting is a flag or an environment variable:

| Flag | Environment | Used | Default |
| --- | --- | --- | --- |
| `--url` | `RELAY_URL` | first start (init) | none: required for a new folder |
| `--name` | `RELAY_NAME` | first start (genesis) | none: required to found a server |
| `--sync` | `RELAY_SYNC` | first start | `open` (as `genesis`): a server is set up to play with others |
| `--langs` | `RELAY_LANGS` | first start | `en` |
| `--desc` | `RELAY_DESC` | first start | empty |
| `--join` | `RELAY_JOIN` | first start: join that server instead of founding one; its nodes come from the registry | empty |
| `--join-from` | `RELAY_JOIN_FROM` | first start: a running node's `wss://` URL, for a server not in the registry | empty |
| `--registry` | `RELAY_REGISTRY` | first start: `servers.json`, an `https://` URL or a file | the game's |
| `--operator-key` | `RELAY_OPERATOR_KEY` | first start: an operator key file to use | a new key |
| `--listen` | `RELAY_LISTEN` | first start | `127.0.0.1:8080` (the image: `0.0.0.0:8080`) |
| `--metrics`, `--metrics-public` | `RELAY_METRICS`, `RELAY_METRICS_PUBLIC` | first start | off (the image: `0.0.0.0:9100`, public) |
| `--tls-cert`, `--tls-key` | `RELAY_TLS_CERT`, `RELAY_TLS_KEY` | first start | none: plain HTTP behind a proxy |
| `--trusted-proxies` | `RELAY_TRUSTED_PROXIES` | **every start**, when set | loopback only |
| `--notify-url` | `RELAY_NOTIFY_URL` | **every start**, when set (empty: off) | off |
| `--log-json` | `RELAY_LOG_JSON` (`true`) | every start | text |

What it does:

- **First start** (no `config.json` in the data folder): `init` with those settings, then `genesis` (or, with
  `RELAY_JOIN`, what `join` does: without `RELAY_JOIN_FROM` it finds the server's nodes in the registry, and while the
  registry or every node is out of reach it logs why and tries again, 5 seconds to 5 minutes apart; a server the
  registry does not list stops it with a message naming `RELAY_JOIN_FROM`), then `serve`. A joining node serves while
  it waits for its operators, logging the `relay ops propose add-node …` line (5 seconds, then up to 5 minutes apart)
  until it is on the list, then once more when it is. It prints, once, a notice with the server identity, the node key, the
  operator key's **public** half, the invite link and how to copy `operator.key` off the machine
  (`docker compose cp relay:/data/operator.key ./operator.key`). The private key is never printed or logged.
- **A setup stopped halfway** (a crash, a restart) carries on: keys already made are kept (never replaced), a config
  without a server goes on to genesis or join.
- **Later starts** only serve; nothing is founded again. Trusted proxies and the release webhook are local settings,
  signed nowhere, so they follow the environment whenever it sets them (an empty `RELAY_NOTIFY_URL` turns the webhook
  off). Everything else stays as `config.json` and the server's signed record have it: a different `RELAY_URL`,
  `RELAY_LISTEN`, metrics or TLS setting is logged with how to change it (edit `config.json`; a node's URL is a signed
  node change), and a different name, sync policy, languages or description with the `relay ops server …` command
  that signs a new server record. `relay up` never rewrites them on its own.
- **A certificate that is not there yet** (certbot has not issued it): instead of exiting, it logs "waiting for the
  TLS certificate" and tries again after 2, 4, 8… seconds, at most a minute apart, until the pair loads, then serves
  it and rereads renewals as `serve` does. SIGTERM while waiting stops it at once.

`serve` keeps working on any folder, so a Compose file that runs `serve` (or `init` and `genesis` by hand, then the
default command) behaves as before.

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
| `neighbours` | `[]` | Extra servers' nodes this node connects to: `{url, send, take}`, see Sync (open servers in the registry need none) |
| `autoSync` | `true` | `false`: this node does not dial the registry's other open servers itself (see Sync); for tests and hand-built meshes |
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
   relay join SERVER_IDENTITY
   relay serve
   ```

   `join` finds the server's nodes in the registry (`servers.json`, from the config's `registry`, `--registry` or
   `$RELAY_REGISTRY`), leaves out this node's own URL and tries them in order; the first that answers as that server
   goes first in `seeds`, the others stay as fallbacks. The registry only supplies addresses: the records the node then
   fetches are checked against the server's signed chain as always. A server that is not listed (new, unlisted,
   private, on a LAN) needs `--from wss://relay.example.net/fed`, the URL of one of its running nodes; `--from` always
   wins over the registry.

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

**Open and listed: nothing to configure.** When your server is `open` and in the registry, it syncs automatically
with every other open server in the registry that answered the weekly check in the last 14 days: your relay reads
them from `servers.json` at start and on every refresh (every 6 hours), connects to the new ones and drops the ones that
left, went quiet or changed their policy. Of each two servers the one whose identity sorts first dials, so there is one
session between them, not two. If it never does (an older relay without automatic sync, or `autoSync: false`), the
other one dials after 15 minutes without a session, and again 15 minutes after each session ends; if both dial at
once, one session is kept. With many servers (more than 65) each server syncs with at most 64 others, picked the
same way by every relay so that any server is at most a few hops from any other. A server with several nodes dials
from one of them (the node with the lowest key among those up; if it stops, the next one takes over within seconds) to
one node of the other server (the next one when that does not answer). A new server takes part as soon as its pull
request is merged and the site is rebuilt: the check on that pull request already proved a node answers, so the other
relays pick it up at their next registry refresh (within 6 hours, or at once on restart). From then on the weekly job
keeps it: a server that never answers it drops out 14 days after it was first stamped. Being live this way is only
about syncing: a server votes on shuns only after 30 days in the registry.

`relay status` shows it: `auto` lists your automatic peers with their name, who dials (`this node`, `sibling` for
another node of your server, `peer` when the other server dials you, `this node (fallback)` when it did not for 15
minutes and your node dials it instead) and whether the session is `up`; each entry of
`peers` says whether it is `auto` and whether this node `dialled` it.

**Neighbours** (`neighbours` in the config) are for everything else: servers not in the registry (a friend's, a LAN
party's), selective servers, or different classes for one of your automatic peers. Your node connects to them; others
may connect to you. Your node keeps one session with each server whichever side dials (when both list each other, the
one dialled by the lower identity stays). For each neighbour you choose what you **send** and what you **take**, by
class (they hold on the session with that server whichever side dialled, also for an automatic peer; automatic peers
otherwise get every class both ways, and `defaultSend` and `defaultTake` are for other servers that connect to you):

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
- **Memory.** About 4.6 KB per network that reports player traffic (its per-slot totals, 32 bits each until a network
  needs more) plus about 400 bytes per stats record held (the record packed, sharing other networks' keys with them).
  With the store's own entry, a relay takes about 0.7 KB per record in all: see [Memory and disk](#memory-and-disk).
- **Boards of now.** Games also send their current numbers every 10 s while they play (live states, protocol 5.11),
  and the boards' default view ranks those (10.13): POPs, pies and total traffic as reported now, traffic with
  players from both sides' current reports (a partner that is not playing counts 0), the customer cone over the
  current transit relationships. Live states are never written anywhere: your node keeps the newest of each network
  in memory (at most 50000 networks and 128 MB), forgets a network 15 minutes after its last state, and loses them
  all on a restart (games send again within seconds). A state that is newer than what your node had goes on to the
  servers it syncs players with, in batches every 2 seconds, and from them onward; so a player on any server shows
  on every connected server's boards of now within a few seconds. Each connection may send one state every 4 seconds.
  A ranking of now is worked out from a snapshot of the live states at most every 2 seconds per slice, on the same
  workers, and kept 30 seconds for the games' spot checks. `relay_live_states` counts the networks held,
  `relay_states_total` the states taken from clients and nodes and sent to nodes.
- **The running slot, and at most 30 s old.** The 24-hour and growth boards also count the 5-minute slot still running,
  from the live states (protocol 10.13): a network that is playing gets one more sample there, so a new POP or a
  traffic jump shows on every board within seconds instead of when the slot ends. Rankings of those boards are worked
  out from a snapshot of the live states at most 10 s old, and nothing (rankings, `rankwhy` snapshots, facets) is
  served once it is 30 s old.
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

### Memory and disk

The files are the records; memory holds an index of them. Per record the store keeps a 112-byte entry (id, author,
kind, time, board slot, storage number, where its line is in its day file) and the indexes over it, about 240 bytes in
all, and reads the record back from its file when it sends it (half a microsecond from the page cache; frames carry the
stored text as it is, nothing is parsed or encoded again). The last 4 MB of records stored stay in memory, for the
pushes, fetches and resumed subscriptions that ask for them most, and so do the server's own chain and hide records.
The leaderboards keep their own packed copy of each stats record (about 400 bytes). Measured with
`go test ./internal/node -run '^$' -bench Memory -benchtime 1x` on a generated data folder (stats with four traffic
partners and a transit relationship, a week of daily announces, ten answered offers per network):

| Each network | Records held | Go heap | Disk |
| --- | ---: | ---: | ---: |
| Stats once an hour (typical) | about 100 | 65 KB (660 B a record) | 97 KB |
| Stats every 5-minute slot (the most a client may send) | about 890 | 630 KB (705 B a record) | 930 KB |

Earlier builds kept every record parsed in memory: 5.4 to 5.9 KB of heap per record, 534 KB and 5.2 MB
per network in the two cases above. The process's resident size is the heap plus 30 to 40 MB for the program, and up to
the heap again before Go collects garbage; [HOSTING.md](HOSTING.md#what-it-costs) turns this into machine sizes. The
data folder from earlier builds is read as it is (same day-file format).

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
plays two games against it in Chromium: join, announce, deals, a shun reaching its threshold, a report reaching only the operator, the boards. A second server with two nodes syncs with the first (both open and in
the run's registry, no neighbours configured, one session between them): a third player there sees the first server's players, makes a sealed deal across the two servers, and
fails over to the other node when the first one stops. `--browser firefox` or `--browser webkit` runs it in those
engines instead. Not part of CI. `node scripts/fed-e2e.js --play` sets up the same relay and prints two addresses to
open in any browser, one player each, so you can play two networks against each other by hand.
`node scripts/fed-e2e.js --lan` runs `relay lan` on 127.0.0.1 and has a player open its page, take the invite
by IP address and join with the self-signed certificate (`--browser` works there too).

The run's relays trust its self-signed certificate through the environment variable `RELAY_TEST_ROOTS` (a PEM file
of certificates trusted besides the system's, for the relay's outgoing connections). It is for tests only: never set
it on a real relay.

## Load test

`relayload` (`relay/cmd/relayload`, a development tool: not in the release archives or the container image) starts
many relays and many simulated players on one machine and reports what the players see and what the relays cost:

```sh
cd relay
go run ./cmd/relayload --quick              # 2.5 minutes, no board checks
go run ./cmd/relayload                      # 20 servers, 1000 players, 12 minutes (two slot boundaries)
go run ./cmd/relayload --mesh full --spread skewed --json out.json
go run ./cmd/relayload --help               # every rate and threshold
```

- **Relays**: each is a separate process (the tool runs itself as `relayload node`, which does what `relay serve`
  does with the same `node` package, operator socket, TLS listener and `/metrics`), with its own data folder in a
  temporary folder, real TLS on loopback with a certificate made for the run, and its own founded server. All are
  in a generated `servers.json` as voters (listed and answered), sync policy `open`. The one difference from
  `relay serve`: outgoing connections trust the run's certificate and reach `*.localhost` names on loopback, and
  nothing else (Go on macOS ignores `SSL_CERT_FILE`, and nothing here touches the system's trust store).
  Topology: a ring with chords (each server has 3 or 4 neighbours, so records cross up to 4 hops among 20
  servers), or `--mesh full`, both configured as neighbours with `autoSync: false`; or `--mesh registry`: no
  neighbours at all, the servers find each other in the generated `servers.json` and sync automatically (every pair up
  to 65 servers, the capped graph beyond).
- **Players** (default 1000, round-robin over the servers or `--spread skewed`) each have their own Ed25519 key
  and the X25519 box key derived from it. They connect as a game does (hello, the node's challenge, `auth`, the
  game's `sub` kinds, the shun/unshun `sub`), put an announce at start and when their terms change, `stats`
  once per 5-minute slot, look at leaderboards (`rank`, about a third filtered, a quarter spot-checked with `rankwhy`),
  ask `nets` and `facets`, make sealed peering offers to random players (mostly on other servers) which the
  counterparty opens and accepts or declines (sealed), and now and then lose the connection and resume with
  their cursor. Defaults model a busy evening with everyone online at once: an announce every 15 minutes, a
  leaderboard look every 2 minutes, `nets` every 5, an offer every 10, a dropped connection every 30. Each player also
  sends a live state every 10 s when its numbers changed (half the ticks) and a keepalive every 3 minutes
  (`--state-every`, `--state-change`); every 5 s a probe gives one player's state a marker and a session on every other
  server asks its pies board of now until the marker shows, which measures how long a state takes to reach the boards
  of now elsewhere.
- **Limits stay as in production.** Every player sends its own private address in `X-Forwarded-For`, which
  the relays believe from loopback (their default `trustedProxies`), so the per-address connection limit counts
  each player separately; no limit is raised.
- **Measured**: latency (p50/p95/p99/max) of connecting, `put` to `ack` by kind, `rank` (and warm `rank`, after
  the first finished slot), `nets`, `facets`, `rankwhy`, and `sub` backlogs; errors by code; how long an
  announce takes to reach a subscriber on every other server, by hop count; sealed deals answered across servers,
  and that no session other than the two parties (players and an observer per server) ever got a deal record;
  per relay CPU, RSS, goroutines and its `/metrics` (records, sessions, refusals, rank cache hits) at start, mid
  and end; records and frames per second. After a full run every server's `pops` board must list the players
  that sent stats, with the same top rows on every server.
- **Fails** (exit 1) when a relay exits, a player cannot connect, fewer than 99% of puts are acked, announce
  propagation p95 is over 10 s, live state propagation p95 to the boards of now is over 10 s (`--state-p95`), a deal
  record leaks, fewer than 95% of offers are answered, warm `rank` p95 is
  over 1 s, the boards disagree, or a relay's memory grows by half between mid-run and the end. Thresholds are
  flags.
- **Open files**: 1000 players need about 2500 descriptors across the processes. The tool raises its own soft
  limit to the hard limit (the relays inherit it) and reports `EMFILE` plainly; if it does, raise `ulimit -n`.

### Results

With live states (13 November 2026, `--quick`, 20 servers in a ring, 1000 players, 150 s, load average 6 to 11 from
other work): all assertions passed; 7478 states acked (p50 0.6 ms, p95 24 ms); a state reached the boards of now of
the other servers in p50 4.0 s and p95 6.0 s (1 hop p95 3.5 s, 4 hops 6.1 s: each hop waits for the 2-second batch,
and the board's snapshot is up to 2 s old), 100% within 10 s; announces still p95 63 ms. Each relay: CPU 2.9 to 3.2%
of one core, RSS 42 to 50 MB at start, 54 to 63 mid-run, 73 to 82 at the end, 198 goroutines; warm `rank` p95 7.7 ms.


On an Apple Silicon Mac (8 CPUs, 24 GB), 13 November 2026, with the defaults (20 servers in a ring with chords, 1000
players round-robin, 12 minutes after a one-minute ramp), once with the store that reads records back from its files
(now) and once, right after, with the build before it that kept every record parsed in memory. Other work ran on the
machine throughout (load average 3 to 13 in both runs), so the tails are pessimistic. Every assertion passed in both.

| Players saw (ms), now / before | n | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Connect (TLS, hello, challenge, `auth`) | 1443 | 3.3 / 2.8 | 5.5 / 5.2 | 10.7 / 10.1 | 30.8 / 39.4 |
| `put` to `ack` (all kinds) | 6551 | 2.5 / 2.5 | 12.3 / 10.4 | 19.4 / 16.0 | 30.6 / 54.1 |
| `rank` once a slot had finished | 3532 | 1.2 / 1.0 | 3.8 / 3.7 | 7.8 / 8.0 | 22.1 / 21.9 |
| `nets` | 2260 | 1.1 / 1.0 | 2.5 / 2.1 | 8.5 / 6.2 | 17.2 / 15.4 |
| `rankwhy` (to the last frame) | 794 | 0.4 / 0.5 | 1.2 / 1.5 | 5.6 / 5.0 | 8.3 / 11.0 |
| `sub` backlog, first connection | 1000 | 8.8 / 7.7 | 19.8 / 15.5 | 22.8 / 25.0 | 29.6 / 40.0 |
| `sub` backlog, resumed with a cursor | 443 | 0.2 / 0.2 | 0.4 / 0.3 | 0.8 / 0.9 | 5.3 / 1.4 |
| Announce reaching another server, 1 hop | 7032 | 3.8 / 6.9 | 12.2 / 13.3 | 17.9 / 17.4 | 29.2 / 49.3 |
| Announce reaching another server, 4 hops | 3516 | 11.6 / 15.9 | 23.6 / 22.6 | 28.8 / 26.3 | 37.9 / 41.8 |
| Sealed offer to its answer, across servers | 807 | 13.1 / 12.5 | 16.8 / 16.2 | | 30.1 / 68.0 |

| Each relay (mean of 20), now / before | |
| --- | --- |
| Records held at the end | 6229 / 6810 |
| CPU, average and highest over 10 s (% of one core) | 1.2 and 1.5 / 1.1 and 1.2 |
| RSS at start, mid-run, end (MB) | 37, 56, 63 / 50, 91, 114 |
| Go heap mid-run, end (MB) | 23, 27 / 46, 74 |

- All 6551 puts acked, no error of any kind, no `rate_limited`; every announce reached every other server within
  10 s; 998 offers, all delivered and answered (698 accepted, 300 declined, sealed both ways and opened by the
  other party); not one deal record at a third party (players or the 20 observers).
- After the run every server's `pops` board listed all 1000 networks, with the same top rows on all 20.
- Each relay (50 players, 4 neighbours) ran 195 goroutines throughout. Its memory now grows with the records it holds
  at under a kilobyte each (its 50 sessions, caches and buffers are most of the heap here); before,
  about 4.4 KB each. Latencies are the same within the noise of the machine: reading a record back from its file
  costs half a microsecond, against encoding it from the parsed copy before. Records: 9.1 per second put by players,
  154 per second stored over the 20 relays, 1620 per second sent; the load generator used 7% of one core.
- `--quick --mesh full --spread skewed` (2.5 minutes, every server synced with all 19 others, the first server
  with 278 players) also passed, with a load average of 30 to 50 from other work on the machine: put p95 0.8 s and
  connect p95 2.4 s during the ramp, warm `rank` p95 5 ms, announce propagation p95 215 ms.

The run found one thing to change: every new announce threw away every cached ranking (a cache hit rate of 0 to 8%
in a 2.5-minute run); now only slices that filter by announce fields (home, policy, age, day) and the cone board are
worked out again, and the same run hits the cache 36 to 63% of the time.

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
