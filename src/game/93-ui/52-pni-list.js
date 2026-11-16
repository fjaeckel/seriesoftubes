/* ---------- The PNI list of a POP (#175, #172) ----------
   Every network here answers three questions: how you reach it today (one chip), whether a PNI here is worth it
   (a value line from live routing) and whether you can get one (the order buttons, policy and lead time). Sorted by
   monthly value and filtered. The PNIs you have lead the list; the networks you could ask follow, grouped by type, and a
   group with nothing to do stays folded. An open group shows a first page (48-panel-folds.js). */
const PNI_GRP=['t1','t2','eye','cdn','paid'],pniGrpOf=n=>n.pol==='paid'?'paid':n.type;
const pniGrpL=k=>k==='paid'?tr('ops.p_paid'):TYPE_L[k];
function pniValLine(n,c,v){
  if(v.g<1)return `<div class="meta pval">${tr('pni_list.little_to_gain_here',{g:fmtG(v.want)})}</div>`;
  const via=[v.t>=0.05?tr('pni_list.via_transit',{g:fmtG(v.t)}):'',v.ix>=0.05?tr('pni_list.via_ix',{g:fmtG(v.ix)}):'',v.p>=0.05?tr('pni_list.via_haul',{g:fmtG(v.p)}):'',v.u>=0.05?tr('pni_list.via_drop',{g:fmtG(v.u)}):''].filter(Boolean).join(' · ');
  const val=(v.val>0?'+':'')+tr('common.price_mo',{price:fmt$(Math.round(v.val))});
  return `<div class="meta pval" title="${esc(tr('pni_list.saves_minus_cost',{saved:fmt$(Math.round(v.saved)),cost:fmt$(Math.round(v.cost))}))}">${tr('pni_list.n_here',{g:fmtG(v.want)})}: ${via} → ${tr('pni_list.with_port',{port:PORT[v.tier].n,val})}</div>`;}
