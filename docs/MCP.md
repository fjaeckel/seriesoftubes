# Series of Tubes as an MCP server

`scripts/mcp.js` lets an AI client (Claude Code, Claude Desktop, any MCP client) play, inspect and debug the game
through typed tools, over stdio or HTTP, in one of two sessions:

- **Headless** (`node scripts/mcp.js`): a game of its own, loaded from this checkout's `src/` the way the tests load
  it: one page in jsdom, seeded, with no animation loop. For playing and debugging when nobody is watching: fresh
  starts, bug-report saves, scenarios and puzzles, and fast-forwarding time.
- **Browser** (`node scripts/mcp.js --browser`): the game in your own browser tab, through a local relay, so you can
  watch and take part. Toasts fire, panels open, the map moves. The game, its saves, its settings and any window you
  open stay yours.

Both run the same tools on the same code: the agent facade in the game page (`src/agent/`, `window.TUBES`), which does
nothing until a tool calls it. It is part of the development page only, never of the page players get
([ADR 0004](adr/0004-dev-only-code.md)). Nothing is hosted, so this stays within
[ADR 0001](adr/0001-github-pages-only.md): it is a local tool, like `npm run dev`. On the public site there is no relay
and no agent mode. The protocol is the official SDK's (`@modelcontextprotocol/server`, a dev dependency).

## Set it up

### Headless

```sh
npm ci
claude mcp add seriesoftubes -- node /path/to/seriesoftubes/scripts/mcp.js
```

Other clients take the same command (`node /path/to/seriesoftubes/scripts/mcp.js`) in their MCP server settings.
Use `node` directly: `npm run` prints a line of its own to stdout, which is the protocol channel.

A game is always loaded: a fresh On-call game in Frankfurt until you start or load another. Every game is seeded, so
the same seed and the same moves give the same game. `--seed N` sets the first game's seed.

### Browser

1. `npm run dev`. It hosts the agent relay on its own port, at `/agent`.
2. Open the game at `http://localhost:8080`, start or load the game you want the agent to play, and turn on
   **Settings → Agent API → "Let an AI agent drive this game"**. That connects the page to the relay; there are no
   tokens and no ports to configure. The section only exists while the page is served over plain `http://` to an
   address (`localhost`, `127.0.0.1`, or the IP the dev server is bound to).
3. Point your MCP client at `node /path/to/seriesoftubes/scripts/mcp.js --browser` (add `--relay-port N` if the dev
   server runs on another port, `--relay-host ADDR` if it is bound elsewhere).

The order does not matter. The server answers the MCP handshake at once, then waits up to 90 s (`--page-wait-ms`) for
a page on the relay. When one connects it checks that the page was built from the code on disk, and over stdio stops
with a message if the tab is older (reload it). A call the page has not answered after 30 s comes back as an error
(`--call-ms`); a page that goes away answers its calls at once. One tab drives the relay at a time: the newest one wins.

`npm run dev` binds loopback by default. `npm run dev -- --host 0.0.0.0` (to try the game on a phone, say) binds every
interface, the relay with it, and says so: then anything that can reach the address can drive a game whose player
turned agent mode on. Whatever the bind address, the relay only takes connections made to an IP address or
`localhost`, and refuses a page from another site, so a website in your browser cannot reach it.

### Over HTTP

For a client that connects to a running server instead of starting one (another process, a container, another
machine), serve Streamable HTTP:

```sh
node scripts/mcp.js --http 7777                       # http://127.0.0.1:7777/mcp, this machine only
claude mcp add --transport http seriesoftubes http://127.0.0.1:7777/mcp
```

- **Where it listens is your choice.** `--http 7777` binds loopback. `--http 0.0.0.0:7777` (or one address) lets
  other machines in, and then anyone who can reach it can play; the server says so when it starts.
- **Token (optional).** With `SOT_MCP_TOKEN=…` or `--token-file FILE`, every request needs
  `Authorization: Bearer <token>` (`claude mcp add … --header "Authorization: Bearer …"`). Without a token, a server
  bound beyond loopback warns. There is no TLS: beyond a network you trust, use `ssh -L 7777:127.0.0.1:7777` or a
  TLS proxy in front.
- **Always checked, wherever it listens:** the `Host` must be an address of this machine (or a name given with
  `--allow-host`), which stops DNS rebinding, and a request from a web page (an `Origin` other than localhost) is
  refused, so no website can drive the game through your browser.
