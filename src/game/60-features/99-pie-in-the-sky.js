/* ---------- Pie in the Sky: your own satellite constellation (docs/plans/pie-in-the-sky.md) ----------
   Unlocks once, on becoming Tier 1 in a save started on this version (S.pieV>=1), or from day 0 with open gates.
   Pies are counted in cohorts per crust, never one object per satellite. Saves without S.pie pay nothing:
   pieDay() returns at once, compute() adds one falsy check.

   Hooks for the parts that come later (routing, incidents and spats, the globe):
   - pieDishes()            -> [{id,city,cc,ant,g}]: dishes that work today (POP there, not down, landing rights held)
   - pieHubs()              -> ['short',…]: crusts that carry traffic (over 40%, all of it from 60%: pieCarry) and up (not in safe mode, not down)
   - pieLicOk(cc)           -> true when landing rights in that country are held and in force
   - pieCov(id), pieBaked(id), pieCarry(id), pieCap(id), pieUp(id), pieLive(id), pieLiveLas(id)   (10-catalog/70-pie.js and below)
   - PIE_ON.day / .launch / .fail: arrays of f(d) / f(L,ok) / f(L), called by pieDay() and pieFly()
   - S.pie.spat[id] with PIE_SPATS[id]={fix(o,s),day?(o,d),end?(o)}: a spat's state, repaired by pieSanitize(), ticked and
     dropped when o.until<=d by pieSpatDay(d)
   - S.pie.crusts[id].down: day a crust is out until (a solar storm); S.pie.dishes[i].down likewise (a backhoe)
   - pieGlobeData()         -> {crusts:[{id,alt,inc,n,las}],dishes:[{city,lat,lon,up,u}],pads:[{city,lat,lon,next}],
                                launches:[{id,rk,cr,n,day,pad}],flows:[{id,k:'c'|'t'|'b',g,pts:[city,city],alt?}],hi}
   - pieFounder(k,{n,c})    -> a Founder post (k from FOUNDER_POSTS); pieCharge(v) bills a cost (book kept)
   - book.earned: revenue from orbit, for the customers that come with routing. */
function pieBlank(day){const crusts={};for(const id in CRUSTS)crusts[id]={cohorts:[],queued:0};
  return {born:day,co:null,fac:false,lines:1,stock:0,rd:{reuse:false,heavy:false,heavyTests:0,las:false,vband:false,eband:false},pads:[],crusts,dishes:[],lic:{},q:[],opt:{ins:false,las:false,all:false},
    founder:{posts:[],promises:0,broken:0,due:[],jit:0,next:0,kid:0,bill:0,nerv:0,hype:0,leak:0,mars:0},book:{spent:0,earned:0,wouldHave:0},spat:{},safe:false,gov:pieGovBlank()};}
function pieInit(){if(!S.pie)S.pie=pieBlank(S.day);return S.pie;}
// The unlock: only on the Tier 1 transition of a save of this version, and only in a normal game.
function pieUnlock(){if(S.pie||!(S.pieV>=1)||S.mode!=='normal'||S.scn)return;pieInit();track('pie_unlock');
  toast(`<b>🥧 ${tr('pie.unlocked_title')}</b><br>${tr('pie.unlocked_body')}`,'goal',[{l:tr('pie.open_pie_control'),act:'pieOpen',args:{}}]);}
