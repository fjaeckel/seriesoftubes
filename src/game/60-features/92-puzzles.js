/* ================= PUZZLES (#190) =================
   Small, calm builds that carry real traffic: every puzzle has demand (eyeballs pulling from a content origin, circuits
   between two cities with a latency cap), and the game's own compute() routes it: metrics, standby, LAGs, router
   capacity and ports all behave as in the main game. A puzzle runs as its own S (S.mode='puzzle'): no clock, no bills,
   no incidents, links up at once. The demand is ordinary game state, so compute() needs no puzzle cases: an origin is a
   transit port (t.pz, which takes no router port), a circuit is an L2VPN customer, eyeballs are broadband with a fixed
   demand. That S is never saved. Only progress (stars and best spend per puzzle, weekly results and the weekly streak)
   is kept, under its own key, so the main save is never touched. */
const PZ_KEY='sot-puzzles',PZ_YEAR=12,PZ_SET=2;
const pzOn=()=>!!(S&&S.mode==='puzzle'&&S.pz);
const pzDef=id=>PZ.find(p=>p.id===id)||null;
// goal: a city the traffic starts or ends in; via: a suggested stepping stone; avoid: off limits; off: any other city
// (the whole world is open, it just is not part of the plan).
const pzKind=c=>!pzOn()?null:S.ar?arKind(c):S.pz.cities.includes(c)?'goal':S.pz.via.includes(c)?'via':S.pz.avoid.includes(c)?'avoid':pzCityOk(c)?'off':null;
const pzName=d=>d.id==='weekly'?(d.wn?pzTxt(d.wn):tr('puzzles.weekly_puzzle_key',{key:d.key})):d.n;
const pzStarStr=n=>'⭐'.repeat(n)+'⬜'.repeat(3-n);
// Every city a puzzle's traffic touches, origins first.
const pzCities=d=>[...new Set([...(d.src||[]),...d.dem.flatMap(f=>f.t==='l2'?[f.a,f.b]:[f.a])])];
// ---------- progress (localStorage, never trusted) ----------
// `set` is the puzzle set the stars belong to: the set with traffic (2) started again, and the stars won before hang
// framed on the wall (`old`), with a note shown once (`noted`). Weekly results and the streak carry on.
function pzClean(j){const o={set:PZ_SET,s:{},wk:{},streak:{last:null,n:0,best:0},old:null,noted:1};if(!j||typeof j!=='object')return o;
  const rec=r=>{if(!r||typeof r!=='object')return null;const o={st:int(r.st,0,3,0),sp:r.sp==null||!isFinite(+r.sp)||+r.sp<0?null:Math.round(+r.sp)},rv=int(r.rv,1,999,1);if(rv>1)o.rv=rv;return o;};
  const cur=j.set===PZ_SET;
  if(j.s&&typeof j.s==='object'){if(cur){for(const k of Object.keys(j.s)){const r=rec(j.s[k]);if(pzDef(k)&&r)o.s[k]=r;}}
    else{let n=0;for(const k of Object.keys(j.s).slice(0,200)){const r=rec(j.s[k]);if(r&&/^[a-z0-9]{1,20}$/.test(k))n+=r.st;}if(n){o.old=n;o.noted=0;}}}
  if(cur){o.old=j.old==null?null:int(j.old,0,9999,0)||null;o.noted=j.noted?1:0;if(o.old==null)o.noted=1;}
  if(j.wk&&typeof j.wk==='object')for(const k of Object.keys(j.wk)){const r=rec(j.wk[k]);if(/^\d{4}-W\d{2}$/.test(k)&&r)o.wk[k]=r;}
  const st=j.streak;if(st&&typeof st==='object'){o.streak.last=typeof st.last==='string'&&/^\d{4}-W\d{2}$/.test(st.last)?st.last:null;o.streak.n=int(st.n,0,9999,0);o.streak.best=int(st.best,0,9999,0);}
  return o;}
