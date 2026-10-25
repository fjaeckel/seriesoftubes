---
name: add-strings
description: Add or change player-facing text in Series of Tubes and keep every translation (site/i18n/*.js) complete.
---

# Adding or changing player-facing text

The English text is the translation key. Every string a player can see must go
through the translation helpers and have an entry in every dictionary in `site/i18n/`
(currently `it.js`, Italian).

## In the code

- `tr('Text with {name}', {name})`: translate now and fill placeholders.
- `trn('{n} router', '{n} routers', n, vars)`: plurals; both forms are keys.
- `N_('Text')`: marks a literal kept in a table for later `tr()` (e.g. labels stored in
  constants). Call `tr(x)` where it's shown.
- Static HTML: add `data-i18n` to the element; `aria-label` and `title` attributes are
  collected automatically.
- Text must be a string literal inside the call, or the checker can't see it.
- Keep HTML (`<b>`, `<br>`, `<small>`) and `{placeholders}` identical in translations.
- Don't build sentences by concatenating translated fragments; translate whole sentences.

## In the dictionary

`site/i18n/it.js` is one object, `"English": "Italiano",` per line, ending with `};`.
Append new entries before the closing `};`. A small script avoids quoting mistakes:

```python
import json
it = {"New English text": "Nuovo testo italiano"}
q = 'site/i18n/it.js'; t = open(q).read().rstrip()
assert t.endswith('};')
t = t[:-2] + ''.join(json.dumps(k, ensure_ascii=False) + ':' + json.dumps(v, ensure_ascii=False) + ',\n'
                     for k, v in it.items() if json.dumps(k, ensure_ascii=False) + ':' not in t) + '};\n'
open(q, 'w').write(t)
```

When you **change** English text, rename the key in every dictionary too; when you
remove text, delete its entry.

## Italian style

Natural, friendly Italian, informal "tu". Keep networking terms that Italian engineers
use in English (peering, transit, router, POP, PNI, LAG, dark fiber). Translate puns
into an Italian joke when one fits; otherwise keep the pun name and translate the rest.

## Check

```bash
node scripts/i18n-check.js   # must say: 0 missing, 0 unused, 0 broken
npm test                     # includes tests/i18n.test.js
```
