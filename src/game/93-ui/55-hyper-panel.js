/* ---------- The Hyperscaler in the interface (37-hyper.js) ----------
   Two screens, each built here from parts the other hyper files give (56-hyper-power.js, 56-hyper-traffic.js,
   57-hyper-failover.js, 57-hyper-market.js, 89-fedplay-hyper.js), so they read as one designed whole on a 360 px phone:

   The charter card (left panel, Goals tab): the title with Cloud Nine's progress; what needs you now, worst first (a
   region down, a grid cut, a protest, the launch freeze, offers about to end, a price war...), four at most with the rest
   one tap away; the one next step (👉) with its buttons; then the state of things in short lines (users, regions, power,
   replication, AI runs, the next drill, the market); Cloud Nine's four conditions; offers to take or decline; and the
   details (money, utility letters, the tightest grid) folded. Parts: {lv, h} alerts (lv 0 worst), lines of HTML.

   The city panel's Cloud tab (replaces Customers for this charter): sections that fold, each a heading with a one-line
   summary and flags for what needs you, in the order a player asks: the country's users and their home region (and the
   law), offers here, the region (build, grow, load, compute slots), its power, between regions (replica, backlog, AI
   runs), failover and drills, the front door and its edge stack, partners' edge nodes and on-ramps, tenants here.
   Early on (pnVet() false) every section is open; later a section opens by itself when a flag says it needs you (or it
   is the region of a region city), and a tap folds or unfolds it while the panel is on screen (panelFold).
   A part of the tab is {t title, sum, flags:[[class,text]], open, body()} or null. Other files may still add whole
   sections through CX_CITY and lines through CX_CARD: they go at the end. The regulators (38-hyper-regulation.js) and
   the outages (71-hyper-incidents.js) give alerts, stat lines and sections like the others, and so do the zones and
   leased cages (57-hyper-zones.js). */
const hsKv=(k,v,st)=>`<div class="kv"><span>${k}</span><b${st?` style="${st}"`:''}>${v}</b></div>`;
const hsBar=(f,bad)=>`<div class="bar${bad?' bad':''}"><i style="width:${Math.round(clamp(f,0,1)*100)}%"></i></div>`;
// A row of buttons, two at most (empty strings dropped); more go on further rows.
const hsBtns=(...b)=>{b=b.filter(Boolean);let h='';for(let i=0;i<b.length;i+=2)h+=`<div class="btns">${b.slice(i,i+2).join('')}</div>`;return h;};
const hsFlag=(c,t)=>[c,t];
// The card's folds live with the left panel's (leftFold): open ones are UI.fold[k]; 'hsoff' is the one open by default.
LEFT_FOLDS.push('hsal','hsmore','hsoff');
const hsCardOpen=k=>k==='hsoff'?!leftFolded(k):leftFolded(k);
// The one thing to do next, for a new Hyperscaler and whenever something is full.
function hsNext(){const H=S.hs,cc=CITY[S.home].cc,doors=Object.keys(S.pops).filter(hsDoor),nx=(t,b,bad)=>`<div class="hsc-nx${bad?' bad':''}"><b>👉 ${t}</b></div>${b?hsBtns(b):''}`;
  if(!H.cc[cc]&&!hsWhy(cc))return nx(tr('hyper.next_launch',{country:esc(ccName(cc))}),btn(tr('hyper.launch_in_cost',{country:esc(ccName(cc)),cost:fmt$(hsLic(cc))}),'hsLaunch',{cc},'pink sm',S.cash<hsLic(cc)));
  if(!doors.length)return nx(tr('hyper.next_door',{city:esc(CITY[S.home].name)}),btn(tr('common.open'),'popGo',{city:S.home},'pink sm'));
  // A front door whose ports out are full: users cannot get in however big the regions are.
  const R0=R.hs,dfull=hsDoorsFull();if(dfull.length)return nx(tr('hyper_ui.next_door_full',{city:esc(CITY[dfull[0]].name)}),btn(tr('common.open'),'popGo',{city:dfull[0]},'pink sm'),true);
  if(R0&&R0.short>0.5){const c=hsRgs().find(r=>R0.rg[r]&&R0.rg[r].load>=R0.rg[r].g-0.5)||S.home;return nx(tr('hyper.next_full',{g:fmtG(R0.short),city:esc(CITY[c].name)}),btn(tr('common.open'),'popGo',{city:c},'sm'),true);}
  // Nothing on fire: what runs out first, if the fix should start soon (38-hyper-forecast.js).
  {const p=hpNextHtml();if(p)return p;}
  if(!doors.some(c=>ixIdsIn(c).some(x=>S.ixp[x]!==undefined)||S.pni.some(p=>p.city===c)))return nx(tr('hyper.next_peer'));
  if(!hsTen().length)return nx(tr('hyper.next_tenant'),btn(tr('common.deals'),'leftTab',{t:'deals'},'sm'));
  // A second region: a Server Barn, or (from its level) a leased cage while the money for one comes in.
  if(hsRgN()<2&&hsRgMax()>=2)return nx(HS_T[HS_CAGE].lv<=lvl()?tr('hyper_colo.next_region',{prov:tr(hsColoP(hsGdRgAt()||S.home))}):tr('hyper.next_region'));
  if(!Object.keys(H.edge).length)return nx(tr('hyper.next_edge',{cost:fmt$(HS_EDGE_COST)}));
  return nx(tr('hyper.next_grow'));}