// fold: a POP with many PNIs shows each one as its load, with its controls behind "Change".
function pniRow(c,n,pn,v,chk,fold){const shut=fold&&pn&&pniOn(pn)&&!pnOpen('p:'+pn.id);
  if(shut)return `<div class="row prow crow">${logo(n)}<div class="grow"><div class="nm">${esc(n.name)} <small>${(pn.n||1)>1?pn.n+'×':''}${pniPN(pn)}</small></div>${pnUse(R.usePni[pn.id]||0,lagCap(pniG(pn),pn.n))}${pn.up?`<div class="meta">${tr('city_panel.augment_on_order_port_about_n',{port:(pn.up.n>1?pn.up.n+'×':'')+(pn.up.g1?'1G':PORT[pn.up.tier].n),n:Math.max(0,pn.up.ready-S.day)})}</div>`:''}</div>${pnChg('p:'+pn.id,false,n.name)}</div>`;
  let h=`<div class="row prow">${logo(n)}<div class="grow"><div class="nm">${esc(n.name)} <span class="tag ${n.pol}">${n.pol}</span>${v&&v.worth?` <span class="tag worth">⭐ ${tr('pni_list.worth_it')}</span>`:''}</div><div class="pchips">${pniChip(n.id,c)}</div>${v?pniValLine(n,c,v):''}`;
  if(pn&&!pniOn(pn))h+=pniWait(pn,c);
  else if(pn){const u=R.usePni[pn.id]||0,cap=lagCap(pniG(pn),pn.n);h+=`<div class="kv"><span>${(pn.n||1)>1?`${pn.n}×${pniPN(pn)} LAG`:pniPN(pn)} PNI</span><b>${fmtG(u)}</b></div>${pn.up?`<div class="meta">${tr('city_panel.augment_on_order_port_about_n',{port:(pn.up.n>1?pn.up.n+'×':'')+(pn.up.g1?'1G':PORT[pn.up.tier].n),n:Math.max(0,pn.up.ready-S.day)})} ${btn(tr('common.chase_it'),'pniChase',{id:pn.id},'ghost sm')}</div>`:''}<div class="bar ${barCls(u/cap)}"><i style="width:${u/cap*100}%"></i></div>${shut?'':prefCtl('p',pn.id,pn.pref)}${shut?'':siteCtl('p',pn.id,c,pn.up&&pn.up.site==='ab'?'ab':pn.site)}${shut?'':(pn.n||1)>=pniLagMax(c)&&(pn.n||1)<PNI_LAG_MAX&&!pn.up?`<div class="meta">${tr('pni_list.lag_full_add_a_router',{n:pn.n||1,more:PNI_LAG_RT,max:PNI_LAG_MAX})}</div>`:''}${shut?'':`<div class="btns">${PORT.map((P2,i)=>!pn.up&&!msfNope(n.id,c)&&(i>pn.tier||(pn.g1&&i===0))?btn((a=>(pn.n||1)>1?tr('common.upgrade_all_to_port_cost_mo',a):tr('common.upgrade_port_cost_mo_mo',a))({port:P2.n,cost:fmt$((1500+P2.setup/2)*(pn.n||1)),mo:fmt$(P2.pni*(pn.n||1))}),'pni',{city:c,net:n.id,tier:i},'sm',!portOk(c,i)||S.cash<(1500+P2.setup/2)*(pn.n||1)):'').join('')}${!pn.up&&!pn.g1&&pn.tier>pniMin(n.id)&&!msfNope(n.id,c)?btn(tr('link_panels.downgrade_port_price',{port:PORT[pn.tier-1].n,price:portMo(PORT[pn.tier-1].pni*(pn.n||1))}),'downP',{id:pn.id},'ghost sm'):''}${(pn.n||1)<pniLagMax(c)&&!pn.up&&!msfNope(n.id,c)?btn(tr('common.lag_member_cost_mo_mo',{cost:fmt$(1500+PORT[pn.tier].setup/2),mo:fmt$(PORT[pn.tier].pni)}),'lagP',{id:pn.id,d:1},'sm',S.cash<1500+PORT[pn.tier].setup/2):''}${(pn.n||1)>1?btn(tr('common.member'),'lagP',{id:pn.id,d:-1},'ghost sm'):''}${NET[n.id].cn?btn(pn.sacrif?tr('common.sacrificial_choke'):tr('city_panel.make_sacrificial_contains_floods_1_2'),'sacrif',{id:pn.id},pn.sacrif?'green sm':'sm'):''}${btn(UI.confirm===pn.id?tr('common.really_remove'):tr('common.remove'),'cancelPni',{id:pn.id},'ghost sm')}</div>`}`;}
  else{h+=chk.ok?`<div class="btns">${pniG1(n.id)?btn(tr('city_panel.port_cost_mo_mo',{port:'1G',cost:fmt$(PNI_G1_COST),mo:fmt$(Math.round(PORT[0].pni/2))}),'pni',{city:c,net:n.id,tier:-1},'sm',S.cash<PNI_G1_COST||!portOk(c,0)):''}${PORT.map((P2,i)=>portShown(i)&&i>=pniMin(n.id)?btn(tr('city_panel.port_cost_mo_mo',{port:P2.n,cost:fmt$(1500+P2.setup/2),mo:fmt$(P2.pni)}),'pni',{city:c,net:n.id,tier:i},'sm',S.cash<1500+P2.setup/2||!portOk(c,i)):'').join('')}</div><div class="meta">${pniEta(n.id)}${pniMin(n.id)?' · '+tr('city_panel.no_10g_net_starts_at_100g',{net:esc(n.name)}):pniG1(n.id)?' · '+tr('city_panel.sells_pnis_down_to_1g'):''}</div>${chk.fee?`<div class="meta">${tr('city_panel.paid_peering_price_mo_on_top',{price:fmt$(chk.fee)})}</div>`:''}`:`<div class="why">${esc(chk.why)}</div>`;}
  return h+`</div>${fold&&pn&&pniOn(pn)?pnChg('p:'+pn.id,!shut,n.name):''}</div>`;}
