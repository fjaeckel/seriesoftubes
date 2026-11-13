# How to host a Series of Tubes server

This is the walkthrough: from "I have never run a server" to a Multimode server (the game's multiplayer) that your friends (or the whole
internet) play on, or a LAN party with no internet at all. [RELAY.md](RELAY.md) is the reference it links to for every
command and setting; this page puts them in order.

The game itself is always the page at **https://seriesoftub.es**, served by GitHub Pages. You never host the game.
What you host is a **relay**: a small program that lets players' games find each other, trade and rank. The game
connects to it with a secure WebSocket (`wss://`). Why the project runs no server of its own:
[ADR 0005](adr/0005-federation-by-player-run-servers.md).

Contents:

1. [What you need](#what-you-need)
2. [Getting the relay](#getting-the-relay)
3. [From the repo (recommended)](#from-the-repo-recommended)
4. [Path A: a VPS with Docker Compose and Caddy](#path-a-a-vps-with-docker-compose-and-caddy)
5. [Path A2: Docker Compose, the relay serving TLS with certbot](#path-a2-docker-compose-the-relay-serving-tls-with-certbot)
6. [Path B: the binary, systemd and a reverse proxy](#path-b-the-binary-systemd-and-a-reverse-proxy)
7. [Path C: a home server or Raspberry Pi](#path-c-a-home-server-or-raspberry-pi)
8. [First run: found your server](#first-run-found-your-server)
9. [Day two: listing, friends, backups, upgrades](#day-two-listing-friends-backups-upgrades)
10. [Monitoring with Prometheus](#monitoring-with-prometheus)
11. [Logs and privacy: your duties](#logs-and-privacy-your-duties)
12. [LAN party](#lan-party)
13. [Troubleshooting](#troubleshooting)

## What you need

### For internet play

Players open the game over HTTPS, and a page served over HTTPS may only open **secure** WebSockets, to a server whose
certificate the browser **already trusts**. There is no "accept the risk" button for a WebSocket. So a server for
everyone needs three things:

| What | Why | How you get it |
| --- | --- | --- |
| **A public IP address** | Players' browsers must reach your machine from anywhere. | A VPS has one. At home: your router's, with port forwarding, if you are not behind CGNAT ([Path C](#path-c-a-home-server-or-raspberry-pi)). |
| **A DNS name** | Certificates are issued for names, and the protocol refuses public IP addresses in node URLs (and the registry refuses all IP addresses). | Your own domain (a subdomain such as `relay.example.net` is fine), or a free dynamic-DNS name. |
| **A TLS certificate from a public CA** | The browser checks it silently; a self-signed one makes the connection fail with no prompt. | Let's Encrypt, free and automatic: Caddy does it by itself, or certbot. |

Your server's address then looks like `wss://relay.example.net/fed`, and the invite link you share is
`https://seriesoftub.es/#join=wss://relay.example.net/fed`.

### For a LAN party

Nothing of the above: one laptop on the same network as the players, `relay lan`, and one click per device to accept
a certificate. See [LAN party](#lan-party).

### What it costs

The relay is one small program (about 14 MB) that keeps its data in one folder. Rough figures, to plan with (measure
your own with `relay status` and the [metrics](#monitoring-with-prometheus)):

- **Machine.** Any small VPS (1 vCPU, 1 GB RAM, a few GB of disk; typically a few euros or dollars a month) or a
  Raspberry Pi 3 or newer is enough for a thousand networks. Memory and disk grow with the networks whose records
  the relay holds: its own players and, once it syncs, those of the servers it syncs with. Measured per network
  ([how](RELAY.md#memory-and-disk)): a network that sends statistics about once an hour, as a typical game does,
  takes about 65 KB of memory and 100 KB of disk; one that sends them every five minutes, the most the relay accepts,
  about 630 KB of memory and 930 KB of disk (some 700 bytes of memory and 1 KB of disk per record kept). The program
  itself takes 30 to 40 MB, and Go may hold up to as much again as the records take before it frees memory, so plan
  twice the record memory:

  | Networks | Memory, hourly stats | Memory, stats every slot | Disk, hourly | Disk, every slot | A machine with |
  | ---: | ---: | ---: | ---: | ---: | --- |
  | 100 | about 55 MB | about 170 MB | 10 MB | 95 MB | 1 GB (any VPS, a Raspberry Pi) |
  | 1,000 | about 170 MB | about 1.3 GB | 100 MB | 930 MB | 1 GB; 2 GB if most play all day |
  | 10,000 | about 1.3 GB | about 13 GB | 1 GB | 9.3 GB | 2 to 4 GB; 16 GB if most play all day |

  Nobody plays every five minutes around the clock, so real figures sit between the two columns, near the first.
  Watch `process_resident_memory_bytes` ([monitoring](#monitoring-with-prometheus)) as your federation grows.
- **Disk.** The relay keeps game statistics for 72 hours, offers 30 days, votes 97 days, announcements until a network
  has been silent 180 days ([what is kept](RELAY.md#upgrades-backups-and-data)). Each player sends at most one
  statistics record per five minutes, about a kilobyte with its receipt: the table above has the totals. A few GB of
  free disk is plenty for most servers.
- **Traffic.** Records in, receipts and the pieces of leaderboards players look at out (never whole boards). A hundred
  active players are a few hundred MB a day at most; the terabyte a typical VPS includes is far more than you need.
  The limits that bound it: 5000 open connections, 20 messages per second each, 30 new connections per address per
  5 minutes (all in [the config](RELAY.md#the-config-file)).
- **Time.** An hour to set up, a few minutes a month: updates and an eye on the logs.

## Getting the relay

Every release of the game attaches the relay to its
[GitHub release](https://github.com/fjaeckel/seriesoftubes/releases) (its version is the game's), in two forms.

**A program for your system**, one archive each, holding `relay` (`relay.exe` on Windows), `LICENSE` and a `README.txt`:

| Archive | For |
| --- | --- |
| `tubes-relay-X.Y.Z-linux-amd64.tar.gz` | Most VPSs and PCs running Linux |
| `tubes-relay-X.Y.Z-linux-arm64.tar.gz` | Raspberry Pi 3, 4, 5 and Zero 2 with a 64-bit OS; ARM servers |
| `tubes-relay-X.Y.Z-linux-armv7.tar.gz` | Raspberry Pi 2 and newer with a 32-bit OS |
| `tubes-relay-X.Y.Z-linux-armv6.tar.gz` | Raspberry Pi 1 and Zero (W) |
| `tubes-relay-X.Y.Z-linux-386`, `-riscv64`, `-ppc64le`, `-s390x`, `-loong64` | Older PCs, RISC-V boards, POWER, mainframes, LoongArch |
| `tubes-relay-X.Y.Z-darwin-arm64.tar.gz`, `-darwin-amd64` | macOS on Apple silicon, on Intel |
| `tubes-relay-X.Y.Z-windows-amd64.zip`, `-arm64`, `-386` | Windows |
| `tubes-relay-X.Y.Z-freebsd-amd64.tar.gz`, `-arm64`; `openbsd-amd64`, `-arm64`; `netbsd-amd64` | The BSDs |

Each is a static program: nothing to install, no libraries. Check what you downloaded, either against `SHA256SUMS` on
the release, or with GitHub's signed build provenance (proof it was built by this repository's workflow from that tag):

```sh
V=X.Y.Z   # the release you want
curl -LO https://github.com/fjaeckel/seriesoftubes/releases/download/v$V/tubes-relay-$V-linux-amd64.tar.gz
curl -LO https://github.com/fjaeckel/seriesoftubes/releases/download/v$V/SHA256SUMS
sha256sum --check --ignore-missing SHA256SUMS                     # macOS: shasum -a 256 --check --ignore-missing SHA256SUMS
gh attestation verify tubes-relay-$V-linux-amd64.tar.gz --repo fjaeckel/seriesoftubes    # optional, needs the gh CLI
tar xzf tubes-relay-$V-linux-amd64.tar.gz
sudo install -m 0755 tubes-relay-$V-linux-amd64/relay /usr/local/bin/relay
relay version
```

On macOS, a program downloaded with a browser is quarantined and blocked as "from an unidentified developer"; one
downloaded with `curl` as above is not. (Or: `xattr -d com.apple.quarantine relay`.)

**A container image** for Docker or Podman, for `linux/amd64` and `linux/arm64`:

| Tag | Moves? |
| --- | --- |
| `ghcr.io/fjaeckel/seriesoftubes-relay:X.Y.Z` | Never: exactly that release |
| `ghcr.io/fjaeckel/seriesoftubes-relay:X.Y` | To each new patch release of X.Y (fixes only) |
| `ghcr.io/fjaeckel/seriesoftubes-relay:latest` | To each new release (pre-releases never) |

The image is built `FROM scratch`: the relay, CA certificates and nothing else (no shell), running as an unprivileged
user (uid 65532) with its data in `/data`. Inside it, `relay init` listens on `0.0.0.0:8080` and serves metrics on
`0.0.0.0:9100` for the Docker network (`RELAY_LISTEN`, `RELAY_METRICS`, `RELAY_METRICS_PUBLIC` in the image). It runs
[`relay up`](RELAY.md#relay-up) by default: on a data folder that already holds a server that is `relay serve`; on an
empty one it sets the server up from `RELAY_URL`, `RELAY_NAME` and the like first.

**From the repository**: `relay/` holds the Dockerfile and a Compose file that builds it ([From the
repo](#from-the-repo-recommended)); `cd relay && go build ./cmd/relay` builds the program with Go.

## From the repo (recommended)

The quickest way to a server for everyone: a Linux machine with Docker, a checkout of this repository, and one
Compose file, [`relay/docker-compose.yml`](../relay/docker-compose.yml). It builds the relay from the checkout (no
registry or GitHub Actions involved), runs [certbot](https://certbot.eff.org) to get and renew the Let's Encrypt
certificate by itself, and the relay serves TLS on port 443 itself. Every setting is in one file, `relay/.env`.

**1. A machine, a name, open ports.** Steps 1 to 3 of [path A](#path-a-a-vps-with-docker-compose-and-caddy): a VPS
(or [a home server](#path-c-a-home-server-or-raspberry-pi)) with a public address, an A (and AAAA) record from your name
to it, ports 80 and 443 open. Port 80 is only for Let's Encrypt's check; players use 443. Install Docker with its
Compose plugin (version 2.23 or newer, for the inline configs) and git.

**2. Check out the repository and fill in `.env`:**

```sh
git clone https://github.com/fjaeckel/seriesoftubes.git
cd seriesoftubes/relay
cp .env.example .env
nano .env
```

Three settings matter at first ("Required" and "Your server"); everything else sits commented out under "Advanced
(optional)" with its default, each explained in [`.env.example`](../relay/.env.example) (uncomment a line to change
it):

| Setting | What to put |
| --- | --- |
| `RELAY_DOMAIN` | Your name, `relay.example.net`. The node's address becomes `wss://relay.example.net/fed`. |
| `LETSENCRYPT_EMAIL` | An address for expiry warnings. **Setting it means you accept the [Let's Encrypt subscriber agreement](https://letsencrypt.org/repository/)**: certbot runs without questions (`--agree-tos`). Read it first. |
| `RELAY_NAME` | Your server's name, unique in the server list. Also `RELAY_SYNC` (default `open`), `RELAY_LANGS` (default `en`), `RELAY_DESC`. |

Compose refuses to start without `RELAY_DOMAIN` and `LETSENCRYPT_EMAIL`. To try the setup first without using up
Let's Encrypt's limits, uncomment `CERTBOT_STAGING=true` (a certificate browsers do not trust); set it back to `false` and run
`docker compose up -d` again, and certbot replaces it.

**3. Start it:**

```sh
docker compose up -d --build
docker compose logs -f relay        # Ctrl-C stops watching
```

On the first start the relay ([`relay up`](RELAY.md#relay-up)) makes its keys and config, founds the server and prints
its **server identity**, the node key, your operator key's **public** half and the invite link, then waits for the
certificate ("waiting for the TLS certificate … not there yet") while certbot gets it, usually within a minute.
Then: "TLS certificate loaded" and "relay serving". `docker compose exec relay /relay status` shows it running; then
[test it with the game](#test-it-with-the-game).

**4. Back up the operator key now.** It is the control of your server, there is no reset, and backups leave it out on
purpose ([why](#first-run-found-your-server)). The log prints the command:

```sh
docker compose cp relay:/data/operator.key ./operator.key
```

Move that file off the server (a password manager, a USB stick in a drawer) and delete the copy there. Through a
remote context (below) the command copies it straight to your own computer.

**From your own computer, over SSH.** Docker can run everything on the server from a checkout on your machine: the
build context is sent over SSH and built on the server, and the Compose file uses only named volumes and inline
configs, so nothing has to be copied there first.

```sh
docker context create tubes --docker host=ssh://you@relay.example.net
cd seriesoftubes/relay && cp .env.example .env && nano .env
docker --context tubes compose up -d --build
docker --context tubes compose logs -f relay
docker --context tubes compose cp relay:/data/operator.key ./operator.key    # lands on your computer
```

**What runs.** Two services and three named volumes:

| | What |
| --- | --- |
| `relay` | The relay, built from `relay/` (or pulled as `RELAY_IMAGE`), serving `wss://…/fed` with TLS on 443. Metrics on port 9100 stay on the Compose network; the file shows, commented, how to publish them to `127.0.0.1` for a Prometheus on the same machine. |
| `certbot` | Gets the certificate on its first start (`--standalone` on port 80, retrying with growing pauses while DNS or the port is not ready), renews every 12 hours (certbot renews only certificates due within 30 days) and after each issuance copies the pair into `relay_certs` as the relay's user, both files under temporary names first. The relay rereads it within a minute, without a restart. |
| `relay_data` | Keys, config and records. |
| `relay_certs`, `letsencrypt_certs` | The pair as the relay reads it; certbot's account, certificates and renewal settings. |

No access logs anywhere: nothing sits in front of the relay, and the relay never logs addresses, as your `noLogs`
promise requires ([your duties](#logs-and-privacy-your-duties)).

**Day to day.** Commands run in the container: `docker compose exec relay /relay status` (`players`, `ops pending`,
and the rest of [RELAY.md](RELAY.md#day-to-day)). Name, sync policy, languages and description are in the server's
signed record: change them with `docker compose exec relay /relay ops server --name "…"`, and in `.env` to match (the
relay logs any difference at start, with that command). `RELAY_NOTIFY_URL` and trusted proxies follow `.env` on every
start. Other settings are in `config.json`, in the `relay_data` volume; the image has no shell, so edit it with the
`toolbox` service (busybox `vi`, as the relay's user), then reload:

```sh
docker compose run --rm toolbox                 # edits /data/config.json
docker compose kill -s HUP relay                # most settings; listen, metrics, TLS: docker compose restart relay
```

**Backups:** `docker compose exec relay /relay backup /data/backup.tar.gz`, then
`docker compose cp relay:/data/backup.tar.gz ./` and `docker compose run --rm toolbox rm /data/backup.tar.gz`.

**Updating:**

```sh
cd seriesoftubes && git pull
cd relay && docker compose up -d --build
```

A checkout build reports its version as `dev` (and so gets no update notices); set `RELAY_VERSION` in `.env` to the
release you checked out (`git checkout vX.Y.Z`) to have it reported. Or run a published release instead of building:
set `RELAY_IMAGE=ghcr.io/fjaeckel/seriesoftubes-relay:X.Y.Z` and `docker compose pull && docker compose up -d`.

**A second node of an existing server** (yours or a co-operator's, on another machine): in that machine's `.env`,
uncomment `RELAY_JOIN` under "Advanced" and set it to the server identity; nothing else (`RELAY_NAME` and the rest of
"Your server" are not used). The relay finds the server's nodes in the game's server list and fetches the server's
records from one that answers. The first start prints the `relay ops propose add-node …` line, and the log repeats it
while the node waits: the server's operators run it (`docker compose exec relay /relay ops propose add-node …` on a
running node) and a majority sign it; within a minute the new node is on the list and syncing
([adding a node](RELAY.md#adding-a-second-operator-and-their-node)). Only a server that is not listed (new, unlisted,
private or on a LAN) also needs `RELAY_JOIN_FROM`, a running node's `wss://` URL.

**Testing the setup without a real certificate** (on your own computer, say): set a made-up `RELAY_DOMAIN`, other
ports (`RELAY_HTTPS_PORT=18443`, `RELAY_HTTP_PORT=18080`) and `CERTBOT_STAGING=true` (uncommented under "Advanced"). certbot cannot get a certificate
and retries; the relay founds the server and waits. Hand it a self-signed pair the way certbot's hook does, and it
starts serving within the minute:

```sh
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 7 -subj /CN=relay.example.test \
  -addext subjectAltName=DNS:relay.example.test -keyout testcert/privkey.pem -out testcert/fullchain.pem
docker compose cp testcert certbot:/tmp/testcert
docker compose exec -e RENEWED_LINEAGE=/tmp/testcert certbot sh /hook.sh
docker compose logs relay              # "TLS certificate loaded", "relay serving"
docker compose down -v                 # afterwards: removes the test server and its volumes
```

**Not with Compose: LAN parties.** `relay lan` puts the machine's `.local` name and LAN addresses into its certificate
and invite links; in a container it would see the container's addresses instead (and Docker Desktop on macOS and
Windows has no host network to give it), so run the program itself: [LAN party](#lan-party).

**Prefer Caddy in front**, or no Docker at all? The paths below do the same by hand: Caddy (path A), certbot with your
own Compose file (A2), the binary with systemd (B).

## Path A: a VPS with Docker Compose and Caddy

A rented Linux server, Docker, the published relay image, and [Caddy](https://caddyserver.com) in front of it, which
gets and renews the Let's Encrypt certificate by itself. Choose it if you want a proxy in front (to serve other sites
from the same machine, say); otherwise [from the repo](#from-the-repo-recommended) needs less writing.

**1. Rent a VPS** with a public IPv4 address (IPv6 too if offered) and a recent Debian or Ubuntu. Log in with SSH.

**2. Point your name at it.** At your DNS provider, create an **A** record from your name to the VPS's IPv4 address,
and an **AAAA** record to its IPv6 address if it has one:

```
relay.example.net.   3600  IN  A     203.0.113.10
relay.example.net.   3600  IN  AAAA  2001:db8::10
```

Check it from your own computer: `dig +short relay.example.net` (or `nslookup relay.example.net`) prints the address.
New records can take a few minutes to show up.

**3. Open ports 80 and 443** in the VPS provider's firewall, and in the server's own if it has one
(`sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`). Port 80 is only for Let's Encrypt to check that you own the name;
players use 443.

**4. Install Docker** with its Compose plugin (Docker's documentation, "Install Docker Engine" for your distribution),
then make a folder for the server:

```sh
mkdir ~/tubes && cd ~/tubes
sudo install -d -o 65532 -g 65532 -m 0700 relay-data   # the relay runs as uid 65532 and keeps everything here
```

**5. Write `compose.yaml`:**

```yaml
# Series of Tubes relay behind Caddy. docs/HOSTING.md, path A.
services:
  relay:
    image: ghcr.io/fjaeckel/seriesoftubes-relay:latest   # or pin a release: :X.Y.Z
    restart: unless-stopped
    volumes:
      - ./relay-data:/data
    networks: [tubes]
    # No ports: only Caddy reaches the relay (8080), and only the Docker network reaches its metrics (9100).

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data        # the certificate and Let's Encrypt account: keep it
      - caddy-config:/config
    networks: [tubes]

networks:
  tubes:
    ipam:
      config:
        - subnet: 172.30.0.0/24   # fixed, so the relay can trust Caddy's X-Forwarded-For from it

volumes:
  caddy-data:
  caddy-config:
```

**6. Write `Caddyfile`** (your name instead of `relay.example.net`):

```caddy
relay.example.net {
	# No `log` directive: Caddy then writes no access log, as your noLogs promise requires.
	# Caddy sets X-Forwarded-For to the player's address itself; the relay uses it in memory only.
	reverse_proxy /fed relay:8080
}
```

**7. Make the relay's data folder** (keys and config) and found your server ([First run](#first-run-found-your-server)
explains each step):

```sh
docker compose run --rm relay init --url wss://relay.example.net/fed --trusted-proxies 172.30.0.0/24
docker compose run --rm relay genesis --name "Packet Lunch" --sync open --langs en --desc "Small, friendly, always on."
sudo cp relay-data/operator.key ~/operator.key.backup && sudo chown "$USER" ~/operator.key.backup
```

`--trusted-proxies` makes the relay believe the `X-Forwarded-For` header from Caddy's network. Without it every player
seems to come from Caddy and shares one connection limit, and the relay warns at start ("listen is not on loopback but
trustedProxies trusts loopback only"). Trust only a network on which nothing but your proxy reaches the relay.

**8. Start it:**

```sh
docker compose up -d
docker compose logs -f          # Caddy gets the certificate within a minute; Ctrl-C stops watching
docker compose exec relay /relay status
```

Then [test it with the game](#test-it-with-the-game).

**Commands** run inside the container: `docker compose exec relay /relay COMMAND` (for example `status`, `players`,
`ops pending`); they talk to the running relay over its local socket in `/data`. **Config changes:** edit
`relay-data/config.json` (`sudo nano relay-data/config.json`), then `docker compose kill -s HUP relay` (most settings)
or `docker compose restart relay` (listen, metrics and TLS settings).

## Path A2: Docker Compose, the relay serving TLS with certbot

[From the repo](#from-the-repo-recommended) sets this up for you; this section is the same by hand, with bind-mounted
folders, for your own Compose file. The relay can terminate TLS itself, with a certificate from Let's Encrypt
fetched by [certbot](https://certbot.eff.org) in a container of its own. The relay rereads the certificate when its
files change (it looks at most once a minute), so renewals need no restart. Caddy (path A) is simpler; this path has
fewer moving parts at run time.

How it fits together: certbot answers Let's Encrypt's check on **port 80** itself (`--standalone`: no web server
needed, and nothing else uses port 80 here), keeps its state in `./letsencrypt`, and after every issuance and renewal
runs a small hook that copies the certificate and key into `./certs`, owned by the relay's user. The relay listens on
8443 inside its container, published as **443**.

**1.** Steps 1 to 4 of path A (VPS, DNS records, ports 80 and 443 open, Docker, `relay-data`). Then:

```sh
cd ~/tubes
sudo install -d -o 65532 -g 65532 -m 0700 certs
mkdir letsencrypt
```

**2. Write `certbot-hook.sh`** and make it executable (`chmod +x certbot-hook.sh`):

```sh
#!/bin/sh
# Run by certbot after each issuance and renewal: copy the pair where the relay (uid 65532) reads it.
# Both files are written under temporary names first, so the relay never sees a half-copied pair.
set -eu
umask 077
cp -L "$RENEWED_LINEAGE/fullchain.pem" /certs/.fullchain.pem.new
cp -L "$RENEWED_LINEAGE/privkey.pem" /certs/.privkey.pem.new
chown 65532:65532 /certs/.fullchain.pem.new /certs/.privkey.pem.new
mv /certs/.privkey.pem.new /certs/privkey.pem
mv /certs/.fullchain.pem.new /certs/fullchain.pem
```

**3. Write `compose.yaml`:**

```yaml
# Series of Tubes relay serving TLS itself, certificates from certbot. docs/HOSTING.md, path A2.
services:
  relay:
    image: ghcr.io/fjaeckel/seriesoftubes-relay:latest   # or pin a release: :X.Y.Z
    restart: unless-stopped
    ports:
      - "443:8443"
    volumes:
      - ./relay-data:/data
      - ./certs:/certs:ro
    networks: [tubes]

  # Renews every 12 hours (certbot renews only certificates due within 30 days) and runs the hook after each renewal.
  certbot:
    image: certbot/certbot:latest   # or pin a release
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./letsencrypt:/etc/letsencrypt
      - ./certs:/certs
      - ./certbot-hook.sh:/hook.sh:ro
    entrypoint: /bin/sh -c 'trap exit TERM; while :; do certbot renew --standalone --quiet; sleep 12h & wait $${!}; done'
    networks: [tubes]

networks:
  tubes: {}
```

**4. Get the first certificate** (before starting anything, so port 80 is free). Use your name and an email address
for expiry warnings; `--agree-tos` accepts the Let's Encrypt subscriber agreement, so read it first:

```sh
docker compose run --rm --service-ports --entrypoint certbot certbot certonly --standalone \
  -d relay.example.net -m you@example.net --agree-tos --no-eff-email --deploy-hook /hook.sh
sudo ls -l certs/        # fullchain.pem and privkey.pem, owned by 65532
```

certbot remembers the hook for every renewal of this certificate.

**5. Make the data folder and found the server**, pointing the relay at the certificate:

```sh
docker compose run --rm relay init --url wss://relay.example.net/fed --listen 0.0.0.0:8443 \
  --tls-cert /certs/fullchain.pem --tls-key /certs/privkey.pem
docker compose run --rm relay genesis --name "Packet Lunch" --sync open --langs en
sudo cp relay-data/operator.key ~/operator.key.backup && sudo chown "$USER" ~/operator.key.backup
docker compose up -d
docker compose logs relay       # "TLS certificate loaded" with the expiry date, then "relay serving"
```

No proxy here, so `trustedProxies` stays loopback and the relay sees players' addresses directly (see
[Troubleshooting](#troubleshooting) if they all seem to come from one address).

**Check the renewal** now and then, or once after setting up:

```sh
docker compose exec certbot certbot renew --dry-run    # a test renewal against Let's Encrypt's staging service
docker compose exec certbot certbot certificates       # expiry dates
docker compose logs relay | grep -i certificate        # "TLS certificate reloaded notAfter=…" after each renewal
```

If a renewal ever leaves a broken pair, the relay keeps serving the one it has and logs "new TLS certificate not
loaded, keeping the one in service" once.

## Path B: the binary, systemd and a reverse proxy

For a Linux server without Docker.

**1. Install the relay** as in [Getting the relay](#getting-the-relay), to `/usr/local/bin/relay`.

**2. A user and a data folder** of its own (mode 0700: it holds your keys):

```sh
sudo useradd --system --home-dir /var/lib/relay --shell /usr/sbin/nologin relay
sudo install -d -o relay -g relay -m 0700 /var/lib/relay
```

**3. Initialise and found** as that user (see [First run](#first-run-found-your-server)):

```sh
sudo -u relay RELAY_DATA=/var/lib/relay relay init --url wss://relay.example.net/fed
sudo -u relay RELAY_DATA=/var/lib/relay relay genesis --name "Packet Lunch" --sync open --langs en
sudo cp /var/lib/relay/operator.key ~/operator.key.backup && sudo chown "$USER" ~/operator.key.backup
```

The relay listens on `127.0.0.1:8080`, only for the proxy on the same machine.

**4. The service**, `/etc/systemd/system/relay.service`:

```ini
[Unit]
Description=Series of Tubes relay
Documentation=https://github.com/fjaeckel/seriesoftubes/blob/main/docs/HOSTING.md
After=network-online.target
Wants=network-online.target

[Service]
User=relay
Group=relay
Environment=RELAY_DATA=/var/lib/relay
ExecStart=/usr/local/bin/relay serve
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
UMask=0077
# Up to 5000 players and 64 node sessions, each a connection.
LimitNOFILE=65536
# It needs its data folder and the network, nothing else.
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/relay
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
ProtectProc=invisible
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
MemoryDenyWriteExecute=true
SystemCallArchitectures=native
SystemCallFilter=@system-service
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now relay
journalctl -u relay -f
```

Two files in the data folder are worth knowing: `LOCK`, held by the running relay so a second `relay serve` on the
same folder refuses to start, and the **control socket** (mode 0600) through which `relay status`, `relay ops …` and
the other day-to-day commands talk to it. Run them as the relay's user:

```sh
alias relayctl='sudo -u relay RELAY_DATA=/var/lib/relay relay'
relayctl status
```

`sudo systemctl reload relay` rereads `config.json` (most settings); `sudo systemctl restart relay` for `listen`,
`metrics` and the TLS files.

**5. A reverse proxy with TLS.** Either:

- **Caddy** (`sudo apt install caddy`): put the `Caddyfile` from path A in `/etc/caddy/Caddyfile` with
  `reverse_proxy /fed 127.0.0.1:8080`, then `sudo systemctl reload caddy`. It fetches and renews the certificate itself.
- **nginx and certbot**: `sudo apt install nginx certbot`, the nginx `server` block from
  [RELAY.md, nginx](RELAY.md#nginx) (access log off, error log at `emerg`, WebSocket headers), and a certificate with
  `sudo certbot certonly --webroot -w /var/www/html -d relay.example.net --deploy-hook "systemctl reload nginx"`
  (the default nginx site serves `/var/www/html` on port 80). Debian's `certbot.timer` renews it twice a day; check with
  `sudo certbot renew --dry-run`.

Or let the relay serve TLS itself: `"listen": ":443"`, `"tlsCert"` and `"tlsKey"` in its config, and certbot with a
deploy hook that copies the pair to a folder the `relay` user reads (as in path A2's hook, with `chown relay:relay`).
Binding port 443 as an unprivileged user needs `AmbientCapabilities=CAP_NET_BIND_SERVICE` and
`CapabilityBoundingSet=CAP_NET_BIND_SERVICE` in the unit instead of the empty ones.

## Path C: a home server or Raspberry Pi

A Pi or an old PC at home works well for friends and small servers. The relay is the same (`linux-arm64` for a Pi with
a 64-bit OS, `linux-armv7` for 32-bit, `linux-armv6` for a Pi Zero); paths A and B apply on the Pi itself. What differs
is getting the internet to it.

**1. Are you behind CGNAT?** Many internet providers share one public IPv4 address between many customers
(carrier-grade NAT). Then nobody outside can reach your machine, whatever you set on your router. To tell:

- Look up the **WAN** (internet) address on your router's status page.
- Compare it with what any "what is my IP" website shows from inside your home.
- **Different**, or a WAN address in `100.64.0.0` to `100.127.255.255` (the CGNAT range) or a private range
  (`10.x`, `172.16.x` to `172.31.x`, `192.168.x`, a router behind another router): you are behind (CG)NAT.
  **The same**: you have a public address. Go on to step 2.

Behind CGNAT, your options are:

- **Ask your provider** for a public IPv4 address. Many give one on request, sometimes for a small fee.
- **Rent a small VPS** and run the relay there (path A). Often the least trouble.
- **A tunnel to a VPS**: the VPS has the public address and Caddy; the relay stays at home. A reverse SSH tunnel is
  enough (`autossh` keeps it up):

  ```sh
  # On the Pi: the VPS's port 8080 (its loopback only) leads to the relay on the Pi.
  autossh -M 0 -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -R 127.0.0.1:8080:127.0.0.1:8080 tunnel@vps.example.net
  ```

  On the VPS, Caddy proxies to `127.0.0.1:8080` as in path B. The relay sees the tunnel's connections from loopback,
  which it trusts, so Caddy's `X-Forwarded-For` reaches it. WireGuard between the two machines works the same way
  (proxy to the Pi's WireGuard address, and add that address's network to `trustedProxies`).

IPv6 alone does not solve it: many players still have no IPv6.

**2. Give the Pi a fixed address on your network**: a DHCP reservation in the router (by the Pi's MAC address), so
port forwarding keeps pointing at it.

**3. Forward the ports** in the router ("port forwarding", "virtual server" or "NAT"): TCP **443** (and **80**, for the
certificate) from the internet to the Pi's address. Check from outside your network, for example on a phone with
Wi-Fi off: `https://relay.example.net/` should answer (Caddy says nothing for `/`; a timeout means the forwarding or a
firewall is wrong).

**4. A name that follows your address.** Home addresses change. Either your router has a dynamic-DNS client (look for
"DDNS"; it updates a name like `yourname.dyndns-provider.example` when your address changes), or a free DDNS service
gives you a name and a small updater to run on the Pi. Make that name your relay's, or point a CNAME from your own
domain at it:

```
relay.example.net.  3600  IN  CNAME  yourname.dyndns-provider.example.
```

With IPv6, give the AAAA record the **Pi's** address (not the router's), and allow port 443 to it in the router's IPv6
firewall: there is no NAT to forward through.

**5. Look after it:**

- **Storage.** SD cards wear out under constant small writes; a USB SSD lasts far longer. Either way, back up
  (`relay backup`, below) and keep `operator.key` somewhere else.
- **Power.** A good power supply; for a server people rely on, a small UPS. After a power cut the service starts by
  itself (`systemctl enable`, or `restart: unless-stopped` with Docker).
- **Updates.** Keep the OS updated (`unattended-upgrades` on Debian / Raspberry Pi OS) as well as the relay.
- **Your upload.** A home line's upload is often small; a hundred players is still only a fraction of a megabit on
  average.

## First run: found your server

The commands below are written plainly (`relay …`). With Docker it is `docker compose run --rm relay …` before the
relay runs and `docker compose exec relay /relay …` while it runs; with systemd, `relayctl …` (path B).
[From the repo](#from-the-repo-recommended), `relay up` does steps 1 and 2 on the first start from `.env`; what follows
explains what it made.

**1. `relay init --url wss://relay.example.net/fed`** makes the data folder with:

- `node.key`: this machine's key; it signs receipts and proves to players and other servers who it is.
- `operator.key`: **your** key. It is the control of the server: whoever holds it can change the server's
  operators, nodes, name and policy, and vote in shuns in its name. There is no password reset and no one to ask.
  **Copy it somewhere safe and offline now** (a password manager, a USB stick in a drawer). Backups leave it out on
  purpose. To use the same key on several machines, pass `--operator-key FILE` to `init`.
- `config.json`: the settings. The ones that matter first:

| Setting | What to put |
| --- | --- |
| `url` | Your node's public address, `wss://` + your name + `/fed`. It goes into your signed records. |
| `listen` | Where the relay listens: `127.0.0.1:8080` behind a proxy on the same machine; `0.0.0.0:8080` in a container (set for you). |
| `trustedProxies` | The networks your proxy connects from (loopback by default; add the Docker network in path A). |
| `metrics` | Where Prometheus reads metrics, or empty for none ([Monitoring](#monitoring-with-prometheus)). |
| `countryDb` | Optional: a country-only GeoIP database, so players who share their country show it. |
| `notifyURL` | Optional: an `https://` webhook the relay calls once per new release. |

Every setting is in [RELAY.md, the config file](RELAY.md#the-config-file).

**2. `relay genesis --name "Packet Lunch" --sync open --langs en --desc "…"`** founds the server: it signs the genesis
record (its id is your **server identity**, printed at the end) and the first server record. The name shows in games
and must be unique in the registry. `--sync` is who your server syncs with (below). `--no-logs` stays `true`: you
promise that nothing in front of the relay logs addresses ([your duties](#logs-and-privacy-your-duties)).

To make this machine a second node of an existing server instead, see
[RELAY.md, adding a node](RELAY.md#adding-a-second-operator-and-their-node).

**3. Start it** (`relay serve`, the systemd unit, or `docker compose up -d`) and look at **`relay status`**: server and
node, operators, open sessions, records held, disk use and the version.

### Test it with the game

Open the invite link in a browser: `https://seriesoftub.es/#join=wss://relay.example.net/fed`. The title screen's
"Play with others" switch is on with your server picked; start a game and sign the charter, and the game joins. In an
existing game the link opens the join sheet. `relay players` then lists your network. Share the same link with your
friends: anyone with it can join, listed or not.

If it does not connect, the browser's developer console (F12) usually says why; see [Troubleshooting](#troubleshooting).

### Update notices

Your relay checks for new releases by reading a small file next to the registry on the game's site (it sends nothing
about you when it does) and tells you in its log, in `relay status`, in metrics, in your game's operator panel and, if
you set `notifyURL`, by webhook. Security releases are marked as such: install those soon. Details in
[RELAY.md, versions and update notices](RELAY.md#versions-and-update-notices).

## Day two: listing, friends, backups, upgrades

**Getting listed** in the game's server list: run `relay registry-file > Packet-Lunch.json`, save it as
`federation/servers/<server identity>.json` in a fork of this repository and open a pull request. CI checks the
signatures and that a node answers; a maintainer merges. Requirements: a public host name (no IP addresses, no `.local`
names), `noLogs: true`, a unique name. Step by step: [federation/servers/README.md](../federation/servers/README.md).
Unlisted servers work just as well by invite link.

**Choosing a sync policy**: `standalone` (your players only see each other: a club, a class, a LAN party), `selective`
(you list the servers you sync with) or `open` (any server that is not standalone). Change it with
`relay ops server --sync selective`. An `open` server in the server list needs no neighbour configuration: it finds
the other open listed servers in the list and syncs with them by itself (`relay status` shows them under `auto`).
Neighbours in the config are only for extras: unlisted servers, a LAN party, a selective friend.
[RELAY.md, sync policy](RELAY.md#sync-policy-who-your-server-syncs-with).

**Friends as co-operators, and more nodes**: operators and nodes change by majority-signed proposals
(`relay ops propose add-operator KEY`, `relay ops sign ID`). A second node on another machine keeps the server up when
one goes down. [RELAY.md, adding a second operator](RELAY.md#adding-a-second-operator-and-their-node).

**Moderation**: `relay hide`, `relay shun`, `relay board` ([RELAY.md, day to day](RELAY.md#day-to-day)).

**Backups**: `relay backup /path/backup.tar.gz` writes a consistent copy of records, config and node key while the relay
runs (mode 0600). With Docker, write it into the data folder and copy it out:
`docker compose exec relay /relay backup /data/backup.tar.gz && sudo mv relay-data/backup.tar.gz ~/`. Keep backups
off the machine. `operator.key` is not in them: you saved it at the first run.

**Restoring** on a new machine: install the relay, unpack the backup into an empty data folder owned by the relay's
user (`sudo -u relay tar xzf backup.tar.gz -C /var/lib/relay`; with Docker, into `relay-data` with
`sudo tar xzf … -C relay-data && sudo chown -R 65532:65532 relay-data`), put `operator.key` back next to it, point your
DNS at the new machine, start. If the node lost everything instead, the server's other nodes and the servers it syncs
with fill most of it back in ([RELAY.md, backups](RELAY.md#upgrades-backups-and-data)).

**Upgrades**: the data folder migrates itself on start, and servers speak the older protocol version until both sides
have upgraded, so upgrade whenever suits you.

```sh
# From the repo: git pull, then in relay/: docker compose up -d --build
# Docker (path A): :latest or :X.Y moves by itself; a pinned :X.Y.Z, edit compose.yaml first.
docker compose pull && docker compose up -d
# Binary (path B): fetch and check the new archive as in "Getting the relay", then
sudo install -m 0755 tubes-relay-$V-linux-amd64/relay /usr/local/bin/relay && sudo systemctl restart relay
```

A relay never runs on a data folder written by a newer relay: to go back a version, restore the backup you made before.

## Monitoring with Prometheus

The relay serves Prometheus metrics at `/metrics` when `metrics` is set: counts and versions only, never an address, a
key or a name ([RELAY.md, metrics](RELAY.md#metrics)). On a machine of its own, keep it on loopback
(`"metrics": "127.0.0.1:9100"`) and run Prometheus there, or reach it through an SSH tunnel. In a container the image
listens on `0.0.0.0:9100` with `"metricsPublic": true`, so a Prometheus **on the same Docker network** can scrape
`http://relay:9100/metrics`. Keep port 9100 off the internet: don't publish it in `compose.yaml`, or firewall it to your
monitoring host. Without `metricsPublic` the relay refuses any address but localhost, and with it, it warns at start.

A scrape job for your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: tubes-relay
    metrics_path: /metrics
    scrape_interval: 30s        # counters and gauges change slowly; 15s to 60s are all fine
    scrape_timeout: 10s
    static_configs:
      - targets: ['relay:9100']           # the compose service name, or relay.internal:9100, 127.0.0.1:9100…
        labels:
          server: packet-lunch            # your server, for dashboards that show several
          node: fra1
```

**Several nodes of one server**: one target per node, each with its own `node` label and the same `server` label. With
many, list them together and let relabeling name the node after its host:

```yaml
scrape_configs:
  - job_name: tubes-relay
    metrics_path: /metrics
    scrape_interval: 30s
    static_configs:
      - targets: ['fra1.relay.internal:9100', 'ams1.relay.internal:9100']
        labels:
          server: packet-lunch
    relabel_configs:
      - source_labels: [__address__]
        regex: '([^.:]+).*'               # fra1.relay.internal:9100 -> node="fra1"
        target_label: node
```

Alerting rules (a rules file listed under `rule_files:`), with the relay's own metric names:

```yaml
groups:
  - name: tubes-relay
    rules:
      - alert: RelayDown
        expr: up{job="tubes-relay"} == 0
        for: 5m
        labels:
          severity: page
        annotations:
          summary: 'Relay {{ $labels.node }} ({{ $labels.instance }}) has not answered a scrape for 5 minutes'

      - alert: RelaySecurityUpdate
        expr: relay_update_available{security="true"} == 1
        labels:
          severity: page
        annotations:
          summary: 'A relay release fixing a security issue is out; {{ $labels.instance }} runs an older one'
          description: 'See relay status or the log line "relay update available" for the version and release notes.'

      - alert: RelayUpdateAvailable
        expr: relay_update_available{security="false"} == 1
        for: 3d
        labels:
          severity: info
        annotations:
          summary: 'A newer relay has been out for 3 days; {{ $labels.instance }} has not been updated'

      - alert: RelayRateLimitingSpike
        expr: sum by (instance) (rate(relay_refused_total{code="rate_limited"}[10m])) > 2
        for: 15m
        labels:
          severity: warn
        annotations:
          summary: '{{ $labels.instance }} refuses over 2 messages a second as rate_limited'
          description: 'A flood, a misbehaving client, or every player behind one proxy address (check trustedProxies).'

      - alert: RelayMemoryHigh
        expr: process_resident_memory_bytes{job="tubes-relay"} > 1.5e9
        for: 30m
        labels:
          severity: warn
        annotations:
          summary: '{{ $labels.instance }} uses {{ $value | humanize1024 }}B of memory'

      - alert: RelayDiskGrowing
        expr: predict_linear(relay_disk_bytes[12h], 7 * 86400) > 20e9
        for: 1h
        labels:
          severity: warn
        annotations:
          summary: 'At this rate the record files of {{ $labels.instance }} pass 20 GB within a week'

      - alert: RelayFileDescriptors
        expr: process_open_fds{job="tubes-relay"} / process_max_fds{job="tubes-relay"} > 0.8
        for: 10m
        labels:
          severity: warn
        annotations:
          summary: '{{ $labels.instance }} has used 80% of its open files (raise LimitNOFILE or lower maxClients)'
```

**A Grafana dashboard** ready to import: [relay/grafana/tubes-relay.json](../relay/grafana/tubes-relay.json)
(Dashboards → New → Import, then pick your Prometheus). It shows players, sync, records, refusals, leaderboards and the
process, per server and node, using the `server` and `node` labels above.

Change the thresholds to suit your machine. Other series worth a graph: `relay_clients` and `relay_node_sessions`
(open connections), `relay_records_in_total` by `kind`, `relay_records`, `relay_refused_total` by `code`,
`relay_syncs_total`, `relay_rank_answers_total` by `cache` (hit or miss), `relay_build_info` and
`relay_latest_version_info`.

## Logs and privacy: your duties

Players trust your server with their games. What the relay does, and what is up to you:

- **The relay logs no addresses**, headers or user agents: counts, error codes, record kinds and network keys (public,
  pseudonymous game identities). Its metrics hold counts and versions only. It uses a player's address in memory only,
  for the per-address connection limit and (if you set `countryDb`) the country lookup, and forgets it.
- **What sits in front of it is yours.** `noLogs: true` in your server record is your promise that no proxy, load
  balancer or hosting control panel you run logs players' addresses. Caddy logs no requests unless told to; nginx needs
  `access_log off` and `error_log … emerg` ([RELAY.md, the reverse proxy](RELAY.md#the-reverse-proxy-with-access-logs-off)).
  A firewall or fail2ban that logs addresses breaks it too. If you cannot promise it, run unlisted with `--no-logs=false`.
- **What is kept** is in [RELAY.md](RELAY.md#upgrades-backups-and-data); `relay backup` copies it, so treat backups like
  the server. A player's `leave` removes their records for good.
- **Your logs** (journald or `docker compose logs`) contain no personal data from the relay, but keep them for a
  limited time anyway (journald: `SystemMaxUse=` or `MaxRetentionSec=`; Docker: the `json-file` driver's `max-size`).
- Depending on where you live, running a service for others may come with legal duties (an imprint, a contact, a
  privacy notice). This page is not legal advice.

## LAN party

No internet, no domain, no certificate authority: one machine runs `relay lan`, everyone else joins from their browser.

### What you need

- A laptop or desktop (Linux, macOS or Windows) on the same network as the players: the party's Wi-Fi or switch.
  A guest Wi-Fi that isolates its clients from each other does not work; use the main network or your own router.
- The `relay` program for that machine ([Getting the relay](#getting-the-relay)).
- **Every player's device must have opened the game once while online**, in the browser they will play in. The
  game's service worker then keeps it, so `https://seriesoftub.es` opens without the internet. After that nothing at
  the party needs the internet: `relay lan` fetches nothing, and the game does without the server list.

### Start the server

```sh
relay lan                      # or: relay lan --name "The LAN Before Time" --port 8443
```

The first time, it makes a data folder `relay-lan` (kept apart from any other relay's; `--data` to choose), founds a
standalone server named after the `--name` flag, and makes a **self-signed certificate** covering this machine's mDNS
name (`yourmachine.local`), `localhost` and its LAN addresses (private IPv4 such as `192.168.1.20`, and IPv6 unique
local addresses). It listens on port 8443 on every interface and prints what the players need:

```
The LAN Before Time is ready for a LAN party on port 8443.
A new self-signed certificate was made: every device accepts it once (again).

On each device, once:
  1. Open the server's page and accept the certificate warning ("Advanced", "Proceed" / "Show details", "visit this website"):
       https://freds-laptop.local:8443/
       https://192.168.1.20:8443/
  2. Then join with the invite link the page shows, or one of these:
       https://seriesoftub.es/#join=wss://freds-laptop.local:8443/fed
       https://seriesoftub.es/#join=wss://192.168.1.20:8443/fed
```

Allow incoming connections when the system asks (macOS: "Accept incoming network connections?"; Windows: allow on
**private** networks; Linux with a firewall: `sudo ufw allow 8443/tcp`). Ctrl-C stops it. Next time, `relay lan` reuses
the server and the certificate (while it still covers the machine's addresses and is valid for another week), so
devices that accepted it before join straight away. A new address (another network, another DHCP lease) means a new
certificate and one more click per device.

### On each device

1. Open the server's page, `https://<name or address>:8443/`, and accept the warning about the certificate. This is the
   one step a self-signed certificate needs: browsers never ask about a WebSocket's certificate, but once you have
   accepted it for the page, the game's connection to the same address is allowed too.
2. The page (the relay's own small page, not the game) shows the server's name and an invite link for the address you
   used. Tap it: the game opens with "Play with others" on and the LAN server picked. Start a game and sign the charter.
   In a game already running, the link opens the join sheet; or type the address (`wss://…:8443/fed`) there.

### Phones and tablets

What was tested, and what was not:

- **Tested** (end to end, `node scripts/fed-e2e.js --lan`, with `--browser chromium`, `firefox` and `webkit`): each
  engine on the same machine opening the relay's page,
  taking its invite link by IP address and joining over `wss://` with the self-signed certificate. The test tells the
  browser to accept the certificate (`ignoreHTTPSErrors`), standing in for the click on the warning.
- **WebKit** (Safari's engine, via Playwright on macOS): with the certificate not accepted, both the page and the
  WebSocket are refused; with it accepted for the browser context, the WebSocket opens. The real "visit this website"
  exception a person grants in Safari could not be clicked in a test, so that path is **unverified**.
- **Not tested on real phones.** Expected, but unverified:
  - **Android (Chrome)**: often cannot open `.local` names. Use the link with the numeric address (`192.168.…`).
    The warning is "Your connection is not private" → "Advanced" → "Proceed to … (unsafe)".
  - **iPhone and iPad (Safari)**: "This Connection Is Not Private" → "Show Details" → "visit this website" → confirm.
    Whether Safari then lets the game's WebSocket through to that address is the unverified part. If it does not, a
    laptop is the fallback for those players, or the certificate route below.
  - Recent Chrome and Edge may ask whether `seriesoftub.es` may "access devices on your local network" when the game
    connects to a LAN address: allow it.

**The most robust alternative for phones**: a real certificate for a LAN address. If you own a domain, give a name such
as `lan.example.net` an A record with the party machine's LAN address (`192.168.1.20`), get a Let's Encrypt certificate
for it with a **DNS-01** challenge before the party (certbot's DNS plugins; no open ports needed), and run a normal
relay with `relay init --url wss://lan.example.net:8443/fed --listen 0.0.0.0:8443 --tls-cert … --tls-key …`,
`relay genesis --sync standalone …` and `relay serve`. Every device then trusts it without a warning, but needs to look
up the name, so this needs DNS (or the internet) at the party.

### Notes

- The server is **standalone** and not listed anywhere; the registry refuses `.local` names and IP addresses anyway.
- The certificate and keys stay in the data folder (`lan-cert.pem`, `lan-key.pem`, `node.key`, `operator.key`); delete
  the folder to start afresh. Players' saves keep the server, and reconnect at the next party at the same address.
- The day-to-day commands work as for any relay, given the LAN folder: `relay status --data relay-lan`.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The game says the server cannot be reached; the browser console shows a certificate error (`ERR_CERT_…`) | Self-signed, expired or wrong-name certificate | A public server needs a certificate from a public CA for exactly the name in the URL. Check with `curl -v https://relay.example.net/fed` (it must not complain about the certificate). LAN: open the server's page first and accept the warning. |
| Timeout from outside, works on the machine itself | Port closed or not forwarded | Provider firewall, `ufw`, router port forwarding to the right machine (TCP 443, and 80 for the certificate). Test from a phone off Wi-Fi. |
| Works for you at home, nobody outside can reach it | CGNAT or a double NAT | [Path C, step 1](#path-c-a-home-server-or-raspberry-pi): compare WAN and public addresses; ask for a public IPv4, use a VPS or a tunnel. |
| Caddy or certbot cannot get a certificate | The name does not point at this machine yet, or port 80 is closed or taken | `dig +short relay.example.net`; open port 80; stop whatever else listens on it (`sudo ss -ltnp 'sport = :80'`). |
| Connects, then drops at once; the game reports `not_node` | The URL in the game leads to a relay whose node key is not on the server's node list (a node added but not yet signed, a data folder swapped) | `relay nodes` and `relay ops pending`: finish the `add-node` or `set-node` proposal; check the URL in the config matches the one in the records. |
| `too_new` or `too_old` refusals; records or proofs not accepted | The machine's clock is off | Enable time sync: `timedatectl set-ntp true` (Linux), or the system setting. Records may be at most 10 minutes ahead of a checker's clock. |
| Players get `rate_limited` often; all players show the same country or none; the relay warned about `trustedProxies` at start | Behind a proxy that is not trusted, so every player seems to come from the proxy's address and shares one limit | Add the proxy's network to `trustedProxies` (path A: `172.30.0.0/24`), restart. With Docker publishing ports for IPv6 through its userland proxy, IPv6 players may also share an address: enable IPv6 in Docker or front the relay with Caddy on the host network. |
| `relay status` says it cannot connect | The relay is not running, or you used another data folder or user | Run it as the relay's user with the same `RELAY_DATA` (path B's `relayctl`), or with `docker compose exec relay /relay status`. |
| `a relay is already serving this data folder` | Another relay holds its `LOCK` | Stop the other one (`systemctl stop relay`, `docker compose down`); one relay per folder. |
| `metrics must listen on localhost only` | `metrics` beyond loopback without the opt-in | Keep it on `127.0.0.1`, or set `"metricsPublic": true` and keep the port off the internet. |
| `new TLS certificate not loaded, keeping the one in service` in the log | A renewal left a certificate and key that do not match, or unreadable files | Check the hook's output and file owners (`sudo ls -l certs/`); the relay picks up the next good pair within a minute. |
| Registry pull request fails with `local_url` | A node URL is an IP address or a `.local` name | Listed servers need a public host name; give the node one (`relay ops propose set-node … --url wss://…`). |
| LAN: a phone cannot open `https://….local:8443/` | The phone does not resolve mDNS names (common on Android) | Use the numeric address link. |
| LAN: the page opens but the game cannot connect | The certificate was accepted for one address and the invite uses another, or a "local network access" prompt was declined | Use the invite shown on the page you accepted (it is made for that address); allow local network access in the browser's site settings. |
