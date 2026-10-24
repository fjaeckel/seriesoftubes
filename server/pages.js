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

function layout({ title, body, user, refresh, version }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Series of Tubes</title>${refresh ? `<meta http-equiv="refresh" content="${refresh}">` : ''}<meta name="robots" content="noindex"><style>${CSS}</style></head><body>
<header class="top"><b class="brand">Series of Tubes</b><a href="/lite">Networks</a><a href="/search">Search</a><a href="/">Full game</a><span class="sp"></span>${user ? `<a href="/lite/me">${esc(user.name)}</a><form class="inline" method="post" action="/lite/logout"><button class="ghost" type="submit">Log out</button></form>` : '<a href="/lite/login">Log in</a>'}</header>
<main>${body}</main><p class="disc"><b>Fiction.</b> ${esc(DISCLAIMER)} Based on <a href="https://github.com/fjaeckel/seriesoftubes">Series of Tubes</a> by Frederic Jung (<a href="https://seriesoftub.es">seriesoftub.es</a>).${version ? ` v${esc(version)}` : ''}</p></body></html>`;
}

const table = (head, rows, empty = 'Nothing here yet.') => `<div class="scroll"><table><thead><tr>${head.map((h) => `<th${/^#/.test(h) ? ' class="n"' : ''}>${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="meta">${esc(empty)}</td></tr>`}</tbody></table></div>`;
const asLink = (asn, label) => `<a href="/as/${Number(asn)}">${esc(label || 'AS' + asn)}</a>`;

function directoryPage({ nets, user, world, version }) {
  const rows = nets.map((n) => `<tr><td>${asLink(n.asn)}</td><td>${esc(n.name)}</td><td>${esc(n.tier || 'Tier 3')}</td><td class="n">${num(n.pops || 1)}</td><td class="n">${n.reach != null ? Math.round(n.reach * 100) + '%' : '–'}</td><td class="n">${n.online ? `<span class="ok">${n.online} online</span>` : '<span class="meta">offline</span>'}</td></tr>`);
  const body = `<div class="card"><div class="eyebrow">Multiplayer</div><h1>Player networks</h1><p>Teams run their networks together on this server. Every network picks its own AS number. Open an AS page for its upstreams, peers, prefixes and paths, or log in to join the team.</p>
  <form method="get" action="/search" class="row"><input name="q" placeholder="AS number or name" aria-label="Search" required><button type="submit">Search</button></form>
  ${table(['AS', 'Network', 'Rank', '#POPs', '#Reach', '#Now'], rows, 'No player networks yet. Be the first.')}
  <div class="row">${user ? '<a class="btn pink" href="/lite/me">My networks</a>' : '<a class="btn pink" href="/lite/login">Log in or sign up</a>'}<a class="btn" href="/">Open the full game</a></div></div>`;
  return layout({ title: 'Networks', body, user, version });
}

function loginPage({ error, mode = 'login', user, open = true, needCode = false, version, next = '' }) {
  const body = `<div class="card"><div class="eyebrow">Multiplayer</div><h1>${mode === 'login' ? 'Log in' : 'Create an account'}</h1>${error ? `<div class="err">${esc(error)}</div>` : ''}
  <form method="post" action="/lite/${mode}">${next ? `<input type="hidden" name="next" value="${esc(next)}">` : ''}
  <div class="row"><label>Username <input name="name" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{2,19}"></label></div>
  <div class="row"><label>Password <input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="8" maxlength="200"></label></div>
  ${mode === 'register' && needCode ? '<div class="row"><label>Server invite code <input name="code" autocomplete="off"></label></div>' : ''}
  <div class="row"><button class="pink" type="submit">${mode === 'login' ? 'Log in' : 'Sign up'}</button>${mode === 'login' ? (open ? '<a href="/lite/register">Create an account</a>' : '') : '<a href="/lite/login">I have an account</a>'}</div></form>
  <p class="meta">Usernames are 3 to 20 letters, digits, - or _. Passwords need at least 8 characters and are stored salted and hashed.</p></div>`;
  return layout({ title: mode === 'login' ? 'Log in' : 'Sign up', body, user, version });
}

/* ---------- AS pages (bgp.tools style) ---------- */
function rpkiCell(r) { return r === 'valid' ? '<span class="ok">valid</span>' : '<span class="bad">' + esc(r) + '</span>'; }
function playerAsPage({ v, meta, user, version }) {
  const seen = v.upstreams.length + v.peers.length;
  const body = `<div class="card"><div class="eyebrow">AS${v.asn} · player network${meta.online ? ` · ${meta.online} online` : ''}</div><h1>${esc(v.name)}</h1>
  <div class="kv"><span>Rank</span><b>${esc(v.tier)}</b></div><div class="kv"><span>Registry</span><b>${esc(v.rir)}</b></div><div class="kv"><span>Home</span><b>${esc(v.home)}</b></div>
  <div class="kv"><span>Reachability</span><b>${Math.round(v.reach * 100)}% of the internet</b></div><div class="kv"><span>RPKI</span><b>${rpkiCell(v.rpki)}</b></div>
  <div class="kv"><span>Upstreams · peers · POPs</span><b>${v.upstreams.length} · ${v.peers.length} · ${v.pops.length}</b></div><div class="kv"><span>Game day</span><b>${num(v.day)}</b></div>
  ${user && meta.role ? `<div class="row"><a class="btn pink" href="/lite/net/${v.asn}">Open the dashboard</a></div>` : ''}</div>
  <div class="card"><h2>Upstreams</h2>${table(['AS', 'Network', 'Where', 'Port', '#Traffic', '#Routes'], v.upstreams.map((u) => `<tr><td>${asLink(u.asn)}</td><td>${esc(u.name)}${u.down ? ' <span class="bad">down</span>' : ''}</td><td>${esc(u.city)}</td><td>${esc(u.port)}</td><td class="n">${gbps(u.gbps)}</td><td class="n">${num(u.routes)}</td></tr>`), 'No upstream yet: this network cannot reach the internet.')}</div>
  <div class="card"><h2>Peers</h2>${table(['AS', 'Network', 'Type', 'Sessions', '#Traffic'], v.peers.map((p) => `<tr><td>${asLink(p.asn)}</td><td>${esc(p.name)}</td><td>${esc(p.type)} · ${esc(p.policy)}</td><td>${p.sessions.map((s) => `<span class="tag">${esc(s.kind)}</span> ${esc(s.where)}, ${esc(s.city)} <span class="meta">(${esc(s.how)})</span>`).join('<br>')}</td><td class="n">${gbps(p.gbps)}</td></tr>`))}</div>
  <div class="card"><h2>Prefixes</h2>${table(['Prefix', 'Origin', 'RPKI', 'IRR', '#Seen by'], v.prefixes.map((p) => `<tr><td><code>${esc(p.prefix)}</code></td><td>AS${p.origin}</td><td>${rpkiCell(p.rpki)}</td><td>${esc(p.irr)}</td><td class="n">${seen || p.seen} sessions</td></tr>`))}</div>
  <div class="card"><h2>POPs</h2><p>${v.pops.map((p) => `<span class="pill">${esc(p.name)}${p.cc ? ' · ' + esc(p.cc) : ''}${p.up ? '' : ' · down'}</span>`).join(' ')}</p></div>
  <div class="card"><h2>Paths from ${esc(v.src || v.home)}</h2>${table(['AS', 'Network', 'AS path', 'Exit', '#RTT', '#Traffic'], v.paths.map((p) => `<tr><td>${asLink(p.asn)}</td><td>${esc(p.name)}</td><td>${p.reachable ? p.asPath.map((a) => `AS${a}`).join(' → ') : '<span class="bad">unreachable</span>'}</td><td>${p.reachable ? esc(p.via) + ' · ' + esc(p.city) : '–'}</td><td class="n">${p.reachable ? p.rtt + ' ms' : '–'}</td><td class="n">${gbps(p.gbps)}</td></tr>`))}</div>`;
  return layout({ title: `AS${v.asn} ${v.name}`, body, user, version, refresh: meta.online ? 20 : 0 });
}
function worldAsPage({ n, seenBy, user, version }) {
  const body = `<div class="card"><div class="eyebrow">AS${n.asn} · ${esc(n.type === 't1' ? 'Tier 1' : n.type === 't2' ? 'Transit' : n.type === 'eye' ? 'Eyeball' : 'Content')} network</div><h1>${esc(n.name)}</h1>
  <div class="kv"><span>Peering policy</span><b>${esc(n.policy)}</b></div><div class="kv"><span>Footprint</span><b>${n.tail ? 'a small network' : num(n.metros) + ' metros' + (n.est ? ' (estimated: no facility list published)' : ' with a facility or exchange port on PeeringDB')}</b></div></div>
  ${n.sample.length ? `<div class="card"><h2>Where it is</h2><p>${n.sample.map((c) => `<span class="pill">${esc(c)}</span>`).join(' ')}${n.metros > n.sample.length ? ` <span class="meta">and ${num(n.metros - n.sample.length)} more</span>` : ''}</p></div>` : ''}
  ${n.exchanges.length ? `<div class="card"><h2>Exchanges</h2><p>${n.exchanges.map((c) => `<span class="pill">${esc(c)}</span>`).join(' ')}</p></div>` : ''}
  <div class="card"><h2>Player networks using it</h2>${table(['AS', 'Network', 'Relationship'], seenBy.map((s) => `<tr><td>${asLink(s.asn)}</td><td>${esc(s.name)}</td><td>${esc(s.rel)}</td></tr>`), 'No player network uses it yet.')}</div>`;
  return layout({ title: `AS${n.asn} ${n.name}`, body, user, version });
}
function searchPage({ q, players, nets, user, version }) {
  const body = `<div class="card"><h1>Search</h1><form method="get" action="/search" class="row"><input name="q" value="${esc(q)}" placeholder="AS number or name" aria-label="Search" autofocus><button type="submit">Search</button></form>
  ${q ? `<h3>Player networks</h3>${table(['AS', 'Network', 'Rank'], players.map((p) => `<tr><td>${asLink(p.asn)}</td><td>${esc(p.name)}</td><td>${esc((p.summary || {}).tier || '')}</td></tr>`), 'No player network matches.')}
  <h3>Networks of the world</h3>${table(['AS', 'Network', 'Type'], nets.map((n) => `<tr><td>${asLink(n.asn)}</td><td>${esc(n.name)}</td><td>${esc(n.type)}</td></tr>`), 'Nothing matches.')}` : ''}</div>`;
  return layout({ title: 'Search', body, user, version });
}
function notFoundPage({ what, user, version }) {
  return layout({ title: 'Not found', body: `<div class="card"><h1>Not found</h1><p>${esc(what)}</p><p><a href="/lite">Back to the networks</a></p></div>`, user, version });
}

/* ---------- accounts and teams ---------- */
function mePage({ user, nets, error, notice, version }) {
  const body = `<div class="card"><div class="eyebrow">Signed in as ${esc(user.name)}</div><h1>My networks</h1>${error ? `<div class="err">${esc(error)}</div>` : ''}${notice ? `<div class="note">${esc(notice)}</div>` : ''}
  ${table(['AS', 'Network', 'Role', 'Rank', '#Day', '#Now'], nets.map((n) => `<tr><td>${asLink(n.asn)}</td><td><a href="/lite/net/${n.asn}">${esc(n.name)}</a></td><td>${esc(n.role)}</td><td>${esc((n.summary || {}).tier || 'Tier 3')}</td><td class="n">${num((n.summary || {}).day || 0)}</td><td class="n">${n.online ? `<span class="ok">${n.online} online</span>` : '<span class="meta">offline</span>'}</td></tr>`), 'You are not on a team yet.')}
  <div class="row"><a class="btn pink" href="/lite/new">Start a network</a></div></div>
  <div class="card"><h2>Join a team</h2><form method="post" action="/lite/join" class="row"><label>AS number <input name="asn" inputmode="numeric" required size="12"></label><label>Invite code <input name="invite" required size="16" autocomplete="off"></label><button type="submit">Join</button></form></div>`;
  return layout({ title: 'My networks', body, user, version });
}
function newNetPage({ user, q, results, chosen, card, asn, name, error, version }) {
  const body = `<div class="card"><div class="eyebrow">New network</div><h1>Start a network</h1>${error ? `<div class="err">${esc(error)}</div>` : ''}
  <form method="get" action="/lite/new" class="row"><label>Find your home city <input name="q" value="${esc(q || '')}" placeholder="e.g. Frankfurt" aria-label="Search cities"></label><input type="hidden" name="asn" value="${esc(asn || '')}"><input type="hidden" name="name" value="${esc(name || '')}"><button type="submit">Search</button></form>
  ${results && results.length ? `<div class="row">${results.map((c) => `<a class="btn ghost" href="/lite/new?city=${encodeURIComponent(c.id)}&amp;asn=${encodeURIComponent(asn || '')}&amp;name=${encodeURIComponent(name || '')}">${esc(c.name)} <span class="meta">${esc(c.country)}${c.sellers ? '' : ' · no transit'}</span></a>`).join('')}</div>` : ''}
  ${chosen ? `<div class="note">${card}</div><form method="post" action="/lite/new"><input type="hidden" name="home" value="${esc(chosen.id)}">
  <div class="row"><label>Network name <input name="name" value="${esc(name || 'Packet Pals')}" maxlength="24" required></label></div>
  <div class="row"><label>AS number <input name="asn" value="${esc(asn || '')}" inputmode="numeric" required placeholder="e.g. 64512"></label><span class="meta">Any number from 1 to 4294967294 that is not reserved and not already a network in this world.</span></div>
  <div class="row"><button class="pink" type="submit">Start in ${esc(chosen.name)}</button></div></form>` : '<p class="meta">Pick a city first. Cities without a transit seller work too, but you will have to haul a wave to the nearest carrier hotel.</p>'}</div>`;
  return layout({ title: 'New network', body, user, version });
}

/* ---------- the team dashboard with the basic controls as plain forms ---------- */
function actForm(asn, act, fields, label, cls = '') {
  return `<form class="inline" method="post" action="/lite/net/${asn}/do"><input type="hidden" name="act" value="${esc(act)}">${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('')}<button class="${cls}" type="submit">${esc(label)}</button></form>`;
}
function dashboardPage({ net, role, d, view, online, notices, chat, user, version }) {
  const asn = net.asn, can = role !== 'viewer';
  const speeds = [[0, 'Pause'], [1, '1×'], [2, '2×'], [4, '4×'], [8, '8×']];
  const body = `<div class="card"><div class="eyebrow">AS${asn} · ${esc(role)} · ${online.length} online (${esc(online.map((o) => o.name).join(', ') || 'nobody')})</div><h1>${esc(net.name)}</h1>
  ${notices && notices.length ? notices.map((n) => `<div class="note">${n}</div>`).join('') : ''}
  <div class="kv"><span>Day</span><b>${num(d.day)} · ${esc(d.date)}</b></div><div class="kv"><span>Cash</span><b>${money(d.cash)}</b></div><div class="kv"><span>Rank</span><b>${esc(d.tier)}</b></div>
  <div class="kv"><span>Traffic served</span><b>${gbps(d.served)} of ${gbps(d.demand)}</b></div><div class="kv"><span>Reach</span><b>${Math.round(d.reach * 100)}%</b></div><div class="kv"><span>Monthly</span><b>${money(d.revMo)} in · ${money(d.costMo)} out</b></div>
  ${can ? `<div class="row">Speed: ${speeds.map(([v, l]) => actForm(asn, 'speed', { 'a.v': v }, l, d.speed === v ? 'pink' : 'ghost')).join(' ')}</div>` : ''}
  <p class="meta">This page refreshes by itself. <a href="/lite/net/${asn}/play">Open the interactive map</a> if your device can take it, or <a href="/as/${asn}">view the public AS page</a>.</p></div>
  <div class="card"><h2>POPs</h2>${table(['City', 'Status', '#Eyeballs', 'Actions'], d.pops.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.up ? '<span class="ok">up</span>' : '<span class="bad">down</span>'}</td><td class="n">${p.bb ? gbps(p.bb) : '–'}</td><td>${can ? [!p.bb ? actForm(asn, 'launchBB', { 'a.city': p.id }, 'Launch broadband') : '', actForm(asn, 'addRouter', { 'a.city': p.id }, 'Add router', 'ghost')].join(' ') : ''}</td></tr>`))}
  ${can ? `<form method="get" action="/lite/net/${asn}" class="row"><label>Add a POP <input name="q" placeholder="city name" value="${esc(d.q || '')}"></label><button type="submit">Find</button></form>
  ${d.found && d.found.length ? `<div class="row">${d.found.map((c) => `<span>${esc(c.name)} <span class="meta">${esc(c.country)} · ${money(c.cost)}${c.sellers ? '' : ' · no transit sold'}</span> ${actForm(asn, 'buildPop', { 'a.city': c.id }, 'Build POP')}</span>`).join('<br>')}</div>` : ''}` : ''}</div>
  <div class="card"><h2>Transit</h2>${table(['City', 'Network', 'Port', '#Traffic'], view.upstreams.map((u) => `<tr><td>${esc(u.city)}</td><td>${asLink(u.asn, u.name)}</td><td>${esc(u.port)}</td><td class="n">${gbps(u.gbps)}</td></tr>`), 'No transit yet.')}
  ${can && d.transitOffers.length ? `<h3>Buy transit</h3>${d.transitOffers.map((o) => `<div class="row"><b>${esc(o.city)}</b> ${o.sellers.map((s) => actForm(asn, 'buyTransit', { 'a.city': o.cityId, 'a.net': s.id, 'a.tier': 1 }, `${s.name} · 100G · ${money(s.mo)}/mo`, 'ghost')).join(' ')}</div>`).join('')}` : ''}</div>
  <div class="card"><h2>Peering</h2>${table(['AS', 'Network', 'Sessions', '#Traffic'], view.peers.map((p) => `<tr><td>${asLink(p.asn)}</td><td>${esc(p.name)}</td><td>${p.sessions.map((s) => esc(s.kind + ' · ' + s.where)).join('<br>')}</td><td class="n">${gbps(p.gbps)}</td></tr>`), 'No peers yet.')}
  ${can && d.ixOffers.length ? `<h3>Exchanges at your POPs</h3>${d.ixOffers.map((o) => `<div class="row"><b>${esc(o.name)}</b> <span class="meta">${esc(o.city)} · ${o.members} members</span> ${o.joined ? actForm(asn, 'rs', { 'a.city': o.id }, o.rs ? 'Leave route server' : 'Join route server', 'ghost') + ' ' + actForm(asn, 'peerAll', { 'a.city': o.id }, 'Peer with everyone willing', 'ghost') : actForm(asn, 'buyIx', { 'a.city': o.id, 'a.tier': 1, 'a.signed': 'true' }, `Join · 100G · ${money(o.mo)}/mo`)}</div>`).join('')}` : ''}</div>
  <div class="card"><h2>Links</h2>${table(['From', 'To', 'Size', '#Load'], d.links.map((l) => `<tr><td>${esc(l.a)}</td><td>${esc(l.b)}</td><td>${esc(l.cap)}</td><td class="n">${Math.round(l.util * 100)}%</td></tr>`), 'No links yet.')}
  ${can && d.pops.length > 1 ? `<form method="post" action="/lite/net/${asn}/do" class="row"><input type="hidden" name="act" value="buildLink"><label>From <select name="ctx.a">${d.pops.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label>To <select name="ctx.b">${d.pops.map((p, i) => `<option value="${esc(p.id)}"${i === 1 ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label>Size <select name="a.tier"><option value="0">10G</option><option value="1" selected>100G</option><option value="2">400G</option></select></label><button type="submit">Lay a wave</button></form>` : ''}</div>
  <div class="card"><h2>Customers</h2>${table(['Customer', 'Wants', '#Pays', 'Actions'], d.offers.map((o) => `<tr><td>${esc(o.name)}</td><td>${esc(o.what)}</td><td class="n">${money(o.rate)}/mo</td><td>${can ? actForm(asn, 'accept', { 'a.id': o.id }, 'Accept') + ' ' + actForm(asn, 'decline', { 'a.id': o.id }, 'Decline', 'ghost') : ''}</td></tr>`), 'No offers right now.')}</div>
  <div class="card"><h2>Incidents</h2>${table(['What', 'Fix'], d.incidents.map((i) => `<tr><td>${esc(i.msg)}</td><td>${can && i.cost > 0 ? actForm(asn, 'fixInc', { 'a.id': i.id }, 'Fix for ' + money(i.cost)) : ''}</td></tr>`), 'All quiet.')}</div>
  <div class="card"><h2>Team chat</h2>${chat.map((m) => `<div><b>${esc(m.who)}</b> ${esc(m.text)}</div>`).join('') || '<p class="meta">Nothing yet.</p>'}
  ${can ? `<form method="post" action="/lite/net/${asn}/chat" class="row"><input name="text" maxlength="300" placeholder="Say something" style="flex:1" required><button type="submit">Send</button></form>` : ''}</div>
  ${role === 'owner' ? `<div class="card"><h2>Team</h2><div class="kv"><span>Invite code</span><b><code>${esc(net.invite)}</code></b></div><p class="meta">Share the AS number and this code. Anyone who joins becomes an operator.</p>
  ${table(['Member', 'Role', 'Actions'], d.members.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.role)}</td><td>${m.role === 'owner' ? '' : ['operator', 'viewer'].filter((r) => r !== m.role).map((r) => `<form class="inline" method="post" action="/lite/net/${asn}/member"><input type="hidden" name="uid" value="${esc(m.id)}"><input type="hidden" name="role" value="${r}"><button class="ghost" type="submit">Make ${r}</button></form>`).join(' ') + `<form class="inline" method="post" action="/lite/net/${asn}/member"><input type="hidden" name="uid" value="${esc(m.id)}"><input type="hidden" name="role" value="remove"><button class="ghost" type="submit">Remove</button></form>`}</td></tr>`))}
  <form class="inline" method="post" action="/lite/net/${asn}/invite"><button class="ghost" type="submit">New invite code</button></form></div>` : ''}`;
  return layout({ title: net.name, body, user, version, refresh: 8 });
}

module.exports = { layout, directoryPage, loginPage, playerAsPage, worldAsPage, searchPage, notFoundPage, mePage, newNetPage, dashboardPage, esc, DISCLAIMER };
