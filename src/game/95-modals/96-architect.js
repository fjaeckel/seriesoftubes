/* ---------- architect runs (prototype): the card, the panels, the link picker, the results and the list rows ---------- */
const arDarkNow=c=>!!((UI.arShow&&UI.arShow.dark.includes(c))||(UI.arFail&&UI.arFail.dark.includes(c)));
const arHide=c=>arOn()&&!arKind(c);
function arRender(el){const A=S.ar,run=arRun(),b=arBrief(),e=arEval(),sh=UI.arShow,f=UI.arFail,n=run.briefs.length,nm=c=>esc(CITY[c].name);
  let h=`<div class="grab" data-grab="pz" aria-hidden="true"></div><div class="pzh"><div class="grow"><div class="eyebrow">🏗️ ${esc(run.n)}</div><h3>${tr('architect.brief_n_of_m',{n:A.bi+1,m:n})}</h3></div>${btn('☰','puzzleMenu',{},'ghost sm')}</div>`;
  h+=`<div class="arsteps">${run.briefs.map((x,i)=>`<i class="${i<A.bi||(i===A.bi&&e.passed)?'done':i===A.bi?'on':''}"></i>`).join('')}</div>`;
  h+=`<p class="arbrief">${esc(b.t)}</p>`;
  h+=`<div class="arsites">${e.sites.map(s=>`<span class="arsite${s.ok&&s.full?' ok':''}${s.ok&&!s.full?' thin':''}${s.gold?' gold':''}">${s.hq?'🏠':s.gold?'🚨':s.ok?'✓':'○'} ${nm(s.c)}${s.hq?'':` <small>${s.ok&&!s.full?arG(s.got)+'/':''}${arG(s.dem)}</small>`}</span>`).join('')}</div>`;
  if(A.gold.length)h+=`<div class="arline">🚨 ${tr('architect.gold_must_survive',{list:A.gold.map(nm).join(', ')})}</div>`;
  for(const r of e.rings)h+=`<div class="arline ${r.ok?'ok':'bad'}">💍 ${tr('architect.ring_list',{list:r.cs.map(nm).join(' · ')})} ${r.ok?'✓':''}</div>`;
  if(e.lat)h+=`<div class="arline ${e.lat.ok?'ok':'bad'}">⏱ ${nm(e.lat.a)} ⇄ ${nm(e.lat.b)}: ${e.lat.ms==null?tr('common.no_path'):e.lat.ms.toFixed(1)+' ms'} / ${e.lat.cap} ms</div>`;
  for(const c of S.pz.avoid)h+=`<div class="arline ${S.pops[c]?'bad':'ok'}">🚫 ${tr('architect.closed_city',{city:nm(c)})}</div>`;
  const T=e.tubes;if(T.max!=null)h+=`<div class="artubes${T.over?' over':''}"><span>${tr('architect.tubes_this_brief')}</span><b>${'●'.repeat(Math.min(T.u,T.max))}${'○'.repeat(Math.max(0,T.max-T.u))}${T.over?` <em>${tr('architect.n_over_plan',{n:T.over})}</em>`:''}</b></div>`;
  h+=`<div class="pzbud"><div class="kv"><span>${tr('architect.spent_x_of_y',{x:fmt$(e.spend),y:fmt$(e.budget)})}</span><b>${e.cheap?'⭐':'☆'}</b></div><div class="bar ${e.cheap?(e.spend>e.budget*0.9?'warn':''):'bad'}"><i style="width:${Math.min(100,e.spend/e.budget*100).toFixed(1)}%"></i></div>${A.sunk?`<div class="meta">${tr('architect.x_paid_for_and_gone',{x:fmt$(A.sunk)})}</div>`:''}</div>`;
  if(sh)h+=`<div class="arrev on">🐒 ${tr('architect.cut_n_of_m',{n:sh.i+1,m:sh.units.length})}${sh.dark.length?`<br><small>${tr('architect.dark_list',{list:sh.dark.map(nm).join(', ')})}</small>`:''}</div>`;
  else if(f)h+=`<div class="arrev bad">💥 ${f.gold.length?tr('architect.cut_on_x_cuts_off_y',{x:pzUnitName(f.u),y:f.gold.map(nm).join(', ')}):tr('architect.cut_on_x_no_room',{x:pzUnitName(f.u),y:f.short.map(nm).join(', ')})}<br><small>${tr('architect.fix_it_and_send_it_again')}</small></div>`;
  else if(e.passed)h+=`<div class="arrev ok">✅ ${tr('architect.review_passed')}</div>`;
  else if(!e.ready)h+=`<div class="arrev">${esc(e.why)}</div>`;
  else h+=`<div class="arrev">${A.gold.length?tr('architect.ready_send_the_backhoe'):tr('architect.ready_no_gold_yet')}</div>`;
  const main=sh?btn('⏩ '+tr('architect.skip'),'pzArSkip',{},'big'):e.passed?btn(arLast()?tr('architect.finish_the_run')+' 🎉':tr('architect.next_brief')+' →','pzArNext',{},'pink big'):btn('▶ '+tr('architect.send_the_backhoe'),'pzArGo',{},'pink big',!e.ready);
  h+=`<div class="btns arbtns">${main}${btn('↶ '+tr('puzzles.undo'),'pzUndo',{},'ghost sm',!!sh||!(UI.pzHist&&UI.pzHist.length))}${btn(tr('architect.reset_brief'),'pzReset',{},'ghost sm',!!sh)}${btn(UI.arAll?tr('architect.hide_other_cities'):tr('architect.show_all_cities'),'pzArAll',{},'ghost sm')}</div>`;
  if(h!==UI._pzh){UI._pzh=h;morph(el,h);}}
