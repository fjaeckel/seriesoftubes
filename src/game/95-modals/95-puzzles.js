/* ---------- puzzles: the card, the panels, the link picker, the results and the list ---------- */
const PZ_ICON={goal:'🎯',via:'🪨',avoid:'🚫',off:'📍'};
function pzTwistTxt(t){if(t.k==='sub')return tr('puzzles.no_subsea_cables');return tr('puzzles.one_ring_through_every_pop');}
// The short version, for the puzzle list: what has to be carried, and the twists.
function pzDemTag(d){const t=[];const eye=d.dem.filter(f=>f.t==='eye'),l2=d.dem.filter(f=>f.t==='l2');
  if(eye.length)t.push(tr('puzzles.n_g_of_eyeballs',{n:fmtG(eye.reduce((a,f)=>a+f.g,0))}));if(l2.length)t.push(trn('puzzles.n_circuits',l2.length));
  if(d.dem.some(f=>f.ms))t.push(tr('puzzles.latency_caps'));if(d.noSub)t.push(tr('puzzles.no_subsea'));if(d.ring)t.push(tr('puzzles.ring'));if(d.avoid&&d.avoid.length)t.push(tr('puzzles.avoid_list',{list:d.avoid.map(c=>CITY[c].name).join(', ')}));return t;}
// A cable carrying several of your waves is named on its own: cutting it takes them all.
const pzUnitName=u=>{const ls=S.links.filter(x=>pzUnit(x)===u),l=ls[0];return !l?'':l.cable&&ls.length>1?esc(CAB[l.cable].name):`${CITY[l.a].name} ⇄ ${CITY[l.b].name}${l.cable?' ('+esc(CAB[l.cable].name)+')':''}`;};
// Each flow on the card: what it is, how much of it arrives, and a circuit's latency against its cap.
function pzFlowRow(x){const f=x.f,ok=x.full&&x.fast,u=f.g?Math.min(1,x.g/f.g):0;
  const lat=f.ms?` · <span class="${x.fast?'':'bad'}">${x.ms==null?tr('common.no_path'):x.ms.toFixed(1)+' ms'} / ${f.ms} ms</span>`:'';
  return `<div class="pzf${ok?' ok':''}"><div class="kv"><span>${f.t==='l2'?'🔗':'👀'} ${esc(pzFlowName(f))}${f.be?` <span class="tag st">${tr('puzzles.best_effort')}</span>`:''}</span><b>${fmtG(x.g)} / ${fmtG(f.g)}</b></div><div class="bar ${ok?'':u>=0.999?'warn':'bad'}"><i style="width:${(u*100).toFixed(1)}%"></i></div>${lat?`<div class="meta">${tr('puzzles.latency')}${lat}</div>`:''}${f.t==='l2'?pzRouteCtl(x.i):''}</div>`;}
