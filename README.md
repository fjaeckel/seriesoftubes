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

## Credits

This is a fork of **[Series of Tubes](https://github.com/fjaeckel/seriesoftubes)** by Frederic Jung
([fjaeckel](https://github.com/fjaeckel)), playable at **[seriesoftub.es](https://seriesoftub.es)**. The game, its
simulation, art and humour are theirs; this version adds real-world data, multiplayer, the route viewer and a few
other things (see the changelog). Go play and support the original.

## This is fiction

Series of Tubes is a game. Network, exchange and cable names are real because that is what makes the
map worth playing, but they are used only to identify real-world organisations. There is no affiliation
with, or endorsement by, any of them, and everything that happens to them in the game (prices, outages,
disputes, peering decisions) is invented. Footprints come from public PeeringDB records and may be
incomplete or out of date. Trademarks belong to their owners. The same notice is on the title screen and
at the bottom of every server-rendered page.

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

**With a team.** Run the server (one command, no database to install) and everybody opens the same address:

```sh
npm ci
npm start                     # http://127.0.0.1:8080
HOST=0.0.0.0 npm start        # reachable from your LAN
docker compose up -d          # or with Docker, data in a volume
```

Create an account, start a network (pick any home city and **any AS number** that is free), and share the
AS number and invite code with your team. Everyone on the team operates the same network at the same time:
you see each other's changes, share the clock and chat. The simulation runs **on the server** (the game's own
code, headless), so nobody can cheat by editing their browser, and a weak device only has to draw snapshots.

| Setting | Default | |
| --- | --- | --- |
| `PORT`, `HOST` | `8080`, `127.0.0.1` | where to listen |
| `DATA_DIR` | `./data` | accounts, networks and saved games (plain JSON) |
| `SERVER_CODE` | none | a code people must enter to sign up |
| `REGISTRATION` | `open` | `closed` stops sign-ups entirely |
| `MAX_GAMES` | `25` | networks simulated at once; idle ones are saved and unloaded |
| `IDLE_PAUSE` | `1` | the clock only runs while someone is connected; `0` keeps every loaded network ticking |
| `ALLOW_ORIGIN` | none | CORS origins (comma separated, or `*`) if the game page is hosted elsewhere |
| `TRUST_PROXY` | off | set to `1` behind a reverse proxy so rate limits see the real client address |

Passwords are hashed with scrypt, sessions are random bearer tokens stored hashed, and sign-ups and log-ins are rate
limited. There is no email, so there is no password reset: the
server owner can delete `db.json` entries. Put it behind HTTPS if it leaves your LAN.

The hosted game at seriesoftub.es is static, so its Multiplayer button needs a server address (Menu, then
Multiplayer, then *Server address*) that allows its origin with `ALLOW_ORIGIN`.

**On a weak device.** The main page is served Brotli/gzip-compressed (about a third of its size), only the
big cities are drawn until you zoom in, and the multiplayer simulation runs on the server, so the browser only
draws snapshots. Hide the small cities entirely with the 🏙 button, find any city with 🔍 (or press `/`).

**The route viewer.** Menu or NOC, then *Routes*: your AS, upstreams, peers (with how you peer: route server,
bilateral, PNI, cache), the prefixes you originate with RPKI status, the best AS path to every network, and the IPv4
transfer market where you can buy and sell /24 blocks.

**Your own datacenter.** The Infra tab of any POP lets you build one: pick the tier, the number of racks and the kW
per rack. Customers rent by the kW and pay for cross-connects, you pay for power at the local price and for staff.
How full it gets depends on the city and on how many carriers are in the building. There is no limit on routers per
POP either.

## The real world in the game

Cities carry the short codes operators really write in router names: IATA codes from OpenFlights, with the
industry's own where they differ (msk, tyo, sel, iad), so a Moscow router is `cr1.msk`, not `cr1.mos`.

* **5,000+ cities.** Every metro with 100k+ people (GeoNames) and every metro that hosts a registered
  interconnection facility or exchange (PeeringDB). Pick any of them as your home city.
* **Real footprints.** A network has a PoP in a metro when PeeringDB lists a facility of its organisation there,
  or it has a port on an exchange there. Transit is only sold where a transit network has a PoP, so in a
  city nobody serves you have to haul a wave to the nearest carrier hotel. A few networks publish no facilities at all
  (Lumen, for one); their footprint is estimated from their home countries and flagged as such.
* **Real exchanges** with their real members, and challengers that undercut the incumbent.
* **Free AS numbers.** Any number from 1 to 4294967294 except the reserved ones, the real networks in the game
  and (on a server) the ones other teams hold.
* **Realistic latency.** Light covers about 204 km per millisecond in glass, but every link gets its own route
  inflation, equipment adds a little at each end, carriers reroute now and then, loaded links queue and every
  traceroute probe jitters. It is a function of the link, your AS and the day, so a save replays identically.

Regenerate the data with `npm run world` (downloads GeoNames and PeeringDB into `.cache/`, needs `curl` and
`unzip`). It rewrites the block between the `__WORLD_BEGIN__` markers in `site/index.html`; traffic shares,
prices and peering policies are game design and live in the game and in `scripts/data/networks.js`.


The game speaks English and Italian. It follows your browser's language the first time
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

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Frederic Jung
