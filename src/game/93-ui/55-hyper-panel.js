/* ---------- The Hyperscaler in the interface (37-hyper.js) ----------
   The charter card on the left panel (users, regions, front doors, money, the next thing to do, what is full) and the
   city panel's Cloud tab, which replaces Customers for this charter: the country's users and their home region, the
   region here, the front door and its edge stack, and the tenants placed here. */
const hsKv=(k,v,st)=>`<div class="kv"><span>${k}</span><b${st?` style="${st}"`:''}>${v}</b></div>`;
const hsBar=(f,bad)=>`<div class="bar${bad?' bad':''}"><i style="width:${Math.round(clamp(f,0,1)*100)}%"></i></div>`;
// The one thing to do next, for a new Hyperscaler and whenever something is full.
function hsNext(){const H=S.hs,cc=CITY[S.home].cc,doors=Object.keys(S.pops).filter(hsDoor);
  if(!H.cc[cc]&&!hsWhy(cc))return `<div class="meta"><b>👉 ${tr('hyper.next_launch',{country:esc(ccName(cc))})}</b></div><div class="btns">${btn(tr('hyper.launch_in_cost',{country:esc(ccName(cc)),cost:fmt$(hsLic(cc))}),'hsLaunch',{cc},'pink sm',S.cash<hsLic(cc))}</div>`;
  if(!doors.length)return `<div class="meta"><b>👉 ${tr('hyper.next_door',{city:esc(CITY[S.home].name)})}</b></div><div class="btns">${btn(tr('common.open'),'popGo',{city:S.home},'pink sm')}</div>`;
  const R0=R.hs;if(R0&&R0.short>0.5){const c=hsRgs().find(r=>R0.rg[r]&&R0.rg[r].load>=R0.rg[r].g-0.5)||S.home;return `<div class="meta" style="color:var(--bad)"><b>👉 ${tr('hyper.next_full',{g:fmtG(R0.short),city:esc(CITY[c].name)})}</b></div><div class="btns">${btn(tr('common.open'),'popGo',{city:c},'sm')}</div>`;}
  if(!doors.some(c=>ixIdsIn(c).some(x=>S.ixp[x]!==undefined)||S.pni.some(p=>p.city===c)))return `<div class="meta">👉 ${tr('hyper.next_peer')}</div>`;
  if(!hsTen().length)return `<div class="meta">👉 ${tr('hyper.next_tenant')}</div>`;
  if(hsRgN()<2&&hsRgMax()>=2)return `<div class="meta">👉 ${tr('hyper.next_region')}</div>`;
  if(!Object.keys(H.edge).length)return `<div class="meta">👉 ${tr('hyper.next_edge',{cost:fmt$(HS_EDGE_COST)})}</div>`;
  return `<div class="meta">👉 ${tr('hyper.next_grow')}</div>`;}
function hsCard(){const H=S.hs;if(!H)return '';const ccs=Object.keys(H.cc),R0=R.hs,doors=Object.keys(S.pops).filter(hsDoor);
  let rev=0;for(const cc of ccs)rev+=hsRev(R,cc);
  let h=`<div class="inc" style="background:#E6F4FF"><div class="nm">☁️ ${tr('hyper.cloud_nine')}</div>`;
  {const z=chFrozen();if(z)h+=`<div class="meta" style="color:var(--bad)"><b>🧊 ${tr('change_freeze.frozen_why',{show:z.show,date:dateStr(z.until)})}</b></div>`;}
  h+=`<div class="meta">${tr('hyper.card_users',{g:fmtG(hsUsers()),n:ccs.length,p:pct(hsServed(R))})}</div>`;
  h+=`<div class="meta">${tr('hyper.card_infra',{n:hsRgs().length,max:hsRgMax(),d:doors.length,e:Object.keys(H.edge).length,t:hsTen().length})}</div>`;
  h+=`<div class="meta">${tr('hyper.card_money',{rev:fmt$(rev),cost:fmt$((R.cost&&R.cost.cloud)||0)})}</div>`;
  h+=hsNext();
  if(R0){const bad=ccs.filter(k=>hsQ(R,k)<CX_GOOD);if(bad.length)h+=`<div class="meta" style="color:var(--bad)">${tr('hyper.poor_in_list',{list:bad.slice(0,4).map(k=>esc(ccName(k))).join(', ')})}</div>`;
    for(const v of Object.keys(R0.door).sort()){const x=R0.door[v];if(x.g-x.got>0.5)h+=`<div class="meta" style="color:var(--bad)">${tr('hyper.backbone_full',{city:esc(CITY[v].name),g:fmtG(x.g-x.got)})}</div>`;}}
  return h+cxHtml(CX_CARD)+`</div>`;}
