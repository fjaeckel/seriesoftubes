/* ---------- Standing orders (#98) ----------
   A NOC intern runs the player's standing orders once per game day. Every job goes through the same action a click
   would (ACT.*, pniPlace, the #185/#192 planners), so it costs exactly what the click costs, with toasts and redraws
   muted and one recompute at the end. Without an intern nothing here runs and no random numbers are drawn. */
const INTERN_MO=6000,OPS_LOG=12,OPS_CAPS=[10000,50000,250000,1e6,5e6,0],OPS_CAPS_MO=[1000,2500,5000,10000,25000,0],OPS_FLOORS=[0,50000,250000,1e6,5e6];
// Every intern runs every order, the same way and at the same price; each is better at one part of the job (g: what).
// Annie peers: the IX order every day, the PNI order twice a week. Kevin does maintenance: two line systems a night,
// and never a fat finger. Tracy plans ahead: the capacity orders act as if traffic were OPS_AHEAD higher already.
const INTERNS={
 annie:{i:'📡',n:N_('ops.anycast_annie'),s:N_('ops.annie'),d:N_('ops.annie_d'),g:N_('ops.good_annie')},
 kevin:{i:'🌙',n:N_('ops.kevin_from_the_night_shift'),s:N_('ops.kevin'),d:N_('ops.kevin_d'),g:N_('ops.good_kevin')},
 tracy:{i:'🧭',n:N_('ops.tracy_route'),s:N_('ops.tracy'),d:N_('ops.tracy_d'),g:N_('ops.good_tracy')},
};
const OPS_AHEAD=1.1,opsIs=id=>!!S&&!!S.ops&&S.ops.intern===id,opsAhead=()=>opsIs('tracy')?OPS_AHEAD:1;
// Deals are not the intern's: the sales desk signs them (39-sales-auto.js).
// The orders, in the order the panel shows them. pop: can be switched off per POP. cap: default monthly budget, of setup
// fees, or (mo) of the running costs the order adds, for caches, which are free to rack but cost rent every month.
const OPS=[
 {k:'transit',i:'📈',pop:1,cap:50000,t:N_('ops.o_transit'),d:N_('ops.o_transit_d'),p:{x:{d:1.5,v:[1.25,1.5,2,3],l:N_('ops.p_x'),f:v=>v+'×'},prov:{d:'cheap',ok:v=>v==='cheap'||v==='have'||(isNet(v)&&!!NET[v].price),l:N_('ops.p_prov')}}},
 {k:'ports',i:'🔌',pop:1,cap:50000,t:N_('ops.o_ports'),d:N_('ops.o_ports_d'),p:{x:{d:1.5,v:[1.25,1.5,2,3],l:N_('ops.p_x'),f:v=>v+'×'}}},
 {k:'routers',i:'🧠',pop:1,cap:250000,t:N_('ops.o_routers'),d:N_('ops.o_routers_desc'),p:{at:{d:80,v:[60,70,80,90],l:N_('ops.p_at'),f:v=>v+'%'},how:{d:'auto',v:['auto','add','swap'],l:N_('ops.p_how'),f:v=>tr({auto:N_('ops.how_auto'),add:N_('ops.how_add'),swap:N_('ops.how_swap')}[v])},
   // A model to standardize on: every POP on a smaller one is swapped to it, busiest first, within the budget.
   model:{d:'next',ok:v=>v==='next'||(Number.isInteger(v)&&!!RG[v]),l:N_('ops.p_model'),f:v=>v==='next'?tr('ops.model_next'):RG[v].n}}},
 {k:'caches',i:'📦',pop:1,cap:5000,mo:1,t:N_('ops.o_caches'),d:N_('ops.o_caches_d'),p:{g:{d:5,v:[1,5,10,25,50],l:N_('ops.p_g'),f:v=>fmtG(v)}}},
 {k:'ix',i:'🔀',t:N_('ops.o_ix'),d:N_('ops.o_ix_d'),p:{}},
 {k:'pni',i:'🤝',pop:1,cap:50000,t:N_('ops.o_pni'),d:N_('ops.o_pni_d'),p:{g:{d:25,v:[5,10,25,50,100],l:N_('ops.p_g'),f:v=>fmtG(v)},tier:{d:0,v:[0,1,2],l:N_('ops.p_tier'),f:v=>tr('ops.at_least_port',{port:PORT[v].n})},paid:{d:false,v:[false,true],l:N_('ops.p_paid'),f:v=>v?tr('common.on'):tr('common.off')}}},
 {k:'repair',i:'🔧',cap:50000,t:N_('ops.o_repair'),d:N_('ops.o_repair_d'),p:{}},
 {k:'optics',i:'🌈',cap:250000,t:N_('ops.o_optics'),d:N_('ops.o_optics_d'),p:{at:{d:70,v:[50,60,70,80,90],l:N_('ops.p_at'),f:v=>v+'%'},pick:{d:'cheap',v:['cheap','big'],l:N_('ops.p_pick'),f:v=>tr({cheap:N_('ops.pick_cheap'),big:N_('ops.pick_big')}[v])}}},
 // Line systems up to a bigger one, and optics swapped for bigger ones, on fiber that is full and runs hot, or every fiber up to
 // a chosen line system. A line system swap is a day without that fiber: only where the traffic gets around it.
 {k:'optup',i:'🔭',cap:250000,t:N_('ops.o_optup'),d:N_('ops.o_optup_d'),p:{at:{d:80,v:[60,70,80,90],l:N_('ops.p_at'),f:v=>v+'%'},
   sys:{d:'next',v:['next','roadm','cl'],l:N_('ops.p_sys'),f:v=>v==='next'?tr('ops.sys_next'):DF_SYS[v].n},swap:{d:true,v:[true,false],l:N_('ops.p_swap'),f:v=>v?tr('common.on'):tr('common.off')}}},
 {k:'decom',i:'🧹',t:N_('ops.o_decom'),d:N_('ops.o_decom_d'),p:{keep:{d:true,v:[true,false],l:N_('ops.p_keep'),f:v=>v?tr('common.on'):tr('common.off')}}},
];
const OPSK=Object.fromEntries(OPS.map(o=>[o.k,o])),OPS_POP=OPS.filter(o=>o.pop).map(o=>o.k);
const OPS_TPL=['bb','transit','ix','kit'];
// What the shift log can say. One line per day: "{name} did this, that and the other."
const OPS_SAY={transit:N_('ops.l_transit'),ports:N_('ops.l_ports'),routers:N_('ops.l_routers'),caches:N_('ops.l_caches'),rs:N_('ops.l_rs'),peer:N_('ops.l_peer'),pni:N_('ops.l_pni'),repair:N_('ops.l_repair'),optics:N_('ops.l_optics'),optup:N_('ops.l_optup'),optswap:N_('ops.l_optswap'),decom:N_('ops.l_decom'),broke:N_('ops.l_broke'),snag:N_('ops.l_snag')};
// Fat fingers: rare, visible, harmless. Only the LAG one costs anything, and only a little.
const OPS_FF=[N_('ops.ff_desc'),N_('ops.ff_hostname'),N_('ops.ff_typo'),N_('ops.ff_lag'),N_('ops.ff_ping')];
const OPS_FF_RATE={oncall:1/150,bgp:1/60};
function opsNew(){return {intern:null,hired:0,on:Object.fromEntries(OPS.map(o=>[o.k,false])),p:{},cap:{},spent:Object.fromEntries(OPS.filter(o=>o.cap).map(o=>[o.k,0])),addMo:{},mon:0,skip:{},log:[],wk:null,rep:null,floor:50000,tpl:{bb:true,transit:true,ix:true,kit:true}};}
const opsO=()=>S.ops||(S.ops=opsNew());
const opsHired=()=>!!(S&&S.ops&&S.ops.intern&&own(INTERNS,S.ops.intern));
const opsCanHire=()=>lvl()>=2;
const opsName=(long)=>{const I=INTERNS[S.ops.intern];return I?tr(long?I.n:I.s):'';};
function opsP(k,p){const P=OPSK[k].p[p],v=S.ops.p[k]&&S.ops.p[k][p];return v!==undefined&&(P.ok?P.ok(v):P.v.includes(v))?v:P.d;}
// Every value a setting can take, in the order its list shows them: providers that sell where you have POPs, and router
// models you can buy, smallest first. The current value is always on the list, so the list can show it.
function opsOpts(k,p){const cur=opsP(k,p),L=p==='prov'?['cheap','have',...NETS.filter(n=>n.price&&Object.keys(S.pops).some(c=>sellsAt(n,c))).map(n=>n.id)]
  :p==='model'?['next',...RG.map((r,i)=>i).filter(i=>rgOpen(i)).sort((a,b)=>RG[a].cls-RG[b].cls||RG[a].cap-RG[b].cap||a-b)]:OPSK[k].p[p].v.slice();
  if(!L.includes(cur))L.push(cur);return L;}
