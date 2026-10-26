# Contributing to Series of Tubes

Thanks for wanting to help build the cartoon internet. Bug reports, ideas, puns,
translations and code are all welcome.

## Reporting bugs and ideas

Open an issue on GitHub and pick the form that fits: bug report, feature request,
balance or realism, or translation. Blank issues are turned off so every report has
what we need to triage it. For bugs, an export of your save (menu → Export save)
lets us load your exact network. One topic per issue, please.

Ideas are best when they say what happens in real networks and how that could become
a fun mechanic.

Not sure yet whether something is a bug or an idea worth an issue? Ask in the
[Signal group](https://signal.group/#CjQKIJwvEt5fYt1pvw7J2pV664CyUyGJXmAJLV8ia3nUdAD7EhA_FzdxflEzkNmcvDHdVgLQ) first. Other players and the maintainer hang out there.

## Development

The game is one static page, `site/index.html`, with no framework and no build step
while developing.

```bash
npm ci                       # installs jsdom for the tests
npm run serve                # builds and serves the game locally
npm test                     # all tests must pass
node scripts/i18n-check.js   # translations must be complete
```

Opening `site/index.html` directly in a browser also works.

A tour of the code is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Pull requests

- Keep pull requests small: one small feature or one fix each, targeting `main`.
  Every pull request must be reviewable by a human in one sitting. Large drops,
  sweeping rewrites or many unrelated changes in one PR will be asked to be split up,
  and that applies just as much to AI-generated code.
- Add or update a test in `tests/` for every feature or fix. Tests are seeded and
  must not depend on luck.
- Add a bullet for players under `## [Unreleased]` in `CHANGELOG.md`, in plain English.
  Releases are cut by the maintainer.
- Show the performance of changes to `site/` on a big network. The Performance check posts a table
  comparing your PR with `main` as a comment; to run it yourself:
  `git show origin/main:site/index.html > /tmp/base.html && npm run perf -- --base /tmp/base.html`
  (add `--browser` to also time it in Chromium as a desktop and a phone, like CI does).
  Anything marked slower needs an explanation.
- Old saves must keep loading. New state needs a default for new games and a check in
  `sanitize()`.
- Check your change on a phone-sized screen (about 360 px wide). Most players are on
  phones.

## House rules for content

- **Every name is a pun.** No real company names for networks, vendors, cables, banks,
  data centers or exchanges. Real conference names (NANOG, RIPE, DENOG…) are fine.
  Please don't use lazy "-ish" names; find a proper pun or use a plain word.
- **Accurate underneath the jokes.** Mechanics should be recognisable to a network
  engineer: exaggerated, not invented.
- **Friendly humour.** Punch at technology, bureaucracy and ourselves, not at people.

## Translations

Every player-facing string goes through `tr()`, `trn()` or `N_()`. Dictionaries live
in `site/i18n/` (English text → translation). To add a language, copy `it.js`, translate
the values, register the language in the language list in `site/index.html`, and run
`node scripts/i18n-check.js <lang>` until it reports nothing missing, unused or broken. The CI job "translations" runs the same check on every pull request, shows each language's coverage in the run summary, and also fails if a new language is not added to the language list or to the offline cache in `site/sw.js`.

Language pull requests must be reviewed by a human who speaks the language, and
checked in the game itself, not only in the dictionary file. Passing the checker is
not enough. The reviewer plays with the language switched on and looks for anything
that got worse:

- text overflowing buttons, panels or toasts, especially on phones
- truncated or broken layouts, missing placeholders, raw `{name}` or HTML showing
- awkward or machine-sounding phrasing, wrong networking terms
- puns and jokes that no longer land

Note in the pull request what you checked and on which screen sizes.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
