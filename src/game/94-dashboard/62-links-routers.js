// The NOC dashboard's Links and Routers tabs: every row, busiest first unless the player picks another order (ACT.infraSort),
// filtered by kind, load and city. A tap on a row picks it in the side panel behind the dashboard (Open goes there);
// the buttons in a row are the panel's own.
// What a link is, for the filter: leased wave, IRU dark fiber, fiber you built over land or under the sea, or a virtual circuit.
const LK=['wave','iru','own','sea','vxc'],LK_L={wave:N_('dashboard.lk_wave'),iru:N_('dashboard.lk_iru'),own:N_('dashboard.lk_own'),sea:N_('dashboard.lk_sea'),vxc:N_('dashboard.lk_vxc')};
const lkOf=l=>l.kind==='wave'?'wave':l.kind==='vxc'?'vxc':!l.own?'iru':l.sub?'sea':'own';
// Load filters, with the map legend's thresholds (barCls); routers have no "down".
const LH={warm:[N_('noc.legend_warm'),r=>r.u>=0.65],hot:[N_('noc.legend_hot'),r=>r.u>=0.9],down:[N_('noc.legend_down'),r=>!!r.down]};
const infraSortOf=w=>{const o=(UI.infraSort||{})[w]||{};return {k:o.k||'use',d:o.d||(o.k==='name'?1:-1)};};
const infraRows=(w,rows)=>{const {k,d}=infraSortOf(w);return rows.sort((a,b)=>(k==='name'?(a.nm<b.nm?-1:a.nm>b.nm?1:0):k==='cap'?a.cap-b.cap:a.u-b.u)*d||b.u-a.u||(a.id<b.id?-1:a.id>b.id?1:0));};
const infraSeg=w=>{const {k:sk,d}=infraSortOf(w);return `<div class="seg">${[['use',tr('common.load')],['cap',tr('common.capacity')],['name',tr('common.name')]].map(([k,l])=>btn(l+(sk===k?(d>0?' ▲':' ▼'):''),'infraSort',{w,k},sk===k?'pink sm':'ghost sm')).join('')}</div>`;};
// Load chips toggle: a second tap shows every load again.
const hotSeg=(w,all,f)=>`<div class="seg">${Object.keys(LH).filter(k=>w==='links'||k!=='down').map(k=>{const n=all.filter(LH[k][1]).length;return n||f===k?btn(`${tr(LH[k][0])} (${n})`,'infraHot',{w,v:k},f===k?'pink sm':'ghost sm'):'';}).join('')}</div>`;
// One more optic: the kind already lit, or on dark fiber the fastest that fits; null when the line system is full.
function quickOpt(l){if(l.kind!=='df'||l.ready>S.day)return null;const last=(l.ch||[]).at(-1);if(last&&OPT[last]&&!chWhy(l,last))return last;
  let best=null,bg=0;for(const k of Object.keys(OPT))if(!chWhy(l,k)){const g=(optMode(k,l)||{}).g||0;if(g>bg){bg=g;best=k;}}return best;}
// The next wave size this route sells right now, as the link panel offers it; null when there is none to buy.
function quickWave(l){if(l.kind!=='wave'||fedWaveDeal(l))return null;for(let i=l.tier+1;i<LT.length;i++)if(waveShown(i)){
  if(subWaveWhy(i,l.km,l.sub)||soldOut(l.a,l.b,i,l.cable)||!waveOk(l.a,l.b,i))return null;return {i,mo:Math.round(waveMo(l.km,l.sub,i)*(l.mult||1))};}return null;}