const opsCaps=k=>OPSK[k].mo?OPS_CAPS_MO:OPS_CAPS;
function opsCap(k){const c=S.ops.cap[k];return opsCaps(k).includes(c)?c:OPSK[k].cap||0;}
const opsHere=(k,c)=>!(S.ops.skip[c]||[]).includes(k);
const opsPops=k=>Object.keys(S.pops).filter(c=>opsHere(k,c));
// Saves are untrusted: rebuild ops from known orders, params, cities and log shapes. Runs after the POPs are repaired,
// so exceptions only survive for POPs that still exist. Old saves get no intern, and the #185 auto-repair toggle becomes
// the repair order. A sales order the intern was running moves to the sales desk (slAutoFrom); #185's auto-accept never
// ran without an intern, so it goes.
function opsSanitize(s){const o=s.ops&&typeof s.ops==='object'&&!Array.isArray(s.ops)?s.ops:{},n=opsNew(),ob=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  n.intern=typeof o.intern==='string'&&own(INTERNS,o.intern)?o.intern:null;n.hired=int(o.hired,0,1e7,0);n.mon=int(o.mon,0,1e6,0);
  n.floor=OPS_FLOORS.includes(o.floor)?o.floor:n.floor;
  const on=ob(o.on),p=ob(o.p),cap=ob(o.cap),sp=ob(o.spent);
  for(const d of OPS){const k=d.k;n.on[k]=on[k]===true;const q=ob(p[k]),r={};
    for(const pk of Object.keys(d.p)){const P=d.p[pk];if(own(q,pk)&&(P.ok?P.ok(q[pk]):P.v.includes(q[pk])))r[pk]=q[pk];}n.p[k]=r;
    if(d.cap&&opsCaps(k).includes(cap[k]))n.cap[k]=cap[k];if(d.cap)n.spent[k]=Math.max(0,num(sp[k],0));
    {const v=num(ob(o.addMo)[k],0);if(v)n.addMo[k]=Math.max(-1e9,Math.min(1e9,v));}}
  {const t=ob(o.tpl);for(const k of OPS_TPL)if(typeof t[k]==='boolean')n.tpl[k]=t[k];}
  {const sk=ob(o.skip);for(const c of Object.keys(sk))if(isCity(c)&&own(s.pops,c)&&Array.isArray(sk[c])){const ks=[...new Set(sk[c].filter(k=>OPS_POP.includes(k)))];if(ks.length)n.skip[c]=ks;}}
  if(Array.isArray(o.log))n.log=o.log.map(opsLogOk).filter(Boolean).slice(0,OPS_LOG);
  n.wk=opsWkOk(o.wk);n.rep=opsWkOk(o.rep);
  slAutoFrom(s,on.sales===true&&!!n.intern,ob(p.sales));if(s.autoRepair===true)n.on.repair=true;delete s.autoSales;delete s.autoRepair;
  s.ops=n;}
// A log entry: {d, i: intern, r: [[kind, n, [where…]]], f: fat-finger index, c: its city, up: paid up front, mo: running costs added}.
const opsWhereOk=w=>typeof w==='string'&&w.length<=48&&/^[a-z0-9~|]+( [+\w.×→⇧]+)?$/i.test(w)&&w.split(' ')[0].split('|').every(x=>isIx(x)||own(OPSK,x)||isNet(x));
function opsLogOk(e){if(!e||typeof e!=='object'||!own(INTERNS,e.i))return null;const r0=Array.isArray(e.r)?e.r:[],r=r0.filter(x=>Array.isArray(x)&&own(OPS_SAY,x[0])&&Array.isArray(x[2])).map(x=>[x[0],int(x[1],1,1e6,1),x[2].filter(opsWhereOk).slice(0,3)]).slice(0,16);
  const f=Number.isInteger(e.f)&&OPS_FF[e.f]?e.f:undefined,up=int(e.up,0,1e12,0),mo=int(e.mo,-1e9,1e9,0);
  // A day that only signed or declined deals (the retired sales order) has nothing left to say.
  if(r0.length&&!r.length&&f===undefined&&!up&&!mo)return null;
  return {d:int(e.d,0,1e7,0),i:e.i,r,...(f!==undefined&&isCity(e.c)?{f,c:e.c}:{}),...(up?{up}:{}),...(mo?{mo}:{})};}
