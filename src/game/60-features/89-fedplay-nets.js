/* ================= MULTIPLAYER GAMEPLAY: other players' networks in the game =================
   docs/plans/federation.md, "The core hook": in a joined save, other players' networks become networks like the
   computer-run ones (NETS), built from their newest announce, and your customers ask for traffic to them.
   S.fedn = null | {h, nets: [snapshot]} is what routing reads: a compact copy of the players' networks, kept in the save
   because the route worker gets only S and the game must route the same with IndexedDB empty (a solo save that
   remembers its neighbours). It is rebuilt from IndexedDB (fedNetworks) only when announces, quiet states, mutes or
   shuns change, from listeners and an hourly timer, never in the day loop. compute() calls fedNetsSync(), which applies
   a changed snapshot to NETS and the tables built from it (a string compare when nothing changed).
   A player network sits in NETS with no pops and no exchanges of its own (so computer-run mechanics, from the PNI list
   to exchange members, leave it alone); fpops and fix hold where it really is. Only deals made through the federation
   (S.fed.deals, 89-fedplay-deals.js) reach it directly; otherwise through a founding Tier 1's cone or transit. */
const FEDP_MAX=48,FEDP_SH=0.012,FEDP_SH_ALL=0.12,FEDP_TICK=3600000,FEDP_UP=['lvl','ntt','tly','cog'],
  FEDP_COL=['#8E7DBE','#2E86AB','#E07A5F','#3D9970','#B565A7','#F2A541','#5B8E7D','#C44536','#4F6D7A','#9C6644'],
  FEDP_ST=['active','fading','dark'];
// Runtime only: what is applied to NETS (h, ids, base shares), the newest announces by key, the timer.
const FEDN={h:'',ids:[],base:null,ann:new Map(),cur:Promise.resolve(),pend:null,t:null,on:false,q:Promise.resolve(),rt:null};
// A player network's id in NET: stable for a key, letters and digits only.
const fedNetId=k=>'fp'+String(k).slice(0,12).replace(/[-_]/g,'x');
const fedNetOf=k=>{const n=NET[fedNetId(k)];return n&&n.fed===k?n:null;};
// The robot badge, wherever an AI player's network shows.
const fedBot=n=>n&&n.ai?'🤖 ':'';
const fedNetsHash=l=>l.length+':'+hstr(JSON.stringify(l));
// The network type its traffic mix suggests: content, eyeballs, or a carrier in between.
const fedNetType=m=>m[0]>=500?'cdn':m[1]>=500?'eye':'t2';
/* Demand towards a player network: grows with its traffic (log scale), at most FEDP_SH, times its quiet factor. Shares
   come out of every other network's share, so a city still asks for the same total. */
const fedNetShare=n=>n.st==='dark'?0:Math.min(FEDP_SH,0.002+0.002*Math.log10(1+n.tr/1000))*n.q/1000;

