# ADR 0004: Development-only code, assembled into the development page only

- Status: accepted
- Date: 2026-11-03

## Context

The MCP server (`npm run mcp`, [MCP.md](../MCP.md)) plays the game through a facade of typed commands, reads and
screens. That facade has to run inside the game page, in its top-level scope: it reads `S`, `R`, `ACT` and the
catalogs directly, and a page in the player's own browser can only run code it was served (nothing may be sent to
it as code). So it belongs in `src/`, next to the game.

But it is about 110 KB of JavaScript (some 40 KB gzipped) that no player can use: seriesoftub.es has no way to
reach it. Shipping it would make every player, most of them on phones, download and parse it on every load,
against the rule that structure costs nothing at runtime ([ADR 0002](0002-one-page-assembled-at-build.md)).

## Decision

- Code only tools use lives in `src/agent/` (and later folders like it), named and ordered like `src/game/`.
- `src/index.html` includes it with `<!-- @include-dev agent -->`, right after `<!-- @include game -->`, inside the
  same script, so it shares the game's top-level scope.
- `scripts/lib/page.js` expands an `@include-dev` line only when asked (`assemble({ dev: true })`, `--source --dev`).
  Otherwise the line is dropped whole, so the page players get is byte for byte what it would be without the
  feature.
- The **development page** (with `src/agent/`) is what `npm run dev` serves, what the MCP server loads and what
  `i18n-check` reads. The **players' page** (without it) is what `npm run build` and `npm run serve` ship, what
  `npm run perf` measures and what the tests load unless a test asks for `load({ agent: true })`.

## Rules that come with it

- **The game never names agent code.** Nothing in `src/game/`, `src/styles/` or `src/index.html` may refer to
  anything `src/agent/` defines: it would work in development and break for players. Every top-level name in
  `src/agent/` starts with `api` or `API_` (the facade itself is `window.TUBES`), and `tests/build.test.js` fails on
  any use of those names outside `src/agent/`.
- **Agent code runs after the game.** Its files come after `99-loop.js`, so its top level may use anything the game
  defines, and must not assume `boot()` has or has not run yet. In practice it only defines tables and functions.
- **Tests load the players' page by default.** So a core change that quietly leans on agent code fails the suite
  instead of the release. `tests/pages.test.js` checks that the built page carries no agent code and still plays.

## Consequences

- Players pay nothing for the facade: the build is unchanged by it, and the performance benchmark measures exactly
  what ships.
- `npm run serve` stays what it says: the built site as GitHub Pages serves it, without the agent.
- The development page and the players' page differ, by design and only by what `@include-dev` adds. Anything that
  must behave like production (perf, the release build test) uses the players' page.
