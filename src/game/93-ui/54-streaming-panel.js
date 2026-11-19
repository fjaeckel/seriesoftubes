/* ---------- The Streaming service in the interface (37-streaming.js) ----------
   The charter card on the left panel (subscribers, Must-Carry, the next premiere, a dispute, the catalogue) and the city
   panel's Streaming tab: the country's viewers, an origin data center, and Binge Boxes with the eyeball networks here. */
const prefillCost=()=>5000+3000*S.cnt.box.length;
const catNext=()=>CAT_T[S.cnt.cat+1]||null;
function cntCard(){const C=S.cnt;if(!C)return '';const f=mcFree(),on=onNet(R),ccs=Object.keys(C.cc);
  let h=`<div class="inc" style="background:#FFF1E6"><div class="nm">📺 ${tr('streaming.must_carry')}</div>`;
  {const z=cntFrozen();if(z)h+=`<div class="meta" style="color:var(--bad)"><b>🧊 ${tr('streaming.freeze_line',{show:z.show,date:dateStr(z.until)})}</b></div>`;}
  if(C.won)h+=`<div class="meta">${tr('streaming.won_on_date',{date:dateStr(C.won)})}</div>`;
  h+=`<div class="meta">${tr('streaming.subs_in_n_countries',{subs:fmtSubs(subsAll()),n:ccs.length})} · ${tr('streaming.on_net_p',{p:pct(on)})} · ${tr('streaming.origins_n_of_max',{n:dcN(),max:dcMax()})}</div>`;
  if(!C.won)h+=`<div class="meta">${tr('streaming.mc_progress',{a:Math.min(f.cc,MC_CC),cc:MC_CC,b:Math.min(f.reg,MC_REG),reg:MC_REG,prem:C.premAll?'✓':'✗',p:pct(on),need:pct(MC_ON)})}</div>`;
  if(!ccs.length)h+=`<div class="meta">${tr('streaming.start_hint')}</div>`;
  const bad=ccs.filter(k=>ccQ(R,k)<0.9);
  if(bad.length)h+=`<div class="meta" style="color:var(--bad)">${tr('streaming.buffering_in_list',{list:bad.slice(0,5).map(k=>esc(ccName(k))).join(', ')})}</div>`;
  if(R.cnt&&R.cnt.short>0.5)h+=`<div class="meta" style="color:var(--bad)">${tr('streaming.origins_full_g',{g:fmtG(R.cnt.short)})}</div>`;
  for(const v of Object.keys((R.cnt&&R.cnt.haul)||{})){const x=R.cnt.haul[v];if(x.g-x.got>0.5)h+=`<div class="meta" style="color:var(--bad)">${tr('streaming.backbone_to_city_full',{city:esc(CITY[v].name),g:fmtG(x.g-x.got)})}</div>`;}
  const p=C.prem;
  if(p){const where=p.reg==='ALL'?tr('streaming.everywhere'):REG[p.reg],show=premShow(p);
    if(S.day<p.day)h+=`<div class="meta">${(p.live?tr('streaming.live_in_n_days',{show,where,n:p.day-S.day}):tr('streaming.premiere_in_n_days',{show,where,n:p.day-S.day}))}</div>${p.live?`<div class="meta">${tr('streaming.live_hint')}</div>`:`<div class="btns">${p.pf?`<span class="tag st on">${tr('streaming.boxes_pre_filled')}</span>`:btn(tr('streaming.pre_fill_boxes_cost',{cost:fmt$(prefillCost())}),'cntPrefill',{},'sm',!C.box.length||S.cash<prefillCost())}</div>`}`;
    else h+=`<div class="meta">${(p.live?tr('streaming.live_tonight',{show,where}):tr('streaming.premiere_tonight',{show,where}))}</div>`;}
  const D=C.disp;
  if(D){const n=NET[D.net];h+=`<div class="meta" style="color:var(--bad)">${tr('streaming.dispute_line2',{net:esc(n.name),fee:fmt$(D.fee)})} ${tr('streaming.dispute_carrying_p',{p:pct(D.cut)})}</div><div class="btns">${btn(tr('streaming.pay_fee_mo',{fee:fmt$(D.fee)}),'cntPay',{},'sm')}${D.camp?`<span class="tag st on">${tr('streaming.campaign_n_days_left',{n:Math.max(0,D.camp-S.day)})}</span>`:btn(tr('streaming.tell_your_viewers_cost',{cost:fmt$(DISP_CAMP)}),'cntCamp',{},'pink sm',S.cash<DISP_CAMP)}</div>`;}
  // Event rights (38-streaming-events.js): offers to buy, then what is on the schedule.
  for(const o of C.roff)h+=`<div class="meta">🎟️ ${tr('streaming.rights_offer',{show:tr(EV_NAMES[o.n]),where:evWhere(o),date:dateStr(o.day),x:o.mul,p:pct(o.gain)})}</div><div class="btns">${btn(tr('streaming.buy_rights_cost',{cost:fmt$(o.fee)}),'cntRights',{id:o.id},'pink sm',S.cash<o.fee)}${btn(tr('common.decline'),'cntRightsNo',{id:o.id},'ghost sm')}</div>`;
  for(const e of C.evs)h+=`<div class="meta">🎟️ ${evOn(e,S.day)?tr('streaming.event_live_now',{show:evName(e),where:evWhere(e)}):tr('streaming.event_in_n_days',{show:evName(e),where:evWhere(e),n:e.day-S.day})}</div>`;
  // Bundles (38-streaming-bundles.js): offers waiting for an answer, then the ones running.
  for(const o of C.boff){const n=NET[o.net];h+=`<div class="meta">📦 ${tr('streaming.bundle_offer',{net:esc(n.name),list:Object.keys(o.g).map(k=>esc(ccName(k))).join(', '),subs:fmtSubs(bundAll(o)),p:pct(o.cut),n:Math.round(o.days/30)})}${o.by?' · '+esc(tr(SALES[o.by].s)):''}</div><div class="btns">${btn(tr('streaming.sign_bundle'),'cntBund',{id:o.id},'pink sm')}${btn(tr('common.decline'),'cntBundNo',{id:o.id},'ghost sm')}</div>`;}
  for(const b of C.bund)h+=`<div class="meta">📦 ${tr('streaming.bundle_running',{net:esc(NET[b.net].name),subs:fmtSubs(bundAll(b)),date:dateStr(b.until)})}</div>`;
  for(const id of Object.keys(C.paid)){const x=C.paid[id];h+=`<div class="meta">${tr('streaming.deal_line',{net:esc(NET[id].name),fee:fmt$(x.fee),date:dateStr(x.until)})}</div>`;}
  const N=catNext();h+=`<div class="meta">${tr('streaming.catalogue_name',{name:tr(CAT_T[C.cat].n)})}</div>`;
  if(N)h+=`<div class="btns">${btn(N.lv>lvl()?tr('streaming.cat_name_level_lv',{name:tr(N.n),lv:N.lv}):tr('streaming.cat_up_cost_mo',{name:tr(N.n),cost:fmt$(N.cost),mo:fmt$(N.mo)}),'cntCat',{},'sm',N.lv>lvl()||S.cash<N.cost)}</div>`;
  for(const f of CNT_CARD)h+=f();
  return h+`</div>`;}
