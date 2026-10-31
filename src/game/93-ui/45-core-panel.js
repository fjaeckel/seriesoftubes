/* ---------- NOC: the backbone's technology ---------- */
const CORE_WHAT=[N_('core.shortest_paths_only_every_router'),N_('core.labels_switch_traffic_that_only'),N_('core.tunnels_unlock_auto_te_and'),N_('core.segment_routing_te_detours_up'),N_('core.segment_routing_over_ipv6_the')];
function corePanel(){if(!S.core||S.mode==='puzzle'||S.pz||S.ar||S.scn)return '';const C=S.core,run=C.run,lv=C.lv,n=lv+1;
  let h=`<h3 style="font-size:15px;margin:8px 0 4px">${tr('core.backbone')}</h3><div class="kv"><span>${tr('core.running')}</span><b>${tr(CORE_LV[run])}</b></div>`;
  h+=`<p class="meta" style="margin:2px 0 6px">${tr(CORE_WHAT[run])}${run?' '+tr('core.uses_p_of_router_cpu',{p:pct(CORE_CPU[run])}):''}</p>`;
  if(C.legacy)h+=`<p class="note" style="margin:0 0 6px">${tr('core.your_auto_te_predates_backbones')}</p>`;
  // Run any level already paid for: one step down is the safe way past vendor squabbles.
  if(lv>0)h+=`<div class="seg" style="margin-bottom:6px">${CORE_LV.slice(0,lv+1).map((l,i)=>btn(tr(l),'coreSet',{v:i},i===run&&!C.legacy?'pink sm':'ghost sm')).join('')}</div>`;
  if(n<=4){const lk=lvl()<CORE_REQ[n];h+=`<div class="btns">${btn(lk?tr('core.lv_at_customer_level_n',{lv:tr(CORE_LV[n]),n:CORE_REQ[n]}):tr('core.upgrade_to_lv_cost',{lv:tr(CORE_LV[n]),cost:fmt$(CORE_COST[n])}),'coreUp',{},'sm',lk||S.cash<CORE_COST[n])}</div>`;
    h+=`<p class="meta" style="margin:2px 0 6px">${tr(CORE_WHAT[n])}</p>`;}
  const out=coreOut();if(out.length)h+=`<p class="why">${trn('core.n_pop_outside_the_core_its',out.length,{list:out.slice(0,5).map(c=>CITY[c].name).join(', ')+(out.length>5?'…':''),lv:tr(CORE_LV[run])})}</p>`;
  const v=coreOn()&&run>=1?coreVendors():null;
  if(v&&v.size>1)h+=coreIopRisk()?`<p class="why">${tr('core.n_vendors_at_the_top_of',{n:v.size,lv:tr(CORE_LV[run])})}</p>`:`<p class="meta" style="margin:0 0 6px">${tr('core.n_vendors_one_step_below_their',{n:v.size})}</p>`;
  if(run>=2)h+=`<p class="meta" style="margin:0 0 6px">🛟 ${tr('core.fast_reroute_customers_lose_half')}</p>`;
  if(coreOn()&&lv>=1)h+=C.lab?`<p class="meta" style="margin:0 0 6px">🧪 ${tr('core.interop_lab_cuts_interop_incidents',{p:pct(1-CORE_LAB_F)})}</p>`
    :`<div class="btns">${btn(tr('core.build_an_interop_lab_cost',{cost:fmt$(CORE_LAB)}),'coreLab',{},'ghost sm',S.cash<CORE_LAB)}</div><p class="meta" style="margin:2px 0 6px">${tr('core.test_vendors_against_each_other',{p:pct(1-CORE_LAB_F)})}</p>`;
  return h;}