// A week's tally, for the shift report and the one NOC notice a week: {w: week, i: intern, n: {kind: count}, wh: {kind: [where…]}, up, mo, ff}.
function opsWkOk(x){if(!x||typeof x!=='object'||Array.isArray(x)||!own(INTERNS,x.i))return null;const n={},wh={},xn=x.n&&typeof x.n==='object'?x.n:{},xw=x.wh&&typeof x.wh==='object'?x.wh:{};
  for(const k of Object.keys(OPS_SAY)){if(own(xn,k)){const v=int(xn[k],0,1e6,0);if(v)n[k]=v;}if(own(xw,k)&&Array.isArray(xw[k])){const w=xw[k].filter(opsWhereOk).slice(0,3);if(w.length)wh[k]=w;}}
  // A tally of only the retired sales order says nothing any more.
  const ff=int(x.ff,0,7,0);if(Object.keys(xn).length&&!Object.keys(n).length&&!ff)return null;
  return {w:int(x.w,0,1e6,0),i:x.i,n,wh,up:int(x.up,0,1e12,0),mo:int(x.mo,-1e9,1e9,0),ff};}
const opsWkNew=w=>({w,i:S.ops.intern,n:{},wh:{},up:0,mo:0,ff:0});
const opsWkAny=x=>!!x&&(Object.keys(x.n).length>0||x.ff>0);
// "Kevin's week: topped up transit 2 times (Frankfurt +1×100G), rushed a repair. Week total: …"
function opsWeekLine(x){const I=INTERNS[x.i],name=I?tr(I.s):'',ks=Object.keys(x.n).sort((a,b)=>(a==='broke')-(b==='broke'));
  const parts=ks.map(k=>trn(OPS_SAY[k],x.n[k],{where:(x.wh[k]||[]).map(w=>opsWhere(w,k)).join(', ')}));
  if(x.ff)parts.push(trn('ops.w_oops',x.ff));
  return tr('ops.w_line',{name,list:parts.join(', ')})+(x.up||x.mo?' '+tr('ops.w_money',{cost:fmt$(x.up),mo:opsMo$(x.mo)}):'');}
// The intern's mood, from what the week has been like. No dice: the same day always reads the same.
function opsMood(){const O=S.ops,x=O.wk&&O.wk.w===Math.floor(S.day/7)?O.wk:null,n=x?x.n:{},jobs=Object.keys(n).filter(k=>k!=='broke').reduce((a,k)=>a+n[k],0);
  const k=S.day-O.hired<7?'new':x&&x.ff?'oops':n.snag?'snag':S.inc.some(i=>i.until>S.day&&i.type!=='ddos')?'outage':n.broke?'broke':jobs>=5?'busy':S.day%2?'quiet':O.intern;
  return tr({new:N_('ops.mood_new'),oops:N_('ops.mood_oops'),snag:N_('ops.mood_snag'),outage:N_('ops.mood_outage'),broke:N_('ops.mood_broke'),busy:N_('ops.mood_busy'),quiet:N_('ops.mood_quiet'),
    annie:N_('ops.mood_annie'),kevin:N_('ops.mood_kevin'),tracy:N_('ops.mood_tracy')}[k],{name:opsName()});}
// "fra +1×100G", "fra|ams", "ams~3", "transit" (an order, for the budget line) or "ggl" (a network).
// Peering is always at an exchange, and a city's first exchange has the city's id ("lon" is LYNX): name the exchange (#228).
function opsWhere(w,k){if(k==='peer'&&isIx(w)&&ixName(w))return ixName(w);const [a,x]=w.split(' '),nm=a.split('|').map(p=>own(OPSK,p)?tr(OPSK[p].t):isCity(p)?CITY[p].name:isNet(p)?NET[p].name:ixName(p)).join('–');return x?nm+' '+(isNet(x)?NET[x].name:x):nm;}
function opsLine(e){const I=INTERNS[e.i],name=I?tr(I.s):'',parts=e.r.map(([k,n,w])=>trn(OPS_SAY[k],n,{where:w.map(x=>opsWhere(x,k)).join(', ')}));
  return (parts.length?tr('ops.l_line',{name,list:parts.join(', ')}):tr('ops.l_quiet',{name}))+opsPaid(e);}
const opsMo$=v=>(v>0?'+':'')+fmt$(v);
const opsPaid=e=>e.up||e.mo?' '+tr('ops.l_paid',{cost:fmt$(e.up||0),mo:opsMo$(e.mo||0)}):'';
// What the network costs every month before traffic: what a job adds to the bill (ports, routers, rent, links, cache boxes).
// PNIs count from the day they are ordered, at the size they are going to be.
function opsMoNow(){let m=cachesMo();
  for(const c in S.pops){const p=S.pops[c],rt=p.routers||1;m+=(rt-1)*ROUTER_MO+cageMo(rt)+rt*RG[p.rgen||0].mo;}
  for(const l of S.links)m+=(l.mo||0)+(l.kind==='df'?(l.spares?Math.round(150+(l.ch||[]).length*80):0)+(l.regen|0)*REGEN_MO:0);
  for(const t of S.transit)m+=transitMo(t,0);
  for(const p of S.pni){const q=p.up||p,N=NET[p.net];m+=(q.g1?Math.round(PORT[0].pni/2):PORT[q.tier].pni)*(q.n||1)+(N.pol==='paid'&&!paidFree(N)?N.paidFee:0);}
  for(const c in S.ixp)if(!S.myIx[c])m+=ixPortMo(c,S.ixp[c])*((S.ixn||{})[c]||1);
  return m;}
const opsFFLine=e=>tr('ops.ff_line',{name:tr(INTERNS[e.i].s),what:tr(OPS_FF[e.f],{city:CITY[e.c].name})});
// Mute what a click would show (toasts, sounds, floaters, the full redraw) and keep the player's selection.
function opsQuiet(fn){const a=after,t=toast,s=sfx,f=floater,sel=UI.sel,cf=UI.confirm,tab=UI.tab;after=()=>{};toast=()=>{};sfx=()=>{};floater=()=>{};
  try{return fn();}finally{after=a;toast=t;sfx=s;floater=f;UI.confirm=cf;UI.tab=tab;UI.sel=sel&&(sel.type!=='link'||S.links.some(l=>l.id===sel.id))&&(sel.type!=='city'||isCity(sel.id))?sel:null;}}
