---
name: gameplay-rules
description: The design rules of Series of Tubes, each with an id and the test that enforces it. Use whenever you add or change cities, countries, networks (NETS, upstreams, traffic shares, presence), cables, exchanges, data centers, customers, scenarios, puzzles, presets or rules, balance numbers or progression, and before committing any such change.
---

# Gameplay rules

These are what the game promises, held up by `tests/gameplay-rules.test.js` (one `test()` per id, on the live
`CITIES`, `NETS`, `CABLES`, `SCN`, `PZ`, `PRESETS`…). Each rule is true of the intended design.

## Procedure

1. Changing anything above? Run `npm test -- tests/gameplay-rules.test.js` (under a minute) before committing.
   Changing orbit prices, crusts, incidents or orbit customers? Also run `npm test -- tests/pie-balance.test.js` (O7's
   game-loop half, about a minute).
2. A failure names what breaks the rule and how to fix it. Fix the data or the code.
3. Only when real life really is different, add an entry to `EXCEPTIONS` in the test (keyed by rule id, sorted, with
   its reason in plain words). Never delete or loosen a check to make it pass. A stale exception fails too.
4. A new rule gets an id in the right section here, one line, a why, and its own `test('ID: …')`.

## World

| Id | Rule | Why |
| --- | --- | --- |
| W1 | Every city has a country code (`cc`, ISO 3166-1 alpha-2; territories have their own: PR, GU, RE, MQ, CW…), a region, a landmass and coordinates. | Borders, prices and the eyeball rule all hang off the country. |
| W2 | Every country on the map has at least two consumer networks of its own: an eyeball network, or a Tier 1 or Tier 2 incumbent that sells to homes, whose home markets (`cc` on the network) include that country and which has a PoP there. | Real countries have competing local ISPs, and peering locally is half the game. Add real operators in `src/game/30-networks/32-homegrown-eyeballs.js`. |
| W3 | Every city can buy transit from someone, or is a documented exception (Pitcairn: land your own cable, or reach it through a pie dish; Stuttgart: peering only). | A start or an expansion must never be a dead end by accident. |
| W4 | Cable pairs join two distinct real cities, have a length, and cable ids are unique. | Broken landings break routing and the own-cable planner. |
| W5 | A city alone on its landmass has a cable or a beach to land one. | Islands are reachable. |

## Networks

| Id | Rule | Why |
| --- | --- | --- |
| N1 | Network ids and ASNs are unique; ASNs are public (the real one for real-world networks). | Saves key on ids; players look ASNs up. |
| N2 | Names are puns: no network, cable, exchange, data center, router, optic, cable ship or maintenance club is called by a real name (blocklist `REAL_NAMES` in the test), and no lazy "-ish" names. | CLAUDE.md. Add the real name to the blocklist whenever you add its pun. |
| N3 | Every non-Tier-1, non-content network is in a founding Tier 1's customer cone (`up`), or is a documented island (transit-free incumbents, China, Korea, Australia…). Upstreams exist and are never content. | Tier 1 by customer cone (#85): a new network outside the cones makes Tier 1 harder for every save, old ones included. |
| N4 | No upstream cycles. | Cones must be trees, not loops. |
| N5 | Traffic shares are positive and below 20%; `NSH` and the regional tables sum to 1; content carries at least 30%. | Shares drive every flow; eyeballs mostly ask for traffic. |
| N6 | Every network has a type, a peering policy (selective ones state `minIx`/`minPni`), a colour and a translated blurb; carriers have a price. | Panels and the peering rules read them. |
| N7 | PoPs are real, distinct cities; exchange ports only where the city has an exchange and the network has a PoP. | Presence follows PeeringDB-style reality. |

## Modes and rules

