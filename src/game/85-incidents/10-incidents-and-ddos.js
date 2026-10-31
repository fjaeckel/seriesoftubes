/* ---------- failures & events ---------- */
// A few badges read the incident text: callers whose message mentions a shark, anchor, crocodile or llama pass its English as en.
function addInc(o,en=o.msg||''){if(S.loans&&S.loans.some(l=>(l.covs||[]).includes('pizza'))){S.cash-=COVS.pizza.each;S.stats.pizza=(S.stats.pizza||0)+1;}o.id=uid();o.start=S.day;S.inc.push(o);S.stats.incidents++;S.stats.by=S.stats.by||{};S.stats.by[o.type]=(S.stats.by[o.type]||0)+1;if(/shark/i.test(en))S.stats.sharks=(S.stats.sharks||0)+1;const f=S.stats.f=S.stats.f||{};if(/anchor/i.test(en))f.anchor=1;if(/crocodile/i.test(en))f.croc=1;if(/beaver/i.test(en))f.beaver=1;if(/llama/i.test(en))f.llama=1;if(S.rules&&S.rules.chaos==='spicy')stretchInc(o);}
const HARMLESS=[
 [tr('common.certificate_expired'),tr('incidents_and_ddos.the_tls_certificate_on_your_noc')],
 [tr('incidents_and_ddos.it_was_dns'),tr('incidents_and_ddos.someone_deleted_the_dns_record_for')],
 [tr('common.leap_second'),tr('incidents_and_ddos.a_leap_second_convinced_one_of')],
 [tr('common.change_freeze'),tr('incidents_and_ddos.management_declared_a_change_freeze')],
 [tr('incidents_and_ddos.ticket_of_the_week'),tr('incidents_and_ddos.a_customer_opened_a_p1_ticket')],
 [tr('common.monitoring'),tr('incidents_and_ddos.your_monitoring_system_went_down_you')],
 [tr('incidents_and_ddos.load_bearing_typo'),tr('incidents_and_ddos.someone_named_a_vlan_prodcution_it')],
 [tr('common.ipv6_milestone'),tr('incidents_and_ddos.your_ipv6_traffic_grew_400_from')],
 [tr('common.mystery_link'),tr('incidents_and_ddos.you_found_a_10g_link_in')],
 [tr('common.spreadsheet_ipam'),tr('incidents_and_ddos.your_ip_address_spreadsheet_hit_1')],
  [tr('common.goose_incident'),tr('incidents_and_ddos.a_goose_attacked_the_technician_on')],
 [tr('common.latency_test'),tr('incidents_and_ddos.a_carrier_pigeon_beat_one_of')],
 [tr('common.zombie_route'),tr('incidents_and_ddos.a_route_you_withdrew_in_year')],
 [tr('common.auditor_visit'),tr('incidents_and_ddos.an_auditor_asked_for_a_network')],
 [tr('incidents_and_ddos.open_to_work'),tr('incidents_and_ddos.your_peering_coordinator_updated')],
 [tr('common.hold_music'),tr('incidents_and_ddos.your_upstream_support_line_plays_the')],
 [tr('common.naming_committee'),tr('incidents_and_ddos.a_two_hour_meeting_about_router')],
 [tr('common.vendor_tac'),tr('incidents_and_ddos.vendor_support_asked_you_to_try')],
];
function lagsN(){const o=[];for(const t of S.transit)if((t.n||1)>=2&&!(t.down>S.day))o.push({k:'t',id:t.id,o:t,n:t.n,lab:tr('incidents_and_ddos.name_transit_lag_in_city',{name:NET[t.net].name,city:CITY[t.city].name})});
  for(const p of S.pni)if((p.n||1)>=2)o.push({k:'p',id:p.id,o:p,n:p.n,lab:tr('incidents_and_ddos.pni_lag_with_name_in_city',{name:NET[p.net].name,city:CITY[p.city].name})});
  for(const x in S.ixp){const n=(S.ixn||{})[x]||1;if(n>=2&&!S.myIx[x])o.push({k:'ix',id:x,n,lab:ixNamesCity(x)?tr('incidents_and_ddos.ix_lag',{ix:ixName(x)}):tr('incidents_and_ddos.ix_lag_in_city',{ix:ixName(x),city:CITY[ixCity(x)].name})});}return o;}
