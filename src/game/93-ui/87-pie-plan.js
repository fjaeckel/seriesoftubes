/* ---------- Pie Control's dish planner: which dishes to take down, move or add, and what each costs ----------
   Read from the last compute (R.pie) and worked out once per compute (kept on it, out of JSON), only while it is open.
   - drop: a dish that carried nothing while a crust carries, and whose every city another dish also reaches: coverage
     is never given up for a refund, so an idle dish that alone reaches some town stays (it is how contracts there sign);
   - hot: a dish over PIE_HOT full gets its antennas, then a higher band, then a new dish at the nearest free POP;
   - cover: dishes where they reach the most cities nothing reaches yet, at a POP of yours or at a new one (a POP is
     cheap next to a dish; it must reach the backbone through the sky, so a dish of yours lands it).
   A drop paired with a new dish is a move. Each suggestion is ranked by payback: its cost over what it earns a month
   (a city reached is worth the smallest home contract times PIE_CITY_P, a busy dish the traffic at risk) less what it
   adds to the bills. A city counts as reached when a crust with pies (or on the way) covers it and a dish within PIE_BENT
   km under that crust, or, with lasers on it, any dish on the backbone under it. */
const PIE_HOT=0.75,PIE_RELAX=0.6,PIE_PLAN_ADD=8,PIE_CITY_P=0.5;
const PIE_PLAN_OUT=5;
const piePlanCityMo=()=>BIZ_T.pizza.opts[0]*BIZ_T.pizza.rate*PIE_CITY_P;
// What a busy dish puts at risk a month: its traffic, more of it the fuller it is.
const piePlanHotMo=d=>d.used*BIZ_T.pizza.rate*clamp((d.u-PIE_HOT)/(PIE_FULL-PIE_HOT),0.1,1);
// Months to pay back: 0 when it pays at once (a refund that also saves), Infinity when it never does.
const piePlanPay=it=>{const net=it.val-it.mo;return net>0?Math.max(0,it.cost)/net:Infinity;};
function piePlan(Q){if(!Q._plan)Object.defineProperty(Q,'_plan',{value:piePlanMake(S.pie,Q)});return Q._plan;}
function piePlanMake(P,Q){const cs=Object.keys(CRUSTS).filter(id=>pieLive(id)>0||P.crusts[id].queued>0),isl=new Set(Q.isl),st=new Map(Q.dish.map(d=>[d.city,d]));
  const las=cs.filter(id=>Q.hubs.includes(id)&&pieLased(id)),tgt=CITIES.filter(c=>!c.cn&&cs.some(id=>pieCovers(id,c.id))).map(c=>c.id);
  // Sites: your POPs, and cities a POP may open in under a crust; near/rev: which sites reach which target city.
  const sites=CITIES.filter(c=>S.pops[c.id]||cityOn(c.id)&&!c.cn&&cs.some(id=>pieCovers(id,c.id))).map(c=>c.id),near=new Map(),rev=new Map(sites.map(p=>[p,[]]));
  for(const c of tgt){const l=sites.filter(p=>(p===c||pieKm(c,p)<=PIE_BENT)&&cs.some(id=>pieCovers(id,c)&&pieCovers(id,p)));near.set(c,l);for(const p of l)rev.get(p).push(c);}
  const D=new Set(P.dishes.map(x=>x.city)),cnt=new Map(tgt.map(c=>[c,near.get(c).filter(p=>D.has(p)).length])),lasN={},fresh=new Set();
  const off=p=>isl.has(p)||fresh.has(p);
  for(const id of las)lasN[id]=[...D].filter(d=>!off(d)&&pieCovers(id,d)).length;
  const reached=c=>cnt.get(c)>0||las.some(id=>lasN[id]>0&&pieCovers(id,c)),nReach=()=>tgt.filter(reached).length;
  const put=(p,k)=>{k?D.add(p):D.delete(p);for(const c of rev.get(p)||[])cnt.set(c,cnt.get(c)+(k?1:-1));if(!off(p))for(const id of las)if(pieCovers(id,p))lasN[id]+=k?1:-1;};
  const r0=nReach(),drops=[],adds=[],items=[],cm=piePlanCityMo();
  // Two dishes within PIE_BENT km under a shared crust can take each other's customers.
  const pair=(a,b)=>a!==b&&pieKm(a,b)<=PIE_BENT&&cs.some(id=>pieCovers(id,a)&&pieCovers(id,b)),hot=Q.dish.filter(d=>d.cap>0&&d.u>=PIE_HOT).map(d=>d.city);
  // Nothing carries yet: every dish is idle, so none is useless. An idle dish next to a busy one is its spare room.
  if(Q.hubs.length)for(const x of P.dishes){const d=st.get(x.city);if(!d||d.used>1e-9||!['idle','nolas','nocrust'].includes(d.st)||hot.some(h=>pair(h,x.city)))continue;
    if((rev.get(x.city)||[]).some(c=>cnt.get(c)===1&&!las.some(id=>lasN[id]>(off(x.city)||!pieCovers(id,x.city)?0:1)&&pieCovers(id,c))))continue;
    if(!off(x.city)&&las.some(id=>pieCovers(id,x.city)&&lasN[id]===1&&tgt.some(c=>pieCovers(id,c))))continue;
    put(x.city,false);drops.push(x.city);}
  const gone=new Set(drops),free=p=>!D.has(p)&&!gone.has(p)&&pieFree(CITY[p].cc);
  // A new POP's traffic rides the sky to the backbone: lasers over it, or a dish of yours on the backbone within reach.
  const bh=p=>las.some(id=>lasN[id]>0&&pieCovers(id,p))||[...D].some(d=>!off(d)&&pieKm(p,d)<=PIE_BENT&&cs.some(id=>pieCovers(id,p)&&pieCovers(id,d)));
  const gainOf=p=>{let n=0;for(const c of rev.get(p))if(!reached(c))n++;
    if(S.pops[p]&&!isl.has(p))for(const id of las)if(!lasN[id]&&pieCovers(id,p))for(const c of tgt)if(!reached(c)&&cnt.get(c)===0&&pieCovers(id,c)&&!rev.get(p).includes(c))n++;return n;};
  const site=(p,o)=>{const cc=CITY[p].cc,lic=pieLicOk(cc)?0:pieLicPrice(cc),pop=S.pops[p]?0:popCost(p);
    return {...o,to:p,lic,pop,cost:pieDishPrice()+lic+pop,mo:PIE_DISH_MO+lic/12+(pop?popMo(p):0)};};
  for(const d of Q.dish.filter(d=>d.cap>0&&d.u>=PIE_HOT).sort((a,b)=>b.u-a.u)){const x=P.dishes.find(y=>y.city===d.city);if(!x)continue;const val=piePlanHotMo(d);
    // Enough antennas to bring it back to PIE_RELAX full, not always all 16.
    if(pieAntLeft(x)){const a=clamp(Math.ceil(d.used/(PIE_RELAX*d.cap/x.ant))-x.ant,1,pieAntLeft(x));items.push({k:'ant',c:d.city,u:d.u,ant:x.ant+a,cost:a*pieAntPrice(x.band),val,mo:0});continue;}
    const bc=pieBandCost(x);if(bc){items.push({k:'band',c:d.city,u:d.u,cost:bc,val,mo:0});continue;}
    // A dish nearby with room already takes what no longer fits here.
    if(Q.dish.some(o=>o.cap>0&&o.u<PIE_HOT&&pair(d.city,o.city)))continue;
    const p=Object.keys(S.pops).filter(q=>free(q)&&pieKm(d.city,q)<=PIE_BENT&&cs.some(id=>pieCovers(id,d.city)&&pieCovers(id,q))).sort((a,b)=>pieKm(d.city,a)-pieKm(d.city,b))[0];
    if(p){const n=gainOf(p);put(p,true);adds.push(site(p,{c:d.city,u:d.u,n,val:val+n*cm}));}}
  // Greedy cover: each pick the site that pays back soonest for the cities it reaches that nothing reaches yet.
  // Even one town, even one that never pays back: it is listed last, and the player decides.
  const better=(o,b)=>!b||o.pay<b.pay||o.pay===b.pay&&(o.n>b.n||o.n===b.n&&o.cost<b.cost);
  for(let i=0;i<PIE_PLAN_ADD;i++){let best=null;
    for(const p of sites){if(!free(p)||!S.pops[p]&&!bh(p))continue;const n=gainOf(p);if(!n)continue;const o=site(p,{n,val:n*cm});o.pay=piePlanPay(o);if(better(o,best))best=o;}
    if(!best)break;if(best.pop)fresh.add(best.to);put(best.to,true);adds.push(best);}
  adds.sort((a,b)=>piePlanPay(a)-piePlanPay(b));
  adds.forEach((a,i)=>{if(i<drops.length){const x=P.dishes.find(y=>y.city===drops[i]);items.push({...a,k:'move',from:drops[i],cost:a.cost-pieDishSalvage(x),mo:a.mo-PIE_DISH_MO});}else items.push({...a,k:'add'});});
  for(const c of drops.slice(adds.length))items.push({k:'drop',from:c,cost:-pieDishSalvage(P.dishes.find(y=>y.city===c)),val:0,mo:-PIE_DISH_MO});
  for(const it of items)it.pay=piePlanPay(it);
  items.sort((a,b)=>a.pay-b.pay||b.val-a.val);
  // Cities still out of reach, and why: no site of any kind within PIE_BENT km (lasers would reach it), landing rights
  // refused there, no way back to the backbone for a new POP, or more picks than one plan holds.
  const out=tgt.filter(c=>!reached(c)).map(c=>{const l=near.get(c);
    return {c,why:!l.length?'far':l.every(p=>!pieFree(CITY[p].cc))?'lic':l.every(p=>!pieFree(CITY[p].cc)||!S.pops[p]&&!bh(p))?'nobh':'more'};});
  return {items,out,tgt:tgt.length,r0,r1:nReach()};}
