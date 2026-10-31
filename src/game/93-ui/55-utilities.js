function utilityKitHtml(city,modal=false){const q=utilityKit(city);if(!q)return '';const p=S.pops[city];
  const row=(label,have)=>`<div class="kv"><span>${label}</span><b>${have?tr('common.installed'):tr('common.none_304f')}</b></div>`;
  return `<section><h3>${tr('utilities.redundancy_kit')}</h3>
    ${row(tr('common.backup_generator'),p.gen)}${row(tr('utilities.second_site'),p.site2)}${row(tr('utilities.two_routers'),(p.routers||1)>=2)}
    <p class="meta">${tr('utilities.cache_moves',{n:q.moves.length})}</p>
    ${q.cost||q.moves.length?`<p class="meta">${tr('utilities.kit_cost',{cost:fmt$(q.cost),mo:fmt$(q.mo)})}</p><div class="btns">${btn(tr('utilities.apply_kit'),'utilityKit',{city,cost:q.cost,modal},'pink',q.cost>0&&S.cash<q.cost)}</div>`:`<p class="meta">${tr('utilities.kit_balanced')}</p>`}
    <p class="note">${tr('utilities.redundancy_note')}</p></section>${utilityCachesHtml(city,modal)}`;}
// In the Infra tab (#192): one line and the button, since the generator, second site, routers and caches each have
// their own rows below; the full kit with its caches is in Utilities.
function utilityKitLine(city){const q=utilityKit(city);if(!q)return '';const todo=q.cost||q.moves.length;
  return `<section><p class="meta"><b>${tr('utilities.redundancy_kit')}</b> · ${todo?tr('utilities.kit_cost',{cost:fmt$(q.cost),mo:fmt$(q.mo)})+(q.moves.length?' · '+tr('utilities.cache_moves',{n:q.moves.length}):''):tr('utilities.kit_balanced')}</p>
    <div class="btns">${todo?btn(tr('utilities.apply_kit'),'utilityKit',{city,cost:q.cost},'pink sm',q.cost>0&&S.cash<q.cost):''}${btn(tr('utilities.title'),'utilities',{city},'ghost sm')}</div></section>`;}
function utilityCachesHtml(city,modal=false){const q=utilityCaches(city);if(!q)return '';
  return `<section><h3>${tr('common.embedded_caches')}</h3><p class="lead">${tr('utilities.cache_note')}</p>
    <p class="meta">${tr('utilities.cache_quote',{n:q.add.length,mo:fmt$(q.mo)})}</p>
    ${q.free<q.add.length?`<p class="why">${tr('utilities.cache_ports',{need:q.add.length,free:fmtPorts(q.free)})}</p>`:''}
    <div class="btns">${btn(tr('utilities.request_caches',{n:q.add.length}),'utilityCaches',{city,quote:q.key,modal},'pink',!q.add.length||q.free+1e-9<q.add.length)}</div></section>`;}
function utilitiesModal(city,message){if(!S)return;const cities=Object.keys(S.pops).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name));
  city=S.pops[city]?city:UI.sel&&UI.sel.type==='city'&&S.pops[UI.sel.id]?UI.sel.id:S.pops[S.home]?S.home:cities[0];
  const rows=utilityPeers(),n=rows.reduce((v,r)=>v+r.requests.length,0),rs=utilityRouteServers().length;
  openModal(`<div style="display:flex;align-items:center"><h2 style="font-size:26px">${tr('utilities.title')}</h2><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
    ${message?`<p role="status" class="note">${esc(message)}</p>`:''}
    <section><h3>${tr('utilities.ix_peering')}</h3><p class="lead">${tr('utilities.peering_note')}</p>
    <div class="btns">${btn(tr('utilities.join_route_servers',{n:rs}),'utilityRouteServers',{city},'pink',!rs)}${btn(tr('utilities.request_all',{n}),'utilityPeers',{city},'',!n)}</div>
    <p class="meta">${tr('utilities.route_server_note')}</p>
    ${ppol()!=='open'?`<p class="why">${tr('link_panels.off_while_your_peering_policy_is',{pol:tr(PPOL_N[ppol()])})}</p>${btn(tr('common.peering_policy'),'leftTab',{t:'nets'},'ghost sm')}`:''}
    ${rows.map(r=>`<details><summary>${esc(ixName(r.ix))} · ${tr('utilities.peer_counts',{ready:r.requests.length,existing:r.existing,blocked:r.blocked.length})}</summary>
      ${r.blocked.map(b=>`<p class="meta"><b>${esc(NET[b.id].name)}</b>: ${esc(b.why)}</p>`).join('')}</details>`).join('')}</section>
    ${cities.length?`<section><label for="utilityCity">${tr('common.your_pop')}</label><div class="btns"><select id="utilityCity" style="max-width:100%">${cities.map(c=>`<option value="${c}"${c===city?' selected':''}>${esc(CITY[c].name)}</option>`).join('')}</select>${btn(tr('utilities.view_pop'),'utilityPick',{},'sm')}</div></section>${utilityKitHtml(city,true)}`:''}`);
}
