# Running a relay

The relay is the small server that lets Series of Tubes players play together: their games connect to it, it keeps
and forwards their signed records, ranks them on its leaderboards, and syncs with other servers if you want it to.
It runs no game logic and holds nothing a player cannot lose: every player keeps their own network in their own save.

Design: [docs/plans/federation.md](plans/federation.md). Protocol: [docs/FEDERATION-PROTOCOL.md](FEDERATION-PROTOCOL.md).
Decision: [ADR 0005](adr/0005-federation-by-player-run-servers.md). The project runs no server of its own; every server
is someone's choice and responsibility.

## Before anything else: a domain and a real TLS certificate

The game is served over HTTPS, and a page served over HTTPS may only open **`wss://`** connections. Browsers refuse
plain `ws://`, a bare IP address and a self-signed certificate without telling the player much. So you need:

- **A domain name** (a subdomain is fine, for example `relay.example.net`). The protocol refuses node addresses that
  are IP literals.
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

- **Binary:** download `relay` for your platform from the GitHub release (Linux, macOS, Windows; amd64 and arm64, so a
  Raspberry Pi works). It is one static file with nothing to install.
- **Container:** the image is built `FROM scratch` (a few MB), runs as an unprivileged user and keeps everything in
  the `/data` volume. Set `"listen": "0.0.0.0:8080"` in its config so the proxy can reach it.
- **From source:** `cd relay && go build ./cmd/relay`.

Every command takes `--data DIR` (default: `$RELAY_DATA`, else `./relay-data`). Everything lives in that one folder.

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
and the TLS files change on restart only. Unknown settings are refused, so a typo cannot silently do nothing.

| Setting | Default | What |
| --- | --- | --- |
| `listen` | `127.0.0.1:8080` | Where the relay listens (behind your proxy) |
| `path` | `/fed` | The WebSocket path |
| `url` | | This node's public `wss://` URL |
| `tlsCert`, `tlsKey` | | Serve TLS directly instead of behind a proxy |
| `server` | | The server identity (written by `genesis` or `join`) |
| `seeds` | | `join`: URLs of running nodes of the server |
| `selective` | `[]` | Server identities allowed when the server's sync policy is `selective` |
| `neighbours` | `[]` | Other servers' nodes this node connects to: `{url, send, take}`, see Sync |
| `defaultSend`, `defaultTake` | all | Classes for servers that connect to you and are not neighbours |
| `countryDb` | | A country-only MaxMind-format database (GeoLite2-Country, DB-IP Country Lite). Optional |
| `registry` | `https://seriesoftub.es/federation/servers.json` | The registry snapshot (a URL or a file); used for the shun tally |
| `metrics` | | A **localhost** address for `/metrics`, for example `127.0.0.1:9464`. Anything else is refused |
| `trustedProxies` | loopback | Proxies whose `X-Forwarded-For` is believed |
| `listed` | `false` | A note for yourself: whether you mean to be in the registry |
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

Shun votes always travel, whatever you choose. A server may take records without passing them on.

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
| `relay status` | Server, head, operators and nodes, sessions, record counts, disk use |
| `relay servers` | Every server you know, from the registry and from gossip |
| `relay players` | Networks with an announcement: name, ASN, last heard, quiet state, hidden or shunned |
| `relay nodes` | This server's nodes and which are up |
| `relay board --board pops --measure growth` | A leaderboard as this server sees it |
| `relay hide KEY` / `--names` / `--refuse` | Leave a network off your boards, show it by ASN only, or refuse its new records |
| `relay unhide KEY` | Take it off all three lists |
| `relay shun KEY --reason spam` | Vote to exclude a network everywhere (`cheating`, `offensive_name`, `spam`, `abuse`) |
| `relay unshun KEY` | Withdraw your vote |
| `relay ops pending` / `propose` / `sign` / `server` | Operator and node changes (above) |
| `relay backup FILE.tar.gz` | A consistent copy of the data folder |

A network is shunned everywhere when at least a quarter of the voting servers, and at least five, vote for it. Votes
last 90 days unless renewed, and a shun lifts 7 days after the votes fall below the threshold. Every vote is a public,
signed record.

## Upgrades, backups and data

- **Upgrading:** replace the binary (or the image) and restart. The data folder carries a version (`VERSION`) and is
  migrated on start; a relay refuses a folder written by a newer one instead of misreading it. Servers agree on a
  protocol version when they connect and keep speaking the older one until both sides have upgraded, so a federation
  upgrades one server at a time.
- **Backups:** `relay backup FILE.tar.gz` writes the records, catalog, config and node key (mode 0600). The operator
  key is left out on purpose: keep your own copy of `operator.key` somewhere safe. If a node loses its disk, the
  server's other nodes and the servers it syncs with fill it back in; what nobody else had is only recent stats and
  offers, which players send again.
- **What is kept:** records go into one file per day under `log/`. Stats are kept 72 hours (plus each network's newest,
  for carrying forward), offers and answers 30 days, votes 90 days, announcements until a network has been silent 180
  days. Daily files are rewritten or deleted once nothing in them is kept.

## Metrics

Set `"metrics": "127.0.0.1:9464"` to serve `/metrics` in the Prometheus text format on localhost: connections by
role, records stored by kind, records sent, refusals by error code, sync sessions, open clients and sessions, records
held, disk use. Counts only: no label ever holds an address, a key or a name. The relay refuses a metrics address that
is not on localhost.

## Privacy, in short

- Records hold only what the player signed, plus your node's receipt with the time rounded to the 5-minute slot.
- The connecting address is used in memory only: to look up a country (when you configured a country-only database and
  the player shares their country) and to limit connections per address for a few minutes. It is never written,
  logged, or passed on.
- Logs and metrics hold counts, error codes, record kinds and network keys (the public, pseudonymous game identity).
- Unknown fields in records are refused, so nothing finer than a country can ever be smuggled into one.
