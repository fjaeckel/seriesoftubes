---
name: gameplay-rules
description: The design rules of Series of Tubes, each with an id and the test that enforces it. Use whenever you add or change cities, countries, networks (NETS, upstreams, traffic shares, presence), cables, exchanges, data centers, customers, scenarios, puzzles, presets or rules, balance numbers or progression, and before committing any such change.
---

# Gameplay rules

These are what the game promises, held up by `tests/gameplay-rules.test.js` (one `test()` per id, on the live
`CITIES`, `NETS`, `CABLES`, `SCN`, `PZ`, `PRESETS`…). Each rule is true of the intended design.

## Procedure

1. Changing anything above? Run `npm test -- tests/gameplay-rules.test.js` (under a minute) before committing.
2. A failure names what breaks the rule and how to fix it. Fix the data or the code.
3. Only when real life really is different, add an entry to `EXCEPTIONS` in the test (keyed by rule id, sorted, with
   its reason in plain words). Never delete or loosen a check to make it pass. A stale exception fails too.
4. A new rule gets an id in the right section here, one line, a why, and its own `test('ID: …')`.

## World

| Id | Rule | Why |
| --- | --- | --- |
| W1 | Every city has a country code (`cc`, ISO 3166-1 alpha-2; territories have their own: PR, GU, RE, MQ, CW…), a region, a landmass and coordinates. | Borders, prices and the eyeball rule all hang off the country. |
| W2 | Every country on the map has at least two consumer networks of its own: an eyeball network, or a Tier 2 incumbent that sells to homes, whose home markets (`cc` on the network) include that country and which has a PoP there. | Real countries have competing local ISPs, and peering locally is half the game. Add real operators in `src/game/30-networks/32-homegrown-eyeballs.js`. |
| W3 | Every city can buy transit from someone, or is a documented exception (Pitcairn: land your own cable; Stuttgart: peering only). | A start or an expansion must never be a dead end by accident. |
| W4 | Cable pairs join two distinct real cities, have a length, and cable ids are unique. | Broken landings break routing and the own-cable planner. |
| W5 | A city alone on its landmass has a cable or a beach to land one. | Islands are reachable. |

## Networks

| Id | Rule | Why |
| --- | --- | --- |
| N1 | Network ids and ASNs are unique; ASNs are public (the real one for real-world networks). | Saves key on ids; players look ASNs up. |
| N2 | Names are puns: no network, cable, exchange, data center, router or optic is called by a real name (blocklist `REAL_NAMES` in the test), and no lazy "-ish" names. | CLAUDE.md. Add the real name to the blocklist whenever you add its pun. |
| N3 | Every non-Tier-1, non-content network is in a founding Tier 1's customer cone (`up`), or is a documented island (transit-free incumbents, China, Korea, Australia…). Upstreams exist and are never content. | Tier 1 by customer cone (#85): a new network outside the cones makes Tier 1 harder for every save, old ones included. |
| N4 | No upstream cycles. | Cones must be trees, not loops. |
| N5 | Traffic shares are positive and below 20%; `NSH` and the regional tables sum to 1; content carries at least 30%. | Shares drive every flow; eyeballs mostly ask for traffic. |
| N6 | Every network has a type, a peering policy (selective ones state `minIx`/`minPni`), a colour and a translated blurb; carriers have a price. | Panels and the peering rules read them. |
| N7 | PoPs are real, distinct cities; exchange ports only where the city has an exchange and the network has a PoP. | Presence follows PeeringDB-style reality. |

## Modes and rules

| Id | Rule | Why |
| --- | --- | --- |
| M1 | On-call is the classic game: it equals `RULE_DEF`, and a save without rules loads as On-call. The seeded suites (`tests/game.test.js`, `tests/rules.test.js`) are its behaviour. | Old saves never change under them. |
| M2 | Presets are ordered: Change Freeze never harsher than On-call, BGP at 3 a.m. never gentler (chaos, lead times, market; and a seeded year of incidents). | The names promise it. |
| M3 | Every subsystem that can annoy the player reads a rule: outages and events (`chaos`), DDoS, sold-out routes, de-peering and hardware prices (`market`), lead times (`lead`), the clock. A quiet ruleset gives a quiet year. | Rules are presets of flags, not separate code. |
| M4 | Scenarios and the weekly challenge always run On-call plus their own `S.scn.rules`. | Fair scores. |
| M5 | Sandbox has no locked feature: open gates, every level, own cables, endless money. | It is a sandbox. |

## Content

| Id | Rule | Why |
| --- | --- | --- |
| C1 | Every scenario has a name, a goal, an `ok()` its progress card (`SCN_PROG`) shows, and cannot be won on day 0; so does every committed weekly scenario (`site/scenarios/weekly/`, its goal type's card in `WS_GOALS`). | A goal must need play. |
| C2 | Every puzzle has a 1-star and a 3-star reference solution in `REF` of `tests/puzzles.test.js`, which builds and scores them. | Every puzzle is solvable and every star reachable. |
| C3 | Every player-facing string is translated in every language (`node scripts/i18n-check.js`: 0 missing, 0 unused, 0 broken). | CLAUDE.md; see `add-strings`. |
| C4 | Every Architect run, handmade (`REF` in `tests/architect.test.js`) or weekly (`ref` in its file, `scripts/weekly-architect.js --check`), has a reference build that passes every brief's chaos monkey review and earns three stars; every weekly brief takes at least one change (a tube, a bigger tube, a move), and later briefs' cities stay hidden until they come. | A run you cannot finish, or a brief that asks for nothing, is not a puzzle; knowing the next brief makes it a chore. |

## Fun and fairness

| Id | Rule | Why |
| --- | --- | --- |
| F1 | A new network gets a gentle start: no outage before day 45, no event before day 40 and only good news before day 50, nothing sold out for 90 days, hardware prices hold for 180, and a new customer loses no mood for 15 days. | New players learn before they get punished. |
| F2 | On On-call, a simple build in a start city (broadband, the cheapest 100G transit, an exchange port with the route server) makes money within 3 months, in Frankfurt, New York, Singapore and Johannesburg. | Seeded today it turns a profit in month 1 or 2; a balance change that breaks this makes the start too hard. |
| F3 | A specialist path (#187) only brings a customer type in below its level when the network can already serve it, or nearly: the spotted cities have POPs, the latency is met, the fiber carries at least three quarters of the smallest order. | Capability, not luck: an offer you cannot fulfil with a reasonable build is a trap. |
| F4 | The chaos monkey visits only On-call and BGP at 3 a.m. (never Change Freeze, Sandbox, puzzles or scenarios), not before day 180, for 120 to 240 days; while it is here its snips replace the ordinary failures, each snip heals within a week, and it goes after tubes with no other way round first. | A test of resilience you can prepare for, not a pile-on: the reward goes to networks built with a second path. |
| F5 | Capacity you rent to other carriers never outgrows the route's market: a broker listing sells over time as carriers between the two cities want it, and neither it nor a random offer sells past what both cities' eyeballs support (a landing town counts the big city it serves). | Rent that scales with your own glass and not with demand is a money machine (#203). |