// One shift's bookkeeping: what got done, and whether a job had to wait for next month's budget.
// dirty: a job changed the network, so R (loads, routing) is out of date until the next compute().
// up/mo: what this shift paid up front and added to the monthly bill.
function opsShift(){const r=new Map(),broke=new Set();
  return {r,broke,dirty:false,up:0,mo:0,did(k,w){this.dirty=true;const x=r.get(k)||{n:0,w:[]};x.n++;if(w&&x.w.length<3&&!x.w.includes(w))x.w.push(w);r.set(k,x);},
    // A job that costs nothing up front still has to pass the cash floor if it adds to the monthly bill.
    // quiet: only asking, so a no is not logged as the budget running out.
    can(k,cost,mo=0,quiet){const O=S.ops,cap=opsCap(k);if(cost<=0&&!(mo>0))return true;
      if(S.cash-Math.max(0,cost)<O.floor||(cap&&(OPSK[k].mo?(O.addMo[k]||0)+mo:(O.spent[k]||0)+cost)>cap)){if(!quiet)broke.add(k);return false;}return true;},
    book(k,d,dm){const O=S.ops;if(d>0){this.up+=d;if(OPSK[k].cap)O.spent[k]=(O.spent[k]||0)+d;}if(dm){this.mo+=dm;O.addMo[k]=(O.addMo[k]||0)+dm;}},
    // Run a click and book what it really cost; false when the action refused (no ports, no cash, a quote changed).
    pay(k,fn){const c0=S.cash,m0=opsMoNow(),x=fn();this.book(k,c0-S.cash,opsMoNow()-m0);return x===undefined?c0-S.cash>0:x;}};}
// Never buy from a provider that breaks a promise: a customer's "no Cogentle" or "two upstreams", a bank's covenant,
// or Cogentle while it is not speaking to Goggle (the Spat scenario, a de-peering). Only met → failed counts.
const OPS_TREQ=['nocog','twoup'];
function opsTransitOk(n,c){if(n.id==='cog'&&(scnRule('spat')||S.ev.depeer>S.day))return false;
  const bz=S.biz.filter(b=>(b.reqs||[]).some(k=>OPS_TREQ.includes(k))),ls=(S.loans||[]).filter(l=>(l.covs||[]).includes('nocog'));if(!bz.length&&!ls.length)return true;
  const chk=()=>bz.map(b=>b.reqs.every(k=>!OPS_TREQ.includes(k)||REQS[k].ok(b))).concat(ls.map(l=>COVS.nocog.ok(l)));
  const was=chk(),all=S.transit;S.transit=all.concat({net:n.id,city:c});try{const now=chk();return was.every((v,i)=>!v||now[i]);}finally{S.transit=all;}}
