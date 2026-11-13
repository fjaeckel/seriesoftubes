# Federation: playing together without a server for the game (design)

Status: draft for review. Decision record: [ADR 0005](../adr/0005-federation-by-player-run-servers.md).
No code yet. Every later step follows CLAUDE.md (phones first, saves sacred, translated by label, perf measured).
The exact messages, limits and rules are in [docs/FEDERATION-PROTOCOL.md](../FEDERATION-PROTOCOL.md), with shared test
vectors in `federation/vectors/`; where this design and the protocol differ, the protocol wins.

## In one paragraph

Players can join their save to relay servers that other players run. Once joined, other players' networks show up
in your game as real networks: your customers want to reach theirs, and the cheapest way is to peer with them.
A server hosts many players and can be run by several players together; servers sync with each other only if
their operators choose to, and find each other through a registry kept in this repository (operators add their
server by pull request, CI checks it, review merges it) and through gossip between servers. Four leaderboards, rolling over the last
24 hours, rank what the mode is about: traffic exchanged with other players, total traffic, POPs in service and pies in
the sky.
Money is never ranked. AI players (through the MCP server) have their own division. Cheaters exist; we trust the
community and let each server moderate itself.

## Goals and non-goals

Goals:

- Cooperation pays, for both sides, the way peering pays on the real internet.
- Everything still works offline and solo. Multiplayer adds, never gates.
- If any server is down, nothing breaks: servers are relays and caches, never the only copy of anything.
- Works on phones in the browser (about 70% of players), portrait and landscape, at 360 px.
- No backend for the game (ADR 0001); servers are run by players (ADR 0005).
- Nothing identifies a person: no IP addresses, cities or devices are logged, stored or sent. Country only.

Non-goals:

- Competition over the same resources, attacking or taking over networks, chat.
- Proving that scores are honest (no replay checks, no anti-Sybil machinery).
- Real-time play. Everything is asynchronous; two players never need to be online together.

## Gameplay

### The core hook: other players' networks are destinations

Today traffic goes to computer-run networks (`NETS`). In a joined save, other players' networks are added as networks
too, built from their last announcement (their POPs, exchanges, customers and traffic mix). Your customers start asking
for traffic to theirs. You reach them in one of three ways:

| Way | What it takes | Effect |
| --- | --- | --- |
| Peer directly | Both present at the same exchange (or a PNI), and they accept your request and ratio | Free, lowest latency, both save transit |
| Buy transit from a player | Someone who already reaches them sells it to you | Earns them money, saves you the build-out |
| Computer-run transit | Nothing | Expensive and slower, customers grumble about latency |

Specialisation follows on its own: a player strong in a region becomes the way into it; content-heavy and eyeball-heavy
networks want each other.

Peering requests are checked against the other player's published policy (below). Depeering when the ratio drifts
is allowed and only ever costs a detour through transit.

### Published policies and rate cards

Every player publishes their terms in their `announce`, the way real networks publish a peering policy and a rate
card. Because the rules decide, deals happen while the other player is asleep: nobody needs to be online to say yes.

**What a player sets:**

