---
name: release
description: Cut and ship a Series of Tubes release (patch or minor) from main via the auto-release workflow.
---

# Releasing Series of Tubes

Bumping `version` in `package.json` on `main` is the release button. The
`auto-release.yml` workflow tests, tags `v<version>`, publishes a GitHub release with
that version's CHANGELOG section as notes, and dispatches `release.yml`, which deploys
to GitHub Pages (https://seriesoftub.es).

## Only release when Frederic says so

Never bump the version on your own. Finished work is committed and pushed with its
bullets under `## [Unreleased]`, and you say it is ready to ship. A release happens only
when Frederic explicitly asks for one ("release", "ship it"), and then it includes
everything under `## [Unreleased]`. Docs, skills, CI, issue templates, tests and
refactors are just pushed and never need a release.

## At most one release per hour

Players get an update banner and a "What's new" window for every release, so ship at
most one release an hour. Before bumping, check when the last one went out:

```bash
gh api repos/fjaeckel/seriesoftubes/releases/latest --jq '.tag_name+" "+.published_at'
```

- **Less than 60 minutes ago:** even when asked, say so and suggest waiting until the hour
  is up; release only if Frederic still wants it now.
- **60 minutes or more:** release everything under `## [Unreleased]` together, as one
  version.
- **Live game broken for players** (it won't start, saves are lost, a phone can't get
  past a screen): tell Frederic right away and propose a hotfix release; still wait for
  his go.

## Pick the version

- Several changes batched together: use the biggest one (any feature → minor).
- Patch (`x.y.Z`): fixes, small tweaks, wording, icons.
- Minor (`x.Y.0`): new features or content.

## Steps

1. Make sure `main` is green: `npm test` and `node scripts/i18n-check.js`
   ("0 missing, 0 unused, 0 broken").
2. In `CHANGELOG.md`, move the bullets from `## [Unreleased]` into a new section
   right below it: `## [x.y.z] — YYYY-MM-DD` (em dash, today's date). Keep an empty
   `## [Unreleased]` heading above it. The build fails if the section has no bullets.
3. Bump the version in **both** files:
   - `package.json` → `"version"`
   - `package-lock.json` → top-level `"version"` and `packages[""].version`
4. `npm test` once more.
   Then compare performance with the previous release and mention anything notable to Frederic:
   `git show v<last>:site/index.html > /tmp/base.html && npm run perf -- --base /tmp/base.html`.
5. Commit on `main` as Frederic, with no attribution trailers:
   ```bash
   git -c user.name="Frederic Jung" -c user.email="frederic@jc-ix.net" commit \
     --author="Frederic Jung <frederic@jc-ix.net>" -m "Short summary (x.y.z)"
   git push origin main
   ```
6. Watch the workflows until both finish:
   ```bash
   gh run list --repo fjaeckel/seriesoftubes --limit 4
   gh run watch <id> --repo fjaeckel/seriesoftubes
   ```
7. Confirm it is live: `https://seriesoftub.es/version.json` shows the new version.

## Release notes rules

- The first sentence of each bullet is all the in-app "What's new" shows (at most five
  bullets; longer notes get a link to the full GitHub release). Make that sentence
  stand on its own: "Tier 1 networks can lay their own subsea cable (#22)." Detail goes
  after it.
- Written for players, in plain English. One bullet per change, issue numbers like `(#37)`.
- Never mention hidden easter eggs or explain jokes.
- No internal function names.

## If something fails

- "not newer than the latest release": the version was not bumped, or was bumped
  backwards.
- "CHANGELOG.md has no notes under ## [x.y.z]": the heading doesn't match the version
  exactly or has no bullets.
- Tests fail in the workflow but pass locally: look for unseeded randomness in a test.
- Fix forward with a new patch version; never move or delete an existing tag.
