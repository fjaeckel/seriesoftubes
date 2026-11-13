# ADR 0005: Multiplayer through servers players run themselves, never through seriesoftub.es

- Status: proposed
- Date: 2026-11-12
- Amends: [ADR 0001](0001-github-pages-only.md) (one narrow exception, below)

## Context

A non-competitive multiplayer mode (other players' networks to peer with, shared cables, leaderboards) needs
messages to travel between players. A static page on GitHub Pages cannot carry them, and ADR 0001 rules out any
backend for the game, naming leaderboards explicitly.

Players are happy to run servers themselves, the way people run Mastodon instances, IRC servers or route
servers at an exchange. The game already has a tool players run themselves: the MCP server and its container image,
which ADR 0001 treats as tools ("what someone serves with them is theirs").

## Decision

- **seriesoftub.es stays exactly what ADR 0001 says.** One static page from GitHub Pages, no backend, no second host.
  Nothing about the game's hosting, build output, caching or deploy changes.
- **Multiplayer runs on relay servers that players host.** The relay is a tool in this repository, like the MCP
  server: a small Go program (one static binary and a tiny container image of its own). The project publishes the code; it never runs or
  pays for a server, and no server is "official".
- **A server hosts many players and may be run by several players together**, each running a node of it. Servers
  sync with other servers only when both sides' operators choose to (standalone, selective or open).
- **Servers are listed in this repository.** Operators add their server by pull request (one signed file per server);
  CI checks the signature and that the server answers; review merges it; the build publishes the list as a static,
  same-origin file on the site. Between releases, servers pass on the servers they know, like routes in BGP. No
  service is needed to find servers.
- **The game never depends on a server.** If any server, node, sync or the registry is down, nothing breaks:
  servers are relays and caches, and everything a player needs lives in their own save. Everything plays offline
  and solo exactly as before. Multiplayer is
  opt-in per save; a player who never joins makes no new requests and pays nothing at load or in the game loop.
- **Trust, not enforcement.** Clients and servers check that messages are well-formed and signed by the key they
  claim, and they treat everything received like an imported save (checked in `sanitize()`-style code before use).
  They do not try to prove that a player's numbers are honest. Servers moderate their own lists.

## The exception to ADR 0001

ADR 0001 allows only the fonts and the analytics counter as cross-origin requests. This ADR adds one more kind:
**secure WebSocket connections (`wss://`) to relay servers the player chose to join**, made only while that save has
multiplayer turned on. The game must keep working fully when every one of those connections fails.

Nothing else changes: no third-party libraries from other hosts, no APIs the game depends on, no server for the game
itself.

## Consequences

- Leaderboards, peering with other players and shared cables become possible without a backend for the game.
- Self-hosters need a real TLS certificate: a page served over HTTPS may only open `wss://`, so plain `ws://` on a
  LAN or a bare IP is blocked by every browser. The relay's documentation says so first.
- Cheating is possible and accepted. The design does not spend effort on replay checks, cross-browser determinism or
  anti-Sybil schemes. Each server may hide entries and names; each player may mute networks;
  when more than a set share of registered servers vote to shun a network, it is excluded everywhere (votes are
  signed, one per server, seen by server operators only, and expire).
- Each server sees a slightly different leaderboard, made of what reached it. That is presented as a feature
  ("as seen from …"), like a looking glass.
- The private key that identifies a save must never leave the player's device by accident: exports for bug reports
  and sharing strip it.
- Nothing identifies a person: relays never log or store IP addresses, a city or anything finer, or device details.
  A player's country is the one exception, and players can switch it off. Registered servers declare that their
  hosting keeps no address logs either.
- The relay is developed and tested here, but deploying one is always someone else's choice and responsibility.

## Out of scope, still

An official or project-run server, accounts, cloud saves, push notifications, a server that runs game logic, and
anything that makes seriesoftub.es itself talk to a backend.
