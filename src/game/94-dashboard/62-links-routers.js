// The NOC dashboard's Links and Routers tabs: every row, busiest first unless the player picks another order (ACT.infraSort),
// filtered by kind, load and city. A tap on a row picks it in the side panel behind the dashboard (Open goes there);
// the buttons in a row are the panel's own.
// What a link is, for the filter: leased wave, IRU dark fiber, fiber you built over land or under the sea, or a virtual circuit.
const LK=['wave','iru','own','sea','vxc'],LK_L={wave:N_('dashboard.lk_wave'),iru:N_('dashboard.lk_iru'),own:N_('dashboard.lk_own'),sea:N_('dashboard.lk_sea'),vxc:N_('dashboard.lk_vxc')};
const lkOf=l=>l.kind==='wave'?'wave':l.kind==='vxc'?'vxc':!l.own?'iru':l.sub?'sea':'own';
// Load filters, with the map legend's thresholds (barCls); routers have no "down".
const LH={warm:[N_('noc.legend_warm'),r=>r.u>=0.65],hot:[N_('noc.legend_hot'),r=>r.u>=0.9],down:[N_('noc.legend_down'),r=>!!r.down]};
const infraSortOf=w=>{const o=(UI.infraSort||{})[w]||{};return {k:o.k||'use',d:o.d||(o.k==='name'?1:-1)};};
const infraRows=(w,rows)=>{const {k,d}=infraSortOf(w);return rows.sort((a,b)=>(k==='name'?(a.nm<b.nm?-1:a.nm>b.nm?1:0):k==='cap'?a.cap-b.cap:k==='ports'?a.pf-b.pf:k==='type'?a.ty-b.ty:k==='n'?a.n-b.n:k==='fs'?a.fsU-b.fsU||a.fsC-b.fsC:a.u-b.u)*d||b.u-a.u||(a.id<b.id?-1:a.id>b.id?1:0));};
// Routers sort by city, router type, number of routers, capacity, forwarding load, share of router ports in use or
// Flowspec rules in use (then the rule budget): in
// the table's header on a wide screen (rtrTh), with these buttons on a phone, as in the Connections tab.
const RTR_SORT=()=>[['name',tr('common.city_906b')],['type',tr('dashboard.router_type')],['n',tr('common.routers')],['cap',tr('common.capacity')],['use',tr('common.forwarding_load')],['ports',tr('common.router_ports')],['fs',tr('ddos.fs_rules')]];
const sortMark=(w,k)=>{const {k:sk,d}=infraSortOf(w);return sk===k?(d>0?' ▲':' ▼'):'';};
const rtrTh=(k,l,c)=>`<th class="${c||''}">${k?`<button class="thb" data-act="infraSort" data-args="${esc(JSON.stringify({w:'routers',k}))}">${l}${sortMark('routers',k)}</button>`:l}</th>`;
const infraSeg=w=>{const {k:sk,d}=infraSortOf(w);return `<div class="seg">${(w==='routers'?RTR_SORT():[['use',tr('common.load')],['cap',tr('common.capacity')],['name',tr('common.name')]]).map(([k,l])=>btn(l+(sk===k?(d>0?' ▲':' ▼'):''),'infraSort',{w,k},sk===k?'pink sm':'ghost sm')).join('')}</div>`;};
// Load chips toggle: a second tap shows every load again.
const hotSeg=(w,all,f)=>{const b=Object.keys(LH).filter(k=>w==='links'||k!=='down').map(k=>{const n=all.filter(LH[k][1]).length;return n||f===k?btn(`${tr(LH[k][0])} (${n})`,'infraHot',{w,v:k},f===k?'pink sm':'ghost sm'):'';}).join('');return b?`<div class="seg">${b}</div>`:'';};
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
const dashSel=(type,id)=>!NOC.win&&UI.sel&&UI.sel.type===type&&UI.sel.id===id?' on':'';
const linkMeta=l=>[tr(LK_L[lkOf(l)]),capName(l),`${linkLat(l).toFixed(1)} ms`].filter(Boolean).map(x=>`<span class="optn">${x}</span>`).join(' · ');
// Used against what is left for your own traffic (capOf, the load bar's 100%); on dark fiber also what is sold:
// channels rented out as alien waves and capacity sold as managed waves, which come out of your own lit capacity (dfCap0).
// With managed waves sold, also everything the fiber lights (dfLit), as the dark fiber's side panel does.
const linkUse=(l,c)=>{const df=l.kind==='df'&&!(l.ready>S.day),mw=df?mwG(l):0,used=fmtG(R.load[l.id]||0),m=[mw?tr('dashboard.used_of_lit',{used,cap:fmtG(c),lit:fmtG(dfLit(l))}):tr('dashboard.used_of',{used,cap:fmtG(c)})];
  if(df){const sold=soldSlots(l);m.push(tr('dashboard.ch_lit_sold_free',{lit:(l.ch||[]).length,sold,free:Math.max(0,freeCh(l)),max:chMax(l)}));if(mw)m.push(tr('market.g_sold_as_managed',{g:fmtCap(mw)}));}
  return `<div class="meta">${m.map(x=>`<span class="optn">${x}</span>`).join(' · ')}</div>`;};
