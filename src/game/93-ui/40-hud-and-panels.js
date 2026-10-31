function fitHud(){const h=$('hud');if(!h)return;h.classList.remove('fit1','fit2','fit3');if(innerWidth<=760)return;
  const row=()=>{let m=0;for(const c of h.children)if(c.offsetParent)m=Math.max(m,c.offsetHeight);return m;};
  for(const c of ['fit1','fit2','fit3']){if(h.offsetHeight<=row()*1.5)break;h.classList.add(c);}}
function renderHUD(){
  // No clock (puzzles): there is no time to speed up, so the speed buttons go.
  {const ck=!S||rule('clock');for(const v of [0,0.5,1,2,4,8]){const b=$('sp'+v);if(b){b.classList.toggle('on',UI.speed===v);b.hidden=!ck;}}}
  $('muteBtn').style.opacity=UI.muted?.4:1;
  if(!S)return;
  if(pzOn()){$('hName').textContent=pzName(pzDef(S.pz.id)||S.pz);$('hAsn').textContent=tr('puzzles.puzzle');renderTabbar();return;}
  {const rt=ruleTag(),ha=$('hAsn');ha.title=rt?tr('rules.rules_are_locked_for_this_network',{rules:rt}):'';}
  $('hName').textContent=S.name;$('hAsn').textContent='AS'+S.asn+(S.mode==='sandbox'||ruleTag()&&!S.scn?' · '+ruleTag():S.scn?' · '+(scnName())+(S.scn.done||S.scn.failed?'':` · ${tr('ui.n_d_left',{n:Math.max(0,S.scn.days-S.day)})}`):'');
  $('hCash').textContent=fmt$(S.cash);$('hCash').style.color=S.cash<0?'var(--bad)':'';
  const net=R.revMo-R.costMo;$('hRate').innerHTML=`<span class="${net>=0?'up':'down'}">${net>=0?'▲':'▼'} ${tr('common.price_mo',{price:fmt$(Math.abs(net))})}</span>`;
  $('hTraffic').textContent=`${fmtG(R.served)}`;
  $('hTrafBar').style.width=(R.demand?R.served/R.demand*100:0)+'%';
  $('hTrafBar').style.background=R.demand&&R.served/R.demand<0.9?'var(--bad)':'var(--ok)';
  $('hReach').textContent=reachPct(R.reach);$('hReach').style.color=R.reach<0.99?'var(--bad)':'var(--eye)';
  $('hTier').textContent=tierLabel()+' · '+tr('hud_and_panels.lv_n',{n:S.lvl||1});
  {const P=scnProg(),hs=$('hScn');hs.hidden=!P;if(P){const sc=S.scn;$('hScnVal').textContent=sc.done?tr('common.done'):sc.failed?tr('common.time_s_up'):`${Math.round(P.f*100)}% · ${tr('ui.n_d_left',{n:Math.max(0,sc.days-S.day)})}`;}}
  $('hDate').textContent=dateStr(S.day);
  {const bo=(S.loanOffers||[]).length,hb=$('hBank');hb.hidden=!bo;hb.textContent=bo;}
  {const st=custStats(),hc=$('hCust');hc.hidden=!st.n;if(st.n){$('hCustVal').innerHTML=`${st.avg>=80?'😀':st.avg>=60?'🙂':st.avg>=30?'😟':'😡'} ${Math.round(st.avg)}%${st.unhappy?` <span class="cnt red">${st.unhappy}</span>`:''}`;hc.classList.toggle('hot',st.furious>0);}}
  const n=S.inc.length;$('hNoc').classList.toggle('hot',n>0);{const b=$('hNocNew');if(b)b.hidden=true;}$('hNocVal').textContent=n?trn('hud_and_panels.n_incident',n):tr('common.all_quiet');
  if(!window.__TUBES_TEST__)fitHud();
  renderTabbar();
}
function renderLeft(){checkLayer();
  // Tablets in landscape: both side panels don't fit next to the map, so the left one tucks away
  // while a city or link is open and comes back with the toggle button.
  const tab=isTablet(),L=$('left');L.classList.toggle('closed',tab?(!!UI.sel&&!UI.leftOpen):!UI.leftOpen);const tg=$('leftToggle');if(tg&&innerWidth>760)tg.hidden=!(tab&&L.classList.contains('closed'));
  renderTabbar();
  if(!S||pzOn()){L.hidden=true;return;}L.hidden=false;
  const ndone=GOALS.filter(g=>S.done[g.id]!==undefined).length;
  const tabs=[['goals',`${tr('common.goals')}<span class="cnt">${ndone}/${GOALS.length}</span>`],['deals',`${tr('common.deals')}${S.offers.length?`<span class="cnt">${S.offers.length}</span>`:''}`],['noc',`NOC${S.inc.length?`<span class="cnt red dot" aria-hidden="true"></span>`:''}`],['nets',tr('common.networks')]];
  $('leftTabs').innerHTML=tabs.map(([k,l])=>`<button class="${UI.left===k?'on':''}" data-act="leftTab" data-args='{"t":"${k}"}'>${l}</button>`).join('')+(innerWidth<760?`<button data-act="toggleLeft" style="margin-left:auto" aria-label="${tr('common.close')}">×</button>`:'');
  let h='';
  if(UI.left==='goals'){
    h+=charterCard()+scnCard()+lvlCard()+t1Card();
    const cur=GOALS.find(g=>S.done[g.id]===undefined);
    h+=GOALS.map(g=>{const d=S.done[g.id]!==undefined,c=g===cur;return `<div class="goal ${d?'done':''} ${c?'cur':''}"><div class="ck">${d?'✓':''}</div><div><div class="gt">${esc(g.t)}</div>${c||!d?`<div class="gd">${esc(g.d)}</div>`:''}${!d&&g.r?`<div class="gr">${tr('hud_and_panels.reward_cash',{cash:fmt$(g.r)})}</div>`:''}</div></div>`;}).join('');
    h+=badgeGrid();
  }else if(UI.left==='deals'){
    {const st=custStats();if(st.n)h+=`<div class="row" style="margin-bottom:8px"><div class="grow"><div class="nm">${tr('common.your_customers')} <span class="meta">${st.n} · ${tr('hud_and_panels.happiness_p',{p:Math.round(st.avg)})}</span></div><div class="bar ${moodCls(st.avg)}"><i style="width:${st.avg}%"></i></div>${st.unhappy?`<div class="why">${trn('hud_and_panels.n_unhappy_customer_price_mo_at',st.unhappy,{price:fmt$(st.risk)})}</div>`:''}</div>${btn(st.unhappy?tr('common.see_who'):tr('common.all_customers'),'custOpen',{sad:st.unhappy?1:0},st.unhappy?'pink sm':'ghost sm')}</div>`;}
    h+=confSection()+seatSection();
    {const lv=S.lvl||1,nx=LEVELS[lv];h+=`<div class="inc" style="background:#FFF6CF"><div class="nm">${tr('hud_and_panels.customer_level_lv_name',{lv,name:LEVELS[lv-1].n})}</div><div class="meta">${nx?tr('hud_and_panels.next_req_unlocks_what',{req:nx.req,what:lc1(nx.unlock)}):tr('common.every_customer_type_is_unlocked_go')}</div></div>`;}
    if(!S.offers.length)h+=`<p class="empty">${tr('hud_and_panels.no_open_offers_right_now_businesses')}</p>`;
    for(const o of S.offers.slice().sort((a,b)=>a.exp-b.exp)){const has=bHas(o);
      h+=`<div class="row"><div class="grow"><div class="nm">${esc(o.name)}</div><div class="meta">${esc(BIZ_T[o.type].l)} · ${CITY[o.city].name}${o.city2?' ⇄ '+CITY[o.city2].name:''} · <b>${bTerms(o)}</b> · ${tr('ui.n_d_left',{n:o.exp-S.day})}${(o.reqs||[]).length?` · ${trn('hud_and_panels.n_special_requirement',o.reqs.length)}`:''}</div>${spotWhy(o)}${bRisk(o)}${reqList(o)}
      <div class="btns">${has?btn(tr('common.accept'),'accept',{id:o.id},'green sm'):btn(tr('common.go_there'),'focusCity',{city:bCities(o).find(c=>!S.pops[c])},'ghost sm')}${btn(tr('common.decline'),'decline',{id:o.id},'ghost sm')}</div>${has?'':`<div class="why">${tr('hud_and_panels.needs_a_pop_in_cities',{cities:bCities(o).filter(x=>!S.pops[x]).map(x=>CITY[x].name).join(', ')})}</div>`}</div></div>`;}
  }else if(UI.left==='noc'){
    h+=`<div class="btns" style="margin-bottom:8px">${btn(tr('hud_and_panels.open_noc_dashboard'),'dash',{},'pink')}${btn(tr('common.connections'),'connOpen',{},'')}${btn(tr('common.traceroute'),'trace',{},'')}</div>`;
    h+=`<p class="lead">${tr('hud_and_panels.your_network_operations_center_every')}</p>`;
    h+=opsCard()+mkCard();
    // Incidents come first, the ones you can fix with one click at the top (#63): no scrolling past hot ports to replace an optic.
    for(const i of S.inc.filter(i=>i.type!=='ddos').sort((a,b)=>(b.cost?1:0)-(a.cost?1:0)||(b.impact||0)-(a.impact||0))){h+=`<div class="inc"><div class="nm">${incTitle(i.type)}</div><div class="meta">${esc(i.msg)}</div><div class="meta">${trn('hud_and_panels.auto_fix_in_n_day',i.until-S.day)}${i.impact?` · ${tr('hud_and_panels.g_lost',{g:fmtG(i.impact)})}`:''}</div>${i.cost?`<div class="btns">${btn(`${esc(i.fix||tr('common.rush_repair'))} ${fmt$(i.cost)}`,'fixInc',{id:i.id},'red sm',S.cash<i.cost)}</div>`:''}</div>`;}
    h+=logSection();UI.logSeen=Date.now();
    h+=`<div class="kv"><span>${tr('common.ddos_scrubbing')}</span><b>${hasScrub()?tr('hud_and_panels.on_city',{city:S.scrubs.map(x=>CITY[x.city].name).join(', ')}):tr('hud_and_panels.none_build_one_from_a_pop')}</b></div>`;
    {const pops=Object.keys(S.pops),nfs=pops.filter(c=>fsAt(c)).length;
     h+=`<div class="kv"><span>${tr('hud_and_panels.flowspec_capable_pops')}</span><b>${nfs}/${pops.length}</b></div>`;
     if(nfs<pops.length)h+=`<p class="meta" style="margin:2px 0 6px">${tr('hud_and_panels.flowspec_drop_rules_live_in_router')}</p>`;}
    if(S.grace&&S.grace.until>S.day&&R.graceNets)h+=`<div class="kv"><span>${tr('common.courtesy_route')}</span><b>${tr('hud_and_panels.n_networks_d_days_left',{n:R.graceNets,d:S.grace.until-S.day})}</b></div><p class="meta" style="margin:0 0 6px">${tr('hud_and_panels.reaches_networks_from_the_last')}</p>`;
    h+=ddosPanel();
    h+=corePanel();
    h+=S.te&&!coreTE()?`<div class="kv"><span>Auto-TE</span><b>${tr('core.paused')}</b></div><p class="why">${tr('core.auto_te_is_paused_it_needs')}</p>`:S.te?`<div class="kv"><span>Auto-TE</span><b>${S.te.on?tr('hud_and_panels.on_moving_g_onto_alternate_paths',{g:fmtG(R.teMoved||0)}):tr('common.off')}</b></div><div class="btns">${btn(S.te.on?tr('hud_and_panels.turn_auto_te_off'):tr('hud_and_panels.turn_auto_te_on'),'teToggle',{},'ghost sm')}${btn(S.te.script?tr('common.edit_routescript'):tr('hud_and_panels.write_a_routescript'),'teEdit',{},'pink sm')}</div>${S.te.script?`<p class="meta" style="margin:2px 0 6px">RouteScript: ${teRules()?tr('hud_and_panels.n_rules_live',{n:teRules().n}):S.te.on?tr('hud_and_panels.has_errors_not_running'):tr('common.controller_off')}${R.teBlack?` · ${tr('hud_and_panels.blackholing_g',{g:fmtG(R.teBlack)})}`:''}</p>`:''}`
      :`<div class="kv"><span>Auto-TE</span><b>${lvl()<3?tr('hud_and_panels.unlocks_at_customer_level_3'):tr('common.not_installed')}</b></div><p class="meta" style="margin:2px 0 6px">${tr('hud_and_panels.traffic_takes_the_shortest_path_even')}</p>${coreTE()?'':`<p class="why">${tr('core.auto_te_needs_an_rsvp_te_or')}</p>`}<div class="btns">${btn(tr('hud_and_panels.install_auto_te_cost_mo_mo',{cost:fmt$(TE_COST),mo:fmt$(TE_MO)}),'buyTE',{},'pink sm',lvl()<3||S.cash<TE_COST||!coreTE())}</div>`;
    const hot=S.links.filter(l=>!linkDown(l)&&capOf(l)>0&&(R.load[l.id]||0)/capOf(l)>=0.85).sort((a,b)=>(R.load[b.id]/capOf(b))-(R.load[a.id]/capOf(a)));
    if(hot.length){h+=`<h3 style="font-size:15px;margin:4px 0">${tr('common.congested_links')}</h3>${S.te&&S.te.on?'':'<p class="meta" style="margin:0 0 4px">'+tr('hud_and_panels.raise_a_full_link_s_metric')+'</p>'}`+hot.map(l=>`<div class="row"><div class="grow"><div class="nm">${CITY[l.a].name} ⇄ ${CITY[l.b].name}</div><div class="meta">${capName(l)} · ${tr('hud_and_panels.p_full',{p:pct((R.load[l.id]||0)/capOf(l))})}</div></div>${btn(tr('common.inspect'),'selLink',{id:l.id},'pink sm')}</div>`).join('');}
    h+=hwCard();
    const slow=Object.keys(S.pops).filter(latSlow).sort((a,b)=>R.latF[a]-R.latF[b]);
    if(slow.length)h+=`<h3 style="font-size:15px;margin:4px 0">🐢 ${tr('common.slow_cities')}</h3><p class="meta" style="margin:0 0 4px">${tr('hud_and_panels.their_users_go_out_through_transit')}</p>`+slow.map(c=>{const f=R.latFar[c];return `<div class="row"><div class="grow"><div class="nm">${CITY[c].name} → ${CITY[f.to].name}</div><div class="meta">${tr('hud_and_panels.p_of_its_traffic_ms_ms',{p:pct(Math.min(1,f.share)),ms:Math.round(f.ms),sf:pct(R.latF[c])})}</div></div>${btn(tr('common.inspect'),'focusCity',{city:c},'ghost sm')}</div>`;}).join('');
    const hotR=hotPorts();
    if(hotR.length)h+=`<h3 style="font-size:15px;margin:4px 0">${tr('hud_and_panels.ports_caches_and_routers_running_hot')}</h3>`+hotR.map(x=>`<div class="row"><span class="hotk hk-${x.k}">${HOTL[x.k]}</span><div class="grow"><div class="nm">${CITY[x.city].name} · ${esc(x.lab)}</div><div class="meta">${tr('hud_and_panels.p_full',{p:pct(Math.min(1,x.u))})}${x.u>=0.995?' · '+tr('hud_and_panels.dropping_or_overflowing'):''} · ${esc(x.tip)}</div></div>${btn(tr('common.inspect'),'focusCity',{city:x.city},'pink sm')}</div>`).join('');
    if(!S.inc.length&&!hot.length&&!hotR.length&&!slow.length)h+=`<p class="empty">${tr('hud_and_panels.all_systems_green_enjoy_it_while')}</p>`;
    h+=`<div class="kv" style="margin-top:8px"><span>${tr('hud_and_panels.incidents_so_far')}</span><b>${S.stats.incidents}</b></div><div class="kv"><span>${tr('hud_and_panels.survived_with_no_impact')}</span><b>${S.stats.survived}</b></div>`;
  }else{
    if(Object.keys(S.ixp).length||ppol()!=='open')h+=pdeskCard();
    h+=`<p class="lead">${tr('hud_and_panels.every_network_on_the_map_traffic')}</p>`;
    {const nc=conns().length;if(nc)h+=`<div class="btns" style="margin-bottom:8px">${btn(tr('hud_and_panels.all_connections_n',{n:nc}),'connOpen',{},'pink sm')}</div>`;}
    const where=netWhereIdx(),tl=NETS.filter(n=>n.tail),tlOn=tl.filter(n=>where(n.id).some(x=>x[2]==='ix')).length;
    const foc=UI.netFocus&&NET[UI.netFocus]?NET[UI.netFocus]:null,out=!foc&&UI.nf==='out',lostN=ntLost().length;
    h+=`<div class="btns" style="margin-bottom:8px">${btn(tr('common.all_networks'),'netFilter',{f:'all'},!foc&&!out?'sm':'ghost sm')}${btn(tr('hud_and_panels.out_of_reach_without_transit_n',{n:lostN}),'netFilter',{f:'out'},out?'sm':'ghost sm')}</div>`;
    if(out&&!lostN)h+=`<p class="empty">${tr('hud_and_panels.nothing_every_network_is_reachable')}</p>`;
    // Shown 100 at a time like the dashboard lists: every country's own eyeballs made this list long (2.0).
    const nl=(foc?[foc]:out?ntLost():NETS).filter(n=>!n.tail||UI.tailOpen||foc||out);
    for(const n of nl.slice(0,listN('nets'))){
      h+=`<div class="row">${logo(n)}<div class="grow"><div class="nm">${esc(n.name)} <span class="meta">AS${n.asn}</span></div><div class="meta"><span class="tag ${n.type}">${TYPE_L[n.type]}</span> <span class="tag ${n.pol}">${n.pol}</span> · ${tr('hud_and_panels.p_of_traffic',{p:(NSH[n.id]*100).toFixed(1)})}${n.price?` · ${tr('hud_and_panels.transit_price_gbps',{price:(n.price*S.priceMul).toFixed(2)})}`:''}</div><div class="pchips">${pniChip(n.id,null)}</div><div class="meta">${esc(n.blurb)}</div>${netWhere(n,where)}${(foc||out)&&!R.nt[n.id]?`<p class="why">${esc(offTransitHint(n.id))}</p>`:''}${(foc||out)&&coneVia(n.id)&&(R.cone[n.id]||!R.nt[n.id])?`<p class="meta">${R.cone[n.id]?tr('hud_and_panels.reached_through_the_customer_cone_of',{net:esc((NET[R.cone[n.id]]||coneVia(n.id)).name)}):tr('hud_and_panels.buys_transit_from_net_peer_with',{net:esc(coneVia(n.id).name)})}</p>`:''}${foc||out&&!R.nt[n.id]?meetLine(n,foc?24:4):''}</div></div>`;}
    h+=listMore('nets',nl.length,n=>trn('hud_and_panels.n_more_networks',n));
    if(!foc&&!out)h+=`<div class="row"><div class="grow"><div class="nm">${tr('hud_and_panels.the_long_tail')} <span class="meta">${tr('hud_and_panels.n_small_networks',{n:tl.length})}</span></div><div class="meta">${tr('hud_and_panels.p_of_traffic_between_them_scattered',{p:(tl.reduce((a,n)=>a+NSH[n.id],0)*100).toFixed(1),n:tlOn})}</div></div>${btn(UI.tailOpen?tr('common.hide'):tr('common.show'),'tailTog',{},'ghost sm')}</div>`;
  }
  if(h!==UI._lh){UI._lh=h;morph($('leftBody'),h);}
}
function renderPanel(){checkLayer();
  const P=$('panel');
  if(!S||!UI.sel){P.hidden=true;return;}
  P.hidden=false;
  // Don't wipe a half-typed custom metric on the daily re-render.
  const fe=document.activeElement;if(fe&&fe.id==='metIn'&&UI.sel.type!=='city'&&fe.dataset.id===UI.sel.id)return;
  const scrollEl=$('panelBody').querySelector('.scroll');const st=scrollEl?scrollEl.scrollTop:0;
  const html=pzOn()?pzPanel(UI.sel):UI.sel.type==='city'?cityPanel(UI.sel.id):linkPanel(UI.sel.id);if(!html){P.hidden=true;return;}if(html===UI._ph&&!P.hidden&&$('panelBody').firstChild)return;UI._ph=html;morph($('panelBody'),html);
  const ns=$('panelBody').querySelector('.scroll');if(ns)ns.scrollTop=st;
}
