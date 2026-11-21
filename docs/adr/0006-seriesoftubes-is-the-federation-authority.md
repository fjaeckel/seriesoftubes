# ADR 0006: seriesoftub.es is the federation's authority: bans and the oldest relay allowed

- Status: accepted
- Date: 2026-11-21
- Amends: [ADR 0005](0005-federation-by-player-run-servers.md) ("no server is official", "trust, not enforcement")

## Context

Frederic is liable for the domain and the game, and so must be able to remove any network or server from multiplayer,
everywhere, without asking the operators of each relay. ADR 0005 left moderation to each server and to the shun vote
(10.7), which needs a quarter of the registry to agree and takes days. Relays also lag behind releases: a relay that
does not know a new rule (a ban among them) cannot apply it, so the federation is only as current as its oldest relay.

## Decision

- **The authority is a signed static file, not a server.** The site build publishes `federation/authority.json` beside
  `servers.json` and `relay.json` (FEDERATION-PROTOCOL.md 11.5), signed with a key only Frederic holds (the GitHub
  secret `AUTHORITY_KEY`). Its public keys are pinned in the game and in the relay (`federation/authority-keys.json`).
  seriesoftub.es stays one static site on GitHub Pages (ADR 0001); nothing here needs a backend.
- **It bans networks and servers.** `federation/bans.json` in this repository lists them, with a reason. A ban takes
  effect on the next deploy: pushing a change to it redeploys the live release (`authority.yml`), as the weekly puzzles
  do, with no new release.
- **It sets the oldest relay allowed.** A release that changes the relay or the protocol sets `relayMin` in
  `package.json` to its own version. Seven days after that release, relays still older are out of date.
- **Everything removes what it bans.** Relays refuse records from banned networks, drop what they hold of them,
  close their sessions and leave them off the boards; they refuse to sync with banned or out-of-date servers and leave
  them out of the catalog they pass on. The game refuses to join a banned or out-of-date server, leaves banned servers
  out of its list, and treats a banned network as excluded and confirmed (running deals with it end).
- **The shun vote stays**, for what operators decide together; a ban does not need it.
- **Relays also pass it to each other**, so a ban needs neither GitHub nor a deploy: signed with the key kept on
  Frederic's machine and pushed into any relay (`relay authority push`), it reaches the connected federation in
  seconds. Two keys are pinned, the release workflow's secret and the offline one, so either can be dropped if it
  leaks. The site's copy remains for relays that are not connected and for games.
- **Relays and games keep the newest file they verified**, so a ban survives the site being unreachable, and an older
  file can never undo a newer one.

## Consequences

- One signature can remove anyone from multiplayer within seconds. Neither key may enter the repository; the offline
  key stays on Frederic's machine, the other in GitHub's secret store. A ban signed by hand must also be committed to
  `federation/bans.json`, or the next deploy (signed later, so newer) undoes it.
- Relay operators must update within a week of a relay release that raises `relayMin`. Releases that only change the
  game do not raise it.
- A relay reports its own version (`impl`), and nothing proves it: a modified relay can claim any version, and the
  relay's code is MIT-licensed. What makes a ban stick is the game: it refuses banned servers and drops banned
  networks itself, whatever a relay says, and relays that follow the authority refuse to sync with banned servers.
- A ban is per network key: relays keep no addresses (ADR 0005), so a banned player can start a new network.
- Local relays (no registry, a LAN or a development build) read no authority file, and the game does not check the
  version of a node at a local address; bans still apply to everything the game sees.
- Being the authority makes seriesoftub.es the moderator of the federation, with whatever duties that brings.