// A circuit's path: the metrics, or the lowest latency.
function pzRouteCtl(i){const b=S.biz.find(x=>x.id===pzFlowId(i));if(!b)return '';return `<div class="seg pzrt">${['normal','fast'].map(m=>btn(RT[m],'pzRoute',{i,m},b.route===m?'pink sm':'ghost sm')).join('')}</div>`;}
function pzRender(){const el=$('pzBox');if(!pzOn()){el.hidden=true;return;}el.hidden=false;el.classList.toggle('ar',!!S.ar);if(S.ar){arRender(el);return;}
  const e=pzEval(),P=S.pz,d=pzDef(P.id),pk=d&&PZ_PACKS.find(x=>x.id===d.pack);
  const star=(on,l)=>`<span class="${on?'on':''}">⭐<small>${l}</small></span>`;
  let h=`<div class="grab" data-grab="pz" aria-hidden="true"></div><div class="pzh"><div class="grow"><div class="eyebrow">${pk?esc(pk.n):P.theme&&own(PZ_WK_THEMES,P.theme)?`${PZ_WK_THEMES[P.theme].i} ${tr('puzzles.weekly_puzzle')} · ${tr(PZ_WK_THEMES[P.theme].t)}`:tr('puzzles.weekly_puzzle')}</div><h3>${esc(pzName(d||P))}</h3></div>${btn('☰','puzzleMenu',{},'ghost sm')}</div>`;
  if(d)h+=`<p class="pzj">${esc(d.j)}</p>`;else if(P.wj)h+=`<p class="pzj">${esc(pzTxt(P.wj))}</p>`;
  h+=`<div class="pzs">${star(e.goal,tr('puzzles.delivered'))}${star(e.goal&&e.cheap,P.budget?tr('puzzles.budget'):tr('puzzles.free'))}${star(e.goal&&e.n1,'N-1')}</div>`;
  if(P.src.length)h+=`<div class="pzsrc">🗄️ ${tr('puzzles.content_lives_in_list',{list:P.src.map(c=>esc(CITY[c].name)).join(', ')})}</div>`;
  h+=`<div class="pzfl">${e.flows.map(pzFlowRow).join('')}</div>`;
  // Cities to avoid cannot be built in at all, so they read as a rule, not as a box to tick.
  for(const t of e.tw)h+=t.k==='avoid'?`<div class="pztw rule">🚫 ${tr('puzzles.rule_not_via_list',{list:P.avoid.map(c=>esc(CITY[c].name)).join(', ')})}</div>`:`<div class="pztw ${t.ok?'ok':''}">${t.ok?'✓':'✗'} ${pzTwistTxt(t)}</div>`;
  const sp=fmt$(e.spend);
  h+=P.budget?`<div class="pzbud"><div class="kv"><span>${tr('puzzles.spent_x_of_y',{x:sp,y:fmt$(P.budget)})}</span><b>${e.cheap?'✓':'✗'}</b></div><div class="bar ${e.cheap?(e.spend>P.budget*0.85?'warn':''):'bad'}"><i style="width:${Math.min(100,e.spend/P.budget*100).toFixed(1)}%"></i></div></div>`
    :`<div class="pzbud"><div class="kv"><span>${tr('puzzles.spent_x',{x:sp})}</span><b>${tr('puzzles.no_budget_star_on_the_house')}</b></div></div>`;
  const w=e.worst;
  h+=!e.goal?`<div class="pzn1">🛡 ${tr('puzzles.n_1_deliver_everything_first')}</div>`:e.n1?`<div class="pzn1 on">🛡 ${tr('puzzles.survives_any_single_cut_under_load')}</div>`
    :`<div class="pzn1 bad">⚠️ ${tr('puzzles.a_cut_on_where_drops_g',{where:pzUnitName(w.u),g:fmtG(w.g)})}<br><small>${w.lost.map(x=>esc(pzFlowName(P.dem[x.i]))).join(', ')}</small></div>`;
  if(UI.pzMk)h+=`<div class="btns">${btn('⏩ '+tr('puzzles.skip_the_monkey'),'pzMkSkip',{},'big')}</div>`;else if(e.goal)h+=`<div class="btns">${btn(tr('puzzles.let_the_chaos_monkey_loose'),'pzMonkey',{},'sm')}</div>`;
  h+=`<div class="btns">${btn('↶ '+tr('puzzles.undo'),'pzUndo',{},'ghost sm',!(UI.pzHist&&UI.pzHist.length))}${btn(tr('puzzles.reset'),'pzReset',{},'ghost sm',!S.links.length&&!Object.keys(S.pops).length)}${(UI.pzTop||0)>0&&(UI.pzTop||0)<3?btn(tr('puzzles.finish_here'),'pzFinish',{},'sm'):''}${btn(UI.pzFrom==='game'?tr('puzzles.back_to_my_network'):tr('puzzles.back_to_the_title'),'pzLeave',{},'ghost sm')}</div>`;
  if(h!==UI._pzh){UI._pzh=h;morph(el,h);}}