const cheapestTransit=c=>NETS.filter(n=>sellsAt(n,c)&&opsTransitOk(n,c)).sort((a,b)=>transitPerG(a,c,premOnlyAt(a,c))-transitPerG(b,c,premOnlyAt(b,c)))[0];
// 'cheap' and 'have' (Already connected) name no network: quote the cheapest seller (#249).
const opsProv=c=>{const pv=opsP('transit','prov'),n=isNet(pv)?NET[pv]:null;return n&&sellsAt(n,c)&&opsTransitOk(n,c)?n:cheapestTransit(c);};
// The orders. Each takes the shift and does its jobs through the player's own actions. Most are generators: a yield
// after a job is only a place where a long shift may let a frame through (opsRun()), nothing changes there.
const OPS_RUN={
 *repair(X){purgeInc();for(const i of S.inc.slice())if(i.type!=='ddos'&&i.until>S.day&&i.cost>0&&!(i.slow&&i.rushed)&&X.can('repair',i.cost)&&X.pay('repair',()=>ACT.fixInc({id:i.id}))){X.did('repair');yield;}},
 *routers(X){const at=opsP('routers','at')/100,how=opsP('routers','how'),m=opsP('routers','model'),fix=m!=='next',
     load=c=>Math.max((R.nodeLoad[c]||0)*opsAhead()/(R.nodeCap[c]||nodeCap(c)||1),portsUsed(c)/Math.max(1,portsMax(c)));
   // A chosen model: swap every POP still on a smaller one to it, the busiest first, while the budget lasts. Never a
   // step down, never a model that is not unlocked or does not fit, and only with a second router or no traffic there.
   if(fix&&rgOpen(m))for(const c of opsPops('routers').sort((a,b)=>load(b)-load(a))){const p=S.pops[c],g=p.rgen||0;
     if(p.rupDay===S.day||g===m||RG[m].cap<=RG[g].cap||modelFits(c,m)||!((p.routers||1)>1||popIdle(c)))continue;
     const cost=swapCost(c,m);if(!X.can('routers',cost))continue;
     if(X.pay('routers',()=>ACT.upRouter({city:c,g:m}))){X.did('routers',c+' ⇧'+RG[m].pn);yield;}}
   for(const c of opsPops('routers')){const p=S.pops[c];if(p.rupDay===S.day)continue;
     const ld=load(c);if(ld<at)continue;
     const rt=p.routers||1,g=p.rgen||0,nx=mainRG(RG[g].cls+1);
     // A swap with one router is a maintenance window: the intern only swaps where a second router carries the traffic.
     // With a chosen model the swaps are the ones above; a busy POP only gets more routers.
     const swap=!fix&&nx>=0&&rgOpen(nx)&&!modelFits(c,nx)&&(rt>1||popIdle(c)),add=rt<RMAX;
     const doSwap=how==='swap'?swap:how==='add'?false:swap&&(rt>=4||!add);if(!doSwap&&(how==='swap'||!add))continue;
     const cost=doSwap?swapCost(c,nx):routerCost(g,rt);if(!X.can('routers',cost))continue;
     if(X.pay('routers',()=>doSwap?ACT.upRouter({city:c,g:nx}):ACT.addRouter({city:c})))X.did('routers',c+(doSwap?' ⇧'+RG[nx].pn:' +1'));yield;}},
 *transit(X){if(scnRule('noTransit'))return;const N=opsP('transit','x');
   for(const c of opsPops('transit')){let ts=S.transit.filter(t=>t.city===c);if(!ts.length)continue;
     // Thirty days of 95th-percentile-ish history per port; their peaks summed is a safe (high) estimate of the POP's peak.
     const peak=ts.reduce((a,t)=>a+(t.hist||[]).reduce((m,v)=>Math.max(m,v),0),0)*opsAhead();if(!(peak>0))continue;
     // "Already connected" (#227): only the providers you buy from here, the smallest first, never a new contract.
     const have=opsP('transit','prov')==='have',n=have?null:opsProv(c);if(!have&&!n)continue;
     const grow=t=>{const k=t.n||1,up=t.tier+1;
       if(k<4&&portOk(c,t.tier))return {cost:PORT[t.tier].setup,go:()=>ACT.lagT({id:t.id,d:1}),w:'+1×'+PORT[t.tier].n};
       if(PORT[up]&&portShown(up)&&portOk(c,up))return {cost:PORT[up].setup*k,go:()=>ACT.buyTransit({city:c,net:t.net,tier:up}),w:PORT[t.tier].n+'→'+PORT[up].n};
       if(k<LAG_MAX&&portOk(c,t.tier))return {cost:PORT[t.tier].setup,go:()=>ACT.lagT({id:t.id,d:1}),w:'+1×'+PORT[t.tier].n};return null;};
     for(let step=0;step<4;step++){const cap=ts.reduce((a,t)=>a+lagCap(PORT[t.tier].g,t.n),0);if(cap>=N*peak)break;
       let job=null;
       if(have){for(const t of ts.slice().sort((a,b)=>lagCap(PORT[a.tier].g,a.n)-lagCap(PORT[b.tier].g,b.n)||transitPerG(NET[a.net],c,!!a.premium)-transitPerG(NET[b.net],c,!!b.premium))){job=grow(t);if(job)break;}}
       else{const t=ts.find(x=>x.net===n.id);
         if(t)job=grow(t);
         else{const need=N*peak-cap,ok=PORT.map((P,i)=>i).filter(i=>portShown(i)&&portOk(c,i)),i=ok.find(i=>PORT[i].g>=need)??ok.at(-1);
           if(i!==undefined)job={cost:PORT[i].setup,go:()=>ACT.buyTransit({city:c,net:n.id,tier:i}),w:'+'+PORT[i].n};}}
       if(!job||!X.can('transit',job.cost)||!X.pay('transit',job.go))break;
       X.did('transit',c+' '+job.w);ts=S.transit.filter(t=>t.city===c);yield;}}},
 // PNIs and IX ports keep Headroom times today's traffic, hottest first. One port at a POP with several routers gets a
 // second in a LAG, so it is not the only way out; anything else moves up to the smallest port size that fits. A PNI
 // augment lands weeks later, so that port waits for it. A flood fills ports for a day or two: not worth buying for.
 *ports(X){if(ddosAll().length||!X.can('ports',1,0,true))return;const N=opsP('ports','x'),L=[],
   // Router ports that pending PNI augments will take when they land are spoken for.
   resv=c=>S.pni.reduce((a,p)=>p.up&&p.city===c?a+Math.max(0,PORT_SLOT(p.up.tier)*(p.up.n||1)-PORT_SLOT(p.tier)*(p.n||1)):a,0),room=c=>portsMax(c)-portsUsed(c)+1e-9-resv(c);
   // Each port: cap() now, use today, lag() and ups() the jobs it could have as {cost, cap after, w for the log, go}, sig() to see a job took.
   for(const p of S.pni){const c=p.city,use=(R.usePni[p.id]||0)*opsAhead(),cap=()=>lagCap(pniG(p),p.n),n=()=>p.n||1;if(!pniOn(p)||p.up||!(use>0)||cap()>=N*use||!opsHere('ports',c))continue;
     L.push({city:c,at:c,use,u:use/cap(),cap,n,rt:(S.pops[c]||{}).routers||1,busy:()=>!!p.up,sig:()=>[p.tier,n(),!!p.g1,!!p.up].join(),
       lag:()=>n()<LAG_MAX&&!msfNope(p.net,c)&&PORT_SLOT(p.tier)<=room(c)?{cost:1500+PORT[p.tier].setup/2,cap:lagCap(pniG(p),n()+1),w:'+1×'+pniPN(p),go:()=>ACT.lagP({id:p.id,d:1})}:null,
       ups:()=>{const out=[];for(let t=p.g1?0:p.tier+1;t<PORT.length&&portShown(t);t++){const q=pniQuote(c,p.net,t,resv(c));if(q&&!q.why)out.push({cost:q.cost,cap:lagCap(PORT[t].g,n()),w:pniPN(p)+'→'+PORT[t].n,go:()=>ACT.pni({city:c,net:p.net,tier:t})});}return out;}});}
   // Nominal capacity, not ixCap(): a LACP fault or one building down halves a LAG for a day or two, not worth a bigger port.
   for(const x in S.ixp){const c=ixCity(x),use=(R.useIx[x]||0)*opsAhead(),n=()=>(S.ixn||{})[x]||1,cap=()=>lagCap(PORT[S.ixp[x]].g,n())*(isRemote(x)?REMOTE_CAP:1),pop=S.pops[c];if(S.myIx[x]||!(use>0)||!(cap()>0)||cap()>=N*use||!opsHere('ports',c))continue;
     const g=()=>PORT[S.ixp[x]].g;
     L.push({city:c,at:x,use,u:use/cap(),cap,n,rt:pop?pop.routers||1:1,busy:()=>false,sig:()=>S.ixp[x]+','+n(),
       lag:()=>pop&&n()<LAG_MAX&&PORT_SLOT(S.ixp[x])<=room(c)?{cost:ixPortMo(x,S.ixp[x]),cap:cap()*lagCap(g(),n()+1)/lagCap(g(),n()),w:'+1×'+PORT[S.ixp[x]].n,go:()=>ACT.lagIx({city:x,d:1})}:null,
       // A remote port (no POP there) stops at 100G; at a POP the router has to take the bigger port.
       ups:()=>{const out=[],t0=S.ixp[x];for(let t=t0+1;t<PORT.length&&portShown(t);t++){if(pop?!portOk(c,t)||(PORT_SLOT(t)-PORT_SLOT(t0))*n()>room(c):t>1)continue;
         out.push({cost:ixPortMo(x,t)*n(),cap:cap()*lagCap(PORT[t].g,n())/lagCap(g(),n()),w:PORT[t0].n+'→'+PORT[t].n,go:()=>ACT.buyIx({city:x,tier:t})});}return out;}});}
   for(const o of L.sort((a,b)=>b.u-a.u))for(let step=0;step<3&&!o.busy()&&o.cap()<N*o.use;step++){
     const lag=o.lag(),wantLag=o.n()<2&&o.rt>1,ups=wantLag&&lag?null:o.ups(),fit=ups&&(ups.find(u=>u.cap>=N*o.use)||ups.at(-1)),job=wantLag?lag||fit:fit||lag,was=o.sig();
     if(!job||!X.can('ports',job.cost)||!X.pay('ports',()=>{job.go();return o.sig()!==was;}))break;
     X.did('ports',o.at+' '+job.w);yield;}},
 *optics(X){const at=opsP('optics','at')/100,big=opsP('optics','pick')==='big',gpd=(o,l)=>optG(o,l)/optCost(o);
   for(const l of S.links){if(l.kind!=='df'||l.ready>S.day||l.eqDown>S.day||l.standby||l.cut>S.day)continue;
     let cap=dfCap(l);const load=((R.load&&R.load[l.id])||0)*opsAhead();
     // New fiber gets its first channel; lit fiber gets more while it runs hot.
     for(let step=0;step<8&&(cap<=0?!(l.ch||[]).length:load>=cap*at);step++){if(chMax(l)-(l.ch||[]).length-soldSlots(l)<=0)break;
       const cnt={};for(const k of l.ch||[])cnt[k]=(cnt[k]||0)+1;
       // More of what is already lit, or else the most Gbps per dollar that reaches. Told to go big (#262), the intern
       // picks the most Gbps per channel it can afford for a new kind of optic, but never swaps what is already lit.
       const fit=Object.keys(OPT).filter(o=>!chWhy(l,o)),cheap=fit.slice().sort((a,b)=>gpd(b,l)-gpd(a,l)),
         o=fit.filter(o=>cnt[o]).sort((a,b)=>cnt[b]-cnt[a])[0]||(big&&fit.slice().sort((a,b)=>optG(b,l)-optG(a,l)||gpd(b,l)-gpd(a,l)).find(o=>X.can('optics',opticCountCost(l,o,1),0,true)))||cheap[0];if(!o)break;
       const n=(cnt[o]||0)+1,cost=opticCountCost(l,o,n),before=(l.ch||[]).length;if(!X.can('optics',cost))break;
       X.pay('optics',()=>{ACT.setChCount({id:l.id,o,n});return (l.ch||[]).length>before;});if((l.ch||[]).length<=before)break;
       cap+=optG(o,l);X.did('optics',l.a+'|'+l.b);yield;}}},
 *optup(X){const at=opsP('optup','at')/100,goal=opsP('optup','sys'),swap=opsP('optup','swap');let ups=0,tries=0;
   const hot=l=>{const c=dfCap(l);return c>0&&((R.load&&R.load[l.id])||0)*opsAhead()>=c*at;},full=l=>freeCh(l)<=0,u=l=>((R.load&&R.load[l.id])||0)/Math.max(1,dfCap(l));
   const ls=S.links.filter(l=>l.kind==='df'&&!l.seat&&l.ready<=S.day&&!(l.eqDown>S.day)&&!(l.cut>S.day)).sort((a,b)=>u(b)-u(a));
   for(const l of ls){
     // The line system: one step at a time up to the chosen one, or the next one where the fiber is full and hot.
     const want=goal==='next'?(full(l)&&hot(l)?sysNext(l):null):SYS_RANK[l.sys]<SYS_RANK[goal]?goal:null;
     if(want&&ups<OPTUP_MAX*(opsIs('kevin')?2:1)&&tries<OPTUP_TRY*(opsIs('kevin')?2:1)){const to=sysNext(l),cost=sysUpCost(l);
       if(to&&techOk('sys',to,DF_SYS[to].lvl)&&!(OPTUP_NO.get(l.id)>S.day)&&X.can('optup',cost)){tries++;const ok=yield* opsDark(l,X);if(!ok)OPTUP_NO.set(l.id,S.day+OPTUP_WAIT);
         if(ok){const s0=l.sys,top=goal==='next'?to:goal;
           for(let k=0;k<2&&sysNext(l)&&SYS_RANK[l.sys]<SYS_RANK[top];k++){const nx=sysNext(l);
             if(!techOk('sys',nx,DF_SYS[nx].lvl)||!X.can('optup',sysUpCost(l))||!X.pay('optup',()=>{const s=l.sys;ACT.upSys({id:l.id});return l.sys!==s;}))break;}
           // The fiber is dark until tomorrow: its optics wait.
           if(l.sys!==s0){ups++;X.did('optup',l.a+'|'+l.b+' ⇧'+SYS_TAG[l.sys]);yield;continue;}}}}
     // Optics: a full, hot fiber trades its smallest channels for the biggest optic that fits, one at a time. Hitless, and
     // the old optics go on the shelf as spares.
     if(!swap)continue;
     for(let step=0;step<8&&full(l)&&hot(l);step++){const cnt={};for(const k of l.ch||[])cnt[k]=(cnt[k]||0)+1;
       const lit=Object.keys(cnt).sort((a,b)=>optG(a,l)-optG(b,l)),o1=lit[0];if(!o1)break;
       const ports=(o,c)=>S.pops[c]?chPorts(o,c):0,room=(o2,c)=>!S.pops[c]||portsUsed(c)+ports(o2,c)-ports(o1,c)<=portsMax(c)+1e-9;
       // Asked with one small channel already out: a full fiber refuses any optic.
       const ch0=l.ch,i1=ch0.indexOf(o1);l.ch=ch0.filter((k,i)=>i!==i1);let o2;
       try{o2=Object.keys(OPT).filter(o=>optG(o,l)>optG(o1,l)&&!chWhy(l,o)&&room(o,l.a)&&room(o,l.b)).sort((a,b)=>optG(b,l)-optG(a,l)||optCost(a)-optCost(b))[0];}finally{l.ch=ch0;}if(!o2)break;
       const n2=(cnt[o2]||0)+1,cost=opticCountCost(l,o2,n2);if(!X.can('optup',cost))break;
       const was=dfCap(l);
       X.pay('optup',()=>{ACT.setChCount({id:l.id,o:o1,n:cnt[o1]-1});ACT.setChCount({id:l.id,o:o2,n:n2});
         if((l.ch||[]).filter(k=>k===o2).length===n2)return true;ACT.setChCount({id:l.id,o:o1,n:cnt[o1]});return false;});
       if(!(dfCap(l)>was))break;X.did('optswap',l.a+'|'+l.b+' '+fmtCap(optG(o1,l))+'→'+fmtCap(optG(o2,l)));yield;}}},
 *caches(X){const g=opsP('caches','g');
   for(const c of opsPops('caches')){const q=utilityCaches(c);if(!q||!q.add.length)continue;
     const want=q.add.filter(x=>cacheDem(c,x.net)>=g),free=()=>portsMax(c)-portsUsed(c)+1e-9;
     for(const x of want){if(cachePortsAdd(c,[x])>free())continue;if(!X.can('caches',0,cacheMo(x)))return;S.caches.push({id:uid(),city:c,net:x.net,site:x.site,...(x.g?{g:x.g}:{})});X.book('caches',0,cacheMo(x));X.did('caches',c);}
     yield;}},
 // Weekly, like a person going through PeeringDB on a Monday: route servers, then every willing member (#192).
 ix(X){if(S.day%7&&!opsIs('annie'))return;for(const ix of utilityRouteServers()){S.rs[ix]=true;X.did('rs');}
   for(const row of utilityPeers())for(const id of row.requests){S.peers[id+'@'+row.ix]=true;X.did('peer',row.ix);}},
 // Weekly too: every willing network above the threshold, at its own minimum size and lead time (#181).
 *pni(X){if(S.day%7!==3&&!(opsIs('annie')&&S.day%7===6))return;const b=pniBatch(null,opsP('pni','tier'));if(!b)return;const g=opsP('pni','g'),paid=opsP('pni','paid');
   // The traffic a PNI there would take over: what your users at that POP send to the network today over transit, an
   // exchange or a PNI elsewhere, the same figure the PNI list shows. Not the city's whole demand: a network's own
   // cache boxes in that POP already serve most of it (#244).
   const loc=q=>pniVal(q.net,q.city).want;
   // Each order quoted again just before it is placed: the player may have ordered the same PNI by hand while the shift
   // let a frame through or waited for a routing, and the batch's quote would order it a second time.
   for(const q0 of b.orders.filter(q=>opsHere('pni',q.city)&&loc(q)>=g&&(paid||NET[q.net].pol!=='paid'||paidFree(NET[q.net]))).sort((a,b)=>loc(b)-loc(a))){
     const q=pniRequote(q0);if(!q)continue;if(!X.can('pni',q.cost))break;if(X.pay('pni',()=>{if(!spend(q.cost))return false;pniPlace(q);return true;}))X.did('pni',q.city+' '+q.net);yield;}},
 // Hand back smaller waves once a bigger link between the same cities carries the pair with a quarter to spare (#102).
 // Loads must include what this shift already did (a customer just signed, a repair): opsRun() routes first if a
 // job changed the network and anything could go (opsDecomWaits()).
 *decom(X){const keep=opsP('decom','keep');
   for(const ls of opsPairs().values()){if(ls.length<2)continue;const live=ls.filter(l=>!linkDown(l)),big=live.reduce((a,l)=>!a||capOf(l)>capOf(a)?l:a,null);if(!big)continue;
     let cap=live.reduce((a,l)=>a+capOf(l),0);const load=ls.reduce((a,l)=>a+((R.load&&R.load[l.id])||0),0);
     const small=live.filter(l=>l!==big&&l.kind==='wave'&&!l.standby&&!l.premium&&capOf(l)<capOf(big)&&!S.biz.some(b=>b.link===l.id)).sort((a,b)=>capOf(b)-capOf(a));
     // The spare is there for when the big link's trench is cut, so it has to live in another trench.
     if(keep&&small.length){const tr=l=>l.trench||l.id,i=small.findIndex(l=>tr(l)!==tr(big));small.splice(Math.max(0,i),1);}
     for(const l of small.reverse()){if(cap-capOf(l)<load*1.25)break;if(!opsDecomSafe(l))continue;cap-=capOf(l);UI.confirm=l.id;X.pay('decom',()=>ACT.rmLink({id:l.id}));if(!S.links.includes(l))X.did('decom',l.a+'|'+l.b);yield;}}},
};
// Line system swaps per shift, and how many fibers a shift may test for one: each test routes the whole network once,
// so a shift costs at most one routing more, and only on a night with a fiber to try. A fiber that failed the test is not tested again for a week
// (not saved: after a reload it is simply tested again).
const OPTUP_MAX=1,OPTUP_TRY=1,OPTUP_WAIT=7,OPTUP_NO=new Map(),SYS_RANK={lite:0,roadm:1,cl:2},SYS_TAG={roadm:'ROADM',cl:'C+L'};
// Another live path between the fiber's two cities, without it: a plain walk, no routing.
function opsAround(l){const adj={};for(const x of S.links){if(x===l||linkDown(x))continue;(adj[x.a]=adj[x.a]||[]).push(x.b);(adj[x.b]=adj[x.b]||[]).push(x.a);}
  const seen=new Set([l.a]),q=[l.a];while(q.length){const u=q.pop();if(u===l.b)return true;for(const v of adj[u]||[])if(!seen.has(v)){seen.add(v);q.push(v);}}return false;}
