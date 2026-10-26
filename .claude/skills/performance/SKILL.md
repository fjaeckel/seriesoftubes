---
name: performance
description: Measure and demonstrate the performance of every Series of Tubes change on a very large network, compare it with main, and report the numbers.
---

# Performance is always demonstrated

Every change to the game (anything in `site/`) shows its performance on a very large network,
compared with `main`, before it is merged or released. A speed claim without numbers does not
count, and neither does "it feels fine on my small game". Most players who complain about lag
have huge late-game networks, and most of them are on phones.

## Measure

```bash
git show origin/main:site/index.html > /tmp/base.html
npm run perf -- --base /tmp/base.html            # headless only, a few minutes
npm run perf -- --base /tmp/base.html --browser  # plus real Chromium, desktop and phone (what CI runs)
```

`scripts/perf-bench.js` loads `tests/fixtures/big-network.json` (about 100 POPs, 150 links,
950 PNIs, 830 cache boxes, 110 IX ports, 170 customers) into the base and into this checkout and
times them in alternating turns, 15 runs each. It prints one table per environment:

- **Headless (jsdom):** our JavaScript. The most stable numbers for routing and simulation, but jsdom's
  DOM is about 30× slower than a browser's and it has no layout, so its panel and dashboard rows say
  little about what players feel.
- **Chromium, desktop** and **Chromium, phone** (`--browser`, `scripts/perf-browser.js`): the real DOM,
  layout and canvas. The phone is 390×844 at 3× pixel density with the CPU slowed down 4×, about a
  mid-range Android. Each version runs in its own browser. Use these rows for anything in the interface,
  and to catch forced layouts (reading `scrollTop`, `offsetHeight` and friends right after changing the
  DOM), which jsdom cannot see at all.
  Browsers leave layout and canvas drawing for the next frame, so each timed run ends by forcing both;
  without that, DOM and map work would look free. For the same reason, a profile that puts a lot of
  time on a line reading `scrollTop` is usually showing layout that has to happen anyway, not waste:
  check with the benchmark before "fixing" it.

Each table has these rows:

- Routing: `compute()`
- One game day: `dayTick()`
- An action: `after()`
- Side panel and left list
- NOC dashboard tabs
- Map at three zoom levels

and it says whether both versions route the save's traffic identically.

`--browser` needs Chromium: a local `playwright` with its browser works as is; otherwise
`playwright-core` (a dev dependency, installed by `npm ci`) drives the Chrome in `PERF_CHROME` or
`--chrome PATH`. CI uses the Chrome that ships with GitHub's Ubuntu runners.

Without `--base` it just times this checkout. `--runs N`, `--md FILE`, `--json FILE` and
`--summary FILE` are there for CI and for digging.

`--save FILE` swaps the fixture for another save, such as a laggy save from a bug report. Both a plain
save and a file from the in-game menu's Export save work:

```bash
npm run perf -- --save ~/Downloads/series-of-tubes-save.json --base /tmp/base.html
```

Routing speed-ups must also keep the two equivalence tests green: `tests/speed.test.js` (the fast
path against the same code with its shortcuts switched off) and `tests/routing-reference.test.js`
(the indexed exit choice against a plain scan of every exit, across preferences, RouteScript,
incidents and failures).

## Demonstrate

- **Every pull request**: the Performance workflow runs the same comparison and posts the table as a
  comment on the PR (updated on every push). Read it before merging. Locally, paste the table into
  the PR description or the commit summary you report.
- **Everything you hand back to Frederic** that touched `site/`: include the table, or at least the
  rows that moved, in your summary. Say plainly when something got slower.
- **Before a release**: compare the release against the previous tag
  (`git show v<last>:site/index.html > /tmp/base.html`) and mention notable changes.

## Read the table

- Shared machines (CI runners, cloud sandboxes) swing a single run by ±30% on identical code, and no
  timing method gets around it: CPU time is as noisy as wall time there. So a row only gets a verdict
  when it moved by 15% or more **and** the samples say it is real: p < 0.01 in a Mann–Whitney U test
  (`scripts/perf-stats.js`), and more than 2 ms (8 ms on the phone). Otherwise it shows ≈, whatever
  the percentage. The `p` column says how sure each row is.
- A big percentage with ≈ means "could be noise". If it matters for the change, run again (or with
  `--runs 25`) and report both runs; do not report a single noisy number as a finding.
- ⚠️ slower (15% or more) or 🔴 slower (50% or more) needs a reason in the PR, or a fix. A new
  feature may cost time; a refactor or a fix should not.
- "Routing results differ" is expected when a change is meant to change gameplay (new cities,
  balance, routing rules), and a bug when it only promises to be faster.
- Headless Chromium draws the canvas in software, real phones usually on the GPU, so map rows in the
  Chromium tables overstate drawing cost. For drawing changes, also look at the game on a phone.
- Absolute numbers depend on the machine. Compare base and head from the same run, never numbers
  from different runs or machines.

## Keeping the fixture useful

The save loads through `migrate()` like any player's save, so new state gets its defaults. Only
regenerate it (`node scripts/perf-fixture.js`, several minutes) when the save format changes in a
way old saves cannot load, or the game grows new heavy systems the save does not exercise. Say in
the commit that the baseline changed, because numbers before and after are no longer comparable.