// One suggestion carried out, without redrawing: true, false when it no longer applies, null when it cannot be paid (spend() said so).
function piePlanApply(it){const P=S.pie,x=it.from?P.dishes.find(d=>d.city===it.from):null;
  if(it.k==='ant'||it.k==='band'){const y=P.dishes.find(d=>d.city===it.c);if(!y||!pieCanBuild())return false;const n=clamp(int(it.ant,1,PIE_ANT_MAX,PIE_ANT_MAX),y.ant,PIE_ANT_MAX),v=it.k==='ant'?(n-y.ant)*pieAntPrice(y.band):pieBandCost(y);
    if(!v)return false;if(!pieSpend(v))return null;if(it.k==='ant')y.ant=n;else y.band=pieBandMax();return true;}
  if(it.from&&!x)return false;
  if(it.to){const to=it.to,cc=CITY[to].cc,pop=!S.pops[to];if(P.dishes.some(d=>d.city===to)||!pieCanBuild()||!pieFree(cc)||P.dishes.length-(x?1:0)>=PIE_DISH_MAX)return false;
    if(pop&&(!cityOn(to)||cnCity(to)))return false;
    const lic=pieLicOk(cc)?0:pieLicPrice(cc),sv=x?pieDishSalvage(x):0,pc=pop?popCost(to):0;
    // The POP is real money even in a sandbox (buildPop's spend()): check it all fits before paying any of it.
    if(pc&&S.cash+sv<pc+(pieSand()?0:pieDishPrice()+lic)){toast(tr('interface.not_enough_cash_wait_for_revenue'),'bad');sfx('err');return null;}
    if(sv)pieRefund(sv);if(!pieSpend(pieDishPrice()+lic)){if(sv)pieCharge(sv);return null;}
    if(pc){S.cash-=pc;S.pops[to]={day:S.day,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0};popStdApply(to);}
    if(lic)pieLicAdd(cc,1);P.dishes.push({id:uid(),city:to,ant:1,down:0,band:pieBandMax()});if(x)P.dishes=P.dishes.filter(d=>d!==x);return true;}
  if(!x)return false;pieRefund(pieDishSalvage(x));P.dishes=P.dishes.filter(d=>d!==x);return true;}
