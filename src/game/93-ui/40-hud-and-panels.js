function fitHud(){const h=$('hud');if(!h)return;h.classList.remove('fit1','fit2','fit3','fit4','fit5');if(innerWidth<=760)return;
  const row=()=>{let m=0;for(const c of h.children)if(c.offsetParent)m=Math.max(m,c.offsetHeight);return m;};
  for(const c of ['fit1','fit2','fit3','fit4','fit5']){if(h.offsetHeight<=row()*1.5)break;h.classList.add(c);}}
function renderHUD(){
  // No clock (puzzles): there is no time to speed up, so the speed buttons go.
  // A locked clock has no buttons: whoever locked it shows what it runs at (HOOKS.hud).
  {const ck=!S||rule('clock'),lk=UI.clockLocked;for(const v of [0,0.5,1,2,4,8]){const b=$('sp'+v);if(b){b.classList.toggle('on',!lk&&UI.speed===v);b.hidden=lk||!ck;}}HOOKS.hud?.();}
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
  {const r=reachSolo(),h=$('hReach'),x=fedLostOn(),w=$('hReachX');h.textContent=reachPct(r);h.style.color=r<0.99?'var(--bad)':'var(--eye)';
    // Players you cannot reach are left out of the big number: the small one counts them (89-fedplay-unreached.js).
    w.hidden=!x;w.textContent=x?'👥 '+reachPct(R.reach):'';w.style.color=x&&fedLost()>=FEDL_WARN?'var(--bad)':'';h.parentNode.title=x?tr('hud_and_panels.reach_with_players',{p:reachPct(R.reach),q:pct(fedLost())}):'';}
  $('hTier').textContent=tierLabel()+' · '+tr('hud_and_panels.lv_n',{n:S.lvl||1});
  {const P=scnProg(),hs=$('hScn');hs.hidden=!P;if(P){const sc=S.scn;$('hScnVal').textContent=sc.done?tr('common.done'):sc.failed?tr('common.time_s_up'):`${Math.round(P.f*100)}% · ${tr('ui.n_d_left',{n:Math.max(0,sc.days-S.day)})}`;}}
  $('hDate').textContent=dateStr(S.day);
  {const bo=(S.loanOffers||[]).length,hb=$('hBank');hb.hidden=!bo;hb.textContent=bo;}
  {const st=custStats(),hc=$('hCust');hc.hidden=!st.n;if(st.n){$('hCustVal').innerHTML=`${st.avg>=80?'😀':st.avg>=60?'🙂':st.avg>=30?'😟':'😡'} ${Math.round(st.avg)}%${st.unhappy?` <span class="cnt red">${st.unhappy}</span>`:''}`;hc.classList.toggle('hot',st.furious>0);}}
  const n=S.inc.length;$('hNoc').classList.toggle('hot',n>0);{const b=$('hNocNew');if(b)b.hidden=true;}$('hNocVal').textContent=n?trn('hud_and_panels.n_incident',n):tr('common.all_quiet');
  if(!window.__TUBES_TEST__)fitHud();
  renderTabbar();
}
// Folded parts of the Goals and NOC tabs (view state): finished goals, the badge grid, and the rest of each long NOC list.
const LEFT_FOLDS=['done','badges','hot','slow','ports','lvq','ppol'],leftFolded=k=>!!(UI.fold&&UI.fold[k]),NOC_TOP=5;
// NOC lists are sorted worst first: show the worst few, one tap shows them all (and folds them again).
const nocCnt=a=>a.length>NOC_TOP+2?` <span class="meta">${a.length}</span>`:'';
// A cut that would hide only one or two rows is not worth a button: those lists show whole.
const nocCut=(k,rows)=>rows.length>NOC_TOP+2&&!leftFolded(k)?rows.slice(0,NOC_TOP):rows;
function nocList(k,rows,fn,wrap){const all=leftFolded(k),sh=nocCut(k,rows);return (wrap?wrap(sh):sh.map(fn).join(''))+(rows.length>NOC_TOP+2?`<div class="btns" style="margin:2px 0 8px">${btn(all?tr('common.show_fewer'):tr('notifications.show_all_n',{n:rows.length}),'leftFold',{k},'ghost sm',false,'',` aria-expanded="${!!all}"`)}</div>`:'');}
function renderLeft(){checkLayer();
  // Tablets in landscape: both side panels don't fit next to the map, so the left one tucks away
  // while a city or link is open and comes back with the toggle button. A phone on its side (wider than 760 px) is not a
  // tablet here: its sheet closes from the tab bar like any other.
  const tab=isTablet()&&!isPhone(),L=$('left');L.classList.toggle('closed',tab?(!!UI.sel&&!UI.leftOpen):!UI.leftOpen);const tg=$('leftToggle');if(tg&&innerWidth>760)tg.hidden=!(tab&&L.classList.contains('closed'));
  renderTabbar();
  if(!S||pzOn()){L.hidden=true;return;}L.hidden=false;
  const G=goals(),ndone=G.filter(g=>S.done[g.id]!==undefined).length;
  const tabs=[['goals',`<span class="tl">${tr('common.goals')}</span><span class="cnt">${ndone}/${G.length}</span>`],['deals',`<span class="tl">${tr('common.deals')}</span>${dealsCnt()}`],['noc',`<span class="tl">NOC</span>${S.inc.length?`<span class="cnt red dot" aria-hidden="true"></span>`:''}`],['nets',`<span class="tl">${tr('common.networks')}</span>`]];
  $('leftTabs').innerHTML=tabs.map(([k,l])=>`<button class="${UI.left===k?'on':''}" role="tab" aria-selected="${UI.left===k}" data-act="leftTab" data-args='{"t":"${k}"}'>${l}</button>`).join('')+(innerWidth<760?`<button data-act="toggleLeft" style="margin-left:auto" aria-label="${tr('common.close')}">×</button>`:'');
  let h='';
  if(UI.left==='goals'){
    h+=charterCard()+scnCard()+lvlCard()+t1Card();
    const cur=G.find(g=>S.done[g.id]===undefined);
    // Finished goals fold into one line once there are more than a few, so what is still to do comes first (and fits a phone).
    const gRow=g=>{const d=S.done[g.id]!==undefined,c=g===cur;return `<div class="goal ${d?'done':''} ${c?'cur':''}"><div class="ck">${d?'✓':''}</div><div><div class="gt">${esc(g.t)}</div>${c||!d?`<div class="gd">${esc(g.dOut&&modeOn('outcast')?g.dOut:g.d)}</div>`:''}${!d&&g.r?`<div class="gr">${tr('hud_and_panels.reward_cash',{cash:fmt$(g.r)})}</div>`:''}</div></div>`;};
    if(ndone>3){const fo=leftFolded('done');h+=G.filter(g=>S.done[g.id]===undefined).map(gRow).join('')+`<div class="row gfold"><div class="ck">✓</div><div class="grow"><div class="nm">${trn('hud_and_panels.n_goals_done',ndone)}</div></div>${foldB(fo?tr('common.hide'):tr('common.show'),'leftFold',{k:'done'},fo,'ghost sm',trn('hud_and_panels.n_goals_done',ndone))}</div>`+(fo?G.filter(g=>S.done[g.id]!==undefined).map(gRow).join(''):'');}
    else h+=G.map(gRow).join('');
    h+=badgeGrid();
  }else if(UI.left==='deals'){
    h+=dealsTab();
  }else if(UI.left==='noc'){
    h+=`<div class="btns" style="margin-bottom:8px">${btn(tr('hud_and_panels.open_noc_dashboard'),'dash',{},'pink')}${pieNocBtn()}${bazNocBtn()}${btn(`⚙️ ${tr('routing.routing_and_ddos')}${S.te&&!coreTE()?'<span class="cnt red dot" aria-hidden="true"></span>':''}`,'routingOpen',{},'')}</div>`;
    // The introduction is for newcomers: once the network has grown or a few things have broken, it only costs a scroll.
    if(Object.keys(S.pops).length<6&&(S.stats.incidents||0)<3)h+=`<p class="lead">${tr('hud_and_panels.your_network_operations_center_every')}</p>`;
    h+=opsCard()+optxCard()+pieSpatCard()+mkCard()+ddosPanel();
    // Incidents come first, the ones you can fix with one click at the top (#63): no scrolling past hot ports to replace an optic.
    for(const i of S.inc.filter(i=>i.type!=='ddos').sort((a,b)=>(b.cost?1:0)-(a.cost?1:0)||(b.impact||0)-(a.impact||0))){h+=`<div class="inc"><div class="nm">${incTitle(i.type)}</div><div class="meta">${esc(i.msg)}</div><div class="meta">${shipSea(i)?'🚢 '+esc(shipStatus(i)):trn('hud_and_panels.auto_fix_in_n_day',i.until-S.day)}${i.impact?` · ${tr('hud_and_panels.g_lost',{g:fmtG(i.impact)})}`:''}</div>${i.cost?`<div class="btns">${btn(`${esc(i.fix||tr('common.rush_repair'))} ${fmt$(i.cost)}`,'fixInc',{id:i.id},'red sm',S.cash<i.cost)}</div>`:''}</div>`;}
    h+=logSection();UI.logSeen=Date.now();
    if(S.grace&&S.grace.until>S.day&&R.graceNets)h+=`<div class="kv"><span>${tr('common.courtesy_route')}</span><b>${tr('hud_and_panels.n_networks_d_days_left',{n:R.graceNets,d:S.grace.until-S.day})}</b></div><p class="meta" style="margin:0 0 6px">${tr('hud_and_panels.reaches_networks_from_the_last')}</p>`;
    const hot=S.links.filter(l=>!linkDown(l)&&capOf(l)>0&&(R.load[l.id]||0)/capOf(l)>=0.85).sort((a,b)=>(R.load[b.id]/capOf(b))-(R.load[a.id]/capOf(a)));
    if(hot.length){h+=`<h3 style="font-size:15px;margin:4px 0">${tr('common.congested_links')}${nocCnt(hot)}</h3>${S.te&&S.te.on?'':'<p class="meta" style="margin:0 0 4px">'+tr('hud_and_panels.raise_a_full_link_s_metric')+'</p>'}`+nocList('hot',hot,l=>`<div class="row"><div class="grow"><div class="nm">${CITY[l.a].name} ⇄ ${CITY[l.b].name}</div><div class="meta">${capName(l)} · ${tr('hud_and_panels.p_full',{p:pct((R.load[l.id]||0)/capOf(l))})}</div></div>${btn(tr('common.inspect'),'selLink',{id:l.id},'pink sm')}</div>`);}
    h+=hwCard();
    const slow=Object.keys(S.pops).filter(latSlow).sort((a,b)=>R.latF[a]-R.latF[b]);
    if(slow.length)h+=`<h3 style="font-size:15px;margin:4px 0">🐢 ${tr('common.slow_cities')}${nocCnt(slow)}</h3><p class="meta" style="margin:0 0 4px">${tr('hud_and_panels.their_users_go_out_through_transit')}</p>`+nocList('slow',slow,c=>{const f=R.latFar[c];return `<div class="row"><div class="grow"><div class="nm">${CITY[c].name} → ${CITY[f.to].name}</div><div class="meta">${tr('hud_and_panels.p_of_its_traffic_ms_ms',{p:pct(Math.min(1,f.share)),ms:Math.round(f.ms),sf:pct(R.latF[c])})}</div></div>${btn(tr('common.inspect'),'focusCity',{city:c},'ghost sm')}</div>`;});
    const hotR=hotPorts();
    if(hotR.length)h+=`<h3 style="font-size:15px;margin:4px 0">${tr('hud_and_panels.ports_caches_and_routers_running_hot')}${nocCnt(hotR)}</h3>`+nocList('ports',hotR,null,nocHot);
    if(!S.inc.length&&!hot.length&&!hotR.length&&!slow.length)h+=`<p class="empty">${tr('hud_and_panels.all_systems_green_enjoy_it_while')}</p>`;
    h+=`<div class="kv" style="margin-top:8px"><span>${tr('hud_and_panels.incidents_so_far')}</span><b>${S.stats.incidents}</b></div><div class="kv"><span>${tr('hud_and_panels.survived_with_no_impact')}</span><b>${S.stats.survived}</b></div>`;
  }else{
    h+=netsTab();
  }
  if(h!==UI._lh){UI._lh=h;morph($('leftBody'),h);}
  if(S.tut!=null)coachGlow();
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
  if(S.tut!=null)coachGlow();
}
