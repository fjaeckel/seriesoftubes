/* ---------- Pie Control's Bottlenecks tab: what is full in orbit and what fixes it ----------
   Read from the last compute (R.pie), never computed here. Each bottleneck {k kind, w how full, lack Gbps, c city, ic, t, h, b
   buttons} says what is full, why it matters and offers the button that fixes it: antennas on a full dish, a dish nearby
   once it has 16, more pies or another crust for a full crust, the city panel where orbit traffic is stuck on fiber, a dish
   within reach of starved terminal customers. A greyed button says why next to it (pieBtn). */
const PIE_FULL=0.9;
// Kinds, for the filter: crusts, dishes (full or missing), fiber where orbit lands, customers out of reach, backhaul.
const PIE_FK={crust:'sky',skyfull:'sky',ant:'dish',dish:'dish',fiber:'fiber',far:'reach',nocrust:'reach',home:'reach',bh:'bh'};
const PIE_FKS=['sky','dish','fiber','reach','bh'],PIE_FSORT=['sev','lack','city'];
// The nearest POP to city c with no dish, within PIE_BENT km, that a carrying crust over c also covers.
// Kept on this compute's R.pie (out of JSON): a full dish asks once, not on every redraw.
function pieNearPop(c,Q){let M=Q._near;if(!M)Object.defineProperty(Q,'_near',{value:M=new Map()});if(M.has(c))return M.get(c);
  const P=S.pie,cs=Q.hubs.filter(id=>pieCovers(id,c)),has=new Set(P.dishes.map(x=>x.city));let best=null,bk=Infinity;
  for(const p of Object.keys(S.pops)){if(has.has(p)||!cs.some(id=>pieCovers(id,p)))continue;const km=p===c?0:pieKm(c,p);if(km<=PIE_BENT&&km<bk){bk=km;best=p;}}M.set(c,best);return best;}
// The nearest other working dish within PIE_BENT km of c, under a carrying crust over both, with antennas left to add.
function pieNearAnt(c,Q){let M=Q._nearA;if(!M)Object.defineProperty(Q,'_nearA',{value:M=new Map()});if(M.has(c))return M.get(c);
  const cs=Q.hubs.filter(id=>pieCovers(id,c)),on=new Set(Q.dish.filter(d=>d.cap>0).map(d=>d.city));let best=null,bk=Infinity;
  for(const x of S.pie.dishes){const p=x.city;if(p===c||!on.has(p)||!pieAntLeft(x)||!cs.some(id=>pieCovers(id,p)))continue;const km=pieKm(c,p);if(km<=PIE_BENT&&km<bk){bk=km;best=p;}}M.set(c,best);return best;}
// The nearest other working dish within PIE_BENT km of c, under a carrying crust over both, that is not full itself: customers
// that no longer fit at c land there, so a full c with such a neighbour loses nothing.
function pieNearRoom(c,Q){let M=Q._nearR;if(!M)Object.defineProperty(Q,'_nearR',{value:M=new Map()});if(M.has(c))return M.get(c);
  const cs=Q.hubs.filter(id=>pieCovers(id,c));let best=null,bk=Infinity;
  for(const d of Q.dish){const p=d.city;if(p===c||!(d.cap>0)||d.u>=PIE_FULL||!cs.some(id=>pieCovers(id,p)))continue;const km=pieKm(c,p);if(km<=PIE_BENT&&km<bk){bk=km;best=p;}}M.set(c,best);return best;}
// Buttons: fill a dish with antennas (from: the full dish it relieves, to say how far away it is), or build one.
function pieFixAnt(c,from){const x=S.pie.dishes.find(d=>d.city===c);if(!x||!pieAntLeft(x))return '';const v=pieAntLeft(x)*pieAntPrice(x.band),km=from&&from!==c?Math.round(pieKm(from,c)):0;
  return pieBtn(`${tr('pie_fix.ant_at',{city:pieCn(c),n:x.ant,max:PIE_ANT_MAX})}${km?` · ${km.toLocaleString()} km`:''} <small>${fmt$(v)}</small>`,'pieAntMax',{id:x.id},'ghost sm',v);}
