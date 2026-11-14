/* ---------- Pie Control's Bottlenecks tab: what is full in orbit and what fixes it ----------
   Read from the last compute (R.pie), never computed here. Each bottleneck {k kind, w how full, lack Gbps, c city, ic, t, h, b
   buttons} says what is full, why it matters and offers the button that fixes it: antennas on a full dish, a dish nearby
   once it has 16, more pies or another crust for a full crust, the city panel where orbit traffic is stuck on fiber, a dish
   within reach of starved terminal customers. A greyed button says why next to it (pieBtn). */
const PIE_FULL=0.9;
// Kinds, for the filter: crusts, dishes (full or missing), fiber where orbit lands, customers out of reach, backhaul.
const PIE_FK={crust:'sky',ant:'dish',dish:'dish',fiber:'fiber',far:'reach',nocrust:'reach',bh:'bh'};
const PIE_FKS=['sky','dish','fiber','reach','bh'],PIE_FSORT=['sev','lack','city'];
// The nearest POP to city c with no dish, within PIE_BENT km, that a carrying crust over c also covers.
// Kept on this compute's R.pie (out of JSON): a full dish asks once, not on every redraw.
function pieNearPop(c,Q){let M=Q._near;if(!M)Object.defineProperty(Q,'_near',{value:M=new Map()});if(M.has(c))return M.get(c);
  const P=S.pie,cs=Q.hubs.filter(id=>pieCovers(id,c)),has=new Set(P.dishes.map(x=>x.city));let best=null,bk=Infinity;
  for(const p of Object.keys(S.pops)){if(has.has(p)||!cs.some(id=>pieCovers(id,p)))continue;const km=p===c?0:pieKm(c,p);if(km<=PIE_BENT&&km<bk){bk=km;best=p;}}M.set(c,best);return best;}
// Buttons: fill a dish with antennas, or build one.
function pieFixAnt(c){const x=S.pie.dishes.find(d=>d.city===c);if(!x||!pieAntLeft(x))return '';const v=pieAntLeft(x)*pieAntPrice(x.band);
  return pieBtn(`${tr('pie_fix.ant_at',{city:pieCn(c),n:x.ant,max:PIE_ANT_MAX})} <small>${fmt$(v)}</small>`,'pieAntMax',{id:x.id},'ghost sm',v);}