// The country a city is in: its users, how well they are served and from where, or the launch.
function hsCcSection(c){const cc=CITY[c].cc,H=S.hs,x=H.cc[cc],w=hsWhy(cc);let h=`<section><h3>${tr('hyper.users_in',{country:esc(ccName(cc))})}</h3>`;
  if(x){const q=hsQ(R,cc),o=R.hs&&R.hs.cc[cc],P=hsPot(cc);
    h+=hsKv(tr('hyper.users'),tr('city_panel.a_of_b',{a:fmtG(x.d),b:fmtG(P)}))+hsBar(x.d/(P||1))
     +hsKv(tr('hyper.quality'),pct(q),`color:${q<CX_GOOD?'var(--bad)':'var(--eye)'}`)+hsBar(q,q<CX_GOOD)
     +hsKv(tr('common.revenue'),tr('common.price_mo',{price:fmt$(hsRev(R,cc))}));
    if(o&&o.v)h+=`<p class="meta">${tr('hyper.enter_at',{door:esc(CITY[o.v].name)})}${o.home?' · '+tr('hyper.home_region',{city:esc(CITY[o.home].name)}):''}${o.st>0?' · '+tr('hyper.edge_serves',{g:fmtG(o.st)}):''}</p>`;
    if(o&&!o.v)h+=`<p class="why">${tr('hyper.no_door_yet')}</p>`;
    if(o&&o.short>0.5)h+=`<p class="why">${tr('hyper.regions_full_here',{g:fmtG(o.short)})}</p>`;
    if(o&&o.want-o.got>0.5)h+=`<p class="why">${tr('hyper.haul_short',{g:fmtG(o.want-o.got)})}</p>`;
    if(o&&o.parts.some(p=>p[2]>HS_MS[0]))h+=`<p class="note">${tr('hyper.far_hint',{ms:Math.round(Math.max(...o.parts.map(p=>p[2])))})}</p>`;
    if(q<CX_GOOD)h+=`<p class="why">${tr('hyper.users_leaving')}</p>`;}
  else if(w)h+=`<p class="why">${w}</p>`;
  else h+=`<p class="lead">${tr('hyper.launch_lead',{g:fmtG(Math.max(1,hsPot(cc)*HS_START)),max:fmtG(hsPot(cc))})}</p>${btn(tr('hyper.launch_in_cost',{country:esc(ccName(cc)),cost:fmt$(hsLic(cc))}),'hsLaunch',{cc},'pink',S.cash<hsLic(cc))}`;
  return h+`</section>`;}
// The region here: build, grow, load, power, compute slots.
function hsRgSection(c){const H=S.hs,d=H.rg[c];if(!d&&!hsSite(c))return '';let h=`<section><h3>${tr('hyper.region')}</h3>`;
  if(d){const T=HS_T[d.t],N=HS_T[d.t+1],x=R.hs&&R.hs.rg[c],load=x?x.load:0;
    if(d.ready>S.day)h+=`<p class="lead">${tr('hyper.being_built',{name:tr(T.n),date:dateStr(d.ready)})}</p>`;
    else h+=hsKv(tr(T.n),tr('city_panel.a_of_b',{a:fmtG(load),b:fmtG(T.g)}))+hsBar(load/T.g,load>=T.g*0.95);
    h+=hsKv(tr('hyper.power'),tr('hyper.mw_of_grid',{mw:d.mw,grid:hsGrid(c)}))+hsKv(tr('hyper.slots'),tr('city_panel.a_of_b',{a:hsSlotsUsed(c),b:T.slots}));
    if(d.up)h+=`<p class="meta">${tr('hyper.being_built',{name:tr(HS_T[d.up.t].n),date:dateStr(d.up.ready)})}</p>`;
    if(!cxOut(c)&&!Object.keys(S.pops).some(hsDoor))h+=`<p class="why">${tr('hyper.region_no_way_out')}</p>`;
    if(N&&!d.up)h+=`<p class="meta">${tr('hyper.tier_terms',{name:tr(N.n),g:fmtG(N.g),mw:N.mw,slots:N.slots,mo:fmt$(N.mo),n:leadDays(N.days)})}</p><div class="btns">${btn(N.lv>lvl()?tr('hyper.tier_needs_level',{name:tr(N.n),lv:N.lv}):tr('hyper.grow_region_cost',{cost:fmt$(N.cost)}),'hsRegion',{city:c},'sm',N.lv>lvl()||S.cash<N.cost||d.ready>S.day)}</div>`;}
  else{const N=HS_T[1],full=hsRgN()>=hsRgMax();h+=`<p class="lead">${tr('hyper.region_lead')}</p>${full?`<p class="why">${tr('hyper.your_level_allows_n_regions',{n:hsRgMax()})}</p>`:''}
    <p class="meta">${tr('hyper.tier_terms',{name:tr(N.n),g:fmtG(N.g),mw:N.mw,slots:N.slots,mo:fmt$(N.mo),n:leadDays(N.days)})}</p>${btn(tr('hyper.build_region_cost',{cost:fmt$(N.cost)}),'hsRegion',{city:c},'pink',full||S.cash<N.cost)}`;}
  return h+`</section>`;}
