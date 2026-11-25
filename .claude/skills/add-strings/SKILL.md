---
name: add-strings
description: Add or change player-facing text in Series of Tubes: labels in the code, English in src/i18n/en.js, and every translation (site/i18n/*.js) kept complete.
---

# Adding or changing player-facing text

Text is keyed by **label** ([docs/adr/0003-translations-by-label.md](../../../docs/adr/0003-translations-by-label.md)).
The code says `tr('pnis.delivery_2_to_6_weeks')`; the English is in `src/i18n/en.js`; Italian, Portuguese
and French are `site/i18n/it.js`, `pt.js`, `fr.js`. Every label the code uses needs English, and every
language needs every label.

## In the code

- `tr('area.label', {name})`: translate now and fill `{placeholders}`.
- `trn('area.label', n, vars)`: plurals. One label, whose entries are `{"one": "…", "other": "…"}`;
  `{n}` is filled in for you.
- `N_('area.label')`: a label kept in a table or a save and translated where it is shown with
  `tr(x)`. Anything stored in `S` must be an `N_()` label (or an index), never translated text and never
  a label written any other way: the build shortens every label it sees in `tr()`/`trn()` to an id that
  changes between releases, and keeps the `N_()` ones whole.
- The label is always a string literal, the first argument of `tr`/`trn`/`N_`. A label anywhere else
  (`const x='pnis.ready'`) is an error in `npm run i18n:check`.
- Static HTML in `src/index.html`: `data-i18n="area.label"` on the element, with its English inside it;
  `data-i18n-aria-label="…"` and `data-i18n-title="…"` next to those attributes.
- Keep HTML (`<b>`, `<br>`, `<small>`) and `{placeholders}` identical in every language.
- Don't build sentences from translated fragments; translate whole sentences.

## Naming a label

`area.some_words`: the area is the file or topic it is shown in (`pnis`, `own_cable`, `dashboard`,
`page` for the static markup), or `common` for text used all over and short everyday words
(`common.close`, `common.customers`). The words are the first few words of the English, lower case,
`_` between them: `pnis.ready_in_about_n_days`. Labels are only for finding things; players never see
them. Reuse an existing label when the text and the meaning are the same (`grep -n '"Close"' src/i18n/en.js`).

## In the dictionaries

Every dictionary is one entry per line, **sorted by label**, so new text from different pull requests
lands on different lines. Don't edit them by hand; the script writes English and translations together:

```bash
cat > /tmp/strings.json <<'JSON'
{
  "en": { "pnis.ready_in_about_n_days": "Ready in about {n} days",
          "save.n_pop": { "one": "{n} POP", "other": "{n} POPs" } },
  "it": { "pnis.ready_in_about_n_days": "Pronto tra circa {n} giorni",
          "save.n_pop": { "one": "{n} POP", "other": "{n} POP" } },
  "pt": { "pnis.ready_in_about_n_days": "Pronto em cerca de {n} dias" },
  "fr": { "pnis.ready_in_about_n_days": "Prêt dans environ {n} jours" }
}
JSON
node scripts/i18n-add.js /tmp/strings.json          # a string or {one, other} sets an entry, null removes it
node scripts/i18n-add.js --rename old.label new.label   # in every dictionary and everywhere in src/
```

- **Changing English wording** (a typo, a clearer phrase, same meaning): change only the English. The
  translations stay right.
- **Changing the meaning**: give the text a new label (`--rename`, then update the English and every
  translation), so no language keeps a translation that now says something else.
- **Removing text**: `null` under `"en"` removes the label from every dictionary.

`npm run i18n:fix` re-sorts a dictionary that got out of order (a hand edit, a merge).

## Italian style

Natural, friendly Italian, informal "tu". Keep networking terms that Italian engineers
use in English (peering, transit, router, POP, PNI, LAG, dark fiber). Translate puns
into an Italian joke when one fits; otherwise keep the pun name and translate the rest.

## German style

Natural, friendly German, informal "du". Networking terms that German engineers say in English stay
English (Peering, Transit, Dark Fiber, Wave, Port, Router, POP, IX, Exchange, Backbone, Link, Traffic,
Route Server, Line System, LAG, PNI, Fabric, Scrubbing), but plain "fiber" is "Glasfaser",
"fiber pair" is "Faserpaar" and "eyeballs" are always "Privatkunden". "/mo" is "/Monat", "{n}d" is
"{n} T.", money keeps the game's `$100k` style, quotes are „…“. Translate puns into a German joke
when one fits; otherwise keep the pun name.

## Japanese style

Friendly polite です・ます in sentences; buttons and short labels are nouns or dictionary-form verbs (閉じる, 設定).
Networking terms in katakana as Japanese engineers say them (ピアリング, トランジット, ダークファイバー, バックボーン,
ルーター, ポート, 波長 for waves, 管路 for trenches); acronyms (POP, IX, PNI, LAG, BGP, DDoS) and pun names (Cogentle,
Goggle) stay in Latin letters. "Eyeballs" are 個人ユーザー, "/mo" is "/月", "{n}d" is "{n}日", months are 1月…12月.
Sentences use 。、「」 and full-width ：（）！？. Peering policies are オープン / セレクティブ / クローズド / リストリクティブ / ペイド.
Avoid あなた. Count with a counter that works past 9 (か所, 個, 本, 社), not つ.

## Korean style

Friendly polite 해요체 in sentences; buttons and short labels are nouns (닫기, 취소, 설정). Networking terms as Korean
engineers say them (피어링, 트랜짓, 다크 파이버, 백본, 라우터, 포트, 파장 for waves, 관로 for trenches); plain "fiber" is
광섬유. Acronyms and pun names stay in Latin letters. "Eyeballs" are 개인 사용자, "/mo" is "/월", "{n}d" is "{n}일",
months are 1월…12월. Avoid 당신. Peering policies are 개방형 / 선별형 / 폐쇄형 / 제한형 / 유료형. A name before a particle
can end in a vowel or not, so prefer forms that work for both (이(가), 씨:, 의).

## Japanese and Korean: fitting and safety

Kanji, kana and hangul are about twice as wide as Latin letters, so a short label has half the characters: check
the phone's top bar and tab bar at 360 px (each tab is about 56 px) after changing one. Watch for unintended
readings: sexual or vulgar slang in katakana or sound-alikes in hangul (e.g. 씹, 새끼, チンチン, アッー), war imagery
in jokes (電撃戦, 急降下爆撃, 핵), disasters (メルトダウン, 3.11), and Japan–Korea naming (ko 동해 never 일본해; 북한 / 北朝鮮).

## Check

```bash
node scripts/i18n-check.js   # en.js: 0 problems; each language: 0 missing, 0 unused, 0 broken
npm test                     # includes tests/i18n.test.js (every screen in every language) and the shipped page
```
