/* ================= ARCHITECT RUNS (prototype) =================
   One network, built brief by brief. A brief adds sites, makes some of them gold (a gold site must stay connected to HQ
   whichever single trench or cable is cut), sets a latency cap, or closes a city. The build carries over: what earlier
   briefs built is paid for, so removing it gives nothing back. ▶ lets the chaos monkey loose: it cuts every trench and cable one
   at a time, and the brief is done when every gold site survives. Runs on the puzzle machinery (S.mode 'puzzle' with
   S.ar), so there is no clock, no bills, no incidents, and the main save is never touched.
   Capacity: every site pulls its traffic from HQ, and the review also checks that the detour has room: after any single
   cut, everything still connected gets all of its traffic. Tubes come in three sizes; routers follow by themselves (the
   cheapest model that takes the tubes), and traffic finds the detour by itself (Auto-TE): models, ports and metrics are
   someone else's job. */
const AR_KEY='sot-architect',AR_TIER=1,AR_TIERS=[0,1,2],AR_RUN=550,AR_HOLD=650; // ms: the monkey's run to a tube, then how long the cut shows
// A brief: add (new sites), gold (sites that must survive any single cut), ring (sites that must sit on one ring), drop
// (close a city: no POP allowed there any more), dem {city: Gbps} (what a site pulls from HQ, 10G unless set; a later
// brief can raise it), lat [a,b,ms] (the fastest path between two sites under ms), tubes (the
// plan: how many new tubes this brief should take; going over is allowed and costs a star), t (the brief).
// budget: one round number for the whole run, a little above the best plan found (tests/architect.test.js), and below
// the obvious one. Money never blocks a brief. ⭐ every brief done, ⭐ never over a brief's tubes, ⭐ within budget.
const AR_RUNS=[
 {id:'euro',n:tr('architect.euro_run'),j:tr('architect.euro_run_joke'),hq:'ams',via:[],budget:410000,briefs:[
  {add:['fra'],dem:{fra:40},tubes:1,t:tr('architect.euro_1')},
  {add:['par','lon'],dem:{par:50,lon:60},tubes:2,t:tr('architect.euro_2b')},
  {gold:['fra','par'],tubes:1,t:tr('architect.euro_3b')},
  {add:['zrh'],dem:{zrh:40},gold:['zrh'],tubes:2,t:tr('architect.euro_5')},
  {ring:['ams','par','lon'],dem:{par:100},tubes:2,t:tr('architect.euro_ring_grow')},
  {drop:['fra'],add:['dus'],dem:{dus:60},gold:['dus'],tubes:2,t:tr('architect.euro_6')},
 ]},
 {id:'usa',n:tr('architect.coast_to_coast'),j:tr('architect.coast_to_coast_joke'),hq:'ash',via:[],budget:610000,briefs:[
  {add:['nyc'],t:tr('architect.usa_1')},
  {add:['chi'],t:tr('architect.usa_2')},
  {gold:['nyc'],t:tr('architect.usa_3')},
  {lat:['nyc','chi',8],t:tr('architect.usa_4')},
  {add:['dal','sjc'],t:tr('architect.usa_5')},
  {gold:['sjc'],t:tr('architect.usa_6')},
 ]},
 {id:'pacific',n:tr('architect.pacific_rim'),j:tr('architect.pacific_rim_joke'),hq:'tok',via:[],budget:2350000,briefs:[
  {add:['hkg'],t:tr('architect.pac_1')},
  {add:['sin'],t:tr('architect.pac_2')},
  {gold:['hkg'],t:tr('architect.pac_3')},
  {gold:['sin'],t:tr('architect.pac_4')},
  {add:['syd'],t:tr('architect.pac_5')},
 ]},
];
const arOn=()=>pzOn()&&!!S.ar;
const arRunDef=id=>AR_RUNS.find(r=>r.id===id)||arWkRun(id);
const arRun=()=>arRunDef(S.ar.id);
const arBrief=()=>arRun().briefs[S.ar.bi];
const arLast=()=>S.ar.bi>=arRun().briefs.length-1;
// ---------- progress: best stars, spend and briefs cleared per run, under its own key ----------
function arLoad(){let j=null;try{j=JSON.parse(localStorage.getItem(AR_KEY)||'{}');}catch(e){}const o={runs:{}};
  if(j&&j.runs&&typeof j.runs==='object')for(const k of Object.keys(j.runs)){const r=j.runs[k];if((!arRunDef(k)&&!AR_WK_ID.test(k))||!r||typeof r!=='object')continue;
    o.runs[k]={st:int(r.st,0,3,0),br:int(r.br,0,99,0),sp:r.sp==null||!isFinite(+r.sp)||+r.sp<0?null:Math.round(+r.sp)};if(AR_WK_ID.test(k))o.runs[k].rv=int(r.rv,1,999,1);}
  return o;}
