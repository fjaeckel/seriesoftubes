/* Routing off the main thread (prototype, perf idea 3). The worker is this page's own game script run a second time
   from a Blob URL: nothing is fetched, so GitHub Pages still serves one page. In the worker, DOM globals are inert
   stand-ins and boot() never runs; the catalogs (cities, networks, cones) are rebuilt from the same code.
   Only the day uses it: dayPre(), then S goes to the worker, the day waits (no next day starts) and dayPost() runs
   when R is back, so a day sees exactly the routing it would have had in one go. An action in between routes
   synchronously as always (compute() bumps RW.gen); then the worker's answer is stale and the action's R stands.
   Tests (no Worker in jsdom, __TUBES_TEST__) and any worker failure take the synchronous path. */
const RW_IN=!!self.__TUBES_WORKER__;
const RW_EL=!RW_IN&&typeof document!=='undefined'?document.currentScript:null;
const RW={w:null,dead:false,seq:0,gen:0,job:null,stat:{n:0,post:0,de:0,apply:0,wait:0,work:0}};
function rwOn(){return !RW_IN&&!RW.dead&&!window.__TUBES_TEST__&&!window.__TUBES_SYNC__&&typeof Worker==='function'&&!!RW_EL;}
function rwStart(){if(RW.w)return RW.w;
  try{const L=LANG,dict=L!=='en'&&window.I18N[L]?JSON.stringify(window.I18N[L]):'null';
    const pre=`'use strict';self.__TUBES_WORKER__=1;self.window=self;
const _n=new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='then'?undefined:_n,apply:()=>_n,construct:()=>_n,set:()=>true});
const _st={getItem:()=>null,setItem(){},removeItem(){},key:()=>null,length:0};
Object.assign(self,{document:_n,localStorage:_st,sessionStorage:_st,requestAnimationFrame:()=>0,cancelAnimationFrame(){},innerWidth:1280,innerHeight:800,devicePixelRatio:1,
  matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),Image:_n,Audio:_n,screen:_n,visualViewport:_n,history:_n,getComputedStyle:_n,ResizeObserver:_n,MutationObserver:_n,IntersectionObserver:_n,Path2D:_n,scrollTo(){},SOT_LANG:${JSON.stringify(L)},SOT_LANGS:{},I18N:{}});
if(${dict})self.I18N[${JSON.stringify(L)}]=${dict};
`;
    const url=URL.createObjectURL(new Blob([pre,RW_EL.textContent,'\n;self.onmessage=e=>rwServe(e.data);'],{type:'text/javascript'}));
    const w=RW.w=new Worker(url);URL.revokeObjectURL(url);
    w.onmessage=e=>{const t=performance.now(),m=e.data;RW.stat.de+=performance.now()-t;rwDone(m);};w.onerror=w.onmessageerror=e=>{console.error('[tubes] route worker failed',e.message||e);rwKill();};
  }catch(e){console.error('[tubes] no route worker',e);rwKill();}
  return RW.w;}
// Gone for good this session: the day it was routing is routed here instead.
function rwKill(){RW.dead=true;if(RW.w)try{RW.w.terminate();}catch(e){}RW.w=null;const j=RW.job;RW.job=null;if(j){try{compute();dayPost(j.d);}catch(e){tickErr(e);}rwDayDone();}}
// One day in play: the first half here, the routing in the worker, the second half when it answers.
function rwDay(){const d=dayPre();if(d===false)return;const w=rwStart();
  if(!w){compute();dayPost(d);rwDayDone();return;}
  const t=performance.now(),seq=++RW.seq;
  // The worker also needs what compute() reads from yesterday's R: link loads, and the scenic circuits' paths.
  try{w.postMessage({seq,S,load:R.load,l2route:R.l2route,efg:R.efg||null});}catch(e){console.error('[tubes] route worker post',e);rwKill();compute();dayPost(d);rwDayDone();return;}
  const t1=performance.now();RW.stat.post+=t1-t;RW.job={seq,d,gen:RW.gen,t:t1};}