const lkPct=(r)=>`<b class="num lpct">${r.down?tr('common.down'):pct(r.u)}</b>`;
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
  h+=`<div class="ilist">`+ls.slice(0,listN('links')).map(r=>{const {l,u}=r;return `<div class="row ihit${dashSel('link',l.id)}" data-act="dashLink" data-args='{"id":"${l.id}","bg":1}'><div class="grow"><div class="nm">${CITY[l.a].name} ⇄ ${CITY[l.b].name} <span class="meta">${linkMeta(l)}</span></div>${linkUse(l,r.cap)}<div class="bar ${r.down?'bad':barCls(u)}"><i style="width:${r.down?100:Math.min(100,u*100)}%"></i></div>${linkActs(l)}</div>${lkPct(r)}${btn(tr('common.open'),'dashLink',{id:l.id},'ghost sm')}</div>`;}).join('')+`</div>`;
  return h+listMore('links',ls.length,n=>trn('dashboard.view_more_link',n),'lmore')+`</div>`;}
// A POP's next router step, the intern's own (rtrNext()): add a router and/or swap to the next model. Its pick is in pink
// only where the intern would act, at or over its "at" setting (rtrLoad()). Nothing on a day this POP already had new
// routers, as with the intern and the city panel.
function rtrActs(c,pu){const p=S.pops[c];if(p.rupDay===S.day)return `<span class="meta">${tr('city_panel.new_routers_went_in_today_the')}</span>`;
  const rt=p.routers||1,g=p.rgen||0,{nx,swap,add,pick:p0}=rtrNext(c),pick=rtrLoad(c,pu)>=opsP('routers','at')/100?p0:null,why=k=>pick===k?tr('dashboard.intern_pick'):'';let h='';
  if(add){const cost=routerCost(g,rt);h+=btn(tr('city_panel.add_router_cost_mo_mo',{cost:fmt$(cost),mo:fmt$(routerMo(g)+(rt>=RCAGE?CAGE_MO:0))}),'addRouter',{city:c},pick==='add'?'pink sm':'ghost sm',S.cash<cost,why('add'));}
  if(swap){const N=RG[nx],cost=swapCost(c,nx);h+=btn(tr('city_panel.upgrade_to_model_cost_mo_mo',{model:esc(N.n),cost:fmt$(cost),mo:fmt$(N.mo*rt)}),'upRouter',{city:c,g:nx},pick==='swap'?'pink sm':'ghost sm',S.cash<cost,why('swap'));}
  return h;}