function arStore(p){try{localStorage.setItem(AR_KEY,JSON.stringify(p));}catch(e){}}
function arRecord(st,br,sp){const p=arLoad(),run=arRun(),old=p.runs[S.ar.id],r=old&&(!run.wk||(old.rv||1)===run.rev)?old:{st:0,br:0,sp:null};if(run.wk)r.rv=run.rev;
  if(st>r.st||(st===r.st&&st>0&&(r.sp==null||sp<r.sp))){r.st=st;r.sp=st?sp:r.sp;}r.br=Math.max(r.br,br);p.runs[S.ar.id]=r;arStore(p);}
// ---------- money ----------
// What a POP or a link costs for the year, as the puzzles count it.
const arPopCost=c=>pzPopCost(c)+pzRouterCost(c);
const arLinkCost=l=>l.mo*PZ_YEAR;
const arSpend=()=>pzSpend()+S.ar.sunk;
// Removing what an earlier brief built gives nothing back.
const arAge=l=>l.ub==null?(l.br|0):l.ub;
function arSink(pops,links){const A=S.ar;for(const c of pops)if(S.pops[c]&&(S.pops[c].br|0)<A.bi)A.sunk+=arPopCost(c);for(const l of links)if(arAge(l)<A.bi)A.sunk+=arLinkCost(l);}
// ---------- the graph ----------
function arAdj(skip){const nb={};for(const c in S.pops)nb[c]=new Set();for(const l of S.links){if(skip&&skip(l))continue;if(!nb[l.a]||!nb[l.b])continue;nb[l.a].add(l.b);nb[l.b].add(l.a);}return nb;}
function arReach(from,nb){const seen=new Set();if(!nb[from])return seen;seen.add(from);const q=[from];while(q.length){const u=q.shift();for(const v of nb[u])if(!seen.has(v)){seen.add(v);q.push(v);}}return seen;}
// Sites a cut leaves without a path to HQ.
function arDark(u){const nb=arAdj(l=>pzUnit(l)===u),r=arReach(S.ar.hq,nb);return S.pz.cities.filter(c=>S.pops[c]&&!r.has(c));}
// The fastest path between two sites, by the links' own latency.
function arLat(a,b){if(!S.pops[a]||!S.pops[b])return null;const d={[a]:0},done=new Set();
  for(;;){let u=null;for(const k in d)if(!done.has(k)&&(u===null||d[k]<d[u]))u=k;if(u===null)return null;if(u===b)return d[u];done.add(u);
    for(const l of S.links){if(l.a!==u&&l.b!==u)continue;const v=l.a===u?l.b:l.a,x=d[u]+linkLat(l);if(d[v]===undefined||x<d[v])d[v]=x;}}}
// A simple cycle through every one of these cities (the networks are small, so a bounded search will do).
function arRingOk(cs){const nb=arAdj();if(!cs.every(c=>nb[c]&&nb[c].size>=2))return false;const st=cs[0],on=new Set([st]);let ok=false,n=0;
  const dfs=(u,d)=>{for(const v of nb[u]){if(ok||++n>50000)return;if(v===st&&d>=3&&cs.every(c=>on.has(c))){ok=true;return;}if(on.has(v))continue;on.add(v);dfs(v,d+1);on.delete(v);}};
  dfs(st,1);return ok;}