// What needs you now on the card, worst first: [{lv, h}], lv 0 an outage, 1 a cut or a block, 2 money or time running
// out, 3 worth knowing. Each part's own file says what it knows; this one adds the users and the offers about to end.
const HS_OFF_SOON=5;
// Front doors users come in through whose transit and exchange ports are full (under 95% of what they ask gets out).
const hsDoorsFull=()=>{const o=R.hs;if(!o)return [];return [...new Set(Object.values(o.cc).filter(x=>x.v&&x.D>1).map(x=>x.v))].filter(v=>sfOf(R,v)<0.95).sort();};
function hsCoreAlerts(){const H=S.hs,R0=R.hs,out=[];if(!R0)return out;
  for(const v of hsDoorsFull())out.push({lv:1,h:`🚪 ${tr('hyper_ui.door_full',{city:esc(CITY[v].name),p:pct(sfOf(R,v))})} ${btn(tr('common.open'),'popGo',{city:v},'ghost sm')}`});const bad=Object.keys(H.cc).filter(k=>hsQ(R,k)<CX_GOOD).sort();
  if(bad.length)out.push({lv:2,h:tr('hyper.poor_in_list',{list:bad.slice(0,4).map(k=>esc(ccName(k))).join(', ')})});
  for(const v of Object.keys(R0.door).sort()){const x=R0.door[v];if(x.g-x.got>0.5)out.push({lv:1,h:`${tr('hyper.backbone_full',{city:esc(CITY[v].name),g:fmtG(x.g-x.got)})} ${btn(tr('common.open'),'popGo',{city:v},'ghost sm')}`});}
  // Offers that end within HS_OFF_SOON days: tenants (Deals tab), AI runs and the resale desk (on this card).
  const soon=S.offers.filter(o=>o.type==='cloud'&&o.exp-S.day<=HS_OFF_SOON).length,mine=(H.jo||[]).concat(H.rs?H.rs.o:[]).filter(o=>o.exp-S.day<=HS_OFF_SOON).length;
  if(soon)out.push({lv:2,h:`⏳ ${trn('hyper_ui.tenant_offers_ending',soon,{d:HS_OFF_SOON})} ${btn(tr('common.deals'),'leftTab',{t:'deals'},'ghost sm')}`});
  if(mine)out.push({lv:2,h:`⏳ ${trn('hyper_ui.card_offers_ending',mine,{d:HS_OFF_SOON})}`});
  return out;}
function hsAlerts(){const z=chFrozen(),a=[...hsIncAlerts(),...hsLawAlerts(),...hsFailAlerts(),...hsPwAlerts(),...hsLfAlerts(),...hsRvAlerts(),...hsCoreAlerts(),...hsAzAlerts()];
  if(z)a.push({lv:1,h:`<b>🧊 ${tr('change_freeze.frozen_why',{show:z.show,date:dateStr(z.until)})}</b>`});
  return a.map((x,i)=>[x,i]).sort((p,q)=>p[0].lv-q[0].lv||p[1]-q[1]).map(p=>p[0]);}