// A dish at POP c; from: the full dish it relieves, to say how far away it is.
// short: just the city, for the tight rows of the load view (the full words in the tooltip).
const pieFixDish=(c,from,short)=>{const v=pieDishPrice(),km=from&&from!==c?Math.round(pieKm(from,c)):0;return pieBtn(`📡+ ${short?pieCn(c):tr('pie_fix.dish_at',{city:pieCn(c)})}${km?` · ${km.toLocaleString()} km`:''} <small>${fmt$(v)}</small>`,'pieDish',{city:c},'ghost sm',v,S.pie.dishes.length>=PIE_DISH_MAX?tr('pie.off_dish_max',{n:PIE_DISH_MAX}):'',short?tr('pie_fix.dish_at',{city:CITY[c].name}):'');};
// The research that would relieve full dishes with nowhere left to build: a higher band first, then lasers.
const pieFixRd=()=>{const P=S.pie,k=!P.rd.vband?'vband':!P.rd.eband?'eband':!P.rd.las?'las':null;if(!k)return '';const v=piePrice(PIE_RD[k].cost);return pieBtn(`🧪 ${k==='las'?tr('pie.rd_las_s'):tr('pie.rd_band_s',{b:PIE_BAND_N[k==='vband'?1:2]})} <small>${fmt$(v)}</small>`,'pieRd',{k},'ghost sm',v,'',tr(PIE_RD[k].n));};
const pieFixBand=c=>{const x=S.pie.dishes.find(d=>d.city===c),v=x?pieBandCost(x):0;return v?pieBtn(`⬆ ${PIE_BAND_N[pieBandMax()]} <small>${fmt$(v)}</small>`,'pieBand',{id:x.id},'ghost sm',v):'';};
// What grows full dish c: its own antennas, then a higher band, else antennas on a dish nearby and a new dish at a free POP
// nearby (customers land on the nearest dish with room), else research.
function pieFixMore(c,Q){const own=pieFixAnt(c)||pieFixBand(c);if(own)return own;const a=pieNearAnt(c,Q),p=pieNearPop(c,Q);return (a?pieFixAnt(a,c):'')+(p?pieFixDish(p,c):'')||pieFixRd();}
// Why it is full, for the hint under it.
function pieFullWhy(c,Q){const x=S.pie.dishes.find(y=>y.city===c);if(x&&pieAntLeft(x))return tr('pie_fix.dish_full_ant',{n:x.ant,max:PIE_ANT_MAX});
  const a=pieNearAnt(c,Q),p=pieNearPop(c,Q);return a?tr('pie_fix.dish_full_top',{city:pieCn(a)}):p?tr('pie_fix.dish_full_near',{city:pieCn(p)}):tr('pie_fix.dish_full_none',{km:PIE_BENT.toLocaleString()});}
const pieFixGo=c=>btn(tr('pie_fix.open_city',{city:pieCn(c)}),'pieGo',{city:c},'ghost sm');
const pieFixSee=c=>S.pie.dishes.some(x=>x.city===c)?btn(tr('pie_traffic.a_dish'),'pieDishGo',{city:c},'ghost sm'):'';
// What keeps orbit customer b short, grouped by its fix: {g group key, k kind, c city, near}.
function pieShort(b,Q){const gs=Q.gs[b.id];
  // A dish with room left did not limit it: the crusts over it ran out.
  if(gs)return sfOf(R,gs)<0.95?{g:'f:'+gs,k:'fiber',c:gs}:(Q.load[gs]||0)<PIE_FULL?{g:'s:'+gs,k:'skyfull',c:gs}:{g:'a:'+gs,k:'ant',c:gs};
  // Data stays home: they may only land in their own country, which has no dish yet. Its nearest POP takes one.
  // A dish already there (full, or out of reach) or no POP there to build one: the reasons below say it better.
  const cc=CITY[b.city].cc;if(pieSpatHome(cc)&&!S.pie.dishes.some(x=>CITY[x.city].cc===cc)){const p=Object.keys(S.pops).filter(x=>CITY[x].cc===cc).sort((x,y)=>(x===b.city?0:pieKm(b.city,x))-(y===b.city?0:pieKm(b.city,y)))[0];if(p)return {g:'home:'+cc,k:'home',c:p,cc};}
  if(!Q.hubs.some(id=>pieCovers(id,b.city)))return {g:'nocrust',k:'nocrust'};
  const p=pieNearPop(b.city,Q);return p?{g:'d:'+p,k:'dish',c:p,near:b.city}:{g:'far:'+b.city,k:'far',c:b.city};}
// The same, as a sentence for the customer's card and the unhappy toast.
function pieShortWhy(b){const Q=R&&R.pie;if(!Q||!Q.sf)return '';const w=pieShort(b,Q),c=w.c&&CITY[w.c]?CITY[w.c].name:'',km=PIE_BENT.toLocaleString();
  return w.k==='home'?tr('pie_fix.why_home',{a:pieCcN(w.cc)}):w.k==='fiber'?tr('pie_fix.why_fiber',{city:c}):w.k==='skyfull'?tr('pie_fix.why_skyfull',{city:c}):w.k==='ant'?tr('pie_fix.why_ant',{city:c})
    :w.k==='dish'?tr('pie_fix.why_dish',{city:c,km}):w.k==='far'?tr('pie_fix.why_far',{km}):tr('pie_fix.why_nocrust');}
