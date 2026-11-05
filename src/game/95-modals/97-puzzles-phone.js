/* ---------- puzzles on a phone: fixed overlays that never scroll ----------
   A bar pinned at the top says how the puzzle stands (its name, the three stars, the money, undo and the menu), the one
   thing to do next and what each flow gets, as chips. A city or a link opens a card at the bottom whose content is
   split into tabs, so each tab fits on the screen. Desktop keeps the side card (pzRender, pzPanel). */
// A rate in a few characters, for the chips: 30G, 2.5G, 1.2T.
const pzG=g=>g>=1000?(g/1000).toFixed(g>=10000?0:1)+'T':g>=10||g===0?Math.round(g)+'G':g.toFixed(1)+'G';
// One flow as a chip: what it is, how much of it arrives, a circuit's latency against its cap. Tapping it shows the city.
function pzFlowChip(x){const f=x.f,ok=x.full&&x.fast,part=x.g>0&&!ok;
  const lat=f.ms?` · <span class="${x.fast?'':'bad'}">${x.ms==null?'—':x.ms.toFixed(1)}/${f.ms} ms</span>`:'';
  return `<button class="pzd-chip${ok?' ok':part?' part':' none'}" data-act="pzCity" data-args='${JSON.stringify({c:f.a})}'>${f.t==='l2'?'🔗':'👀'} ${esc(f.t==='l2'?pzFlowName(f):CITY[f.a].name)} <b>${pzG(x.g)}/${pzG(f.g)}</b>${lat}</button>`;}
// The rules of this puzzle as chips: the content's home, the cities to avoid, no subsea cables, the ring.
function pzRuleChips(e){const P=S.pz;let h='';
  if(P.src.length)h+=`<span class="pzd-chip rule">🗄️ ${P.src.map(c=>esc(CITY[c].name)).join(', ')}</span>`;
  for(const t of e.tw)h+=t.k==='avoid'?`<span class="pzd-chip rule">🚫 ${P.avoid.map(c=>esc(CITY[c].name)).join(', ')}</span>`:`<span class="pzd-chip ${t.ok?'ok':'none'}">${t.ok?'✓':'✗'} ${pzTwistTxt(t)}</span>`;
  return h;}
function pzDock(el,e){const P=S.pz,d=pzDef(P.id),gs=pzGoals(e),cur=gs.find(g=>g.cur);UI.pzMark=!UI.pzMk&&cur&&cur.mark||null;
  const stars=gs.map((g,i)=>`<span class="pzd-st${g.done?' on':g.cur?' cur':''}" title="${esc(g.t)}">${g.done?'⭐':i+1}</span>`).join('');
  const bud=P.budget?`<span class="pzd-bud${e.goal&&!e.cheap?' bad':''}">${fmt$(e.spend)} / ${fmt$(P.budget)}</span>`:`<span class="pzd-bud">${tr('puzzles.free')}</span>`;
  let h=`<div class="pzd-bar"><b class="pzd-nm">${esc(pzName(d||P))}</b><span class="pzd-stars" aria-label="${tr('puzzles.your_stars_so_far')}">${stars}</span>${bud}`
    +`<button class="b ghost sm" data-act="pzUndo" data-args="{}" aria-label="${esc(tr('puzzles.undo'))}" title="${esc(tr('puzzles.undo'))}"${UI.pzHist&&UI.pzHist.length?'':' disabled'}>↶</button>${btn('☰','puzzleMenu',{},'ghost sm')}</div>`;
  // The one thing to do: the goal being worked on, what is wrong and Show me; the monkey once the traffic arrives.
  const act=UI.pzMk?btn('⏩ '+tr('puzzles.skip_the_monkey'),'pzMkSkip',{},'sm'):e.goal?btn('🐒 '+tr('puzzles.let_the_chaos_monkey_loose'),'pzMonkey',{},'ghost sm'):'';
  if(cur)h+=`<div class="pzd-goal"><span class="pzd-gi">👉</span><div class="pzd-gt"><b>${cur.t}</b>${cur.hint?` <span>${cur.hint}</span>`:''}</div><div class="pzd-ga">${cur.look?btn(tr('puzzles.show_me'),'pzLook',cur.look,'sm pzshow'):''}${act}</div></div>`;
  else h+=`<div class="pzd-goal done"><span class="pzd-gi">🛡</span><div class="pzd-gt"><b>${tr('puzzles.survives_any_single_cut_under_load')}</b></div><div class="pzd-ga">${act}</div></div>`;
  h+=`<div class="pzd-chips">${e.flows.map(pzFlowChip).join('')}${pzRuleChips(e)}</div>`;
  if(h!==UI._pzh){UI._pzh=h;morph(el,h);}}