function arPanel(sel){const A=S.ar,head=(eb,name,facts)=>`<div class="ph"><div style="min-width:0"><div class="eyebrow">${eb}</div><h2>${name}</h2>${facts?`<div class="facts">${facts}</div>`:''}</div><button class="x" data-act="closePanel" aria-label="${tr('common.close')}">×</button></div>`;
  const old=x=>(x.br|0)<A.bi?`<p class="note">${tr('architect.built_in_an_earlier_brief')}</p>`:'';
  if(sel.type==='city'){const c=sel.id,k=pzKind(c),p=S.pops[c];if(!k)return '';
    const eb=c===A.hq?'🏠 '+tr('architect.hq'):A.gold.includes(c)?'🚨 '+tr('architect.gold_site'):k==='goal'?'🎯 '+tr('architect.site'):k==='via'?'🪨 '+tr('puzzles.stepping_stone_optional'):k==='avoid'?'🚫 '+tr('architect.closed'):'📍 '+tr('puzzles.not_in_the_plan');
    let h=head(eb,esc(CITY[c].name),p?`<span class="fact mine">${tr('common.your_pop')}</span><span class="fact">${tr('puzzles.price_per_year',{price:fmt$(arPopCost(c))})}</span>`:'')+'<div class="scroll">';
    if(c===A.hq)h+=`<p class="lead">${tr('architect.hq_lead')}</p>`;else if(A.gold.includes(c))h+=`<p class="lead">${tr('architect.gold_lead')}</p>`;
    if(k==='avoid'&&!p)return h+`<p class="lead">${tr('puzzles.not_this_one_find_a_way_around')}</p></div>`;
    if(!p){const pc=pzPopCost(c)+pzRtCost(0,1);return h+`<div class="btns">${btn(tr('puzzles.open_a_pop_cost',{cost:fmt$(pc)}),'pzPop',{city:c},'pink big')}</div><p class="note">${tr('architect.or_drag_a_tube_here')}</p></div>`;}
    if(k==='avoid')h+=`<p class="lead">${tr('architect.closed_lead')}</p>`;
    {const G=RG[p.rgen||0],cap=nodeCap(c),ld=R.nodeLoad[c]||0;h+=`<div class="kv"><span>${tr('architect.router_x',{x:esc(G.n)})}</span><b>${pzRtCost(p.rgen||0,1)?tr('puzzles.price_per_year',{price:fmt$(pzRtCost(p.rgen||0,1))}):tr('puzzles.free')}</b></div><div class="meta">${tr('architect.router_follows')} · ${fmtG(ld)} / ${fmtG(cap)}</div>`;}
    const ls=S.links.filter(l=>l.a===c||l.b===c);
    h+=`<h3 style="margin-top:6px">${tr('common.links')}</h3>`;
    if(!ls.length)h+=`<p class="note">${tr('puzzles.drag_from_this_pop_onto_another')}</p>`;
    for(const l of ls){const o=l.a===c?l.b:l.a;h+=`<div class="row"><div class="grow"><div class="nm">→ ${esc(CITY[o].name)}</div><div class="meta">${pzTrench(l)} · ${linkLat(l).toFixed(1)} ms · ${tr('puzzles.price_per_year',{price:fmt$(arLinkCost(l))})}</div></div>${btn(tr('common.open'),'selLink',{id:l.id},'ghost sm')}</div>`;}
    if(k!=='avoid'){const others=[...S.pz.cities,...S.pz.via].filter(x=>x!==c&&!S.pz.avoid.includes(x));if(others.length)h+=`<h3 style="margin-top:10px">${tr('architect.lay_a_tube_to')}</h3><div class="seg">${others.map(x=>btn(esc(CITY[x].name),'pzLinkTo',{a:c,b:x},S.pops[x]?'':'ghost')).join('')}</div>`;}
    if(c!==A.hq)h+=old(p)+`<div class="btns" style="margin-top:10px">${btn(tr('puzzles.remove_this_pop'),'pzRmPop',{city:c},'red sm')}</div>`;
    return h+'</div>';}
  const l=S.links.find(x=>x.id===sel.id);if(!l)return '';
  let h=head(l.cable?esc(CAB[l.cable].name):tr('common.overland'),`${esc(CITY[l.a].name)} ⇄ ${esc(CITY[l.b].name)}`,`<span class="fact">${l.km.toLocaleString()} km</span><span class="fact">${linkLat(l).toFixed(1)} ms</span><span class="fact">${tr('puzzles.price_per_year',{price:fmt$(arLinkCost(l))})}</span>`)+'<div class="scroll">';
  h+=`<p class="meta">${pzTrench(l)}${l.cable?' · '+esc(CAB[l.cable].blurb):''}</p>`;
  {const u=capOf(l)?(R.load[l.id]||0)/capOf(l):0;h+=`<div class="kv"><span>${tr('puzzles.this_link')}</span><b>${pzLoadTxt(l)}</b></div><div class="bar ${barCls(u)}"><i style="width:${Math.min(100,u*100).toFixed(1)}%"></i></div>`;}
  h+=`<h4 class="sub4">${tr('architect.size')}</h4><div class="seg">${AR_TIERS.map(i=>{const r={km:l.km,sub:l.sub,f:l.mult||1},why=subWaveWhy(i,l.km,l.sub);return btn(`${LT[i].n} <small>${why?esc(why):tr('puzzles.price_per_year',{price:fmt$(pzMo(r,i,false)*PZ_YEAR)})}</small>`,'pzTier',{id:l.id,tier:i},l.tier===i?'pink':'ghost',!!why||l.tier===i);}).join('')}</div>${arAge(l)<A.bi?`<p class="note">${tr('architect.changing_an_old_tube')}</p>`:''}`;
  h+=`<h4 class="sub4">${tr('puzzles.add_another_link_here')}</h4><div class="btns">${btn(l.cable?tr('puzzles.another_wave_on_this_cable'):tr('puzzles.same_trench_cheaper'),'pzAddPar',{id:l.id,div:0},'sm')}${btn(l.cable?tr('puzzles.a_different_route'):tr('puzzles.a_diverse_route'),'pzAddPar',{id:l.id,div:1},'pink sm')}</div>`;
  return h+old(l)+`<div class="btns" style="margin-top:10px">${btn(tr('puzzles.remove_this_link'),'pzRmLink',{id:l.id},'red sm')}</div></div>`;}
