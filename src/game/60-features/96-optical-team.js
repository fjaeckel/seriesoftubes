/* ---------- The optical engineering team ----------
   A department of its own, from Big League on, and never cheap: optical engineers cost at least $1.2M a year. Once hired
   they take the intern's optical orders over (optics, line systems and optics swaps, handing back waves) and add two of
   their own: bigger leased waves where a wave runs hot, and new routes. Every week they look at what the Lambda Bazaar's
   buyers want between your POPs, add what you pay for leased waves on that route, and plan the routes that pay back
   within your limit: dug fiber on land, your own cable under the sea. They put each in front of you, or build it on
   their own (a switch), within a yearly budget and as many projects at a time as the team can run. And now and then
   they get something wrong: a fat-fingered config darkens a fiber for a day, a build slips, a build costs more. Bigger
   teams run more projects and slip less. Every roll is a hash of the day, so a game without a team keeps its random
   stream (as the sales desk does). S.optx: size, hired, mode (ask|auto), bud (a year's build budget), pay (months a
   route may take to pay back), yr and spent (this year's builds), jobs (links they are building), prop (routes waiting
   for you), log. */
const OPTX={
 s:{i:'🔦',n:N_('optx.s_n'),d:N_('optx.s_d'),mo:100000,proj:1,up:1,err:90},
 m:{i:'🔬',n:N_('optx.m_n'),d:N_('optx.m_d'),mo:250000,proj:2,up:2,err:180},
 l:{i:'🛰️',n:N_('optx.l_n'),d:N_('optx.l_d'),mo:580000,proj:4,up:3,err:360},
};
const OPTX_LV=4,OPTX_BUD=[1e6,5e6,20e6,100e6,0],OPTX_PAY=[24,36,60],OPTX_PROPS=3,OPTX_LOG=12,OPTX_MISS=['dark','slip','over'];
const optxNew=()=>({size:null,hired:0,mode:'ask',bud:5e6,pay:36,yr:0,spent:0,jobs:[],prop:[],log:[]});
const optxOn=()=>!!(S&&S.optx&&own(OPTX,S.optx.size));
const optxCanHire=()=>glassLvl()>=OPTX_LV&&rule('clock');
const optxMo=()=>optxOn()?OPTX[S.optx.size].mo:0;
const optxUp=()=>optxOn()?OPTX[S.optx.size].up:1;
const optxR=q=>(hstr(((S&&S.asn)||0)+'|optx|'+q)%100000)/100000;
// The links the team is still building, and whether it has room for another project.
const optxJobs=()=>{const T=S.optx;return T?S.links.filter(l=>T.jobs.includes(l.id)&&l.ready>S.day):[];};
const optxBusy=()=>optxJobs().length>=OPTX[S.optx.size].proj;
// "No limit" is 0, as the standing orders' budgets.
const optxLeft=()=>{const T=S.optx;return T.bud?Math.max(0,T.bud-T.spent):Infinity;};
// The upgrades a cable that long needs to light (a better terminal, more engineering), or null if no design reaches.
const optxUps=km=>{const n=subNeed(km);return n?{terminal:n.includes('terminal'),engineering:n.includes('engineering')}:null;};
/* What a route between two of your POPs would cost and bring, built by the team: dug fiber on land (up to 1,500 km,
   ROADM where it is unlocked), your own cable under the sea where you may lay one. mo: what the Bazaar's buyers want
   there at today's prices after the broker's cut, plus the leased waves on that route it would replace, less its own
   upkeep. null where the team cannot build it. */
