/* ---------- The Hyperscaler's zones and cages in the interface (38-hyper-zones.js) ----------
   Parts the charter card and the Cloud tab take (55-hyper-panel.js): a stat line for zones and cages, an alert while a
   zone is out (worth knowing, not a fire: the region serves on), and one Cloud tab section that is, by city, the
   region's zones (with the lesson and the button for another), the cage the region lives in (its provider, lease and
   power, and the move to your own Server Barn), or a cage to lease where you have a POP in a region metro and no region. */
function hsAzStat(){const H=S.hs;if(!H)return '';let h='';
  const zs=Object.keys(H.az||{}).filter(c=>hsAzOk(c)&&hsAzL(c).length).sort();
  if(zs.length)h+=`<div class="meta">🧱 ${tr('hyper_az.card_zones',{list:zs.map(c=>`${esc(CITY[c].name)} ${hsAzL(c).length+1}`).join(', ')})}</div>`;
  for(const c of Object.keys(H.rg).filter(hsIsCage).sort())h+=`<div class="meta">🔐 ${tr('hyper_colo.card_cage',{city:esc(CITY[c].name),prov:tr(hsColoP(c)),mo:fmt$(HS_T[HS_CAGE].mo+hsColoPw(c))})}</div>`;
  return h;}
function hsAzAlerts(){const H=S.hs,out=[];if(!H||!hyper()||!S.inc.length)return out;
  for(const c of Object.keys(H.rg).sort()){const i=hsAzDown(c);if(i)out.push({lv:3,h:`🧱 ${tr('hyper_az.card_out',{city:esc(CITY[c].name),date:dateStr(i.until),p:pct(hsAzLossF(c))})}`});}
  return out;}
// The Cloud tab's section for city c (or null).
function hsAzSpec(c){if(!hyper()||!S.hs)return null;const H=S.hs,d=H.rg[c];
  if(d&&d.t===HS_CAGE)return hsColoSpec(c);
  if(!d)return S.pops[c]&&hsSite(c)?{t:'🔐 '+tr('hyper_colo.lease_title'),sum:tr(hsColoP(c)),flags:[],body:()=>hsColoOffer(c)}:null;
  const L=hsAzL(c),fl=[];if(hsAzDown(c))fl.push(hsFlag('selective',tr('hyper_az.f_zone')));
  return {t:'🧱 '+tr('hyper_az.title'),sum:trn('hyper_az.sum_buildings',L.length+1),flags:fl,body:()=>hsAzBody(c)};}
function hsAzBody(c){const L=hsAzL(c),T=hsAzT(c),dn=hsAzDown(c),w=hsAzWhy(c),cost=hsAzCost(c),o=(S.hs.azo&&S.hs.azo[c])|0;
  let h=`<p class="lead">${tr('hyper_az.lead')}</p><p class="note"><b>${tr('hyper_az.lesson')}</b></p>`+hsKv(tr('hyper_az.zone_a'),tr('hyper_az.first'));
  L.forEach((z,i)=>{h+=hsKv(hsAzName(c,i),z.r>S.day?tr('hyper_az.ready_on',{date:dateStr(z.r)}):tr('hyper_az.up',{g:fmtG(T.g*HS_AZ_G)}));});
  if(dn)h+=`<p class="why">⚠️ ${tr('hyper_az.out_here',{date:dateStr(dn.until),p:pct(hsAzLossF(c))})}</p>`;
  if(o)h+=`<p class="meta">${trn('hyper_az.outages',o)}</p>`;
  if(L.length<2){h+=`<p class="meta">${tr('hyper_az.terms',{g:fmtG(T.g*HS_AZ_G),slots:Math.ceil(T.slots*HS_AZ_G),mw:+hsAzMw1(c).toFixed(1),mo:fmt$(hsAzMo(c)),n:leadDays(hsAzDays(c))})}</p>`
    +hsBtns(btn(tr('hyper_az.add_cost',{cost:fmt$(cost)}),'hsZone',{city:c},'sm',!!w||S.cash<cost));if(w)h+=`<p class="why">${w}</p>`;}
  return h+`<p class="note">${tr('hyper_az.not_for')}</p>`;}
// The cage a region lives in.
function hsColoSpec(c){const d=S.hs.rg[c],x=R.hs&&R.hs.rg[c],fl=[];if(d.ready<=S.day&&!d.up&&x&&x.load>=x.g*0.95)fl.push(hsFlag('selective',tr('hyper_ui.f_full')));
  return {t:'🔐 '+tr('hyper_colo.title'),sum:`${tr(hsColoP(c))} · ${tr('common.price_mo',{price:fmt$(HS_T[HS_CAGE].mo)})}`,flags:fl,body:()=>hsColoBody(c)};}
function hsColoBody(c){const d=S.hs.rg[c],T=HS_T[HS_CAGE],N=HS_T[1],w=hsColoOutWhy(c);
  let h=`<p class="lead">${tr('hyper_colo.cage_lead',{prov:tr(hsColoP(c))})}</p>`+hsKv(tr('hyper_colo.lease'),tr('common.price_mo',{price:fmt$(T.mo)}));
  if(d.ready<=S.day)h+=hsKv(tr('hyper_colo.power_bill'),tr('common.price_mo',{price:fmt$(hsColoPw(c))}));
  h+=`<p class="note">${tr('hyper_colo.no_grow_note')}</p>`;
  if(d.up)return h+`<p class="meta">🏗️ ${tr('hyper_colo.moving_meta',{name:tr(HS_T[d.up.t].n),date:dateStr(d.up.ready)})}</p>`;
  h+=`<p class="meta">${tr('hyper_colo.move_terms',{name:tr(N.n),g:fmtG(N.g),mw:N.mw,n:leadDays(N.days)})}</p>`+hsBtns(btn(tr('hyper_colo.move_cost',{cost:fmt$(hsCost(1))}),'hsColoOut',{city:c},'pink sm',!!w||S.cash<hsCost(1)));
  if(w&&d.ready<=S.day)h+=`<p class="why">${w}</p>`;return h;}
// A cage to lease here.
function hsColoOffer(c){const T=HS_T[HS_CAGE],w=hsColoWhy(c);
  return `<p class="lead">${tr('hyper_colo.offer_lead',{prov:tr(hsColoP(c))})}</p><p class="meta">${tr('hyper_colo.terms',{g:fmtG(T.g),slots:T.slots,mo:fmt$(T.mo),p:Math.round((HS_COLO_MARK-1)*100),n:leadDays(T.days)})}</p>`
    +(w?'':hsOverNote())+hsBtns(btn(hsOverLbl(c,tr('hyper_colo.lease_cost',{cost:fmt$(T.cost)})),'hsColo',{city:c},UI.confirm==='hsnew'+c?'sm red':'sm',!!w||S.cash<T.cost))+(w?`<p class="why">${w}</p>`:'');}
