# ADR 0001: Series of Tubes is hosted on GitHub Pages, and only there

- Status: accepted, not open for renegotiation
- Date: 2026-10-27
- Decided by: Frederic Jung

## Decision

The game is served by **GitHub Pages**, from the custom domain in `site/CNAME`
(https://seriesoftub.es). That is the only hosting. There is no second host, no fallback host and no
plan to move.

Every change has to keep working there. A change that only works with a server, a different host,
a CDN in front, edge functions, rewrites or custom response headers is the wrong design for this
project, however good it is otherwise. Change the design, not the host.

## What GitHub Pages gives us, and what it does not

| We can rely on | We cannot have |
| --- | --- |
| Static files over HTTPS from one origin, with gzip | Any server code: no API routes, no SSR, no PHP, no edge or serverless functions |
| The deploy in `release.yml` (`actions/upload-pages-artifact` + `actions/deploy-pages`) | Custom HTTP headers (`Cache-Control`, CSP, COOP/COEP): use `<meta>` tags or do without |
| `404.html` for unknown paths | Redirect or rewrite rules (`_redirects`, `.htaccess`, `vercel.json`, `netlify.toml`) |
| `CNAME` for the domain | Per-file caching rules: Pages sets its own short cache lifetime for everything |
| A size limit of about 1 GB for the site and 100 MB per file | Secrets at runtime: everything in `_site/` is public |

Anything that needs data at runtime fetches it from the same origin as a static file
(`version.json`), from the player's own browser (`localStorage`), or not at all.

## Consequences

- **The build is the place for work.** Anything clever (assembling the page from `src/`, stamping the
  version, baking release notes) happens in `scripts/build.js`, at build time, in GitHub Actions.
  The build may get slower; what it produces must stay plain static files. See
  [ADR 0002](0002-one-page-assembled-at-build.md).
- **Same origin for everything the game loads.** The page, the dictionaries, icons and the service
  worker all come from seriesoftub.es. The only cross-origin requests are the web fonts and the
  privacy-friendly analytics counter (its script and its endpoint), and the game works without both.
  Don't add more: no CDN-hosted libraries, no third-party APIs the game depends on.
- **The service worker is the cache policy.** Since Pages decides HTTP caching, `site/sw.js` decides
  what is cached for offline play, versioned by the release.
- **Deploys only come from releases.** `release.yml` is the only workflow with `pages: write`. Pushes to
  `main` never deploy.
- **Tools are not hosting.** `npm run dev`, the MCP server and the container image that packages them
  (`docker/`, published to GHCR for releases) are tools. What someone serves with them is theirs; seriesoftub.es is
  the game, and nothing is ever deployed anywhere but GitHub Pages.
- **Tests guard it.** `tests/pages.test.js` checks that a build is plain static files that GitHub
  Pages can serve as they are: no server or host configuration files, every local reference resolving
  inside `_site/`, nothing over the size limits, `CNAME` and `404.html` in place, and the deploy going
  through the official Pages actions.

## Proposals that are out of scope

Moving to Netlify, Vercel, Cloudflare Pages or a VPS; putting a CDN or proxy in front; adding a
backend for accounts, leaderboards or cloud saves; server-side rendering. Features in that direction
must be built from static files and the browser (for example, an exported save file instead of a cloud
save), or not at all.
