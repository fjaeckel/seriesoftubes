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
- **Infrastructure:** leased waves on around 40 subsea cable systems modelled on real ones,
  dark fiber (leased or self-built) lit with DWDM and ZR+ optics, router
  generations that cap your port speeds, and LAGs to bundle ports when one isn't enough.
- **Traffic engineering:** see exactly what fills each link, tune link metrics and
  egress preferences, and route traders over the fastest path and backups the scenic way.
- **Things break, constantly:** backhoes, sharks, fat fingers, route leaks, RPKI
  mishaps, DDoS, cooling failures, Red Sea and Baltic cable cuts, sanctions and
  sovereign internet drills.
- **Multimode:** play alongside other people on servers that players run themselves.
  Peer with them, sell them transit and waves, build cables together, and see where you
  rank on live leaderboards. Optional and per save: solo games stay exactly as they are.

Every company is a pun. No real company names are used.

No accounts, no cookies: the [privacy page](https://seriesoftub.es/privacy.html) says exactly what the game keeps
on your device, what it sends to Multimode servers (the game's multiplayer) and what those servers keep.

## Learn how it really works

This game simplifies a lot, and gets some things gloriously wrong on purpose. For
the real thing, go to **[How the Internet Works](https://tkjaer.github.io/how-the-internet-works/)**
by Thomas Kjær Aabo ([source](https://github.com/tkjaer/how-the-internet-works)):
an interactive, zoomable map that follows your data from Wi-Fi and copper to
undersea fiber, as the internet works today, in 2010 and in 1995, with simple or
technical explanations. If you enjoy Series of Tubes, you will learn more from
an hour there than from a year of laying cartoon fiber here.

## Multimode: play with others

Switch on **Play with others** when you start a new game, or join later from Multimode in the menu. Other players'
networks then show up in your world as places your customers want to reach, and you can do business with them:
peering, transit, PNIs, exchange ports, waves, capacity swaps and consortium cables. Deals are sealed end to end, so
the servers carrying them cannot read them. Leaderboards rank traffic, POPs, pies in the sky and customer cone, live
every 30 seconds, and your rank sits in the top bar.

The first server, **SeriesOfTubes Server 1** (`wss://s1.seriesoftub.es/fed`), is open to everyone. More are listed in
the game as players add them. If a server is down, your game simply plays on.

## Playing locally

It is a single static page, assembled from the files in `src/` by a small Node script:

```sh
npm ci
npm run dev                   # http://localhost:8080
```

Progress is saved in your browser's local storage. To try Multimode from a phone on your network,
`npm run dev -- --https --host 0.0.0.0` serves a secure page (browsers only sign Multimode records on one) and prints how to trust
its certificate.

The game speaks English, Italian, Portuguese, French, Spanish and German. It follows your browser's language the first time
and remembers the one you pick under Settings or on the title screen.

## Host your own server

Multimode runs on servers players host themselves: a small Go program, the relay, that passes signed records between
games and other servers. It never sees anyone's strategy or money, never keeps IP addresses, and runs happily on a
small VPS or a Raspberry Pi.

**For everyone on the internet** you need a machine with a public IP address, a DNS name pointing at it, ports 80 and
443 open, and a TLS certificate (browsers refuse anything else). The repository has all of it in one Compose file,
certbot included:

```sh
git clone https://github.com/fjaeckel/seriesoftubes.git
cd seriesoftubes/relay
cp .env.example .env        # set RELAY_DOMAIN, LETSENCRYPT_EMAIL and RELAY_NAME
docker compose up -d --build
docker compose logs -f relay
```

The first start founds your server, gets the certificate and prints your server identity and an invite link. Back up
the operator key it tells you about: it is the control of your server, and there is no reset.

- **Get listed** in the game's server list with a pull request adding one signed file,
  `relay registry-file` makes it ([how](federation/servers/README.md)). Open servers that are listed sync with each other
  automatically.
- **LAN party:** no domain needed. `relay lan` on one laptop makes a self-signed certificate, each device accepts it
  once and joins over the local network, no internet required ([LAN party](docs/HOSTING.md#lan-party)).
- **Without Docker:** static binaries for Linux, macOS, Windows and the BSDs, and container images for amd64 and arm64,
  come with every release.
- **Monitoring:** Prometheus metrics (counts only, never addresses) and a
  [Grafana dashboard](relay/grafana/tubes-relay.json) to import.

**[How to host a server](docs/HOSTING.md)** walks through every path step by step: Docker Compose, a binary with
systemd, a home server, upgrades, backups and your privacy duties. [RELAY.md](docs/RELAY.md) is the relay's reference
and [the protocol](docs/FEDERATION-PROTOCOL.md) describes everything on the wire.

## Development

```sh
npm ci
npm run dev    # development server on localhost (--host to share): assembles src/ on every request, reloads on save
npm test       # headless tests: boot, geography, a year of play, every incident, every panel
npm run build  # writes the site for GitHub Pages to _site/, with version and date stamped in
npm run i18n:check  # lists text missing from (or stale in) the translations
npm run mcp    # the game as an MCP server, so an AI client can play and debug it, headless or in your tab (docs/MCP.md)
npm run perf -- --base-ref origin/main   # big-network benchmark against main (--browser: also in Chromium)
node scripts/fed-e2e.js --quick          # Multimode end to end: real relays, two servers, games in a browser
(cd relay && go test ./...)              # the relay (Go 1.27)
```

[ARCHITECTURE.md](docs/ARCHITECTURE.md) explains where the code lives and how a day of simulation runs, and
[FEDERATION-CLIENT.md](docs/FEDERATION-CLIENT.md) how the game talks to Multimode servers.

## Community

Come hang out in the **[Series of Tubes Signal group](https://signal.group/#CjQKIJwvEt5fYt1pvw7J2pV664CyUyGJXmAJLV8ia3nUdAD7EhA_FzdxflEzkNmcvDHdVgLQ)**. Share screenshots of your
network, suggest cities, and argue about peering policy with other players.
There are fewer backhoes there than in the real thing.

Signal is for chatting. Bugs, feature requests and anything else that should not get
lost go into a **[GitHub issue](https://github.com/fjaeckel/seriesoftubes/issues/new/choose)**.

## Star history

<a href="https://star-history.com/#fjaeckel/seriesoftubes&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=fjaeckel/seriesoftubes&type=Date&theme=dark" />
    <img alt="Star history of Series of Tubes" src="https://api.star-history.com/svg?repos=fjaeckel/seriesoftubes&type=Date" />
  </picture>
</a>

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md): be excellent to each other.

## License

[MIT](LICENSE) © 2026 Frederic Jung
