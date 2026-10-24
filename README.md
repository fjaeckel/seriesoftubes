# Series of Tubes

**Build the internet, one tube at a time.** A free cartoon browser game about how
the internet really works. Play it at **[seriesoftub.es](https://seriesoftub.es)**.

![Series of Tubes](site/images/og-image.png)

You start with one router in one city and grow into a transit-free Tier 1:

- **Customers:** home broadband ("eyeballs"), enterprises, hosting, L2VPNs, DDoS
  protection, high-frequency traders with latency budgets, AI GPU data centers and
  hyperscaler DCI deals. Some come with very specific requirements.
- **Interconnection:** IP transit billed on the 95th percentile, internet exchanges
  with route servers, open/selective/restrictive/paid peering, PNIs, embedded CDN
  caches, and NNI fabrics for virtual circuits and remote peering.
- **Infrastructure:** leased waves on around 40 real-ish subsea cable systems,
  dark fiber (leased or self-built) lit with DWDM and ZR+ optics, router
  generations that cap your port speeds, and LAGs to bundle ports when one isn't enough.
- **Traffic engineering:** see exactly what fills each link, tune link metrics and
  egress preferences, and route traders over the fastest path and backups the scenic way.
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
| `TRUST_PROXY`, `SECURE_COOKIES` | off | set both to `1` behind an HTTPS reverse proxy |

Passwords are hashed with scrypt, sessions are random tokens stored hashed, sign-ups and log-ins are rate
limited, and the form pages refuse cross-site posts. There is no email, so there is no password reset: the
server owner can delete `db.json` entries. Put it behind HTTPS if it leaves your LAN.

The hosted game at seriesoftub.es is static, so its Multiplayer button needs a server address (Menu, then
Multiplayer, then *Server address*) that allows its origin with `ALLOW_ORIGIN`.

**On a device that cannot take the map.** `/lite` is the same game as plain server-rendered HTML with no
JavaScript: log in, start or join a team, see the dashboard, and build POPs, buy transit, join exchanges,
lay waves, take customers and fix incidents with ordinary forms. The page and everything on it is a
couple of kilobytes. The main page is also served Brotli/gzip-compressed (about a third of its size) and
only draws the big cities until you zoom in.

**The route viewer.** Menu or NOC, then *Routes*: your AS, upstreams, peers (with how you peer: route server,
bilateral, PNI, cache), the prefixes you originate with RPKI status, the best AS path to every network, and a
search for any AS number or name. The same pages exist server-side without JavaScript as `/as/<asn>`, for
player networks and for every real network in the world ("which players use Lumen as an upstream?"), plus
`/search?q=`.

## The real world in the game

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

## Development

```sh
npm ci
npm test       # headless tests: boot, geography, a year of play, every incident, every panel, the server
npm run build  # writes the deployable site to _site/ with version and date stamped in
```

```
site/                  everything that is deployed
  index.html           the whole game (HTML, CSS and JS in one file, plus the generated world data)
  images/og-image.png  social preview (1200×630)
  favicon.*, icon-*    favicons, app icons, manifest
  robots.txt, sitemap.xml, llms.txt, 404.html, CNAME
scripts/build.sh       copies site/ to _site/ and stamps __VERSION__ / __BUILD_DATE__
tests/                 node:test + jsdom
.github/workflows/     ci.yml (pushes to main and PRs) and release.yml (Pages deploy)
```

## Releasing

Only published releases reach [seriesoftub.es](https://seriesoftub.es). Pushes to
`main` run CI and nothing else.

1. Bump `version` in `package.json` (semver) and add a `CHANGELOG.md` entry.
   Write the bullets for players: the build turns that section into the in-game
   "What's new" card and into `/version.json`, which open games poll to offer a reload.
2. Merge to `main`.
3. Publish a GitHub release tagged `v<version>`, e.g. `gh release create v1.1.0 --generate-notes`.

The release workflow checks that the tag matches `package.json`, runs the tests,
builds, deploys to GitHub Pages and pings IndexNow. It refuses to build when the
CHANGELOG has no `## [<version>]` section (rename `[Unreleased]` first).
Pre-releases never deploy, also not when run by hand, and a version older than
the live one is refused unless you tick `allow_older` (a deliberate rollback).
To redeploy an existing release, run the workflow manually with its tag.

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