const HS_AL_TOP=4;
function hsAlertHtml(){const a=hsAlerts();if(!a.length)return '';const open=hsCardOpen('hsal'),n=open||a.length<=HS_AL_TOP+1?a.length:HS_AL_TOP;
  const row=x=>`<div class="hsa lv${Math.min(3,x.lv)}">${x.h}</div>`;
  return `<div class="hsc-al" role="list">${a.slice(0,n).map(row).join('')}${a.length>HS_AL_TOP+1?foldB(open?tr('common.hide'):trn('hyper_ui.n_more_alerts',a.length-HS_AL_TOP),'leftFold',{k:'hsal'},open,'ghost sm hsc-fold'):''}</div>`;}
// The state of things, one short line each.
function hsStatHtml(){const H=S.hs,ccs=Object.keys(H.cc),doors=Object.keys(S.pops).filter(hsDoor);
  return `<div class="hsc-st">`
   +`<div class="meta">👥 ${trn('hyper_ui.card_users_n',ccs.length,{g:fmtG(hsUsers()),p:pct(hsServed(R))})}</div>`
   +`<div class="meta">🏢 ${tr('hyper.card_infra',{n:hsRgs().length,max:hsRgMax(),d:doors.length,e:Object.keys(H.edge).length,t:hsTen().length})}</div>`
   +hsAzStat()+hsPwStat()+hsTrafficStat()+hsDrillStat()+hsMarketStat()+hsLawStat()+`</div>`;}
// Folded details: the money, the utility's letters, the tightest grid, what the resale desk sold.
function hsMoreHtml(){const H=S.hs,open=hsCardOpen('hsmore');let rev=0;for(const cc in H.cc)rev+=hsRev(R,cc);
  return foldB(tr('hyper_ui.details'),'leftFold',{k:'hsmore'},open,'ghost sm hsc-fold')+(open?`<div class="hsc-more"><div class="meta">💵 ${tr('hyper.card_money',{rev:fmt$(rev),cost:fmt$((R.cost&&R.cost.cloud)||0)})}</div>${hpCalCard()}${hsPwMore()}${hsrSold()}</div>`:'');}
// Offers waiting on this card (AI runs, the resale desk), open until folded.
function hsOffHtml(){const H=S.hs,n=(H.jo||[]).length+(H.rs?H.rs.o.length:0);if(!n)return '';const open=hsCardOpen('hsoff');
  return `<div class="hsc-off">${foldB(trn('hyper_ui.n_offers_waiting',n),'leftFold',{k:'hsoff'},open,'ghost sm hsc-fold')}${open?hsTrafficOffers()+hsrOffers():''}</div>`;}
function hsCard(){const H=S.hs;if(!H)return '';const x=hsC9(),done=H.won?4:[x.ct>=HS_C9_CT,x.ps>0&&x.dr===x.ps,x.cab,x.btw>=HS_C9_BTW-LV_EPS].filter(Boolean).length;
  return `<div class="inc hsc"><div class="hsc-h"><span class="nm">☁️ ${tr('hyper.cloud_nine')}</span><span class="hsc-p${H.won?' won':''}" title="${esc(tr('hyper_win.cloud_nine'))}">${done}/4</span></div>`
    +hsAlertHtml()+hsNext()+hsStatHtml()+hsC9Card()+hsOffHtml()+cxHtml(CX_CARD)+hsMoreHtml()+`</div>`;}

/* ---------- The Cloud tab ---------- */
// A section that folds: the panel's sections (pnSec's look), opened by default when it needs you (flags) or s.open.
function hsSec(k,s){if(!s)return '';const key='s:hs'+k,v=pnState().open[key],fl=s.flags||[],o=v!==undefined?!!v:!pnVet()||!!s.open||fl.length>0;
  return `<section class="psec hsec${o?' on':''}" data-sec="hs${k}"><div class="psh"><button class="psb" data-act="panelFold" data-args='{"k":"${key}","o":${o?0:1}}' aria-expanded="${o}"><span class="psa">${o?'▾':'▸'}</span><span class="pst">${s.t}</span><span class="pss">${s.sum||''}</span>${fl.map(([c,t])=>`<span class="tag psf ${c}">${t}</span>`).join('')}</button></div>${o?s.body():''}</section>`;}