// Trenches on a pair get numbers, cables their names, so parallel links say where they run.
function pzTrench(l){if(l.cable)return esc(CAB[l.cable].name);const us=[...new Set(pairLinks(l.a,l.b).filter(x=>!x.cable).map(pzUnit))];return tr('puzzles.trench_n',{n:us.indexOf(pzUnit(l))+1});}
const pzLoadTxt=l=>`${fmtG(R.load[l.id]||0)} / ${fmtG(capOf(l))}`;
function pzPopSection(c){const p=S.pops[c],g=p.rgen||0,rt=p.routers||1,G=RG[g],cap=nodeCap(c),ld=R.nodeLoad[c]||0,u=cap?ld/cap:0,pu=portsUsed(c),pm=portsMax(c),cur=pzRtCost(g,rt);
  const dl=v=>(v>=0?'+':'−')+fmt$(Math.abs(v));
  let h=`<h3>${tr('puzzles.your_pop')}</h3><div class="kv"><span>${rt>1?rt+' × ':''}${esc(G.n)}</span><b>${tr('puzzles.price_per_year',{price:fmt$(cur)})}</b></div>
  <div class="kv"><span>${tr('puzzles.router_load')}</span><b>${fmtG(ld)} / ${fmtG(cap)}</b></div><div class="bar ${barCls(u)}"><i style="width:${Math.min(100,u*100).toFixed(1)}%"></i></div>
  <div class="kv"><span>${tr('puzzles.ports')}</span><b>${tr('puzzles.u_of_m_used',{u:fmtPorts(pu),m:pm})}</b></div><div class="kv"><span>${tr('puzzles.biggest_wave')}</span><b>${LT[G.maxLT].n}</b></div>
  <div class="btns">${btn(tr('puzzles.add_a_router_cost',{cost:dl(pzRtCost(g,rt+1)-cur)}),'pzRtAdd',{city:c},'sm',rt>=RMAX)}${rt>1?btn(tr('puzzles.remove_a_router'),'pzRtRm',{city:c},'ghost sm'):''}</div>
  <h4 class="sub4">${tr('puzzles.router_model')}</h4>`;
  h+=PZ_RG.map(i=>{const M=RG[i],why=i===g?'':modelFits(c,i);return `<div class="row${i===g?' on':''}"><div class="grow"><div class="nm">${esc(M.n)}${i===g?` <span class="tag st on">${tr('puzzles.installed')}</span>`:''}</div><div class="meta">${tr('puzzles.model_facts',{cap:fmtG(M.cap),ports:M.ports,wave:LT[M.maxLT].n})}</div>${why?`<div class="why">${esc(why)}</div>`:''}</div>${i===g?'':btn(dl(pzRtCost(i,rt)-cur),'pzRtModel',{city:c,g:i},'ghost sm',!!why)}</div>`;}).join('');
  return h;}