// The bar's height, for what must sit under it (toasts) or stop short of it (the card): it changes with its content and
// when a card opens, so it is watched rather than measured after each render.
try{new ResizeObserver(()=>{const H=$('pzBox').offsetHeight||0;document.documentElement.style.setProperty('--pzdock',H+'px');}).observe($('pzBox'));}catch(e){}
// An architect run on a phone: the same bar. The brief, its sites and rules as chips, and the review with its one button.
function arDock(el){const A=S.ar,run=arRun(),b=arBrief(),e=arEval(),sh=UI.arShow,f=UI.arFail,n=run.briefs.length,nm=c=>esc(CITY[c].name),T=e.tubes;
  let h=`<div class="pzd-bar"><b class="pzd-nm">🏗️ ${tr('architect.brief_n_of_m',{n:A.bi+1,m:n})}</b><span class="pzd-bud${e.cheap?'':' bad'}">${fmt$(e.spend)} / ${fmt$(e.budget)} ${e.cheap?'⭐':'☆'}</span>`
    +`<button class="b ghost sm" data-act="pzUndo" data-args="{}" aria-label="${esc(tr('puzzles.undo'))}" title="${esc(tr('puzzles.undo'))}"${!sh&&UI.pzHist&&UI.pzHist.length?'':' disabled'}>↶</button>${btn('☰','puzzleMenu',{},'ghost sm')}</div>`;
  h+=`<div class="arsteps">${run.briefs.map((x,i)=>`<i class="${i<A.bi||(i===A.bi&&e.passed)?'done':i===A.bi?'on':''}"></i>`).join('')}</div><p class="arbrief">${esc(b.t)}</p>`;
  let ch=e.sites.map(s=>`<span class="arsite${s.ok&&s.full?' ok':''}${s.ok&&!s.full?' thin':''}${s.gold?' gold':''}">${s.hq?'🏠':s.gold?'🚨':s.ok?'✓':'○'} ${nm(s.c)}${s.hq?'':` <small>${s.ok&&!s.full?arG(s.got)+'/':''}${arG(s.dem)}</small>`}</span>`).join('');
  for(const r of e.rings)ch+=`<span class="pzd-chip ${r.ok?'ok':'none'}">💍 ${r.cs.map(nm).join(' · ')}</span>`;
  if(e.lat)ch+=`<span class="pzd-chip ${e.lat.ok?'ok':'none'}">⏱ ${e.lat.ms==null?'—':e.lat.ms.toFixed(1)}/${e.lat.cap} ms</span>`;
  for(const c of S.pz.avoid)ch+=`<span class="pzd-chip ${S.pops[c]?'none':'rule'}">🚫 ${nm(c)}</span>`;
  if(T.max!=null)ch+=`<span class="pzd-chip${T.over?' part':' rule'}">${tr('architect.tubes_this_brief')} <b>${T.u}/${T.max}</b></span>`;
  h+=`<div class="pzd-chips">${ch}</div>`;
  const rev=sh?`🐒 ${tr('architect.cut_n_of_m',{n:sh.i+1,m:sh.units.length})}${sh.dark.length?' · '+sh.dark.map(nm).join(', '):''}`:f?`💥 ${f.gold.length?tr('architect.cut_on_x_cuts_off_y',{x:pzUnitName(f.u),y:f.gold.map(nm).join(', ')}):tr('architect.cut_on_x_no_room',{x:pzUnitName(f.u),y:f.short.map(nm).join(', ')})}`
    :e.passed?`✅ ${tr('architect.review_passed')}`:!e.ready?esc(e.why):A.gold.length?tr('architect.ready_send_the_backhoe'):tr('architect.ready_no_gold_yet');
  const main=sh?btn('⏩ '+tr('architect.skip'),'pzArSkip',{},'sm'):e.passed?btn(arLast()?tr('architect.finish_the_run')+' 🎉':tr('architect.next_brief')+' →','pzArNext',{},'pink sm'):btn('▶ '+tr('architect.send_the_backhoe'),'pzArGo',{},'pink sm',!e.ready);
  h+=`<div class="pzd-goal${sh?'':f?' bad':e.passed?' done':''}"><div class="pzd-gt">${rev}${A.gold.length&&!sh&&!f&&!e.passed?`<br><small>🚨 ${tr('architect.gold_must_survive',{list:A.gold.map(nm).join(', ')})}</small>`:''}</div><div class="pzd-ga">${main}</div></div>`;
  if(h!==UI._pzh){UI._pzh=h;morph(el,h);}}