/* ---------- applying the snapshot to NETS and the tables built from it ---------- */
function fedNetsSync(){const s=S&&S.fedn&&Array.isArray(S.fedn.nets)?S.fedn:null,h=s?s.h:'';if(h!==FEDN.h)fedNetsApply(s?s.nets:[],h);}
function fedNetsApply(list,h){
  if(!FEDN.base)FEDN.base={nsh:{...NSH},krx:{...NSH_KRX}};
  const old=new Set(FEDN.ids);
  if(old.size){for(let i=NETS.length-1;i>=0;i--)if(old.has(NETS[i].id))NETS.splice(i,1);
    for(let i=NET_IDS.length-1;i>=0;i--)if(old.has(NET_IDS[i]))NET_IDS.splice(i,1);
    for(const id of old){delete NET[id];delete CONE[id];delete CONE_S[id];delete DOWN[id];delete ANC[id];delete NSH[id];delete NSH_KRX[id];}
    for(const u of FEDP_UP){CONE[u]=CONE[u].filter(x=>!old.has(x));DOWN[u]=DOWN[u].filter(x=>!old.has(x));for(const x of old)CONE_S[u].delete(x);}}
  Object.assign(NSH,FEDN.base.nsh);Object.assign(NSH_KRX,FEDN.base.krx);
  const add=[],sh=new Map();let tot=0;
  for(const n of list){const id=fedNetId(n.k);if(NET[id]||sh.has(id))continue;const v=fedNetShare(n);sh.set(id,v);tot+=v;}
  const k=tot>FEDP_SH_ALL?FEDP_SH_ALL/tot:1,F=tot*k;
  if(F>0)for(const id of Object.keys(FEDN.base.nsh)){NSH[id]=FEDN.base.nsh[id]*(1-F);if(own(NSH_KRX,id))NSH_KRX[id]=FEDN.base.krx[id]*(1-F);}
  for(const n of list){const id=fedNetId(n.k);if(NET[id]||!sh.has(id))continue;
    // Not Tier 1 itself: in the cone of two founding Tier 1s (players start on computer-run transit), as rule N3 asks.
    const up=n.t1?[]:[FEDP_UP[hstr(n.k)%4],FEDP_UP[(hstr(n.k)+1+hstr(n.k+'u')%3)%4]];
    const N={id,name:n.name,asn:n.asn,type:fedNetType(n.mix),pol:'fed',share:sh.get(id)*k,col:FEDP_COL[hstr(n.k)%FEDP_COL.length],
      pops:[],ix:[],fpops:n.pops,fix:n.ix,fmix:n.mix,ftr:n.tr,blurb:'',up,fed:n.k,fst:n.st,fq:n.q,fpol:n.pol,ai:!!n.ai,home:n.home};
    NETS.push(N);NET_IDS.push(id);NET[id]=N;NSH[id]=N.share;NSH_KRX[id]=N.share;
    CONE[id]=[id];CONE_S[id]=new Set([id]);DOWN[id]=[];ANC[id]=up.slice();
    for(const u of up){CONE[u]=CONE[u].concat(id);CONE_S[u].add(id);DOWN[u]=DOWN[u].concat(id);}
    add.push(id);}
  // Tables that hold one entry per network index: made again on first use.
  LOC_SH.clear();LOC_PLAIN.clear();LOC_NET=null;PLACES=null;RC.xk=null;RC.x=null;
  FEDN.ids=add;FEDN.h=h;}

/* ---------- the snapshot: from announces, quiet states, shuns, mutes and the boards' newest stats ---------- */
// One network as routing keeps it (plain values only: it is saved).
function fedNetSnap(o,shun,st){const b=o.rec.body,q=shun?0:Math.round(o.quiet.factor/50)*50,state=shun?'dark':o.quiet.state==='forgotten'?'dark':o.quiet.state;
  const cs=v=>[...new Set(v.filter(c=>own(CITY,c)&&!CITY[c].off))].slice(0,512);
  return {k:o.key,name:fedSafeName(b.name),asn:b.asn,home:b.home,pops:cs(b.pops),ix:cs(b.ix),mix:[b.mix.content,b.mix.eyeball,b.mix.enterprise],
    tr:Math.min(2e9,b.traffic.in+b.traffic.out),cust:b.cust,pol:b.policy,q,st:state,ai:!!(st&&st.ai),t1:!!(st&&st.tier1),bid:o.id,at:o.rec.t};}
// Checks a snapshot from a save (sanitize): anything malformed is dropped, the hash is made again.
function fednClean(v){if(!v||typeof v!=='object'||!Array.isArray(v.nets))return null;const out=[],seen=new Set();
  const int=(x,lo,hi)=>Number.isSafeInteger(x)&&x>=lo&&x<=hi;
  for(const n of v.nets.slice(0,FEDP_MAX)){if(!n||typeof n!=='object'||FdK(n.k)||seen.has(n.k)||FdName(n.name)||!int(n.asn,0,4294967295)||!Array.isArray(n.pops)||!Array.isArray(n.ix)||!Array.isArray(n.mix)||n.mix.length!==3||!n.mix.every(x=>int(x,0,1000)))continue;
    seen.add(n.k);const cs=l=>[...new Set(l.filter(c=>typeof c==='string'&&own(CITY,c)))].slice(0,512);
    out.push({k:n.k,name:fedSafeName(n.name),asn:n.asn,home:typeof n.home==='string'&&!FdCC(n.home)?n.home:'ZZ',pops:cs(n.pops),ix:cs(n.ix),mix:n.mix.slice(),tr:int(n.tr,0,2e9)?n.tr:0,
      cust:int(n.cust,0,1e7)?n.cust:0,pol:['open','selective','restrictive'].includes(n.pol)?n.pol:'open',q:int(n.q,0,1000)?n.q:0,st:FEDP_ST.includes(n.st)?n.st:'dark',
      ai:n.ai===true,t1:n.t1===true,bid:FdId(n.bid)?'':n.bid,at:int(n.at,0,1e11)?n.at:0});}
  return {h:fedNetsHash(out),nets:out};}