// Sandbox: there from day 0, created on the first action.
const pieGet=()=>pieOn()?S.pie||pieInit():null;
const pieSand=()=>S.mode==='sandbox';
const pieCoName=()=>{const n=S.pie&&S.pie.co&&S.pie.co.name;return !n?tr(PIE_NAMES[0]):PIE_NAMES.includes(n)?tr(n):n;};
// What it costs: sandbox pays nothing real but keeps count of what it would have paid.
function pieSpend(v){const P=S.pie;if(pieSand()){P.book.wouldHave+=v;sfx('build');return true;}if(!spend(v))return false;P.book.spent+=v;return true;}
function pieCharge(v){const P=S.pie;if(!P||!(v>0))return;if(pieSand())P.book.wouldHave+=v;else{S.cash-=v;P.book.spent+=v;}}
function pieMo(){const P=S.pie;if(!P||!P.co)return 0;return PIE_CO_MO+(P.fac?PIE_FAC_MO+(P.lines-1)*PIE_LINE_MO:0)+P.pads.reduce((a,p)=>a+PIE_PAD_MO+(p.t-1)*PIE_TOWER_MO,0)+P.dishes.length*PIE_DISH_MO;}
const pieLiveLas=id=>{const c=S.pie&&S.pie.crusts[id];let n=0;if(pieLasCut(id))return 0;if(c)for(const k of c.cohorts)if(k.las)n+=pieAlive(k,CRUSTS[id].life);return Math.round(n);};
const pieLicOk=cc=>{const l=S.pie&&S.pie.lic[cc];return !!l&&l.state==='ok'&&l.until>S.day;};
function pieDishes(){const P=S&&S.pie;if(!P)return [];const o=[];for(const x of P.dishes){if(!S.pops[x.city]||x.down>S.day)continue;const cc=CITY[x.city].cc;if(pieLicOk(cc))o.push({id:x.id,city:x.city,cc,ant:x.ant,g:x.ant*pieAntG(x)*pieDishMul(x)});}return o;}
// Gbps an antenna of this dish carries, by its band; the best band researched; what an antenna costs there.
const pieAntG=x=>PIE_ANT_G*PIE_BAND[x.band||0],pieBandMax=()=>S.pie.rd.eband?2:S.pie.rd.vband?1:0,pieAntPrice=b=>Math.round(piePrice(PIE_ANT)*PIE_BAND_PRICE[b||0]);
function pieHubs(){return S&&S.pie?Object.keys(CRUSTS).filter(pieUp):[];}
const PIE_LOG=[];
function pieGlobeData(){const P=S&&S.pie;if(!P)return {crusts:[],dishes:[],pads:[],launches:[]};const ll=c=>({city:c,lat:CITY[c].lat,lon:CITY[c].lon}),Q=R&&R.pie,ld=Q&&Q.load||{};
  // Traffic from the last compute: sky circuits dish to dish (k 'c'), terminals from their city to their dish (k 't'), and a
  // cut-off POP's backhaul up from its dish and down at the landing dish (k 'b').
  const flows=[],hi=UI.pieHi||null;if(Q&&Q.flows)for(const f of Q.flows){if(!(f.g>0)&&f.id!==hi)continue;if(f.k==='c'&&f.via.length>1)flows.push({id:f.id,k:'c',g:f.g,pts:[f.via[0],f.via[f.via.length-1]],alt:f.cr?CRUSTS[f.cr].alt:550});
    else if(f.k==='t'&&f.dish)flows.push({id:f.id,k:'t',g:f.g,pts:[f.city,f.dish]});
    else if(f.k==='b')flows.push({id:f.id,k:'b',g:f.g,pts:[f.city,f.dish],alt:CRUSTS[f.cr].alt});}
  return {crusts:Object.keys(CRUSTS).map(id=>({id,alt:CRUSTS[id].alt,inc:CRUSTS[id].inc,n:pieLive(id),las:pieLiveLas(id)})),
    dishes:P.dishes.map(x=>({...ll(x.city),up:!(x.down>S.day),u:ld[x.city]})),pads:P.pads.map(p=>({...ll(p.city),next:p.next})),launches:P.q.map(L=>({id:L.id,rk:L.rk,cr:L.cr,n:L.n,day:L.day,pad:L.pad})),flown:PIE_LOG.filter(x=>x.day<=S.day&&S.day-x.day<=60&&P.pads.some(p=>p.city===x.pad)).map(x=>({pad:x.pad,ok:x.ok,rk:x.rk})),
    flows:flows.sort((a,b)=>b.g-a.g),hi:UI.pieHi||null,
    // The Dishes tab: every POP without a dish and the picked city; satellites hidden on request, on every tab.
    pops:UI.pieTab==='dish'?Object.keys(S.pops).filter(c=>!P.dishes.some(x=>x.city===c)).map(c=>({city:c})):[],focus:UI.pieTab==='dish'?UI.pieFocus||null:null,noSats:!!UI.pieNoSats};}
