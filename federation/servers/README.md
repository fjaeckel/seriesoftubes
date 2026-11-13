# The server registry

This folder is the list of Multimode servers (the game's multiplayer) that Series of Tubes shows its players. One file per server, added and
changed by pull request, checked by CI and merged by a maintainer. Each release turns the folder into
`https://seriesoftub.es/federation/servers.json`, a plain static file the game reads; nothing else is involved.

The rules are in [the protocol, section 11](../../docs/FEDERATION-PROTOCOL.md#11-the-registry) and the reasons in
[ADR 0005](../../docs/adr/0005-federation-by-player-run-servers.md). This page is the how-to for operators.

## Before you start

- A running relay that answers on a public `wss://` address with a real TLS certificate (browsers refuse anything
  else from an HTTPS page), at a host name: the registry refuses IP addresses and `.local` names, which are for LAN
  servers. [How to host a server](../../docs/HOSTING.md) walks through it; [RELAY.md](../../docs/RELAY.md) is the
  reference.
- **No address logs, anywhere.** Listing a server means its operators declare `noLogs: true`: neither the relay nor
  anything in front of it (reverse proxy, load balancer, CDN, hosting provider's access logs you control) logs
  players' IP addresses. A file with `noLogs: false` is refused. If you cannot promise that, run your server unlisted:
  players can still join it by address or invite link.
- Players read what a listed server keeps, and never keeps, on the game's
  [privacy page](https://seriesoftub.es/privacy.html) (source: `site/privacy.html`). A listed server keeps that promise.
- A name no other listed server uses (compared ignoring the case of `A`–`Z`).

## Listing a server

1. On a node of your server, run `relay registry-file`. It prints the signed registry file: your `genesis` record,
   the operator changes since (the chain) and your current `server` record, signed by a majority of your operators.
2. Save it as `federation/servers/<server identity>.json`, where the identity is your genesis record's id (the relay
   prints it, and the file name has to match it exactly).
3. Open a pull request that adds only that file. Do not edit the file by hand: every record in it is signed, and any
   change breaks a signature.

One file per server, so pull requests from different servers never conflict.

## What CI checks

The `registry` job in `ci.yml` runs `relay check-registry` on every file a pull request adds or changes, the same
binary you run, so there is one definition of "valid":

1. The file is at most 65536 bytes of JSON with only `v`, `genesis`, `chain`, `server` (and the two stamps below).
2. Every record is well formed and correctly signed.
3. The file name is `<genesis id>.json`.
4. The chain starts at the genesis record and each operator change follows the one before, signed by a strict
   majority of the operators at that point.
5. The `server` record is at the last head of the chain, its operator and node lists match it, and a majority signed it.
6. `noLogs` is `true`, and every node URL names a public host: no IP address, no `.local` name (`local_url`).
7. No other file uses the same name.
8. `listed` and `answered` are unchanged (only the weekly job writes them).
9. At least one of your nodes answers: CI connects to each node's URL in turn (10 s each), sends a challenge, and
   checks the answer is signed by that node's key. Keep a node up while the pull request is open.

A failing check prints the file, the step and the error code (for example `no_majority` or `no_answer`). Fix it, push
again, and CI reruns. Passing CI proves the file is genuine and the server reachable; a maintainer merging it says it
belongs on the list.

## After your pull request is merged

The next site build publishes your server in `federation/servers.json`. Players see it in their server list, and if
your server is `open`, the other open servers' relays start syncing with yours at their next registry refresh (within
6 hours): the check on your pull request counts as your first answer, so you do not wait for the weekly job. Of each
pair the server whose identity sorts first dials; if that one runs an older relay that does not, yours dials it after
15 minutes. The first weekly run then stamps `listed` (and `answered` if a node answers); a server that never answers
it is removed 14 days later. Votes on shuns count only from servers listed for 30 days.

## Changing a listing

Any operator runs `relay registry-file` again after the change (new node, new operator, new description, new sync
policy) and opens a pull request replacing the file. Operator and node changes carry the majority signatures they
needed anyway; the file just carries them along. `listed` and `answered` must stay exactly as they are in the current
file, or CI refuses the pull request. `relay registry-file` takes care of that: run from a checkout of this repository
it copies them from `federation/servers/<id>.json`, and `--from FILE` names the current file anywhere else:

```bash
relay registry-file --from ~/seriesoftubes/federation/servers/<id>.json > new.json
mv new.json ~/seriesoftubes/federation/servers/<id>.json
```

Write to a new file first: `> federation/servers/<id>.json` empties the old file before the relay can read its stamps.

## Leaving

Open a pull request deleting the file. Players who already know your server keep it in their own list until it stops
answering.

## Staying listed: the weekly check

Every week `federation-liveness.yml` challenges every listed server's nodes. In one pull request for a maintainer to
merge, it:

- sets `listed` (the day it first saw the file) on files that have none,
- sets `answered` to the day a node last answered,
- removes files that have not answered for 14 days.

Those two fields are the job's only memory, kept in the files themselves, so nothing else needs storing. Days are
written as unix seconds at 00:00 UTC. A server removed this way can come back with a new pull request once it answers
again.