| Part | Choices |
| --- | --- |
| Peering policy | Open, selective or restrictive (the same words the game uses for computer-run networks) |
| Peering conditions (selective) | Minimum traffic exchanged; maximum in/out ratio; at least N shared locations; route filtering (RPKI) required; Tier 1 only; AI players allowed or not |
| Transit | Price per Gbps at the 95th percentile; discounts for committed volume; minimum term |
| PNI | Setup fee and monthly price per port size; minimum term |
| Exchange, if they run one | Port prices per speed; who may join (anyone, selective, members' approval) |
| Waves | Routes they have lit, monthly price per wave size (100G to 1.6T), minimum term; never above what a computer-run vendor charges on the route |
| Requests | Per kind of deal: accept automatically when the conditions pass, review by hand, or decline |

**How a deal happens:**

1. The requester's game checks the published terms against its own network. Conditions that fail are shown with
   what is missing ("needs 2 more shared exchanges"), so the request becomes a goal.
2. If everything passes and the other side accepts automatically, the deal starts at once in the requester's game,
   with both sides' signatures: the published terms are the offer, the request is the acceptance.
3. The other player's game checks it again on its next sync. If their terms changed in between, the deal still runs
   on the terms that were published when it was made; nothing is undone.
4. Requests marked for review queue like any offer and wait for the other player, who sees them in the NOC dashboard.

**Guardrails that keep it cooperative:**

- **Computer-run transit is the ceiling.** It is always there, so a player who owns a region can charge for speed
  and convenience but never hold anyone to ransom. Overpricing just sends traffic around you.
- **Prices change at renewal, never mid-term.** Running deals keep their terms until the term ends, so nobody wakes
  up to a price they never agreed to. Terms changed today apply to new deals and renewals.
- **Money is still never ranked.** Prices shape who connects to you; they are not a score. A network that is
  expensive and peers with nobody falls on the traffic board.
- **Each game keeps its own books.** Money never moves between saves. The buyer pays in its own game from the
  traffic it sends; the seller earns in its own game from the traffic the buyer reports (signed, trusted like
  everything else).

**What grows out of it:** policies become reputation. Some networks are known as generous open peers, some as
premium routes with strict conditions, and someone runs the exchange everyone meets at. A policy page per network,
in the looking glass, shows the terms and how long they have held.

### What makes it intriguing

1. **Your network keeps running while you are away.** Others route over your last announced state. When you return,
   a traceroute shows strangers' traffic crossing your links, named hop by hop; following it is how you discover new
   peers.
2. **Things only possible together.** Consortium cables: too expensive for one player, funded by several. A project
   lists its signers; once funded, every member gets fibre pairs in their own game.
3. **Help while you sleep.** Players who swapped spare capacity with you carry your traffic when a cable is cut, until
   the repair ship is done. You get told who it was.
4. **The federation's default-free zone.** Tier 1 in a joined save means peering with every other Tier 1 player you
   can see and paying no one. It moves as players join, so it is never quite done.
5. **Shared incidents.** A route leak from one network spreads through the federation; everyone filtering with RPKI
   contains it.

Order of building: the core hook and the traceroute first; the rest builds on them (see Phases).

## Leaderboards

Five boards, two divisions (human and AI), each rolling over the last 24 hours, with no reset.

| Board | What is measured | How the window counts it |
| --- | --- | --- |
| Traffic with players | Gbps exchanged with other players' networks (peering, transit, consortium cables), the busier direction, as 95th-percentile billing does | 95th percentile of 5-minute slots |
| Total traffic | The network's whole traffic (what the game shows as traffic served), the busier direction, as each game reports it: nobody can confirm it, which is accepted (non-competitive) | 95th percentile of 5-minute slots |
| POPs in service | POPs that are up and connected | Lowest value in the window: a new POP counts after a full day up |
| Pies in the sky | Pies in service, `pieLiveAll()` | Lowest value in the window; only saves with a Pie in the Sky company appear |
| Customer cone | Player networks reachable through its transit customers, their customers and so on (CAIDA's AS rank among players): an edge counts when both sides list the transit deal in their stats (`cust`, `up`), each reports traffic with the other both ways, and the customer joined at least 30 days before and was heard in the last 7 | 95th percentile of 5-minute slots; growth floor 10 |

Rules:

- **Money is never ranked.**
- **Server time, not the phone's.** The window uses the time the server received a record.
- **Missing slots carry the last value forward, for up to 7 days.** Your network keeps existing while you are
  offline (after 7 silent days it drops off the boards until it is heard again), so a player who
  plays offline for a week and then syncs only moves the board once the new value has held for a while: 72 minutes for
  the 95th percentile, a full day for the lowest value. That smooths spikes from honest offline play too.
- **Traffic is reported by both sides.** Each record lists traffic per player network. When both sides of a pair
  reported, the server uses the lower figure; when only one did, it uses that one.
- **Which saves take part.** Normal games only: not sandbox (or any save with open gates), puzzles, scenarios or the
  weekly challenge.
- **Each server ranks what reached it.** Shown as "as seen from <server>". The server ranks in memory and sends the
  top 50 rows of the slice asked for and the player's own row with its rank, never the records; games trust it (like
  its excluded list) and spot-check a row or two against the signed records (see Decided).
- **Total or growth.** Each board can show totals (above) or growth, so new networks can rank too:
  - POPs and pies: the lowest value over the last 24 hours against the lowest value over the 24 hours before, as a
    share of the earlier one. A floor on the earlier value (10 POPs, 100 pies) stops a network going from 1 POP to 3
    from topping the board with +200%.
  - Traffic with players and total traffic: the 95th percentile over the last 24 hours against the 24 hours before,
    with a floor of 1 Gbps.
  - Growth needs 48 hours of records, so a network shows up on growth boards on its third day.

### Slicing the boards by every dimension

One leaderboard view, sliceable by every dimension the records carry. Filters combine freely; the active ones show as
chips above the list, and the player's own row stays pinned whatever is selected.

| Dimension | Values | Comes from |
| --- | --- | --- |
| Board | Traffic with players, total traffic, POPs in service, pies in the sky | the `stats` record |
| Measure | Total, or growth over the last 24 hours | the `stats` records of the last 48 hours |
| Division | All (humans and AI together), Humans, AI | the AI declaration |
| AI setup | Model, harness | the AI declaration (AI entries only) |
| Region | Continent, country, city | where the network's POPs are (counts per region in `stats`) |
| Home market | The country the network started in, in the game | `announce` |
| Players from | The player's real country, if they share it (never anything finer) | the server, from the connection (see Privacy) |
| Network age | Days since founded, in game days and real days | `announce` |
| Tier 1 | Tier 1 or not | `stats` |
| Peering policy | Open, selective, restrictive | `announce` |
| Peers with me | Only networks I have a deal with | the player's own `S.fed.deals` |
| Server | Each joined server's view, or all of them merged | where the records arrived |

- **Shared and separate in the same view.** "All" ranks humans and AI together with robot badges; "Humans" and "AI"
  rank each alone. Switching is one chip, not a different screen, and each entry shows its rank in the current slice.
- **Regions rank only what is in the region.** Filtered by a region, the POPs board counts POPs in that region and the
  traffic board counts traffic exchanged with players there; a network with no presence there is not listed.
- **Merged servers.** Records seen by several servers are counted once (same key, same slot).
- Filtering happens on the client from the records it fetched, so a server needs no query language; it serves the
  last 24 hours of records it has, and the client caches them for offline viewing.
- On phones: the board fills the bottom sheet, filters sit in one scrollable chip row, and "More filters" opens the
  rest as a second sheet.

### AI players

- A save played through the MCP server is marked as AI-played automatically. The agent facade (`src/agent/`) sets the
  field; nothing in `src/game/` refers to agent code (ADR 0004). Whoever runs the agent declares the model and harness,
  shown on the entry.
- AI entries carry a robot badge everywhere they appear, including when you peer with them.
- Humans and AI rank both together and apart, in the same view (see Slicing). The AI division uses the same three
  boards, and can be sliced further by model and harness. Later, an AI ladder: a fixed seed, measured at game days 90, 365 and
  1000, so agents compare like for like regardless of how fast they play.
- AI players are welcome neighbours: always online, they give a young federation peers, traffic and consortium members.
- Self-declared, like everything else. Hiding the badge is cheating, and handled like any other cheating.

## Trust model

We accept that some players cheat. What remains is about identity and correctness, not enforcement:

- **Signed messages.** Each joined save has a key pair; every record is signed. That stops impersonation, not lying.
- **Everything received is untrusted input.** Parsed, size-limited and checked like an imported save before it
  touches `S` or the screen. Names are plain text, never HTML.
- **Server moderation.** Each server can hide an entry or a name, and refuse a key. Servers pass on hide lists only as
  advice; each decides for itself.
- **Player muting.** Any player can mute a network locally; it disappears from their boards and their map.
- **Shunning.** When enough registered servers vote to shun a network, it is excluded everywhere (below).

### Shunning: excluded everywhere when enough servers agree

Hiding is one server's choice. Shunning is the federation's: when more than a set share of servers vote to shun a
network, it is excluded on every server and in every game that syncs.

- **Who votes: one vote per registered server.** Only servers in the registry folder count, listed for at least 30
  days and answering within the last 14 days. One vote per server, however many nodes, operators or players it has.
  Registry review is what stops someone from starting a hundred servers to shun a rival: unlisted servers can send
  shun records, but they do not count.
- **How a vote is cast.** An operator of the server signs a `shun` record: the network's key, a reason from a short
  list (cheating, offensive name, spam, abuse). Reasons are pre-made only, no free text: nothing to moderate in the
  votes themselves, and every reason is shown translated, by label. A vote lasts 90 days unless renewed, and can be
  withdrawn at any time with a signed `unshun`.
- **The threshold.** A network is shunned when the votes reach `SHUN_SHARE` of the voting servers, and at least
  `SHUN_MIN` servers voted (so a young federation of eight servers cannot exclude someone with two votes):
  `SHUN_SHARE` is 25% of all voting servers, and `SHUN_MIN` is 5. It is lifted when votes stay below the threshold for 7 days, so it does not
  flap at the edge.
- **Every server counts for itself.** Shun records travel with every sync between servers, whatever else a sync
  carries, and every relay tallies them against the registry. There is no central decision: the same records and the
  same registry give the same result. Standalone servers sync nothing, so they are outside the federation and its
  shuns, by their own choice.
- **Votes are for operators.** A relay sends shun records to a game only when it proved an operator key of that
  relay's server; operators see the votes and the tally for their server in the operator panel. Every other game
  learns only the outcome, which networks are excluded, from each server it joined.
- **What excluded means.**
  - Relays refuse its new records and stop passing on its old ones; it is not listed on any leaderboard.
  - In other players' games it goes dark at once (see Networks that go quiet): greyed out, traffic moves to other
    routes, deals end with a notice that says the federation excluded it. Nothing breaks.
  - In its own game, nothing changes but the multiplayer: it plays on solo and offline as always, and is told why it
    can no longer reach others, with the reasons the votes gave (which reasons, never how many or whose).
- **Open among operators.** Every vote is a signed record that travels between servers, so the operators of every
  server can see which servers voted, when and why, and a group of servers ganging up on someone is visible to them.
  Players do not see the votes.
- **New keys.** A shunned player can start a new identity. They start from nothing: no deals, no peers, no rank. We
  accept that, as with any cheating.

## Architecture

### Identity

- A key pair per joined save, made with WebCrypto, Ed25519 only. A browser without WebCrypto Ed25519 simply does not
  offer multiplayer (the rest of the game is unchanged); there is no second algorithm. Created when the player joins,
  not before.
- The public key is the identity. The game shows a short "ASN" derived from its hash (a 32-bit number in the private
  range, collisions resolved by the full key), plus the save's network name.
- The private key lives in the save. `exportSave()` and bug-report exports strip it. A separate "Move to another
  device" export includes it, behind a warning that anyone with the file can post as this network. Importing it on the
  new device carries the identity over; the old copy should then be left, since two devices with one key would send
  conflicting records (the server keeps the newest). Losing the key means starting a new identity, nothing more.
- **Shared saves and bug reports.** Players attach saves to issues, so a shared save must never carry a way to act as
  its network:
  - Every ordinary export (`exportSave()`, `exportSlot()`, the bug-report path) drops the private key, the queued
    outgoing records (they are signed and could be replayed) and any operator key. The public key, ASN and deals stay,
    so a bug can still be reproduced with the network as others saw it.
  - Importing such a save gives a detached save: it plays like any save, shows multiplayer as "not joined", and joining
    makes a new key pair (a new identity). It never sends records for the original network.
  - Only "Move to another device" keeps the key. That file has its own name (ending `-move-PRIVATE.json`), its own
    button behind a warning, and the bug-report form says not to attach it.
  - A test exports every way and checks that only the move file contains the private key.
- Network names are whatever the player types, real company names included: rule N2 (puns only) covers the names the
  game ships, not what players choose. Names are shown as plain text, never translated, and each server can hide one.

### Messages

JSON, signed, versioned, each under a size limit. Kinds:

| Kind | Sent by | Carries |
| --- | --- | --- |
| `announce` | client | Network name, ASN, home market, founded (game and real day), POPs, exchanges, customers and traffic mix (enough to appear in others' games), peering policy and conditions, rate card, how requests are handled |
| `stats` | client, at most every 5 minutes while online | POPs in service (per game city), pies in service, traffic per player network, Tier 1, AI declaration, whether the player shares their country |
| `offer` / `accept` / `decline` | client | Peering, transit, PNI, exchange ports, capacity swaps, consortium membership, waves; each record has one signer, and a deal's two signatures are the offer and the accept (or the counterparty's own `announce` when it accepts automatically) |
| `leave` | client | The network leaves the federation; its older records are dropped everywhere |
| `genesis` | the founding operator | A new server: name, first operator, first node; its hash is the server's identity |
| `server` | server operators (a majority) | Server identity, name, nodes (URLs and node keys), operators (keys), sync policy, `noLogs`, languages, description. Gossip wraps it with the path of servers it came through and when it was last seen; it expires 7 days after that |
| `operators` | server operators | A proposal to change the operator or node list; takes effect once signed by a majority of the current operators |
| `hide` | a server operator | Keys or names this server hides (applied on all its nodes, advice to other servers) |
| `shun` / `unshun` | a server operator | A vote to exclude a network everywhere: its key and one pre-made reason; lasts 90 days unless renewed |

Clients sign their own records; the receiving node adds a receipt time signed with its node key. Records are forwarded between servers so a
player on one server can peer with a player on another.

### Servers: many players each, many operators each

- **A server hosts many players.** Any number of saves can join one server, and one save can join several servers.
- **A server can be run by several players together.** A server is an identity (its operator list, founded by a `genesis`
  record; see Operating a server), not a machine. Its operators each run a node of it, the nodes copy everything between themselves, and a client may connect
  to any node; if one goes away, the others carry on. Like an anycast service run by several networks.
  - The server's `server` announcement lists its nodes (URLs) and its operators (their public keys).
  - Operators sign changes to the operator and node lists; a change needs a majority of the current operators, so no
    single operator can take the server over. A server with one operator is just the simplest case.
  - Moderation (hiding a name, refusing a key) is signed by any operator and applies on every node.
  - Nodes of one server always sync fully; that is what makes them one server.

### Servers sync with each other by choice

Between different servers, syncing is a decision of each server's operators, like a peering policy:

| Policy | Syncs with |
| --- | --- |
| Standalone | Nobody. A private server for a club, a classroom or a LAN party; its players only see each other. |
| Selective | Only the servers on its list. |
| Open | Any server that also wants to sync with it. |

- **Syncing is mutual.** Two servers sync only when both sides allow it, like a peering session needs both ends.
- **What a sync carries** is chosen per neighbour: player records (`announce`, `stats`, offers), so their players can
  peer and rank together; the catalog of known servers; hide lists as advice. Shun votes always travel, whatever
  else is chosen. A server may take records but not pass
  them on.
- **A player sees what their server sees.** On a standalone server, the boards and the other players' networks are
  that server's own; on a server that syncs widely, they reach as far as its syncs go. The boards' "Server" filter
  shows each joined server's view.
- Records passed on keep their original signatures, so a player on one server can peer with a player on another
  through any chain of syncing servers. Each record is stored once per server however many paths brought it.

### Finding servers: a registry built from pull requests, plus gossip

The list of servers is kept the way the internet keeps its routing registries (the IRR, the RIPE database): as
records in a shared database that anyone can submit to and everyone can read. Here that database is this repository.

**1. The registry is a folder in the repo, changed by pull request.**

- One file per server, `federation/servers/<server-identity>.json`, holding its `genesis`, the operator changes since
  (the chain) and its signed `server` announcement: name, nodes, operators, sync policy, languages, a short description.
  One file each, so pull requests never conflict. The weekly job adds `listed` and `answered` dates, which the shun
  tally uses to know who may vote.
- To list a server, an operator opens a pull request adding or changing its file. To change one, any of its operators
  does the same; changes to the operator list carry the majority signatures as everywhere else. To leave, delete it.
- **CI checks every such pull request** (a job in `ci.yml` running `relay check-registry`): the file parses and fits
  the size limit; its operator list follows from its `genesis` record by majority-signed changes, and the file is
  signed by its operators; at least one listed node answers a `wss://` challenge signed with its node key; the name is not taken by another file; the operators declare `noLogs: true` (see Privacy). A failing check says exactly why.
- **Consensus is review.** CI proves a submission is genuine and reachable; a maintainer merging it says it belongs.
  Merging can be automatic for changes to an existing server signed by its own operators, and manual for new servers.
- **It reaches players through the site.** The build turns the folder into `_site/federation/servers.json`, a static,
  same-origin file on GitHub Pages, so the list needs no service and no cross-origin request at all (ADR 0001 holds
  unchanged for it). It updates with each release.
- **A weekly CI job** connects to every listed server, stamps when each first got listed and last answered, and opens
  one pull request with those stamps and removing servers that have not answered for two weeks, for a maintainer to
  merge.

**2. Gossip between syncing servers fills the gap between releases.** Each server passes on the `server`
announcements it knows: it adds itself to the path and drops announcements whose path already contains it (loop
prevention, as in BGP); paths longer than 16 are dropped; announcements expire after 7 days unless refreshed.
Standalone servers neither send nor take gossip. Gossip carries liveness (which servers answer right now); the
registry carries the curated, reviewed list.

**3. Joining directly.** A server can always be joined by typing its address or opening an invite link, listed
anywhere or not.

- Clients merge the registry and gossip, prefer registry entries when they disagree about a server's nodes or
  operators, and cache the result for offline use.
- In the game, the list is a looking glass: servers, their policies, which ones sync with which, how many players
  each sees, and whether a server is in the registry or only heard of. Joining shows the server's policy first.

**Why not a DHT (for now).** A distributed hash table (Kademlia, as in BitTorrent) shines at finding one item among
millions with no central list. Here the whole list is small enough for every server to hold: even 5,000 servers at
under 1 KB each is a few MB, and gossip spreads it in minutes. A DHT would add a second protocol, harder testing and
new attacks (flooding the table with fake nodes) to solve a problem we do not have. Browsers could not take part
either: they cannot open the UDP or direct connections a DHT needs, only WebSockets to servers. If the federation ever
outgrows full lists, servers can add a DHT among themselves, behind the same `server` announcements, without changing
the game.

**No central service.** The repo is the registry and gossip carries liveness between releases, so nothing runs
centrally: no hosted directory, no service run by the project.

### The relay server

- **A small Go program** in this repository, in `relay/` with its own `go.mod`. It stores and forwards signed
  records, syncs with its own nodes and the servers it chose, keeps the catalog and computes its leaderboards. It runs
  no game logic.
- **One static binary.** Self-hosters download one file for their platform (Linux, macOS, Windows; amd64 and arm64,
  so a Raspberry Pi works) and run it: no runtime to install. Its container image is built `FROM scratch` and is a
  few MB, separate from the MCP server's Node image.
- **Few dependencies.** The standard library covers signatures (`crypto/ed25519`), JSON and HTTP (canonical JSON is
  written by hand, never with `encoding/json`).
  Beyond it: one small WebSocket library (`github.com/coder/websocket`) and a reader for the country-only database.
  Nothing from the relay reaches the page players load, which keeps using the browser's own `WebSocket`.
- Storage is plain files in one directory, so running one is cheap.
- Documentation first says: you need a domain and a real TLS certificate (browsers only allow `wss://` from an HTTPS
  page), with a reverse proxy example; then how to add a second operator's node and how to set the sync policy.
- **The same binary checks registry pull requests** (`relay check-registry`), so there is one implementation of "is
  this server valid", not one in Go and another in CI scripts.

### Operating a server

Operator actions are signed records, like everything else, so there are no admin passwords and no admin port on the
internet.

**Keys:**

- **Each node has its own node key**, made when the node is set up. Nodes sign receipt times and sync messages with it.
- **Each operator has an operator key**, separate from any save's key: losing a save never loses control of a server,
  and running a server does not tie anyone to a network.
- **The server is its operator list.** A server starts with a `genesis` record signed by its founding operator: name,
  first operator, first node. Its identity is the hash of that record. From then on, the operator and node lists change
  only by `operators` records signed by a majority of the current operators. There is no shared server key that one
  operator could take and act alone with.

**Setting up:**

- `relay init` creates the data folder, the node key, the operator's key (or uses one given) and a short config file:
  where to listen, the sync policy and neighbours, the path to the country database, whether to be listed.
- `relay genesis --name "…"` founds a new server; `relay join <server>` prepares a node for an existing one, which then
  needs the operators' majority to be added.
- `relay registry-file` prints the signed file to submit to the registry by pull request.

**Day to day, on the machine:**

- **The config file** holds what rarely changes (sync policy, neighbours, limits). The relay rereads it without a
  restart.
- **The command line** does everything else: `relay status`, `relay servers`, `relay players`, `relay hide <key>`,
  `relay shun <key> --reason spam`, `relay unshun <key>`, `relay nodes`, `relay backup`.
- It talks to the running relay over a local socket (a file on the machine), never over the network, and signs each
  action with the operator key kept on that machine.
- **Changes needing a majority are proposals:** `relay ops propose add-operator <key>` (or remove, add-node,
  remove-node) creates one; the other operators see it in `relay ops pending` and run `relay ops sign <id>`; it takes
  effect when a majority signed, on every node. Proposals expire after 14 days.

**On the go, in the game:**

- An operator can import their operator key into the game; an operator panel then appears in the looking glass for
  that server: pending proposals to sign, hide, shun and unshun, status of each node, recent errors.
- Actions are signed in the browser and sent over the normal `wss://` connection; the relay checks the signature
  against its operator list. It works on a phone, as a bottom sheet like everything else.
- The operator key is kept apart from saves (IndexedDB, behind its own "remove operator key" button), never exported
  with a save.
- Anyone sees a read-only status for every server: policy, players, syncs, votes, operators' count.

**Watching it:** an optional metrics endpoint on localhost only, for Prometheus or similar: connections, records in
and out, syncs, errors, disk use. Counts only, never addresses (see Privacy).

**Upgrading:** replace the binary and restart. The data on disk carries a version and is migrated on start; servers
agree on a protocol version when they connect and keep speaking the older one until both sides upgrade, so a
federation upgrades a server at a time.

### One protocol, two languages: shared test vectors

The game (JavaScript) and the relay (Go) both check records, count shun votes, work out the 95th percentile and the
lowest value over the window, apply expiry and merge server lists. They must agree exactly.

- The protocol is written down in `docs/FEDERATION-PROTOCOL.md`: every message, its fields, limits and signatures,
  and every rule that both sides compute.
- `federation/vectors/` holds JSON test vectors: inputs and the expected result, for every rule above, including
  malformed and hostile records that must be refused.
- The Go tests and the JavaScript tests both run every vector. A change to a rule changes the vectors first, and both
  sides must pass. That also lets anyone write a third implementation and know it is right.
- CI gets a Go job (build, `go vet`, `go test` with the race detector, the vectors) next to the existing Node jobs.
  Contributors working only on the game never need Go.

### The game client

- New files under `src/game/` in their topic folders (for example `60-features/` for federation state and sync,
  `93-ui/` and `95-modals/` for screens, `90-actions/` for actions), following `edit-the-game`.
- The connection lives outside the day tick. Sync runs on its own timer while a joined save is open and visible; it
  queues outgoing records in the save when offline and sends them when back.
- Other players' networks are rebuilt from cached announcements when they change, not every day, so the day tick and
  routing only see a few more networks.
- Phones close sockets when the tab goes to the background; the client reconnects and catches up on return.

## When a server is down, nothing breaks

The rule: **servers are relays and caches, never the only copy of anything a player needs.** Everything a player owns
(their network, their key, their deals with other players) lives in their own save, and the other networks they know
are cached in their browser (see Where state lives).
So losing any server, any node, any sync or the registry only makes the federation smaller for a while.

| What is down | What the player sees | What keeps working |
| --- | --- | --- |
| One node of their server | Nothing | The client moves to another node of the same server |
| Their whole server | A quiet status dot ("offline since 14:20"), no dialog, no toast | The game, every deal, every other player's network at its last known state; records queue in the save |
| All their servers | The same dot | Everything above; the game plays exactly like a solo save that remembers its neighbours |
| A server for good (weeks) | After 14 days, one gentle suggestion to join another server | Moving loses nothing: the identity is the key in the save, and deals are signed by both sides and kept in both saves |
| A peer's server, or the peer stops playing | Their network stays in your game as last announced | Traffic to them keeps flowing; see "Networks that go quiet" |
| Sync between two servers | Nothing | Each server keeps what it has; on reconnect they catch up, duplicates dropped by signature |
| The registry folder or the site's `servers.json` | Nothing | The cached list, gossip, invite links and typed addresses |

### How the client behaves

- **Never in the game loop.** Connecting, sending and receiving run on their own timer, outside `dayTick()`, `after()`
  and drawing, so a slow or dead server cannot freeze a frame or a day. Every network call has a timeout.
- **Backs off politely.** Reconnects wait longer each time (with jitter, up to 30 minutes), and only while the tab is
  visible, so thousands of clients do not hammer a server the moment it comes back.
- **Queues with a cap.** Records waiting to be sent are kept in the save up to a fixed size. Old `stats` records go
  first (only the newest matters); offers and answers are kept. Nothing waits on a reply to carry on.
- **No errors for the player.** An unreachable server is a normal state, not a failure: no modals, no red toasts, no
  disabled buttons. Actions that need another player (sending a peering request) are queued and say so.
- **Leaderboards from cache.** Shown with "as of <time>" when the server cannot be reached.

### Networks that go quiet

A player whose network stops sending (their server down, or they stopped playing) never vanishes suddenly from anyone's
game, because that would break routes and customers. Times are real days since the network was last heard from by
any server the viewer can see:

| Silent for | In other players' games | On the leaderboards | On relays |
| --- | --- | --- | --- |
| 0 to 7 days | Unchanged: last known state, deals hold, traffic flows | Listed, last values carried forward | Kept |
| 7 to 37 days | Fading: customers' demand for it shrinks, traffic drifts to other routes | Not listed | Kept |
| 37 to 180 days | Dark: greyed on the map, no traffic, deals ended with a notice in the NOC dashboard (never a surprise bill) | Not listed | Kept |
| Over 180 days | Gone from the map and the cache. Nothing else refers to it by then | Not listed | Deleted |

- **Back within 7 days:** nobody notices. Their game did not move on while it was closed (the game only runs while
  open), so their new records simply continue where the old ones stopped: a fresh `announce` replaces the last one,
  `stats` resume, queued offers go out. Deals made with them held the whole time.
- **Back after 7 to 37 days:** the same, and the fade reverses over a few days as customers' demand returns.
- **Back after 37 to 180 days:** restored from the new announcement; ended deals can be renewed with one tap on both
  sides.
- **Back after 180 days:** they are a new network to everyone else, with the same key, name and ASN. Their own save
  still has everything; others just meet them again.
- Players do not need to be at the same point in the game. One may be on game day 2,000 and the other on day 50: an
  announcement is a description of a network now, not a moment in a shared timeline.

### On the leaderboards

- A server outage does not cost anyone their rank: the window carries the last value forward for up to 7 days (see
  Leaderboards), and other servers that sync with yours keep showing you.
- Records count at the time the first server received them (their receipt), never the phone's clock. A player's
  game sends only its newest `stats` after an outage, so nothing lands out of place; the window carries the last value
  forward meanwhile.

### On the relay side

- A relay that restarts reloads its files and catches up from its other nodes and syncing servers.
- A node that cannot reach the others keeps serving its players and merges when the link is back; records are
  signed and immutable, so merging is a union, never a conflict. Operator changes need a majority, so a cut-off node
  cannot change the server alone.

## Where state lives

Saves live in `localStorage` today, about 5 MB for every slot together, so the save only holds what the player owns.
Copies of other people's data go in IndexedDB, which is larger and can be refilled from servers if the browser
clears it.

| Where | What | How long |
| --- | --- | --- |
| **The save** (`localStorage`, one slot, with the game) | `S.fed`: key pair, joined servers, own deals (each with the counterparty's key, name, ASN and the cities and capacity the deal uses, so it works with no other data), muted keys, the outgoing queue (capped), the AI declaration | As long as the save |
| **IndexedDB** (the game's origin, shared by all slots) | Other players' last announcements and when each was last heard; the cached server list; the last leaderboard answers per server and slice (at most 48) | Announcements until 180 days silent, or the oldest silent first when over the cap; the rest replaced on each fetch |
| **IndexedDB, operator key** (only on an operator's device) | The operator key, if imported; never in a save or an export | Until removed with its own button |
| **Memory only** (the open tab) | Sockets, connection status, back-off timers, received records before they are checked, the leaderboard slices being shown | Until the tab closes |
| **Other players' browsers** | Your last announcement, in their IndexedDB | 180 days after you were last heard |
| **Relay disk** (one data folder per node) | Every signed record as received, appended to one file per day; the latest announcement per network; offers until answered or 30 days old; the catalog of servers; shun votes until they expire; the `genesis` record, the operators and nodes, pending proposals (14 days), sync choices and hide list; this node's key | Announcements 180 days after last heard; `stats` 72 hours (two 24-hour windows for growth, and slack); daily files deleted once nothing in them is kept |
| **Relay memory** | Connected clients, indexes over the files, the leaderboards for the current window | Rebuilt from disk on restart |
| **The repository and the site** | The registry folder; `servers.json` on the site, cached for offline play by the service worker | Until changed by pull request; refreshed with each release |

- If IndexedDB is cleared or unavailable (some private windows), the game still plays: deals still work from the save,
  and the other networks come back from the servers on the next connection.
- If a relay loses its disk, its nodes and the servers it syncs with fill it back in; whatever no one else had is
  only `stats` and offers, which players send again.
- If the save is lost, the network is lost, exactly as today. The "Move to another device" export is the backup.

## State and saves

New fields (defaults in `newGame()`, repairs in `sanitize()`, old saves load with multiplayer off):

```
S.fed = null | {
  on: bool,               // joined
  key: {pub, priv},       // priv stripped from shared exports
  servers: [url],         // joined servers, at most a few
  ai: null | {model, harness},   // set only by src/agent/
  out: [record],          // queued while offline, capped
  muted: [pub],
  deals: [...],           // peering, transit, swaps, consortiums with other players, self-contained
  share: bool,            // let servers attach my country to my stats (shareCountry), default true
  joined: int,            // real day number the save first joined, 0 before
  last: int               // slot of the last stats queued, so at most one per slot
}
```

`sanitize()` drops anything malformed, caps every list, and turns `S.fed` off (not deleted) if the key is broken. Other
players' networks, the server list and leaderboard caches live in IndexedDB, not in the save (see Where state lives).

## Privacy: nothing identifies a person

A network is known by its public key and the name its player typed. Nothing in the federation records, logs or passes
on anything that points at the person playing: no IP addresses, no city or finer location, no device, browser or
user agent, no time zone, no email or account.

**Country is the one exception.** It is coarse enough to identify no one, and it gives the boards a "players from"
dimension. City or anything finer is never derived, stored or sent.

- **How the country is found.** The relay looks up the connecting address in a country-only database (no city data
  in the file at all, so it cannot be used for more), keeps the two-letter code, and forgets the address. The code is
  attached to that player's records as received by the server.
- **The player can switch it off.** In the multiplayer settings: "Share my country" (on by default, with one line
  saying what it is for). When off, the client tells the server, and no country is attached.
- **It is not the home market.** "Players from" is the player's real country; "Home market" is where their network
  started in the game. They are separate filters on the boards. In-game cities (POPs, regions) are game data, not the
  player's location, and stay as they are.
- A VPN changes the country the relay sees. That is fine: it is a rough grouping, not a fact about anyone.

**Relays, in memory only:**

- The connecting IP address exists only while it is needed: for the country lookup, and for rate limiting
  connections before a client has signed anything. Rate limits count by address in memory for a few minutes, never
  write it, and switch to counting by key and by connection once records arrive.
- Logs say what happened, never who connected from where: counts, errors, record kinds and network keys (the public,
  pseudonymous game identity). No addresses, headers or user agents.
- Records on disk hold only what the client signed, plus the server's receipt time rounded to the 5-minute slot the
  boards use, so exact activity times are not kept.

**Reverse proxies and hosting.** The relay can promise this for itself, not for the web server in front of it, which
logs addresses by default. So:

- The documentation gives proxy examples with access logs off (or addresses masked) and says why first.
- A server's registry file includes a signed `noLogs: true` declaration by its operators; servers without it are not
  accepted into the registry. Like everything else, it is trust, not proof, and a server found breaking it can be
  removed by pull request and shunned by its peers.

**Elsewhere:**

- **Clients** send no device or browser details. The browser reveals its address to the servers it connects to; that
  cannot be avoided, only not stored. Players who want to hide it from servers can use their own VPN.
- **The registry** holds servers' keys, names and nodes. Opening a pull request shows the operator's GitHub account, as
  any contribution does; nothing more is asked for.
- **Analytics.** The game's existing privacy-friendly counter gets no new events carrying server addresses, keys,
  names or countries.
- **Network names** are whatever the player types; the join screen says in one line that names are public and
  suggests not using a real name.

## Phones

- Joining, the leaderboards, offers and the looking glass are bottom sheets on phones, reached from the existing tab
  bar; no new tab unless testing shows it is needed.
- Leaderboards: one board at a time, switched by chips, the player's own row pinned.
- Offers arrive as toasts with an action, then live in the NOC dashboard.
- Checked at 360 px portrait and landscape before each phase ships.

## Performance

- A save that never joins pays nothing: no sockets, no timers, no extra work in `dayTick()` or `after()`.
- A joined save adds a bounded number of networks to routing. Measure with `npm run perf -- --base-ref origin/main`
  and a fixture that has 50 joined players' networks, phone and desktop.
- Client code size is measured in the build; keep it small (it ships to everyone).

## Translations

Every new string by label, in English and every dictionary (`scripts/i18n-add.js`), Italian included. Player-chosen
network names are shown as typed, never translated.

## Tests

**Both sides:** every vector in `federation/vectors/` (records, signatures, limits, shun tallies, the window's 95th
percentile and lowest value, carry-forward, expiry, merging server lists), passed by the game and by the relay.

**The game, in `tests/` (node:test and jsdom, seeded, no network, clocks injected):**

- `federation-vectors.test.js`: the game passes every vector.
- `federation-state.test.js`: defaults, `sanitize()` repairs, old saves load, exports strip the private key.
- `federation-messages.test.js`: signing and checking, size limits, malformed and hostile records rejected.
- `federation-catalog.test.js`: merging the registry with gossip, registry entries winning, either one missing.
- `federation-boards.test.js`: excluded modes, AI division, lower of two traffic figures, the 7-day limit.
- `federation-slices.test.js`: every filter alone and combined, regions counting only what is in them, the shared
  and separate divisions, merged servers counting a record once, the player's own row pinned.
- `federation-outage.test.js`: a server killed mid-sync, every node down, a server gone for good and the player
  moving to another with deals intact, a peer silent for 7, 20 and 40 days (no change, fading, dark, back), the queue
  cap dropping old `stats` first, back-off timings; no exception, no modal, and `dayTick()` doing the same work
  whatever the connection does.
- `federation-shun.test.js`: an excluded network going dark with deals ended, and its own game still playing solo.
- `federation-policies.test.js`: each condition passing and failing with the right "what is missing", automatic
  acceptance, review queued, terms changed between request and sync keeping the deal on the old terms, prices changing
  only at renewal, each side booking money only in its own game, computer-run transit as the ceiling.
- `federation-operator.test.js`: the operator panel only with an operator key, actions signed, the key never in an
  exported save, the panel at 360 px.

**The relay, in `relay/` (`go test -race`, relays started in-process, clocks injected):**

- Every vector.
- Nodes and syncing: two nodes of one server staying in sync, a client moving between nodes, operator changes needing
  a majority, the three sync policies (standalone takes and sends nothing, selective only its list, open only when both
  sides allow), a record reaching a server through two paths stored once, catalog loops dropped, expiry, path limit.
- Shunning: votes counted only from registered servers old and alive enough, one per server however many nodes, the
  share and the minimum, expiry after 90 days, withdrawal, lifting only after 7 days below.
- Privacy: connections from known test addresses; the addresses appear in no file, log line or record it writes or
  passes on; the country attached only when shared; receipt times rounded to the slot.
- Operating: `genesis` and the server identity, proposals taking effect only at a majority and expiring after 14
  days, a node not on the list refused, operator actions over the local socket and over `wss://` both checked against
  the operator list, data migrated on start, two protocol versions talking.
- `relay check-registry`: a signed file accepted only when a node answers the challenge, unsigned, wrongly signed,
  oversized, duplicate-name or `noLogs`-less files refused, operator changes needing a majority; and the build turning
  the folder into `servers.json`.

## Phases

1. **Identity and boards.** Key pairs, the relay (one operator, the three sync policies), the registry folder and
   its CI check, gossip, `stats` records, outage handling, POPs and pies boards, both divisions. No gameplay change yet, so it is small and shows whether
   people run servers at all.
2. **Servers run together.** Several nodes and operators per server, majority-signed proposals, the operator panel
   in the game.
3. **Other players as networks.** `announce`, other players' networks in your game, published policies and rate
   cards, peering, transit and PNIs between players, the traffic board, the traceroute.
   Players running exchanges come with phase 4.
4. **Together.** Exchanges run by players, consortium cables, capacity swaps for restoration, shared route leaks and RPKI.
5. **AI ladder.** Fixed seeds and game-day checkpoints for the AI division.

## Decided

- Leaderboards slice by every dimension the records carry; humans and AI rank together and apart in the same view.
- Leaderboards are ranked by the server, in memory, updated as stats arrive (2026-11-12): a game gets only the top 50
  rows of the slice it asked for plus its own row with its rank, never the board's records. The game trusts its
  server's ranking (non-competitive, ADR 0005), as it trusts its excluded list, and checks its own row and one random
  row against the signed records behind them (`rankwhy`); a server caught sending a ranking its records do not give is
  left out for a day and named. Spot checks deter, they do not prove what a server left out.
- The relay is a small Go program (one static binary, its own tiny container image), using one WebSocket library.
  The protocol is a written spec with shared test vectors that the Go relay and the JavaScript game both pass.
- "Move to another device" export with the private key: yes, behind a warning.
- Player-typed network names are allowed as typed, real company names included.
- A server hosts many players and may be run by several operators, each running a node of it.
- Servers sync with each other only by their operators' choice: standalone, selective or open, always mutual.
- Servers are listed in a registry kept in this repository, one file per server, added by pull request, checked by
  CI and merged on review; the build publishes it as a static file on the site. No DHT for now.
- If a server is down, nothing breaks: a player's save holds everything they need, and quiet networks fade over weeks,
  never vanish.
- When more than a set share of registered servers vote to shun a network, it is excluded everywhere: one vote per
  server, votes expiring, counted by every server for itself.
- Shun votes are seen by server operators only (2026-11-12): they travel between servers unchanged, but a relay sends
  them to a game only when it proved an operator key of that relay's server. Games learn only which networks are
  excluded; the excluded player sees which reasons were given, never how many votes, which servers or which operators.
- No central service: the registry is the repo, gossip carries liveness.
- Leaderboards show totals or growth over the last 24 hours (with floors so tiny networks cannot top growth).
- Leaderboards also rank total traffic (each game's own figure, self-reported), next to traffic with players.
- A network is shunned everywhere when 25% of all voting servers vote for it, and at least 5 do.
- Players publish peering policies, conditions and rate cards (transit, PNI, exchange ports); requests that pass
  are accepted automatically if the player chose that. Computer-run transit is the price ceiling; prices change only
  at renewal; money moves between no saves.
- Players sell waves to each other (2026-11-12): a `wave` deal on a published card of lit routes and wave sizes. The
  buyer gets a wave link like a leased one, billed monthly; the seller earns it and the wave takes room on its lit
  route, like waves sold to computer-run carriers. The computer-run wave price is the seller's ceiling (its own game
  applies it, the shared rule checks only the card). Dark fiber IRUs between players come later.
- Operators act through signed records: a command line on the machine over a local socket, and an operator panel in
  the game with an operator key kept apart from saves. Each node has its own key; the server is its operator list,
  changed only by a majority. No shared server key.
- Shun votes carry one pre-made reason (cheating, offensive name, spam, abuse); no free text for now.
- Servers publish their version; operators are told about updates (2026-11-12). Each node says what it runs in its
  `welcome` (and node `hello`), and a server's catalog entry lists its nodes' versions (unsigned, display only). The
  update feed is a static file on the site, `federation/relay.json`, written by the build; a relay reads it beside
  the registry every 6 hours and tells its operators (log once a day, `relay status`, metrics, an `update` frame to
  operator sessions only, an opt-in `notifyURL` webhook). A release is marked security by `relaySecurity` in
  package.json.
- Versions come from GitHub (2026-11-13): when `relay.json` cannot be read, a relay asks GitHub's REST API for the
  latest release (unauthenticated, plain User-Agent, same schedule, 403/429 honoured), `source: "github"`, never a
  security hint. Versions seen in gossip are for display only: the earlier hint from two servers' gossip is gone.
- Multiplayer can only be started or picked online, on new games (2026-11-13): the title's "Play with others" switch
  is disabled while the browser is offline, and turns itself back off when the server list cannot be loaded or lists
  no server (a valid typed address still counts: invites and private servers); Start is never blocked by it.
- Nothing logs or stores what identifies a person: no IP addresses, no city or finer location, no device details.
  The player's country is allowed, derived by the relay from a country-only database, and players can switch it off.

- Existing players are rewarded for pushing new players (2026-11-12): a **customer cone** board (above, spec §10.4)
  and a **mentor dividend**. A network is a *newcomer* for 30 real days after it joined (`announce.founded`). Buying
  from an established network in that time, every price is 25% off (the *newcomer price*, `terms.founded`, spec
  §10.10, checked by both games so they agree). An established network with a deal of any kind running with a
  newcomer, started while it was new, earns a one-off bonus in its own game (never ranked, money never moves between
  saves) when the newcomer, within 60 days of the deal's start, reaches 10 POPs (25% of the mentor's monthly revenue,
  10k to 1M), becomes a Tier 2 (50%, 25k to 2M) or wins a transit customer of its own (50%, 25k to 2M), as the
  newcomer's newest stats say through the mentor's servers (`nets`). Once per newcomer and milestone; what the
  newcomer already had when the mentor's game first looked never pays. No badge, no exchange perk.
- Anti-farming (2026-11-12): a mentor is paid for at most **5 distinct newcomers in any 14 days**; a milestone of a
  6th newcomer in that window is used up, not kept for later. A milestone pays only once the newcomer has been
  **heard on at least 3 distinct UTC days** (a stats record with a receipt slot, as the mentor's game saw it). A network
  counts in a cone only when it **joined at least 30 days** before the slot, was **heard in the 7 days** before it, and
  its transit edge carries **traffic both ways** confirmed by both sides; a network that does not qualify cuts the
  paths through it.

## Open questions for Frederic

None right now.