// Spats (geopolitics) register in PIE_SPATS and keep their state in S.pie.spat; this ticks and ends them.
function pieSpatDay(d){const sp=S.pie.spat;for(const k of Object.keys(sp)){const o=sp[k],D=PIE_SPATS[k];if(!D||o.until<=d){delete sp[k];if(D&&D.end)D.end(o);continue;}if(D.day)D.day(o,d);}}
const pieYear=d=>1+Math.floor(d/360);
function pieFounder(k,v={}){const F=S.pie.founder,p={d:S.day,k};if(v.n!==undefined)p.n=v.n;if(v.c)p.c=v.c;F.posts.unshift(p);if(F.posts.length>PIE_POSTS)F.posts.length=PIE_POSTS;}
// Every promise slips by a year: made today, due in a year, broken then.
function piePromise(k=N_('pie.fp_promise')){const F=S.pie.founder;F.promises++;const due=S.day+360;F.due.push(due);if(F.due.length>8)F.due.shift();pieFounder(k,{n:pieYear(due)});return due;}
function pieFpText(p){const C=own(CRUSTS,p.c||'')?tr(CRUSTS[p.c].n):'',n=p.n||0,K=pieKid();return tr(p.k,{co:pieCoName(),n,crust:C,kid:K?K.n:'',nick:K?K.k:''});}
// Pads that can reach a crust: an orbit's inclination is at least the pad's latitude.
const piePadOk=(c,cr)=>CRUSTS[cr].polar||Math.abs(CITY[c].lat)<=CRUSTS[cr].inc;
const pieRkOk=rk=>{const R0=ROCKETS[rk];return !R0.rd||!!S.pie.rd[R0.rd];};
const pieTests=()=>S.pie.rd.heavyTests+S.pie.q.filter(L=>L.test).length;
// A quote for a launch: why not, or what it costs, when and from where. The panel and the action both use it.
function pieQuote(rk,cr,o={}){const P=S.pie;if(!P||!own(ROCKETS,rk)||!own(CRUSTS,cr))return {why:tr('pie.why_pick')};const R0=ROCKETS[rk],C=CRUSTS[cr];
  if(!pieCanBuild())return {why:tr('pie.why_not_t1')};
  if(!P.co)return {why:tr('pie.why_no_company')};if(!P.fac)return {why:tr('pie.why_no_factory')};
  if(!pieRkOk(rk))return {why:tr('pie.why_no_rd',{rd:tr(PIE_RD[R0.rd].n)})};
  const pads=P.pads.filter(p=>piePadOk(p.city,cr));if(!P.pads.length)return {why:tr('pie.why_no_pad')};if(!pads.length)return {why:tr('pie.why_pad_lat',{inc:C.inc})};
  if(P.q.length>=PIE_Q_MAX)return {why:tr('pie.why_queue_full')};
  const test=rk==='heavy'&&pieTests()<PIE_HEAVY_TESTS,n=test?0:R0.pies;
  if(!test&&P.stock<n)return {why:tr('pie.why_stock',{n,have:Math.floor(P.stock)})};
  // Past the ceiling only while pies without lasers are left to replace (the crust may end a launch's worth over it).
  {const t=pieLive(cr)+P.crusts[cr].queued,cap=C.full*PIE_SPARE;if(!test&&t+n>cap&&!(P.rd.las&&t<cap+pieNoLas(cr)))return {why:tr('pie.why_full')};}
  const t0=S.day+leadDays(PIE_PREP),pad=pads.slice().sort((a,b)=>Math.max(t0,a.next)-Math.max(t0,b.next)||Math.abs(CITY[a.city].lat)-Math.abs(CITY[b.city].lat))[0];
  const rocket=piePrice(R0.cost)*(1-pieEq(pad.city))*pieCrMul(cr),boost=rk==='again'&&!pad.boosters.length?piePrice(PIE_BOOST):0,pies=n*piePrice(PIE_PIE+(o.las?PIE_LAS:0));
  const ins=o.ins&&!test?Math.round((rocket+pies)*PIE_INS*pieInsMul()):0;
  return {ok:true,test,n,pad:pad.city,day:Math.max(t0,pad.next),cost:Math.round(rocket+boost+pies+ins),insured:Math.round(rocket+pies),ins:!!ins};}