const piePlanCost=v=>v<0?`<span class="pie-pl-back">+${fmt$(-v)}</span>`:fmt$(v);
const piePlanPayTxt=p=>p===0?tr('pie_plan.pay_now'):isFinite(p)?trn('pie_plan.pay_mo',Math.max(1,Math.ceil(p))):tr('pie_plan.pay_never');
// The city a suggestion is about, for the globe and its 📍 button.
const piePlanAt=it=>it.to||it.c||it.from;
function piePlanRow(it,i,room){const c=pieCn(it.c),hot=it.u!==undefined?tr('pie_plan.hot_h',{city:c,p:pct(it.u)}):'';
  const args={k:it.k};if(it.c)args.c=it.c;if(it.ant)args.ant=it.ant;if(it.from)args.from=it.from;if(it.to)args.to=it.to;
  const why=(it.k==='add'&&room<=0)?tr('pie.off_dish_max',{n:PIE_DISH_MAX}):'',to=it.to?pieCn(it.to):'';
  const extra=[it.n?trn('pie_plan.cover_h',it.n):'',it.pop?tr('pie_plan.pop_h',{price:fmt$(it.pop)}):'',it.lic?tr('pie_plan.lic',{country:esc(pieLicCountry(CITY[it.to].cc)),price:fmt$(it.lic)}):''];
  const add=[hot,...extra].filter(Boolean).join(' ');
  const R0={ant:['📶',tr('pie_plan.ant_t',{city:c,n:it.ant}),hot,tr('pie_plan.do_ant')],
    band:['⬆️',tr('pie_plan.band_t',{city:c,b:PIE_BAND_N[pieBandMax()]}),hot,tr('pie_plan.do_band')],
    add:[it.pop?'🏗️':'📡',it.pop?tr('pie_plan.pop_t',{city:to}):tr('pie_plan.add_t',{city:to}),add,it.pop?tr('pie_plan.do_pop'):tr('pie_plan.do_add')],
    move:['🔀',tr('pie_plan.move_t',{from:pieCn(it.from),to}),tr('pie_plan.move_h',{from:pieCn(it.from)})+' '+add,tr('pie_plan.do_move')],
    drop:['🗑️',tr('pie_plan.drop_t',{city:pieCn(it.from)}),tr('pie_plan.drop_h'),tr('pie_plan.do_drop')]}[it.k];
  const mo=Math.round(it.mo),bills=mo?' · '+(mo>0?tr('pie_plan.mo_more',{mo:fmt$(mo)}):tr('pie_plan.mo_less',{mo:fmt$(-mo)})):'';
  const at=piePlanAt(it);
  return `<div class="pie-fx pie-pl"><span class="pie-fx-ic" aria-hidden="true">${R0[0]}</span><div class="pie-fx-m"><b><span class="pie-pl-i">#${i+1}</span> ${R0[1]}</b><small>${R0[2]}</small><small class="pie-pl-pay">${piePlanPayTxt(it.pay)}${bills}</small></div><span class="pie-fx-n">${piePlanCost(it.cost)}</span><div class="pie-fx-b">${btn('📍','pieLook',{city:at},'ghost sm pie-loc',false,tr('pie_traffic.a_look'))}${pieBtn(R0[3],'piePlanDo',args,'ghost sm',Math.max(0,it.cost),why)}</div></div>`;}