// Worked out once per compute, cash, day and Tier 1 state: the tab badge, the overview and the list all ask for it.
let PIE_FX=null;
function pieFixes(Q){const can=pieCanBuild();if(PIE_FX&&PIE_FX.Q===Q&&PIE_FX.cash===S.cash&&PIE_FX.day===S.day&&PIE_FX.can===can)return PIE_FX.o;const o=pieFixList(Q);PIE_FX={Q,cash:S.cash,day:S.day,can,o};return o;}
function pieFixList(Q){const P=S.pie,o=[],fly=btn(tr('pie_fix.to_launch'),'pieTab',{t:'crust'},'ghost sm');
  // Starved terminal customers, grouped by what would fix them.
  const grp=new Map(),add=(k,lack,v)=>{const g=grp.get(k)||{...v,n:0,lack:0};g.n++;g.lack+=lack;grp.set(k,g);};
  for(const b of S.biz){if(!BIZ_T[b.type].orbit)continue;const s=Q.sf[b.id]||0;if(s>=0.95)continue;const w=pieShort(b,Q);add(w.g,b.bw*(1-s),w);}
  for(const g of grp.values()){const lk=fmtG(g.lack),x={k:g.k,w:1,lack:g.lack,c:g.c||g.near};
    if(g.k==='fiber')o.push({...x,ic:'🧵',t:tr('pie_fix.fiber_t',{city:pieCn(g.c)}),h:trn('pie_fix.fiber_h',g.n,{lack:lk,sf:pct(sfOf(R,g.c)),city:pieCn(g.c)}),b:pieFixGo(g.c)});
    else if(g.k==='ant')o.push({...x,ic:'📡',t:tr('pie_fix.ant_t',{city:pieCn(g.c)}),h:trn('pie_fix.ant_h',g.n,{lack:lk}),b:pieFixMore(g.c,Q)+pieFixSee(g.c)});
    else if(g.k==='skyfull')o.push({...x,ic:'🥧',t:tr('pie_fix.skyfull_t',{city:pieCn(g.c)}),h:trn('pie_fix.skyfull_h',g.n,{lack:lk,city:pieCn(g.c)}),b:fly});
    else if(g.k==='home')o.push({...x,ic:'🏠',t:tr('pie_fix.home_t',{a:pieCcN(g.cc)}),h:trn('pie_fix.home_h',g.n,{lack:lk,a:pieCcN(g.cc)}),b:pieFixDish(g.c)});
    else if(g.k==='dish')o.push({...x,c:g.near,ic:'📍',t:tr('pie_fix.dish_t',{city:pieCn(g.near)}),h:trn('pie_fix.dish_h',g.n,{lack:lk,km:PIE_BENT.toLocaleString()}),b:pieFixDish(g.c,g.near)});
    else if(g.k==='far')o.push({...x,w:0.9,ic:'🔦',t:tr('pie_fix.far_t',{city:pieCn(g.c)}),h:trn('pie_fix.far_h',g.n,{lack:lk,km:PIE_BENT.toLocaleString()}),b:S.pie.rd.las?fly:pieFixRd()||fly});
    else o.push({...x,w:0.9,ic:'🌐',t:tr('pie_fix.nocrust_t'),h:trn('pie_fix.nocrust_h',g.n,{lack:lk}),b:fly});}
  // Crusts: more pies while under full coverage, another crust once at it. A full crust loses nothing while another one
  // has room (customers land under that one), so it shows only when customers go short for want of crust; lack is what they miss.
  const skyLack=[...grp.values()].reduce((a,g)=>a+(g.k==='skyfull'?g.lack:0),0);
  for(const c of Q.crust){if(!(c.cap>0)||c.used/c.cap<PIE_FULL||!(skyLack>0)&&Q.crust.some(x=>x!==c&&x.cap>0&&x.used/x.cap<PIE_FULL))continue;const C=CRUSTS[c.id],w=c.used/c.cap;
    if(c.cov<1){const per=C.g/C.full*ROCKETS.falcon.pies;o.push({k:'crust',w,lack:skyLack,ic:'🥧',t:tr('pie_fix.crust_full',{crust:tr(C.n),p:pct(w)}),h:tr('pie_fix.crust_more',{cov:pct(c.cov),g:fmtG(per)}),b:fly});}
    else{const alt=Object.keys(CRUSTS).filter(id=>id!==c.id&&!Q.hubs.includes(id)).map(id=>tr(CRUSTS[id].n));
      o.push({k:'crust',w:w+0.05,lack:skyLack,ic:'🥧',t:tr('pie_fix.crust_full',{crust:tr(C.n),p:pct(w)}),h:alt.length?tr('pie_fix.crust_max',{cap:fmtG(c.cap),alt:alt.join(', ')}):tr('pie_fix.crust_max_all',{cap:fmtG(c.cap)}),b:fly});}}
  // Full dishes no customer group already named, unless a dish nearby with room takes what no longer fits.
  for(const d of Q.dish){if(!(d.cap>0)||d.u<PIE_FULL||grp.has('a:'+d.city)||pieNearRoom(d.city,Q))continue;
    o.push({k:'ant',c:d.city,w:d.u,lack:Math.max(0,d.used-d.cap*PIE_FULL),ic:'📡',t:tr('pie_fix.dish_full',{city:pieCn(d.city),p:pct(d.u)}),h:pieFullWhy(d.city,Q),b:pieFixMore(d.city,Q)+pieFixSee(d.city)});}
  // Full backhaul: both ends need room.
  for(const b of Q.bh||[]){if(!(b.cap>0)||b.g/b.cap<PIE_FULL)continue;o.push({k:'bh',c:b.city,w:b.g/b.cap,lack:b.g*0.1,ic:'🛰️',t:tr('pie_fix.bh_t',{city:pieCn(b.city)}),h:tr('pie_fix.bh_h',{dish:pieCn(b.land)}),b:pieFixAnt(b.city)+pieFixAnt(b.land)});}
  return o.sort((a,b)=>b.w-a.w||b.lack-a.lack);}
