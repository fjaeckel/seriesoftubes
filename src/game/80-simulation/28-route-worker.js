/* Routing off the main thread. The worker is this page's own game script run a second time
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
  try{w.postMessage({seq,S,load:R.load,l2route:R.l2route,efg:rwEfgOut(R.efg)});}catch(e){console.error('[tubes] route worker post',e);rwKill();compute();dayPost(d);rwDayDone();return;}
  const t1=performance.now();RW.stat.post+=t1-t;RW.job={seq,d,gen:RW.gen,t:t1};}
function rwDone(m){const j=RW.job;if(!j||m.seq!==j.seq)return;RW.job=null;const t=performance.now();
  if(m.err){console.error('[tubes] route worker',m.err);compute();}
  else if(RW.gen===j.gen){R=rwUnpack(m.R,m.ef);UI.hotMap=hotByCity();}
  const t1=performance.now(),st=RW.stat;st.n++;st.apply+=t1-t;st.wait+=t-j.t;st.work+=m.ms||0;
  try{dayPost(j.d);}catch(e){tickErr(e);}rwDayDone();}
function rwDayDone(){UI.ticking=true;renderHUD();UI.ticking=false;UI.panelsDue=true;if(UI.saveDue){UI.saveDue=false;save();}}
/* R as plain data. R.ef and R.fl are lazy getters, sent as the pieces they are built from (R.efp, R.flc, see efBuild()
   and flDefine() in 30-compute.js), their typed arrays moved, not copied. Exits become their ids (all R.fl reads), and an
   attack record names its attack in S by id. */
const FL_COLS=['FREM','FCI','FNJ','FCA','FBZ','FGT','FGI','FGP','FGH','FTI','FII'];
function rwPack(R){const o={};for(const k in R)o[k]=k==='ef'?0:k==='ddos'?R.ddos.map(m=>({...m,attack:m.attack?m.attack.id:null,ports:null})):R[k];
  const p=R.efp,c={...R.flc,E:R.flc.E.map(e=>({id:e.id}))},tr=[p.ACN.buffer,p.ACD.buffer];for(const k of FL_COLS)tr.push(c[k].buffer);
  return {o,p:{...p,flc:c},tr};}
function rwUnpack(o,p){o.ef={};efBuild(o,p.L,p.ACN,p.ACD,p.NKN,p.NC,p.NN);flDefine(o,p.flc);
  const as=ddosAll(S,false);for(const m of o.ddos){m.attack=as.find(a=>a.id===m.attack)||null;m.ports=new Map();}return o;}
// Yesterday's egress sums for scenic routing, as plain data (EgSums is a class; a clone would lose its get()).
const rwEfgOut=efg=>{if(!efg)return null;const o={};for(const k in efg)o[k]=efg[k].t;return o;};
const rwEfgIn=o=>{const efg={};for(const k in o)efg[k]=new EgSums(o[k]);return efg;};
// In the worker: route the state it was sent, answer with R.
function rwServe(m){try{S=m.S;R=emptyR();R.load=m.load||{};R.l2route=m.l2route||{};if(m.efg)Object.defineProperty(R,'efg',{value:rwEfgIn(m.efg)});
    const t=performance.now();compute();const ms=performance.now()-t,{o,p,tr}=rwPack(R);postMessage({seq:m.seq,R:o,ef:p,ms},tr);}
  catch(e){postMessage({seq:m.seq,err:String(e&&e.stack||e)});}}