// The front door here and its edge stack.
function hsDoorSection(c){const H=S.hs,door=hsDoor(c),x=R.hs&&R.hs.door[c];let h=`<section><h3>${tr('hyper.front_door')}</h3>`;
  if(!door)return h+`<p class="why">${tr('hyper.no_way_out_here')}</p></section>`;
  h+=`<p class="lead">${tr('hyper.door_lead')}</p>`;if(x&&x.g>0.01)h+=hsKv(tr('hyper.hauled_here'),tr('city_panel.a_of_b',{a:fmtG(x.got),b:fmtG(x.g)}))+hsBar(x.got/x.g,x.got<x.g-0.5);
  h+=H.edge[c]?`<p class="meta">✅ ${tr('hyper.edge_here',{p:pct(HS_EDGE)})}</p>`:`<p class="meta">${tr('hyper.edge_terms',{p:pct(HS_EDGE),mo:fmt$(HS_EDGE_MO)})}</p>${btn(tr('hyper.buy_edge_cost',{cost:fmt$(HS_EDGE_COST)}),'hsEdge',{city:c},'sm',S.cash<HS_EDGE_COST)}`;
  return h+`</section>`;}
// A tenant's products, each with what it still wants.
const hsWants=(r,b)=>b.p.filter(id=>CLOUD_PRODUCTS[id]&&hsNeedQ(r,b,id)<0.95).map(id=>tr(CLOUD_NEED[CLOUD_PRODUCTS[id].need]));
function hsTenSection(c){const bs=hsTen().filter(b=>b.city===c);let h=`<section><h3>${tr('hyper.tenants_here')}</h3>`;
  if(!bs.length)return h+`<p class="empty">${tr('hyper.no_tenants_here')}</p></section>`;
  for(const b of bs){const q=hsTenQ(R,b),T=R.hs&&R.hs.ten[b.id],K=CLOUD_TENANTS[b.ck],ws=[...new Set(hsWants(R,b))];
    h+=`<div class="row"><div class="grow"><div class="nm">${esc(b.name)}</div><div class="meta">${K?esc(tr(K.n)):''} · ${esc(cloudList(b.p))} · ${tr('common.price_mo',{price:fmt$(bizMo(b))})}</div>
      <div class="meta">${T&&T.r?tr('hyper.served_from',{city:esc(CITY[T.r].name)}):tr('hyper.no_region')} · ${tr('hyper.bundle_score',{p:pct(q)})}</div>${ws.length?`<div class="why">${tr('hyper.tenant_wants',{list:esc(ws.join(', '))})}</div>`:''}
      ${hsBar(b.mood/100,b.mood<30)}<div class="meta">${tr('common.happiness_p',{p:Math.round(b.mood)})}</div></div>${btn(UI.confirm===b.id?tr('common.really_drop'):tr('common.drop'),'dropBiz',{id:b.id},'ghost sm')}</div>`;}
  return h+`</section>`;}
const hsCity=c=>hsCcSection(c)+offersHere(c)+hsRgSection(c)+hsDoorSection(c)+hsTenSection(c)+cxHtml(CX_CITY,c);
const hsNoPop=c=>hsCcSection(c)+offersHere(c);
// In an offer's row: what the bundle is and what it would want from you today.
function hsOfferNote(o){if(o.type!=='cloud'||!Array.isArray(o.p))return '';const K=CLOUD_TENANTS[o.ck];
  const r=hsRgFor(o.city),x=r&&R.hs&&R.hs.rg[r],sh={room:!x||x.g-x.load>=o.bw*cloudShape(o.p).out,pair:hsRgs().length>=2,edge:!!S.hs&&!!S.hs.edge[o.city],port:hsDoor(o.city)||o.p.includes('pc')&&!o.p.includes('out')&&hsfRamp(o.city),power:!!r&&S.hs.rg[r].t>=2,home:hsRgs().some(x=>CITY[x].cc===CITY[o.city].cc),doors:Object.keys(S.pops).filter(hsDoor).length>=2,model:false};
  const ws=[...new Set(o.p.map(id=>CLOUD_PRODUCTS[id]&&CLOUD_PRODUCTS[id].need).filter(n=>n&&own(sh,n)&&!sh[n]).map(n=>tr(CLOUD_NEED[n])))];if(!sh.room&&!ws.includes(tr(CLOUD_NEED.room)))ws.push(tr(CLOUD_NEED.room));
  return `<div class="meta">☁️ ${K?esc(tr(K.n))+': ':''}${esc(cloudList(o.p))}</div>${hsSlotFree()?'':`<div class="why">${tr('hyper.no_slots')}</div>`}${ws.length?`<div class="why">${tr('hyper.tenant_wants',{list:esc(ws.join(', '))})}</div>`:''}`;}
// Why a tenant is unhappy (the customers list, bizWhy).
function hsTenWhy(b){const out=[],T=R.hs&&R.hs.ten[b.id];if(!T||!T.r)return [tr('hyper.no_region')];if(!T.v)return [tr('hyper.no_door_yet')];
  if(T.f<0.999)out.push(tr('hyper.region_full_for_tenant',{city:CITY[T.r].name}));if(T.hw>1e-9&&T.got<T.hw-0.5)out.push(tr('hyper.haul_short',{g:fmtG(T.hw-T.got)}));
  const ws=[...new Set(hsWants(R,b))];if(ws.length)out.push(tr('hyper.tenant_wants',{list:ws.join(', ')}));return out;}