// A weekly's stars belong to the revision they were earned on: a week regenerated for new prices starts again.
const pzWkRec=(p,d)=>{const r=p.wk[d.key];return r&&(r.rv||1)===(d.rev||1)?r:null;};
function pzLoad(){try{return pzClean(JSON.parse(localStorage.getItem(PZ_KEY)||'{}'));}catch(e){return pzClean(null);}}
function pzStore(p){try{localStorage.setItem(PZ_KEY,JSON.stringify(p));}catch(e){}}
const pzStarsTotal=p=>PZ.reduce((a,x)=>a+((p.s[x.id]||{}).st|0),0);
const pzPackOpen=(k,p)=>{const P=PZ_PACKS.find(x=>x.id===k);return !!P&&pzStarsTotal(p||pzLoad())>=P.need;};
// ---------- prices: the real game's waves and routers, on day 0, for a year ----------
const pzMood=(a,b,sub)=>{const k=waveMarket(a,b,sub);return k.m/k.ero;};
// Overland (when the two cities share a landmass) and every cable between them, each with its price factor and latency.
function pzRoutes(a,b){const out=[],sub=isSub(a,b);
  if(!sub){const km=kmBetween(a,b);out.push({via:'land',cab:null,km,sub:false,f:landMult(a,b)*pzMood(a,b,false),ms:km*1.3/200});}
  for(const c of cablesFor(a,b))if(!out.some(r=>r.via===c.cid))out.push({via:c.cid,cab:c.cid,km:c.km,sub:true,f:CAB[c.cid].price*pzMood(a,b,true),ms:c.km*(CAB[c.cid].lat||1)/200});
  return out;}
const pzMo=(r,tier,div)=>Math.round(waveMo(r.km,r.sub,tier)*r.f*(div?DIVERSE:1));
const pzLinkCost=(r,tier,div)=>pzMo(r,tier,div)*PZ_YEAR;// leased waves have no setup fee: a year of rent
const pzPopCost=c=>popCost(c)+PZ_YEAR*popMo(c);// thin markets cost more every month too (#94)
// 10G to 800G: an 800G wave needs an 800G router at both ends, as in the main game.
const PZ_TIERS=[0,1,2,3];
// Router models on offer: the main game's catalogue up to its level-3 gear, cheapest class first.
const PZ_RG=RG.map((r,i)=>i).filter(i=>RG[i].lvl<=3&&!RG[i].noPz).sort((a,b)=>RG[a].cls-RG[b].cls||RG[a].cost-RG[b].cost);
// A POP's routers for a year: the chassis (the first Rusty Router is free), each extra one as the main game prices it
// (#157 cages included), and their rent.
function pzRtCost(g,rt){let s=Math.round(RG[g].cost*hwMul('rt'));for(let k=1;k<rt;k++)s+=routerCost(g,k);return s+PZ_YEAR*((rt-1)*ROUTER_MO+cageMo(rt)+rt*RG[g].mo);}
const pzRouterCost=c=>{const p=S.pops[c];return p?pzRtCost(p.rgen||0,p.routers||1):0;};
function pzSpend(){let s=0;for(const c in S.pops)s+=pzPopCost(c)+pzRouterCost(c);for(const l of S.links)s+=l.mo*PZ_YEAR;return s;}
// What one backhoe or one anchor takes out: waves in the same trench, or every wave on the same cable (a cable fails
// as a whole, as in the main game's diversity checks).
const pzUnit=l=>l.cable?'cab:'+l.cable:String(l.trench||l.id);
// ---------- the traffic ----------
// Origins are transit ports the size of a content farm; circuits are L2VPN customers; eyeballs come with their POP.
const PZ_NET='lvl',PZ_ORIG=5;
const pzFlowId=i=>'pzf'+i;
const pzFlowName=f=>f.t==='l2'?tr('puzzles.flow_circuit_a_b',{a:CITY[f.a].name,b:CITY[f.b].name}):tr('puzzles.flow_eyeballs_in_city',{city:CITY[f.a].name});
function pzDemand(){const P=S.pz;S.transit=P.src.map((c,i)=>({id:'pzo'+i,city:c,net:PZ_NET,tier:PZ_ORIG,n:1,pz:1,pref:'normal',hist:[]}));
  S.biz=P.dem.map((f,i)=>f.t==='l2'?{id:pzFlowId(i),type:'l2vpn',name:pzFlowName(f),city:f.a,city2:f.b,bw:f.g,rate:0,route:'normal',reqs:[],day:0}:null).filter(Boolean);}