function pzPanel(sel){if(S.ar)return arPanel(sel);const head=(eb,name,facts)=>`<div class="ph"><div style="min-width:0"><div class="eyebrow">${eb}</div><h2>${name}</h2>${facts?`<div class="facts">${facts}</div>`:''}</div><button class="x" data-act="closePanel" aria-label="${tr('common.close')}">×</button></div>`;
  if(sel.type==='city'){const c=sel.id,k=pzKind(c),p=S.pops[c],C=CITY[c],P=S.pz;if(!k)return '';
    const eb=k==='goal'?tr('puzzles.goal_city'):k==='via'?tr('puzzles.stepping_stone_optional'):k==='off'?tr('puzzles.not_in_the_plan'):tr('puzzles.off_limits');
    let h=head(`${PZ_ICON[k]} ${eb}`,esc(C.name),p?`<span class="fact mine">${tr('common.your_pop')}</span>`:'')+'<div class="scroll">';
    if(k==='avoid')return h+`<p class="lead">${tr('puzzles.not_this_one_find_a_way_around')}</p></div>`;
    // What this city sends or asks for.
    const fl=P.dem.map((f,i)=>({f,i})).filter(({f})=>f.a===c||f.b===c),ev=pzEval();
    if(P.src.includes(c))h+=`<p class="lead">🗄️ ${tr('puzzles.the_content_origin_lives_here')}</p>`;
    if(fl.length)h+=`<div class="pzfl">${fl.map(({i})=>pzFlowRow(ev.flows[i])).join('')}</div>`;
    if(k==='off'&&!p)h+=`<p class="note">${tr('puzzles.no_traffic_starts_or_ends_here')}</p>`;
    if(!p)return h+`<p class="lead">${tr('puzzles.a_pop_costs_setup_plus_a_year',{setup:fmt$(popCost(c)),mo:fmt$(popMo(c))})}</p><div class="btns">${btn(tr('puzzles.open_a_pop_cost',{cost:fmt$(pzPopCost(c))}),'pzPop',{city:c},'pink big')}</div></div>`;
    h+=pzPopSection(c);
    // Every pair this POP has links on, with what each member carries, so a second link is never a guess.
    const nb=[...new Set(S.links.filter(l=>l.a===c||l.b===c).map(l=>l.a===c?l.b:l.a))];
    h+=`<h3 style="margin-top:10px">${tr('common.links')}</h3>`;
    if(!nb.length)h+=`<p class="note">${tr('puzzles.drag_from_this_pop_onto_another')}</p>`;
    for(const x of nb){const ls=pairLinks(c,x),ld=ls.reduce((a,l)=>a+(R.load[l.id]||0),0),cp=ls.filter(l=>!linkDown(l)).reduce((a,l)=>a+capOf(l),0);
      h+=`<div class="pzpair"><div class="kv"><span><b>${esc(CITY[x].name)}</b> · ${groupLabel(ls,ls)}</span><b>${fmtG(ld)} / ${fmtG(cp)}</b></div>${ls.map(l=>`<div class="row"><div class="grow"><div class="meta">${capName(l)} · ${pzTrench(l)}${l.standby?' · '+tr('common.standby'):''} · ${pzLoadTxt(l)} · ${linkLat(l).toFixed(1)} ms</div></div>${btn(tr('common.open'),'selLink',{id:l.id},'ghost sm')}</div>`).join('')}</div>`;}
    const others=[...P.cities,...P.via].filter(x=>x!==c);
    h+=`<h3 style="margin-top:10px">${tr('puzzles.lease_a_wave_to')}</h3><div class="seg">${others.map(x=>btn(esc(CITY[x].name),'pzLinkTo',{a:c,b:x},S.pops[x]?'':'ghost')).join('')}</div><p class="note">${tr('puzzles.or_drag_to_any_city_on_the_map')}</p>`;
    h+=`<div class="btns" style="margin-top:10px">${btn(tr('puzzles.remove_this_pop'),'pzRmPop',{city:c},'red sm')}</div>`;
    return h+'</div>';}
  const l=S.links.find(x=>x.id===sel.id);if(!l)return '';const pl=pairLinks(l.a,l.b);
  let h=head(l.cable?esc(CAB[l.cable].name):tr('common.overland'),`${esc(CITY[l.a].name)} ⇄ ${esc(CITY[l.b].name)}`,`<span class="fact">${capName(l)}</span><span class="fact">${l.km.toLocaleString()} km</span><span class="fact">${linkLat(l).toFixed(1)} ms</span><span class="fact">${tr('puzzles.price_per_year',{price:fmt$(l.mo*PZ_YEAR)})}</span>`)+'<div class="scroll">';
  // What it carries now: each circuit by name, the eyeball traffic by where it is going.
  {const rec=R.ef[edgeKey(l)],u=capOf(l)?(R.load[l.id]||0)/capOf(l):0;h+=`<div class="kv"><span>${tr('puzzles.this_link')}</span><b>${pzLoadTxt(l)}</b></div><div class="bar ${barCls(u)}"><i style="width:${Math.min(100,u*100).toFixed(1)}%"></i></div>`;
    if(rec){const rows=[];let l2=0;S.pz.dem.forEach((f,i)=>{const v=rec.eg['l2:'+pzFlowId(i)];if(v>0.01){rows.push([pzFlowName(f),v]);}});
      const byc={};for(const k in rec.dst)byc[k]=rec.dst[k];S.pz.dem.forEach((f,i)=>{const v=rec.eg['l2:'+pzFlowId(i)];if(v>0.01){byc[f.b]=(byc[f.b]||0)-v;l2+=v;}});
      for(const k in byc)if(byc[k]>0.01)rows.push([tr('puzzles.flow_eyeballs_in_city',{city:CITY[k].name}),byc[k]]);
      if(rows.length)h+=`<h4 class="sub4">${pl.length>1?tr('puzzles.carrying_on_this_pair',{n:pl.length}):tr('puzzles.carrying')}</h4>`+rows.map(([n,v])=>`<div class="kv"><span>${esc(n)}</span><b>${fmtG(v)}</b></div>`).join('');void l2;}}
  if(pl.length>1)h+=`<h4 class="sub4">${tr('puzzles.n_links_on_this_pair',{n:pl.length,what:groupLabel(pl,pl)})}</h4>`+pl.map(x=>`<div class="row${x===l?' on':''}"><div class="grow"><div class="meta">${capName(x)} · ${pzTrench(x)}${x.standby?' · '+tr('common.standby'):''} · ${pzLoadTxt(x)}</div></div>${x===l?'':btn(tr('common.open'),'selLink',{id:x.id},'ghost sm')}</div>`).join('');
  h+=`<h3>${tr('puzzles.size')}</h3><div class="seg">${PZ_TIERS.map(i=>{const r={km:l.km,sub:l.sub,f:l.mult||1},why=pzWaveWhy(l.a,l.b,i,r);return btn(`${LT[i].n} <small>${why?esc(why):tr('puzzles.price_per_year',{price:fmt$(pzMo(r,i,false)*PZ_YEAR)})}</small>`,'pzTier',{id:l.id,tier:i},l.tier===i?'pink':'ghost',!!why||l.tier===i);}).join('')}</div>`;
  h+=`<h4 class="sub4">${tr('puzzles.add_another_link_here')}</h4><div class="btns">${btn(l.cable?tr('puzzles.another_wave_on_this_cable'):tr('puzzles.same_trench_cheaper'),'pzAddPar',{id:l.id,div:0},'sm')}${btn(l.cable?tr('puzzles.a_different_route'):tr('puzzles.a_diverse_route'),'pzAddPar',{id:l.id,div:1},'pink sm')}</div>`;
  h+=metricSection(l)+linkCheckControl(l);
  return h+`<div class="btns" style="margin-top:10px">${btn(tr('puzzles.remove_this_link'),'pzRmLink',{id:l.id},'red sm')}</div></div>`;}