// A day without this fiber: does every gigabit still get where it went today, and every circuit stay whole? Today's routing
// is the yardstick (routed again first if this shift already changed the network). Both routings are steps the day
// answers (OPS_ROUTE, then {dark}: opsDarkTrial(), in play in the route worker).
const OPS_ROUTE={route:true};
function* opsDark(l,X){if(S.biz.some(b=>b.link===l.id)||!opsAround(l))return false;if(X.dirty){yield OPS_ROUTE;X.dirty=false;}
  return !!(yield {dark:l.id,s0:R.served,L0:R.l2||{}});}
// The test itself, on the game it is given: R is put back after.
function opsDarkTrial(y){const l=S.links.find(x=>x.id===y.dark);if(!l)return false;const R0=R,e0=l.eqDown,s0=y.s0,L0=y.L0;
  try{l.eqDown=S.day+1;compute();return R.served>=s0-1e-6*Math.max(1,s0)&&Object.keys(L0).every(id=>(R.l2[id]||0)>=L0[id]-1e-6);}
  finally{if(e0===undefined)delete l.eqDown;else l.eqDown=e0;R=R0;}}
// The same test overtaken by an action: its checks, and today's routing as the yardstick, as the game is now.
function opsDarkAgain(y){const l=S.links.find(x=>x.id===y.dark);if(!l||S.biz.some(b=>b.link===l.id)||!opsAround(l))return false;
  return opsDarkTrial({dark:l.id,s0:R.served,L0:R.l2||{}});}