// The country a city is in: its users, how well they are served and from where, or the launch; and its law.
function hsCcSpec(c){const cc=CITY[c].cc,H=S.hs,x=H.cc[cc],w=hsWhy(cc),law=hsLawBody(c),fl=[];let sum='';
  if(x){const q=hsQ(R,cc),o=R.hs&&R.hs.cc[cc];sum=tr('hyper_ui.sum_users',{g:fmtG(x.d),p:pct(q)});
    if(q<CX_GOOD)fl.push(hsFlag('restrictive',tr('hyper_ui.f_poor')));if(o&&o.v&&(o.short>0.5||o.want-o.got>0.5))fl.push(hsFlag('restrictive',tr('hyper_ui.f_short')));}
  else sum=w?'':tr('hyper_ui.sum_not_launched');
  if(law&&x&&!hsResMet(cc))fl.push(hsFlag('selective',tr('hyper_ui.f_law')));
  return {t:tr('hyper.users_in',{country:esc(ccName(cc))}),sum,flags:fl,open:!x&&!w,body:()=>hsCcBody(c)+law};}
function hsCcBody(c){const cc=CITY[c].cc,H=S.hs,x=H.cc[cc],w=hsWhy(cc);let h='';
  if(x){const q=hsQ(R,cc),o=R.hs&&R.hs.cc[cc],P=hsPot(cc);
    h+=hsKv(tr('hyper.users'),tr('city_panel.a_of_b',{a:fmtG(x.d),b:fmtG(P)}))+hsBar(x.d/(P||1))
     +hsKv(tr('hyper.quality'),pct(q),`color:${q<CX_GOOD?'var(--bad)':'var(--eye)'}`)+hsBar(q,q<CX_GOOD)
     +hsKv(tr('common.revenue'),tr('common.price_mo',{price:fmt$(hsRev(R,cc))}));
    if(o&&o.v)h+=`<p class="meta">${tr('hyper.enter_at',{door:esc(CITY[o.v].name)})}${o.home?' · '+tr('hyper.home_region',{city:esc(CITY[o.home].name)}):''}${o.st>0?' · '+tr('hyper.edge_serves',{g:fmtG(o.st)}):''}</p>`;
    if(o&&!o.v)h+=`<p class="why">${tr('hyper.no_door_yet')}</p>`;
    // Without a front door nothing is short of room yet: the door is what is missing.
    if(o&&o.v&&o.short>0.5)h+=`<p class="why">${tr('hyper.regions_full_here',{g:fmtG(o.short)})}</p>`;
    if(o&&o.want-o.got>0.5)h+=`<p class="why">${tr('hyper.haul_short',{g:fmtG(o.want-o.got)})}</p>`;
    if(o&&o.parts.some(p=>p[2]>HS_MS[0]))h+=`<p class="note">${tr('hyper.far_hint',{ms:Math.round(Math.max(...o.parts.map(p=>p[2])))})}</p>`;
    if(q<CX_GOOD)h+=`<p class="why">${tr('hyper.users_leaving')}</p>`;h+=hpCcLine(cc);}
  else if(w)h+=`<p class="why">${w}</p>`;
  else h+=`<p class="lead">${tr('hyper.launch_lead',{g:fmtG(Math.max(1,hsPot(cc)*HS_START)),max:fmtG(hsPot(cc))})}</p>${hsBtns(btn(tr('hyper.launch_in_cost',{country:esc(ccName(cc)),cost:fmt$(hsLic(cc))}),'hsLaunch',{cc},'pink',S.cash<hsLic(cc)))}`;
  return h;}