- **Files:** over HTTP, `load_save` and `export_save` take and give JSON only. `--save-dir DIR` lets them read and
  write files under `DIR` and nowhere else (symbolic links that lead out are refused).
- **One game for every client.** Calls run one at a time, in the order they arrive; `new_game` or `load_save` from
  any client replaces the game for all of them.
- **Either session.** `--http` works headless and with `--browser` alike: then a client elsewhere drives the game
  in the player's tab, while the relay stays where `npm run dev` put it.

## The clock

Every session has one of two clocks, and `schema` (section `mode`) says which:

- **The agent's clock**: nothing happens between calls. `advance {days}` runs the days, one `dayTick()` each, as the
  game loop runs them, and stops early when a window asks a question or the network goes bankrupt. Headless, this is
  the default. In the browser the player picks it in Settings ("The agent moves it"), and the days run on screen.
- **A running clock**: one simulated day passes every so often whatever the agent does, and nothing can stop it, not
  even an open window. The agent decides while it runs, and `wait {days}` returns once that many days have passed (or
  earlier, when a window asks a question). Headless: `--clock realtime --pace MS` (default 60000 ms a day). In the
  browser the player picks a pace from 30 s to 5 min a day; the clock holds while no tool is connected.

`advance` with a running clock and `wait` with the agent's are errors that say which one to use.

## Tools

| Tool | What it does |
|---|---|
| `new_game` | Headless only. Start a network in any home city with a preset (`soft` for Best Effort, `freeze`, `oncall`, `bgp`, `sandbox`), a seed, your own ASN, and the sandbox's chaos dial |
| `load_save`, `export_save` | Headless only. Load an exported save (a path or JSON text, migrated as the game does) or write one the real game can import |
| `status` | Date, cash, revenue and costs by kind, level, tier and why it is not Tier 1, the goal, traffic, reach, POPs, incidents |
| `advance`, `wait` | Move time with the agent's clock, or let it pass with a running one. They return the log, new incidents and cash; `advance` also the time each day took |
| `network`, `city`, `find` | The world: policies and what a network asks for, its PoPs, cone and price; a city's exchanges, transit sellers, cables; search by name, id or ASN |
| `traceroute` | The looking glass: which exit wins to a network and why, with the AS path |
| `peering_check` | Would this network peer with you over a PNI or at an exchange, and the game's reason if not |
| `hot_spots` | The fullest links, transit ports and PNIs, the transit bill by carrier, and the biggest traffic still on transit with the way off it |
| `schema` | The typed contract: the session (`mode`: headless or browser, the clock, what is held back), every action with its arguments, their domains and what it does; what is not available and why; a field-by-field reference of `state` and `results` |
| `catalog` | The reference tables the arguments point at (cities, networks, ports, optics, interns…), plus the conference calendar with its keys and the RouteScript recipes with their scripts |
| `state`, `results`, `ui` | The saved game itself (`S`), the last traffic computation (`R`) and the view state, as JSON, whole or by path (`pops.fra`, `loanOffers`, `links.<id>`) |
| `actions`, `act` | Every action with its arguments, and running one |
| `screen`, `panel`, `click`, `open_link` | The game's own windows, panels, left drawer, NOC dashboard, bank and puzzle box as text with numbered buttons; press one; open a link's build window |

## Acting

`act` checks the arguments against `schema` first: a wrong id or value is an error that says what would fit, and
nothing runs. The action then runs as the game runs it, with what a player would type and pick filled in: a rename,
a RouteScript, a custom metric, the route and size of a link, the source and line system of dark fiber, the design
of a cable, the POPs to close. Confirmations are given, so `rmLink` removes the link in one call. The result says
what happened:

| `outcome` | Meaning |
|---|---|
| `applied` | Something changed. `charged` is what the game's money gate took; `cashChange` also counts goal rewards |
| `rejected` | The game said no; `toasts` has its words |
| `no_effect` | Nothing changed and nothing was said: usually a wrong id or a precondition |
| `shown` | A view or a draft: only the screen changed |
| `decision` | A window asks a question (a De-Kicks quote, a retention offer). Answer with one of `decision.options` or `closeModal`; other game commands wait until then |
| `quote` | With `dryRun`: `{setup, monthly, days, blocked}`, priced with the game's own helpers. Nothing happens, and no dice are rolled |
| `stopped` | The network is bankrupt |