// Each optic type lit here gets − (to the spares shelf) and + (one more, if it fits); fiber with none lit offers quickOpt's.
function optActs(l){if(l.kind!=='df'||l.ready>S.day)return '';const lit=[...new Set(l.ch||[])].filter(k=>OPT[k]),add=k=>{const c=chCost(l,k),why=chWhy(l,k);return btn('+','addCh',{id:l.id,o:k},'sm',!!why||S.cash<c,why||tr('dashboard.add_one_optic_price',{optic:OPT[k].n,price:fmt$(c)}));};
  if(!lit.length){const o=quickOpt(l);if(!o)return '';const c=chCost(l,o);return btn(`+ ${OPT[o].n} <small>${fmt$(c)}</small>`,'addCh',{id:l.id,o},'sm',S.cash<c);}
  return lit.map(k=>`<span class="optq"><span class="optn">${OPT[k].n} ×${l.ch.filter(x=>x===k).length}</span>${btn('−','rmCh',{id:l.id,o:k},'ghost sm',false,tr('dashboard.take_one_optic_out',{optic:OPT[k].n}))}${add(k)}</span>`).join('');}
function linkActs(l){let h=optActs(l);
  if(l.kind==='df'&&l.own){const p=pairBtn(l);if(p.startsWith('<button'))h+=p;}
  const w=quickWave(l);if(w)h+=btn(`↑ ${LT[w.i].n} <small>${tr('common.price_mo',{price:fmt$(w.mo)})}</small>`,'upLink',{id:l.id,tier:w.i},'sm',S.cash<w.mo);
  return h?`<div class="btns">${h}</div>`:'';}
// The row picked in the side panel behind the dashboard; the NOC window has no side panel of its own.
const sel=(type,id)=>!NOC.win&&UI.sel&&UI.sel.type===type&&UI.sel.id===id?' on':'';
const linkMeta=l=>[tr(LK_L[lkOf(l)]),capName(l),l.kind==='df'&&l.ready<=S.day?tr('link_panels.n_of_max_channels_lit',{n:(l.ch||[]).length,max:chMax(l)}):'',`${linkLat(l).toFixed(1)} ms`].filter(Boolean).map(x=>`<span class="optn">${x}</span>`).join(' · ');
const pct2=(r)=>`<b class="num lpct">${r.down?tr('common.down'):pct(r.u)}</b>`;
function linksTab(){if(!S.links.length)return `<div class="panel2 itab" id="linksSec"><h3>${tr('common.links')}</h3><p class="empty">${tr('common.no_links_yet')}</p></div>`;
  const all=S.links.map(l=>{const c=capOf(l);return {l,id:l.id,nm:(CITY[l.a].name+' '+CITY[l.b].name).toLowerCase(),cap:c,u:c>0?(R.load[l.id]||0)/c:0,down:linkDown(l)};});
  const city=isCity(UI.infraCity)&&all.some(r=>r.l.a===UI.infraCity||r.l.b===UI.infraCity)?UI.infraCity:'',inC=all.filter(r=>!city||r.l.a===city||r.l.b===city);
  const lc={};for(const r of inC){const k=lkOf(r.l);lc[k]=(lc[k]||0)+1;}const lf=lc[UI.infraF]?UI.infraF:'',ofK=inC.filter(r=>!lf||lkOf(r.l)===lf);
  const hf=own(LH,(UI.infraHot||{}).links)?UI.infraHot.links:'',ls=infraRows('links',ofK.filter(r=>!hf||LH[hf][1](r)));
  const cities=[...new Set(all.flatMap(r=>[r.l.a,r.l.b]))].sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name));
  let h=`<div class="panel2 itab" id="linksSec"><div class="ibar"><h3>${tr('common.links')} <span class="meta">${ls.length} / ${all.length}</span></h3>
  ${Object.keys(lc).length>1||lf?`<div class="seg">${btn(tr('dashboard.all_n',{n:inC.length}),'infraF',{v:''},!lf?'pink sm':'ghost sm')}${LK.filter(k=>lc[k]).map(k=>btn(`${tr(LK_L[k])} (${lc[k]})`,'infraF',{v:k},lf===k?'pink sm':'ghost sm')).join('')}</div>`:''}
  ${hotSeg('links',ofK,hf)}<div class="seg ifoot"><label class="trsel">${tr('common.city_906b')} <select data-chg="infraCity"><option value="">${tr('common.all_cities')}</option>${cities.map(c=>`<option value="${c}"${city===c?' selected':''}>${esc(CITY[c].name)}</option>`).join('')}</select></label>${infraSeg('links')}</div></div>`;
  if(!ls.length)return h+`<p class="empty">${tr('common.nothing_yet')}</p></div>`;
  h+=`<div class="ilist">`+ls.slice(0,listN('links')).map(r=>{const {l,u}=r;return `<div class="row ihit${sel('link',l.id)}" data-act="dashLink" data-args='{"id":"${l.id}","bg":1}'><div class="grow"><div class="nm">${CITY[l.a].name} ⇄ ${CITY[l.b].name} <span class="meta">${linkMeta(l)}</span></div><div class="bar ${r.down?'bad':barCls(u)}"><i style="width:${r.down?100:Math.min(100,u*100)}%"></i></div>${linkActs(l)}</div>${pct2(r)}${btn(tr('common.open'),'dashLink',{id:l.id},'ghost sm')}</div>`;}).join('')+`</div>`;
  return h+listMore('links',ls.length,n=>trn('dashboard.view_more_link',n),'lmore')+`</div>`;}