// Tubes laid in this brief, against its plan.
const arTubes=()=>{const b=arBrief(),u=S.links.filter(l=>(l.br|0)===S.ar.bi).length;return {u,max:b.tubes==null?null:b.tubes,over:b.tubes==null?0:Math.max(0,u-b.tubes)};};
// ---------- the brief's checklist ----------
function arEval(){const A=S.ar,P=S.pz,nb=arAdj(),r=arReach(A.hq,nb);
  const got=S.links.some(l=>l.cut)&&UI.arBaseGot?UI.arBaseGot:arGot();
  const sites=P.cities.map(c=>({c,pop:!!S.pops[c],ok:!!S.pops[c]&&r.has(c),gold:A.gold.includes(c),hq:c===A.hq,dem:c===A.hq?0:arDem(c),got:c===A.hq?0:got[c]||0}));for(const s of sites)s.full=s.hq||s.got>=s.dem*0.999-1e-6;
  const conn=sites.every(s=>s.ok),lat=A.lat?{a:A.lat[0],b:A.lat[1],cap:A.lat[2],ms:arLat(A.lat[0],A.lat[1])}:null;if(lat)lat.ok=lat.ms!=null&&lat.ms<=lat.cap+1e-9;
  const moveOut=P.avoid.filter(c=>S.pops[c]),spend=arSpend(),budget=arRun().budget,cheap=spend<=budget+1e-6,miss=sites.filter(s=>!s.ok).map(s=>CITY[s.c].name),rings=A.rings.map(cs=>({cs,ok:arRingOk(cs)})),tubes=arTubes();
  const why=!conn?tr('architect.not_connected_yet_list',{list:miss.join(', ')}):lat&&!lat.ok?tr('architect.too_slow_for_the_cap'):rings.some(r=>!r.ok)?tr('architect.not_a_ring_yet'):sites.some(s=>!s.full)?tr('architect.too_thin_list',{list:sites.filter(s=>!s.full).map(s=>`${CITY[s.c].name} ${arG(s.got)}/${arG(s.dem)}`).join(', ')}):moveOut.length?tr('architect.move_out_of_city',{city:moveOut.map(c=>CITY[c].name).join(', ')}):'';
  return {sites,conn,lat,rings,tubes,moveOut,spend,budget,cheap,ready:!why,why,passed:A.passed===pzSig()};}
// ---------- the shape: the game names what you drew ----------
const AR_SHAPES={braces:['🦺',N_('architect.shape_braces')],tube:['🧪',N_('architect.shape_tube')],line:['➖',N_('architect.shape_line')],star:['✳️',N_('architect.shape_star')],tree:['🌳',N_('architect.shape_tree')],ring:['💍',N_('architect.shape_ring')],lolli:['🍭',N_('architect.shape_lolli')],ladder:['🪜',N_('architect.shape_ladder')],mesh:['🕸️',N_('architect.shape_mesh')],full:['🧶',N_('architect.shape_full')],islands:['🏝️',N_('architect.shape_islands')],spaghetti:['🍝',N_('architect.shape_spaghetti')]};
function arShape(){const ns=Object.keys(S.pops),n=ns.length;if(n<2||!S.links.length)return null;const nb=arAdj(),m=new Set(S.links.map(edgeKey)).size,deg=c=>nb[c].size,maxd=Math.max(...ns.map(deg));
  const dbl=[...new Set(S.links.map(edgeKey))].filter(e=>new Set(S.links.filter(l=>edgeKey(l)===e).map(pzUnit)).size>1).length;
  let k;if(arReach(ns[0],nb).size<n)k='islands';else if(m===n-1&&dbl===m)k='braces';else if(n===2)k='tube';else if(m===n-1)k=maxd===n-1&&n>=4?'star':maxd<=2?'line':'tree';
  else if(ns.every(c=>deg(c)===2))k='ring';else if(n>=4&&m===n*(n-1)/2)k='full';
  else{const core={};for(const c of ns)core[c]=new Set(nb[c]);let cut=true;while(cut){cut=false;for(const c in core)if(core[c].size<=1){for(const v of core[c])core[v]&&core[v].delete(c);delete core[c];cut=true;}}
    const cs=Object.keys(core),cm=cs.reduce((a,c)=>a+core[c].size,0)/2,d2=cs.filter(c=>core[c].size===2).length;
    k=cs.length<n&&cs.every(c=>core[c].size===2)?'lolli':cs.length===n&&n>=6&&n%2===0&&cm===3*n/2-2&&d2===4&&cs.every(c=>core[c].size<=3)?'ladder':m>=n*1.8?'spaghetti':'mesh';}
  return {k,i:AR_SHAPES[k][0],n:tr(AR_SHAPES[k][1])};}
// What later briefs do to a city, for the map: [{n: brief number, i: icon}], earliest first.
// ---------- starting, briefs and the end ----------
const arDem=c=>S.ar.dem[c]||10;
// Short Gbps for chips and tags: 40G, 1.2T.
const arG=g=>g>=1000?+(g/1000).toFixed(1)+'T':Math.round(g)+'G';
function arDemand(){const P=S.pz,A=S.ar;P.src=[A.hq];P.dem=P.cities.filter(c=>c!==A.hq).map(c=>({t:'eye',a:c,b:null,g:arDem(c),ms:0,be:false}));pzDemand();
  for(const c in S.pops)S.pops[c].bb=P.cities.includes(c)&&c!==A.hq?{d:arDem(c)}:null;}
