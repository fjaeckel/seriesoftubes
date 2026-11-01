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

Every company is a pun. No real company names are used.

## Learn how it really works

This game simplifies a lot, and gets some things gloriously wrong on purpose. For
the real thing, go to **[How the Internet Works](https://tkjaer.github.io/how-the-internet-works/)**
by Thomas Kjær Aabo ([source](https://github.com/tkjaer/how-the-internet-works)):
an interactive, zoomable map that follows your data from Wi-Fi and copper to
undersea fiber, as the internet works today, in 2010 and in 1995, with simple or
technical explanations. If you enjoy Series of Tubes, you will learn more from
an hour there than from a year of laying cartoon fiber here.

## Playing locally

It is a single static page, assembled from the files in `src/` by a small Node script:

```sh
npm ci
npm run dev                   # http://localhost:8080
```

Progress is saved in your browser's local storage.

The game speaks English, Italian, Portuguese, French, Spanish and German. It follows your browser's language the first time
and remembers the one you pick under Settings or on the title screen.

## Development

```sh
npm ci
npm run dev    # development server: assembles src/ on every request, reloads on save
npm test       # headless tests: boot, geography, a year of play, every incident, every panel
npm run build  # writes the site for GitHub Pages to _site/, with version and date stamped in
npm run i18n:check  # lists text missing from (or stale in) the translations
npm run mcp    # the game as an MCP server, so an AI client can play and debug it (docs/MCP.md)
```

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