function optxQuote(a,b){if(noTalk(a,b))return null;const sub=isSub(a,b),k=a<b?a+'|'+b:b+'|'+a;
  let cost,days,km,up0,u=null;
  if(sub){if(ownCabWhy(a,b))return null;u=optxUps(seaQuote(a,b,'standard').km);if(!u)return null;const q=seaQuote(a,b,'standard',u);cost=q.cost;days=q.days;km=q.km;up0=Math.round(km*OWNCAB_OM);}
  else{km=kmBetween(a,b);if(km>1500||!dfAllowed(a,b)||glassLvl()<2)return null;const sys=techOk('sys','roadm',DF_SYS.roadm.lvl)?'roadm':'lite';
    cost=digCost(km)+sysCost(sys)+ampCount(km)*AMP_COST;days=dfBuildDays(km);up0=Math.round(km*0.15);}
  // Only what the cable can carry: managed waves no optic lights this far are never sold there (#424).
  const r=cmRoute(a,b),sell=cmBuildVal(r,cmBuildG(km,sub,u))*mkt()*cmCut();
  const lease=S.links.filter(l=>l.kind==='wave'&&!l.fwv&&edgeKey(l)===k).reduce((s,l)=>s+(l.mo||0),0);
  const mo=Math.round(sell+lease-up0);if(!(mo>0))return null;
  return {k,a,b,sub,km:Math.round(km),cost:Math.round(cost),days,mo,pb:Math.ceil(cost/mo)};}
/* The week's plan: every pair of your POPs without dark fiber between them yet, the most wanted first (a quick look at
   the Bazaar's demand and your leased waves), the best dozen priced, the ones that pay back within your limit kept,
   quickest payback first. */
function optxPlan(){const T=S.optx,ps=Object.keys(S.pops).sort(),have=new Set(S.links.filter(l=>l.kind==='df').map(edgeKey)),lease=new Map(),d=S.day,c=[];
  for(const l of S.links)if(l.kind==='wave'&&!l.fwv){const k=edgeKey(l);lease.set(k,(lease.get(k)||0)+(l.mo||0));}
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=ps[i],b=ps[j],k=a+'|'+b;if(have.has(k))continue;
    if(!isSub(a,b)&&kmBetween(a,b)>1500)continue;const r=cmRoute(a,b);c.push({a,b,v:CM_P.reduce((s,p)=>s+cmDem(r,p,d)*cmList(r,p),0)+(lease.get(k)||0)});}
  c.sort((x,y)=>y.v-x.v||(x.a+x.b<y.a+y.b?-1:1));
  // A sea route nobody has surveyed yet takes a while to chart: in a browser that runs beside the game (the route comes
  // back "surveying" and is priced next week); without one it blocks, so only one new survey a week there.
  let fresh=typeof Worker==='undefined'||SEA_SURVEY.failed?1:4;const out=[];
  for(const x of c.slice(0,12)){if(isSub(x.a,x.b)&&seaCab(x.a,x.b)&&landing(x.a)&&landing(x.b)){seaSync();if(!SEA_NAV.routes.has(seaKey(x.a,x.b))&&!SEA_SURVEY.pending.has(seaKey(x.a,x.b))){if(fresh<=0)continue;fresh--;}}
    const q=optxQuote(x.a,x.b);if(q&&q.pb<=T.pay)out.push(q);}
  return out.sort((x,y)=>x.pb-y.pb||y.mo-x.mo);}
// The build itself: the player's own order (orderDf / orderCable), muted, so it costs what the click costs. true if laid.
function optxBuild(q){const n0=S.links.length,c0=S.cash;
  opsQuiet(()=>{const ui={p:UI.pending,m:UI.lmode,s:UI.dfSrc,y:UI.dfSys,d:UI.seaDesign,t:UI.seaterminal,e:UI.seaengineering};
    try{UI.pending={a:q.a,b:q.b};UI.lmode='df';
      if(q.sub){const u=optxUps(seaQuote(q.a,q.b,'standard').km);if(!u)return;UI.dfSrc='cable';UI.seaDesign='standard';UI.seaterminal=u.terminal;UI.seaengineering=u.engineering;ACT.orderCable();}
      else{UI.dfSrc='build';UI.dfSys=techOk('sys','roadm',DF_SYS.roadm.lvl)?'roadm':'lite';ACT.orderDf();}}
    finally{UI.pending=ui.p;UI.lmode=ui.m;UI.dfSrc=ui.s;UI.dfSys=ui.y;UI.seaDesign=ui.d;UI.seaterminal=ui.t;UI.seaengineering=ui.e;}});
  if(S.links.length<=n0)return false;const l=S.links.at(-1),T=S.optx;T.jobs.push(l.id);T.spent+=Math.max(0,c0-S.cash);T.prop=T.prop.filter(p=>p.k!==q.k);return true;}