// The cheapest a crust can be filled from nothing (one-off costs only): rule O7.
function pieFullCost(cr){const C=CRUSTS[cr],base=PIE_CO+PIE_FAC+PIE_PAD,pies=C.full*PIE_PIE;
  return base+pies+Math.min(...Object.keys(ROCKETS).map(rk=>{const R0=ROCKETS[rk],n=Math.ceil(C.full/R0.pies);return (R0.rd?PIE_RD[R0.rd].cost:0)+(n+(rk==='heavy'?PIE_HEAVY_TESTS:0))*R0.cost;}));}
/* The Launch tab's forecast: how long until crust cr is full at today's pace, or null (no factory, no pad that reaches it,
   no rocket). The rocket is the one last queued for it, else the one that lifts most a day. Each pad flies one every
   leadDays(gap)/towers (pieLaunch sets pad.next), so the pads lift pies/gap a day per tower; the factory adds pieFacMonth() a month,
   and pies on the shelf and in the queue let the pads outrun it until they are gone. Wear and failures are left out:
   it says "about". pad: true when the pads, not the factory, set the pace (another pad would help). */
function piePace(cr){const P=S.pie;if(!P||!P.fac||!own(CRUSTS,cr))return null;const need=Math.max(0,CRUSTS[cr].full-pieLive(cr)),pads=P.pads.filter(p=>piePadOk(p.city,cr)).reduce((a,p)=>a+p.t,0);if(!pads)return null;
  const use=rk=>pieRkOk(rk)&&!(rk==='heavy'&&pieTests()<PIE_HEAVY_TESTS),rate=rk=>ROCKETS[rk].pies/leadDays(ROCKETS[rk].gap);
  const L=P.q.filter(x=>x.cr===cr&&!x.test).sort((a,b)=>b.day-a.day)[0],rk=L&&use(L.rk)?L.rk:Object.keys(ROCKETS).filter(use).sort((a,b)=>rate(b)-rate(a))[0];if(!rk)return null;
  const rp=pads*rate(rk),rf=pieFacMonth()/30,st=P.stock+P.crusts[cr].queued;let days;
  if(rp<=rf)days=need/rp;else{const t=st/(rp-rf);days=need<=rp*t?need/rp:t+(need-rp*t)/rf;}
  return {days:Math.ceil(days),rk,mo:Math.round(Math.min(rp,rf)*30),pad:rp<=rf};}
// Where another pad would help crust cr most: the coastal POP nearest the equator that has none and reaches it.
function piePadTip(cr){const P=S.pie;return Object.keys(S.pops).filter(c=>!P.pads.some(p=>p.city===c)&&piePadOk(c,cr)).sort((a,b)=>Math.abs(CITY[a].lat)-Math.abs(CITY[b].lat)).find(pieCoast)||null;}
function pieCohort(cr,n,las){const c=S.pie.crusts[cr],m=Math.floor(S.day/30),k=c.cohorts.find(x=>x.las===las&&Math.floor(x.day/30)===m);if(k)k.n+=n;else c.cohorts.push({n,day:S.day,las});
  if(c.cohorts.length>PIE_COHORTS)c.cohorts.splice(0,c.cohorts.length-PIE_COHORTS);}