// What each site gets right now, from the last compute().
function arGot(){const g=pzGot(),o={};S.pz.dem.forEach((f,i)=>{o[f.a]=g[i].g;});return o;}
// Connected sites that do not get all of their traffic.
function arShort(dark){const got=arGot();return S.pz.cities.filter(c=>c!==S.ar.hq&&S.pops[c]&&!(dark||[]).includes(c)&&(got[c]||0)<arDem(c)*0.999-1e-6);}
// Routers follow the tubes: the cheapest model that takes every tube and port at the POP.
const AR_RG=()=>PZ_RG.slice().sort((a,b)=>pzRtCost(a,1)-pzRtCost(b,1));
function arRouters(){for(const c in S.pops){const p=S.pops[c];p.routers=1;p.rgen=AR_RG().find(g=>!modelFits(c,g))??(p.rgen||0);}}
// The yearly router cost a tube of this size would add at a city (0 when its router already takes it).
function arRouterDelta(c,tier){const p=S.pops[c],cur=p?pzRtCost(p.rgen||0,1):0,need=Math.max(tier,...S.links.filter(l=>l.a===c||l.b===c).map(l=>l.tier)),g=AR_RG().find(i=>RG[i].maxLT>=need);return g==null?0:Math.max(0,pzRtCost(g,1)-cur);}
const arSnapStr=()=>JSON.stringify({p:S.pops,l:S.links,m:S.pairMet||{},k:S.ar.sunk});
function arBegin(run){if(!run)return;mkStop();const b0=run.briefs[0];
  pzBegin({id:'ar_'+run.id,n:run.n,src:[run.hq],dem:b0.add.map(c=>({t:'eye',a:c,g:1})),via:run.via,budget:0});
  pzToastsClear();S.pz.n=run.n;S.te={on:true,day:0};S.ar={id:run.id,hq:run.hq,bi:-1,sunk:0,over:0,dem:{},rings:[],gold:[],lat:null,passed:null,start:null};UI.arAll=false;arStop(true);
  S.pops[run.hq]=pzNewPop(run.hq);arApply(0);}
function arApply(i){const A=S.ar,P=S.pz,b=arRun().briefs[i];A.bi=i;
  for(const c of b.drop||[]){P.cities=P.cities.filter(x=>x!==c);A.gold=A.gold.filter(x=>x!==c);if(!P.avoid.includes(c))P.avoid.push(c);if(A.lat&&A.lat.includes(c))A.lat=null;A.rings=A.rings.filter(r=>!r.includes(c));}
  for(const c of b.add||[])if(!P.cities.includes(c))P.cities.push(c);
  for(const c of b.gold||[])if(!A.gold.includes(c))A.gold.push(c);
  if(b.ring)A.rings.push(b.ring.slice());Object.assign(A.dem,b.dem||{});
  if(b.lat)A.lat=b.lat.slice();A.passed=null;
  // Later briefs stay a surprise: their cities do not show until they come (Show all cities shows everything).
  P.via=(arRun().via||[]).filter(c=>!P.cities.includes(c)&&!P.avoid.includes(c));
  arDemand();A.start=arSnapStr();UI.pzHist=[];UI.sel=null;UI.arFail=null;
  compute();pzCam();renderAll();
  toast(`<b>${tr('architect.brief_n_of_m',{n:i+1,m:arRun().briefs.length})}</b><br>${esc(b.t)}`,'goal');sfx('click');}
function arNext(){if(!arOn())return;const e=arEval();if(!e.passed)return;mkStop();if(arLast()){arResults(true);return;}S.ar.over+=e.tubes.over;arApply(S.ar.bi+1);}
function arReset(){const o=JSON.parse(S.ar.start);S.pops=o.p;S.links=o.l;S.pairMet=o.m||{};S.ar.sunk=o.k||0;arDemand();UI.sel=null;}
// Tubes over plan in the run so far, this brief included.
const arOver=()=>S.ar.over+arTubes().over;
function arStars(sp){return 1+(arOver()?0:1)+(sp<=arRun().budget+1e-6?1:0);}
function arShareText(st,sp){const sh=arShape();return tr('architect.share_line',{what:arRun().n,stars:pzStarStr(st),spend:fmt$(sp),shape:sh?sh.i+' '+sh.n:''});}
// ---------- ▶ the chaos monkey review ----------
// Every trench and cable is cut in turn, routed by compute() so the traffic visibly moves; a gold site losing HQ stops
// the review with the cut still on the map, until the next edit.
function arStop(quiet){mkStop();const sh=UI.arShow;if(sh&&sh.t)clearTimeout(sh.t);UI.arShow=null;if(!S||!S.links)return;let any=false;for(const l of S.links)if(l.cut){l.cut=0;any=true;}
  if(UI.arFail){UI.arFail=null;any=true;}if(any&&!quiet)compute();}