// The link picker: overland or one of the real cables between the two cities, and a size. Prices are for a year.
function pzLinkModal(a,b,keep){if(S.ar)return arLinkModal(a,b,keep);const kb=pzKind(b);
  if(!kb||kb==='avoid'||!pzKind(a)){toast(kb==='avoid'?tr('puzzles.not_this_one_find_a_way_around'):tr('puzzles.not_a_city_you_can_build_in'),'bad');sfx('err');return;}
  if(!keep){UI.pzVia=null;UI.pzDiv=true;UI.pzTrench=null;}UI.pending={a,b};const rs=pzRoutes(a,b),P=S.pz;
  const head=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${kmBetween(a,b).toLocaleString()} km</div><h2 style="font-size:26px">${esc(CITY[a].name)} → ${esc(CITY[b].name)}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  if(!rs.length){openModal(head+`<p class="lead" style="margin-top:10px">${tr('puzzles.no_cable_lands_in_both_try',{a:esc(CITY[a].name),b:esc(CITY[b].name)})}</p>`);return;}
  const r=rs.find(x=>x.via===UI.pzVia)||rs.find(x=>!(P.noSub&&x.sub))||rs[0];UI.pzVia=r.via;
  const pl=pairLinks(a,b),land=!r.sub&&pl.some(l=>!l.cable),div=land&&UI.pzDiv!==false,pop=S.pops[b]?0:pzPopCost(b);
  let h=head;
  if(pl.length)h+=`<p class="pzhave">${tr('puzzles.already_here_list',{list:groupLabel(pl,pl)+' · '+[...new Set(pl.map(pzTrench))].join(', ')})}</p>`;
  h+=`<h4 class="sub4">${tr('common.route')}</h4><div class="seg">${rs.map(x=>btn(`${x.cab?esc(CAB[x.cab].name):tr('common.overland')} <small>${x.ms.toFixed(1)} ms${pl.some(l=>(l.cable||'land')===x.via)?' · ✓':''}</small>`,'pzVia',{v:x.via},x.via===r.via?'pink':'ghost',P.noSub&&x.sub)).join('')}</div>`;
  if(P.noSub&&r.sub)h+=`<p class="why">${tr('puzzles.the_sharks_say_no')}</p>`;
  if(r.cab)h+=`<p class="note">${esc(CAB[r.cab].blurb)}${pl.some(l=>l.cable===r.cab)?' '+tr('puzzles.same_cable_same_anchor'):''}</p>`;
  if(land)h+=`<div class="seg" style="margin-top:8px">${btn(tr('puzzles.diverse_route_40_survives_the_monkey'),'pzDiv',{v:1},div?'pink':'ghost')}${btn(tr('puzzles.same_trench_cheaper_one_snip_cuts'),'pzDiv',{v:0},div?'ghost':'pink')}</div>`;
  if(pop)h+=`<p class="lead" style="margin-top:8px">${tr('puzzles.includes_a_new_pop_in_city',{city:esc(CITY[b].name),price:fmt$(pop)})}</p>`;
  const full=[a,b].filter(c=>!pzPortsFree(c));if(full.length)h+=`<p class="why">${tr('puzzles.no_free_ports_in_list',{list:full.map(c=>esc(CITY[c].name)).join(', ')})}</p>`;
  h+=`<div class="tiers">${PZ_TIERS.map(i=>{const why=pzWaveWhy(a,b,i,r),c=pzLinkCost(r,i,div)+pop;return `<button class="tierbtn" data-act="pzLink" data-args='{"tier":${i}}'${why||full.length||(P.noSub&&r.sub)?' disabled':''}><span class="sz">${LT[i].n}</span><span class="grow meta">${why?esc(why):pop?tr('puzzles.with_the_pop_price',{price:fmt$(c)}):''}</span><span class="pr num">${tr('puzzles.price_per_year',{price:fmt$(pzLinkCost(r,i,div))})}</span></button>`;}).join('')}</div>`;
  openModal(h);}
