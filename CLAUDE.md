# Series of Tubes: notes for Claude

A free cartoon browser game about how the internet works, live at
https://seriesoftub.es, hosted on GitHub Pages. The game is one static page with no framework.
Its source is many small files in `src/` (`src/styles/*.css`, `src/game/**/*.js`, the shell
`src/index.html`); the build pastes them together, in path order, into a single `index.html`, the
same one-file page players have always loaded. Static files (dictionaries, icons, service worker)
live in `site/`.

Read these before larger changes:

- `docs/ARCHITECTURE.md`: where the code is, and how a day of simulation runs.
- `docs/adr/`: decisions that are settled (GitHub Pages only; one page assembled at build).
- `.claude/skills/`: step-by-step procedures (`edit-the-game`, `github-pages`, release,
  translations, tests, performance).
- `.claude/skills/gameplay-rules/`: the game's design rules (W1, N3, F2…), each enforced by
  `tests/gameplay-rules.test.js`; run it before changing cities, networks, cables, modes or balance.

## Commands

```bash
npm ci                       # once: installs jsdom for the tests
npm run dev                  # play while developing: http://localhost:8080, reloads on save
npm test                     # node:test + jsdom, every tests/*.test.js, must stay green
node scripts/i18n-check.js   # must report "0 missing, 0 unused, 0 broken" (and sorted dictionaries)
node scripts/i18n-add.js FILE.json   # add/change/remove translations (see `add-strings`)
npm run build                # builds _site/ for GitHub Pages (assembles src/, stamps version, bakes release notes)
npm run serve                # build and serve the production site locally
npm run perf -- --base-ref origin/main             # big-network benchmark vs main (see `performance`)
npm run perf -- --base-ref origin/main --browser   # the same, also in real Chromium (desktop and phone)
```

## Hard rules

- **GitHub Pages, always.** The game is hosted on GitHub Pages and nowhere else. This is not up
  for discussion: never propose or prepare another host, a CDN in front, a backend, server-side
  rendering, redirects or custom headers. The build output stays plain static files from one
  origin. If a feature seems to need a server, redesign the feature. See the `github-pages` skill
  and `docs/adr/0001-github-pages-only.md`.
- **No runtime cost for structure.** The page ships as one assembled `index.html`. Organise code
  into files under `src/` freely (build time is cheap), but never in a way that adds requests or
  work to page load or to the game loop.
- **Git:** work on `main`, no branches. Commits are authored and committed as
  `Frederic Jung <frederic@jc-ix.net>`. Never add `Co-Authored-By`, `Claude-Session`
  or any other attribution trailers.
- **Releases only when Frederic says so.** Never bump the version on your own: push finished
  work with its CHANGELOG bullets under `## [Unreleased]` and say it is ready. When he asks
  for a release, follow the `release` skill: small fixes get a patch (`x.y.Z`), features a
  minor, at most one release per hour. Docs, skills, CI, tests and refactors never need one.
- **Release notes in the app are short**: only the first sentence of each CHANGELOG bullet
  (and at most five bullets) shows in "What's new", with a link to the full GitHub
  release. Write that first sentence so it stands on its own.
- **Names are puns.** No real company names for networks, vendors, cables, banks,
  data centers or exchanges (Cogentle, Goggle, NetChill, Junipurr, Arrrhipster…).
  Real conference names (NANOG, RIPE, DENOG) are fine. Avoid lazy "-ish" names: find
  a real pun, or keep the plain word.
- **Easter eggs stay secret.** Never mention hidden jokes or easter eggs (for example
  whatever `elephant()` does) in commit messages, release notes or the CHANGELOG.
- **Every player-facing string is translated, by label.** Code uses `tr('area.label')`,
  `trn('area.label', n)` or `N_('area.label')` (anything stored in a save: `N_()`), never English text.
  Add the English (`src/i18n/en.js`) and every translation (`site/i18n/*.js`) in the same change with
  `scripts/i18n-add.js` (see `add-strings`).
- **Phones first.** About 70% of players are on phones. Every new panel, button and
  modal must work at 360 px wide, in portrait and landscape, using the phone tab bar
  and bottom sheets. Check `isPhone()` layouts, not just desktop.
- **Saves are sacred.** Old saves must keep loading. Any new state field gets a default
  in `newGame()` and a check/repair in `sanitize()`; renamed fields are migrated there.
- **Performance is always demonstrated.** Every change to `src/` or `site/` is measured on the big-network
  fixture against `main` (`npm run perf -- --base-ref origin/main`, see the `performance` skill),
  and the numbers go into the PR and into your summary. Every PR also gets them as a comment from
  CI. Anything slower needs a reason or a fix.
- **Tests come with features.** Add or extend a test in `tests/` for every feature or
  fix (a new feature gets its own `tests/<feature>.test.js`). Tests are seeded, so they must not
  depend on luck.
- **CHANGELOG style:** plain English, written for players, one bullet per change,
  issue numbers in parentheses like `(#37)`. No internal names, no jokes explained. The CHANGELOG
  is the one file every change touches; conflicts there are expected (keep both bullets).

## Style of the code

- Dense JavaScript in small topic files under `src/game/` (see `edit-the-game`): a new feature gets
  its own `NN-name.js` in the folder of its topic, actions go in the matching
  `src/game/90-actions/*.js`. All files share one top-level scope; top-level values may only use
  top-level values from earlier files. Match the surrounding style: short helper names, arrow
  functions, template-literal HTML, no new dependencies.
- Lists people add to (cities, cables, networks, dictionaries) are one entry per line; id-keyed
  objects and dictionaries stay sorted, so additions do not collide.
- UI is rebuilt from state: change `S`, then call `after()` (recompute, check goals,
  re-render, save). Buttons are `btn(label, actName, args, cls, disabled)`, which
  dispatch to `ACT[actName](args)` through `data-act`/`data-args`.
- Never trust saved or imported state: anything read from `S` that came from a save
  must already have been validated in `sanitize()`.
- Keep comments short and about *why*.

## Tone

Friendly, nerdy and accurate underneath the jokes. Mechanics should follow how
networks really work (95th-percentile billing, peering policies, LAGs, DWDM reach,
route leaks, RPKI) and then exaggerate for fun. When unsure how something works in
real life, look it up before modelling it.