const hsCcSection=c=>hsSec('cc',hsCcSpec(c));
// The region here: build, grow, load, compute slots.
function hsRgSpec(c){const H=S.hs,d=H.rg[c];if(!d&&!hsSite(c))return null;const fl=[];let sum;
  if(d){const T=HS_T[d.t],G=hsRgG(c),x=R.hs&&R.hs.rg[c],load=x?x.load:0;
    if(d.ready>S.day)sum=tr('hyper_ui.sum_building',{name:tr(T.n),date:dateStr(d.ready)});
    else{sum=tr('hyper_ui.sum_region',{name:tr(T.n),p:pct(load/(G||1))});if(load>=G*0.95)fl.push(hsFlag('restrictive',tr('hyper_ui.f_full')));else{const f=hpRgFlag(c);if(f)fl.push(f);}}
    if(hsOut(c)&&!(H.dx&&H.dx.c===c))fl.push(hsFlag('restrictive',tr('hyper_ui.f_down')));}
  else sum=tr('hyper_ui.sum_no_region');
  return {t:tr('hyper.region'),sum,flags:fl,open:!!d,body:()=>hsRgBody(c)};}
function hsRgBody(c){const H=S.hs,d=H.rg[c];let h='';
  if(d){const T=HS_T[d.t],N=hsTNext(d),G=hsRgG(c),x=R.hs&&R.hs.rg[c],load=x?x.load:0;
    if(d.ready>S.day)h+=`<p class="lead">${tr('hyper.being_built',{name:tr(T.n),date:dateStr(d.ready)})}</p>`;
    else h+=hsKv(tr(T.n),tr('city_panel.a_of_b',{a:fmtG(load),b:fmtG(G)}))+hsBar(load/G,load>=G*0.95);
    h+=hsKv(tr('hyper.power'),tr('hyper.mw_of_grid',{mw:Math.round(hsMwRes(c)),grid:hsSupply(c)}))+hsKv(tr('hyper.slots'),tr('city_panel.a_of_b',{a:hsSlotsUsed(c),b:hsSlots(c)}));
    if(d.ready<=S.day)h+=hpRgLines(c);
    if(d.up)h+=`<p class="meta">${tr('hyper.being_built',{name:tr(HS_T[d.up.t].n),date:dateStr(d.up.ready)})}</p>`;
    if(!cxOut(c)&&!Object.keys(S.pops).some(hsDoor))h+=`<p class="why">${tr('hyper.region_no_way_out')}</p>`;
    if(N&&!d.up)h+=`<p class="meta">${tr('hyper.tier_terms',{name:tr(N.n),g:fmtG(N.g),mw:N.mw,slots:N.slots,mo:fmt$(N.mo),n:leadDays(N.days)})}</p>${hsBtns(btn(N.lv>lvl()?tr('hyper.tier_needs_level',{name:tr(N.n),lv:N.lv}):tr('hyper.grow_region_cost',{cost:fmt$(N.cost)}),'hsRegion',{city:c},'sm',N.lv>lvl()||S.cash<N.cost||d.ready>S.day))}`;}
    if(hsRgN()>=2)h+=hsBtns(btn(UI.confirm==='hsrg'+c?tr('hyper.close_region_sure'):tr('hyper.close_region'),'hsRgClose',{city:c},UI.confirm==='hsrg'+c?'sm red':'sm ghost'));
  else{const N=HS_T[1],full=hsRgN()>=hsRgMax();h+=`<p class="lead">${tr('hyper.region_lead')}</p>${full?`<p class="why">${tr('hyper.your_level_allows_n_regions',{n:hsRgMax()})}</p>`:''}
    <p class="meta">${tr('hyper.tier_terms',{name:tr(N.n),g:fmtG(N.g),mw:N.mw,slots:N.slots,mo:fmt$(N.mo),n:leadDays(N.days)})}</p>${hsBtns(btn(tr('hyper.build_region_cost',{cost:fmt$(N.cost)}),'hsRegion',{city:c},'pink',full||S.cash<N.cost))}`;}
  return h;}
const hsRgSection=c=>hsSec('rg',hsRgSpec(c));
// The front door here and its edge stack.
function hsDoorSpec(c){const H=S.hs,door=hsDoor(c),x=R.hs&&R.hs.door[c],fl=[];let sum;
  if(!door)sum=tr('hyper_ui.sum_no_door');
  else{sum=x&&x.g>0.01?tr('hyper_ui.sum_hauled',{got:fmtG(x.got),g:fmtG(x.g)}):'';if(H.edge[c])sum+=(sum?' · ':'')+tr('hyper_ui.sum_edge');
    if(x&&x.got<x.g-0.5)fl.push(hsFlag('restrictive',tr('hyper_ui.f_short')));}
  return {t:tr('hyper.front_door'),sum,flags:fl,body:()=>hsDoorBody(c)};}