// The tube picker: overland or one of the real cables, a diverse trench when there is one already, and one price.
function arLinkModal(a,b,keep){const kb=pzKind(b);
  if(!kb||kb==='avoid'||!pzKind(a)){toast(kb==='avoid'?tr('puzzles.not_this_one_find_a_way_around'):tr('puzzles.not_a_city_you_can_build_in'),'bad');sfx('err');return;}
  if(!keep){UI.pzVia=null;UI.pzDiv=true;UI.pzTrench=null;}UI.pending={a,b};const rs=pzRoutes(a,b),cost1=x=>pzLinkCost(x,AR_TIER,false);
  const head=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${kmBetween(a,b).toLocaleString()} km</div><h2 style="font-size:26px">${esc(CITY[a].name)} → ${esc(CITY[b].name)}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  if(!rs.length){openModal(head+`<p class="lead" style="margin-top:10px">${tr('puzzles.no_cable_lands_in_both_try',{a:esc(CITY[a].name),b:esc(CITY[b].name)})}</p>`);return;}
  const r=rs.find(x=>x.via===UI.pzVia)||rs.slice().sort((x,y)=>cost1(x)-cost1(y))[0];UI.pzVia=r.via;
  const pl=pairLinks(a,b),land=!r.sub&&pl.some(l=>!l.cable),div=land&&UI.pzDiv!==false,pop=S.pops[b]?0:pzPopCost(b)+pzRtCost(0,1);
  let h=head;
  if(pl.length)h+=`<p class="pzhave">${tr('puzzles.already_here_list',{list:[...new Set(pl.map(pzTrench))].join(', ')})}</p>`;
  h+=`<h4 class="sub4">${tr('common.route')}</h4><div class="seg">${rs.map(x=>btn(`${x.cab?esc(CAB[x.cab].name):tr('common.overland')} <small>${x.ms.toFixed(1)} ms · ${tr('architect.from_x',{x:fmt$(pzLinkCost(x,0,false))})}${pl.some(l=>(l.cable||'land')===x.via)?' · ✓':''}</small>`,'pzVia',{v:x.via},x.via===r.via?'pink':'ghost')).join('')}</div>`;
  if(r.cab)h+=`<p class="note">${esc(CAB[r.cab].blurb)}${pl.some(l=>l.cable===r.cab)?' '+tr('puzzles.same_cable_same_anchor'):''}</p>`;
  if(land)h+=`<div class="seg" style="margin-top:8px">${btn(tr('puzzles.diverse_route_40_survives_the_monkey'),'pzDiv',{v:1},div?'pink':'ghost')}${btn(tr('puzzles.same_trench_cheaper_one_snip_cuts'),'pzDiv',{v:0},div?'ghost':'pink')}</div>`;
  if(pop)h+=`<p class="lead" style="margin-top:8px">${tr('puzzles.includes_a_new_pop_in_city',{city:esc(CITY[b].name),price:fmt$(pop)})}</p>`;
  const T=arTubes();if(T.max!=null&&T.u>=T.max)h+=`<p class="why">${tr('architect.this_tube_is_over_the_plan')}</p>`;
  h+=`<h4 class="sub4">${tr('architect.size')}</h4><div class="tiers">${AR_TIERS.map(i=>{const why=subWaveWhy(i,r.km,r.sub),rt=arRouterDelta(a,i)+(S.pops[b]?arRouterDelta(b,i):arRouterDelta(b,i)),c=pzLinkCost(r,i,div);
    return `<button class="tierbtn" data-act="pzLink" data-args='{"tier":${i}}'${why?' disabled':''}><span class="sz">${LT[i].n}</span><span class="grow meta">${why?esc(why):rt?tr('architect.plus_router_x',{x:fmt$(rt)}):''}</span><span class="pr num">${fmt$(c+rt)}</span></button>`;}).join('')}</div>`;
  openModal(h);}