// A launch: every one costs a party; a test always ends in a fireball; the rest fail by the rocket's odds and the chaos rule,
// never in the first 90 days after the unlock.
function pieFly(L){const P=S.pie,R0=ROCKETS[L.rk],C=P.crusts[L.cr],pad=P.pads.find(p=>p.city===L.pad);C.queued=Math.max(0,C.queued-L.n);
  pieCharge(PIE_PARTY);S.stats.pieLaunch=(S.stats.pieLaunch||0)+1;
  const quiet=S.day-P.born<PIE_QUIET,cm=quiet?0:chaosMul();let b=null;
  if(L.rk==='again'&&pad){if(!pad.boosters.length){pad.boosters.push({id:uid(),flights:0});}b=pad.boosters.slice().sort((x,y)=>x.flights-y.flights)[0];}
  let ok;
  if(L.test){ok=false;P.rd.heavyTests=Math.min(PIE_HEAVY_TESTS,P.rd.heavyTests+1);pieFounder(N_('pie.fp_test'),{n:P.rd.heavyTests});
    toast(tr('pie.t_test',{n:P.rd.heavyTests,left:PIE_HEAVY_TESTS-P.rd.heavyTests}),'bad');}
  else{ok=!(cm>0&&Math.random()<R0.fail*cm);
    if(ok){pieCohort(L.cr,L.n,!!L.las);if(L.las)pieSwap(L.cr);pieFounder(N_('pie.fp_launch'),{n:L.n,c:L.cr});toast(tr('pie.t_launch',{n:L.n,crust:tr(CRUSTS[L.cr].n),p:pct(pieCov(L.cr))}),'good');}
    else{S.stats.pieFail=(S.stats.pieFail||0)+1;if(L.ins)pieRefund(L.cost);pieFounder(N_('pie.fp_fail'));
      toast(tr('pie.t_fail',{n:L.n})+(L.ins?' '+tr('pie.t_insured',{amt:fmt$(L.cost)}):''),'bad');for(const f of PIE_ON.fail)f(L);}}
  // The globe replays the last few flights (UI only, never saved): a climb and a payload, or a fireball.
  PIE_LOG.push({pad:L.pad,ok,rk:L.rk,day:S.day});if(PIE_LOG.length>6)PIE_LOG.shift();
  if(b&&pad){if(ok&&!(cm>0&&Math.random()<(R0.land||0)*cm)){b.flights++;if(b.flights>=PIE_BOOST_MAX)pad.boosters=pad.boosters.filter(x=>x!==b);}
    else if(!L.test){pad.boosters=pad.boosters.filter(x=>x!==b);if(ok){pieFounder(N_('pie.fp_booster'));toast(tr('pie.t_booster'),'bad');}}}
  for(const f of PIE_ON.launch)f(L,ok);}
// Pies without lasers in a crust (raw count, as they wear).
function pieNoLas(cr){const c=S.pie.crusts[cr];let n=0;for(const k of c.cohorts)if(!k.las)n+=pieAlive(k,CRUSTS[cr].life);return Math.round(n);}
// Past the crust's ceiling, a lasered arrival deorbits as many pies without lasers, oldest first.
function pieSwap(cr){const c=S.pie.crusts[cr];let x=pieLive(cr)-Math.floor(CRUSTS[cr].full*PIE_SPARE);
  for(const k of c.cohorts){if(x<=0)break;if(k.las)continue;const t=Math.min(k.n,x);k.n-=t;x-=t;}c.cohorts=c.cohorts.filter(k=>k.n>=1);}