function hsDoorBody(c){const H=S.hs,door=hsDoor(c),x=R.hs&&R.hs.door[c];if(!door)return `<p class="why">${tr('hyper.no_way_out_here')}</p>`;
  let h=`<p class="lead">${tr('hyper.door_lead')}</p>`;if(x&&x.g>0.01)h+=hsKv(tr('hyper.hauled_here'),tr('city_panel.a_of_b',{a:fmtG(x.got),b:fmtG(x.g)}))+hsBar(x.got/x.g,x.got<x.g-0.5);
  h+=hpDoorLine(c);h+=H.edge[c]?`<p class="meta">✅ ${tr('hyper.edge_here',{p:pct(HS_EDGE)})}</p>`:`<p class="meta">${tr('hyper.edge_terms',{p:pct(HS_EDGE),mo:fmt$(HS_EDGE_MO)})}</p>${hsBtns(btn(tr('hyper.buy_edge_cost',{cost:fmt$(HS_EDGE_COST)}),'hsEdge',{city:c},'sm',S.cash<HS_EDGE_COST))}`;
  return h;}
const hsDoorSection=c=>hsSec('door',hsDoorSpec(c));
// A tenant's products, each with what it still wants.
const hsWants=(r,b)=>b.p.filter(id=>CLOUD_PRODUCTS[id]&&hsNeedQ(r,b,id)<0.95).map(id=>tr(CLOUD_NEED[CLOUD_PRODUCTS[id].need]));
/* Tenants have two cities: where they are based (their offices and their own users, b.city) and the region their servers
   run in (b.rg), as a real cloud customer in Nantes runs in Frankfurt. Every city lists the first; a region city also
   lists the second, so a POP with no region never looks as if it hosts anyone. */
function hsTenSpec(c){const bs=hsTen().filter(b=>b.city===c),sad=bs.filter(b=>b.mood<30).length,rg=!!S.hs.rg[c];
  const away=bs.filter(b=>{const T=R.hs&&R.hs.ten[b.id];return !(T&&T.r===c);}).length;
  return {t:tr('hyper.based_here'),sum:bs.length?tr('hyper_ui.sum_tenants',{n:bs.length,mo:fmt$(bs.reduce((a,b)=>a+bizMo(b),0))}):'',flags:sad?[hsFlag('restrictive',trn('hyper_ui.f_unhappy',sad))]:[],
    body:()=>(bs.length&&away?`<p class="lead">${rg?tr('hyper.based_here_lead_rg'):tr('hyper.based_here_lead')}</p>`:'')+hsTenBody(c,bs)};}
// A region's own guests: tenants whose servers run here, wherever they are based.
function hsRunSpec(c){if(!S.hs.rg[c])return null;const bs=hsTen().filter(b=>{const T=R.hs&&R.hs.ten[b.id];return T&&T.r===c&&b.city!==c;});if(!bs.length)return null;
  return {t:tr('hyper.running_here'),sum:tr('hyper_ui.sum_tenants',{n:bs.length,mo:fmt$(bs.reduce((a,b)=>a+bizMo(b),0))}),flags:[],
    body:()=>bs.map(b=>`<div class="row"><div class="grow"><div class="nm">${esc(b.name)}</div><div class="meta">${tr('hyper.based_in',{city:esc(CITY[b.city].name)})} · ${esc(cloudList(b.p))} · ${tr('hyper.bundle_score',{p:pct(hsTenQ(R,b))})}</div></div></div>`).join('')};}
