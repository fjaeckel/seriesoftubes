# Series of Tubes

**Build the internet, one tube at a time.** A free cartoon browser game about how
the internet really works. Play it at **[seriesoftub.es](https://seriesoftub.es)**.

![Series of Tubes](site/images/og-image.png)

You start with one router in one city and grow into a transit-free Tier 1. It is a long game: a new network has to
fill its first city before it earns a second POP, and every POP after that is earned the same way, so a run to Tier 1
takes hours, not minutes.


- **Customers:** home broadband ("eyeballs"), enterprises, hosting, L2VPNs, DDoS
  protection, high-frequency traders with latency budgets, AI GPU data centers and
  hyperscaler DCI deals. Some come with very specific requirements.
- **Interconnection:** IP transit billed on the 95th percentile, internet exchanges
  with route servers, open/selective/restrictive/paid peering, PNIs, embedded CDN
  caches, and NNI fabrics for virtual circuits and remote peering.
- **Infrastructure:** leased waves on around 40 subsea cable systems modelled on real ones,
  dark fiber (leased or self-built) lit with DWDM and ZR+ optics, router
  generations that cap your port speeds, and LAGs to bundle ports when one isn't enough.
- **Traffic engineering:** see exactly what fills each link, tune link metrics and
  egress preferences, and route traders over the fastest path and backups the scenic way.
- **BGP policy and routing security:** RouteScript has `prepend` and `lowpref` next to prefer, avoid and
  blackhole rules. Ping, MTR and a BGP looking glass sit next to traceroute. Sign ROAs, turn on ROV and prefix
  filtering, and watch hijacks and leaks hit you less (or more).
- **Running the NOC:** hire engineers, call a change freeze, schedule maintenance windows, negotiate transit
  commits, and decide whether to pay a network that suddenly wants money for peering. A timelapse replays your growth.
- **A team that runs the network you built:** hire sales, NOC, senior NOC, network architects, peering
  coordinators and marketing managers. Each role works under rules you set (off, ask first, or act alone within a
  monthly budget and a cash reserve): signing customers, fixing outages early, steering load off hot ports, upgrading
  congested waves, ports and optics, cancelling idle links, ordering PNIs, running ad campaigns. New cities, long-haul
  links and strategy stay with you. People level up, want raises, make mistakes and get poached.
- **A loop worth coming back to:** contracts with streaks, a year-end review where you pick a focus, legacy points
  that buy permanent perks across games, and deal flow (acquire a local ISP, bulk IPv4, sponsorships, star hires).
- **Teams peer with each other:** in multiplayer, buy a port at a public exchange, turn on the route server and meet
  the other teams there. Every team sets its own peering policy (open, selective with a traffic minimum, restrictive,
  or paid with a monthly fee for smaller networks), and the fees really move between their bank accounts. Bilateral
  requests work under any policy.
- **Historical scenarios:** the 2021 Facebook outage, the 2008 YouTube hijack, the 2016 Dyn attack and the Luzon
  Strait earthquakes.
- **Things break, constantly:** backhoes, sharks, fat fingers, route leaks, RPKI
  mishaps, DDoS, cooling failures, Red Sea and Baltic cable cuts, sanctions and
  sovereign internet drills.

## This is fiction

Series of Tubes is a game. Every company is a pun and no real company names are used. Exchange and
network footprints are loosely modelled on public PeeringDB records, but everything that happens in the game
(prices, outages, disputes, peering decisions) is invented.

## Learn how it really works

This game simplifies a lot, and gets some things gloriously wrong on purpose. For
the real thing, go to **[How the Internet Works](https://tkjaer.github.io/how-the-internet-works/)**
by Thomas Kjær Aabo ([source](https://github.com/tkjaer/how-the-internet-works)):
an interactive, zoomable map that follows your data from Wi-Fi and copper to
undersea fiber, as the internet works today, in 2010 and in 1995, with simple or
technical explanations. If you enjoy Series of Tubes, you will learn more from
an hour there than from a year of laying cartoon fiber here.

## Playing

**Alone, in a browser.** The game is a single static page:

```sh
open site/index.html          # or: npm run serve
```

Progress is saved in your browser's local storage.

The game speaks English, Italian, Portuguese and French. It follows your browser's language the first time
and remembers the one you pick under Settings or on the title screen.

## Development

```sh
npm ci
npm test       # headless tests: boot, geography, a year of play, every incident, every panel, the server
npm run build  # writes the deployable site to _site/ with version and date stamped in
npm run i18n:check  # lists text missing from (or stale in) the translations
```

```
site/                  everything that is deployed
  index.html           the whole game (HTML, CSS and JS in one file, plus the generated world data)
  i18n/it.js           Italian translation, loaded only when the game runs in Italian
  i18n/pt.js           Portuguese (Brazil) translation, loaded only when the game runs in Portuguese
  i18n/fr.js           French translation, loaded only when the game runs in French
  images/og-image.png  social preview (1200×630)
  favicon.*, icon-*    favicons, app icons, manifest
  robots.txt, sitemap.xml, llms.txt, 404.html, CNAME
scripts/build.sh       copies site/ to _site/ and stamps __VERSION__ / __BUILD_DATE__
tests/                 node:test + jsdom
.github/workflows/     ci.yml (pushes to main and PRs) and release.yml (Pages deploy)
```

## Translations

English is the source text. Player-facing strings in `index.html` go through
`tr('Unlocks at level {n}.', {n})` (or `trn(one, other, n)` for plurals); static markup
uses `data-i18n`, and `aria-label`/`title` are translated at boot. Each language is a
`site/i18n/<lang>.js` file mapping the English text to its translation, plus an entry in
`SOT_LANGS` (the language loader at the top of the page). Missing entries fall back to
English, so new English text never breaks the game; `npm run i18n:check` lists what
needs translating, and the tests make sure every translation keeps its `{placeholders}`
and HTML tags.

## Releasing

Only published releases reach [seriesoftub.es](https://seriesoftub.es). Ordinary
pushes to `main` run CI and nothing else; a version bump is the release button.

1. Bump `version` in `package.json` (semver) and rename the changelog's
   `[Unreleased]` section to `## [<version>] — <date>`. Write the bullets for
   players: the build turns that section into the in-game "What's new" card and
   into `/version.json`, which open games poll to offer a reload.
2. Push or merge to `main`.

The **Auto-release** workflow then runs the tests, tags `v<version>`, publishes a
GitHub release with that changelog section as notes, and starts the deploy. It
does nothing when the tag already exists, and refuses a version older than the
latest release or one without changelog notes. A version with a pre-release
suffix (`1.2.0-beta.1`) becomes a pre-release and is not deployed. You can still
publish a release by hand; the deploy runs the same way.

The release workflow checks that the tag matches `package.json`, runs the tests,
builds, deploys to GitHub Pages and pings IndexNow. It refuses to build when the
CHANGELOG has no `## [<version>]` section (rename `[Unreleased]` first).
Pre-releases never deploy, also not when run by hand, and a version older than
the live one is refused unless you tick `allow_older` (a deliberate rollback).
To redeploy an existing release, run the workflow manually with its tag.

## Running the multiplayer server behind nginx

The browser talks to the server over one WebSocket (`/api/networks/<asn>/ws`) and falls back to server-sent events plus
plain HTTP if that cannot be opened. Behind nginx, pass the upgrade through and do not buffer:

```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
    listen 443 ssl http2;
    server_name tubes.example.com;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

Run the server with `TRUST_PROXY=1` behind a proxy.

## Hosting setup

GitHub Pages serves the site with **Source: GitHub Actions** and the custom domain
`seriesoftub.es`. Releases deploy from tags, so in **Settings → Environments →
github-pages → Deployment branches and tags**, add a tag rule for `v*` (by default
only the default branch may deploy). DNS for the apex domain:

```
seriesoftub.es.        A     185.199.108.153
seriesoftub.es.        A     185.199.109.153
seriesoftub.es.        A     185.199.110.153
seriesoftub.es.        A     185.199.111.153
seriesoftub.es.        AAAA  2606:50c0:8000::153
seriesoftub.es.        AAAA  2606:50c0:8001::153
seriesoftub.es.        AAAA  2606:50c0:8002::153
seriesoftub.es.        AAAA  2606:50c0:8003::153
www.seriesoftub.es.    CNAME fjaeckel.github.io.
stats.seriesoftub.es.  CNAME seocho.jc-ix.net.
```

Once DNS resolves, enable **Enforce HTTPS** in the repository's Pages settings.

## Analytics

The game uses [Ridiculytics](https://github.com/fjaeckel/ridiculytics): cookieless,
no persistent identifiers, self-hosted at `stats.seriesoftub.es`. It only reports
from `seriesoftub.es` itself; local copies, previews and forks stay silent. The
script is pinned to `ridiculytics@1.0.1` with an SRI hash.

Besides page views and session length, the game sends a few coarse events, all
under the collector's 50-name cap: `game_new`, `game_continue`, `play_1m` …
`play_120m` (active, unpaused play time), `goal_<id>`, `level_2`–`level_4`,
`game_year_2/3/5`, `win_tier1` and `bankrupt`.

The collector must allow the site, e.g. in `sites.yaml`:

```yaml
sites:
  - domain: seriesoftub.es
    origins: ["https://seriesoftub.es", "https://www.seriesoftub.es"]
```

## Community

Come hang out in the **[Series of Tubes Signal group](https://signal.group/#CjQKIJwvEt5fYt1pvw7J2pV664CyUyGJXmAJLV8ia3nUdAD7EhA_FzdxflEzkNmcvDHdVgLQ)**. Share screenshots of your
network, report bugs, suggest cities, and argue about peering policy with other players.
There are fewer backhoes there than in the real thing.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Frederic Jung