// ---------- results ----------
const arLine=st=>st>=3?tr('architect.line_3'):st===2?tr('architect.line_2'):tr('architect.line_1');
function arResults(done){const A=S.ar,run=arRun(),sp=arSpend(),br=done?run.briefs.length:A.bi,st=done?arStars(sp):0,sh=arShape();arRecord(st,br,sp);
  const ri=AR_RUNS.indexOf(run),nx=ri>=0?AR_RUNS[ri+1]||null:null,stars=[0,1,2].map(i=>`<span class="pzbig${i<st?' on pop':''}" style="--d:${i*0.45}s">⭐</span>`).join('');
  openModal(`<div class="pzres">${st>=3?pzConfetti():''}<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">🏗️ ${done?tr('architect.run_complete'):tr('architect.run_over')}</div><h2 style="font-size:28px">${esc(run.n)}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <div class="pzstars">${stars}</div><p class="tagline" style="text-align:center">${done?arLine(st):tr('architect.the_cfo_pulled_the_plug')}</p>
  <div class="kv"><span>${done?'⭐':'☆'} ${tr('architect.briefs_done')}</span><b>${br} / ${run.briefs.length}</b></div>
  <div class="kv"><span>${arOver()?'☆':'⭐'} ${tr('architect.tubes_over_plan')}</span><b>${arOver()}</b></div>
  <div class="kv"><span>${sp<=run.budget+1e-6?'⭐':'☆'} ${tr('architect.spent')}</span><b>${fmt$(sp)} / ${fmt$(run.budget)}</b></div>
  ${sh?`<div class="kv"><span>${tr('architect.your_shape')}</span><b>${sh.i} ${esc(sh.n)}</b></div>`:''}
  <div class="btns cta" style="margin-top:12px">${nx&&done?btn(tr('architect.next_run')+' →','pzArStart',{id:nx.id},'pink big'):btn(tr('puzzles.more_puzzles'),'puzzleMenu',{},'pink big')}${btn(tr('architect.try_again'),'pzRetry',{},'')}${done?btn(tr('common.share_2cd9'),'pzShare',{},'ghost'):btn(tr('architect.keep_going'),'closeModal',{},'ghost')}</div></div>`);
  for(let i=0;i<st;i++)setTimeout(()=>{sfx('star');haptic(15);},i*450+150);if(st>=3)setTimeout(()=>sfx('fanfare'),3*450+250);}
