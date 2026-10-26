# Series of Tubes: notes for Claude

A free cartoon browser game about how the internet works, live at
https://seriesoftub.es. The whole game is one static page: `site/index.html`
(HTML, CSS and JS in one file, no framework, no build step for development).

Read these before larger changes:

- `docs/ARCHITECTURE.md`: how the code is laid out and how a day of simulation runs.
- `.claude/skills/`: step-by-step procedures (release, translations, tests).

## Commands

```bash
npm ci                       # once: installs jsdom for the tests
npm test                     # node:test + jsdom, all suites, must stay green
node scripts/i18n-check.js   # must report "0 missing, 0 unused, 0 broken"
npm run build                # builds _site/ (stamps version, bakes release notes)
npm run serve                # build and serve locally
npm run perf -- --base /tmp/base.html   # big-network benchmark vs another version (see `performance`)
npm run perf -- --base /tmp/base.html --browser   # the same, also in real Chromium (desktop and phone)
```

To play during development, open `site/index.html` directly or run `npm run serve`.

## Hard rules

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
- **Every player-facing string is translated.** Wrap it in `tr()`, `trn()` or `N_()`
  and add the Italian to `site/i18n/it.js` in the same change (see `add-strings`).
- **Phones first.** About 70% of players are on phones. Every new panel, button and
  modal must work at 360 px wide, in portrait and landscape, using the phone tab bar
  and bottom sheets. Check `isPhone()` layouts, not just desktop.
- **Saves are sacred.** Old saves must keep loading. Any new state field gets a default
  in `newGame()` and a check/repair in `sanitize()`; renamed fields are migrated there.
- **Performance is always demonstrated.** Every change to `site/` is measured on the big-network
  fixture against `main` (`npm run perf -- --base /tmp/base.html`, see the `performance` skill),
  and the numbers go into the PR and into your summary. Every PR also gets them as a comment from
  CI. Anything slower needs a reason or a fix.
- **Tests come with features.** Add or extend a test in `tests/` for every feature or
  fix. Tests are seeded, so they must not depend on luck.
- **CHANGELOG style:** plain English, written for players, one bullet per change,
  issue numbers in parentheses like `(#37)`. No internal names, no jokes explained.

## Style of the code

- Dense, single-file JavaScript. Match the surrounding style: short helper names,
  arrow functions, template-literal HTML, no new dependencies.
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
