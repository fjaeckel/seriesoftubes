/* ---------- NOC tab: ports, caches and routers running hot ----------
   Fullest first, grouped by kind: what to do about a kind is said once in its heading, and each row is one line
   (city, what, how full, Inspect). The groups keep the order of their fullest row. */
const HOT_KIND={t:N_('common.transit'),ix:N_('common.ix_ports'),p:N_('common.pnis'),c:N_('common.caches'),r:N_('common.routers')};
function nocHot(rows){const G=new Map();for(const x of rows){if(!G.has(x.k))G.set(x.k,[]);G.get(x.k).push(x);}let h='';
  for(const [k,a] of G){h+=`<div class="hgrp"><span class="hotk hk-${k}">${HOTL[k]}</span><div class="grow"><b>${tr(HOT_KIND[k])}</b> <span class="meta">${esc(a[0].tip)}</span></div></div>`;
    for(const x of a){const full=x.u>=0.995;h+=`<div class="row hrow"><div class="grow hnm">${CITY[x.city].name} · ${esc(x.lab)}</div><b class="hpc${full?' dlost':''}"${full?` title="${esc(tr('hud_and_panels.dropping_or_overflowing'))}"`:''}>${tr('hud_and_panels.p_full',{p:pct(Math.min(1,x.u))})}</b>${btn(tr('common.inspect'),'focusCity',{city:x.city},'pink sm')}</div>`;}}
  return h;}