function rwDone(m){const j=RW.job;if(!j||m.seq!==j.seq)return;RW.job=null;const t=performance.now();
  if(m.err){console.error('[tubes] route worker',m.err);compute();}
  else if(RW.gen===j.gen){R=rwUnpack(m.R,m.ef);UI.hotMap=hotByCity();}
  const t1=performance.now(),st=RW.stat;st.n++;st.apply+=t1-t;st.wait+=t-j.t;st.work+=m.ms||0;
  try{dayPost(j.d);}catch(e){tickErr(e);}rwDayDone();}
function rwDayDone(){UI.ticking=true;renderHUD();UI.ticking=false;UI.panelsDue=true;if(UI.saveDue){UI.saveDue=false;save();}}
/* R as plain data. R.ef is lazy getters over typed arrays (sent as the raw pieces, the arrays moved, not copied);
   R.fl's flows point at exit lists with functions in them; an attack record points at its attack in S. */
function rwPack(R){const o={};for(const k in R)o[k]=k==='ef'?0:k==='ddos'?R.ddos.map(m=>({...m,attack:m.attack?m.attack.id:null,ports:null})):R[k];
  const p=R.efp,F=rwFlPack(R.fl||[]);o.fl=F;return {o,p,tr:[p.ACN.buffer,p.ACD.buffer,F.num.buffer,F.idx.buffer]};}
/* Flows as columns (tens of thousands of objects cost more to clone than routing saves): only what the PNI list
   reads (38-pni-value.js), turned back into objects the first time something asks for R.fl. */
function rwFlPack(fl){const n=fl.length,num=new Float64Array(n*5),idx=new Int32Array(n*5),ids=[],idOf=new Map(),id=x=>{if(x==null)return -1;let k=idOf.get(x);if(k===undefined){idOf.set(x,k=ids.length);ids.push(x);}return k;};
  for(let i=0;i<n;i++){const f=fl[i],a=i*5;num[a]=f.rem;num[a+1]=f.gt;num[a+2]=f.gi;num[a+3]=f.gp;num[a+4]=f.gh;
    idx[a]=f.ci;idx[a+1]=f.nj;idx[a+2]=(f.junk?1:0)|(f.cache?2:0)|(f.bz?4:0);idx[a+3]=id(f.ti);idx[a+4]=id(f.ii);}
  return {n,num,idx,ids};}
function rwFlUnpack({n,num,idx,ids}){const fl=new Array(n);
  for(let i=0;i<n;i++){const a=i*5,b=idx[a+2];fl[i]={c:CITIES[idx[a]].id,n:NETS[idx[a+1]].id,junk:!!(b&1),cache:!!(b&2),bz:!!(b&4),rem:num[a],gt:num[a+1],gi:num[a+2],gp:num[a+3],gh:num[a+4],ti:idx[a+3]<0?null:ids[idx[a+3]],ii:idx[a+4]<0?null:ids[idx[a+4]]};}
  return fl;}
function rwUnpack(o,p){const F=o.fl;delete o.fl;o.ef={};efBuild(o,p.L,p.ACN,p.ACD,p.NKN,p.NC,p.NN);let fl=null;Object.defineProperty(o,'fl',{get:()=>fl||(fl=rwFlUnpack(F))});
  const as=ddosAll(S,false);for(const m of o.ddos){m.attack=as.find(a=>a.id===m.attack)||null;m.ports=new Map();}return o;}
// In the worker: route the state it was sent, answer with R.
function rwServe(m){try{S=m.S;R=emptyR();R.load=m.load||{};R.l2route=m.l2route||{};if(m.efg)Object.defineProperty(R,'efg',{value:m.efg});
    const t=performance.now();compute();const ms=performance.now()-t,{o,p,tr}=rwPack(R);postMessage({seq:m.seq,R:o,ef:p,ms},tr);}
  catch(e){postMessage({seq:m.seq,err:String(e&&e.stack||e)});}}