| Id | Rule | Why |
| --- | --- | --- |
| M1 | On-call is the classic game: it equals `RULE_DEF`, and a save without rules loads as On-call. The seeded suites (`tests/game.test.js`, `tests/rules.test.js`) are its behaviour. | Old saves never change under them. |
| M2 | Presets are ordered: Best Effort never harsher than Change Freeze, Change Freeze never harsher than On-call, BGP at 3 a.m. never gentler (chaos, lead times, market; and a seeded year of incidents). Only Best Effort mends sea cuts without ships, skips conferences, rescues instead of game over, has patient customers and instant PNIs. | The names promise it. |
| M3 | Every subsystem that can annoy the player reads a rule: outages and events (`chaos`), DDoS, sold-out routes, de-peering and hardware prices (`market`), lead times (`lead`), the clock, cable ships (`sea`), conferences (`confs`), going broke (`broke`), customer patience (`moods`), PNI delivery (`pnis`), and the day's toasts (quiet notifications). A quiet ruleset gives a quiet year. | Rules are presets of flags, not separate code. |
| M4 | Scenarios and the weekly challenge always run On-call plus their own `S.scn.rules`. | Fair scores. |
| M5 | Sandbox has no locked feature: open gates, every level, own cables, endless money. | It is a sandbox. |
| M6 | A Normal game picks its charter once, when it starts (sandbox, puzzles and scenarios never do). A charter changes what you set out to do, never what things cost: the Cable broker gets glass (fiber, line systems, optics, own subsea cables and the routers to light them) from day one at the prices everyone pays at the top level, and everything else by level. | Same prices and rules for every charter (#300). |

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
| F5 | Capacity you rent to other carriers never outgrows the route's market: the capacity market sells a listing over time as carriers between the two cities want it, never past what they want that day (both cities' eyeballs, a landing town counting the big city it serves, grown about 15% a year up to 8 times, and at most 2.5 times its usual size on its hottest day), and a random offer never past what the eyeballs alone support. | Rent that scales with your own glass and not with demand is a money machine (#203); a market that never moves or grows makes no decisions. |
| F6 | An alien wave rents for at most 30% of what its fiber costs a month (lease plus amplifiers), each wave sold between two cities is never dearer than the one before, and a route sold out to its market earns less than eight times that cost. | A buyer would lease the fiber rather than pay many times its price; the old price made one wave worth the whole fiber and a full route 11 to 35 times its lease (#203). |
| F7 | Extra crews cut a build on land to half its planned time at most. | Permits, rights of way and trenching set the pace; a 1,000-day build finishing tomorrow made lead times meaningless (#203). |
| F8 | In the capacity market (Lambda Bazaar), a managed wave comes out of capacity you lit yourself (your own traffic gets that much less, and the customer suffers when your optics cannot carry it), rides one channel (an 800G or 1.6T wave needs an optic that big), and is priced against its fiber: a 400G wave 2.7 times a 100G one on land and 3.8 times on subsea, each bigger size cheaper per bit. Spectrum lists at 30% of the fiber's monthly cost, and heat moves any price by at most −30% to +35%. | Selling lit capacity must cost capacity, or every fiber sells twice; the ratios are 2025 market prices (TeleGeography), so bigger waves win on volume, not on price per bit. |

## DDoS

| Id | Rule | Why |
| --- | --- | --- |
| D1 | Attack sizes come from the world, never from your network: a heavy tail (median near 9 G, one in a hundred over 650 G) scaled by the era, capped at the era's record, and for the first 180 days (or with one POP) never more than twice your biggest port. Ten times the subscribers means the same attacks. | Sizes that grew with the network made every late-game flood larger than the internet's record (#242). |
| D2 | A flood enters on every port the internet reaches you on, by each network's share, and a port carries only what fits: everyone on a full port loses the same share. | Real floods are spread by geography; one fat port at a single POP is the weak spot (#242). |
| D3 | Only upstream tools (RTBH, clean pipe) and an engaged scrubbing center keep a flood off your ports. Flowspec acts on the ingress router, after the port, within that router's own rule budget. | Flowspec protects customers, not the external connections; TCAM is finite. |
| D4 | RTBH costs only the target: it goes dark (and its mood drops once), everyone else is saved, and the attack counts as sacrificed, not held. | RTBH is the tool that saves the network and is bad for that one customer, so it must be a real choice. |

## Orbit (Pie in the Sky, `docs/plans/pie-in-the-sky.md`)

| Id | Rule | Why |
| --- | --- | --- |
| O1 | The rocket company unlocks only on the Tier 1 win of a save started on its version (`S.pieV>=1`, set by `newGame()`; a save without it loads as 0), or from day 0 with open gates (sandbox). Never in puzzles, the Architect or scenarios. Losing Tier 1 keeps everything flying but builds nothing new. | An endgame for people who earned it; old won saves must not change under their players. |
| O2 | A crust under 40% coverage carries nothing; from 40% a half-baked crust carries a share that grows to all of its capacity at 60% (a slope, not a cliff), and orbit never carries more than the pie dishes' antennas (x rain, jamming): terminals and sky paths share each dish. | Satellites are not magic bandwidth; the ground segment is the bottleneck, as in real life. |
| O3 | A cut-off pie dish (its POP on an island the backbone does not reach) carries only its own POP's traffic (backhaul, to a landing dish on the backbone) and local terminals, never transit between other cities: no POP on the backbone routes through it. Backhaul is small (the dish's antennas, the landing dish's and the crust's room) and pays the orbit's latency. | Orbit extends your network to a town no cable reaches; it does not replace building one, and laying fiber stays the real fix. |
| O4 | Through space with lasers, light travels at c in vacuum (about 1.47 times glass), up and down at the shell's height; orbit never carries traffic between cities under 3,000 km apart and only latency-routed circuits fly: IP traffic, bulk and scenic circuits stay on fiber. | Real constellations win only on long routes, and their capacity is small. |
| O5 | Launches fail only with chaos on (`rule('chaos')`), and never in the first 90 days after the unlock; heavy test flights explode by design, not by chance. Orbit incidents and geopolitical spats (`pieChaos()`) follow the same rule. | Like F1: learn the thing before it punishes you. |
| O7 | A fresh Tier 1 cannot afford a full Shortcrust from its first year's money: even a big network's yearly profit plus the largest loan a bank would offer (and the Ex-Im Pie Bank's most) stays below the cheapest full build (`pieFullCost('short')`). And a full lasered Shortcrust, played through the game loop on the big-network save by a sensible policy (reusable rockets, two pads, no launches past the crust's size except replacements, safe mode in storms, dishes grown with demand at well-served POPs, every orbit offer signed), pays back on its own books (`S.pie.book`: every launch, replacement, dish, licence and running cost against orbit income) in 5 to 10 years, never sooner; government money (the Rural Digital Pie Fund, Pitcairn's satellite grant) brings that forward by at most two years, never under four (`tests/pie-balance.test.js`; `PIE_BALANCE_YEARS=10` prints the long run). | Obscenely expensive is the joke and the goal; a constellation in year one would be a cheat code. |