function arShowStart(){if(!arOn()||UI.arShow)return;const e=arEval();if(!e.ready){toast(esc(e.why),'bad');sfx('err');return;}
  arStop(true);UI.sel=null;closeModal();UI.arBaseGot=arGot();UI.arShow={units:[...new Set(S.links.map(pzUnit))],i:-1,t:0,dark:[],short:[]};mkStart(S.ar.hq);arStep();}
// One cut, routed: who goes dark, which gold sites with it, and who is still connected but short of room.
function arCut(u){const ls=S.links.filter(l=>pzUnit(l)===u);for(const l of ls)l.cut=1;compute();const dark=arDark(u);return {ls,dark,gold:dark.filter(c=>S.ar.gold.includes(c)),short:arShort(dark)};}
// The monkey sets off: the tube it last snipped is whole again, the next one stays whole until it gets there.
function arStep(now){const sh=UI.arShow;if(!sh||!arOn())return;for(const l of S.links)l.cut=0;sh.i++;sh.hit=false;
  if(sh.i>=sh.units.length){UI.arShow=null;compute();S.ar.passed=pzSig();renderAll();sfx('star');haptic(15);
    mkEnd(true);toast(`✅ <b>${tr('architect.review_passed')}</b><br>${arLast()?tr('architect.last_brief_done'):tr('architect.next_brief_waiting')}`,'good');if(arLast())setTimeout(()=>{if(arOn()&&S.ar.passed===pzSig())arResults(true);},900);return;}
  const u=sh.units[sh.i];compute();renderAll();mkRun(S.links.find(l=>pzUnit(l)===u),AR_RUN/MK_RUN);
  if(now)arHit();else sh.t=setTimeout(arHit,AR_RUN);}
// It has arrived and snips: who goes dark, and does a mission-critical site go with it?
function arHit(){const sh=UI.arShow;if(!sh||!arOn())return;sh.hit=true;
  const u=sh.units[sh.i],{ls,dark,gold,short}=arCut(u),l0=ls[0];sh.dark=dark;sh.short=short;sh.u=u;
  floater((CITY[l0.a].x+CITY[l0.a].x+wrapDx(CITY[l0.a].x,CITY[l0.b].x))/2,(CITY[l0.a].y+CITY[l0.b].y)/2-26,l0.sub?tr('architect.anchor'):tr('architect.backhoe'),'#FF8A3D');
  for(const c of dark)floater(CITY[c].x,CITY[c].y-34,gold.includes(c)?'💥 '+CITY[c].name:tr('architect.city_goes_dark',{city:CITY[c].name}),gold.includes(c)?'#FF4D5E':'#9AA3BE');
  for(const c of short)floater(CITY[c].x,CITY[c].y-34,tr('architect.city_short_g',{city:CITY[c].name,g:arG(arDem(c)-(arGot()[c]||0))}),'#FF4D5E');
  const bad=gold.length||short.length;if(UI.mk)UI.mk.bad=!!bad;sfx(bad?'err':'click');
  if(bad){UI.arShow=null;UI.arFail={u,gold,dark,short};renderAll();haptic(30);return;}
  renderAll();sh.t=setTimeout(arStep,dark.length?AR_HOLD*1.7:AR_HOLD);}
// Skip the show: check every cut at once, and stop at the first that breaks a gold site.
function arShowSkip(){const sh=UI.arShow;if(!sh)return;clearTimeout(sh.t);for(const l of S.links)l.cut=0;
  for(let i=sh.hit?sh.i+1:sh.i;i<sh.units.length;i++){const x=arCut(sh.units[i]);for(const l of x.ls)l.cut=0;if(x.gold.length||x.short.length){sh.i=i-1;arStep(true);return;}}
  sh.i=sh.units.length-1;arStep();}
// The kind of a city in a run: its sites, stepping stones and closed cities show; the rest of the world only on request.
function arKind(c){const P=S.pz;return P.cities.includes(c)?'goal':P.avoid.includes(c)?'avoid':P.via.includes(c)?'via':S.pops[c]||(UI.arAll&&pzCityOk(c))?'off':null;}