// Several attacks can be live at once: the primary slot keeps older saves compatible, the rest overlap it.
function ddosAll(s=S,live=true){return [s.ev.ddos,...(s.ev.ddosMore||[])].filter(a=>a&&(!live||a.until>s.day));}
const ddosFind=id=>ddosAll().find(a=>id===undefined||a.id===id);
function ddosDrop(a){const left=ddosAll(S,false).filter(x=>x!==a);S.ev.ddos=left[0]||null;S.ev.ddosMore=left.slice(1);}
function ddosExpire(){for(const a of ddosAll(S,false))if(a.until<=S.day||!S.pops[a.city]){ddosDone(a);ddosDrop(a);}}
// An attack is held or lost at its victim: the junk lands there, and other POPs' bad days are not the attacker's doing.
// A city with nobody to serve holds only if its tools soak up the flood (or there is nothing to judge but that).
const ddosSf=a=>((R.cityDem||{})[a.city]||0)>1e-6||!a.gbps?sfOf(R,a.city):clamp(1-ddosReport(a).leak/a.gbps,0,1);
function ddosReport(a){return (R.ddos||[]).find(m=>m.attack===a)||ddosMitigation(a);}
// Where the junk comes in: one of the city's live uplinks, or just "the edge" if it has none yet.
function ddosEntry(c){const o=[];
  for(const t of S.transit)if(t.city===c&&!(t.down>S.day))o.push({k:'t',id:t.id,lab:tr('common.net_transit',{net:NET[t.net].name})});
  for(const x of ixIdsIn(c))if(S.ixp[x]!==undefined)o.push({k:'ix',id:x,lab:tr('common.ix_peering',{ix:ixName(x)})});
  for(const p of S.pni)if(p.city===c)o.push({k:'p',id:p.id,lab:tr('common.pni_with_net',{net:NET[p.net].name})});
  return o.length?pick(o):{k:'edge',lab:''};}
// Flowspec capability of a POP's router: 0 none, 1 basic, 2 full.
const fsAt=c=>{const p=S.pops[c];return p?(RG[p.rgen||0].fs||0):0;};
// Scrubbing removes attack traffic up to the center's capacity; overflow leaks. On-demand
// does nothing for the first couple of days while traffic is being diverted.
function scrubEngaged(atk){return hasScrub()&&(S.scrubMode==='always'||(S.day-(atk.start??S.day))>=SCRUB_DELAY);}
// Several centers (#117): the flood goes to the nearest working one, and what it cannot take spills to the next.
// A center in another city only helps if the backbone can carry the flood there; routing works that out.
const scrubFar=c=>{for(const a of ddosAll())if(a.city===c){const q=(R.haul||[]).find(q=>q.attack===a.id&&q.city===c&&q.ms!==null&&q.ms>=SCRUB_FAR_MS);if(q)return q;}return null;};
function scrubPlan(atk,g=atk.gbps||0,room={},take=null){if(!scrubEngaged(atk))return null;const c=atk.city;const parts=[];
  for(const x of S.scrubs.filter(x=>popUp(x.city)&&(x.city===c||pathExists(c,x.city))).sort((a,b)=>(a.city===c?0:kmBetween(c,a.city))-(b.city===c?0:kmBetween(c,b.city)))){if(g<=0)break;const cap=SCRUB_TIERS[x.tier||0].g,a=Math.min(g,room[x.city]??cap);if(a<=0)continue;const cleaned=take?take(x,a):a;room[x.city]=(room[x.city]??cap)-cleaned;parts.push({city:x.city,tier:x.tier||0,a,cleaned});g-=cleaned;}
  return parts.length?{parts,leak:g}:null;}
// One accounting pipeline for routing and the NOC: upstream -> edge -> scrubbing -> leakage. The junk comes in on one
// port of the victim (a.entry) and is filtered by the victim's own router.
function ddosMitigation(a,room={},blackhole=a.bh,plan=true){const en=a.entry||{},t=en.k==='t'?S.transit.find(x=>x.id===en.id):null,p=en.k==='p'?S.pni.find(x=>x.id===en.id):null,upstream=!!(t&&t.clean);
  const reaching=blackhole?0:a.gbps*(upstream?0.1:1);let g=reaching,flowspec=0;
  if(DDOS_VEC[a.vec]?.fs){g*=FS_RES[fsAt(a.city)];flowspec=reaching-g;}
  if(a.ixbh&&hasIxAt(a.city))g*=0.5;
  if(p&&p.sacrif)g=Math.min(g,liveCap(pniG(p),p.city,p.site,p.n)*0.9);
  if(teRules()?.blackhole&&!blackhole)g=0;
  const filtered=reaching-g,sp=plan&&g>0?scrubPlan(a,g,room):null;
  return {attack:a,blackhole,upstream,reaching,flowspec,filtered,sp,leak:sp?sp.leak:g};}
