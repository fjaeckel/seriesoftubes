# Pie in the Sky (implementation spec)

Local branch `pie-in-the-sky`. Never push. Commit as `Frederic Jung <frederic@jc-ix.net>`, no attribution
trailers (CLAUDE.md). Full design doc lives in Claude Docs; this file is the contract for the code.

## What it is

The endgame for players who just became Tier 1 in a save started on this version (and sandbox from day 0):
found a rocket company, launch thousands of satellites ("pies") into shells ("crusts"), build dedicated
base stations ("pie dishes") everywhere, and connect them with your own backbone. Obscenely expensive.
Satirical tone: a cartoon Founder (no real person) who breaks every promise by a year; a press office that
calls every failure a success. All names are puns (rule N2); add each real name riffed on to `REAL_NAMES`.

## Gate (rule O1)

- `newGame()` sets `pieV:1, pie:null`. `sanitize()`: missing `pieV` -> 0, so old saves never get it.
- Unlock fires only on the transition in `checkGoals()` where `g.win&&!S.won` flips `S.won`, when `S.pieV>=1`.
- Sandbox (`gatesOpen()` / open gates): available from day 0, real prices, `book.wouldHave` shame counter.
- Losing Tier 1 (`!(S.won&&isTier1())`): everything keeps working; no new launches, dishes, factory orders.
- Never in puzzles, Architect, scenarios, weekly challenge.

## State

```
S.pieV
S.pie = null | {born, co:{name}, fac:bool, rd:{reuse:bool,heavy:bool,heavyTests:int},
  pads:[{city,next,boosters:[{id,flights}]}],
  crusts:{short|frozen|upper|flaky:{cohorts:[{n,day,las}], queued}},
  dishes:[{id,city,ant,down}], lic:{[cc]:{state,until}}, q:[launches],
  founder:{posts:[...last 20], promises, broken}, book:{spent,earned,wouldHave},
  spat:{...active geopolitical spats}, safe:bool}
```
Pies are cohorts, never one object per satellite. `sanitize()` clamps all of it.

## Catalog (`src/game/10-catalog/70-pie.js`), all prices x `PIE_MUL` x `hwMul()`

| Item | One-off | Running |
| --- | --- | --- |
| Found company | $250M | $5M/mo |
| Pie factory | $1B | $8M/mo, 120 pies/mo |
| Pie | $1M (+$0.5M lasers) | - |
| Launch pad (coastal/beach city with a POP) | $400M | $2M/mo, equatorial -15% per launch |
| Falcon Punch launch | $60M, 20 pies | - |
| Reuse R&D (Falcon Punch Again) | $500M; launch $30M; booster lost $40M | - |
| Heavy R&D (Starshipping & Handling) | $3B; $100M/launch, 100 pies, first 3 test flights explode | - |
| Insurance | 8% of launch, optional | - |
| Pie dish (city with a POP) | $25M + $2M per antenna | $300k/mo |
| Landing rights | $10M-$200M per country by market size | yearly |
| LEO-IX port | $50M | $1M/mo |
| Founder launch party | $2M per launch, automatic | - |

Crusts: short 550 km / 1584 full / |lat|<=53; frozen 560 km / 520 / polar; upper 1100 km / 1200 / |lat|<=60;
flaky 340 km / 2500 / dense cities, life 3y. Life 5y otherwise. Coverage < 60% = half-baked, carries 0.

## Routing (rules O2-O4)

Crust >= 60% = virtual hub. Live, licensed, connected dish <-> hub edge: latency (alt up+down)/c + 2 ms.
With lasers: hub-to-hub along great circle at c (vacuum). Capacity = min(crust cap x coverage,
antennas x Gbps x rain). Orbit never beats fiber under ~3000 km. Graph grows by dishes + crusts only.
Dishes with no path to the backbone carry no transit (O3), but backhaul their own POP: all its traffic (eyeballs, customers,
circuits) goes up its dish and down at a landing dish on the backbone (bent pipe <= 1,000 km, lasers past that). Capacity =
min(cut-off dish's room after terminals, landing dish's room, crust's room); latency = the orbit path. Spats, safe mode, a
down crust, landing rights or a backhoe cut it. Must not slow `compute()` for saves without pies.

## Customers

`pizza` (homes/boats), `flywifi` (airlines, latency), `boat` (cruise). `mars` gets an orbit option only
in `pieV` saves. Remote cities (Pitcairn, Arctic) servable from orbit.

## Incidents (`rule('chaos')`, quiet 90 days after unlock)

Rapid Unscheduled Disassembly, booster falls over, solar storm (safe mode), food fight (debris, rare,
Space Roomba fix), rain fade, backhoe at the dish, astronomers (VisorSat), Founder posts at 3 a.m.,
chaos monkey snips a laser link.

## Geopolitical spats (cartoon, even-handed, countries as data, never real leaders)

Reuse the existing sanctions / sovereign-drill / China licence machinery where it fits.
- Landing rights: each country licenses separately; big markets cost most; some refuse for a while.
- Data stays home: a country requires an in-country pie dish for its customers.
- Spectrum squabble: two neighbours both want the same band; pick a side, the other closes for 180 days.
- Kill switch, please: a government wants an off switch during "national exam week"; comply (customer
  mood drop) or refuse (licence suspended 90 days).
- Orbital land grab: a rival constellation's home regulator files first; your next crust costs more.
- Jamming near a border: capacity over a region drops for some days.
- Launch diplomacy: a country offers a subsidised pad if you build 3 dishes there.
- Not over my airspace: two countries each demand their traffic avoid the other's dishes.
Each spat is a notification with 2 choices; outcomes deterministic per seed.

## Visualisation: a separate animated 3D globe

Satellites are NEVER drawn on the existing map (no cost there). The map only gets static pie dish icons
at POPs, drawn with the existing city layer. Satellites live on an animated 3D globe (orthographic
projection on a 2D canvas, no WebGL, no library) inside the Pie Control panel, rendered only while it is
open, paused when hidden, capped frame budget, fewer dots on phones. Final look is chosen from mockups.

## Rules O1-O7 (`gameplay-rules` skill + tests)

O1 gate, O2 half-baked carries nothing / capacity <= dishes, O3 disconnected dish no transit, O4 vacuum
latency, never beats fiber < 3000 km, O5 chaos + 90 quiet days, O6 rideshare <= demand,
O7 fresh Tier 1 cannot afford a full Shortcrust in year 1; full constellation never pays back < 5 years.

## Every change

Translated strings via `scripts/i18n-add.js` (0/0/0), sanitize, phones first, a seeded test
(`tests/pie-in-the-sky.test.js` and friends), perf vs `main` (`npm run perf -- --base-ref main`) must not
get worse, CHANGELOG bullet under `## [Unreleased]`.