function pieRefund(v){const P=S.pie;if(pieSand())P.book.wouldHave=Math.max(0,P.book.wouldHave-v);else{S.cash+=v;P.book.spent=Math.max(0,P.book.spent-v);}}
function pieDay(d){const P=S.pie;if(!P)return;
  if(P.fac)P.stock=Math.min(pieStockMax(),P.stock+pieFacMonth()/30);
  if(P.q.length){const due=P.q.filter(L=>L.day<=d);if(due.length){P.q=P.q.filter(L=>L.day>d);for(const L of due)pieFly(L);}}
  for(const id in CRUSTS){const c=P.crusts[id],life=CRUSTS[id].life;if(c.cohorts.length&&d-c.cohorts[0].day>=life)c.cohorts=c.cohorts.filter(k=>d-k.day<life);
    if(!c.bk&&pieBaked(id)){c.bk=1;pieFounder(N_('pie.fp_baked'),{c:id});toast(tr('pie.t_baked_all',{crust:tr(CRUSTS[id].n)}),'goal');piePromise();}}
  {const F=P.founder;if(F.due.length&&F.due[0]<=d){const x=F.due.shift();F.broken++;if(F.mars&&x===F.mars)pieMarsSlip(d);else pieFounder(N_('pie.fp_slip'),{n:pieYear(d+360)});}}
  // Running costs are billed with the rest each day (compute()); the book keeps the tally, and the sandbox its shame.
  {const mo=pieMo()/30;if(mo){if(pieSand())P.book.wouldHave+=mo;else P.book.spent+=mo;}}
  pieSpatDay(d);for(const f of PIE_ON.day)f(d);}
// Badge: lost Tier 1 while a launch was still on the pad.
function pieTier(){const P=S.pie,t1=pieT1();if(P.t1&&!t1&&P.q.length&&!S.stats.pieTour){S.stats.pieTour=1;pieFounder(N_('pie.fp_tour'));}P.t1=t1;}
/* The save gate for S.pie: everything clamped, unknown crusts, rockets and cities dropped, pads and dishes only where a
   POP is. A save without pieV (older versions) never unlocks it; puzzles, scenarios and the Architect never have it. */
