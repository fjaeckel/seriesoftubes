/* ---------- Standing orders (#98) ----------
   A NOC intern runs the player's standing orders once per game day. Every job goes through the same action a click
   would (ACT.*, pniPlace, the #185/#192 planners), so it costs exactly what the click costs, with toasts and redraws
   muted and one recompute at the end. Without an intern nothing here runs and no random numbers are drawn. */
const INTERN_MO=6000,OPS_LOG=12,OPS_CAPS=[10000,50000,250000,1e6,5e6,0],OPS_CAPS_MO=[1000,2500,5000,10000,25000,0],OPS_FLOORS=[0,50000,250000,1e6,5e6];
const INTERNS={
 annie:{i:'📡',n:N_('ops.anycast_annie'),s:N_('ops.annie'),d:N_('ops.annie_d')},
 kevin:{i:'🌙',n:N_('ops.kevin_from_the_night_shift'),s:N_('ops.kevin'),d:N_('ops.kevin_d')},
 tracy:{i:'🧭',n:N_('ops.tracy_route'),s:N_('ops.tracy'),d:N_('ops.tracy_d')},
};
// The orders, in the order the panel shows them. pop: can be switched off per POP. cap: default monthly budget, of setup
// fees, or (mo) of the running costs the order adds, for caches, which are free to rack but cost rent every month.
const OPS=[
 {k:'transit',i:'📈',pop:1,cap:50000,t:N_('ops.o_transit'),d:N_('ops.o_transit_d'),p:{x:{d:1.5,v:[1.25,1.5,2,3],l:N_('ops.p_x'),f:v=>v+'×'},prov:{d:'cheap',ok:v=>v==='cheap'||(isNet(v)&&!!NET[v].price),l:N_('ops.p_prov')}}},
 {k:'routers',i:'🧠',pop:1,cap:250000,t:N_('ops.o_routers'),d:N_('ops.o_routers_d'),p:{at:{d:80,v:[60,70,80,90],l:N_('ops.p_at'),f:v=>v+'%'},how:{d:'auto',v:['auto','add','swap'],l:N_('ops.p_how'),f:v=>tr({auto:N_('ops.how_auto'),add:N_('ops.how_add'),swap:N_('ops.how_swap')}[v])}}},
 {k:'caches',i:'📦',pop:1,cap:5000,mo:1,t:N_('ops.o_caches'),d:N_('ops.o_caches_d'),p:{g:{d:5,v:[1,5,10,25,50],l:N_('ops.p_g'),f:v=>fmtG(v)}}},
 {k:'ix',i:'🔀',t:N_('ops.o_ix'),d:N_('ops.o_ix_d'),p:{}},
 {k:'pni',i:'🤝',pop:1,cap:50000,t:N_('ops.o_pni'),d:N_('ops.o_pni_d'),p:{g:{d:25,v:[5,10,25,50,100],l:N_('ops.p_g'),f:v=>fmtG(v)},tier:{d:0,v:[0,1,2],l:N_('ops.p_tier'),f:v=>tr('ops.at_least_port',{port:PORT[v].n})},paid:{d:false,v:[false,true],l:N_('ops.p_paid'),f:v=>tr(v?'common.on':'common.off')}}},
 {k:'sales',i:'💼',t:N_('ops.o_sales'),d:N_('ops.o_sales_d'),p:{acc:{d:true,v:[true,false],l:N_('ops.p_acc'),f:v=>tr(v?'common.on':'common.off')},min:{d:0,v:[0,2000,5000,10000,25000,50000],l:N_('ops.p_min'),f:v=>v?tr('common.price_mo',{price:fmt$(v)}):tr('ops.never')}}},
 {k:'repair',i:'🔧',cap:50000,t:N_('ops.o_repair'),d:N_('ops.o_repair_d'),p:{}},
 {k:'optics',i:'🌈',cap:250000,t:N_('ops.o_optics'),d:N_('ops.o_optics_d'),p:{at:{d:70,v:[50,60,70,80,90],l:N_('ops.p_at'),f:v=>v+'%'}}},
 {k:'decom',i:'🧹',t:N_('ops.o_decom'),d:N_('ops.o_decom_d'),p:{keep:{d:true,v:[true,false],l:N_('ops.p_keep'),f:v=>tr(v?'common.on':'common.off')}}},
];
const OPSK=Object.fromEntries(OPS.map(o=>[o.k,o])),OPS_POP=OPS.filter(o=>o.pop).map(o=>o.k);
const OPS_TPL=['bb','transit','ix','kit'];
// What the shift log can say. One line per day: "{name} did this, that and the other."
const OPS_SAY={transit:N_('ops.l_transit'),routers:N_('ops.l_routers'),caches:N_('ops.l_caches'),rs:N_('ops.l_rs'),peer:N_('ops.l_peer'),pni:N_('ops.l_pni'),sales:N_('ops.l_sales'),decline:N_('ops.l_decline'),repair:N_('ops.l_repair'),optics:N_('ops.l_optics'),decom:N_('ops.l_decom'),broke:N_('ops.l_broke'),snag:N_('ops.l_snag')};
// Fat fingers: rare, visible, harmless. Only the LAG one costs anything, and only a little.
const OPS_FF=[N_('ops.ff_desc'),N_('ops.ff_hostname'),N_('ops.ff_typo'),N_('ops.ff_lag'),N_('ops.ff_ping')];
const OPS_TRIALS=1,OPS_FF_RATE={oncall:1/150,bgp:1/60};
function opsNew(){return {intern:null,hired:0,on:Object.fromEntries(OPS.map(o=>[o.k,false])),p:{},cap:{},spent:Object.fromEntries(OPS.filter(o=>o.cap).map(o=>[o.k,0])),addMo:{},mon:0,skip:{},log:[],wk:null,rep:null,floor:50000,tpl:{bb:true,transit:true,ix:true,kit:true}};}
const opsO=()=>S.ops||(S.ops=opsNew());
const opsHired=()=>!!(S&&S.ops&&S.ops.intern&&own(INTERNS,S.ops.intern));
const opsCanHire=()=>lvl()>=2;
const opsName=(long)=>{const I=INTERNS[S.ops.intern];return I?tr(long?I.n:I.s):'';};
function opsP(k,p){const P=OPSK[k].p[p],v=S.ops.p[k]&&S.ops.p[k][p];return v!==undefined&&(P.ok?P.ok(v):P.v.includes(v))?v:P.d;}
const opsCaps=k=>OPSK[k].mo?OPS_CAPS_MO:OPS_CAPS;
function opsCap(k){const c=S.ops.cap[k];return opsCaps(k).includes(c)?c:OPSK[k].cap||0;}
const opsHere=(k,c)=>!(S.ops.skip[c]||[]).includes(k);
const opsPops=k=>Object.keys(S.pops).filter(c=>opsHere(k,c));
// Saves are untrusted: rebuild ops from known orders, params, cities and log shapes. Runs after the POPs are repaired,
// so exceptions only survive for POPs that still exist. Old saves get no intern,
// and the two #185 toggles (auto-accept, auto-pay repairs) become the sales and repair orders.
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
  if(s.autoSales===true)n.on.sales=true;if(s.autoRepair===true)n.on.repair=true;delete s.autoSales;delete s.autoRepair;
  s.ops=n;}