const pzEye=c=>{const f=pzOn()&&S.pz.dem.find(x=>x.t==='eye'&&x.a===c);return f?f.g:0;};
const pzNewPop=c=>{const g=pzEye(c);return {day:0,bb:g?{d:g}:null,boost:0,down:0,routers:1,gen:false,br:S.ar?S.ar.bi:0};};
// What each flow gets from the last compute(): Gbps delivered, and a circuit's latency.
// Eyeball traffic to networks behind the Great Firewall loses a fifth at the border, as in the main game; that is not
// the player's doing, so a puzzle counts what crosses the border as delivered (pzGfw: the share that arrives).
let PZ_GFW=null;const pzGfw=()=>PZ_GFW||(PZ_GFW=1-0.2*NETS.filter(n=>n.cn).reduce((a,n)=>a+(NSH[n.id]||0),0));
function pzGot(){return S.pz.dem.map((f,i)=>f.t==='l2'?{g:R.l2[pzFlowId(i)]||0,ms:isFinite(R.l2lat[pzFlowId(i)])?R.l2lat[pzFlowId(i)]:null}:{g:S.pops[f.a]?(R.citySrv[f.a]||0)/pzGfw():0,ms:null});}
const pzFull=(f,x)=>x.g>=f.g*0.999-1e-6;
const pzFast=(f,x)=>!f.ms||(x.ms!=null&&x.ms<=f.ms+1e-9);
// ---------- checks ----------
function pzRingOk(ls){const nb={};for(const l of ls){(nb[l.a]=nb[l.a]||new Set()).add(l.b);(nb[l.b]=nb[l.b]||new Set()).add(l.a);}
  const ns=Object.keys(nb);if(ns.length<3||!S.pz.cities.every(c=>nb[c])||!Object.keys(S.pops).every(c=>nb[c])||!ns.every(c=>nb[c].size===2))return false;
  let prev=null,cur=ns[0],n=0;do{const nx=[...nb[cur]].find(x=>x!==prev);prev=cur;cur=nx;n++;}while(cur!==ns[0]&&n<=ns.length);return cur===ns[0]&&n===ns.length;}
// The same build always gets the same answer, so pzEval() keeps the last one (it routes once, then once per cut).
const pzSig=()=>JSON.stringify([S.pops,S.links,S.pairMet||null,S.biz.map(b=>b.route),S.pz.budget]);
/* ⭐ every flow delivered in full (circuits within their latency cap), and the twists; ⭐⭐ the year's spend within
   budget; ⭐⭐⭐ N-1 under load: whichever single trench or cable is cut, every priority flow still gets all of its traffic
   (best-effort flows may drop). The cut is routed by compute() like the real thing. */
function pzEval(){const sig=pzSig(),c0=UI.pzEv;if(c0&&(c0.sig===sig||UI.pzMk))return c0.e;// mid-scene the monkey's cuts are not the build
  const P=S.pz,hot=UI.hotMap;compute();const R0=R,got=pzGot(),spend=pzSpend(),peak={},pk=()=>{for(const c in R.nodeLoad)peak[c]=Math.max(peak[c]||0,R.nodeLoad[c]);};pk();
  const flows=P.dem.map((f,i)=>({f,i,g:got[i].g,ms:got[i].ms,full:pzFull(f,got[i]),fast:pzFast(f,got[i])}));
  const tw=[];if(P.noSub)tw.push({k:'sub',ok:!S.links.some(l=>l.sub)});
  if(P.ring)tw.push({k:'ring',ok:pzRingOk(S.links)});
  if(P.avoid.length)tw.push({k:'avoid',ok:P.avoid.every(c=>!S.pops[c])});
  const del=flows.every(x=>x.full&&x.fast),goal=del&&tw.every(t=>t.ok),units=[...new Set(S.links.map(pzUnit))],cuts=[];
  if(goal)try{for(const u of units){const ls=S.links.filter(l=>pzUnit(l)===u);for(const l of ls)l.cut=1;
      try{compute();pk();const g=pzGot(),lost=[];P.dem.forEach((f,i)=>{if(!f.be&&!pzFull(f,g[i]))lost.push({i,g:Math.max(0,f.g-g[i].g)});});if(lost.length)cuts.push({u,lost,g:lost.reduce((a,x)=>a+x.g,0)});}
      finally{for(const l of ls)l.cut=0;}}}
    finally{R=R0;UI.hotMap=hot;}
  cuts.sort((a,b)=>b.g-a.g);
  const n1=goal&&units.length>0&&!cuts.length,cheap=!P.budget||spend<=P.budget;
  const e={flows,del,tw,goal,spend,cheap,n1,weak:cuts.map(x=>x.u),worst:cuts[0]||null,peak,stars:goal?1+(cheap?1:0)+(n1?1:0):0};
  UI.pzEv={sig,e};return e;}