function routersTab(){const all=Object.keys(S.pops).map(c=>({c,id:c,nm:CITY[c].name.toLowerCase(),cap:R.nodeCap[c]||0,u:(R.nodeLoad[c]||0)/(R.nodeCap[c]||1)}));
  const hf=['warm','hot'].includes((UI.infraHot||{}).routers)?UI.infraHot.routers:'',rs=infraRows('routers',all.filter(r=>!hf||LH[hf][1](r)));
  let h=`<div class="dcols itop" style="margin-top:12px"><div class="panel2 itab" id="routersSec"><div class="ibar"><h3>${tr('common.router_load')} <span class="meta">${rs.length} / ${all.length}</span></h3>${all.length?hotSeg('routers',all,hf)+`<div class="seg ifoot">${infraSeg('routers')}</div>`:''}</div>`;
  h+=`<div class="ilist">`+rs.slice(0,listN('routers')).map(({c,u})=>`<div class="row ihit${sel('city',c)}" data-act="dashPop" data-args='{"city":"${c}","bg":1}'><div class="grow"><div class="nm">${CITY[c].name} <span class="meta">${(S.pops[c].routers||1)} × ${esc(RG[S.pops[c].rgen||0].n)} · <span class="optn">${fmtG(R.nodeLoad[c]||0)} / ${fmtG(R.nodeCap[c]||0)}</span></span></div><div class="bar ${barCls(u)}"><i style="width:${Math.min(100,u*100)}%"></i></div></div><b class="num lpct">${pct(u)}</b>${btn(tr('common.open'),'dashPop',{city:c},'ghost sm')}</div>`).join('')+`</div>`;
  h+=listMore('routers',rs.length,n=>trn('dashboard.view_more_router',n),'lmore')+`</div>`;
  return h+`<div class="panel2"><h3>${tr('common.your_as')}</h3><div class="kv"><span>${tr('common.as_number')}</span><b>AS${S.asn}</b></div><div class="kv"><span>${tr('common.prefixes')}</span><b>${Math.max(1,Math.ceil(Object.keys(S.pops).length/3))} × /22 IPv4, 1 × /32 IPv6</b></div><div class="kv"><span>${tr('common.bgp_sessions')}</span><b>${R.sessions}</b></div><div class="kv"><span>${tr('common.upstreams')}</span><b>${new Set(S.transit.map(t=>t.net)).size}</b></div><div class="kv"><span>${tr('common.reach')}</span><b>${pct(R.reach)}</b></div><div class="kv"><span>${tr('common.customers')}</span><b>${tr('dashboard.n_businesses',{n:S.biz.length})}</b></div></div></div>`;}
// The filter bar sticks under the dashboard's tab bar, whose height depends on the font and the window: measured after
// drawing, onto #dash (which morph() leaves alone); the CSS has a fallback for the first frame.
function fitList(){const d=$('dash'),t=d&&d.querySelector('.dtabs');if(t&&t.offsetHeight)d.style.setProperty('--dtabh',t.offsetHeight+'px');}
addEventListener('resize',()=>{const d=$('dash');if(d&&!d.hidden)fitList();});