// A wave can carry a promise: diverse paths, no subsea, a latency budget. Try the network without it first.
function opsDecomSafe(l){const bz=S.biz.filter(b=>(b.reqs||[]).some(k=>k==='diverse'||k==='sharks'||k==='lat')&&b.city2);if(!bz.length)return true;
  const chk=b=>(b.reqs||[]).every(k=>k==='diverse'?diversePaths(b.city,b.city2):k==='sharks'?terrestrialPath(b.city,b.city2):k==='lat'?bestLat(b.city,b.city2)<=b.latMax:true);
  const was=bz.filter(chk),all=S.links;S.links=all.filter(x=>x!==l);try{return was.every(chk);}finally{S.links=all;}}
// The links between each pair of cities, VXCs left out.
function opsPairs(){const by=new Map();for(const l of S.links)if(l.kind!=='vxc'){const k=edgeKey(l);(by.get(k)||by.set(k,[]).get(k)).push(l);}return by;}
const opsDecomWaits=()=>[...opsPairs().values()].some(ls=>ls.length>1&&ls.some(l=>l.kind==='wave'));
const OPS_ORDER=['repair','routers','transit','ports','optup','optics','caches','ix','pni','decom'];
// The shift: once per game day from dayTick, after outages and events have had their turn.
// One shift. Like a day (dayRun()), it is a generator: each yield is a compute() it needs, answered by the route worker
// in play, so the shift never routes on the page. opsDay() runs it in one go.
function opsDay(d){dayGo(opsRun(d),(g,v)=>g.next(v));}
function* opsRun(d){if(!opsHired())return;const O=S.ops,m=monthIdx(d);if(m!==O.mon){O.mon=m;for(const k in O.spent)O.spent[k]=0;O.addMo={};}
  // A new week: last week's tally becomes the shift report, and the one NOC notice of the week.
  const w=Math.floor(d/7);if(!O.wk||O.wk.w!==w){if(opsWkAny(O.wk)&&O.wk.w<w){O.rep=O.wk;logNote(`<b>${esc(tr('ops.shift_report',{name:opsName()}))}</b> ${esc(opsWeekLine(O.rep))}`,'',[],{a:'ops'});}O.wk=opsWkNew(w);}
  const X=opsShift();
  // One order that trips over something (an odd save, a bug) is paused and noted; payday, goals and the save still happen.
  // Each order is a step of the day: a long shift lets the map draw between two (DAY_REST). The interface the orders
  // click through (selection, tab, confirmation) goes on from where the last order left it, as in one go; the player's
  // own is back in between.
  let ui=null;
  // One step of an order, muted (opsQuiet()): a plain order all at once, a generator up to its next yield. A bare yield
  // is a rest; OPS_ROUTE or a {dark} test is a routing the day answers (v, passed back in).
  const step=(k,st,v)=>opsQuiet(()=>{if(ui){UI.sel=ui.sel;UI.confirm=ui.cf;UI.tab=ui.tab;}st.ask=undefined;
    try{if(!st.it){const r=OPS_RUN[k](X);if(r&&typeof r.next==='function')st.it=r;else st.done=true;}if(!st.done){const s=st.it.next(v);if(s.done)st.done=true;else st.ask=s.value;}}
    catch(err){O.on[k]=false;X.dirty=true;X.did('snag',k);console.error('[tubes] standing order failed',k,err);st.done=true;}
    ui={sel:UI.sel,cf:UI.confirm,tab:UI.tab};});
  const order=function*(k){const st={it:null,done:false};let v;for(;;){step(k,st,v);v=undefined;if(st.done)return;
    if(st.ask===OPS_ROUTE)yield;else if(st.ask&&st.ask.dark)v=yield st.ask;else yield DAY_REST;}};
  // Every order but the last, decommissioning, which reads today's loads: routed first when a job changed them.
  for(const k of OPS_ORDER.slice(0,-1))if(O.on[k]){yield* order(k);yield DAY_REST;}
  if(O.on.decom&&X.dirty&&opsDecomWaits()){yield;X.dirty=false;}
  ui=null;if(O.on.decom)yield* order('decom');
  const e={d,i:O.intern,r:[]};for(const [k,x] of X.r)e.r.push([k,x.n,x.w]);if(X.broke.size)e.r.push(['broke',X.broke.size,[...X.broke]]);
  // Very rarely, and never under Change Freeze, the intern fat-fingers something harmless.
  // Kevin rolls the same dice (so a seeded game plays the same whoever is hired) and catches it before pressing Enter.
  const ff=OPS_FF_RATE[rulePreset()];if(ff&&Object.keys(S.pops).length&&Math.random()<ff){const c=pick(Object.keys(S.pops));let f=Math.floor(Math.random()*OPS_FF.length);
    if(!opsIs('kevin')){
    if(f===3){const t=O.on.transit&&opsHere('transit',c)&&!scnRule('noTransit')&&S.transit.find(t=>t.city===c&&(t.n||1)<LAG_MAX&&portOk(c,t.tier)&&PORT[t.tier].setup<=Math.min(20000,S.cash*0.05));if(!t||!opsQuiet(()=>X.pay('transit',()=>ACT.lagT({id:t.id,d:1}))))f=0;else X.dirty=true;}
    e.f=f;e.c=c;toast(esc(opsFFLine(e)),'',[{l:tr('ops.ops'),act:'opsOpen',args:{}}]);}}
  if(X.up)e.up=Math.round(X.up);if(Math.round(X.mo))e.mo=Math.round(X.mo);
  // Stopping at a budget changes nothing a route depends on: no recompute for that.
  if(X.dirty)yield;
  if(e.r.length||e.f!==undefined){O.log.unshift(e);O.log.length=Math.min(O.log.length,OPS_LOG);}
  // The day's detail stays in the Ops sheet; the NOC gets one notice a week (above).
  const W=O.wk;for(const [k,n,ws] of e.r){W.n[k]=(W.n[k]||0)+n;const a=W.wh[k]||(W.wh[k]=[]);for(const x of ws)if(a.length<3&&!a.includes(x))a.push(x);}
  W.up+=e.up||0;W.mo+=e.mo||0;if(e.f!==undefined)W.ff=Math.min(7,W.ff+1);}