function hsTenBody(c,bs){if(!bs.length)return `<p class="empty">${tr('hyper.no_tenants_here')}</p>`;let h='';
  // Unhappy tenants first, so the one about to leave is never under the fold.
  for(const b of bs.filter(b=>b.mood<30).concat(bs.filter(b=>!(b.mood<30)))){const q=hsTenQ(R,b),T=R.hs&&R.hs.ten[b.id],K=CLOUD_TENANTS[b.ck],ws=[...new Set(hsWants(R,b))];
    h+=`<div class="row"><div class="grow"><div class="nm">${esc(b.name)}</div><div class="meta">${K?esc(tr(K.n)):''} · ${esc(cloudList(b.p))} · ${tr('common.price_mo',{price:fmt$(bizMo(b))})}</div>
      <div class="meta">${T&&T.r?tr('hyper.served_from',{city:esc(CITY[T.r].name)}):tr('hyper.no_region')} · ${tr('hyper.bundle_score',{p:pct(q)})}</div>${ws.length?`<div class="why">${tr('hyper.tenant_wants',{list:esc(ws.join(', '))})}</div>`:''}
      ${hsBar(b.mood/100,b.mood<30)}<div class="meta">${tr('common.happiness_p',{p:Math.round(b.mood)})}</div></div>${btn(UI.confirm===b.id?tr('common.really_drop'):tr('common.drop'),'dropBiz',{id:b.id},'ghost sm')}</div>`;}
  return h;}
const hsTenSection=c=>hsSec('ten',hsTenSpec(c));
// The whole tab, in the order a player asks. Offers here wait for an answer, so they come right after the users.
function hsCity(c){return hsSec('inc',hsIncSpec(c))+hsSec('cc',hsCcSpec(c))+hsSec('law',hsLawSpec(c))+offersHere(c)+hsSec('rg',hsRgSpec(c))+hsSec('az',hsAzSpec(c))+hsSec('pw',hsPwSpec(c))+hsSec('bt',hsBtSpec(c))+hsSec('fo',hsFailSpec(c))
  +hsSec('door',hsDoorSpec(c))+hsSec('ep',hsfEdgeSpec(c))+hsSec('or',hsfRampSpec(c))+hsSec('ten',hsTenSpec(c))+hsSec('run',hsRunSpec(c))+cxHtml(CX_CITY,c);}
const hsNoPop=c=>hsSec('cc',hsCcSpec(c))+offersHere(c);
// In an offer's row: what the bundle is and what it would want from you today.
function hsOfferNote(o){if(o.type!=='cloud'||!Array.isArray(o.p))return '';const K=CLOUD_TENANTS[o.ck];
  const r=hsRgFor(o.city),x=r&&R.hs&&R.hs.rg[r],sh={room:!x||x.g-x.load>=o.bw*cloudShape(o.p).out,pair:hsRgs().length>=2,edge:!!S.hs&&!!S.hs.edge[o.city],port:hsDoor(o.city)||o.p.includes('pc')&&!o.p.includes('out')&&hsfRamp(o.city),power:!!r&&S.hs.rg[r].t>=2&&S.hs.rg[r].t<HS_CAGE,home:hsRgs().some(x=>CITY[x].cc===CITY[o.city].cc),doors:Object.keys(S.pops).filter(hsDoor).length>=2,model:hsAiOn()};
  const ws=[...new Set(o.p.map(id=>CLOUD_PRODUCTS[id]&&CLOUD_PRODUCTS[id].need).filter(n=>n&&own(sh,n)&&!sh[n]).map(n=>tr(CLOUD_NEED[n])))];if(!sh.room&&!ws.includes(tr(CLOUD_NEED.room)))ws.push(tr(CLOUD_NEED.room));
  return `<div class="meta">☁️ ${K?esc(tr(K.n))+': ':''}${esc(cloudList(o.p))}</div>${hsSlotFree()?'':`<div class="why">${tr('hyper.no_slots')}</div>`}${ws.length?`<div class="why">${tr('hyper.tenant_wants',{list:esc(ws.join(', '))})}</div>`:''}`;}
// Why a tenant is unhappy (the customers list, bizWhy).
function hsTenWhy(b){const out=[],T=R.hs&&R.hs.ten[b.id];if(!T||!T.r)return [tr('hyper.no_region')];if(!T.v)return [tr('hyper.no_door_yet')];
  if(T.f<0.999)out.push(tr('hyper.region_full_for_tenant',{city:CITY[T.r].name}));if(T.hw>1e-9&&T.got<T.hw-0.5)out.push(tr('hyper.haul_short',{g:fmtG(T.hw-T.got)}));
  const ws=[...new Set(hsWants(R,b))];if(ws.length)out.push(tr('hyper.tenant_wants',{list:ws.join(', ')}));return out;}