// A log entry: {d, i: intern, r: [[kind, n, [where…]]], f: fat-finger index, c: its city, up: paid up front, mo: running costs added}.
const opsWhereOk=w=>typeof w==='string'&&w.length<=48&&/^[a-z0-9~|]+( [+\w.×→⇧]+)?$/i.test(w)&&w.split(' ')[0].split('|').every(x=>isIx(x)||own(OPSK,x)||isNet(x));
function opsLogOk(e){if(!e||typeof e!=='object'||!own(INTERNS,e.i))return null;const r=Array.isArray(e.r)?e.r.filter(x=>Array.isArray(x)&&own(OPS_SAY,x[0])&&Array.isArray(x[2])).map(x=>[x[0],int(x[1],1,1e6,1),x[2].filter(opsWhereOk).slice(0,3)]).slice(0,16):[];
  const f=Number.isInteger(e.f)&&OPS_FF[e.f]?e.f:undefined,up=int(e.up,0,1e12,0),mo=int(e.mo,-1e9,1e9,0);
  return {d:int(e.d,0,1e7,0),i:e.i,r,...(f!==undefined&&isCity(e.c)?{f,c:e.c}:{}),...(up?{up}:{}),...(mo?{mo}:{})};}
// A week's tally, for the shift report and the one NOC notice a week: {w: week, i: intern, n: {kind: count}, wh: {kind: [where…]}, up, mo, rev, ff}.
function opsWkOk(x){if(!x||typeof x!=='object'||Array.isArray(x)||!own(INTERNS,x.i))return null;const n={},wh={},xn=x.n&&typeof x.n==='object'?x.n:{},xw=x.wh&&typeof x.wh==='object'?x.wh:{};
  for(const k of Object.keys(OPS_SAY)){if(own(xn,k)){const v=int(xn[k],0,1e6,0);if(v)n[k]=v;}if(own(xw,k)&&Array.isArray(xw[k])){const w=xw[k].filter(opsWhereOk).slice(0,3);if(w.length)wh[k]=w;}}
  return {w:int(x.w,0,1e6,0),i:x.i,n,wh,up:int(x.up,0,1e12,0),mo:int(x.mo,-1e9,1e9,0),rev:int(x.rev,0,1e9,0),ff:int(x.ff,0,7,0)};}