// New POP from the template: price the whole bundle first, then click through it in one go.
function opsTplQuote(c){if(!S||S.pops[c]||!cityOn(c)||(cnCity(c)&&!cnOk()))return null;const T=S.ops.tpl,parts=[];let cost=popCost(c),net=null,ix=null,kit=null;
  if(T.bb){cost+=bbCost(c);parts.push(tr('ops.tpl_bb'));}
  if(T.transit&&!scnRule('noTransit')){net=opsProv(c);if(net){cost+=PORT[0].setup;parts.push(tr('ops.tpl_transit'));}}
  // Priced as if the POP were already there (an IX port is dearer from afar). DE-KICKS wants a sales call first, so not those.
  // The standard routers go in first (#261), so they are in the price and the kit is priced for them.
  const sq=popStdQuote();if(sq){cost+=sq.cost;parts.push(tr('ops.tpl_std'));}
  S.pops[c]={day:S.day,bb:null,boost:0,down:0,routers:sq?sq.rt:1,gen:false,rgen:sq?sq.g:0};
  try{if(T.ix&&CITY[c].ix&&!isDk(c)&&S.ixp[c]===undefined){ix=c;cost+=ixPortMo(c,0);parts.push(tr('ops.tpl_ix'));}
    if(T.kit){kit=utilityKit(c);if(kit&&kit.cost){cost+=kit.cost;parts.push(tr('ops.tpl_kit'));}}}finally{delete S.pops[c];}
  return {cost,net:net&&net.id,ix,kit:!!(kit&&kit.cost),parts};}