// The country a city is in: its subscribers, how well they are served and from where, or the launch.
function ccSection(c){const cc=CITY[c].cc,C=S.cnt,x=C.cc[cc],w=ccWhy(cc);let h=`<section><h3>${tr('streaming.viewers_in_country',{country:esc(ccName(cc))})}</h3>`;
  if(x){const q=ccQ(R,cc),o=R.cnt&&R.cnt.cc[cc],src=o?[...o.parts.reduce((m,[c,g,km])=>{const x=m.get(c);if(x)x[1]+=g;else m.set(c,[c,g,km]);return m;},new Map()).values()].sort((a,b)=>b[1]-a[1]).slice(0,3):[];
    h+=`<div class="kv"><span>${tr('streaming.subscribers')}</span><b>${tr('city_panel.a_of_b',{a:fmtSubs(x.d),b:fmtSubs(ccPot(cc))})}</b></div><div class="bar me"><i style="width:${Math.min(100,x.d/(ccPot(cc)||1)*100)}%"></i></div>
    <div class="kv"><span>${tr('streaming.picture_quality')}</span><b style="color:${q<0.9?'var(--bad)':'var(--eye)'}">${pct(q)}</b></div><div class="bar ${q<0.9?'bad':''}"><i style="width:${q*100}%"></i></div>
    <div class="kv"><span>${tr('common.revenue')}</span><b>${tr('common.price_mo',{price:fmt$(x.d*q*CNT_RATE)})}</b></div>
    ${src.length?`<p class="meta">${tr('streaming.served_from_list',{list:src.map(([s,g,km])=>`${esc(CITY[s].name)} ${fmtG(g)} (${km.toLocaleString()} km)`).join(', ')})}</p>`:''}
    ${o&&o.short>0.5?`<p class="why">${tr('streaming.origins_full_here',{g:fmtG(o.short)})}</p>`:''}${src.filter(([s])=>!cntOut(s)).map(([s])=>`<p class="why">${tr('streaming.pop_has_no_way_out',{city:esc(CITY[s].name)})}</p>`).join('')}${src.some(([s])=>S.cnt.dc[s])&&!S.cnt.box.length&&src.every(([s,,km])=>km>1500)?`<p class="note">${tr('streaming.build_a_pop_near_viewers')}</p>`:''}${q<0.9?`<p class="why">${tr('streaming.viewers_are_leaving')}</p>`:''}`;}
  else if(w)h+=`<p class="why">${w}</p>`;
  else h+=`<p class="lead">${tr('streaming.launch_lead',{subs:fmtSubs(Math.max(1,ccPot(cc)*CNT_START)),max:fmtSubs(ccPot(cc))})}</p>${btn(tr('streaming.launch_in_country_cost',{country:esc(ccName(cc)),cost:fmt$(ccLic(cc))}),'cntLaunch',{cc},'pink',S.cash<ccLic(cc))}`;
  return h+`</section>`;}
