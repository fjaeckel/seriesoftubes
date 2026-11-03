# Series of Tubes as an MCP server

`scripts/mcp.js` lets an AI client (Claude Code, Claude Desktop, any MCP client) play, inspect and debug the game
through typed tools. It runs on your machine, over stdio or over HTTP, and loads the game from this checkout's
`src/`, the way the tests do: one page in jsdom, seeded, with no animation loop. Nothing is hosted and the game page
does not change, so it stays within [ADR 0001](adr/0001-github-pages-only.md): it is a local tool, like `npm run dev`,
not a server for the game. The protocol is the official SDK's (`@modelcontextprotocol/server`, a dev dependency).

## Set it up

```sh
npm ci
claude mcp add seriesoftubes -- node /path/to/seriesoftubes/scripts/mcp.js
```

Other clients take the same command (`node /path/to/seriesoftubes/scripts/mcp.js`) in their MCP server settings.
`npm run mcp` starts it by hand; clients should use the `node` command, because `npm run` prints a line of its own first.

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

A game is always loaded: a fresh On-call game in Frankfurt until you start or load another. Every game is seeded, so
the same seed and the same moves give the same game.

## Tools

| Tool | What it does |
|---|---|
| `new_game` | Start a network in any home city with a preset (`soft` for Best Effort, `freeze`, `oncall`, `bgp`, `sandbox`), a seed, your own ASN, and the sandbox's chaos dial |
| `load_save`, `export_save` | Load an exported save (a path or JSON text, migrated as the game does) or write one the real game can import |
| `status` | Date, cash, revenue and costs by kind, level, tier and why it is not Tier 1, the goal, traffic, reach, POPs, incidents |
| `advance` | Run N days through `dayTick()`. Stops when a window opens or the network goes bankrupt. Returns the log, new incidents, cash and the time each day took |
| `network`, `city`, `find` | The world: policies and what a network asks for, its PoPs, cone and price; a city's exchanges, transit sellers, cables; search by name, id or ASN |
| `traceroute` | The looking glass: which exit wins to a network and why, with the AS path |
| `peering_check` | Would this network peer with you over a PNI or at an exchange, and the game's reason if not |
| `hot_spots` | The fullest links, transit ports and PNIs, the transit bill by carrier, and the biggest traffic still on transit with the way off it |
| `schema` | The typed contract: every action with its arguments, their domains and what it does; what is not available and why; a field-by-field reference of `state` and `results` |
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
and clicked with a value. Neither tool reaches files, save slots, settings, the title screen or the game speed: time
moves only with `advance`. There is no tool that evaluates code in the page.

## Looking into a bug report

1. `load_save` with the save attached to the issue.
2. `status` and `hot_spots` for the picture, `traceroute` and `peering_check` for one network's traffic, `state`
   and `results` for the numbers behind them.
3. `advance` a few days and read `timing.slowestDays` for lag, or the log for what went wrong.

## Code

- `scripts/mcp.js`: the server on the SDK: the tools registered from `TOOLS`, stdio or Streamable HTTP, the Host,
  Origin and token checks, the one-at-a-time queue.
- `tests/mcp-http.test.js`: the HTTP transport, its checks, the token and the save directory.
- `scripts/lib/mcp-game.js`: the session (one game page: the development page, which has the facade) and the tool
  list with input schemas.
- `src/agent/`: the facade (`window.TUBES.call(tool, args)`), in the page's own scope: every action's class,
  arguments, domains, price and description (`20-commands.js`), the `state`/`results` field reference (`30-docs.js`),
  the reads, screens, dispatch and time. It is part of the development page only, never of the page players get
  ([ADR 0004](adr/0004-dev-only-code.md)).
- `scripts/lib/mcp-headless.js`: added to the server's own page to start, load and export games.
- `tests/agent-api.test.js`: the facade is inert until called, and the page players get has none of it.
- `tests/mcp.test.js`: the protocol, a game played through the tools, determinism, saves, and what stays out of reach.
- `tests/mcp-commands.test.js`: every action classified and its arguments real, outcomes, quotes, typed text,
  multi-step builds, confirmations, the reads and the screens.

The tools read the game's internals (`S`, `R`, `ACT`, `NETS`…), which are not a stable API: a refactor in `src/` can
break a tool, and the tests are there to catch that in CI. A new action in `ACT` needs an entry in
`src/agent/20-commands.js` (a class, or `API_DENY`), or `tests/mcp-commands.test.js` fails.