// ---------- results ----------
function pzLine(e){return e.stars>=3?tr('puzzles.a_chaos_monkey_walks_into_your_network'):!e.n1&&!e.cheap?tr('puzzles.it_works_finance_and_the_monkey'):!e.n1?tr('puzzles.one_monkey_away_from_a_very'):tr('puzzles.rock_solid_and_gold_plated_the');}
// Stars still to win in this puzzle's pack, from the progress just saved.
function pzPackLeft(P){const d=pzDef(P.id);if(!d)return null;const p=pzLoad(),xs=PZ.filter(x=>x.pack===d.pack);return xs.length*3-xs.reduce((a,x)=>a+((p.s[x.id]||{}).st|0),0);}
function pzConfetti(){if(!animOn())return '';const cols=['#FF4F9A','#FFD23F','#22C47A','#2F8CFF','#FF8A3D','#7B61FF'];let h='';
  for(let i=0;i<28;i++)h+=`<i style="--x:${(i*37)%100}%;--c:${cols[i%cols.length]};--r:${(i%2?1:-1)*(180+(i*53)%360)}deg;--t:${1.4+(i%5)*0.25}s;--dl:${((i*7)%10)/10}s"></i>`;
  return `<div class="pzconf" aria-hidden="true">${h}</div>`;}
