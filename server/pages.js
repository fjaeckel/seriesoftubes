// Server-rendered pages: plain HTML and a little CSS, no client-side JavaScript at all. They work on
// anything with a browser, and they are what a bgp.tools-style AS page looks like for this world.
'use strict';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, d = 0) => (Number.isFinite(+n) ? (+n).toLocaleString('en-US', { maximumFractionDigits: d }) : '–');
const gbps = (g) => (g >= 1000 ? (g / 1000).toFixed(g >= 10000 ? 1 : 2) + ' Tbps' : (g >= 100 ? g.toFixed(0) : (+g).toFixed(1)) + ' Gbps');
const money = (v) => { const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(1) + 'k' : s + '$' + Math.round(a); };

const CSS = `
:root{--ink:#1E2640;--ink2:#55608A;--paper:#fff;--soft:#EEF5FB;--line:#D5DEEC;--me:#FF4F9A;--sun:#FFD23F;--ok:#22C47A;--bad:#FF4D5E;--sea:#57C4E5}
*{box-sizing:border-box}body{margin:0;background:var(--sea);color:var(--ink);font:16px/1.45 Nunito,system-ui,-apple-system,sans-serif}
a{color:var(--me);font-weight:800}header.top{background:var(--ink);color:#fff;display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;padding:8px 16px}
header.top a{color:#fff;text-decoration:none;font-weight:800}header.top b.brand{font:800 20px 'Baloo 2','Trebuchet MS',system-ui,sans-serif;color:var(--sun)}header.top .sp{flex:1}
main{max-width:1000px;margin:14px auto;padding:0 12px}.card{background:var(--paper);border:3px solid var(--ink);border-radius:16px;padding:12px 16px;margin:0 0 14px;box-shadow:0 4px 0 var(--ink)}
h1,h2,h3{font-family:'Baloo 2','Trebuchet MS',system-ui,sans-serif;margin:.2em 0}h1{font-size:30px}h2{font-size:22px}h3{font-size:17px}
.eyebrow{font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}.meta{color:var(--ink2);font-size:13px}
table{border-collapse:collapse;width:100%;font-size:14px}th{text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;background:var(--soft);padding:5px 8px;border-bottom:2px solid var(--ink)}
td{padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}td.n,th.n{text-align:right;white-space:nowrap}.scroll{overflow-x:auto}
.kv{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed var(--line);padding:3px 0}.kv b{text-align:right}
input,select,button{font:inherit;border:3px solid var(--ink);border-radius:12px;padding:6px 10px;background:var(--soft)}button,.btn{background:var(--sun);font-weight:900;cursor:pointer;box-shadow:0 3px 0 var(--ink);text-decoration:none;color:var(--ink);display:inline-block}
button.pink,.btn.pink{background:var(--me);color:#fff}button.ghost{background:var(--paper)}form.inline{display:inline}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}
.tag{display:inline-block;border:2px solid var(--ink);border-radius:7px;padding:0 6px;font-size:11px;font-weight:900;text-transform:uppercase;background:var(--soft)}
.ok{color:#0c8a52;font-weight:800}.bad{color:#c4001a;font-weight:800}.err{background:#FFE3E6;border:3px solid var(--bad);border-radius:12px;padding:8px 12px;margin:0 0 12px}
.note{background:#FFF8D6;border:2px solid var(--ink);border-radius:12px;padding:8px 12px;margin:0 0 12px}code{background:var(--soft);padding:0 4px;border-radius:5px}
.disc{font-size:12px;color:var(--ink);opacity:.8;max-width:1000px;margin:0 auto;padding:6px 14px 22px}.pill{display:inline-block;background:var(--soft);border:2px solid var(--ink);border-radius:999px;padding:0 10px;font-weight:800;font-size:13px}
@media(max-width:600px){h1{font-size:24px}td,th{padding:4px 5px}}
`;

const DISCLAIMER = 'Series of Tubes is a work of fiction. Network, exchange and cable names are used only to identify real-world organisations; there is no affiliation with or endorsement by any of them, and everything that happens to them here is invented for play. Footprints come from public PeeringDB records and may be incomplete or out of date. Trademarks belong to their owners.';