/* A mistake, now and then (one day in 90 for a small team, 360 for a large one): a fat-fingered config darkens a lit
   fiber until tomorrow (only one with another way around it), a build slips one to four weeks, or costs 5 to 15% more.
   Nothing a save cannot recover from. */
function optxOops(d){const T=S.optx,P=OPTX[T.size];if(optxR(d+'|e')>=1/P.err)return null;
  const lit=S.links.filter(l=>l.kind==='df'&&!linkDown(l)&&(l.ch||[]).length&&!S.biz.some(b=>b.link===l.id)&&opsAround(l)),jobs=optxJobs();
  const ks=OPTX_MISS.filter(k=>k==='dark'?lit.length:jobs.length);if(!ks.length)return null;
  const k=ks[Math.floor(optxR(d+'|k')*ks.length)],pickL=a=>a[Math.floor(optxR(d+'|l')*a.length)];
  if(k==='dark'){const l=pickL(lit);l.eqDown=S.day+1;return {k,w:l.a+'|'+l.b};}
  const l=pickL(jobs);
  if(k==='slip'){const n=7+Math.floor(optxR(d+'|n')*22);if(l.sub)setCableReady(l,l.ready+n);else l.ready+=n;return {k,w:l.a+'|'+l.b,n};}
  const c=Math.round((l.sub?(l.paid||ownCabCost(l.km)):digCost(l.km))*(0.05+0.1*optxR(d+'|o')));S.cash-=c;T.spent+=c;return {k,w:l.a+'|'+l.b,c};}
const optxMissLine=m=>tr({dark:N_('optx.m_dark'),slip:N_('optx.m_slip'),over:N_('optx.m_over')}[m.k],{where:opsWhere(m.w,m.k),n:m.n||0,cost:fmt$(m.c||0)});
const optxLine=e=>{const parts=e.r.map(([k,n,w])=>trn(OPS_SAY[k],n,{where:w.map(x=>opsWhere(x,k)).join(', ')}));
  return (parts.length?tr('optx.l_line',{list:parts.join(', ')}):e.m?'':tr('optx.l_quiet'))+(e.m?(parts.length?' ':'')+optxMissLine(e.m):'')+opsPaid(e);};