function pzResults(e,prev){const P=S.pz,nx=P.id==='weekly'?null:pzNextDef(),left=pzPackLeft(P),done=e.stars>=3;
  const row=(ok,l,v)=>`<div class="kv"><span>${ok?'⭐':'☆'} ${l}</span><b>${v}</b></div>`;
  const stars=[0,1,2].map(i=>`<span class="pzbig${i<e.stars?' on':''}${i>=prev&&i<e.stars?' pop':''}" style="--d:${Math.max(0,i-prev)*0.45}s">⭐</span>`).join('');
  openModal(`<div class="pzres">${e.stars>=3?pzConfetti():''}<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">${done?tr('puzzles.puzzle_solved'):tr('puzzles.your_stars_so_far')}</div><h2 style="font-size:28px">${esc(pzName(pzDef(P.id)||P))}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <div class="pzstars">${stars}</div><p class="tagline" style="text-align:center">${pzLine(e)}</p>${left==null?'':`<p class="pzleft">${left?trn('puzzles.n_stars_left_in_this_pack',left):tr('puzzles.every_star_in_this_pack_is')}</p>`}
  ${row(true,tr('puzzles.delivered'),tr('puzzles.every_bit_arrives'))}${row(e.cheap,tr('puzzles.budget'),P.budget?tr('puzzles.spent_x_of_y',{x:fmt$(e.spend),y:fmt$(P.budget)}):tr('puzzles.on_the_house'))}${row(e.n1,'N-1',e.n1?tr('puzzles.survives_any_single_cut_under_load'):tr('puzzles.a_cut_on_where_drops_g',{where:pzUnitName(e.worst.u),g:fmtG(e.worst.g)}))}
  <div class="btns cta${done?' pzdone':''}" style="margin-top:12px">${nx?btn(tr('puzzles.next_puzzle')+(done?' →':''),'pzStart',{id:nx.id},'pink big pznext'):btn(tr('puzzles.more_puzzles'),'puzzleMenu',{},'pink big pznext')}${!done?btn(tr('puzzles.retry_for_3_stars'),'pzRetry',{},''):''}${btn(tr('common.share_2cd9'),'pzShare',{},done?'ghost':'')}${btn(tr('puzzles.keep_building'),'closeModal',{},'ghost')}</div></div>`);
  // Three stars: Next is the one big obvious tap (and the keyboard's default).
  if(done){const b=document.querySelector('#modalCard .pznext');if(b)try{b.focus({preventScroll:true});}catch(_){}}
  for(let i=prev;i<e.stars;i++)setTimeout(()=>{sfx('star');haptic(15);},Math.max(0,i-prev)*450+150);
  if(e.stars>=3&&prev<3)setTimeout(()=>sfx('fanfare'),(3-prev)*450+250);}
function pzCheer(e,prev){toast(`${'⭐'.repeat(e.stars)}${'☆'.repeat(3-e.stars)}<br>${pzLine(e)}`,'goal');for(let i=prev;i<e.stars;i++)setTimeout(()=>{sfx('star');haptic(15);},(i-prev)*450+150);}
// ---------- the list ----------
// The weekly row: the published puzzle once it has come (or the seeded one), its countdown and the streak.
function pzWkRow(){const p=pzLoad(),w=pzWkDef(),wr=pzWkRec(p,w),st=p.streak,streak=st.last===w.key||st.last===pzPrevKey(w.key)?st.n:0,T=PZ_WK_THEMES[w.theme],load=pzWkLoading(),tg=pzDemTag(w);
  return `<div class="scn wk" id="pzWk"><div class="grow"><div class="eyebrow">📅 ${tr('puzzles.weekly_puzzle_key',{key:esc(w.key)})}${wr?'':` <span class="pznew">${tr('puzzles.new_this_sunday')}</span>`}</div>
  <div class="nm">${load?tr('puzzles.loading_this_week_s_puzzle'):`${T?T.i+' ':''}${esc(pzName(w))}`} ${wr?`<span class="pzst">${pzStarStr(wr.st)}</span>`:''}</div>${w.wj?`<div class="meta">${esc(pzTxt(w.wj))}</div>`:''}
  <div class="meta">${pzCities(w).map(c=>esc(CITY[c].name)).join(' · ')} · ${tr('puzzles.budget_x',{x:fmt$(w.budget)})}${tg.length?' · <b>'+tg.join(' · ')+'</b>':''}${wr&&wr.sp!=null?' · '+tr('puzzles.best_x',{x:fmt$(wr.sp)}):''}</div>
  <div class="meta">${tr('puzzles.same_puzzle_for_everyone_this_week')}${streak?' · 🔥 '+trn('puzzles.n_week_streak',streak):''}</div><div class="meta pzcd">⏳ ${pzWkNext(Date.now())}</div></div>${btn(tr('common.play'),'pzWeekly',{},wr&&wr.st>=3?'ghost':'pink',load)}</div>`;}
