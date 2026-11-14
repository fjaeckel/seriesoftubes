/* Pie Control's traffic, spread over the tabs that own it (overview, crusts, dishes): what rides your satellites, how much, for whom, and why a sky or a dish is idle. Read from
   the last compute (R.pie: flows, crust, dish from 35-pie-paths.js); the fiber comparison is worked out only here
   (pieFiberMs, once per compute). The highlighted row (UI.pieHi) is display only and never saved. */
const PIE_ROWS=60;
const pieIcon=t=>({pizza:'🏡',flywifi:'✈️',boat:'🚢',marsorb:'🔴',mars:'🔴',hft:'📈',bh:'🛰️'})[t]||'🔗';
const pieCn=c=>c&&CITY[c]?esc(CITY[c].name):'?';
const pieMs=v=>v<10?v.toFixed(1):String(Math.round(v));
// Bar colour by use: green, amber from 60%, red from 90% (the globe's rings and the map badge use the same steps).
const pieLoadCls=u=>u>=0.9?'bad':u>=0.6?'warn':'';
const pieBar=(u,cls)=>`<div class="bar ${cls}"><i style="width:${Math.round(clamp(u,0,1)*100)}%"></i></div>`;
function pieDishWhy(d){const cc=CITY[d.city].cc,l=S.pie.lic[cc];return {nopop:tr('pie_traffic.d_nopop'),down:tr('pie_traffic.d_down'),lic:tr('pie_traffic.d_lic',{country:esc(pieLicCountry(cc))}),
  ref:tr('pie_traffic.d_ref'),backhaul:tr('pie_traffic.d_backhaul'),spat:tr('pie_traffic.d_spat',{d:l?dateStr(l.until):''}),nocrust:tr('pie_traffic.d_nocrust'),isl:tr('pie_traffic.d_isl'),rain:tr('pie_traffic.d_rain'),
  jam:tr('pie_traffic.d_jam'),nolas:tr('pie_traffic.d_nolas'),idle:tr('pie_traffic.d_idle')}[d.st]||'';}
function pieCrustWhy(c){return c.st==='half'?tr('pie_traffic.crust_half',{crust:tr(CRUSTS[c.id].n),p:pct(c.cov),min:pct(PIE_RAW)}):c.st==='part'?tr('pie_traffic.crust_part',{crust:tr(CRUSTS[c.id].n),p:pct(c.cov),c:pct(pieCarry(c.id)),min:pct(PIE_BAKED)}):c.st==='safe'?tr('pie_traffic.crust_safe'):c.st==='down'?tr('pie_traffic.crust_down'):'';}
// Why a cut-off POP gets no backhaul (R.pie.bh[].why from pieBhLand).
function pieBhWhy(w){return {nocrust:tr('pie_traffic.bh_nocrust'),noland:tr('pie_traffic.bh_noland'),nolas:tr('pie_traffic.bh_nolas',{km:PIE_BENT.toLocaleString()}),spat:tr('pie_traffic.bh_spat'),full:tr('pie_traffic.bh_full_none')}[w]||tr('pie_traffic.bh_noland');}
// The empty sky: every condition traffic needs, ticked or not, with a hint for the first thing to fix.
function pieChecks(Q){const P=S.pie,cr=Q.crust,best=cr.slice().sort((a,b)=>b.cov-a.cov)[0],ds=Q.dish,isl=ds.find(d=>d.st==='isl'),bh=Q.bh||[],no=bh.find(b=>!(b.cap>0));
  const sold=S.biz.some(b=>BIZ_T[b.type].orbit||(BIZ_T[b.type].lat&&b.route==='fast'&&b.city2&&pieKm(b.city,b.city2)>=PIE_MIN_KM));
  return [
    {k:'baked',ok:Q.hubs.length>0,l:tr('pie_traffic.ck_baked',{min:pct(PIE_RAW)}),h:!best?tr('pie_traffic.ck_baked_none'):pieCrustWhy(best)||tr('pie_traffic.ck_baked_none')},
    {k:'dish',ok:ds.some(d=>d.cap>0),l:tr('pie_traffic.ck_dish'),h:P.dishes.length?tr('pie_traffic.ck_dish_lic'):tr('pie_traffic.ck_dish_none')},
    {k:'backbone',ok:ds.some(d=>d.cap>0&&!Q.isl.includes(d.city)),l:tr('pie_traffic.ck_backbone'),h:Q.isl.length?tr('pie_traffic.ck_backbone_bh',{city:pieCn(isl?isl.city:Q.isl[0])}):tr('pie_traffic.ck_backbone_none')},
    ...(Q.isl.length?[{k:'backhaul',ok:bh.some(b=>b.cap>0)&&!no,l:tr('pie_traffic.ck_backhaul'),h:no?tr('pie_traffic.ck_backhaul_h',{city:pieCn(no.city),why:pieBhWhy(no.why)}):''}]:[]),
    {k:'lasers',ok:cr.some(c=>c.las),l:tr('pie_traffic.ck_lasers'),h:tr('pie_traffic.ck_lasers_h')},
    {k:'customers',ok:sold,l:tr('pie_traffic.ck_customers'),h:tr('pie_traffic.ck_customers_h',{km:PIE_MIN_KM.toLocaleString()})}];}