const pieFxRow=x=>`<div class="pie-fx"><span class="pie-fx-ic" aria-hidden="true">${x.ic}</span><div class="pie-fx-m"><b>${x.t}</b><small>${x.h}</small></div><span class="pie-fx-n">${x.lack>0?'−'+fmtG(x.lack):''}</span><div class="pie-fx-b">${x.b||''}</div></div>`;
// The whole list: dish and crust room up top, then every bottleneck, filtered by kind and sorted.
function pieFixTab(Q){const fx=pieFixes(Q),f=PIE_FKS.includes(UI.pieFk)?UI.pieFk:'',so=PIE_FSORT.includes(UI.pieFs)?UI.pieFs:'sev';
  const dc=Q.dish.reduce((a,d)=>a+d.cap,0),du=Q.dish.reduce((a,d)=>a+Math.min(d.used,d.cap),0),cc=Q.crust.reduce((a,c)=>a+c.cap,0),cu=Q.crust.reduce((a,c)=>a+c.used,0);
  let h=`<p class="meta">${tr('pie_fix.intro')}</p><div class="pie-room"><div><span>${tr('pie_fix.room_dishes')}</span><b>${tr('pie_traffic.used_of',{u:fmtG(du),cap:fmtG(dc)})}</b>${pieBar(dc?du/dc:0,pieLoadCls(dc?du/dc:0))}</div><div><span>${tr('pie_fix.room_crusts')}</span><b>${tr('pie_traffic.used_of',{u:fmtG(cu),cap:fmtG(cc)})}</b>${pieBar(cc?cu/cc:0,pieLoadCls(cc?cu/cc:0))}</div></div>`;
  const n=k=>fx.filter(x=>PIE_FK[x.k]===k).length,o=(v,l,cur)=>`<option value="${v}"${v===cur?' selected':''}>${esc(l)}</option>`;
  const KL={sky:tr('pie_fix.fk_sky'),dish:tr('pie_fix.fk_dish'),fiber:tr('pie_fix.fk_fiber'),reach:tr('pie_fix.fk_reach'),bh:tr('pie_fix.fk_bh')};
  h+=`<div class="trsel pie-gf"><label>${tr('pie.ground_show')}<select data-chg="pieFk">${o('',`${tr('dashboard.fs_all')} (${fx.length})`,f)}${PIE_FKS.map(k=>o(k,`${KL[k]} (${n(k)})`,f)).join('')}</select></label>
    <label>${tr('pie.gs_sort')}<select data-chg="pieFs">${o('sev',tr('pie_fix.fs_sev'),so)}${o('lack',tr('pie_fix.fs_lack'),so)}${o('city',tr('pie_fix.fs_city'),so)}</select></label></div>`;
  const rs=fx.filter(x=>!f||PIE_FK[x.k]===f);
  if(so==='lack')rs.sort((a,b)=>b.lack-a.lack);else if(so==='city')rs.sort((a,b)=>(a.c&&CITY[a.c]?CITY[a.c].name:'~').localeCompare(b.c&&CITY[b.c]?CITY[b.c].name:'~'));
  return h+(rs.length?`<div class="pie-fxl">${rs.map(pieFxRow).join('')}</div>`:`<p class="meta">✅ ${fx.length?tr('pie_fix.none_here'):tr('pie_fix.none')}</p>`);}