// A dish at POP c; from: the full dish it relieves, to say how far away it is.
// short: just the city, for the tight rows of the load view (the full words in the tooltip).
const pieFixDish=(c,from,short)=>{const v=pieDishPrice(),km=from&&from!==c?Math.round(pieKm(from,c)):0;return pieBtn(`📡+ ${short?pieCn(c):tr('pie_fix.dish_at',{city:pieCn(c)})}${km?` · ${km.toLocaleString()} km`:''} <small>${fmt$(v)}</small>`,'pieDish',{city:c},'ghost sm',v,S.pie.dishes.length>=PIE_DISH_MAX?tr('pie.off_dish_max',{n:PIE_DISH_MAX}):'',short?tr('pie_fix.dish_at',{city:CITY[c].name}):'');};
// The research that would relieve full dishes with nowhere left to build: a higher band first, then lasers.
const pieFixRd=()=>{const P=S.pie,k=!P.rd.vband?'vband':!P.rd.eband?'eband':!P.rd.las?'las':null;if(!k)return '';const v=piePrice(PIE_RD[k].cost);return pieBtn(`🧪 ${k==='las'?tr('pie.rd_las_s'):tr('pie.rd_band_s',{b:PIE_BAND_N[k==='vband'?1:2]})} <small>${fmt$(v)}</small>`,'pieRd',{k},'ghost sm',v,'',tr(PIE_RD[k].n));};
const pieFixBand=c=>{const x=S.pie.dishes.find(d=>d.city===c),v=x?pieBandCost(x):0;return v?pieBtn(`⬆ ${PIE_BAND_N[pieBandMax()]} <small>${fmt$(v)}</small>`,'pieBand',{id:x.id},'ghost sm',v):'';};
const pieFixGo=c=>btn(tr('pie_fix.open_city',{city:pieCn(c)}),'pieGo',{city:c},'ghost sm');
const pieFixSee=c=>S.pie.dishes.some(x=>x.city===c)?btn(tr('pie_traffic.a_dish'),'pieDishGo',{city:c},'ghost sm'):'';
// Worked out once per compute, cash, day and Tier 1 state: the tab badge, the overview and the list all ask for it.
let PIE_FX=null;
function pieFixes(Q){const can=pieCanBuild();if(PIE_FX&&PIE_FX.Q===Q&&PIE_FX.cash===S.cash&&PIE_FX.day===S.day&&PIE_FX.can===can)return PIE_FX.o;const o=pieFixList(Q);PIE_FX={Q,cash:S.cash,day:S.day,can,o};return o;}
function pieFixList(Q){const P=S.pie,o=[],fly=btn(tr('pie_fix.to_launch'),'pieTab',{t:'crust'},'ghost sm');
  // Crusts: more pies while under full coverage, another crust once at it.
  for(const c of Q.crust){if(!(c.cap>0)||c.used/c.cap<PIE_FULL)continue;const C=CRUSTS[c.id],w=c.used/c.cap;
    if(c.cov<1){const per=C.g/C.full*ROCKETS.falcon.pies;o.push({k:'crust',w,lack:per,ic:'🥧',t:tr('pie_fix.crust_full',{crust:tr(C.n),p:pct(w)}),h:tr('pie_fix.crust_more',{cov:pct(c.cov),g:fmtG(per)}),b:fly});}
    else{const alt=Object.keys(CRUSTS).filter(id=>id!==c.id&&!Q.hubs.includes(id)).map(id=>tr(CRUSTS[id].n));
      o.push({k:'crust',w:w+0.05,lack:C.g,ic:'🥧',t:tr('pie_fix.crust_full',{crust:tr(C.n),p:pct(w)}),h:alt.length?tr('pie_fix.crust_max',{cap:fmtG(c.cap),alt:alt.join(', ')}):tr('pie_fix.crust_max_all',{cap:fmtG(c.cap)}),b:fly});}}
  // Starved terminal customers, grouped by what would fix them.
  const grp=new Map(),add=(k,lack,v)=>{const g=grp.get(k)||{...v,n:0,lack:0};g.n++;g.lack+=lack;grp.set(k,g);};
  for(const b of S.biz){if(!BIZ_T[b.type].orbit)continue;const s=Q.sf[b.id]||0;if(s>=0.95)continue;const lack=b.bw*(1-s),gs=Q.gs[b.id];
    if(gs){if(sfOf(R,gs)<0.95)add('f:'+gs,lack,{k:'fiber',c:gs});else add('a:'+gs,lack,{k:'ant',c:gs});continue;}
    if(!Q.hubs.some(id=>pieCovers(id,b.city))){add('nocrust',lack,{k:'nocrust'});continue;}
    const p=pieNearPop(b.city,Q);if(p)add('d:'+p,lack,{k:'dish',c:p,near:b.city});else add('far:'+b.city,lack,{k:'far',c:b.city});}
  for(const g of grp.values()){const lk=fmtG(g.lack),x={k:g.k,w:1,lack:g.lack,c:g.c||g.near};
    if(g.k==='fiber')o.push({...x,ic:'🧵',t:tr('pie_fix.fiber_t',{city:pieCn(g.c)}),h:trn('pie_fix.fiber_h',g.n,{lack:lk,sf:pct(sfOf(R,g.c)),city:pieCn(g.c)}),b:pieFixGo(g.c)});
    else if(g.k==='ant'){const d=P.dishes.find(y=>y.city===g.c),near=d&&!pieAntLeft(d)?pieNearPop(g.c,Q):null;
      o.push({...x,ic:'📡',t:tr('pie_fix.ant_t',{city:pieCn(g.c)}),h:trn('pie_fix.ant_h',g.n,{lack:lk}),b:(pieFixAnt(g.c)||pieFixBand(g.c)||(near?pieFixDish(near,g.c):pieFixRd()))+pieFixSee(g.c)});}
    else if(g.k==='dish')o.push({...x,c:g.near,ic:'📍',t:tr('pie_fix.dish_t',{city:pieCn(g.near)}),h:trn('pie_fix.dish_h',g.n,{lack:lk,km:PIE_BENT.toLocaleString()}),b:pieFixDish(g.c,g.near)});
    else if(g.k==='far')o.push({...x,w:0.9,ic:'🔦',t:tr('pie_fix.far_t',{city:pieCn(g.c)}),h:trn('pie_fix.far_h',g.n,{lack:lk,km:PIE_BENT.toLocaleString()}),b:S.pie.rd.las?fly:pieFixRd()||fly});
    else o.push({...x,w:0.9,ic:'🌐',t:tr('pie_fix.nocrust_t'),h:trn('pie_fix.nocrust_h',g.n,{lack:lk}),b:fly});}
  // Full dishes no customer group already named.
  for(const d of Q.dish){if(!(d.cap>0)||d.u<PIE_FULL||grp.has('a:'+d.city))continue;const x=P.dishes.find(y=>y.city===d.city),near=x&&!pieAntLeft(x)?pieNearPop(d.city,Q):null;
    o.push({k:'ant',c:d.city,w:d.u,lack:Math.max(0,d.used-d.cap*PIE_FULL),ic:'📡',t:tr('pie_fix.dish_full',{city:pieCn(d.city),p:pct(d.u)}),h:x&&pieAntLeft(x)?tr('pie_fix.dish_full_ant',{n:x.ant,max:PIE_ANT_MAX}):near?tr('pie_fix.dish_full_near',{city:pieCn(near)}):tr('pie_fix.dish_full_none',{km:PIE_BENT.toLocaleString()}),b:(pieFixAnt(d.city)||pieFixBand(d.city)||(near?pieFixDish(near,d.city):pieFixRd()))+pieFixSee(d.city)});}
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