function pieFlowRow(f,B){const b=B.get(f.id),hi=UI.pieHi===f.id,nm=b?esc(b.name):'?';let route,ms='';
  if(f.k==='t')route=f.dish?(f.dish===f.city?tr('pie_traffic.lands_here',{city:pieCn(f.city)}):tr('pie_traffic.lands_at',{city:pieCn(f.city),dish:pieCn(f.dish)})):tr('pie_traffic.no_landing',{city:pieCn(f.city)});
  else{route=tr('pie_traffic.route_ab',{a:pieCn(f.a),b:pieCn(f.b)})+(f.via.length>1?' · '+tr('pie_traffic.via_dishes',{up:pieCn(f.via[0]),down:pieCn(f.via[f.via.length-1])}):'');
    if(f.ms!=null){const fm=pieFiberMs(f);ms=isFinite(fm)?tr('pie_traffic.orbit_vs_fiber',{o:pieMs(f.ms),f:pieMs(fm)}):tr('pie_traffic.orbit_no_fiber',{o:pieMs(f.ms)});}}
  return `<button class="pft-row${hi?' on':''}" data-act="pieHi" data-args="${esc(JSON.stringify({id:f.id}))}" data-fid="${esc(f.id)}" aria-pressed="${hi}">
    <span class="pft-ic" aria-hidden="true">${pieIcon(f.type)}</span><span class="pft-m"><b>${nm}</b><small>${route}</small>${ms?`<small>${ms}</small>`:''}</span>
    <span class="pft-n"><b>${fmtG(f.g)}</b><small>${tr('common.price_mo',{price:fmt$(f.rev)})}</small></span></button>`;}
// A cut-off POP's backhaul: how full the pipe is, where it lands and what orbit adds, or why it has none. Tap: the globe shows it.
function pieBhRow(b){const id='bh:'+b.city,hi=UI.pieHi===id;
  if(!(b.cap>0))return `<div class="pft-d"><div class="kv"><span>🛰️ ${tr('pie_traffic.bh_for',{city:pieCn(b.city)})}</span><b>–</b></div><p class="meta"><span class="pft-st">${pieBhWhy(b.why)}</span></p></div>`;
  const u=b.g/b.cap;
  return `<div class="pft-d"><button class="pft-row${hi?' on':''}" data-act="pieHi" data-args="${esc(JSON.stringify({id}))}" data-fid="${esc(id)}" aria-pressed="${hi}">
    <span class="pft-ic" aria-hidden="true">🛰️</span><span class="pft-m"><b>${tr('pie_traffic.bh_for',{city:pieCn(b.city)})}</b><small>${tr('pie_traffic.bh_line',{g:fmtG(b.g),cap:fmtG(b.cap),dish:pieCn(b.land),ms:pieMs(b.ms)})}</small></span>
    <span class="pft-n"><b>${pct(u)}</b></span></button>${pieBar(u,pieLoadCls(u))}${u>=0.9?`<p class="meta"><span class="pft-st">${tr('pie_traffic.bh_full',{city:pieCn(b.city)})}</span></p>`:''}<div class="ops-p">${pieFixAnt(b.city)}${pieFixAnt(b.land)}</div></div>`;}
// What flies right now, for the overview: the headline, patchy-sky money, and the checklist while nothing flies.
function pieSkyHead(Q){if(!Q||!Q.flows)return `<p class="meta">${tr('pie_traffic.no_data')}</p>`;
  const bh=Q.bh||[],bg=bh.reduce((a,b)=>a+b.g,0),fl=Q.flows.filter(f=>f.k!=='b'&&(f.g>0||f.k==='t')),g=fl.reduce((a,f)=>a+f.g,0),n=fl.filter(f=>f.g>0).length;
  let h=`<p class="pft-head">${trn('pie_traffic.headline',n,{g:fmtG(g),of:fmtG(pieMarket()),amt:fmt$(Q.rev)})}</p>`;
  // Patchy-sky customers (99-pie-patchy.js): money, no traffic, so a line of its own.
  if(Q.patchy&&Q.patchy.mo>0)h+=`<div class="ops-o pft-patchy"><div class="kv"><span>📶 ${tr('pie_traffic.patchy')}</span><b>${tr('common.price_mo',{price:fmt$(Q.patchy.mo)})}</b></div>
    <p class="meta">${esc(PIE_PATCHY_NAMES.slice(0,piePatchyN(Q.patchy.mo)).join(' · '))}</p><p class="meta">${tr('pie_traffic.patchy_hint',{lo:pct(PIE_PATCHY_LO),min:pct(PIE_RAW),max:pct(PIE_BAKED)})}</p></div>`;
  if(!(g>0)&&!(bg>0))h+=`<div class="ops-o pft-why"><div class="nm">${tr('pie_traffic.empty_title')}</div><ul class="pft-ck">${pieChecks(Q).map(c=>`<li class="${c.ok?'on':'off'}" data-k="${c.k}"><span aria-hidden="true">${c.ok?'✅':'⬜'}</span><span><b>${c.l}</b>${c.ok?'':`<small>${c.h}</small>`}</span></li>`).join('')}</ul></div>`;
  return h;}