// Every network at this POP that the search keeps, with the PNI you have to it or what one would be worth.
function pniRows(c){return NETS.filter(n=>n.pops.includes(c)).map(n=>[n,S.pni.find(x=>x.city===c&&x.net===n.id)||null]).filter(([n,pn])=>netKeep(n,pn)).map(([n,pn])=>{const chk=pn?null:peerOk(n.id,'pni',c),v=pn?null:pniVal(n.id,c),on=pn&&pniOn(pn),cap=on?lagCap(pniG(pn),pn.n):0,use=on&&cap?(R.usePni[pn.id]||0)/cap:0;
  return {n,pn,v,chk,s:pniStat(n.id,c).k,go:!!pn||(chk.ok&&v.g>=1),use,hot:use>=0.9,ord:!!pn&&(!on||!!pn.up)};});}
function pniListHtml(c,rows){const f=UI.pniF||'all',az=UI.pniSort==='az',open=UI.pniOpen||{},vet=pnVet();
  // The search (#199) first: a network it hides needs no value worked out.
  rows=rows||pniRows(c);
  const keep=r=>f==='all'||(f==='t'&&(r.s==='t'||r.s==='none'))||(f==='worth'&&r.v&&r.v.worth)||(f==='pni'&&(r.s==='here'||r.s==='else'));
  const val=r=>r.v?r.v.val:-Infinity;
  rows.sort((a,b)=>az?a.n.name.localeCompare(b.n.name):(b.v&&b.v.worth)-(a.v&&a.v.worth)||val(b)-val(a)||a.n.name.localeCompare(b.n.name));
  let h=`<div class="btns pnif">${[['all',tr('pni_list.f_all')],['t',tr('pni_list.f_transit')],['worth',tr('pni_list.f_worth')],['pni',tr('pni_list.f_pni')]].map(([k,l])=>btn(l,'pniFilter',{f:k},f===k?'sm':'ghost sm')).join('')}${btn(az?tr('pni_list.sort_az'):tr('pni_list.sort_worth'),'pniSort',{},'ghost sm')}</div>${pnNote('pni',`<p class="note">${tr('pni_list.worth_rule')}</p>`)}`;
  const shown=rows.filter(keep);if(!shown.length)return h+`<p class="empty">${tr('pni_list.nothing_matches')}</p>`;
  // The PNIs you have come first, busiest on top, one short row each once there are several; then the networks you
  // could ask, by type. A group opens by itself when something in it is worth ordering (early on: can be ordered at all).
  const own=shown.filter(r=>r.pn),fold=vet||own.length>4;
  if(!az)own.sort((a,b)=>b.ord-a.ord||b.use-a.use);
  for(const r of own)h+=pniRow(c,r.n,r.pn,r.v,r.chk,fold);
  for(const g of PNI_GRP){const gr=shown.filter(r=>!r.pn&&pniGrpOf(r.n)===g);if(!gr.length)continue;
    const w=gr.filter(r=>r.v&&r.v.worth).length,act=w||(!vet&&gr.some(r=>r.go)),isOpen=f!=='all'||netFiltered()||(open[g]??!!act);
    h+=`<div class="pgrp">${foldB(`${esc(pniGrpL(g))} <small>${trn('pni_list.n_networks_w_worth_it',gr.length,{w})}</small>`,'pniGrp',{g,o:isOpen?0:1},isOpen)}</div>`;
    if(!isOpen)continue;
    // Where something is worth it, only those are on the first page.
    const first=w?Math.min(3,w):3;
    for(const r of gr.slice(0,pnN('pni:'+g,gr.length,first)))h+=pniRow(c,r.n,r.pn,r.v,r.chk,fold);
    h+=pnMore('pni:'+g,gr.length,n=>trn('hud_and_panels.n_more_networks',n),first);}
  return h;}