function pzMenu(){pzWkEnsure();const p=pzLoad(),tot=pzStarsTotal(p),max=PZ.length*3,nxP=PZ_PACKS.find(x=>x.need>tot);
  let h=`<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">${tr('puzzles.puzzles')}</div><h2 style="font-size:28px">${tr('puzzles.small_networks_real_traffic')}</h2></div><button class="x" data-act="helpClose" aria-label="${tr('common.close')}">×</button></div>
  <p class="tagline">${tr('puzzles.no_clock_no_bills_real_traffic')}</p>`;
  // Once, after the puzzles got traffic: the old stars are kept on the wall, the new set starts at zero.
  if(p.old&&!p.noted){h+=`<div class="pznote">🖼️ ${tr('puzzles.puzzles_got_traffic_note',{n:p.old})}</div>`;p.noted=1;pzStore(p);}
  if(pzOn())h+=`<div class="btns" style="margin:8px 0">${(UI.pzTop||0)>0&&(UI.pzTop||0)<3?btn(tr('puzzles.finish_here'),'pzFinish',{},'sm'):''}${btn(UI.pzFrom==='game'?tr('puzzles.back_to_my_network'):tr('puzzles.back_to_the_title'),'pzLeave',{},'')}${btn(tr('puzzles.keep_building'),'closeModal',{},'ghost')}</div>`;
  h+=arMenuRows();
  h+=pzWkRow();
  // The packs' own total, right above them: it is what unlocks the next pack (#231). Runs and weeklies count their own.
  h+=`<div class="pzprog"><div class="kv"><span>${tr('puzzles.stars_from_the_packs')}</span><b>⭐ ${tot} / ${max}</b></div><div class="bar me"><i style="width:${(tot/max*100).toFixed(1)}%"></i></div>${nxP?`<div class="meta">${tr('puzzles.next_pack_unlocks_at_n',{n:nxP.need,pack:esc(nxP.n)})}</div>`:''}${p.old?`<div class="meta">🖼️ ${tr('puzzles.framed_n_stars_from_the_old',{n:p.old})}</div>`:''}</div>`;
  for(const pk of PZ_PACKS){const open=tot>=pk.need,got=PZ.filter(x=>x.pack===pk.id).reduce((a,x)=>a+((p.s[x.id]||{}).st|0),0),n=PZ.filter(x=>x.pack===pk.id).length;
    h+=`<h3 class="pzpack">${open?'':'🔒 '}${esc(pk.n)} <span class="meta">⭐ ${got}/${n*3}</span></h3><p class="meta" style="margin:0 0 2px">${open?esc(pk.d):tr('puzzles.unlocks_at_n_stars',{n:pk.need})}</p>`;
    for(const d of PZ.filter(x=>x.pack===pk.id)){const r=p.s[d.id],tg=pzDemTag(d);
      h+=`<div class="scn${open?'':' lock'}"><div class="grow"><div class="nm">${esc(d.n)} <span class="pzst">${pzStarStr(r?r.st:0)}</span></div><div class="meta">${esc(d.j)}</div><div class="meta">${pzCities(d).map(c=>esc(CITY[c].name)).join(' · ')} · ${d.budget?tr('puzzles.budget_x',{x:fmt$(d.budget)}):tr('puzzles.no_budget')}${tg.length?' · <b>'+tg.join(' · ')+'</b>':''}${r&&r.sp!=null?' · '+tr('puzzles.best_x',{x:fmt$(r.sp)}):''}</div></div>${btn(tr('common.play'),'pzStart',{id:d.id},r&&r.st>=3?'ghost':'',!open)}</div>`;}}
  openModal(h);}