// A crust's traffic for its card in the Crusts tab: used against what it carries now, or why it carries nothing.
function pieCrustLoad(id,Q){const c=Q&&Q.crust?Q.crust.find(x=>x.id===id):null;if(!c)return '';const why=pieCrustWhy(c);
  return c.cap>0?`<div class="pie-cl"><span>${tr('pie_traffic.used_of',{u:fmtG(c.used),cap:fmtG(c.cap)})}</span>${pieBar(c.used/c.cap,pieLoadCls(c.used/c.cap))}</div>${why?`<p class="meta">${why}</p>`:''}`:why?`<p class="meta">${why}</p>`:'';}
// The Dishes tab's load view: every dish by load, then the cut-off POPs' backhaul. A row leads to the dish in its country.
function pieLoadHtml(Q){if(!Q||!Q.flows)return `<p class="meta">${tr('pie_traffic.no_data')}</p>`;const bh=Q.bh||[];
  let h=`<p class="meta pie-how">${tr('pie_traffic.how',{g:PIE_ANT_G,n:PIE_ANT_MAX,max:fmtG(PIE_ANT_MAX*PIE_ANT_G)})}</p>`;
  const so=PIE_DS.includes(UI.pieDs)?UI.pieDs:'u',ds=Q.dish.slice().sort(so==='name'?(a,b)=>CITY[a.city].name.localeCompare(CITY[b.city].name):so==='off'?(a,b)=>(a.st==='ok'||a.st==='idle')-(b.st==='ok'||b.st==='idle')||b.u-a.u:(a,b)=>b.u-a.u||b.used-a.used),o=(v,l)=>`<option value="${v}"${v===so?' selected':''}>${esc(l)}</option>`;
  if(ds.length)h+=`<div class="trsel pie-gf"><label>${tr('pie.gs_sort')}<select data-chg="pieDs">${o('u',tr('pie_traffic.ds_u'))}${o('off',tr('pie_traffic.ds_off'))}${o('name',tr('pie_traffic.ds_name'))}</select></label></div><div class="pie-drs">`
    +ds.slice(0,UI.pieDAll?ds.length:PIE_ROWS).map(d=>{const why=d.st==='ok'?'':pieDishWhy(d),x=S.pie.dishes.find(y=>y.city===d.city);
      const det=d.bh>0?tr('pie_traffic.dish_line_bh',{t:fmtG(d.term),b:fmtG(d.bh),x:fmtG(d.transit),cap:fmtG(d.cap)}):tr('pie_traffic.dish_line',{t:fmtG(d.term),x:fmtG(d.transit),cap:fmtG(d.cap)});
      return `<div class="pie-dr"><span class="nm"><b>${pieCn(d.city)}</b>${x?` <small>${x.ant}×${pieAntG(x)}G</small>`:''}</span><span class="ld">${pieBar(d.u,pieLoadCls(d.u))}<b>${d.cap>0?pct(d.u):'–'}</b></span>
        <span class="mt" title="${esc(det+(why?' · '+why.replace(/<[^>]+>/g,''):''))}">${fmtG(d.used)}${why?` · <span class="${d.st==='backhaul'?'':'pft-st'}">${why}</span>`:''}</span><span class="ac">${d.cap>0&&d.u>=PIE_FULL?pieGrow(d.city,Q):''}${pieDishActs(d)}</span></div>`;}).join('')+`</div>`
    +(ds.length>PIE_ROWS?`<div class="btns">${btn(UI.pieDAll?tr('pie.pad_less'):trn('pie.pad_more',ds.length-PIE_ROWS),'pieDAll',{},'ghost sm')}</div>`:'');
  else h+=`<p class="meta">${tr('pie.ground_none')}</p>`;
  if(bh.length)h+=`<h3 class="pft-h">${tr('pie_traffic.backhaul')}</h3><p class="meta">${tr('pie_traffic.bh_hint')}</p>`+bh.slice().sort((a,b)=>b.g-a.g).map(pieBhRow).join('');
  return h;}
