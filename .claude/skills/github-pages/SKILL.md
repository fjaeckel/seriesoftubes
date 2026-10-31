---
name: github-pages
description: Series of Tubes is hosted on GitHub Pages and nowhere else, non-negotiably. Use before any change to hosting, deploys, the build output, caching, the service worker, new runtime requests or anything that would need a server, and whenever someone suggests another host.
---

# GitHub Pages, always

Series of Tubes is served by GitHub Pages at https://seriesoftub.es and **only** there. This is settled
([docs/adr/0001-github-pages-only.md](../../../docs/adr/0001-github-pages-only.md)) and not up for
discussion: do not propose, prepare or "keep the door open" for another host, a CDN in front, a
backend or server-side rendering, even when asked to evaluate options. If a feature seems to need
one, redesign the feature.

## What that means for a change

- **The output is static files.** `npm run build` writes `_site/`: the assembled page, `site/`'s files,
  `version.json`. No server code, no runtime secrets: everything there is public.
- **No HTTP headers, redirects or rewrites.** Pages ignores `_headers`, `_redirects`, `.htaccess`,
  `vercel.json`, `netlify.toml`. Need a policy? Use a `<meta>` tag. Need a different URL? Add a
  static file there.
- **Caching is Pages' (short, the same for every file) plus the service worker's.** Offline play and
  updates are `site/sw.js`'s job; its cache name carries the version. When you add a file the game
  needs offline, add it to `CORE` there.
- **Same origin.** The page, dictionaries, icons and data come from seriesoftub.es. Do not add CDN
  libraries or third-party APIs the game needs to work; the web fonts and the analytics counter are
  the only exceptions and the game runs without them.
- **More files are fine, from the same origin.** Pages serves many small files well over HTTP/2.
  Still: the game page itself stays one assembled `index.html` (see
  [ADR 0002](../../../docs/adr/0002-one-page-assembled-at-build.md)), and anything the first frame
  needs must not add a round trip.
- **Limits:** about 1 GB for the whole site, 100 MB per file.
- **Paths:** the site lives at the domain root (`site/CNAME`), so `/` paths are fine; unknown paths get
  `404.html`.

## How it deploys

Only releases deploy. Bumping `version` in `package.json` on `main` runs `auto-release.yml`, which tags,
publishes the GitHub release and starts `release.yml`: test, `REQUIRE_NOTES=1 npm run build`,
`actions/upload-pages-artifact` with `./_site`, `actions/deploy-pages`. That job is the only one with
`pages: write`. Pushes to `main` and pull requests build but never deploy. The `release` skill has the
steps.

**The one exception: the weekly puzzle.** Every Sunday at 03:37 UTC `weekly-puzzle.yml` commits the new
`site/puzzles/weekly/<key>.json` to `main` (data only, no version bump) and starts `release.yml` for the **live
release tag** with `weekly=true`. That run rebuilds exactly the live release, with every weekly file from `main`
added, checks them with `scripts/weekly-puzzle.js --check`, and deploys it in the same `pages` concurrency group.
Players get no update banner (the version does not change). Every release build also copies all weekly files from
`main`, so a release never drops a published week, and regenerates (in the build, deterministically) any week
not over yet that the release's prices no longer fit. Weekly files are plain JSON the game fetches only when the
Puzzles list opens and never trusts; the service worker serves them network-first. The weekly scenario rides along in
the same run: `scripts/weekly-scenario.js` writes `site/scenarios/weekly/<key>.json` (fetched when the Scenarios list
opens), committed and deployed with the puzzle, never by a second workflow. See `docs/ARCHITECTURE.md`.

## Before you hand back a change that touches the build, deploy or loading

```bash
npm run build && npm run serve      # the production build, served as static files
npm test -- tests/pages.test.js     # static-only, all references resolve, Pages-only deploy
```

`tests/pages.test.js` fails on host configuration files, files over the limits, local references
that do not exist in `_site/`, scripts loaded from other origins, and any workflow that deploys
anywhere else. Do not weaken it to make a change pass; change the change.