// ---------- the seeded weekly puzzle: the same for everyone, and the stand-in when the published one (93-puzzles-weekly.js) is not there ----------
function pzWeekly(dt){const key=pzWeekKey(dt||new Date());let r=hstr('puzzle|'+key)||1;const nx=()=>{r=(Math.imul(r,1103515245)+12345)>>>0;return r/4294967296;};
  const pool=PZ_WEEK_POOLS[Math.floor(nx()*PZ_WEEK_POOLS.length)].slice(),n=4+Math.floor(nx()*2),cities=[];
  while(cities.length<n&&pool.length)cities.push(pool.splice(Math.floor(nx()*pool.length),1)[0]);
  // Content sits in the first city, eyeballs in the others, and all of it fits one 10G wave: so a 10G ring through the
  // cities, nearest first, on the cheapest route of each hop, carries everything whichever hop is cut. A ring survives
  // any single cut only if no two hops share a cable, so each hop takes the cheapest route on a cable the ring has not
  // used yet (overland is always there: a pool is one landmass). The budget is that ring plus 10%.
  const ring=[cities[0]],left=cities.slice(1);while(left.length){const u=ring[ring.length-1];left.sort((a,b)=>kmBetween(u,a)-kmBetween(u,b));ring.push(left.shift());}
  let cost=cities.reduce((a,c)=>a+pzPopCost(c),0);const used=new Set(),via=[];
  for(let i=0;i<ring.length;i++){const r=pzRoutes(ring[i],ring[(i+1)%ring.length]).filter(x=>!x.cab||!used.has(x.cab)).sort((x,y)=>pzLinkCost(x,0,false)-pzLinkCost(y,0,false))[0];
    if(r.cab)used.add(r.cab);via.push(r.via);cost+=pzLinkCost(r,0,false);}
  const g=Math.floor(9/(n-1)),dem=cities.slice(1).map(c=>({t:'eye',a:c,g}));
  return {id:'weekly',key,cities,src:[cities[0]],dem,via:[],budget:Math.ceil(cost*1.1/10000)*10000,ref:ring,refVia:via};}
function pzStreak(p,key){const st=p.streak;if(st.last===key)return;st.n=st.last&&st.last===pzPrevKey(key)?st.n+1:1;st.last=key;st.best=Math.max(st.best,st.n);}
function pzShareText(e){const P=S.pz;return tr('puzzles.share_line',{what:P.id==='weekly'?P.key:pzName(pzDef(P.id)),stars:pzStarStr(e.stars),spend:fmt$(e.spend)});}
// ---------- entering and leaving ----------
// Toasts from one world never carry over into the other (their buttons act on the S they came from).
const pzToastsClear=()=>{$('toasts').textContent='';};
// The running game gets its usual save first and is kept in memory, set aside: save() keeps writing it to its slot
// (leaving the page mid-puzzle), and leaving the puzzle picks it up again.
function pzFlush(){save(true);UI.pzKeep=S;}
function pzBegin(def){if(!def)return;pzMkStop();mkStop();
  const go=()=>{const cs=pzCities(def);newGame(pzName(def),cs[0]);S.pops={};S.mode='puzzle';S.rules=makeRules('puzzle');S.nextFail=S.nextEvent=1e9;S.tut=null;
    S.pz={id:def.id,key:def.key||null,cities:cs,src:(def.src||[]).slice(),dem:def.dem.map(f=>({t:f.t,a:f.a,b:f.t==='l2'?f.b:null,g:f.g,ms:f.ms||0,be:!!f.be})),
      via:(def.via||[]).slice(),avoid:(def.avoid||[]).slice(),budget:def.budget||0,noSub:!!def.noSub,ring:!!def.ring,wn:def.wn||null,wj:def.wj||null,theme:def.theme||null,rev:def.rev||1};
    pzDemand();
    UI.pzHist=[];UI.pzTop=0;UI.pzEv=null;UI.speed=0;UI.resumeSpeed=null;UI.started=true;UI.sel=null;UI.leftOpen=false;UI.confirm=null;UI._pzh=null;
    $('dash').hidden=true;$('bankBox').hidden=true;closeModal();pzToastsClear();document.body.classList.add('pz');
    compute();pzCam();renderAll();track('puzzle_'+def.id);
    toast(`<b>${esc(pzName(def))}</b><br>${tr('puzzles.carry_list',{list:S.pz.dem.map(f=>`${esc(pzFlowName(f))} ${fmtG(f.g)}`).join(', ')})}`,'goal');};
  if(pzOn()){go();return;}
  const live=!!(S&&UI.started&&!S.lost);UI.pzFrom=live?'game':'title';
  if(live)pzFlush();go();}