// The NOC's live attack view: what is hitting you, what each tool would do about it right now, and the buttons.
function ddosPanel(){return S?ddosAll().filter(a=>S.pops[a.city]).map(ddosOne).join(''):'';}
function ddosOne(a){
  const V=DDOS_VEC[a.vec]||{n:'?',fs:false},en=a.entry||{};
  const sacP=en.k==='p'?S.pni.find(x=>x.id===en.id):null;
  const m=ddosReport(a),sp=m.sp,hl=x=>{const qs=(R.haul||[]).filter(q=>q.to===x.city&&q.attack===a.id);return qs.length?{a:qs.reduce((n,q)=>n+q.a,0),h:qs.reduce((n,q)=>n+q.h,0)}:null;};
  const landLine=m.blackhole?'~ '+tr('incidents_and_ddos.blackholed_the_junk_is_gone_and',{city:esc(CITY[a.city].name)})
    :m.upstream?'✓ '+tr('incidents_and_ddos.after_upstream_scrubbing_g',{g:fmtG(m.reaching)}):'';
  const fsLine=!V.fs?'— '+tr('incidents_and_ddos.flowspec_cannot_catch_vec',{vec:esc(V.n)})
    :m.flowspec<=1e-6?'— '+tr('incidents_and_ddos.no_flowspec_filtering_ingress')
    :'✓ '+tr('incidents_and_ddos.flowspec_dropping_g',{g:fmtG(m.flowspec)});
  const used=c=>(R.ddos||[m]).reduce((n,q)=>n+(q.sp?.parts||[]).filter(x=>x.city===c).reduce((t,x)=>t+x.cleaned,0),0);
  const scrOne=x=>{const T=SCRUB_TIERS[x.tier],q=hl(x),total=used(x.city);
      return (x.cleaned>1e-6?'✓ ':'~ ')+tr('incidents_and_ddos.scrubbing_in_city_used_capacity',{city:esc(CITY[x.city].name),used:fmtG(total),capacity:T.n})
        +(total>x.cleaned+1e-6?' · '+tr('incidents_and_ddos.this_attack_g',{g:fmtG(x.cleaned)}):'')
        +(q&&q.h<q.a-0.5?'<br>~ '+tr('incidents_and_ddos.your_backbone_can_only_haul_g',{g:fmtG(q.h),city:esc(CITY[x.city].name)}):'');};
  const scrLine=!hasScrub()?'— '+tr('incidents_and_ddos.no_scrubbing_center')
    :!scrubEngaged(a)?'… '+tr('incidents_and_ddos.on_demand_scrubbing_diverting_live',{n:Math.max(1,SCRUB_DELAY-(S.day-(a.start??S.day)))})
    :!sp?'— '+(m.leak<=1e-6?tr('incidents_and_ddos.no_scrubbing_needed_after_edge'):tr('incidents_and_ddos.scrubbing_centers_unavailable_or_at'))
    :sp.parts.map(scrOne).join('<br>');
  const haulLine=m.near&&m.near.ms>0&&sp?.parts.some(x=>x.cleaned>1e-6)?'✓ '+tr('incidents_and_ddos.scrubbing_traffic_hauled_over_your',{city:esc(CITY[a.city].name),to:esc(CITY[m.near.city].name),ms:m.near.ms.toFixed(1)}):'';
  const entryLine=sacP&&sacP.sacrif?'✓ '+tr('incidents_and_ddos.contained_on_your_sacrificial_net',{net:esc(NET[sacP.net].name)}):'';
  let h=`<div class="inc" style="background:#FFE2E6;border:1px solid #FF8A9A">
    <div class="nm">🚨 ${tr('incidents_and_ddos.live_attack_city',{city:esc(CITY[a.city].name)})}</div>
    <div class="meta">${tr('incidents_and_ddos.size_vec_entry_n_d_left',{size:fmtG(a.gbps),vec:esc(V.n),entry:a.entry&&a.entry.lab?' · '+esc(a.entry.lab):'',n:a.until-S.day})}</div>
    ${landLine?`<div class="meta"><b>${landLine}</b></div>`:''}
    ${m.blackhole?'':`<div class="meta">${fsLine}</div>${entryLine?`<div class="meta">${entryLine}</div>`:''}
    ${m.filtered-m.flowspec>1e-6?`<div class="meta">✓ ${tr('incidents_and_ddos.edge_filters_dropping_g',{g:fmtG(m.filtered-m.flowspec)})}</div>`:''}
    <div class="meta">${scrLine}</div>
    ${haulLine?`<div class="meta">${haulLine}</div>`:''}
    <div class="meta">${m.leak>1e-6?'~ '+tr('incidents_and_ddos.g_is_leaking_through',{g:fmtG(m.leak)}):'✓ '+tr('incidents_and_ddos.attack_fully_mitigated')}</div>`}
    <div class="btns">${m.blackhole?btn(tr('common.stop_blackholing'),'unrtbh',{id:a.id},'ghost sm'):btn(tr('incidents_and_ddos.blackhole_the_target_rtbh'),'rtbh',{id:a.id},'red sm')}${hasIxAt(a.city)&&!m.blackhole?btn(a.ixbh?tr('incidents_and_ddos.ix_blackhole_on'):tr('incidents_and_ddos.ix_blackhole_half_honour_it'),'ixbh',{id:a.id},a.ixbh?'green sm':'sm'):''}${btn(tr('incidents_and_ddos.hackback_3000tm_20k'),'hackback',{id:a.id},'sm',S.cash<20000)}</div>
    <p class="meta">${tr('incidents_and_ddos.rtbh_is_free_and_instant_but')}</p></div>`;
  return h;}