// ---------- the list ----------
function arMenuRows(){const p=arLoad(),got=AR_RUNS.reduce((a,r)=>a+((p.runs[r.id]||{}).st|0),0);let h=`<h3 class="pzpack">🏗️ ${tr('architect.architect_runs')} <span class="meta">⭐ ${got}/${AR_RUNS.length*3}</span> <span class="pznew">${tr('architect.new')}</span></h3><p class="meta" style="margin:0 0 2px">${tr('architect.runs_lead')}</p>`;arWkEnsure();h+=arWkRow();
  for(const r of AR_RUNS){const x=p.runs[r.id];
    h+=`<div class="scn"><div class="grow"><div class="nm">${esc(r.n)} <span class="pzst">${pzStarStr(x?x.st:0)}</span></div><div class="meta">${esc(r.j)}</div><div class="meta">${tr('architect.n_briefs',{n:r.briefs.length})} · 🏠 ${esc(CITY[r.hq].name)}${' · '+tr('puzzles.budget_x',{x:fmt$(r.budget)})}${x&&x.sp!=null?' · '+tr('puzzles.best_x',{x:fmt$(x.sp)}):x&&x.br?' · '+tr('architect.best_n_briefs',{n:x.br}):''}</div></div>${btn(tr('common.play'),'pzArStart',{id:r.id},x&&x.st>=3?'ghost':'pink')}</div>`;}
  return h;}
