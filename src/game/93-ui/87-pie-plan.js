/* ---------- Pie Control's dish planner: which dishes to take down, move or add, and what each costs ----------
   Read from the last compute (R.pie), only while it is open, and rebuilt only when what it reads changes (piePlanSig).
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
const PIE_PLAN_OUT=5,PIE_PLAN_SHOW=8;
const piePlanCityMo=()=>BIZ_T.pizza.opts[0]*BIZ_T.pizza.rate*PIE_CITY_P;
// What a busy dish puts at risk a month: its traffic, from none of it at PIE_HOT to all of it at PIE_FULL (the Bottlenecks
// tab's full). Growing a dish that just turned busy is headroom, not money, so it ranks after what pays.
const piePlanHotMo=d=>d.used*BIZ_T.pizza.rate*clamp((d.u-PIE_HOT)/(PIE_FULL-PIE_HOT),0,1);
// Months to pay back: 0 when it pays at once (a refund that also saves), Infinity when it never does.
const piePlanPay=it=>{const net=it.val-it.mo;return net>0?Math.max(0,it.cost)/net:Infinity;};
// What the plan depends on: not the day's traffic (it moves daily), only which dishes run hot, and a monthly refresh.
const piePlanSig=Q=>{const P=S.pie;return JSON.stringify([S.day/30|0,P.dishes.map(x=>[x.city,x.ant,x.band,x.down>S.day]),Object.keys(CRUSTS).map(id=>[pieLive(id),P.crusts[id].queued,pieLased(id)]),
  Object.keys(S.pops),Q.hubs,Q.isl,Q.dish.filter(d=>d.cap>0&&d.u>=PIE_HOT).map(d=>d.city),Object.values(Q.gs||{}).sort(),P.lic,pieBandMax(),pieDishPrice()]);};
let PIE_PLAN_C=null;
function piePlan(Q){const k=piePlanSig(Q);if(!PIE_PLAN_C||PIE_PLAN_C.k!==k)PIE_PLAN_C={k,pl:piePlanMake(S.pie,Q)};return PIE_PLAN_C.pl;}
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
  const landed=new Set(Object.values(Q.gs||{}));
  if(Q.hubs.length)for(const x of P.dishes){const d=st.get(x.city);if(!d||d.used>1e-9||landed.has(x.city)||!['idle','nolas','nocrust'].includes(d.st)||hot.some(h=>pair(h,x.city)))continue;
    if((rev.get(x.city)||[]).some(c=>cnt.get(c)===1&&!las.some(id=>lasN[id]>(off(x.city)||!pieCovers(id,x.city)?0:1)&&pieCovers(id,c))))continue;
    if(!off(x.city)&&las.some(id=>pieCovers(id,x.city)&&lasN[id]===1&&tgt.some(c=>pieCovers(id,c))))continue;
    put(x.city,false);drops.push(x.city);}
  const gone=new Set(drops),free=p=>!D.has(p)&&!gone.has(p)&&pieFree(CITY[p].cc);
  // A new POP's traffic rides the sky to the backbone: lasers over it, or a dish of yours on the backbone within reach.
  const bh=p=>las.some(id=>lasN[id]>0&&pieCovers(id,p))||[...D].some(d=>!off(d)&&pieKm(p,d)<=PIE_BENT&&cs.some(id=>pieCovers(id,p)&&pieCovers(id,d)));
  // The cities a dish at p would bring in reach.
  const gainOf=p=>{const l=new Set();for(const c of rev.get(p))if(!reached(c))l.add(c);
    if(S.pops[p]&&!isl.has(p))for(const id of las)if(!lasN[id]&&pieCovers(id,p))for(const c of tgt)if(!reached(c)&&cnt.get(c)===0&&pieCovers(id,c))l.add(c);return [...l];};
  // A new POP comes with your POP standard's routers (popOpen() buys them): priced here, or a move could take the old
  // dish down and then not afford the new one.
  const sq=popStdQuote(),site=(p,o)=>{const cc=CITY[p].cc,lic=pieLicOk(cc)?0:pieLicPrice(cc),pop=S.pops[p]?0:popCost(p)+(sq?sq.cost:0);
    return {...o,to:p,lic,pop,cost:pieDishPrice()+lic+pop,mo:PIE_DISH_MO+lic/12+(pop?popMo(p)+(sq?sq.mo:0):0)};};
  for(const d of Q.dish.filter(d=>d.cap>0&&d.u>=PIE_HOT).sort((a,b)=>b.u-a.u)){const x=P.dishes.find(y=>y.city===d.city);if(!x)continue;const val=piePlanHotMo(d);
    // Enough antennas to bring it back to PIE_RELAX full, not always all 16.
    if(pieAntLeft(x)){const a=clamp(Math.ceil(d.used/(PIE_RELAX*d.cap/x.ant))-x.ant,1,pieAntLeft(x));items.push({k:'ant',c:d.city,u:d.u,ant:x.ant+a,cost:a*pieAntPrice(x.band),val,mo:0});continue;}
    const bc=pieBandCost(x);if(bc){items.push({k:'band',c:d.city,u:d.u,cost:bc,val,mo:0});continue;}
    // A dish nearby with room already takes what no longer fits here.
    if(Q.dish.some(o=>o.cap>0&&o.u<PIE_HOT&&pair(d.city,o.city)))continue;
    const p=Object.keys(S.pops).filter(q=>free(q)&&pieKm(d.city,q)<=PIE_BENT&&cs.some(id=>pieCovers(id,d.city)&&pieCovers(id,q))).sort((a,b)=>pieKm(d.city,a)-pieKm(d.city,b))[0];
    if(p){const g=gainOf(p);put(p,true);adds.push(site(p,{c:d.city,u:d.u,n:g.length,cs:g,val:val+g.length*cm}));}}
  // Greedy cover: each pick the site that pays back soonest for the cities it reaches that nothing reaches yet.
  // Even one town, even one that never pays back: it is listed last, and the player decides.
  const better=(o,b)=>!b||o.pay<b.pay||o.pay===b.pay&&(o.n>b.n||o.n===b.n&&o.cost<b.cost);
  for(let i=0;i<PIE_PLAN_ADD;i++){let best=null;
    for(const p of sites){if(!free(p)||!S.pops[p]&&!bh(p))continue;const g=gainOf(p);if(!g.length)continue;const o=site(p,{n:g.length,cs:g,val:g.length*cm});o.pay=piePlanPay(o);if(better(o,best))best=o;}
    if(!best)break;if(best.pop)fresh.add(best.to);put(best.to,true);adds.push(best);}
  adds.sort((a,b)=>piePlanPay(a)-piePlanPay(b));
  adds.forEach((a,i)=>{if(i<drops.length){const x=P.dishes.find(y=>y.city===drops[i]);const sv=pieDishSalvage(x);items.push({...a,k:'move',from:drops[i],sv,cost:a.cost-sv,mo:a.mo-PIE_DISH_MO});}else items.push({...a,k:'add'});});
  for(const c of drops.slice(adds.length)){const sv=pieDishSalvage(P.dishes.find(y=>y.city===c));items.push({k:'drop',from:c,sv,cost:-sv,val:0,mo:-PIE_DISH_MO});}
  for(const it of items)it.pay=piePlanPay(it);
  items.sort((a,b)=>a.pay-b.pay||b.val-a.val);
  // Cities still out of reach, and why: no site of any kind within PIE_BENT km (lasers would reach it), landing rights
  // refused there, no way back to the backbone for a new POP, or more picks than one plan holds.
  const out=tgt.filter(c=>!reached(c)).map(c=>{const l=near.get(c);
    return {c,why:!l.length?'far':l.every(p=>!pieFree(CITY[p].cc))?'lic':l.every(p=>!pieFree(CITY[p].cc)||!S.pops[p]&&!bh(p))?'nobh':'more'};});
  return {items,out,tgt:tgt.length,r0,r1:nReach()};}
// The arguments each kind of suggestion takes, and its key (a click, a confirmation and the plan line must agree on it).
const PIE_PLAN_ARGS={ant:['c','ant'],band:['c'],add:['to'],move:['from','to'],drop:['from']};
const piePlanKey=it=>[it.k,...PIE_PLAN_ARGS[it.k].map(f=>it[f])].join('|');
const piePlanArgs=it=>{const a={k:it.k};for(const f of PIE_PLAN_ARGS[it.k])a[f]=it[f];return a;};
// Why a suggestion cannot be carried out right now ('' when it can): the same check greys its button and guards the action.
function piePlanCan(it){const P=S.pie,x=it.from&&P.dishes.find(d=>d.city===it.from);if(!pieCanBuild())return tr('pie.off_t1');
  if(it.c&&!it.to&&!P.dishes.some(d=>d.city===it.c)||it.from&&!x)return tr('pie_plan.t_stale');
  if(it.to){const to=it.to;if(P.dishes.some(d=>d.city===to)||!pieFree(CITY[to].cc)||!S.pops[to]&&(!cityOn(to)||cnCity(to)))return tr('pie_plan.t_stale');
    if(P.dishes.length-(x?1:0)>=PIE_DISH_MAX)return tr('pie.off_dish_max',{n:PIE_DISH_MAX});}
  // A POP is real money even in a sandbox (buildPop's spend()), where a salvage pays nothing back.
  const need=pieSand()?it.pop||0:it.cost;return need>0&&S.cash<need?tr('pie.off_cash'):'';}
// One suggestion carried out through the same helpers as the buttons, without redrawing; piePlanCan() said yes first.
function piePlanApply(it){const P=S.pie,dish=c=>P.dishes.find(d=>d.city===c);
  if(it.k==='ant'){const y=dish(it.c);return pieAntAdd(y,it.ant-y.ant);}
  if(it.k==='band')return pieBandUp(dish(it.c));
  // The old dish comes down first, so its salvage pays toward the new one and the dish count has room.
  if(it.from)pieDishTake(dish(it.from));if(it.k==='drop')return true;
  const to=it.to,cc=CITY[to].cc;if(!S.pops[to]&&!popOpen(to))return false;
  if(!pieLicOk(cc)){if(!pieSpend(pieLicPrice(cc)))return false;pieLicAdd(cc,1);}
  return pieDishAdd(to);}
const piePlanCost=v=>v<0?`<span class="pie-pl-back">+${fmt$(-v)}</span>`:fmt$(v);
// Rough by design (a new city is a guess at what it will sign): whole months, with a ~.
const piePlanPayTxt=p=>p===0?tr('pie_plan.pay_now'):isFinite(p)?trn('pie_plan.pay_mo',Math.max(1,Math.ceil(p))):tr('pie_plan.pay_never');
// The city a suggestion is about, for the globe and its 📍 button.
const piePlanAt=it=>it.to||it.c||it.from;
// Up to three city names, then how many more.
const piePlanList=l=>l.slice(0,3).map(pieCn).join(', ')+(l.length>3?' '+trn('pie_plan.out_more',l.length-3):'');
// Why the line is there, from today's loads: how full the dish is and who lands on it, or which cities it brings in reach.
function piePlanWhy(it,Q,on){const L=it.c&&Q.dish.find(d=>d.city===it.c),hot=L?trn('pie_plan.why_hot',on[it.c]||0,{city:pieCn(it.c),p:pct(L.u)}):'';
  const cover=it.cs&&it.cs.length?trn('pie_plan.why_cover',it.cs.length,{list:piePlanList(it.cs)}):'';
  const extra=[it.pop?tr('pie_plan.pop_h',{price:fmt$(it.pop)}):'',it.lic?tr('pie_plan.lic',{country:esc(pieLicCountry(CITY[it.to].cc)),price:fmt$(it.lic)}):''].filter(Boolean).join(' ');
  if(it.k==='ant'||it.k==='band')return hot;
  if(it.k==='drop')return tr('pie_plan.why_idle',{city:pieCn(it.from)});
  return [it.k==='move'?tr('pie_plan.why_idle',{city:pieCn(it.from)}):hot?hot+' '+tr('pie_plan.why_no_room'):'',cover,extra].filter(Boolean).join(' ');}
function piePlanAsk(it){const x=S.pie.dishes.find(d=>d.city===it.from);if(!x)return '';
  const q=it.k==='drop'?tr('pie.dish_close_q',{city:pieCn(it.from),n:x.ant,amt:fmt$(it.sv)}):tr('pie_plan.move_q',{from:pieCn(it.from),to:pieCn(it.to),amt:fmt$(it.sv)});
  const args={...piePlanArgs(it),ok:true};
  return `<div class="pie-confirm"><span>${q}</span><div class="btns">${btn(it.k==='drop'?tr('pie.dish_close_yes'):tr('pie_plan.do_move'),'piePlanDo',args,'red sm')}${btn(tr('common.cancel'),'piePlanKeep',{},'ghost sm')}</div></div>`;}
function piePlanRow(it,i,Q,on){const c=pieCn(it.c),to=it.to?pieCn(it.to):'';
  const R0={ant:['📶',tr('pie_plan.ant_t',{city:c,n:it.ant}),tr('pie_plan.do_ant')],
    band:['⬆️',tr('pie_plan.band_t',{city:c,b:PIE_BAND_N[pieBandMax()]}),tr('pie_plan.do_band')],
    add:[it.pop?'🏗️':'📡',it.pop?tr('pie_plan.pop_t',{city:to}):tr('pie_plan.add_t',{city:to}),it.pop?tr('pie_plan.do_pop'):tr('pie_plan.do_add')],
    move:['🔀',tr('pie_plan.move_t',{from:pieCn(it.from),to}),tr('pie_plan.do_move')],
    drop:['🗑️',tr('pie_plan.drop_t',{city:pieCn(it.from)}),tr('pie_plan.do_drop')]}[it.k];
  const mo=Math.round(it.mo),bills=mo?' · '+(mo>0?tr('pie_plan.mo_more',{mo:fmt$(mo)}):tr('pie_plan.mo_less',{mo:fmt$(-mo)})):'';
  const ask=UI.piePlanAsk===piePlanKey(it);
  return `<div class="pie-fx pie-pl"><span class="pie-fx-ic" aria-hidden="true">${R0[0]}</span><div class="pie-fx-m"><b><span class="pie-pl-i">#${i+1}</span> ${R0[1]}</b><small>${piePlanWhy(it,Q,on)}</small><small class="pie-pl-pay">${piePlanPayTxt(it.pay)}${bills}</small></div><span class="pie-fx-n">${piePlanCost(it.cost)}</span><div class="pie-fx-b">${btn('📍','pieLook',{city:piePlanAt(it)},'ghost sm pie-loc',false,tr('pie_traffic.a_look'))}${ask?btn(R0[2],'piePlanDo',piePlanArgs(it),'ghost sm',true):pieBtn(R0[2],'piePlanDo',piePlanArgs(it),'ghost sm',0,piePlanCan(it))}</div></div>${ask?piePlanAsk(it):''}`;}
// 100% only when every city is reached: 410 of 411 shows 99%, not a rounded-up 100%.
const piePlanPct=(n,all)=>n>=all?pct(1):Math.min(99,Math.floor(n/all*100))+'%';
const piePlanLegend=()=>`<p class="meta pie-pl-leg">${tr('pie_plan.legend')} ${[['add',tr('pie_plan.leg_build')],['grow',tr('pie_plan.leg_grow')],['drop',tr('pie_plan.leg_drop')]].map(([k,l])=>`<span class="pie-pl-lk"><i class="pie-pl-ring pie-pl-${k}"></i>${l}</span>`).join(' ')}</p>`;
function piePlanHtml(){const Q=R&&R.pie;if(!Q||!Q.dish)return `<div class="pie-plan"><p class="meta">${tr('pie_traffic.no_data')}</p></div>`;const pl=piePlan(Q);
  let h=`<div class="pie-plan"><p class="meta">${tr('pie_plan.intro')}</p>`;
  if(pl.tgt)h+=`<p class="pie-pl-reach">${tr('pie_plan.reach',{n:pl.r0,all:pl.tgt,p:piePlanPct(pl.r0,pl.tgt)})}${pl.r1>pl.r0?` → <b>${tr('pie_plan.reach_after',{n:pl.r1,p:piePlanPct(pl.r1,pl.tgt)})}</b>`:''}</p>`;
  else h+=`<p class="meta">${tr('pie_plan.no_crust')}</p>`;
  const W={far:tr('pie_plan.out_far',{km:PIE_BENT.toLocaleString()}),lic:tr('pie_plan.out_lic'),nobh:tr('pie_plan.out_nobh'),more:tr('pie_plan.out_more_picks')};
  const out=pl.out.length?`<p class="meta pie-pl-out">${tr('pie_plan.out',{list:pl.out.slice(0,PIE_PLAN_OUT).map(o=>`${pieCn(o.c)} <i>(${W[o.why]})</i>`).join(', ')+(pl.out.length>PIE_PLAN_OUT?' '+trn('pie_plan.out_more',pl.out.length-PIE_PLAN_OUT):'')})}</p>`:'';
  if(!pl.items.length)return h+(out||`<p class="meta">✅ ${tr('pie_plan.none')}</p>`)+'</div>';
  // Orbit customers landing on each dish today, for the reasons.
  const on={};for(const c of Object.values(Q.gs||{}))on[c]=(on[c]||0)+1;
  const tot=pl.items.reduce((a,x)=>a+x.cost,0);
  h+=`<p class="pie-pl-tot">${trn('pie_plan.total',pl.items.length,{price:piePlanCost(tot)})}</p>`;
  // The best few first: a big ground segment can have a line for every dish, a wall on a phone.
  const all=UI.piePlanAll||pl.items.length<=PIE_PLAN_SHOW+2;
  h+=`<div class="pie-fxl">${(all?pl.items:pl.items.slice(0,PIE_PLAN_SHOW)).map((it,i)=>piePlanRow(it,i,Q,on)).join('')}</div>`;
  if(pl.items.length>PIE_PLAN_SHOW+2)h+=`<div class="btns">${btn(UI.piePlanAll?tr('common.show_fewer'):tr('notifications.show_all_n',{n:pl.items.length}),'piePlanAll',{},'ghost sm')}</div>`;
  return h+out+`<p class="meta pie-pl-rough">${tr('pie_plan.rough')}</p>`+piePlanLegend()+'</div>';}
// The planner's picks for the globe (Dishes tab, planner open): where to build, grow or take down.
function piePlanSites(){const Q=R&&R.pie;if(!S.pie||!Q||!Q.dish||UI.pieTab!=='dish'||!UI.piePlan)return [];return piePlan(Q).items.map(it=>({city:piePlanAt(it),k:it.k}));}
// The planner's button atop the Dishes tab, and its box once open.
const piePlanBox=()=>`<div class="btns pie-plan-b">${btn('🧭 '+tr('pie_plan.title'),'piePlanOpen',{},UI.piePlan?'sm':'ghost sm',false,tr('pie_plan.tip'))}</div>${UI.piePlan?piePlanHtml():''}`;