// The tabs of a card; the one shown is kept per kind of card (city or link) while the puzzle runs.
const pzTabs=(kind,tabs,cur)=>`<nav class="pzd-tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${k===cur}" class="${k===cur?'on':''}" data-act="pzTab" data-args='${JSON.stringify({k:kind,t:k})}'>${l}</button>`).join('')}</nav>`;
const pzTabOf=(kind,tabs,def)=>{const t=(UI.pzTab||{})[kind];return tabs.some(([k])=>k===t)?t:def;};
// The card's head in two short lines: what it is (and whether it is yours) above the name, the facts beside the name.
const pzHead=(eb,name,facts)=>`<div class="ph pzd-ph"><div class="grow"><div class="eyebrow">${eb}</div><h2>${name}${facts?` <small>${facts}</small>`:''}</h2></div><button class="x" data-act="closePanel" aria-label="${tr('common.close')}">×</button></div>`;
function pzPanelPhone(sel){
  if(sel.type==='city'){const c=sel.id,k=pzKind(c),p=S.pops[c],C=CITY[c],P=S.pz;if(!k)return '';
    const eb=k==='goal'?tr('puzzles.goal_city'):k==='via'?tr('puzzles.stepping_stone_optional'):k==='off'?tr('puzzles.not_in_the_plan'):tr('puzzles.off_limits');
    let h=pzHead(`${PZ_ICON[k]} ${eb}${p?` · <span class="mine">${tr('common.your_pop')}</span>`:''}`,esc(C.name),'')+'<div class="pzd-body">';
    if(k==='avoid')return h+`<p class="lead">${tr('puzzles.not_this_one_find_a_way_around')}</p></div>`;
    const ev=pzEval(),fl=ev.flows.filter(x=>x.f.a===c||x.f.b===c);
    const chips=fl.length||P.src.includes(c)?`<div class="pzd-chips">${P.src.includes(c)?`<span class="pzd-chip rule">🗄️ ${tr('puzzles.the_content_origin_lives_here')}</span>`:''}${fl.map(pzFlowChip).join('')}</div>`:'';
    if(!p)return h+chips+(k==='off'?`<p class="note">${tr('puzzles.no_traffic_starts_or_ends_here')}</p>`:'')+`<div class="btns">${btn(tr('puzzles.open_a_pop_cost',{cost:fmt$(pzPopCost(c))}),'pzPop',{city:c},'pink big')}</div><p class="note">${tr('puzzles.a_pop_costs_setup_plus_a_year',{setup:fmt$(popCost(c)),mo:fmt$(popMo(c))})}</p></div>`;
    const nb=[...new Set(S.links.filter(l=>l.a===c||l.b===c).map(l=>l.a===c?l.b:l.a))];
    const tabs=[['links',tr('common.links')],['router',tr('puzzles.router_model')]];if(fl.length)tabs.push(['traffic',tr('puzzles.carrying')]);
    const t=pzTabOf('city',tabs,'links');h+=pzTabs('city',tabs,t);
    if(t==='links'){
      if(!nb.length)h+=`<p class="note">${tr('puzzles.drag_from_this_pop_onto_another')}</p>`;
      for(const x of nb){const ls=pairLinks(c,x),ld=ls.reduce((a,l)=>a+(R.load[l.id]||0),0),cp=ls.filter(l=>!linkDown(l)).reduce((a,l)=>a+capOf(l),0);
        h+=`<div class="pzd-row"><div class="grow"><b>→ ${esc(CITY[x].name)}</b> <span class="meta">${groupLabel(ls,ls)} · ${pzG(ld)}/${pzG(cp)}</span></div>${btn(tr('common.open'),'selLink',{id:ls[0].id},'ghost sm')}</div>`;}
      const others=[...P.cities,...P.via].filter(x=>x!==c);
      h+=`<h4 class="sub4">${tr('puzzles.lease_a_wave_to')}</h4><div class="seg pzd-to">${others.map(x=>btn(esc(CITY[x].name),'pzLinkTo',{a:c,b:x},S.pops[x]?'':'ghost')).join('')}</div>`;
      h+=`<div class="btns pzd-foot">${btn(tr('puzzles.remove_this_pop'),'pzRmPop',{city:c},'red sm')}</div>`;}
    else if(t==='router'){const g=p.rgen||0,rt=p.routers||1,G=RG[g],cap=nodeCap(c),ld=R.nodeLoad[c]||0,u=cap?ld/cap:0,cur=pzRtCost(g,rt),dl=v=>(v>=0?'+':'−')+fmt$(Math.abs(v));
      h+=`<div class="kv"><span>${rt>1?rt+' × ':''}${esc(G.n)} · ${tr('puzzles.u_of_m_used',{u:fmtPorts(portsUsed(c)),m:portsMax(c)})}</span><b>${pzG(ld)}/${pzG(cap)}</b></div><div class="bar ${barCls(u)}"><i style="width:${Math.min(100,u*100).toFixed(1)}%"></i></div>`;
      h+=`<div class="btns pzd-rt">${btn(tr('puzzles.add_a_router_cost',{cost:dl(pzRtCost(g,rt+1)-cur)}),'pzRtAdd',{city:c},'sm',rt>=RMAX)}${rt>1?btn(tr('puzzles.remove_a_router'),'pzRtRm',{city:c},'ghost sm'):''}</div>`;
      // Every model at once, two to a row: what it can do, or why it does not fit; its price against the installed one.
      h+=`<div class="pzd-models">${PZ_RG.map(i=>{const M=RG[i],why=i===g?'':modelFits(c,i);
        return `<button class="pzd-model${i===g?' on':''}" data-act="pzRtModel" data-args='${JSON.stringify({city:c,g:i})}'${i===g||why?' disabled':''}><span class="pzd-mh"><b>${esc(M.n)}</b><span>${i===g?'✓':dl(pzRtCost(i,rt)-cur)}</span></span><small>${why?esc(why):`${pzG(M.cap)} · 🔌${M.ports} · ≤${LT[M.maxLT].n}`}</small></button>`;}).join('')}</div>`;}
    else{if(P.src.includes(c))h+=`<p class="note">🗄️ ${tr('puzzles.the_content_origin_lives_here')}</p>`;h+=`<div class="pzfl">${fl.map(x=>pzFlowRow(x)).join('')}</div>`;}
    return h+'</div>';}
  const l=S.links.find(x=>x.id===sel.id);if(!l)return '';const pl=pairLinks(l.a,l.b);
  let h=pzHead(l.cable?esc(CAB[l.cable].name):tr('common.overland'),`${esc(CITY[l.a].name)} ⇄ ${esc(CITY[l.b].name)}`,`${capName(l)} · ${l.km.toLocaleString()} km · ${linkLat(l).toFixed(1)} ms · ${tr('puzzles.price_per_year',{price:fmt$(l.mo*PZ_YEAR)})}`)+'<div class="pzd-body">';
  const u=capOf(l)?(R.load[l.id]||0)/capOf(l):0;
  h+=`<div class="kv"><span>${tr('puzzles.this_link')}</span><b>${pzLoadTxt(l)}</b></div><div class="bar ${barCls(u)}"><i style="width:${Math.min(100,u*100).toFixed(1)}%"></i></div>`;
  const tabs=[['size',tr('puzzles.size')],['traffic',tr('puzzles.carrying')],['routing',tr('common.routing_metric')]],t=pzTabOf('link',tabs,'size');h+=pzTabs('link',tabs,t);
  if(t==='size'){
    h+=`<div class="pzd-tiers">${PZ_TIERS.map(i=>{const r={km:l.km,sub:l.sub,f:l.mult||1},why=pzWaveWhy(l.a,l.b,i,r);return btn(`${LT[i].n} <small>${why?esc(why):tr('puzzles.price_per_year',{price:fmt$(pzMo(r,i,false)*PZ_YEAR)})}</small>`,'pzTier',{id:l.id,tier:i},l.tier===i?'pink':'ghost',!!why||l.tier===i);}).join('')}</div>`;
    h+=`<h4 class="sub4">${tr('puzzles.add_another_link_here')}</h4><div class="btns">${btn(l.cable?tr('puzzles.another_wave_on_this_cable'):tr('puzzles.same_trench_cheaper'),'pzAddPar',{id:l.id,div:0},'sm')}${btn(l.cable?tr('puzzles.a_different_route'):tr('puzzles.a_diverse_route'),'pzAddPar',{id:l.id,div:1},'pink sm')}</div>`;
    h+=`<div class="btns pzd-foot">${btn(tr('puzzles.remove_this_link'),'pzRmLink',{id:l.id},'red sm')}</div>`;}
  else if(t==='traffic'){const rec=R.ef[edgeKey(l)],rows=[];
    if(rec){S.pz.dem.forEach((f,i)=>{const v=rec.eg['l2:'+pzFlowId(i)];if(v>0.01)rows.push([pzFlowName(f),v]);});
      const byc={};for(const k in rec.dst)byc[k]=rec.dst[k];S.pz.dem.forEach((f,i)=>{const v=rec.eg['l2:'+pzFlowId(i)];if(v>0.01)byc[f.b]=(byc[f.b]||0)-v;});
      for(const k in byc)if(byc[k]>0.01)rows.push([tr('puzzles.flow_eyeballs_in_city',{city:CITY[k].name}),byc[k]]);}
    h+=rows.length?rows.map(([n,v])=>`<div class="kv"><span>${esc(n)}</span><b>${fmtG(v)}</b></div>`).join(''):`<p class="note">—</p>`;
    if(pl.length>1)h+=`<h4 class="sub4">${tr('puzzles.n_links_on_this_pair',{n:pl.length,what:groupLabel(pl,pl)})}</h4>`+pl.map(x=>`<div class="pzd-row${x===l?' on':''}"><div class="grow meta">${capName(x)} · ${pzTrench(x)}${x.standby?' · '+tr('common.standby'):''} · ${pzLoadTxt(x)}</div>${x===l?'':btn(tr('common.open'),'selLink',{id:x.id},'ghost sm')}</div>`).join('');}
  else h+=`<div class="pzd-routing">${metricSection(l)}${linkCheckControl(l)}</div>`;
  return h+'</div>';}
// A phone turned or a window resized can switch between the two layouts: draw the puzzle again in the one that fits.
addEventListener('resize',()=>{if(!S||!pzOn())return;const ph=isPhone();if(ph===UI._pzPhone)return;UI._pzh=null;UI._ph=null;pzRender();renderPanel();});