function pieSanitize(s){s.pieV=int(s.pieV,0,1,0);pieEximFix(s);const p=s.pie,ob=x=>x&&typeof x==='object'&&!Array.isArray(x);
  if(!ob(p)||(s.pieV<1&&s.mode!=='sandbox')||s.scn||s.mode==='puzzle'){s.pie=null;return;}
  const o=pieBlank(int(p.born,0,s.day,s.day)),day=s.day,n=(v,hi)=>int(v,0,hi,0),m=(v,hi)=>clamp(num(v,0),0,hi);
  if(ob(p.co)){const nm=p.co.name;o.co={name:typeof nm==='string'&&nm.trim()?(PIE_NAMES.includes(nm)?nm:nm.replace(/\s+/g,' ').trim().slice(0,40)):PIE_NAMES[0]};}
  if(ob(p.opt))o.opt={ins:!!p.opt.ins,las:!!p.opt.las,all:!!p.opt.all};o.fac=!!p.fac&&!!o.co;o.lines=o.fac?int(p.lines,1,PIE_LINE_MAX,1):1;o.stock=o.fac?m(p.stock,PIE_STOCK_MAX*o.lines):0;o.safe=!!p.safe;o.t1=!!p.t1;
  if(ob(p.rd)){o.rd.reuse=!!p.rd.reuse;o.rd.heavy=!!p.rd.heavy;o.rd.heavyTests=o.rd.heavy?n(p.rd.heavyTests,PIE_HEAVY_TESTS):0;o.rd.las=!!p.rd.las;o.rd.vband=!!p.rd.vband;o.rd.eband=o.rd.vband&&!!p.rd.eband;}
  const seen=new Set();
  o.pads=(Array.isArray(p.pads)?p.pads:[]).filter(x=>ob(x)&&isCity(x.city)&&s.pops[x.city]&&pieCoast(x.city)&&!seen.has(x.city)&&seen.add(x.city)).slice(0,PIE_PAD_MAX)
    .map(x=>({city:x.city,next:int(x.next,0,day+3650,day),t:int(x.t,1,PIE_TOWER_MAX,1),boosters:(Array.isArray(x.boosters)?x.boosters:[]).filter(ob).slice(0,PIE_BOOSTERS).map(b=>({id:sid0(b.id),flights:n(b.flights,PIE_BOOST_MAX-1)}))}));
  if(ob(p.crusts))for(const id in CRUSTS){const c=p.crusts[id];if(!ob(c))continue;const C=CRUSTS[id];
    o.crusts[id].cohorts=(Array.isArray(c.cohorts)?c.cohorts:[]).filter(k=>ob(k)&&num(k.n,0)>=1).map(k=>({n:n(k.n,C.full*2),day:int(k.day,0,day,day),las:!!k.las})).filter(k=>day-k.day<C.life).slice(-PIE_COHORTS);
    if(c.down!==undefined&&num(c.down,0)>day)o.crusts[id].down=int(c.down,day,day+365,day);if(c.bk)o.crusts[id].bk=1;if(c.open!==undefined)o.crusts[id].open=int(c.open,0,day,day);}
  const ds=new Set();
  o.dishes=(Array.isArray(p.dishes)?p.dishes:[]).filter(x=>ob(x)&&isCity(x.city)&&s.pops[x.city]&&!ds.has(x.city)&&ds.add(x.city)).slice(0,PIE_DISH_MAX)
    .map(x=>({id:sid0(x.id),city:x.city,ant:int(x.ant,1,PIE_ANT_MAX,1),down:int(x.down,0,day+365,0),band:Math.min(int(x.band,0,2,0),o.rd.eband?2:o.rd.vband?1:0)}));
  const ccs=new Set(CITIES.map(c=>c.cc));
  if(ob(p.lic))for(const cc of Object.keys(p.lic)){const l=p.lic[cc];if(!ccs.has(cc)||!ob(l))continue;o.lic[cc]={state:PIE_LIC_STATES.includes(l.state)?l.state:'ok',until:int(l.until,0,day+PIE_LIC_DAYS*10,0)};}
  o.q=(Array.isArray(p.q)?p.q:[]).filter(L=>ob(L)&&own(ROCKETS,L.rk)&&own(CRUSTS,L.cr)&&o.pads.some(x=>x.city===L.pad)&&(!ROCKETS[L.rk].rd||o.rd[ROCKETS[L.rk].rd])).slice(0,PIE_Q_MAX)
    .map(L=>{const t=L.rk==='heavy'&&!!L.test;return {id:sid0(L.id),rk:L.rk,cr:L.cr,pad:L.pad,n:t?0:n(L.n,ROCKETS[L.rk].pies),day:int(L.day,0,day+3650,day),cost:m(L.cost,1e10),ins:!!L.ins,las:!!L.las,test:t};});
  // Lasers used to be a launch toggle: a save that flew lasered pies (or asked for them) has the research.
  if(o.opt.las||o.q.some(L=>L.las)||Object.values(o.crusts).some(c=>c.cohorts.some(k=>k.las)))o.rd.las=true;
  for(const L of o.q)o.crusts[L.cr].queued+=L.n;
  if(ob(p.founder)){const F=p.founder;o.founder.promises=n(F.promises,1e6);o.founder.broken=n(F.broken,o.founder.promises);
    o.founder.posts=(Array.isArray(F.posts)?F.posts:[]).filter(x=>ob(x)&&FOUNDER_POSTS.includes(x.k)).slice(0,PIE_POSTS).map(x=>{const q={d:int(x.d,0,day,day),k:x.k};if(x.n!==undefined)q.n=n(x.n,1e7);if(own(CRUSTS,x.c||''))q.c=x.c;return q;});
    o.founder.due=(Array.isArray(F.due)?F.due:[]).map(v=>int(v,0,day+720,day)).sort((a,b)=>a-b).slice(-8);pieAnticFix(o.founder,F,day);}
  if(ob(p.book))for(const k of ['spent','earned','wouldHave'])o.book[k]=m(p.book[k],1e15);
  if(ob(p.spat))for(const k of Object.keys(p.spat)){const D=PIE_SPATS[k];if(!D||!ob(p.spat[k]))continue;const v=D.fix?D.fix(p.spat[k],s):null;if(v)o.spat[k]=v;}
  o.gov=pieGovFix(p.gov,s);
  s.pie=o;}
const sid0=v=>typeof v==='string'&&v&&v.length<=40?v:uid();