const opsWkNew=w=>({w,i:S.ops.intern,n:{},wh:{},up:0,mo:0,rev:0,ff:0});
const opsWkAny=x=>!!x&&(Object.keys(x.n).length>0||x.ff>0);
// "Kevin's week: signed 3 customers (+$41k/mo), topped up transit 2 times (Frankfurt +1×100G), declined 17 tiny offers. Week total: …"
function opsWeekLine(x){const I=INTERNS[x.i],name=I?tr(I.s):'',ks=Object.keys(x.n).sort((a,b)=>(a==='sales'?-1:b==='sales'?1:0)||(a==='broke')-(b==='broke'));
  const parts=ks.map(k=>k==='sales'?trn('ops.w_sales',x.n[k],{rev:opsMo$(x.rev)}):trn(OPS_SAY[k],x.n[k],{where:(x.wh[k]||[]).map(w=>opsWhere(w,k)).join(', ')}));
  if(x.ff)parts.push(trn('ops.w_oops',x.ff));
  return tr('ops.w_line',{name,list:parts.join(', ')})+(x.up||x.mo?' '+tr('ops.w_money',{cost:fmt$(x.up),mo:opsMo$(x.mo)}):'');}
// The intern's mood, from what the week has been like. No dice: the same day always reads the same.
function opsMood(){const O=S.ops,x=O.wk&&O.wk.w===Math.floor(S.day/7)?O.wk:null,n=x?x.n:{},jobs=Object.keys(n).filter(k=>k!=='broke'&&k!=='decline').reduce((a,k)=>a+n[k],0);
  const k=S.day-O.hired<7?'new':x&&x.ff?'oops':n.snag?'snag':S.inc.some(i=>i.until>S.day&&i.type!=='ddos')?'outage':n.sales?'sales':n.broke?'broke':jobs>=5?'busy':S.day%2?'quiet':O.intern;
  return tr({new:N_('ops.mood_new'),oops:N_('ops.mood_oops'),snag:N_('ops.mood_snag'),outage:N_('ops.mood_outage'),sales:N_('ops.mood_sales'),broke:N_('ops.mood_broke'),busy:N_('ops.mood_busy'),quiet:N_('ops.mood_quiet'),
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
function opsMoNow(){let m=S.caches.length*CACHE_MO;
  for(const c in S.pops){const p=S.pops[c],rt=p.routers||1;m+=(rt-1)*ROUTER_MO+cageMo(rt)+rt*RG[p.rgen||0].mo;}
  for(const l of S.links)m+=(l.mo||0)+(l.kind==='df'?(l.spares?Math.round(150+(l.ch||[]).length*80):0)+(l.regen|0)*REGEN_MO:0);
  for(const t of S.transit)m+=transitMo(t,0);
  for(const p of S.pni){const q=p.up||p,N=NET[p.net];m+=(q.g1?Math.round(PORT[0].pni/2):PORT[q.tier].pni)*(q.n||1)+(N.pol==='paid'&&!paidFree(N)?N.paidFee:0);}
  return m;}
const opsFFLine=e=>tr('ops.ff_line',{name:tr(INTERNS[e.i].s),what:tr(OPS_FF[e.f],{city:CITY[e.c].name})});
// Mute what a click would show (toasts, sounds, floaters, the full redraw) and keep the player's selection.
function opsQuiet(fn){const a=after,t=toast,s=sfx,f=floater,sel=UI.sel,cf=UI.confirm,tab=UI.tab;after=()=>{};toast=()=>{};sfx=()=>{};floater=()=>{};
  try{return fn();}finally{after=a;toast=t;sfx=s;floater=f;UI.confirm=cf;UI.tab=tab;UI.sel=sel&&(sel.type!=='link'||S.links.some(l=>l.id===sel.id))&&(sel.type!=='city'||isCity(sel.id))?sel:null;}}
// One shift's bookkeeping: what got done, and whether a job had to wait for next month's budget.
// dirty: a job changed the network, so R (loads, routing) is out of date until the next compute().
// up/mo/rev: what this shift paid up front, added to the monthly bill, and signed in monthly revenue.
function opsShift(){const r=new Map(),broke=new Set();
  return {r,broke,dirty:false,up:0,mo:0,rev:0,did(k,w){if(k!=='decline')this.dirty=true;const x=r.get(k)||{n:0,w:[]};x.n++;if(w&&x.w.length<3&&!x.w.includes(w))x.w.push(w);r.set(k,x);},
    // A job that costs nothing up front still has to pass the cash floor if it adds to the monthly bill.
    can(k,cost,mo=0){const O=S.ops,cap=opsCap(k);if(cost<=0&&!(mo>0))return true;
      if(S.cash-Math.max(0,cost)<O.floor||(cap&&(OPSK[k].mo?(O.addMo[k]||0)+mo:(O.spent[k]||0)+cost)>cap)){broke.add(k);return false;}return true;},
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
const opsProv=c=>{const pv=opsP('transit','prov');return pv!=='cheap'&&sellsAt(NET[pv],c)&&opsTransitOk(NET[pv],c)?NET[pv]:cheapestTransit(c);};
// The orders. Each takes the shift and does its jobs through the player's own actions.
const OPS_RUN={
 repair(X){purgeInc();for(const i of S.inc.slice())if(i.type!=='ddos'&&i.until>S.day&&i.cost>0&&!(i.slow&&i.rushed)&&X.can('repair',i.cost)&&X.pay('repair',()=>ACT.fixInc({id:i.id})))X.did('repair');},
 sales(X){const min=opsP('sales','min'),acc=opsP('sales','acc');let tries=0;
   for(const o of S.offers.slice()){const T=BIZ_T[o.type];if(!T)continue;const v=T.event?(o.fee||0):bizMo(o);
     if(min&&v<min){S.offers=S.offers.filter(x=>x!==o);X.did('decline');continue;}
     // Each trial is a full routing pass: at most one a shift, and an offer that did not fit waits a week.
     if(acc&&o.exp>S.day&&bCities(o).every(popUp)&&reqOk(o)&&tries<OPS_TRIALS&&!(UI.opsTried&&UI.opsTried.s===S&&UI.opsTried.m.get(o.id)>S.day-7)){tries++;ACT.accept({id:o.id,auto:true});
       if(!S.offers.includes(o)){X.did('sales');X.rev+=bizMo(o);}else{if(!UI.opsTried||UI.opsTried.s!==S)UI.opsTried={s:S,m:new Map()};UI.opsTried.m.set(o.id,S.day);}}}},
 routers(X){const at=opsP('routers','at')/100,how=opsP('routers','how');
   for(const c of opsPops('routers')){const p=S.pops[c];if(p.rupDay===S.day)continue;
     const ld=Math.max((R.nodeLoad[c]||0)/(R.nodeCap[c]||nodeCap(c)||1),portsUsed(c)/Math.max(1,portsMax(c)));if(ld<at)continue;
     const rt=p.routers||1,g=p.rgen||0,nx=mainRG(RG[g].cls+1);
     // A swap with one router is a maintenance window: the intern only swaps where a second router carries the traffic.
     const swap=nx>=0&&RG[nx].lvl<=lvl()&&!modelFits(c,nx)&&(rt>1||popIdle(c)),add=rt<RMAX;
     const doSwap=how==='swap'?swap:how==='add'?false:swap&&(rt>=4||!add);if(!doSwap&&(how==='swap'||!add))continue;
     const cost=doSwap?swapCost(c,nx):routerCost(g,rt);if(!X.can('routers',cost))continue;
     if(X.pay('routers',()=>doSwap?ACT.upRouter({city:c,g:nx}):ACT.addRouter({city:c})))X.did('routers',c+(doSwap?' ⇧'+RG[nx].pn:' +1'));}},
 transit(X){if(scnRule('noTransit'))return;const N=opsP('transit','x');
   for(const c of opsPops('transit')){let ts=S.transit.filter(t=>t.city===c);if(!ts.length)continue;
     // Thirty days of 95th-percentile-ish history per port; their peaks summed is a safe (high) estimate of the POP's peak.
     const peak=ts.reduce((a,t)=>a+(t.hist||[]).reduce((m,v)=>Math.max(m,v),0),0);if(!(peak>0))continue;
     const n=opsProv(c);if(!n)continue;
     for(let step=0;step<4;step++){const cap=ts.reduce((a,t)=>a+lagCap(PORT[t.tier].g,t.n),0);if(cap>=N*peak)break;
       const t=ts.find(x=>x.net===n.id);let job=null;
       if(t){const k=t.n||1,up=t.tier+1;
         if(k<4&&portOk(c,t.tier))job={cost:PORT[t.tier].setup,go:()=>ACT.lagT({id:t.id,d:1}),w:'+1×'+PORT[t.tier].n};
         else if(PORT[up]&&portShown(up)&&portOk(c,up))job={cost:PORT[up].setup*k,go:()=>ACT.buyTransit({city:c,net:n.id,tier:up}),w:PORT[t.tier].n+'→'+PORT[up].n};
         else if(k<LAG_MAX&&portOk(c,t.tier))job={cost:PORT[t.tier].setup,go:()=>ACT.lagT({id:t.id,d:1}),w:'+1×'+PORT[t.tier].n};}
       else{const need=N*peak-cap,ok=PORT.map((P,i)=>i).filter(i=>portShown(i)&&portOk(c,i)),i=ok.find(i=>PORT[i].g>=need)??ok.at(-1);
         if(i!==undefined)job={cost:PORT[i].setup,go:()=>ACT.buyTransit({city:c,net:n.id,tier:i}),w:'+'+PORT[i].n};}
       if(!job||!X.can('transit',job.cost)||!X.pay('transit',job.go))break;
       X.did('transit',c+' '+job.w);ts=S.transit.filter(t=>t.city===c);}}},
 optics(X){const at=opsP('optics','at')/100;
   for(const l of S.links){if(l.kind!=='df'||l.ready>S.day||l.eqDown>S.day||l.standby||l.cut>S.day)continue;
     let cap=dfCap(l);const load=(R.load&&R.load[l.id])||0;
     // New fiber gets its first channel; lit fiber gets more while it runs hot.
     for(let step=0;step<8&&(cap<=0?!(l.ch||[]).length:load>=cap*at);step++){if(chMax(l)-(l.ch||[]).length-soldSlots(l)<=0)break;
       const cnt={};for(const k of l.ch||[])cnt[k]=(cnt[k]||0)+1;
       // More of what is already lit, or else the most Gbps per dollar that reaches.
       const fit=Object.keys(OPT).filter(o=>!chWhy(l,o)),o=fit.filter(o=>cnt[o]).sort((a,b)=>cnt[b]-cnt[a])[0]||fit.sort((a,b)=>optG(b,l)/optCost(b)-optG(a,l)/optCost(a))[0];if(!o)break;
       const n=(cnt[o]||0)+1,cost=opticCountCost(l,o,n),before=(l.ch||[]).length;if(!X.can('optics',cost))break;
       X.pay('optics',()=>{ACT.setChCount({id:l.id,o,n});return (l.ch||[]).length>before;});if((l.ch||[]).length<=before)break;
       cap+=optG(o,l);X.did('optics',l.a+'|'+l.b);}}},
 caches(X){const g=opsP('caches','g');
   for(const c of opsPops('caches')){const q=utilityCaches(c);if(!q||!q.add.length)continue;
     const want=q.add.filter(x=>(R.cityDem[c]||0)*(NSH[x.net]||0)>=g),free=Math.floor(portsMax(c)-portsUsed(c)+1e-9);
     for(const x of want.slice(0,Math.max(0,free))){if(!X.can('caches',0,CACHE_MO))return;S.caches.push({id:uid(),city:c,net:x.net,site:x.site});X.book('caches',0,CACHE_MO);X.did('caches',c);}}},
 // Weekly, like a person going through PeeringDB on a Monday: route servers, then every willing member (#192).
 ix(X){if(S.day%7)return;for(const ix of utilityRouteServers()){S.rs[ix]=true;X.did('rs');}
   for(const row of utilityPeers())for(const id of row.requests){S.peers[id+'@'+row.ix]=true;X.did('peer',row.ix);}},
 // Weekly too: every willing network above the threshold, at its own minimum size and lead time (#181).
 pni(X){if(S.day%7!==3)return;const b=pniBatch(null,opsP('pni','tier'));if(!b)return;const g=opsP('pni','g'),paid=opsP('pni','paid');
   const loc=q=>(R.cityDem[q.city]||0)*(NSH[q.net]||0);
   for(const q of b.orders.filter(q=>opsHere('pni',q.city)&&loc(q)>=g&&(paid||NET[q.net].pol!=='paid'||paidFree(NET[q.net]))).sort((a,b)=>loc(b)-loc(a))){
     if(!X.can('pni',q.cost))break;if(X.pay('pni',()=>{if(!spend(q.cost))return false;pniPlace(q);return true;}))X.did('pni',q.city+' '+q.net);}},
 // Hand back smaller waves once a bigger link between the same cities carries the pair with a quarter to spare (#102).
 decom(X){const keep=opsP('decom','keep'),by=new Map();for(const l of S.links)if(l.kind!=='vxc'){const k=edgeKey(l);(by.get(k)||by.set(k,[]).get(k)).push(l);}
   // Loads must include what this shift already did (a customer just signed, a repair): recompute first, if anything could go.
   if(X.dirty&&[...by.values()].some(ls=>ls.length>1&&ls.some(l=>l.kind==='wave'))){compute();X.dirty=false;}
   for(const ls of by.values()){if(ls.length<2)continue;const live=ls.filter(l=>!linkDown(l)),big=live.reduce((a,l)=>!a||capOf(l)>capOf(a)?l:a,null);if(!big)continue;
     let cap=live.reduce((a,l)=>a+capOf(l),0);const load=ls.reduce((a,l)=>a+((R.load&&R.load[l.id])||0),0);
     const small=live.filter(l=>l!==big&&l.kind==='wave'&&!l.standby&&!l.premium&&capOf(l)<capOf(big)&&!S.biz.some(b=>b.link===l.id)).sort((a,b)=>capOf(b)-capOf(a));
     // The spare is there for when the big link's trench is cut, so it has to live in another trench.
     if(keep&&small.length){const tr=l=>l.trench||l.id,i=small.findIndex(l=>tr(l)!==tr(big));small.splice(Math.max(0,i),1);}
     for(const l of small.reverse()){if(cap-capOf(l)<load*1.25)break;if(!opsDecomSafe(l))continue;cap-=capOf(l);UI.confirm=l.id;X.pay('decom',()=>ACT.rmLink({id:l.id}));if(!S.links.includes(l))X.did('decom',l.a+'|'+l.b);}}},
};
// A wave can carry a promise: diverse paths, no subsea, a latency budget. Try the network without it first.
function opsDecomSafe(l){const bz=S.biz.filter(b=>(b.reqs||[]).some(k=>k==='diverse'||k==='sharks'||k==='lat')&&b.city2);if(!bz.length)return true;
  const chk=b=>(b.reqs||[]).every(k=>k==='diverse'?diversePaths(b.city,b.city2):k==='sharks'?terrestrialPath(b.city,b.city2):k==='lat'?bestLat(b.city,b.city2)<=b.latMax:true);
  const was=bz.filter(chk),all=S.links;S.links=all.filter(x=>x!==l);try{return was.every(chk);}finally{S.links=all;}}
const OPS_ORDER=['repair','sales','routers','transit','optics','caches','ix','pni','decom'];
// The shift: once per game day from dayTick, after outages and events have had their turn.
function opsDay(d){if(!opsHired())return;const O=S.ops,m=Math.floor(d/30);if(m!==O.mon){O.mon=m;for(const k in O.spent)O.spent[k]=0;O.addMo={};}
  // A new week: last week's tally becomes the shift report, and the one NOC notice of the week.
  const w=Math.floor(d/7);if(!O.wk||O.wk.w!==w){if(opsWkAny(O.wk)&&O.wk.w<w){O.rep=O.wk;logNote(`<b>${esc(tr('ops.shift_report',{name:opsName()}))}</b> ${esc(opsWeekLine(O.rep))}`,O.rep.rev>0?'good':'',[],{a:'ops'});}O.wk=opsWkNew(w);}
  const X=opsShift();
  // One order that trips over something (an odd save, a bug) is paused and noted; payday, goals and the save still happen.
  opsQuiet(()=>{for(const k of OPS_ORDER)if(O.on[k])try{OPS_RUN[k](X);}catch(err){O.on[k]=false;X.dirty=true;X.did('snag',k);console.error('[tubes] standing order failed',k,err);}});
  const e={d,i:O.intern,r:[]};for(const [k,x] of X.r)e.r.push([k,x.n,x.w]);if(X.broke.size)e.r.push(['broke',X.broke.size,[...X.broke]]);
  // Very rarely, and never under Change Freeze, the intern fat-fingers something harmless.
  const ff=OPS_FF_RATE[rulePreset()];if(ff&&Object.keys(S.pops).length&&Math.random()<ff){const c=pick(Object.keys(S.pops));let f=Math.floor(Math.random()*OPS_FF.length);
    if(f===3){const t=O.on.transit&&opsHere('transit',c)&&!scnRule('noTransit')&&S.transit.find(t=>t.city===c&&(t.n||1)<LAG_MAX&&portOk(c,t.tier)&&PORT[t.tier].setup<=Math.min(20000,S.cash*0.05));if(!t||!opsQuiet(()=>X.pay('transit',()=>ACT.lagT({id:t.id,d:1}))))f=0;else X.dirty=true;}
    e.f=f;e.c=c;toast(esc(opsFFLine(e)),'',[{l:tr('ops.ops'),act:'opsOpen',args:{}}]);}
  if(X.up)e.up=Math.round(X.up);if(Math.round(X.mo))e.mo=Math.round(X.mo);
  // Declining an offer or stopping at a budget changes nothing a route depends on: no recompute for those.
  if(X.dirty)compute();
  if(e.r.length||e.f!==undefined){O.log.unshift(e);O.log.length=Math.min(O.log.length,OPS_LOG);}
  // The day's detail stays in the Ops sheet; the NOC gets one notice a week (above).
  const W=O.wk;for(const [k,n,ws] of e.r){W.n[k]=(W.n[k]||0)+n;const a=W.wh[k]||(W.wh[k]=[]);for(const x of ws)if(a.length<3&&!a.includes(x))a.push(x);}
  W.up+=e.up||0;W.mo+=e.mo||0;W.rev+=Math.round(X.rev);if(e.f!==undefined)W.ff=Math.min(7,W.ff+1);}
// New POP from the template: price the whole bundle first, then click through it in one go.
function opsTplQuote(c){if(!S||S.pops[c]||!cityOn(c)||(cnCity(c)&&!cnOk()))return null;const T=S.ops.tpl,parts=[];let cost=popCost(c),net=null,ix=null,kit=null;
  if(T.bb){cost+=bbCost(c);parts.push(tr('ops.tpl_bb'));}
  if(T.transit&&!scnRule('noTransit')){net=opsProv(c);if(net){cost+=PORT[0].setup;parts.push(tr('ops.tpl_transit'));}}
  // Priced as if the POP were already there (an IX port is dearer from afar). DE-KICKS wants a sales call first, so not those.
  S.pops[c]={day:S.day,bb:null,boost:0,down:0,routers:1,gen:false};
  try{if(T.ix&&CITY[c].ix&&!isDk(c)&&S.ixp[c]===undefined){ix=c;cost+=ixPortMo(c,0);parts.push(tr('ops.tpl_ix'));}
    if(T.kit){kit=utilityKit(c);if(kit&&kit.cost){cost+=kit.cost;parts.push(tr('ops.tpl_kit'));}}}finally{delete S.pops[c];}
  return {cost,net:net&&net.id,ix,kit:!!(kit&&kit.cost),parts};}
