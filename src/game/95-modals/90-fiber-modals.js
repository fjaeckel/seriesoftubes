function dfModalBody(a,b,km,pop){
  if(seaCab(a,b)&&UI.dfSrc==='cable')return ownCabBody(a,b,pop);
  const sea=!isSub(a,b)&&seaCab(a,b)?ownCabTeaser(a,b):'';
  if(isSub(a,b)&&!subDfCable(a,b))return `<p class="lead" style="margin-top:10px">${tr('fiber_modals.nobody_sells_dark_fiber_on_a')}</p>`+ownCabTeaser(a,b);
  const sc=isSub(a,b)?subDfCable(a,b):null;if(sc)km=sc.km;
  if(uaePair(a,b))return `<p class="lead" style="margin-top:10px">${tr('fiber_modals.no_dark_fiber_inside_the_uae')}</p>`+sea;
  if(landX(a,b)&&cnCity(a)===cnCity(b))return `<p class="lead" style="margin-top:10px">${tr('fiber_modals.nobody_sells_one_fiber_pair_across')}</p>`+sea;
  if(!dfAllowed(a,b))return `<p class="lead" style="margin-top:10px">${tr('fiber_modals.dark_fiber_across_the_chinese_border')}</p>`+sea;
  if(lvl()<2)return `<p class="lead" style="margin-top:10px">${tr('fiber_modals.dark_fiber_unlocks_at_customer_level')}</p>`+sea;
  const src=UI.dfSrc==='build'&&!sc?'build':'lease',sys=DF_SYS[UI.dfSys]&&techOk('sys',UI.dfSys,DF_SYS[UI.dfSys].lvl)?UI.dfSys:'lite',amps=ampCount(km);
  const up=(src==='build'?digCost(km):0)+sysCost(sys)+amps*AMP_COST+pop,mo=(src==='build'?Math.round(km*0.15):dfLeaseMo(km))+amps*AMP_MO;
  const w=Math.round(waveMo(km,false,4));
  return `<p class="lead" style="margin-top:8px">${tr('fiber_modals.a_fiber_pair_of_your_own',{km:AMP_EVERY})}</p>
  <h4 class="sub4">${tr('common.the_glass')}</h4><div class="seg">${btn(tr('fiber_modals.lease_an_iru_price_mo_ready_n',{price:fmt$(dfLeaseMo(km)),n:leadDays(IRU_DAYS)}),'dfSrc',{v:'lease'},src==='lease'?'pink':'ghost')}${sc?btn(cabOpen()?tr('modals.lay_your_own_subsea_cable'):tr('modals.your_own_subsea_cable_tier_1'),'ownCab',{},'ghost',!!ownCabWhy(a,b)):btn(lvl()>=3?tr('fiber_modals.build_your_own_price_n_days',{price:fmt$(dfBuildCost(km)),n:dfBuildDays(km)}):tr('specialist.dig_your_own_as_a_pioneer',{price:fmt$(digCost(km)),n:dfBuildDays(km),p:Math.round((PIONEER-1)*100)}),'dfSrc',{v:'build'},src==='build'?'pink':'ghost')}${sea?btn(cabOpen()?tr('modals.lay_your_own_subsea_cable'):tr('modals.your_own_subsea_cable_tier_1'),'ownCab',{},'ghost',!!ownCabWhy(a,b)):''}</div>${sc?`<p class="note">${tr('fiber_modals.a_fiber_pair_on_cable_km',{cable:esc(CAB[sc.cid].name),km:sc.km.toLocaleString()})}</p>`:''}
  ${src==='build'?`<p class="note">${tr('fiber_modals.your_own_trench_almost_no_rent')}</p>`:''}
  <h4 class="sub4">${tr('common.line_system')}</h4><div class="seg">${Object.keys(DF_SYS).map(k=>btn(`${DF_SYS[k].n} <small>${!techOk('sys',k,DF_SYS[k].lvl)?tr('fiber_modals.level_n',{n:DF_SYS[k].lvl}):fmt$(sysCost(k))}</small>`,'dfSys',{v:k},sys===k?'pink':'ghost',!techOk('sys',k,DF_SYS[k].lvl))).join('')}</div>${Object.keys(DF_SYS).filter(k=>!techOk('sys',k,DF_SYS[k].lvl)&&demoCan(DF_SYS[k].lvl)).map(k=>`<div class="btns">${demoBtn('sys',k,DF_SYS[k].lvl,'','ghost sm')} <small class="meta">${DF_SYS[k].n}</small></div>`).join('')}
  <p class="note">${esc(DF_SYS[sys].blurb)} ${trn('fiber_modals.plus_n_in_line_amplifier_price',amps,{price:fmt$(AMP_COST),mo:fmt$(AMP_MO)})}</p>${km>reachOn(OPT.tp16.reach,!!sc)?`<p class="note">${tr('fiber_modals.km_km_is_longer_than_any',{km:km.toLocaleString()})}</p>`:''}
  <div class="kv" style="margin-top:10px"><span>${tr('common.due_now')}</span><b>${fmt$(up)}</b></div><div class="kv"><span>${tr('common.monthly')}</span><b>${tr('common.price_mo',{price:fmt$(mo)})}</b></div>
  <p class="note">${tr('fiber_modals.for_comparison_a_leased_1_6t',{price:fmt$(w)})}</p>
  <div class="btns" style="margin-top:10px">${btn(`${src==='build'?tr('common.start_construction'):tr('fiber_modals.sign_the_iru')} <small>${fmt$(up)}</small>`,'orderDf',{},'pink big',S.cash<up)}</div>`;
}
function openVxcModal({from,to,prov}){
  let rows='';const row=(f,a,b)=>{const km=kmBetween(a,b),sub=isSub(a,b),pb=S.pops[b]?nniPort(b,f.id):null,remote=!S.pops[b];
    const label=remote?tr('fiber_modals.remote_peering_at_ix_discouraged',{ix:esc(CITY[b].ix)}):pb?tr('common.your_pop'):tr('fiber_modals.your_pop_needs_a_fabric_port');
    const freeA=nniPort(a,f.id)?NNI[nniPort(a,f.id).tier].g-nniUsed(a,f.id):0,freeB=remote?1e9:pb?NNI[pb.tier].g-nniUsed(b,f.id):0;
    return `<div class="row"><span class="logo" style="--c:${f.col}">${initials(f)}</span><div class="grow"><div class="nm">${CITY[a].name} → ${CITY[b].name}</div><div class="meta">${label} · ${km.toLocaleString()} km${sub?' '+tr('common.subsea'):''}</div>
    <div class="btns">${VXC.map((V,t)=>btn(`${V.n} <small>${tr('common.price_mo',{price:fmt$(vxcMo(km,sub,t))})}</small>`,'buyVxc',{a,b,prov:f.id,t},'sm',(!remote&&!pb)||V.g>freeA||V.g>freeB||S.cash<vxcMo(km,sub,t))).join('')}</div></div></div>`;};
  for(const f of FABS){if(prov&&f.id!==prov)continue;
    if(from){if(!nniPort(from,f.id))continue;for(const b of f.cities){if(b===from)continue;if(!S.pops[b]&&!CITY[b].ix)continue;rows+=row(f,from,b);}}
    else if(to&&f.cities.includes(to)){for(const a of Object.keys(S.pops))if(a!==to&&nniPort(a,f.id))rows+=row(f,a,to);}}
  if(!rows){const fs=FABS.filter(f=>!to||f.cities.includes(to));rows=`<p class="empty">${tr('fiber_modals.you_need_a_fabric_port_at',{list:fs.map(f=>`<b>${esc(f.name)}</b> (${f.cities.filter(c=>S.pops[c]).map(c=>CITY[c].name).join(', ')||tr('fiber_modals.no_pop_of_yours_on_it')})`).join(', ')})}</p>`;}
  openModal(`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('fiber_modals.virtual_circuit_over_an_nni_fabric')}</div><h2 style="font-size:26px">${from?tr('fiber_modals.from_city',{city:CITY[from].name}):tr('fiber_modals.to_city',{city:CITY[to].name})}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <p class="lead" style="margin-top:8px">${tr('fiber_modals.no_install_fee_live_in_minutes')}</p>${rows}`);
}