const dashMeter=(txt,f)=>`<div class="optn">${txt}</div><div class="bar ${barCls(f)}"><i style="width:${Math.min(100,f*100)}%"></i></div>`;
const fsTxt=r=>r.fsC?tr('ddos.fs_used',{used:r.fsU,cap:r.fsC}):tr('ddos.fs_no_tcam');
function asBox(){const kv=(k,v)=>`<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  return `<div class="panel2" id="asSec" style="margin-top:12px"><h3>${tr('common.your_as')}</h3><div class="askv">${kv(tr('common.as_number'),'AS'+S.asn)}${kv(tr('common.prefixes'),`${Math.max(1,Math.ceil(Object.keys(S.pops).length/3))} × /22 IPv4, 1 × /32 IPv6`)}${kv(tr('common.bgp_sessions'),R.sessions)}${kv(tr('common.upstreams'),new Set(S.transit.map(t=>t.net)).size)}${kv(tr('common.reach'),pct(R.reach))}${kv(tr('common.customers'),tr('dashboard.n_businesses',{n:S.biz.length}))}</div></div>`;}
// Your AS first, then every POP: router type and count, capacity, forwarding load, router ports and Flowspec rules in use,
// and the intern's next step. Filtered by city or region; a table on a wide screen, one row per POP on a phone.
function routersTab(){const cs=Object.keys(S.pops),pu=portsAt(cs),F=UI.rtrF||{};
  const all=cs.map(c=>{const p=S.pops[c],g=p.rgen||0,pm=portsMax(c),fc=fsCap(c);return {c,id:c,nm:CITY[c].name.toLowerCase(),g,ty:RG[g].cap,n:p.routers||1,cap:R.nodeCap[c]||0,u:(R.nodeLoad[c]||0)/(R.nodeCap[c]||1),pu:pu.get(c)||0,pm,pf:pm?(pu.get(c)||0)/pm:0,fsC:fc,fsU:fc&&R.fsUse&&R.fsUse[c]?R.fsUse[c].used:0};});
  // Flowspec: rules in use now (a flood under way), routers that hold rules at all, or routers with no TCAM.
  const FS={use:r=>r.fsU>0,has:r=>r.fsC>0,none:r=>!r.fsC},fs=own(FS,F.fs)?F.fs:'';
  const city=S.pops[F.city]?F.city:'',reg=own(REG,F.reg)&&cs.some(c=>CITY[c].reg===F.reg)?F.reg:'',inF=all.filter(r=>(!city||r.c===city)&&(!reg||CITY[r.c].reg===reg)&&(!fs||FS[fs](r)));
  const hf=['warm','hot'].includes((UI.infraHot||{}).routers)?UI.infraHot.routers:'',rs=infraRows('routers',inF.filter(r=>!hf||LH[hf][1](r)));
  const regs=Object.keys(REG).filter(k=>cs.some(c=>CITY[c].reg===k)),opts=cs.slice().sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name));
  const drop=(act,lab,any,o,v)=>`<label class="trsel">${lab} <select data-chg="${act}"><option value="">${any}</option>${o.map(([k,l])=>`<option value="${k}"${v===k?' selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
  const sels=`<div class="seg ifoot">${drop('rtrReg',tr('unbuilt_pops.region'),tr('unbuilt_pops.all_regions'),regs.map(k=>[k,REG[k]]),reg)}${drop('rtrCity',tr('common.city_906b'),tr('common.all_cities'),opts.map(c=>[c,CITY[c].name]),city)}${drop('rtrFs',tr('ddos.fs_rules'),tr('dashboard.fs_all'),[['use',tr('dashboard.fs_in_use')],['has',tr('dashboard.fs_has')],['none',tr('dashboard.fs_none')]],fs)}</div>`;
  let h=asBox()+`<div class="panel2 itab" id="routersSec" style="margin-top:12px"><div class="ibar"><h3>${tr('common.routers')} <span class="meta">${rs.length} / ${all.length}</span></h3>${all.length?hotSeg('routers',inF,hf)+sels+(isPhone()?`<div class="seg ifoot">${infraSeg('routers')}</div>`:''):''}</div>`;
  const page=rs.slice(0,listN('routers')),model=r=>esc(RG[r.g].n),args=c=>`data-act="dashPop" data-args='{"city":"${c}","bg":1}'`;
  const load=r=>dashMeter(`${fmtG(R.nodeLoad[r.c]||0)} · ${pct(r.u)}`,r.u),ports=r=>dashMeter(tr('city_panel.used_max_in_use',{used:fmtPorts(r.pu),max:r.pm}),r.pf);
  if(isPhone())h+=`<div class="ilist">`+page.map(r=>`<div class="row ihit rrow${dashSel('city',r.c)}" ${args(r.c)}><div class="grow"><div class="nm">${CITY[r.c].name} <span class="meta">${r.n} × ${model(r)} · ${fmtG(r.cap)}</span></div>
    <div class="meta">${tr('common.forwarding_load')}</div>${load(r)}<div class="meta">${tr('common.router_ports')}</div>${ports(r)}<div class="meta">${tr('ddos.fs_rules')}: <span class="optn">${fsTxt(r)}</span></div><div class="btns">${rtrActs(r.c,r.pu)}${btn(tr('common.open'),'dashPop',{city:r.c},'ghost sm')}</div></div></div>`).join('')+`</div>`;
  else h+=`<div class="tscroll"><table class="tbl rtbl"><thead><tr>${rtrTh('name',tr('common.city_906b'))}${rtrTh('type',tr('dashboard.router_type'))}${rtrTh('n',tr('common.routers'),'r')}${rtrTh('cap',tr('common.capacity'),'r')}${rtrTh('use',tr('common.forwarding_load'))}${rtrTh('ports',tr('common.router_ports'))}${rtrTh('fs',tr('ddos.fs_rules'))}<th></th></tr></thead><tbody>`+
    page.map(r=>`<tr class="rrow${dashSel('city',r.c)}" ${args(r.c)}><td><b>${CITY[r.c].name}</b></td><td>${model(r)}</td><td class="r">${r.n}</td><td class="r optn">${fmtG(r.cap)}</td><td>${load(r)}</td><td>${ports(r)}</td><td class="optn">${fsTxt(r)}</td><td><div class="btns">${rtrActs(r.c,r.pu)}${btn(tr('common.open'),'dashPop',{city:r.c},'ghost sm')}</div></td></tr>`).join('')+`</tbody></table></div>`;
  if(!rs.length)h+=`<p class="empty">${tr('common.nothing_yet')}</p>`;
  return h+listMore('routers',rs.length,n=>trn('dashboard.view_more_router',n),'lmore')+`</div>`;}
// The filter bar sticks under the dashboard's tab bar, whose height depends on the font and the window: measured after
// drawing, onto #dash (which morph() leaves alone); the CSS has a fallback for the first frame.
function fitList(){const d=$('dash'),t=d&&d.querySelector('.dtabs');if(t&&t.offsetHeight)d.style.setProperty('--dtabh',t.offsetHeight+'px');}
addEventListener('resize',()=>{const d=$('dash');if(d&&!d.hidden)fitList();});
