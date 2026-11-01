# Series of Tubes as an MCP server

`scripts/mcp.js` lets an AI client (Claude Code, Claude Desktop, any MCP client) play, inspect and debug the game
through typed tools. It runs on your machine over stdio and loads the game from this checkout's `src/`, the way the
tests do: one page in jsdom, seeded, with no animation loop. Nothing is hosted and the game page does not change, so
it stays within [ADR 0001](adr/0001-github-pages-only.md): it is a local tool, like `npm run dev`.

## Set it up

```sh
npm ci
claude mcp add seriesoftubes -- node /path/to/seriesoftubes/scripts/mcp.js
```

Other clients take the same command (`node /path/to/seriesoftubes/scripts/mcp.js`) in their MCP server settings.
`npm run mcp` starts it by hand; clients should use the `node` command, because `npm run` prints a line of its own first.

A game is always loaded: a fresh On-call game in Frankfurt until you start or load another. Every game is seeded, so
the same seed and the same moves give the same game.

## Tools

| Tool | What it does |
|---|---|
| `new_game` | Start a network in any home city with a preset (`freeze`, `oncall`, `bgp`, `sandbox`) and a seed |
| `load_save`, `export_save` | Load an exported save (a path or JSON text, migrated as the game does) or write one the real game can import |
| `status` | Date, cash, revenue and costs by kind, level, tier and why it is not Tier 1, the goal, traffic, reach, POPs, incidents |
| `advance` | Run N days through `dayTick()`. Stops when a window needs an answer or the network goes bankrupt. Returns the log, new incidents, cash and the time each day took |
| `network`, `city`, `find` | The world: policies and what a network asks for, its PoPs, cone and price; a city's exchanges, transit sellers, cables; search by name, id or ASN |
| `traceroute` | The looking glass: which exit wins to a network and why, with the AS path |
| `peering_check` | Would this network peer with you over a PNI or at an exchange, and the game's reason if not |
| `hot_spots` | The fullest links, transit ports and PNIs, the transit bill by carrier, and the biggest traffic still on transit with the way off it |
| `actions`, `act` | Every game action with its arguments, and running one as a button would |
| `screen`, `panel`, `click`, `open_link` | The game's own windows and panels as text with numbered buttons; press one; open a link's build window |

`act` and `click` run the same `ACT` actions the buttons dispatch, so the game's rules, prices and messages apply.
They never reach files, save slots, settings, the title screen or the game speed (time moves only with `advance`).
There is no tool that evaluates code in the page.

## Looking into a bug report

1. `load_save` with the save attached to the issue.
2. `status` and `hot_spots` for the picture, `traceroute` and `peering_check` for one network's traffic.
3. `advance` a few days and read `timing.slowestDays` for lag, or the log for what went wrong.

## Code

- `scripts/mcp.js`: the stdio transport (JSON-RPC 2.0, one message per line) and the protocol methods.
- `scripts/lib/mcp-game.js`: the session (one game page) and the tool list with input schemas.
- `scripts/lib/mcp-page.js`: runs inside the page and reads or drives the game through its own globals.
- `tests/mcp.test.js`: the protocol, a game played through the tools, determinism, saves, and what stays out of reach.

The tools read the game's internals (`S`, `R`, `ACT`, `NETS`…), which are not a stable API: a refactor in `src/` can
break a tool, and `tests/mcp.test.js` is there to catch that in CI.
