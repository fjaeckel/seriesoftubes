# ADR 0003: Translations are keyed by labels, not by English text

- Status: accepted
- Date: 2026-10-27

## Context

Until 1.34 the English text was the key: code said `tr('Delivery: 2 to 6 weeks')`, and every dictionary
repeated that English as its key, `"Delivery: 2 to 6 weeks":"Consegna: da 2 a 6 settimane"`. So each of
the ~2,900 strings existed four times (code, it, pt, fr), and more with every language. Fixing a typo in
English meant renaming the key in every dictionary in the same change, or every translation silently
fell back to English. Long sentences as keys made dictionary diffs hard to read and easy to conflict.

## Decision

- Code uses **labels**: `tr('pnis.delivery_2_to_6_weeks')`, `trn('save.n_pop', n)`, `N_('common.optics')`.
  A label is `area.words`: the area is where the text is used (`pnis`, `own_cable`, `page`, or `common`
  for text used in several places and short shared words), the words are a few of its first words.
- **English is a dictionary too**, `src/i18n/en.js`, in the same format as the translations. It is part of
  the page source: the build inlines it into the game script, so English players load nothing extra
  (see [ADR 0002](0002-one-page-assembled-at-build.md)). Translations stay static files,
  `site/i18n/<lang>.js`, loaded only for that language.
- **Plurals are one label** with `{"one": …, "other": …}` in every language: `trn('save.n_pop', n, vars)`.
- **Static markup** says `data-i18n="label"` (and `data-i18n-aria-label`, `data-i18n-title`) and keeps its
  English text, so the page still reads in English without JavaScript and for search engines. The checker
  makes sure that English matches `en.js`.
- At runtime, `DICT` is the English with the player's language laid over it: a missing translation shows
  the English, an unknown label shows itself (the checker makes sure there are none).

## Consequences

- **Changing English wording is one line** in `en.js`. If the meaning changes, give it a new label
  instead (`scripts/i18n-add.js --rename` moves one everywhere), so translators see it as new and the
  old translation does not linger with the wrong meaning.
- **`npm run i18n:check`** verifies that every label used in `src/` is defined in English, every
  English label is used, every translation keeps its English's placeholders, HTML tags and plural forms,
  and every dictionary is sorted.
- **Saves:** a few things in a save hold text to show later (sold-out reasons,
  attack names). New saves hold labels. Saves from before labels (1.34 and older) hold the English text; `tr()` maps it
  back to its label the first time it sees one, so old saves still show the player's language.
- **Translators** read `src/i18n/en.js` next to their file; both are sorted by the same labels, so the
  same line numbers line up.
- **The shipped page uses short ids, not labels.** Shipped as written, every label would be in the page
  twice (in the code and as a key of the inlined English): about 20% more page after compression. So
  the build (`scripts/lib/compile-labels.js`) gives every label a short id (`tr('1a')`) in the code, the
  markup and every dictionary. Labels passed to `N_()` keep their name in the shipped page, because the
  game stores those in saves and an id would mean something else in the next release. The checker
  rejects a label that is not the first argument of `tr()`/`trn()`/`N_()`, since the build cannot see it.
  `src/`, `npm run dev` and the tests all use the readable labels; `tests/pages.test.js` plays the
  shipped page in English, Italian and French.
- **Performance:** measured against 1.34 on the big-network save, routing, a game day, panels, the
  dashboard and the map are all unchanged, and boot time too. The page is about 4% bigger after
  compression (321 → 335 KB): the English moved from the code into its own dictionary, with an id each.
  The translation files are about 40% smaller (it.js 143 → 85 KB), so Italian, Portuguese and French
  players download less than before. `tr()` is still one property lookup.
- Branches from before this change are converted by `scripts/legacy/port-branch.js` like the rest of the
  split: their English-keyed calls and dictionaries get the same labels.