// The newest stats of each key in the boards' cache: {ai, tier1, traffic} (who is AI, who is Tier 1, who reports what).
async function fedPlayStats(){const m=new Map();let d;try{d=await fedBoardData();}catch(e){return m;}
  const best=new Map();for(const r of d.records){const o=best.get(r.key);if(!o||r.slot>o.slot||r.slot===o.slot&&r.t>o.t)best.set(r.key,r);}
  for(const [k,r] of best)m.set(k,r.body);return m;}

/* ---------- when to rebuild: listeners and an hourly look, outside the game loop ---------- */
// Rebuilds the snapshot and walks the deals (ends, starts, quiet, shunned); re-routes only when something changed.
/* Runs one after another: a call while one runs queues a single next run (which reads the clock and IndexedDB afresh),
   and every caller gets the promise of the run that will see what it asked for. */
function fedPlayRefresh(){if(FEDN.pend)return FEDN.pend;
  const p=FEDN.pend=FEDN.cur.then(()=>{FEDN.pend=null;return fedPlayRun();}).catch(e=>console.error('[tubes] federation gameplay',e));FEDN.cur=p;return p;}
async function fedPlayRun(){const s=S;if(!s||!s.fed||!s.fed.key||!fedEligible(s))return;
  const now=fedNow(),all=await fedNetworks(now),shun=new Set(await fedShunned(now)),stats=await fedPlayStats();if(S!==s||!s.fed)return;
  const me=s.fed.key.pub,muted=new Set(s.fed.muted);FEDN.ann=new Map(all.map(n=>[n.key,n]));
  const list=all.filter(n=>n.key!==me&&!muted.has(n.key)).map(n=>fedNetSnap(n,shun.has(n.key),stats.get(n.key)))
    .sort((a,b)=>(a.st==='dark')-(b.st==='dark')||b.tr-a.tr||fedByStr(a.k,b.k)).slice(0,FEDP_MAX);
  const h=fedNetsHash(list);let ch=false;
  // A joined save has its terms (the defaults) from its first look on, not only once it announced.
  if(!s.fedp){fedP(s);ch=true;}
  if(!s.fedn||s.fedn.h!==h){s.fedn={h,nets:list};ch=true;}
  if(fedDealsTick(s,now,shun,muted,stats))ch=true;
  if(fedStrangers(s,stats))ch=true;
  if(ch&&S===s)after();}
function fedPlaySoon(ms=1000){if(FEDN.rt)return;FEDN.rt=FED.set(()=>{FEDN.rt=null;fedPlayRefresh();},ms);}
// The hourly look: fetch the boards, rebuild, announce when this network changed, depeer drifted ratios, shared leaks.
async function fedPlayTick(){FEDN.t=null;if(!FEDN.on)return;FEDN.t=FED.set(fedPlayTick,FEDP_TICK);const s=S;if(!s||!s.fed||!s.fed.on)return;
  try{for(const u of s.fed.servers)await fedBoardFetch(u);}catch(e){}
  await fedPlayRefresh();if(S!==s)return;
  try{await fedAnnounceMaybe(false);await fedDepeerDrift(s);if(fedLeakCheck(s,fedNow()))after();}catch(e){console.error('[tubes] federation gameplay',e);}}
fedOn('status',st=>{if(st.state==='off'){FEDN.on=false;FED.clear(FEDN.t);FEDN.t=null;return;}
  if(!FEDN.on){FEDN.on=true;FED.clear(FEDN.t);FEDN.t=FED.set(fedPlayTick,2000);}});
fedOn('records',()=>fedPlaySoon());
fedOn('mute',()=>fedPlaySoon(0));
fedOn('deal',e=>{FEDN.q=FEDN.q.then(()=>fedPlayDeal(e)).catch(err=>console.error('[tubes] federation deal',err));});
