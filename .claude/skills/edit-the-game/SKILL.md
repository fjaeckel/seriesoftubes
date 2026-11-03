---
name: edit-the-game
description: Find, change and add game code in Series of Tubes, which lives in many small files under src/ that the build joins into one page. Use for any feature, fix or refactor in the game itself (anything in src/).
---

# Editing the game

The game's source is `src/`. The build (`scripts/lib/page.js`) pastes the files together, in path order,
into one `index.html` with one inline `<style>` and one inline `<script>`. That is exactly what players
load, so splitting code across files costs nothing at runtime. Why it works this way:
[docs/adr/0002-one-page-assembled-at-build.md](../../../docs/adr/0002-one-page-assembled-at-build.md).

```
src/index.html            the shell: <head>, static markup, `<!-- @include styles -->`, `<!-- @include game -->`
src/styles/NN-*.css        CSS, in order (phones last)
src/game/NN-area/NN-*.js   the game script, in order (see the map in docs/ARCHITECTURE.md)
site/                      static files copied as they are (dictionaries, icons, service worker)
```

## Find the code

Search by name, not by line: `grep -rn "function compute(" src/game`. Folder names say what lives
there: `10-catalog` prices and gear, `20-world` cities and cables, `30-networks` other ASes,
`70-rules` peering and market rules, `80-simulation` routing and the save gate, `85-incidents`,
`88-days` the daily tick, `90-actions` every player action, `93-ui` HUD and panels, `94-dashboard`,
`95-modals`, `96-map` the canvas. `docs/ARCHITECTURE.md` has the full table.

## Run it

```bash
npm run dev        # http://localhost:8080, assembled on every request, reloads on save
npm test           # all suites (assembles src/ in memory; no build needed)
npm test -- tests/peering.test.js    # one suite
```

A browser error points at a line of the assembled page; the dev server prints the `src/` file and line
next to it. `npm run page -- -o /tmp/page.html` writes the assembled page if you want to look at it.

## Where new code goes

- **A new feature or system:** its own file in the folder of its topic, e.g.
  `src/game/70-rules/85-route-servers.js`. Pick a number between its neighbours; gaps are there for this.
  Small files that own one topic are what keep pull requests from conflicting.
- **Order matters at the top level.** Files run in path order. Top-level `const`/`let` values and
  top-level statements may only use top-level values from earlier files. Functions are fine anywhere:
  everything is one script, so function declarations are hoisted and are all defined by the time
  anything runs after boot. When in doubt, put constants in an earlier file and logic in functions.
- **Actions:** add `name:(args)=>{…},` to the matching `src/game/90-actions/*.js`. Only
  `10-interface.js` declares `const ACT={`; the others are `Object.assign(ACT,{ … });`. A new area can get
  a new `NN-area.js` file of that second form. The MCP server types every action: a new one also gets
  an entry in `scripts/lib/mcp-commands.js` (a game command with its argument domains, a view, a draft
  or a session action) or in the server's `DENY` list in `scripts/lib/mcp-page.js`;
  `tests/mcp-commands.test.js` fails until it has one.
- **Panels and modals:** `93-ui/` (HUD, side panels), `94-dashboard/` (NOC dashboard, bank), `95-modals/`.
- **Styles:** the matching `src/styles/*.css`; phone rules go in `60-phone.css`.
- **Data tables** (cities, cables, networks): one entry per line, and keep id-keyed objects such as
  `CITY_LL` sorted by id, so two people adding cities touch different lines.
- **Static markup** goes in `src/index.html`; it is short and rarely changes.
- **Files that ship as they are** (icons, dictionaries, `sw.js`, `robots.txt`) live in `site/`.
  `site/index.html` must not exist; the build refuses it.

Every partial ends with a newline and must not contain `</script>` or `</style>` at the start of a line.
File names are `NN-lower-case.js` / `.css`; `tests/build.test.js` checks both.

## Still the same rules

Everything in CLAUDE.md applies unchanged: translate every string (`add-strings`), sanitize saves,
phones first, a test with every change (`write-tests`), performance shown against `main`
(`performance`), hosting on GitHub Pages only (`github-pages`), a CHANGELOG bullet for players.
The CHANGELOG is the one file every change touches; a conflict there is expected: keep both bullets.