`click` presses a button as a player's click does, with the button's own arguments, so a confirmation arms first
and windows step on as they do in the game. Lists the game acts on when they change are listed with their options
and clicked with a value. Neither tool reaches files, save slots, settings, the title screen or the game speed.
There is no tool that evaluates code in the page, and nothing but tool names and JSON arguments crosses the relay.

## In the player's browser

The browser mode plays by the player's rules on top of the headless ones:

- **The game is the player's.** There is no `new_game`, `load_save` or `export_save`, and the actions that start,
  retry or leave a scenario, puzzle or architect run are refused. Whichever tab is connected is the game.
- **So is the clock**, set in Settings (see above). There is no tool for it.
- **And their windows.** A window the player opened (Settings, the menu, a sheet) is never a question, never closed
  and never replaced: the agent plays behind it. `screen` shows it with `playerWindow`, and its buttons are the
  player's to press. A sheet the agent opens meanwhile is shown to it and closed again. Only a question the game asks
  in answer to the agent's own move takes the screen, as it would after a click.
- **And their settings**: no preference can be changed.
- **The dice stay hidden**: `state` never returns the seed or the days of the next failure, event or scripted attack;
  `schema` marks them `withheld`, with the reason.

## Looking into a bug report

1. `load_save` (headless) with the save attached to the issue.
2. `status` and `hot_spots` for the picture, `traceroute` and `peering_check` for one network's traffic, `state`
   and `results` for the numbers behind them.
3. `advance` a few days and read `timing.slowestDays` for lag, or the log for what went wrong.

## Troubleshooting the browser mode

- **"no game page answered"**: the tab is not connected. Settings → Agent API → on. No Agent API section in Settings?
  The page is not the development page served locally: open it from `npm run dev`, at an address such as
  `http://localhost:8080` or `http://127.0.0.1:8080`, not under a DNS name, which the relay refuses.
- **"the game page in the browser disagrees with the code on disk"**: the tab is older than the checkout (perhaps
  after a `git pull`). Reload it: `npm run dev` assembles the page on every request.
- **A second tab took over**: one page per relay; the newest tab wins and the old one stops dialing.

## Code

- `scripts/mcp.js`: the server on the SDK: the tools registered from `TOOLS` for the session's mode, stdio or
  Streamable HTTP, the Host, Origin and token checks, the one-at-a-time queue, and the options.
- `scripts/lib/mcp-game.js`: the headless session (one game page) and the tool list, each tool with its input schema
  and the modes it works in.
- `scripts/lib/mcp-headless.js`: runs inside the headless page only: starting, loading and exporting games, and the
  server's clock.
- `scripts/lib/mcp-browser.js`, `scripts/lib/relay-client.js`: the browser session: the relay's tool side, the wait
  for a page and the check that it serves this checkout's contract.
- `scripts/agent/relay.js`: the relay, hosted by `scripts/dev.js` on its own port.
- `src/agent/`: the facade in the page, in the development page only: every action's class, arguments, domains,
  price and description (`20-commands.js`), the `state`/`results` field reference and what is withheld
  (`30-docs.js`), the reads, the screens, dispatch and the clocks (`70-time.js`); agent mode's switch, clock and
  Settings (`75-mode.js`), the page's side of the relay (`80-relay.js`) and the clock where frames do not run
  (`85-ticker.js`). The game itself only offers `HOOKS` and `UI.clockLocked` (`src/game/50-state.js`).
- `tests/mcp.test.js`: the protocol over stdio, a game played through the tools, determinism, saves, both clocks, and
  what stays out of reach. `tests/mcp-http.test.js`: the HTTP transport, its checks, the token and the save directory.
  `tests/mcp-commands.test.js`: every action classified and its arguments real, outcomes, quotes, typed text,
  multi-step builds, confirmations, the reads and the screens. `tests/agent-api.test.js`: the facade is inert until
  called, and the page players get has none of it. `tests/agent-relay.test.js`, `tests/agent-settings.test.js`: the
  relay, the browser mode and its rules, and the Settings. `tests/mcp-parity.test.js`: one scripted session gives the
  same outcomes headless and through the relay.

The tools read the game's internals (`S`, `R`, `ACT`, `NETS`…), which are not a stable API: a refactor in `src/` can
break a tool, and the tests are there to catch that in CI. A new action in `ACT` needs an entry in
`src/agent/20-commands.js` (a class, or `API_DENY`), or `tests/mcp-commands.test.js` fails.