function layout({ title, body, version }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Series of Tubes</title><meta name="robots" content="noindex"><style>${CSS}</style></head><body>
<header class="top"><b class="brand">Series of Tubes</b><a href="/search">Networks</a><a href="/">Play</a></header>
<main>${body}</main><p class="disc"><b>Fiction.</b> ${esc(DISCLAIMER)} Based on <a href="https://github.com/fjaeckel/seriesoftubes">Series of Tubes</a> by Frederic Jung (<a href="https://seriesoftub.es">seriesoftub.es</a>).${version ? ` v${esc(version)}` : ''}</p></body></html>`;
}

const table = (head, rows, empty = 'Nothing here yet.') => `<div class="scroll"><table><thead><tr>${head.map((h) => `<th${/^#/.test(h) ? ' class="n"' : ''}>${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="meta">${esc(empty)}</td></tr>`}</tbody></table></div>`;
const asLink = (asn, label) => `<a href="/as/${Number(asn)}">${esc(label || 'AS' + asn)}</a>`;

/* ---------- AS pages (bgp.tools style) ---------- */
function rpkiCell(r) { return r === 'valid' ? '<span class="ok">valid</span>' : '<span class="bad">' + esc(r) + '</span>'; }
function playerAsPage({ v, meta, version }) {
  const seen = v.upstreams.length + v.peers.length;
  const body = `<div class="card"><div class="eyebrow">AS${v.asn} · player network${meta.online ? ` · ${meta.online} online` : ''}</div><h1>${esc(v.name)}</h1>
  <div class="kv"><span>Rank</span><b>${esc(v.tier)}</b></div><div class="kv"><span>Registry</span><b>${esc(v.rir)}</b></div><div class="kv"><span>Home</span><b>${esc(v.home)}</b></div>
  <div class="kv"><span>Reachability</span><b>${Math.round(v.reach * 100)}% of the internet</b></div><div class="kv"><span>RPKI</span><b>${rpkiCell(v.rpki)}</b></div>
  <div class="kv"><span>Upstreams · peers · POPs</span><b>${v.upstreams.length} · ${v.peers.length} · ${v.pops.length}</b></div><div class="kv"><span>Game day</span><b>${num(v.day)}</b></div>
</div>
  <div class="card"><h2>Upstreams</h2>${table(['AS', 'Network', 'Where', 'Port', '#Traffic', '#Routes'], v.upstreams.map((u) => `<tr><td>${asLink(u.asn)}</td><td>${esc(u.name)}${u.down ? ' <span class="bad">down</span>' : ''}</td><td>${esc(u.city)}</td><td>${esc(u.port)}</td><td class="n">${gbps(u.gbps)}</td><td class="n">${num(u.routes)}</td></tr>`), 'No upstream yet: this network cannot reach the internet.')}</div>
  <div class="card"><h2>Peers</h2>${table(['AS', 'Network', 'Type', 'Sessions', '#Traffic'], v.peers.map((p) => `<tr><td>${asLink(p.asn)}</td><td>${esc(p.name)}</td><td>${esc(p.type)} · ${esc(p.policy)}</td><td>${p.sessions.map((s) => `<span class="tag">${esc(s.kind)}</span> ${esc(s.where)}, ${esc(s.city)} <span class="meta">(${esc(s.how)})</span>`).join('<br>')}</td><td class="n">${gbps(p.gbps)}</td></tr>`))}</div>
  <div class="card"><h2>Prefixes</h2>${table(['Prefix', 'Origin', 'RPKI', 'IRR', '#Seen by'], v.prefixes.map((p) => `<tr><td><code>${esc(p.prefix)}</code></td><td>AS${p.origin}</td><td>${rpkiCell(p.rpki)}</td><td>${esc(p.irr)}</td><td class="n">${seen || p.seen} sessions</td></tr>`))}</div>
  <div class="card"><h2>POPs</h2><p>${v.pops.map((p) => `<span class="pill">${esc(p.name)}${p.cc ? ' · ' + esc(p.cc) : ''}${p.up ? '' : ' · down'}</span>`).join(' ')}</p></div>
  <div class="card"><h2>Paths from ${esc(v.src || v.home)}</h2>${table(['AS', 'Network', 'AS path', 'Exit', '#RTT', '#Traffic'], v.paths.map((p) => `<tr><td>${asLink(p.asn)}</td><td>${esc(p.name)}</td><td>${p.reachable ? p.asPath.map((a) => `AS${a}`).join(' → ') : '<span class="bad">unreachable</span>'}</td><td>${p.reachable ? esc(p.via) + ' · ' + esc(p.city) : '–'}</td><td class="n">${p.reachable ? p.rtt + ' ms' : '–'}</td><td class="n">${gbps(p.gbps)}</td></tr>`))}</div>`;
  return layout({ title: `AS${v.asn} ${v.name}`, body, version });
}
function worldAsPage({ n, seenBy, version }) {
  const body = `<div class="card"><div class="eyebrow">AS${n.asn} · ${esc(n.type === 't1' ? 'Tier 1' : n.type === 't2' ? 'Transit' : n.type === 'eye' ? 'Eyeball' : 'Content')} network</div><h1>${esc(n.name)}</h1>
  <div class="kv"><span>Peering policy</span><b>${esc(n.policy)}</b></div><div class="kv"><span>Footprint</span><b>${n.tail ? 'a small network' : num(n.metros) + ' metros' + (n.est ? ' (estimated: no facility list published)' : ' with a facility or exchange port on PeeringDB')}</b></div></div>
  ${n.sample.length ? `<div class="card"><h2>Where it is</h2><p>${n.sample.map((c) => `<span class="pill">${esc(c)}</span>`).join(' ')}${n.metros > n.sample.length ? ` <span class="meta">and ${num(n.metros - n.sample.length)} more</span>` : ''}</p></div>` : ''}
  ${n.exchanges.length ? `<div class="card"><h2>Exchanges</h2><p>${n.exchanges.map((c) => `<span class="pill">${esc(c)}</span>`).join(' ')}</p></div>` : ''}
  <div class="card"><h2>Player networks using it</h2>${table(['AS', 'Network', 'Relationship'], seenBy.map((s) => `<tr><td>${asLink(s.asn)}</td><td>${esc(s.name)}</td><td>${esc(s.rel)}</td></tr>`), 'No player network uses it yet.')}</div>`;
  return layout({ title: `AS${n.asn} ${n.name}`, body, version });
}
function searchPage({ q, players, nets, all, version }) {
  const playerRows = (list) => list.map((p) => `<tr><td>${asLink(p.asn)}</td><td>${esc(p.name)}</td><td>${esc(p.tier || '')}</td><td class="n">${p.pops != null ? num(p.pops) : ''}</td><td class="n">${p.online ? `<span class="ok">${p.online} online</span>` : '<span class="meta">offline</span>'}</td></tr>`);
  const body = `<div class="card"><div class="eyebrow">Networks</div><h1>${q ? 'Search' : 'Player networks'}</h1><form method="get" action="/search" class="row"><input name="q" value="${esc(q)}" placeholder="AS number or name" aria-label="Search" autofocus><button type="submit">Search</button></form>
  ${q ? `<h3>Player networks</h3>${table(['AS', 'Network', 'Rank', '#POPs', '#Now'], playerRows(players), 'No player network matches.')}
  <h3>Networks of the world</h3>${table(['AS', 'Network', 'Type'], nets.map((n) => `<tr><td>${asLink(n.asn)}</td><td>${esc(n.name)}</td><td>${esc(n.type)}</td></tr>`), 'Nothing matches.')}`
    : table(['AS', 'Network', 'Rank', '#POPs', '#Now'], playerRows(all), 'No player networks on this server yet.')}</div>`;
  return layout({ title: 'Networks', body, version });
}
function notFoundPage({ what, version }) {
  return layout({ title: 'Not found', body: `<div class="card"><h1>Not found</h1><p>${esc(what)}</p><p><a href="/search">Back to the networks</a></p></div>`, version });
}

module.exports = { layout, playerAsPage, worldAsPage, searchPage, notFoundPage, esc, DISCLAIMER };