// What a dish row offers: look at it on the globe, fill its antennas, fix what keeps it idle, open its city.
const PIE_DS=['u','off','name'];
// What grows a full dish: its antennas up to 16, then a higher band, else a dish at the nearest free POP under the same sky
// (with how far it is), else the research that would help: a higher band, or lasers to land customers further away.
function pieGrow(c,Q){const x=S.pie.dishes.find(y=>y.city===c);if(x&&pieAntLeft(x)){const v=pieAntLeft(x)*pieAntPrice(x.band);return pieBtn(`↑16 📡 <small>${fmt$(v)}</small>`,'pieAntMax',{id:x.id},'ghost sm',v);}
  if(x){const v=pieBandCost(x);if(v)return pieBtn(`⬆ ${PIE_BAND_N[pieBandMax()]} <small>${fmt$(v)}</small>`,'pieBand',{id:x.id},'ghost sm',v);}
  const p=pieNearPop(c,Q);return p?pieFixDish(p,c,true):pieFixRd()||`<small class="pft-st">${tr('pie_fix.grow_none')}</small>`;}
// One way out of a dish row: the dish in the Dishes tab, with the globe on it; the fixes live there.
const pieDishActs=d=>btn(tr('pie_traffic.a_dish'),'pieDishGo',{city:d.city},'ghost sm');
// The Customers tab: everyone riding orbit, terminals and sky circuits, filtered and sorted; a tap turns the globe to it.
const PIE_CK=['t','c'],PIE_CS=['g','rev','name'];
function pieCustHtml(){const Q=R&&R.pie;if(!Q||!Q.flows)return `<p class="meta">${tr('pie_traffic.no_data')}</p>`;const B=new Map(S.biz.map(b=>[b.id,b]));
  const k=PIE_CK.includes(UI.pieCk)?UI.pieCk:'',so=PIE_CS.includes(UI.pieCs)?UI.pieCs:'g',all=Q.flows.filter(f=>f.k!=='b'&&(f.g>0||f.k==='t')),o=(v,l,cur)=>`<option value="${v}"${v===cur?' selected':''}>${esc(l)}</option>`;
  const nm=f=>{const b=B.get(f.id);return b?b.name:'';},fl=all.filter(f=>!k||f.k===k).sort(so==='rev'?(a,b)=>b.rev-a.rev:so==='name'?(a,b)=>nm(a).localeCompare(nm(b)):(a,b)=>b.g-a.g);
  const n=x=>all.filter(f=>f.k===x).length;
  let h=`<p class="pft-head">${trn('pie_traffic.headline',all.filter(f=>f.g>0).length,{g:fmtG(all.reduce((a,f)=>a+f.g,0)),of:fmtG(pieMarket()),amt:fmt$(Q.rev)})}</p><p class="meta">${tr('pie_cust.intro')}</p>`;
  h+=`<div class="trsel pie-gf"><label>${tr('pie.ground_show')}<select data-chg="pieCk">${o('',`${tr('dashboard.fs_all')} (${all.length})`,k)}${o('t',`${tr('pie_cust.k_t')} (${n('t')})`,k)}${o('c',`${tr('pie_cust.k_c')} (${n('c')})`,k)}</select></label>
    <label>${tr('pie.gs_sort')}<select data-chg="pieCs">${o('g',tr('pie_cust.s_g'),so)}${o('rev',tr('pie_cust.s_rev'),so)}${o('name',tr('pie_cust.s_name'),so)}</select></label></div>`;
  if(!fl.length)return h+`<p class="meta">${tr('pie_cust.none')}</p>`;
  h+=`<div class="pft-list">${fl.slice(0,PIE_ROWS).map(f=>pieFlowRow(f,B)).join('')}</div>`;
  if(fl.length>PIE_ROWS)h+=`<p class="meta">${trn('pie_traffic.n_more',fl.length-PIE_ROWS)}</p>`;
  return h;}
// Tapping a row: mark it in place and point the globe at it, without rebuilding the panel (the scroll stays where it is).
function pieHiSet(id){UI.pieHi=UI.pieHi===id?null:id;
  {const Q=R&&R.pie,f=UI.pieHi&&Q&&Q.flows?Q.flows.find(x=>x.id===UI.pieHi):null;if(f&&PG.cv)pieGlobeLook(f.k==='c'?[f.a,f.b,...f.via]:[f.city,f.dish].filter(Boolean));else if(!UI.pieHi&&PG.cv)PG.goal={yaw:PG.yaw,tilt:PG.tilt,z:1};}
  for(const r of document.querySelectorAll('#modal .pft-row')){const on=r.dataset.fid===UI.pieHi;r.classList.toggle('on',on);r.setAttribute('aria-pressed',String(on));}
  if(PG.cv){PG.dAt=-1e9;PG.dirty=true;}}