// 100% only when every city is reached: 410 of 411 shows 99%, not a rounded-up 100%.
const piePlanPct=(n,all)=>n>=all?pct(1):Math.min(99,Math.floor(n/all*100))+'%';
function piePlanHtml(){const Q=R&&R.pie;if(!Q||!Q.dish)return `<div class="pie-plan"><p class="meta">${tr('pie_traffic.no_data')}</p></div>`;const pl=piePlan(Q),P=S.pie;
  let h=`<div class="pie-plan"><p class="meta">${tr('pie_plan.intro')}</p>`;
  if(pl.tgt)h+=`<p class="pie-pl-reach">${tr('pie_plan.reach',{n:pl.r0,all:pl.tgt,p:piePlanPct(pl.r0,pl.tgt)})}${pl.r1>pl.r0?` → <b>${tr('pie_plan.reach_after',{n:pl.r1,p:piePlanPct(pl.r1,pl.tgt)})}</b>`:''}</p>`;
  else h+=`<p class="meta">${tr('pie_plan.no_crust')}</p>`;
  const W={far:tr('pie_plan.out_far',{km:PIE_BENT.toLocaleString()}),lic:tr('pie_plan.out_lic'),nobh:tr('pie_plan.out_nobh'),more:tr('pie_plan.out_more_picks')};
  const out=pl.out.length?`<p class="meta pie-pl-out">${tr('pie_plan.out',{list:pl.out.slice(0,PIE_PLAN_OUT).map(o=>`${pieCn(o.c)} <i>(${W[o.why]})</i>`).join(', ')+(pl.out.length>PIE_PLAN_OUT?' '+trn('pie_plan.out_more',pl.out.length-PIE_PLAN_OUT):'')})}</p>`:'';
  if(!pl.items.length)return h+(out||`<p class="meta">✅ ${tr('pie_plan.none')}</p>`)+'</div>';
  let room=PIE_DISH_MAX-P.dishes.length+pl.items.filter(x=>x.k==='drop').length;
  h+=`<div class="pie-fxl">${pl.items.map((it,i)=>{const r=piePlanRow(it,i,room);if(it.k==='add')room--;return r;}).join('')}</div>`;
  const tot=pl.items.reduce((a,x)=>a+x.cost,0);
  return h+out+`<div class="btns">${pieBtn(tr('pie_plan.do_all',{n:pl.items.length})+` <small>${piePlanCost(tot)}</small>`,'piePlanAll',{},'sm',Math.max(0,tot))}</div></div>`;}
// The planner's picks for the globe (Dishes tab, planner open): where to build, grow or take down.
function piePlanSites(){const Q=R&&R.pie;if(!S.pie||!Q||!Q.dish||UI.pieTab!=='dish'||!UI.piePlan)return [];return piePlan(Q).items.map(it=>({city:piePlanAt(it),k:it.k}));}
// The planner's button atop the Dishes tab, and its box once open.
const piePlanBox=()=>`<div class="btns pie-plan-b">${btn('🧭 '+tr('pie_plan.title'),'piePlanOpen',{},UI.piePlan?'sm':'ghost sm',false,tr('pie_plan.tip'))}</div>${UI.piePlan?piePlanHtml():''}`;