// Does this POP have a way out? An origin needs one.
const cntOut=c=>S.transit.some(t=>t.city===c)||ixIdsIn(c).some(x=>S.ixp[x]!==undefined)||S.pni.some(p=>p.city===c);
function dcSection(c){const C=S.cnt,d=C.dc[c];if(!d&&!dcSite(c))return '';let h=`<section><h3>${tr('streaming.origin_data_center')}</h3>`;
  if(d){const T=DC_T[d.t],load=(R.cnt&&R.cnt.org[c])||0,N=DC_T[d.t+1];
    if(d.ready>S.day)h+=`<p class="lead">${tr('streaming.being_built_live_on',{name:tr(T.n),date:dateStr(d.ready)})}</p>`;
    else h+=`<div class="kv"><span>${tr(T.n)}</span><b>${tr('city_panel.a_of_b',{a:fmtG(load),b:fmtG(T.g)})}</b></div><div class="bar ${load>=T.g*0.95?'bad':''}"><i style="width:${Math.min(100,load/T.g*100)}%"></i></div>`;
    if(d.up)h+=`<p class="meta">${tr('streaming.being_built_live_on',{name:tr(DC_T[d.up.t].n),date:dateStr(d.up.ready)})}</p>`;
    if(!cntOut(c))h+=`<p class="why">${tr('streaming.no_way_out')}</p>`;
    if(N&&!d.up)h+=`<p class="meta">${tr('streaming.dc_terms',{name:tr(N.n),g:fmtG(N.g),mo:fmt$(N.mo),n:leadDays(N.days)})}</p><div class="btns">${btn(N.lv>lvl()?tr('streaming.cat_name_level_lv',{name:tr(N.n),lv:N.lv}):tr('streaming.grow_origin_cost',{cost:fmt$(N.cost)}),'cntDc',{city:c},'sm',N.lv>lvl()||S.cash<N.cost||d.ready>S.day)}</div>`;}
  else{const N=DC_T[1],full=dcN()>=dcMax();h+=`<p class="lead">${tr('streaming.origin_lead')}</p>${full?`<p class="why">${tr('streaming.your_level_allows_n_origins',{n:dcMax()})}</p>`:''}<p class="meta">${tr('streaming.dc_terms',{name:tr(N.n),g:fmtG(N.g),mo:fmt$(N.mo),n:leadDays(N.days)})}</p>${btn(tr('streaming.build_origin_cost2',{cost:fmt$(N.cost)}),'cntDc',{city:c},'pink',full||S.cash<N.cost)}`;}
  return h+`</section>`;}
function boxSection(c){const C=S.cnt,nets=boxNets(c);let h=`<section><h3>${tr('streaming.binge_boxes')}</h3><p class="lead">${tr('streaming.boxes_lead',{g:fmtG(BOX_G)})}</p>`;
  if(!nets.length)return h+`<p class="empty">${tr('streaming.nobody_sells_to_homes_here')}</p></section>`;
  for(const n of nets){const have=C.box.filter(b=>b.city===c&&b.net===n.id),why=boxWhy(c,n.id),use=have.reduce((a,b)=>a+(R.useCache[b.id]||0),0),fee=boxHost(n);
    h+=`<div class="row">${logo(n)}<div class="grow"><div class="nm">${esc(n.name)}</div><div class="meta">${have.length?`${trn('common.n_box',have.length)} · ${tr('city_panel.serving_v',{v:fmtG(use)})} · ${tr('streaming.hit_p',{p:pct(boxHit(c)*have.reduce((x,b)=>x+b.f,0)/have.length)})}${have.some(b=>b.f<1)?' · '+tr('streaming.filling_p',{p:pct(have.reduce((x,b)=>x+b.f,0)/have.length)}):''}`:tr('streaming.your_traffic_to_net_g',{g:fmtG(R.demTo[n.id]||0)})}${fee?' · '+tr('streaming.hosting_fee_mo',{fee:fmt$(fee)}):' · '+tr('streaming.hosted_free')}</div>${why&&!have.length?`<div class="why">${why}</div>`:''}</div>
    <div class="btns">${btn(tr('streaming.add_box_cost',{cost:fmt$(BOX_COST)}),'cntBox',{city:c,net:n.id,d:1},'sm',!!why||S.cash<BOX_COST)}${have.length?btn(tr('streaming.remove_box'),'cntBox',{city:c,net:n.id,d:-1},'ghost sm'):''}</div></div>`;}
  return h+`</section>`;}
const streamHere=c=>ccSection(c)+dcSection(c)+boxSection(c)+CNT_CITY.map(f=>f(c)).join('');