// The team's day, after the intern's: its orders, the week's plan on Wednesdays (built or proposed), and a mistake now and then.
function* optxRun(d){if(!optxOn())return;const T=S.optx;opsMonth(d);const y=Math.floor(d/365);if(y!==T.yr){T.yr=y;T.spent=0;}
  T.jobs=T.jobs.filter(id=>S.links.some(l=>l.id===id&&l.ready>d));
  const X=opsShift();yield* opsOrders(OPS_ORDER.filter(opsTeam),X,'optx');
  if(d%7===2){const plan=optxPlan();yield DAY_REST;
    if(T.mode==='auto'){for(const q of plan){if(optxBusy())break;if(q.cost>optxLeft()||S.cash-q.cost<S.ops.floor)continue;const c0=S.cash,m0=opsMoNow();if(optxBuild(q)){X.did('build',q.a+'|'+q.b);X.up+=c0-S.cash;X.mo+=opsMoNow()-m0;X.dirty=true;}}}
    else{const old=new Set(T.prop.map(p=>p.k));T.prop=plan.slice(0,OPTX_PROPS);const nw=T.prop.find(p=>!old.has(p.k));
      if(nw)toast(esc(tr('optx.prop_new',{route:cmRouteName(nw),n:nw.pb})),'info',[{l:tr('optx.title'),act:'optxOpen',args:{}}]);}}
  const m=optxOops(d);if(m){X.dirty=true;toast(esc(optxMissLine(m)),'warn',[{l:tr('optx.title'),act:'optxOpen',args:{}}]);logNote(esc(optxMissLine(m)),'',[],{a:'optx'});}
  if(X.dirty)yield;
  const e={d,r:[]};for(const [k,x] of X.r)e.r.push([k,x.n,x.w]);if(X.broke.size)e.r.push(['broke',X.broke.size,[...X.broke]]);if(m)e.m=m;
  if(X.up)e.up=Math.round(X.up);if(Math.round(X.mo))e.mo=Math.round(X.mo);
  if(e.r.length||e.m){T.log.unshift(e);T.log.length=Math.min(T.log.length,OPTX_LOG);}}
// Saves are untrusted: a known size, values from the lists, jobs that are links, proposals priced again when they are next planned.
function optxFix(s){const o=s.optx&&typeof s.optx==='object'&&!Array.isArray(s.optx)?s.optx:{},n=optxNew(),ids=new Set(s.links.map(l=>l.id));
  n.size=typeof o.size==='string'&&own(OPTX,o.size)?o.size:null;n.hired=int(o.hired,0,1e7,0);n.mode=o.mode==='auto'?'auto':'ask';
  n.bud=OPTX_BUD.includes(o.bud)?o.bud:n.bud;n.pay=OPTX_PAY.includes(o.pay)?o.pay:n.pay;n.yr=int(o.yr,0,1e5,0);n.spent=Math.max(0,num(o.spent,0));
  if(Array.isArray(o.jobs))n.jobs=[...new Set(o.jobs.filter(id=>typeof id==='string'&&ids.has(id)))].slice(0,32);
  if(Array.isArray(o.prop))n.prop=o.prop.filter(p=>p&&isCity(p.a)&&isCity(p.b)&&p.a<p.b).slice(0,OPTX_PROPS).map(p=>({k:p.a+'|'+p.b,a:p.a,b:p.b,sub:!!p.sub,km:int(p.km,0,1e5,0),cost:int(p.cost,0,1e12,0),days:int(p.days,0,1e4,0),mo:int(p.mo,0,1e10,0),pb:int(p.pb,0,1e4,0)}));
  const okW=w=>typeof w==='string'&&w.length<=48&&/^[a-z0-9~|]+( [+\w.×→⇧]+)?$/i.test(w)&&w.split(' ')[0].split('|').every(x=>isIx(x)||own(OPSK,x)||isNet(x));
  if(Array.isArray(o.log))n.log=o.log.filter(e=>e&&typeof e==='object').map(e=>{const r=(Array.isArray(e.r)?e.r:[]).filter(x=>Array.isArray(x)&&own(OPS_SAY,x[0])&&Array.isArray(x[2])).map(x=>[x[0],int(x[1],1,1e6,1),x[2].filter(okW).slice(0,3)]).slice(0,16);
    const m=e.m&&OPTX_MISS.includes(e.m.k)&&okW(e.m.w)?{k:e.m.k,w:e.m.w,...(e.m.n?{n:int(e.m.n,0,365,0)}:{}),...(e.m.c?{c:int(e.m.c,0,1e12,0)}:{})}:null;
    const up=int(e.up,0,1e12,0),mo=int(e.mo,-1e9,1e9,0);return r.length||m?{d:int(e.d,0,1e7,0),r,...(m?{m}:{}),...(up?{up}:{}),...(mo?{mo}:{})}:null;}).filter(Boolean).slice(0,OPTX_LOG);
  s.optx=n;}