function pzLeave(){pzMkStop();if(S&&S.ar)arStop(true);mkStop();const from=UI.pzFrom;pzToastsClear();document.body.classList.remove('pz');UI.sel=null;UI.pzHist=null;UI.pzFrom=null;UI.pzEv=null;closeModal();$('panel').hidden=true;$('pzBox').hidden=true;S=null;R=emptyR();UI.started=false;
  if(from==='game'){const sv=UI.pzKeep||loadSave();UI.pzKeep=null;
    if(sv){try{S=migrate(sv);compute();UI.started=true;UI.speed=[0,0.5,1,2,4,8].includes(S.uiSpeed)?S.uiSpeed:1;if(S.cam&&isFinite(S.cam.x))Object.assign(cam,S.cam);renderAll();return;}catch(e){console.error('[tubes] loading the network failed',e);S=null;UI.started=false;}}
    // It cannot be loaded back: marked damaged (kept, so it can be exported), and the player is told.
    if(UI.slot&&(sv||UI.loadBad)){slotBroke(UI.slot);return;}}
  renderAll();showTitle();}
// The camera frames the puzzle's cities beside the puzzle card: left on wide screens, right on phones on their side, a bottom sheet on phones.
function pzCam(){const cs=[...S.pz.cities,...S.pz.via].map(c=>CITY[c]),x0=cs[0].x;let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;
  for(const C of cs){const x=x0+wrapDx(x0,C.x);a=Math.min(a,x);b=Math.max(b,x);c=Math.min(c,C.y);d=Math.max(d,C.y);}
  const ph=isPhone(),side=ph&&CW>CH,pl=side?-Math.min(360,CW*0.52):ph?0:S.ar&&CW>760&&CH>500?410:330,pb=ph&&!side?Math.min(230,CH*0.4):0,aw=Math.max(120,CW-Math.abs(pl)-90),ah=Math.max(120,CH-pb-150);
  cam.z=clamp(Math.min(aw/Math.max(40,b-a),ah/Math.max(40,d-c)),0.5,4);cam.x=(a+b)/2-pl/2/cam.z;cam.y=(c+d)/2+(pb/2-30)/cam.z;wrapCam();}
// ---------- building ----------
function pzSnap(){pzMkStop();if(S.ar)arStop();const h=UI.pzHist||(UI.pzHist=[]);h.push(JSON.stringify({p:S.pops,l:S.links,m:S.pairMet||{},r:S.biz.map(b=>b.route),k:S.ar?S.ar.sunk:0}));if(h.length>60)h.shift();}
function pzAfter(){if(UI.sel&&((UI.sel.type==='link'&&!S.links.some(l=>l.id===UI.sel.id))||(UI.sel.type==='city'&&!pzKind(UI.sel.id))))UI.sel=null;
  if(S.ar)arRouters();compute();renderAll();pzCheck();}
// Stars count the moment they are earned.
// Every solved state is recorded, so a cheaper build at the same stars counts too.
// A new star below three is a cheer and a nudge, and play goes on; the results card opens at three stars, or when the
// player says they are done (the card's Finish button).
function pzCheck(){if(arOn())return null;const e=pzEval();if(e.stars)pzRecord(e);if(e.stars<=(UI.pzTop||0))return e;const prev=UI.pzTop||0;UI.pzTop=e.stars;const show=()=>{if(e.stars>=3)pzResults(e,prev);else{pzCheer(e,prev);renderAll();}};if(pzMkCan())pzMonkey(show);else show();return e;}
// The best spend belongs to the best star count: more stars start it again, the same stars keep the lower spend.
function pzRecord(e){const p=pzLoad(),P=S.pz,bag=P.id==='weekly'?p.wk:p.s,k=P.id==='weekly'?P.key:P.id,r=(P.id==='weekly'?pzWkRec(p,P):bag[k])||{st:0,sp:null};
  if(e.stars<r.st||(e.stars===r.st&&r.sp!=null&&r.sp<=e.spend))return;
  r.sp=e.spend;r.st=e.stars;if(P.id==='weekly'&&P.rev>1)r.rv=P.rev;else delete r.rv;bag[k]=r;if(P.id==='weekly')pzStreak(p,P.key);pzStore(p);}
// The next puzzle in the list whose pack is open.
function pzNextDef(){const p=pzLoad(),i=PZ.findIndex(x=>x.id===S.pz.id);for(let j=i+1;j<PZ.length;j++)if(pzPackOpen(PZ[j].pack,p))return PZ[j];return null;}
